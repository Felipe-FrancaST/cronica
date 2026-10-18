import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { BillingEngine, type BillingDatabase } from '../src/features/billing/engine';
import { MercadoPagoGateway } from '../src/features/billing/gateway';
import type { BillingContract } from '../src/features/billing/types';
test('uncertain provider creation is recovered without duplicate charges; canonical payments reconcile through cancellation and refund', async (t) => {
  const db = await billingDatabase();
  try {
    const user = randomUUID(),
      id = randomUUID(),
      plan = 'b1000000-0000-4000-8000-000000000001';
    await db.query('insert into auth.users(id,email) values($1,$2)', [user, 'engine@test.local']);
    const value = async <T>(sql: string, args: unknown[] = []) =>
      (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
    const adapter: BillingDatabase = {
      async rpc<T>(name: string, args: Record<string, unknown> = {}) {
        const keys = Object.keys(args);
        return value<T>(
          `select to_jsonb(public.${name}(${keys.map((key, i) => `${key}=>$${i + 1}`).join(',')})) v`,
          keys.map((key) =>
            typeof args[key] === 'object' && args[key] !== null
              ? JSON.stringify(args[key])
              : args[key],
          ),
        );
      },
      async contract(id) {
        return (
          (
            await db.query<BillingContract>('select * from public.billing_contracts where id=$1', [
              id,
            ])
          ).rows[0] ?? null
        );
      },
      async contracts(userId) {
        return (
          await db.query<BillingContract>(
            'select * from public.billing_contracts where user_id=$1',
            [userId],
          )
        ).rows;
      },
      async byProvider(providerId) {
        return (
          (
            await db.query<BillingContract>(
              'select * from public.billing_contracts where provider_id=$1',
              [providerId],
            )
          ).rows[0] ?? null
        );
      },
      async paymentIds(contractId) {
        return (
          await db.query<{ provider_payment_id: string }>(
            'select provider_payment_id from public.billing_payments where contract_id=$1',
            [contractId],
          )
        ).rows.map((row) => row.provider_payment_id);
      },
    };
    let posts = 0,
      loseResponse = true,
      omitInvoices = false,
      tick = 0;
    let remote: Record<string, unknown> | null = null;
    const changed = () => new Date(Date.now() + ++tick).toISOString();
    const approved = new Date(Date.now() - 60_000).toISOString();
    const payment: Record<string, unknown> = {
      id: 321,
      collector_id: 123,
      currency_id: 'BRL',
      transaction_amount: 20,
      transaction_amount_refunded: 0,
      live_mode: false,
      status: 'approved',
      date_approved: approved,
      date_last_updated: changed(),
      fee_details: [{ amount: 0.99 }],
      transaction_details: { net_received_amount: 19.01 },
    };
    let invoice: Record<string, unknown> | null = null;
    const transport: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://api.mercadopago.com');
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        'Bearer not-a-real-token',
      );
      const json = (value: unknown) => Promise.resolve(Response.json(value));
      if (url.pathname === '/preapproval' && init?.method === 'POST') {
        posts++;
        const body = JSON.parse(String(init.body));
        assert.equal(body.auto_recurring.transaction_amount, 20);
        assert.equal(body.status, 'pending');
        assert.equal('card_token_id' in body, false);
        assert.equal(body.back_url, 'https://cronica.test/assinatura?retorno=1&modo=master');
        remote = {
          ...body,
          id: 'remote1',
          collector_id: 123,
          last_modified: changed(),
          init_point:
            'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=remote1',
        };
        if (loseResponse) throw new Error('Simulated connection lost after provider creation');
        return json(remote);
      }
      if (url.pathname === '/preapproval/search') {
        assert.equal(url.searchParams.get('payer_email'), 'engine@test.local');
        return json({ paging: { total: remote ? 1 : 0 }, results: remote ? [remote] : [] });
      }
      if (url.pathname === '/preapproval/remote1') {
        if (init?.method === 'PUT') {
          remote = { ...remote, status: 'cancelled', last_modified: changed() };
        }
        return json(remote);
      }
      if (url.pathname === '/authorized_payments/search')
        return json({
          paging: { total: invoice ? 1 : 0 },
          results:
            invoice && (!omitInvoices || url.searchParams.has('payment_id')) ? [invoice] : [],
        });
      if (url.pathname === '/v1/payments/321') return json(payment);
      throw new Error(`Unexpected provider path: ${url.pathname}`);
    };
    const engine = new BillingEngine(
      adapter,
      new MercadoPagoGateway(
        { accessToken: 'not-a-real-token', collectorId: '123', environment: 'test' },
        transport,
      ),
      'https://cronica.test',
    );
    const input = {
      planId: plan,
      scope: 'master',
      requestId: id,
      planVersion: 1,
      payerEmail: 'engine@test.local',
      consent: true,
    };
    await t.test(
      'an interrupted create is not retried by repeated clicks or a second request ID',
      async () => {
        await assert.rejects(engine.checkout(user, input), /sendo conferida/i);
        assert.equal((await adapter.contract(id))?.status, 'uncertain');
        assert.equal((await engine.checkout(user, input)).checkout_url, null);
        assert.equal(
          (await engine.checkout(user, { ...input, requestId: randomUUID() })).contract.id,
          id,
        );
        assert.equal(posts, 1);
      },
    );
    await t.test(
      'reconciliation recovers the original checkout by payer and exact external reference',
      async () => {
        loseResponse = false;
        await engine.syncUser(user, true);
        const recovered = await engine.checkout(user, input);
        assert.equal(recovered.contract.provider_id, 'remote1');
        assert.match(
          recovered.checkout_url!,
          /^https:\/\/www.mercadopago.com.br\/subscriptions\/checkout/,
        );
        assert.equal(posts, 1);
        remote = { ...remote, status: 'authorized', last_modified: changed() };
        await engine.syncUser(user, true);
        assert.equal(
          await value("select private.billing_can_access($1,'master') v", [user]),
          false,
        );
      },
    );
    await t.test(
      'canonical invoice and payment grant a stable calendar period, without extending on replay',
      async () => {
        invoice = {
          id: 'invoice321',
          preapproval_id: 'remote1',
          external_reference: id,
          currency_id: 'BRL',
          transaction_amount: 20,
          payment: { id: 321, status: 'approved' },
        };
        await engine.syncUser(user, true);
        assert.equal(await value("select private.billing_can_access($1,'master') v", [user]), true);
        const until = await value(
          'select period_end::text v from public.billing_payments where provider_payment_id=$1',
          ['321'],
        );
        await engine.syncUser(user, true);
        assert.equal(
          await value(
            'select period_end::text v from public.billing_payments where provider_payment_id=$1',
            ['321'],
          ),
          until,
        );
      },
    );
    await t.test(
      'cancellation stops renewal and retains the approved period; another account cannot cancel',
      async () => {
        await assert.rejects(engine.cancel(randomUUID(), id), /não encontrada/i);
        await engine.cancel(user, id);
        assert.equal((await adapter.contract(id))?.status, 'cancelled');
        assert.equal(await value("select private.billing_can_access($1,'master') v", [user]), true);
      },
    );
    await t.test(
      'a mismatched payment fails closed; a refund is found even when invoice listings omit it',
      async () => {
        payment.transaction_amount = 19;
        await assert.rejects(engine.syncUser(user, true), /não corresponde/i);
        assert.equal(
          await value(
            "select amount_cents v from public.billing_payments where provider_payment_id='321'",
          ),
          2000,
        );
        payment.transaction_amount = 20;
        payment.status = 'refunded';
        payment.transaction_amount_refunded = 20;
        payment.date_last_updated = changed();
        omitInvoices = true;
        await engine.syncUser(user, true);
        assert.equal(
          await value("select private.billing_can_access($1,'master') v", [user]),
          false,
        );
        assert.equal(
          await value(
            "select status v from public.billing_payments where provider_payment_id='321'",
          ),
          'refunded',
        );
        assert.equal(posts, 1);
      },
    );
  } finally {
    await db.close();
  }
});
