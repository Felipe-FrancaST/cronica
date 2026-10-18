import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cents } from './model';
import type { BillingContract, BillingPayment } from './types';

type Json = Record<string, unknown>;
export class BillingError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'billing_error',
  ) {
    super(message);
  }
}
export class ProviderError extends BillingError {
  constructor(public providerStatus: number) {
    super(
      'O Mercado Pago não concluiu a operação. Tente conferir o pagamento novamente em alguns instantes.',
      502,
      `provider_${providerStatus}`,
    );
  }
}
export const resourceId = (id: unknown) => {
  const value = String(id ?? '');
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new BillingError('Referência de pagamento inválida.');
  return value;
};
export function iso(value: unknown, required = false): string | null {
  if (value === null || value === undefined || value === '') {
    if (required) throw new BillingError('O provedor não informou a data de confirmação.');
    return null;
  }
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new BillingError('Data de pagamento inválida.');
  return date.toISOString();
}
export function checkoutUrl(value: unknown) {
  const url = new URL(String(value));
  if (
    url.protocol !== 'https:' ||
    ![
      'www.mercadopago.com.br',
      'mercadopago.com.br',
      'www.mercadopago.com',
      'mercadopago.com',
    ].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith('/subscriptions/checkout')
  )
    throw new BillingError('O Mercado Pago retornou um endereço de checkout inválido.', 502);
  return url.href;
}
export interface GatewayConfig {
  accessToken: string;
  collectorId: string;
  applicationId?: string;
  environment: 'test' | 'production';
  baseUrl?: string;
}
export class MercadoPagoGateway {
  constructor(
    readonly config: GatewayConfig,
    private transport: typeof fetch = fetch,
  ) {}
  async request(path: string, method = 'GET', body?: Json, idempotency?: string): Promise<Json> {
    const response = await this.transport(
      `${this.config.baseUrl ?? 'https://api.mercadopago.com'}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          ...(idempotency ? { 'X-Idempotency-Key': idempotency } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
        redirect: 'error',
      },
    );
    if (!response.ok) throw new ProviderError(response.status);
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new BillingError('Resposta inválida do Mercado Pago.', 502);
    return result as Json;
  }
  create(contract: BillingContract, backUrl: string) {
    return this.request(
      '/preapproval',
      'POST',
      {
        reason: contract.plan_snapshot.name,
        external_reference: contract.id,
        payer_email: contract.payer_email,
        auto_recurring: {
          frequency: contract.plan_snapshot.interval_months,
          frequency_type: 'months',
          transaction_amount: contract.plan_snapshot.amount_cents / 100,
          currency_id: 'BRL',
        },
        back_url: backUrl,
        status: 'pending',
      },
      contract.id,
    );
  }
  subscription(id: string) {
    return this.request(`/preapproval/${resourceId(id)}`);
  }
  cancel(id: string) {
    return this.request(`/preapproval/${resourceId(id)}`, 'PUT', { status: 'cancelled' });
  }
  invoice(id: string) {
    return this.request(`/authorized_payments/${resourceId(id)}`);
  }
  payment(id: string) {
    return this.request(`/v1/payments/${resourceId(id)}`);
  }
  async searchSubscription(reference: string, payerEmail: string) {
    const exact: Json[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const result = await this.request(
        `/preapproval/search?payer_email=${encodeURIComponent(payerEmail)}&offset=${offset}&limit=100`,
      );
      if (!Array.isArray(result.results))
        throw new BillingError('Não foi possível localizar a contratação no Mercado Pago.', 502);
      const rows = result.results as Json[];
      exact.push(...rows.filter((row) => row.external_reference === reference));
      if (exact.length > 1)
        throw new BillingError(
          'Mais de uma assinatura foi encontrada para este pedido. Consulte o suporte.',
          409,
        );
      const total = Number((result.paging as Json | undefined)?.total ?? offset + rows.length);
      if (rows.length < 100 || offset + rows.length >= total)
        return exact[0] ? this.subscription(resourceId(exact[0].id)) : null;
    }
    throw new BillingError('Esta contratação precisa de uma conferência pelo suporte.', 409);
  }
  async invoices(contractId: string) {
    const rows: Json[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const result = await this.request(
        `/authorized_payments/search?preapproval_id=${resourceId(contractId)}&offset=${offset}&limit=100`,
      );
      const page = Array.isArray(result.results) ? (result.results as Json[]) : null;
      if (!page)
        throw new BillingError('Não foi possível conferir as cobranças desta assinatura.', 502);
      rows.push(...page);
      const total = Number((result.paging as Json | undefined)?.total ?? offset + page.length);
      if (page.length < 100 || offset + page.length >= total) return rows;
    }
    throw new BillingError(
      'O histórico desta assinatura precisa de uma conciliação assistida.',
      409,
    );
  }
  async invoiceForPayment(id: string) {
    const result = await this.request(
      `/authorized_payments/search?payment_id=${resourceId(id)}&limit=100`,
    );
    const rows = Array.isArray(result.results) ? (result.results as Json[]) : [];
    return rows.find((row) => String((row.payment as Json | undefined)?.id) === id) ?? null;
  }
}
export function verifiedSubscription(
  remote: Json,
  contract: BillingContract,
  config: GatewayConfig,
) {
  const recurring = remote.auto_recurring as Json | undefined;
  if (
    remote.external_reference !== contract.id ||
    String(remote.collector_id) !== config.collectorId ||
    (config.applicationId && String(remote.application_id) !== config.applicationId) ||
    !recurring ||
    recurring.currency_id !== 'BRL' ||
    cents(recurring.transaction_amount) !== contract.plan_snapshot.amount_cents ||
    Number(recurring.frequency) !== contract.plan_snapshot.interval_months ||
    recurring.frequency_type !== 'months'
  )
    throw new BillingError(
      'A assinatura recebida não corresponde à contratação.',
      409,
      'subscription_mismatch',
    );
  const id = resourceId(remote.id);
  if (contract.provider_id && contract.provider_id !== id)
    throw new BillingError('Referência de assinatura divergente.', 409);
  if (!['pending', 'authorized', 'paused', 'cancelled'].includes(String(remote.status)))
    throw new BillingError('Situação de assinatura desconhecida.', 502);
  return {
    id,
    status: String(remote.status),
    checkout_url: remote.init_point ? checkoutUrl(remote.init_point) : null,
    updated_at: iso(remote.last_modified ?? remote.date_created, true)!,
    next_payment_at: iso(remote.next_payment_date),
  };
}
export function verifiedPayment(
  invoice: Json,
  payment: Json,
  contract: BillingContract,
  config: GatewayConfig,
): Omit<BillingPayment, 'contract_id' | 'user_id' | 'created_at' | 'period_start' | 'period_end'> {
  const invoicePayment = invoice.payment as Json | undefined;
  if (
    String(invoice.preapproval_id) !== contract.provider_id ||
    (invoice.external_reference && invoice.external_reference !== contract.id) ||
    invoice.currency_id !== 'BRL' ||
    cents(invoice.transaction_amount) !== contract.plan_snapshot.amount_cents ||
    !invoicePayment ||
    String(invoicePayment.id) !== String(payment.id) ||
    String(payment.collector_id) !== config.collectorId ||
    payment.currency_id !== 'BRL' ||
    cents(payment.transaction_amount) !== contract.plan_snapshot.amount_cents ||
    payment.live_mode !== (config.environment === 'production')
  )
    throw new BillingError(
      'O pagamento recebido não corresponde à assinatura.',
      409,
      'payment_mismatch',
    );
  const status = String(payment.status);
  if (
    ![
      'approved',
      'pending',
      'authorized',
      'in_process',
      'in_mediation',
      'rejected',
      'cancelled',
      'refunded',
      'charged_back',
    ].includes(status)
  )
    throw new BillingError('Situação de pagamento desconhecida.', 502);
  const refunded = cents(payment.transaction_amount_refunded ?? 0);
  if (refunded > contract.plan_snapshot.amount_cents)
    throw new BillingError('Reembolso inválido.', 502);
  const fees = Array.isArray(payment.fee_details) ? (payment.fee_details as Json[]) : null;
  const net = (payment.transaction_details as Json | undefined)?.net_received_amount;
  // Optional settlement metadata must not prevent a verified refund from revoking access.
  let feeCents: number | null = null,
    netCents: number | null = null;
  try {
    if (fees) feeCents = fees.reduce((sum, item) => sum + cents(item.amount), 0);
  } catch {
    /* Unknown fees stay unknown. */
  }
  try {
    if (net !== undefined && net !== null) {
      netCents =
        typeof net === 'number' && net < 0
          ? -cents(-net)
          : typeof net === 'string' && net.startsWith('-')
            ? -cents(net.slice(1))
            : cents(net);
    }
  } catch {
    /* Unknown settlement amounts stay unknown. */
  }
  return {
    provider_payment_id: resourceId(payment.id),
    invoice_id: resourceId(invoice.id),
    status,
    amount_cents: cents(payment.transaction_amount),
    refunded_cents: refunded,
    fee_cents: feeCents,
    net_cents: netCents,
    approved_at: iso(payment.date_approved, status === 'approved'),
    provider_updated_at: iso(payment.date_last_updated ?? payment.date_created, true)!,
  };
}
export function secureEqual(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function verifyWebhook(request: Request, body: Json, secret: string) {
  const url = new URL(request.url);
  const ids = url.searchParams.getAll('data.id');
  if (ids.length !== 1 || !secret)
    throw new BillingError('Notificação sem assinatura válida.', 401);
  const id = resourceId(ids[0]);
  const data = body.data as Json | undefined;
  if (String(data?.id ?? '') !== id)
    throw new BillingError('Referências de notificação divergentes.', 401);
  const topic = String(body.type ?? '');
  if (!['subscription_preapproval', 'subscription_authorized_payment', 'payment'].includes(topic))
    throw new BillingError('Tipo de notificação não suportado.', 400);
  const header = request.headers.get('x-signature') ?? '';
  const ts = header.match(/(?:^|,)\s*ts=(\d{10,16})(?:,|$)/)?.[1];
  const signatures = [...header.matchAll(/(?:^|,)\s*v1=([a-f0-9]{64})(?=,|$)/gi)].map((x) =>
    x[1].toLowerCase(),
  );
  const requestId = request.headers.get('x-request-id') ?? '';
  if (!ts || !requestId || requestId.length > 200 || !/^[\w-]+$/.test(requestId))
    throw new BillingError('Notificação sem assinatura válida.', 401);
  const expected = createHmac('sha256', secret)
    .update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  if (!signatures.some((signature) => secureEqual(expected, signature)))
    throw new BillingError('Assinatura de notificação inválida.', 401);
  return {
    id,
    topic,
    fingerprint: createHash('sha256').update(`${topic}:${id}:${requestId}:${ts}`).digest('hex'),
  };
}
