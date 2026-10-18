import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MercadoPagoGateway, ProviderError, BillingError } from '../src/features/billing/gateway';
import { BillingEngine, type BillingDatabase } from '../src/features/billing/engine';
import type { BillingContract } from '../src/features/billing/types';

const config = {
  accessToken: 'private-local-token',
  collectorId: '123',
  environment: 'test' as const,
};
const response = (data: unknown, status = 200) => Response.json(data, { status });
const invoice = (id: number, contractId = 'sub1') => ({
  id: `invoice${id}`,
  preapproval_id: contractId,
  currency_id: 'BRL',
  transaction_amount: 20,
  payment: { id },
});

test('an empty search-index page remains pending and never fabricates a payment', async () => {
  const gateway = new MercadoPagoGateway(config, async () =>
    response({ paging: { offset: 0, limit: 20, total: 1 }, results: [] }),
  );
  assert.deepEqual(await gateway.invoices('sub1'), []);
});

test('invoice searches use only the documented filter first and follow a twenty-row page size', async () => {
  const calls: URL[] = [];
  const data = Array.from({ length: 25 }, (_, i) => invoice(i + 1));
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    assert.equal(init?.method, 'GET');
    assert.equal(url.searchParams.get('preapproval_id'), 'sub1');
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (url.searchParams.get('limit') === '100') return response({ message: 'Invalid limit' }, 400);
    return response({
      paging: { offset, limit: 20, total: data.length },
      results: data.slice(offset, offset + 20),
    });
  };
  const rows = await new MercadoPagoGateway(config, transport).invoices('sub1');
  assert.equal(rows.length, 25);
  assert.equal(rows.at(-1)?.id, 'invoice25');
  assert.deepEqual([...calls[0].searchParams.keys()], ['preapproval_id']);
  assert.equal(calls[1].searchParams.get('offset'), '20');
  assert.equal(calls[1].searchParams.get('limit'), '20');
});

test('a rejected explicit page size is retried without it while retaining subscription and offset', async () => {
  const calls: URL[] = [];
  const data = Array.from({ length: 25 }, (_, i) => invoice(i + 1));
  const gateway = new MercadoPagoGateway(config, async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (url.searchParams.has('limit')) return response({ message: 'Invalid limit parameter' }, 400);
    return response({
      paging: { offset, limit: 100, total: 25 },
      results: data.slice(offset, offset + 20),
    });
  });
  assert.equal((await gateway.invoices('sub1')).length, 25);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].searchParams.get('preapproval_id'), 'sub1');
  assert.equal(calls[2].searchParams.get('offset'), '20');
  assert.equal(calls[2].searchParams.has('limit'), false);
});

test('payer and payment searches preserve their exact filters without the old fixed limit', async () => {
  const reference = randomUUID(),
    calls: URL[] = [];
  const gateway = new MercadoPagoGateway(config, async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    assert.equal(url.searchParams.has('limit'), false);
    if (url.pathname === '/preapproval/search') {
      assert.equal(url.searchParams.get('payer_email'), 'payer+one@test.local');
      return response({
        results: [{ id: 'sub1', external_reference: reference }],
        paging: { total: 1 },
      });
    }
    if (url.pathname === '/preapproval/sub1')
      return response({ id: 'sub1', external_reference: reference });
    assert.equal(url.searchParams.get('payment_id'), '321');
    return response({ results: [invoice(321)], paging: { total: 1 } });
  });
  assert.equal((await gateway.searchSubscription(reference, 'payer+one@test.local'))?.id, 'sub1');
  assert.equal((await gateway.invoiceForPayment('321'))?.id, 'invoice321');
  assert.equal(calls.length, 3);
});

test('provider 400 diagnostics name the operation and classify errors without echoing provider data', async () => {
  const gateway = new MercadoPagoGateway(config, async () =>
    response(
      {
        message: 'Invalid preapproval_id private-local-token payer@test.local',
        cause: [{ description: 'email payer@test.local' }],
      },
      400,
    ),
  );
  await assert.rejects(gateway.invoices('sub1'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'provider_400');
    assert.equal(error.operation, 'invoice_search');
    assert.equal(error.reason, 'subscription_filter');
    assert.equal(error.diagnostic, 'MP_INVOICE_SEARCH_400');
    assert.match(error.message, /MP_INVOICE_SEARCH_400/);
    assert.ok(!JSON.stringify(error).includes('private-local-token'));
    assert.ok(!error.message.includes('payer@test.local'));
    return true;
  });
});

test('only read requests retry transient HTTP failures; creation and cancellation are sent once', async () => {
  const calls: { method: string; path: string }[] = [];
  let gets = 0;
  const gateway = new MercadoPagoGateway(config, async (input, init) => {
    const method = init?.method ?? 'GET',
      path = new URL(String(input)).pathname;
    calls.push({ method, path });
    if (method === 'GET' && ++gets === 2) return response({ id: 'sub1' });
    return response({ message: 'Temporary provider failure' }, 503);
  });
  assert.equal((await gateway.subscription('sub1')).id, 'sub1');
  const c = {
    id: randomUUID(),
    payer_email: 'payer@test.local',
    plan_snapshot: { name: 'Mensal', amount_cents: 2000, interval_months: 1 },
  } as BillingContract;
  await assert.rejects(gateway.create(c, 'https://cronica.test/assinatura'), ProviderError);
  await assert.rejects(gateway.cancel('sub1'), ProviderError);
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET', 'GET', 'POST', 'PUT'],
  );
});

test('search pagination rejects repeated pages and malformed records without looping or returning incomplete history', async () => {
  let calls = 0;
  const gateway = new MercadoPagoGateway(config, async () => {
    calls++;
    return response({ paging: { offset: 0, limit: 1, total: 2 }, results: [invoice(1)] });
  });
  await assert.rejects(
    gateway.invoices('sub1'),
    (e: unknown) => e instanceof BillingError && e.code === 'provider_pagination_stalled',
  );
  assert.equal(calls, 2);
  const malformed = new MercadoPagoGateway(config, async () =>
    response({ results: [{ payment: { id: 1 } }], paging: { total: 1 } }),
  );
  await assert.rejects(
    malformed.invoices('sub1'),
    (e: unknown) =>
      e instanceof BillingError && e.code === 'provider_invalid_page' && e.status === 502,
  );
});

function scenario() {
  const contract = {
    id: randomUUID(),
    user_id: randomUUID(),
    provider_id: 'sub1',
    status: 'authorized',
    plan_snapshot: { amount_cents: 2000, interval_months: 1 },
  } as BillingContract;
  const stored: Record<string, unknown>[] = [];
  const db: BillingDatabase = {
    async rpc<T>(name: string, args: Record<string, unknown> = {}) {
      if (name === 'billing_update_contract') return contract as T;
      if (name === 'billing_store_payment') stored.push(args.p_payment as Record<string, unknown>);
      return true as T;
    },
    async contracts() {
      return [contract];
    },
    async contract() {
      return contract;
    },
    async byProvider() {
      return contract;
    },
    async paymentIds() {
      return [] as string[];
    },
  };
  const subscription = {
    id: 'sub1',
    external_reference: contract.id,
    collector_id: 123,
    status: 'authorized',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 20,
      currency_id: 'BRL',
    },
    last_modified: '2026-10-18T12:00:00Z',
  };
  const payment = {
    id: 321,
    collector_id: 123,
    currency_id: 'BRL',
    transaction_amount: 20,
    transaction_amount_refunded: 0,
    live_mode: false,
    status: 'approved',
    date_approved: '2026-10-18T12:00:00Z',
    date_last_updated: '2026-10-18T12:00:00Z',
  };
  return { contract, stored, db, subscription, payment };
}

test('one unavailable invoice does not block a different canonical approved payment', async () => {
  const s = scenario();
  const gateway = new MercadoPagoGateway(config, async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/preapproval/sub1') return response(s.subscription);
    if (url.pathname === '/authorized_payments/search')
      return response({ results: [invoice(100), invoice(321)], paging: { total: 2 } });
    if (url.pathname === '/v1/payments/100') return response({ message: 'Not found' }, 404);
    return response(s.payment);
  });
  await assert.rejects(
    new BillingEngine(s.db, gateway, 'https://cronica.test').syncContract(s.contract),
    ProviderError,
  );
  assert.equal(s.stored.length, 1);
  assert.equal(s.stored[0].provider_payment_id, '321');
  assert.equal(s.stored[0].status, 'approved');
});

test('a failed invoice-list query still rechecks stored payments for verified refunds', async () => {
  const s = scenario();
  s.db.paymentIds = async () => ['321'];
  const gateway = new MercadoPagoGateway(config, async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/preapproval/sub1') return response(s.subscription);
    if (url.pathname === '/authorized_payments/search') {
      if (url.searchParams.has('preapproval_id')) return response({ message: 'Bad request' }, 400);
      return response({ results: [invoice(321)], paging: { total: 1 } });
    }
    return response({ ...s.payment, status: 'refunded', transaction_amount_refunded: 20 });
  });
  await assert.rejects(
    new BillingEngine(s.db, gateway, 'https://cronica.test').syncContract(s.contract),
    ProviderError,
  );
  assert.equal(s.stored.length, 1);
  assert.equal(s.stored[0].status, 'refunded');
});
