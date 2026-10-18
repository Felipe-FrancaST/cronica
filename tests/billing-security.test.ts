import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { addCalendarMonths, cents, csvCell, safeContinue } from '../src/features/billing/model';
import {
  checkoutUrl,
  verifyWebhook,
  verifiedPayment,
  verifiedSubscription,
  type GatewayConfig,
} from '../src/features/billing/gateway';
import type { BillingContract } from '../src/features/billing/types';
const config: GatewayConfig = {
  accessToken: 'test-secret',
  collectorId: '123',
  environment: 'test',
};
const contract = {
  id: 'b1000000-0000-4000-8000-000000000002',
  provider_id: 'remote',
  plan_snapshot: { amount_cents: 2000, interval_months: 1 },
} as BillingContract;
const remote = {
  id: 'remote',
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
const invoice = {
  id: 'invoice1',
  preapproval_id: 'remote',
  external_reference: contract.id,
  currency_id: 'BRL',
  transaction_amount: 20,
  payment: { id: 100, status: 'approved' },
};
const payment = {
  id: 100,
  collector_id: 123,
  currency_id: 'BRL',
  transaction_amount: 20,
  transaction_amount_refunded: 0,
  live_mode: false,
  status: 'approved',
  date_approved: '2026-10-18T12:00:00Z',
  date_last_updated: '2026-10-18T12:00:00Z',
  fee_details: [{ amount: 0.99 }],
  transaction_details: { net_received_amount: 19.01 },
};
test('monetary parsing rejects fractions of cents, non-finite, negative and excessive values', () => {
  assert.equal(cents('20.00'), 2000);
  assert.equal(cents(0.29), 29);
  assert.equal(cents(0), 0);
  for (const value of [NaN, Infinity, -1, '20,00', '1e3', '0.001', 0.001, 1e10, null, undefined])
    assert.throws(() => cents(value));
});
test('monthly paid periods clamp month-end and preserve UTC time', () => {
  assert.equal(addCalendarMonths('2026-01-31T12:34:56Z', 1), '2026-02-28T12:34:56.000Z');
  assert.equal(addCalendarMonths('2028-01-31T12:34:56Z', 1), '2028-02-29T12:34:56.000Z');
  assert.equal(addCalendarMonths('2028-02-29T12:34:56Z', 12), '2029-02-28T12:34:56.000Z');
});
test('checkout accepts only the official hosted subscription destination', () => {
  assert.equal(
    new URL(checkoutUrl('https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=x'))
      .hostname,
    'www.mercadopago.com.br',
  );
  for (const url of [
    'javascript:alert(1)',
    'https://mercadopago.com.br.evil.test/subscriptions/checkout',
    'https://evil.test',
    'http://www.mercadopago.com.br/subscriptions/checkout',
    'https://user:pass@mercadopago.com.br/subscriptions/checkout',
    'https://www.mercadopago.com.br/other',
    'https://www.mercadopago.com.br:444/subscriptions/checkout',
  ])
    assert.throws(() => checkoutUrl(url));
});
test('subscription validation binds account, local reference, amount, interval and currency', () => {
  assert.equal(verifiedSubscription(remote, contract, config).status, 'authorized');
  for (const change of [
    { collector_id: 456 },
    { external_reference: 'other' },
    { id: 'other' },
    { status: 'unknown' },
    { auto_recurring: { ...remote.auto_recurring, transaction_amount: 1 } },
    { auto_recurring: { ...remote.auto_recurring, currency_id: 'USD' } },
    { auto_recurring: { ...remote.auto_recurring, frequency: 3 } },
  ])
    assert.throws(() => verifiedSubscription({ ...remote, ...change }, contract, config));
  assert.throws(() => verifiedSubscription(remote, contract, { ...config, applicationId: '999' }));
});
test('approved payment must be canonical and bound to the invoice, owner, exact amount and environment', () => {
  const result = verifiedPayment(invoice, payment, contract, config);
  assert.equal(result.amount_cents, 2000);
  assert.equal(result.fee_cents, 99);
  assert.equal(result.net_cents, 1901);
  for (const change of [
    { id: 101 },
    { collector_id: 456 },
    { live_mode: true },
    { currency_id: 'USD' },
    { transaction_amount: 19 },
    { date_approved: null },
    { transaction_amount_refunded: 21 },
  ])
    assert.throws(() => verifiedPayment(invoice, { ...payment, ...change }, contract, config));
  for (const change of [
    { preapproval_id: 'other' },
    { external_reference: 'other' },
    { transaction_amount: 1 },
    { payment: { id: 101 } },
  ])
    assert.throws(() => verifiedPayment({ ...invoice, ...change }, payment, contract, config));
});
test('missing provider fee and net information remains unknown, never fabricated', () => {
  const result = verifiedPayment(
    invoice,
    { ...payment, fee_details: undefined, transaction_details: {} },
    contract,
    config,
  );
  assert.equal(result.fee_cents, null);
  assert.equal(result.net_cents, null);
  const refund = verifiedPayment(
    invoice,
    {
      ...payment,
      status: 'refunded',
      transaction_amount_refunded: 20,
      fee_details: [{ amount: 'unknown' }],
      transaction_details: { net_received_amount: -0.99 },
    },
    contract,
    config,
  );
  assert.equal(refund.status, 'refunded');
  assert.equal(refund.net_cents, -99);
  assert.equal(refund.fee_cents, null);
});
test('webhook HMAC covers the query resource and request ID, without trusting payment status from the body', () => {
  const secret = 'local-webhook-secret',
    ts = '1792324800000',
    requestId = 'request-123',
    id = 'ABC123';
  const signature = createHmac('sha256', secret)
    .update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  const request = (query = id, signatureValue = signature) =>
    new Request(`https://cronica.test/api/billing/webhook?data.id=${query}`, {
      headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signatureValue}` },
    });
  const body = { type: 'payment', data: { id }, status: 'approved' };
  assert.equal(verifyWebhook(request(), body, secret).id, id);
  assert.throws(() => verifyWebhook(request('OTHER'), { ...body, data: { id: 'OTHER' } }, secret));
  assert.throws(() => verifyWebhook(request(), { ...body, data: { id: 'OTHER' } }, secret));
  assert.throws(() => verifyWebhook(request(id, '0'.repeat(64)), body, secret));
  assert.throws(() => verifyWebhook(request(), body, ''));
  assert.throws(() =>
    verifyWebhook(
      new Request(`https://cronica.test/api/billing/webhook?data.id=${id}`),
      body,
      secret,
    ),
  );
  assert.throws(() => verifyWebhook(request(), { ...body, type: 'unknown' }, secret));
  assert.throws(() =>
    verifyWebhook(
      new Request(`https://cronica.test/api/billing/webhook?data.id=${id}&data.id=${id}`),
      body,
      secret,
    ),
  );
});
test('CSV fields cannot become spreadsheet formulas; continuation URLs stay in the app', () => {
  for (const formula of ['=HYPERLINK("evil")', ' +SUM(1)', '@cmd', '-1', '\tvalue'])
    assert.ok(csvCell(formula).startsWith('"\''));
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(-99), '"-99"');
  assert.equal(safeContinue('/campanhas/test/mesa'), '/campanhas/test/mesa');
  for (const path of [
    '//evil.test',
    '/\\evil.test',
    '/api/admin/billing',
    'https://evil.test',
    '/assinatura?x=1',
    '/administracao',
  ])
    assert.equal(safeContinue(path), '/');
});
