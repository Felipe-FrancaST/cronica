import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingDatabase } from './helpers/billing-database';
import { BillingEngine, type BillingDatabase } from '../src/features/billing/engine';
import {
  MercadoPagoGateway,
  BillingError,
  verifiedPixPayment,
} from '../src/features/billing/gateway';
import { validCpf } from '../src/features/billing/model';
import type { BillingContract, BillingPayment } from '../src/features/billing/types';
import { PIX_CODE, PIX_PNG } from './helpers/pix-fixture';
import { readMigration } from '../scripts/migration-sources.mjs';

test('Pix validates formatted and unformatted CPF and rejects repeated digits, letters and invalid check digits', () => {
  for (const cpf of ['52998224725', '529.982.247-25']) assert.equal(validCpf(cpf), true);
  for (const cpf of [
    '11111111111',
    '00000000000',
    '52998224726',
    'abc52998224725',
    '5299822472',
    '',
  ])
    assert.equal(validCpf(cpf), false);
});

test('032 Pix payments bind canonical payments, serialize checkouts and preserve account deletion and recurring billing', async (t) => {
  const db = await billingDatabase();
  const planId = 'b1000000-0000-4000-8000-000000000001';
  const config = { accessToken: 'local-secret', collectorId: '123', environment: 'test' as const };
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
      ) as Promise<T>;
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
    async contracts(id) {
      return (
        await db.query<BillingContract>('select * from public.billing_contracts where user_id=$1', [
          id,
        ])
      ).rows;
    },
    async byProvider(id) {
      return (
        (
          await db.query<BillingContract>(
            'select * from public.billing_contracts where provider_id=$1',
            [id],
          )
        ).rows[0] ?? null
      );
    },
    async paymentIds(id) {
      return (
        await db.query<{ provider_payment_id: string }>(
          'select provider_payment_id from public.billing_payments where contract_id=$1',
          [id],
        )
      ).rows.map((p) => p.provider_payment_id);
    },
  };
  let sequence = 1000;
  async function scenario() {
    const userId = randomUUID(),
      requestId = randomUUID();
    await db.query('insert into auth.users(id,email) values($1,$2)', [
      userId,
      `${userId}@test.local`,
    ]);
    const input = {
      planId,
      scope: 'master',
      requestId,
      planVersion: 1,
      payerEmail: `${userId}@test.local`,
      cpf: '52998224725',
      consent: true,
    };
    const payments = new Map<string, Record<string, unknown>>();
    const calls: {
      path: string;
      method: string;
      body: Record<string, unknown>;
      key: string | null;
    }[] = [];
    let lose = false,
      race = false,
      tick = 0;
    const changed = () => new Date(Date.now() + ++tick * 1000).toISOString();
    const transport: typeof fetch = async (url, init) => {
      const path = new URL(String(url));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer local-secret');
      calls.push({
        path: path.pathname + path.search,
        method: init?.method ?? 'GET',
        body,
        key: headers.get('x-idempotency-key'),
      });
      if (path.pathname === '/v1/payments' && init?.method === 'POST') {
        const id = String(++sequence);
        const remote = {
          ...body,
          id: Number(id),
          collector_id: 123,
          currency_id: 'BRL',
          live_mode: false,
          status: 'pending',
          date_created: changed(),
          date_last_updated: changed(),
          date_approved: null,
          transaction_amount_refunded: 0,
          point_of_interaction: {
            type: 'PIX',
            transaction_data: { qr_code: PIX_CODE, qr_code_base64: PIX_PNG },
          },
        };
        payments.set(id, remote);
        if (lose) {
          lose = false;
          throw new TypeError('Local lost response');
        }
        return Response.json(remote, { status: 201 });
      }
      if (path.pathname === '/v1/payments/search') {
        assert.equal(path.searchParams.get('external_reference'), requestId);
        return Response.json({ paging: { total: payments.size }, results: [...payments.values()] });
      }
      const remote = payments.get(path.pathname.split('/').at(-1)!);
      if (!remote) return Response.json({ message: 'Not found' }, { status: 404 });
      if (init?.method === 'PUT') {
        if (race) {
          remote.status = 'approved';
          remote.date_approved = new Date(Date.now() - 60_000).toISOString();
          remote.date_last_updated = changed();
          return Response.json({ message: 'Payment already approved' }, { status: 400 });
        }
        remote.status = 'cancelled';
        remote.date_last_updated = changed();
      }
      return Response.json(remote);
    };
    const engine = new BillingEngine(
      adapter,
      new MercadoPagoGateway(config, transport),
      'https://cronica.test',
    );
    const contract = async () => (await adapter.contract(requestId))!;
    const allowed = () =>
      value<boolean>("select private.billing_can_access($1,'master') v", [userId]);
    const ledger = async () =>
      (
        await db.query<BillingPayment>(
          'select * from public.billing_payments where contract_id=$1',
          [requestId],
        )
      ).rows;
    const remote = () => [...payments.values()][0];
    const approve = () => {
      remote().status = 'approved';
      remote().date_approved = new Date(Date.now() - 60_000).toISOString();
      remote().date_last_updated = changed();
    };
    return {
      userId,
      input,
      engine,
      calls,
      payments,
      remote,
      changed,
      approve,
      contract,
      allowed,
      ledger,
      lose: () => {
        lose = true;
      },
      race: () => {
        race = true;
      },
    };
  }
  try {
    await t.test(
      'migration is repeatable and sensitive Pix RPCs have no browser execution grant',
      async () => {
        await db.exec(readMigration('202610190032_pix_payments.sql'));
        for (const signature of [
          'billing_begin_pix(uuid,uuid,text,uuid,integer,text,boolean)',
          'billing_store_pix(uuid,jsonb,text,timestamptz)',
          'billing_pix_error(uuid,text,boolean)',
          'billing_cancel_uncreated_pix(uuid)',
        ]) {
          assert.equal(
            await value<boolean>("select has_function_privilege('authenticated',$1,'EXECUTE') v", [
              `public.${signature}`,
            ]),
            false,
          );
          assert.equal(
            await value<boolean>("select has_function_privilege('anon',$1,'EXECUTE') v", [
              `public.${signature}`,
            ]),
            false,
          );
          assert.equal(
            await value<boolean>("select has_function_privilege('service_role',$1,'EXECUTE') v", [
              `public.${signature}`,
            ]),
            true,
          );
        }
      },
    );
    await t.test(
      'pending Pix exposes only the verified code; duplicate requests do not create another payment or grant access',
      async () => {
        const s = await scenario();
        const pix = await s.engine.pix.checkout(s.userId, s.input);
        assert.equal(pix.qr_code, PIX_CODE);
        assert.equal(pix.qr_code_base64, PIX_PNG);
        assert.equal(pix.status, 'pending');
        assert.equal(await s.allowed(), false);
        await s.engine.pix.checkout(s.userId, s.input);
        assert.equal(s.calls.filter((c) => c.method === 'POST').length, 1);
        const request = s.calls.find((c) => c.method === 'POST')!;
        assert.equal(request.key, s.input.requestId);
        assert.equal(request.body.transaction_amount, 20);
        assert.match(
          String(request.body.date_of_expiration),
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        );
        assert.equal(request.body.notification_url, 'https://cronica.test/api/billing/webhook');
        assert.equal(
          (request.body.payer as { identification: { number: string } }).identification.number,
          '52998224725',
        );
        assert.ok(!JSON.stringify(await s.contract()).includes('52998224725'));
        assert.ok(!JSON.stringify(await s.contract()).includes(PIX_CODE));
        assert.equal((await s.ledger())[0].payment_method, 'pix');
        await assert.rejects(
          s.engine.pix.owned(randomUUID(), s.input.requestId),
          (e: unknown) => e instanceof BillingError && e.status === 404,
        );
      },
    );
    await t.test(
      'only canonical approval grants a calendar month; repeated webhooks keep exactly one period',
      async () => {
        const s = await scenario();
        await s.engine.pix.checkout(s.userId, s.input);
        s.approve();
        const event = {
          id: randomUUID(),
          topic: 'payment',
          resource_id: String(s.remote().id),
          attempts: 1,
        };
        await s.engine.processWebhook(event);
        assert.equal(await s.allowed(), true);
        assert.equal((await s.contract()).status, 'completed');
        const first = (await s.ledger())[0];
        const approved = new Date(String(s.remote().date_approved)),
          end = new Date(first.period_end!);
        assert.equal(end.getUTCMonth(), (approved.getUTCMonth() + 1) % 12);
        s.remote().date_last_updated = s.changed();
        await s.engine.processWebhook(event);
        await s.engine.syncUser(s.userId, true);
        assert.equal((await s.ledger()).length, 1);
        assert.equal(String((await s.ledger())[0].period_end), String(first.period_end));
        await assert.rejects(
          s.engine.pix.checkout(s.userId, { ...s.input, requestId: randomUUID() }),
          /período pago/,
        );
      },
    );
    await t.test(
      'a lost creation response is recovered by exact external reference without creating another Pix',
      async () => {
        const s = await scenario();
        s.lose();
        await assert.rejects(
          s.engine.pix.checkout(s.userId, s.input),
          (e: unknown) => e instanceof BillingError && e.code === 'checkout_uncertain',
        );
        assert.equal((await s.contract()).status, 'uncertain');
        await s.engine.syncUser(s.userId, true);
        assert.equal((await s.engine.pix.details(await s.contract())).qr_code, PIX_CODE);
        assert.equal(s.calls.filter((c) => c.method === 'POST').length, 1);
        assert.equal(s.payments.size, 1);
        assert.equal(await s.allowed(), false);
      },
    );
    await t.test(
      'mismatched receiver, account, amount, currency, method, environment and provider ID never grant access',
      async () => {
        const s = await scenario();
        await s.engine.pix.checkout(s.userId, s.input);
        s.approve();
        const good = structuredClone(s.remote());
        const contract = await s.contract();
        for (const mutation of [
          { collector_id: 999 },
          { transaction_amount: 1 },
          { currency_id: 'USD' },
          { live_mode: true },
          { payment_method_id: 'visa' },
          { id: Number(good.id) + 100 },
          { external_reference: randomUUID() },
          { metadata: { billing_contract_id: s.input.requestId, billing_user_id: randomUUID() } },
        ]) {
          const bad = { ...good, ...mutation };
          assert.throws(() => verifiedPixPayment(bad, contract, config));
        }
        for (const mutation of [
          { collector_id: 999 },
          { transaction_amount: 1 },
          { currency_id: 'USD' },
          { live_mode: true },
          { external_reference: randomUUID() },
        ]) {
          Object.assign(s.remote(), good, mutation);
          await assert.rejects(s.engine.pix.store(contract, s.remote()), /não corresponde/);
          assert.equal(await s.allowed(), false);
        }
        Object.assign(s.remote(), good, { date_approved: null });
        await assert.rejects(s.engine.pix.store(contract, s.remote()), /data de confirmação/);
      },
    );
    await t.test(
      'verified refunds and disputes remove access without extending the previously granted dates',
      async () => {
        const s = await scenario();
        await s.engine.pix.checkout(s.userId, s.input);
        s.approve();
        await s.engine.syncUser(s.userId, true);
        const end = (await s.ledger())[0].period_end;
        Object.assign(s.remote(), {
          status: 'refunded',
          transaction_amount_refunded: 20,
          date_last_updated: s.changed(),
        });
        await s.engine.syncUser(s.userId, true);
        assert.equal(await s.allowed(), false);
        assert.equal(String((await s.ledger())[0].period_end), String(end));
        Object.assign(s.remote(), {
          status: 'charged_back',
          transaction_amount_refunded: 0,
          date_last_updated: s.changed(),
        });
        await s.engine.syncUser(s.userId, true);
        assert.equal(await s.allowed(), false);
      },
    );
    await t.test(
      'cancelled and expired codes are confirmed at the provider before a new checkout can begin',
      async () => {
        const s = await scenario();
        await s.engine.pix.checkout(s.userId, s.input);
        const old = structuredClone(s.remote());
        await s.engine.cancel(s.userId, s.input.requestId);
        assert.equal(s.remote().status, 'cancelled');
        assert.equal((await s.contract()).status, 'cancelled');
        assert.equal((await s.engine.pix.details(await s.contract())).qr_code, null);
        assert.equal(s.calls.filter((c) => c.method === 'PUT').length, 1);
        old.date_last_updated = s.changed();
        await s.engine.pix.store(await s.contract(), old);
        assert.equal((await s.contract()).status, 'cancelled');
        const s2 = await scenario();
        await s2.engine.pix.checkout(s2.userId, s2.input);
        s2.remote().date_of_expiration = new Date(Date.now() - 1000).toISOString();
        await s2.engine.syncUser(s2.userId, true);
        assert.equal((await s2.contract()).status, 'expired');
        assert.equal(await s2.allowed(), false);
        assert.equal(s2.calls.filter((c) => c.method === 'PUT').length, 1);
      },
    );
    await t.test(
      'an approval that wins a cancellation race keeps the paid period without refunding it',
      async () => {
        const s = await scenario();
        await s.engine.pix.checkout(s.userId, s.input);
        s.race();
        await s.engine.cancel(s.userId, s.input.requestId);
        assert.equal(await s.allowed(), true);
        assert.equal((await s.contract()).status, 'completed');
        assert.equal((await s.ledger())[0].refunded_cents, 0);
      },
    );
    await t.test(
      'active Pix and recurring checkouts cannot create competing charges; free players do not pay',
      async () => {
        const s = await scenario();
        await s.engine.pix.checkout(s.userId, s.input);
        await assert.rejects(s.engine.checkout(s.userId, s.input), /Pix/);
        assert.equal(s.calls.filter((c) => c.method === 'POST').length, 1);
        const free = await scenario();
        await assert.rejects(
          free.engine.pix.checkout(free.userId, { ...free.input, scope: 'player' }),
          /gratuito/,
        );
        assert.equal(free.calls.length, 0);
        const r = await scenario();
        await adapter.rpc('billing_begin_checkout', {
          p_user_id: r.userId,
          p_plan_id: planId,
          p_scope: 'master',
          p_request_id: r.input.requestId,
          p_plan_version: 1,
          p_payer_email: r.input.payerEmail,
          p_consent: true,
        });
        assert.equal((await r.contract()).payment_method, 'recurring');
        await assert.rejects(
          r.engine.pix.checkout(r.userId, { ...r.input, requestId: randomUUID() }),
          /em andamento/,
        );
        assert.equal(r.calls.length, 0);
      },
    );
    await t.test(
      'account deletion can close pending Pix and late confirmations never restore an account being deleted',
      async () => {
        const s = await scenario();
        await s.engine.pix.checkout(s.userId, s.input);
        const token = randomUUID();
        await adapter.rpc('account_begin_deletion', {
          p_user_id: s.userId,
          p_token: token,
          p_fingerprint: 'a'.repeat(64),
          p_verified: true,
        });
        await s.engine.cancelContractRenewal(await s.contract());
        assert.equal((await s.contract()).status, 'cancelled');
        s.approve();
        await s.engine.pix.store(await s.contract(), s.remote());
        assert.equal(await s.allowed(), false);
        await adapter.rpc('account_prepare_purge', { p_user_id: s.userId, p_token: token });
      },
    );
    await t.test(
      'new prices require new consent and newly blocked accounts cannot generate a Pix',
      async () => {
        const s = await scenario();
        await db.query('insert into public.site_user_controls(user_id,blocked) values($1,true)', [
          s.userId,
        ]);
        await assert.rejects(s.engine.pix.checkout(s.userId, s.input), /não pode/);
        assert.equal(s.calls.length, 0);
        await db.exec('update public.billing_plans set version=version+1,amount_cents=2500');
        const p = await scenario();
        await assert.rejects(p.engine.pix.checkout(p.userId, p.input), /plano mudou/);
        assert.equal(p.calls.length, 0);
        await db.exec('update public.billing_plans set version=1,amount_cents=2000');
      },
    );
  } finally {
    await db.close();
  }
});
