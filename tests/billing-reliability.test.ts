import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BillingEngine, type BillingDatabase } from '../src/features/billing/engine';
import {
  BillingError,
  MercadoPagoGateway,
  verifiedSubscription,
  checkoutUrl,
} from '../src/features/billing/gateway';
import {
  billingConfiguration,
  validatedBillingConfiguration,
} from '../src/features/billing/configuration';
import type { BillingContract } from '../src/features/billing/types';

type Json = Record<string, unknown>;
const config = {
  accessToken: 'local-test-token',
  collectorId: '123',
  environment: 'test' as const,
};
function contract(overrides: Partial<BillingContract> = {}): BillingContract {
  return {
    id: randomUUID(),
    user_id: randomUUID(),
    provider_id: 'local-sub',
    status: 'authorized',
    plan_snapshot: { amount_cents: 2000, interval_months: 1, name: 'Mensal', version: 1 },
    payer_email: 'payer@test.local',
    ...overrides,
  } as BillingContract;
}
function remote(c: BillingContract, overrides: Json = {}): Json {
  return {
    id: c.provider_id ?? 'local-sub',
    external_reference: c.id,
    collector_id: 123,
    status: 'authorized',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 20,
      currency_id: 'BRL',
    },
    last_modified: '2026-10-18T12:00:00Z',
    ...overrides,
  };
}
function database(rows: BillingContract[]) {
  const calls: { name: string; args: Json }[] = [];
  const db: BillingDatabase = {
    async rpc<T>(name: string, args: Json = {}) {
      calls.push({ name, args });
      if (name === 'billing_claim_sync') return true as T;
      if (name === 'billing_update_contract') {
        const c = rows.find((c) => c.id === args.p_id)!;
        Object.assign(c, {
          status: args.p_status,
          provider_id: args.p_provider_id ?? c.provider_id,
          checkout_url: args.p_checkout_url,
        });
        return c as T;
      }
      return null as T;
    },
    async contracts(id) {
      return rows.filter((c) => c.user_id === id);
    },
    async contract(id) {
      return rows.find((c) => c.id === id) ?? null;
    },
    async byProvider(id) {
      return rows.find((c) => c.provider_id === id) ?? null;
    },
    async paymentIds() {
      return ['321'];
    },
  };
  return { db, calls };
}
const json = (v: unknown, status = 200) => Response.json(v, { status });

test('billing configuration trims pasted values and rejects malformed IDs, environments and secrets', () => {
  const env = {
    SUPABASE_SERVICE_ROLE_KEY: ' service ',
    MERCADO_PAGO_ACCESS_TOKEN: ' token ',
    MERCADO_PAGO_COLLECTOR_ID: ' 123 ',
    MERCADO_PAGO_WEBHOOK_SECRET: ' secret ',
    CRON_SECRET: ' xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx ',
    MERCADO_PAGO_ENVIRONMENT: ' production ',
  };
  assert.equal(validatedBillingConfiguration(env)('MERCADO_PAGO_COLLECTOR_ID'), '123');
  assert.deepEqual(billingConfiguration(env).missing, []);
  for (const changes of [
    { MERCADO_PAGO_COLLECTOR_ID: 'production' },
    { MERCADO_PAGO_APPLICATION_ID: 'Client-ID' },
    { MERCADO_PAGO_ENVIRONMENT: 'public' },
    { CRON_SECRET: 'short' },
    { MERCADO_PAGO_ACCESS_TOKEN: '  ' },
  ])
    assert.throws(
      () => validatedBillingConfiguration({ ...env, ...changes }),
      (e: unknown) =>
        e instanceof BillingError &&
        e.code === 'configuration_required' &&
        !e.message.includes('token'),
    );
  assert.throws(() => checkoutUrl('https://www.mercadopago.com.br/subscriptions/checkout-evil'));
  assert.throws(() => checkoutUrl('not a URL'), BillingError);
});

test('subscription errors identify the divergent field; cancellation still requires exact identity', () => {
  const c = contract(),
    r = remote(c);
  for (const [changes, code] of [
    [{ collector_id: 999 }, 'collector'],
    [{ external_reference: randomUUID() }, 'reference'],
    [{ id: 'other' }, 'id'],
    [
      {
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 19,
          currency_id: 'BRL',
        },
      },
      'amount',
    ],
    [{ auto_recurring: null }, 'schedule'],
  ] as [Json, string][])
    assert.throws(
      () => verifiedSubscription({ ...r, ...changes }, c, config),
      (e: unknown) => e instanceof BillingError && e.code === `subscription_${code}_mismatch`,
    );
  assert.throws(
    () => verifiedSubscription(r, c, { ...config, applicationId: '999' }),
    (e: unknown) => e instanceof BillingError && e.code === 'subscription_application_mismatch',
  );
  assert.equal(
    verifiedSubscription({ ...r, auto_recurring: null, init_point: 'bad URL' }, c, config, true).id,
    c.provider_id,
  );
  assert.throws(() => verifiedSubscription({ ...r, collector_id: 999 }, c, config, true));
});

test('a lost cancellation response is recovered by canonical GET without a second PUT or price dependency', async () => {
  const c = contract(),
    { db, calls } = database([c]);
  let puts = 0;
  let r = remote(c, {
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 99,
      currency_id: 'BRL',
    },
  });
  const transport: typeof fetch = async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/preapproval/local-sub');
    if (init?.method === 'PUT') {
      puts++;
      r = { ...r, status: 'cancelled' };
      throw new Error('response lost');
    }
    return json(r);
  };
  const engine = new BillingEngine(
    db,
    new MercadoPagoGateway(config, transport),
    'https://cronica.test',
  );
  await assert.rejects(engine.cancel(c.user_id, c.id), /response lost/);
  assert.equal(c.status, 'authorized');
  assert.equal((await engine.cancel(c.user_id, c.id)).status, 'cancelled');
  assert.equal(puts, 1);
  assert.equal(calls.filter((c) => c.name === 'billing_store_payment').length, 0);
});

test('a broken old contract cannot prevent the active contract from being reconciled', async () => {
  const current = contract(),
    old = contract({ user_id: current.user_id, provider_id: 'old-sub', status: 'cancelled' });
  const { db, calls } = database([old, current]);
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/preapproval/old-sub') return json(remote(old, { collector_id: 999 }));
    if (url.pathname === '/preapproval/local-sub') return json(remote(current));
    return json({ paging: { total: 0 }, results: [] });
  };
  const engine = new BillingEngine(
    db,
    new MercadoPagoGateway(config, transport),
    'https://cronica.test',
  );
  await assert.rejects(engine.syncUser(current.user_id, true), /recebedora/);
  assert.ok(calls.some((c) => c.name === 'billing_update_contract' && c.args.p_id === current.id));
  assert.ok(calls.some((c) => c.name === 'billing_note_error' && c.args.p_id === old.id));
  assert.equal(calls.at(-1)?.name, 'billing_release_sync');
});

test('a changed remote price never hides a verified refund and never grants a new approved period', async () => {
  const c = contract(),
    { db, calls } = database([c]);
  let status = 'refunded';
  const invoice = {
    id: 'invoice321',
    preapproval_id: c.provider_id,
    external_reference: c.id,
    currency_id: 'BRL',
    transaction_amount: 20,
    payment: { id: 321 },
  };
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/preapproval/local-sub')
      return json(
        remote(c, {
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: 99,
            currency_id: 'BRL',
          },
        }),
      );
    if (url.pathname === '/authorized_payments/search')
      return json({ results: [invoice], paging: { total: 1 } });
    if (url.pathname === '/v1/payments/321')
      return json({
        id: 321,
        collector_id: 123,
        currency_id: 'BRL',
        transaction_amount: 20,
        transaction_amount_refunded: status === 'refunded' ? 20 : 0,
        live_mode: false,
        status,
        date_approved: '2026-10-18T11:00:00Z',
        date_last_updated: '2026-10-18T12:00:00Z',
      });
    throw new Error('Unexpected provider request');
  };
  const engine = new BillingEngine(
    db,
    new MercadoPagoGateway(config, transport),
    'https://cronica.test',
  );
  await assert.rejects(
    engine.syncContract(c),
    (e: unknown) => e instanceof BillingError && e.code === 'subscription_amount_mismatch',
  );
  assert.equal(
    (calls.find((c) => c.name === 'billing_store_payment')?.args.p_payment as Json).status,
    'refunded',
  );
  calls.length = 0;
  status = 'approved';
  await assert.rejects(engine.syncContract(c), /valor/);
  assert.equal(calls.filter((c) => c.name === 'billing_store_payment').length, 0);
});

test('checkout exposes only the canonical provider response and clearly marks definitive failures', async () => {
  const c = contract({ provider_id: null, status: 'creating' }),
    { db, calls } = database([c]);
  const baseRpc = db.rpc.bind(db);
  let creates = 0,
    failed = false;
  db.rpc = async <T>(name: string, args: Json = {}) =>
    name === 'billing_begin_checkout'
      ? ({ contract: c, create: c.status === 'creating' } as T)
      : baseRpc<T>(name, args);
  const transport: typeof fetch = async (_input, init) => {
    if (init?.method === 'POST') {
      creates++;
      return failed ? json({}, 422) : json({ id: 'local-sub', init_point: 'https://evil.test' });
    }
    return json(
      remote(c, {
        status: 'pending',
        init_point:
          'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=canonical',
      }),
    );
  };
  const engine = new BillingEngine(
    db,
    new MercadoPagoGateway(config, transport),
    'https://cronica.test',
  );
  const input = {
    planId: randomUUID(),
    scope: 'master',
    requestId: c.id,
    planVersion: 1,
    payerEmail: 'payer@test.local',
    consent: true,
  };
  assert.match((await engine.checkout(c.user_id, input)).checkout_url!, /canonical/);
  assert.equal(creates, 1);
  c.status = 'creating';
  failed = true;
  await assert.rejects(
    engine.checkout(c.user_id, input),
    (e: unknown) => e instanceof BillingError && e.code === 'checkout_failed',
  );
  assert.equal(c.status, 'failed');
  await assert.rejects(
    engine.checkout(c.user_id, input),
    (e: unknown) => e instanceof BillingError && e.code === 'checkout_failed',
  );
  assert.equal(creates, 2);
  assert.ok(
    calls.some((c) => c.name === 'billing_update_contract' && c.args.p_status === 'failed'),
  );
});
