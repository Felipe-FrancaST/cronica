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
  readonly diagnostic: string;
  constructor(
    public providerStatus: number,
    public operation: ProviderOperation = 'request',
    public reason: ProviderReason | null = null,
  ) {
    const diagnostic = `MP_${operation.toUpperCase()}_${providerStatus}`;
    super(
      [401, 403].includes(providerStatus)
        ? 'O Mercado Pago recusou as credenciais do servidor. Entre em contato com o suporte.'
        : providerStatus === 429
          ? 'O Mercado Pago recebeu muitas consultas. Aguarde alguns instantes e tente novamente.'
          : providerStatus === 400
            ? `O Mercado Pago recusou a solicitação para ${providerActions[operation]}. Consulte o suporte com a referência ${diagnostic}.`
            : `Não foi possível ${providerActions[operation]}. Tente conferir o pagamento novamente em alguns instantes. Referência: ${diagnostic}.`,
      502,
      `provider_${providerStatus}`,
    );
    this.diagnostic = diagnostic;
  }
}
const providerActions = {
  request: 'concluir a operação no Mercado Pago',
  subscription_lookup: 'consultar a assinatura no Mercado Pago',
  subscription_search: 'localizar a assinatura no Mercado Pago',
  invoice_search: 'buscar as cobranças no Mercado Pago',
  invoice_lookup: 'consultar a fatura no Mercado Pago',
  payment_lookup: 'consultar o pagamento no Mercado Pago',
  checkout_create: 'preparar a assinatura no Mercado Pago',
  subscription_cancel: 'cancelar a renovação no Mercado Pago',
} as const;
export type ProviderOperation = keyof typeof providerActions;
export type ProviderReason =
  'pagination' | 'subscription_filter' | 'payment_filter' | 'invalid_parameters';
function providerOperation(path: string, method: string): ProviderOperation {
  if (path.startsWith('/preapproval/search?')) return 'subscription_search';
  if (path.startsWith('/authorized_payments/search?')) return 'invoice_search';
  if (path.startsWith('/authorized_payments/')) return 'invoice_lookup';
  if (path.startsWith('/v1/payments/')) return 'payment_lookup';
  if (path === '/preapproval' && method === 'POST') return 'checkout_create';
  if (path.startsWith('/preapproval/') && method === 'PUT') return 'subscription_cancel';
  if (path.startsWith('/preapproval/')) return 'subscription_lookup';
  return 'request';
}
async function providerReason(response: Response): Promise<ProviderReason | null> {
  // Classify only known parameter errors. Never relay provider text, account data or credentials.
  try {
    const body = (await response.json()) as Json;
    const causes = Array.isArray(body.cause) ? (body.cause as Json[]) : [];
    const text = [body.message, body.error, ...causes.flatMap((c) => [c.code, c.description])]
      .filter((v) => typeof v === 'string')
      .join(' ')
      .toLowerCase();
    if (/\blimit\b|\boffset\b|pagination/.test(text)) return 'pagination';
    if (text.includes('preapproval_id')) return 'subscription_filter';
    if (text.includes('payment_id')) return 'payment_filter';
    return response.status === 400 ? 'invalid_parameters' : null;
  } catch {
    return null;
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
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new BillingError('O Mercado Pago retornou um endereço de checkout inválido.', 502);
  }
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
    !/^\/subscriptions\/checkout\/?$/.test(url.pathname)
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
    const operation = providerOperation(path, method);
    for (let attempt = 0; ; attempt++) {
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
      if (!response.ok) {
        if (
          method === 'GET' &&
          attempt === 0 &&
          [429, 500, 502, 503, 504].includes(response.status)
        ) {
          await response.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        throw new ProviderError(response.status, operation, await providerReason(response));
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result))
        throw new BillingError('Resposta inválida do Mercado Pago.', 502);
      return result as Json;
    }
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
  private async search(path: string, filters: Record<string, string>) {
    const rows: Json[] = [];
    const seen = new Set<string>();
    let offset = 0;
    let limit: number | null = null;
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      const query = new URLSearchParams(filters);
      // Let the provider choose its supported default page size for the first request.
      if (offset > 0) {
        query.set('offset', String(offset));
        if (limit) query.set('limit', String(limit));
      }
      let result: Json;
      try {
        result = await this.request(`${path}?${query}`);
      } catch (error) {
        // Some searches reject an explicit page size even though offset is supported.
        if (
          !(error instanceof ProviderError) ||
          error.providerStatus !== 400 ||
          error.reason !== 'pagination' ||
          !query.has('limit')
        )
          throw error;
        query.delete('limit');
        result = await this.request(`${path}?${query}`);
      }
      if (!Array.isArray(result.results))
        throw new BillingError(
          'O Mercado Pago retornou uma lista de cobranças inválida.',
          502,
          'provider_invalid_page',
        );
      const page = result.results as Json[];
      if (page.some((row) => !row || typeof row !== 'object' || Array.isArray(row)))
        throw new BillingError(
          'O Mercado Pago retornou uma lista de cobranças inválida.',
          502,
          'provider_invalid_page',
        );
      const paging = result.paging as Json | undefined;
      if (paging?.offset !== undefined && Number(paging.offset) !== offset)
        throw new BillingError(
          'A lista de cobranças não avançou. Tente conferir novamente.',
          502,
          'provider_pagination_stalled',
        );
      const total = paging?.total === undefined ? null : Number(paging.total);
      if (total !== null && (!Number.isSafeInteger(total) || total < 0))
        throw new BillingError(
          'Não foi possível conferir a paginação das cobranças.',
          502,
          'provider_invalid_page',
        );
      // The search index can report an old total while returning no invoices yet.
      // Stored payments are reconciled separately; an empty page grants no access.
      if (!page.length) return rows;
      let fresh = 0;
      for (const row of page) {
        let id: string;
        try {
          id = resourceId(row.id);
        } catch {
          throw new BillingError(
            'O Mercado Pago retornou um resultado de busca inválido.',
            502,
            'provider_invalid_page',
          );
        }
        if (!seen.has(id)) {
          seen.add(id);
          rows.push(row);
          fresh++;
        }
      }
      if (page.length && !fresh)
        throw new BillingError(
          'A lista de cobranças não avançou. Tente conferir novamente.',
          502,
          'provider_pagination_stalled',
        );
      const nextOffset = offset + page.length;
      if (total !== null && nextOffset >= total) return rows;
      const reported = Number(paging?.limit);
      limit = Number.isSafeInteger(reported) && reported > 0 && reported <= 1000 ? reported : null;
      if (total === null && (!limit || page.length < limit)) return rows;
      if (rows.length >= 1000) break;
      offset = nextOffset;
    }
    throw new BillingError(
      'Este histórico precisa de uma conferência pelo suporte.',
      409,
      'provider_history_limit',
    );
  }
  async searchSubscription(reference: string, payerEmail: string) {
    const rows = await this.search('/preapproval/search', { payer_email: payerEmail });
    const exact = rows.filter((row) => row.external_reference === reference);
    if (exact.length > 1)
      throw new BillingError(
        'Mais de uma assinatura foi encontrada para este pedido. Consulte o suporte.',
        409,
      );
    return exact[0] ? this.subscription(resourceId(exact[0].id)) : null;
  }
  invoices(contractId: string) {
    return this.search('/authorized_payments/search', { preapproval_id: resourceId(contractId) });
  }
  async invoiceForPayment(id: string) {
    const rows = await this.search('/authorized_payments/search', { payment_id: resourceId(id) });
    return rows.find((row) => String((row.payment as Json | undefined)?.id) === id) ?? null;
  }
}
export function verifiedSubscription(
  remote: Json,
  contract: BillingContract,
  config: GatewayConfig,
  cancellation = false,
) {
  const recurring = remote.auto_recurring as Json | undefined;
  const mismatch = (message: string, field: string): never => {
    throw new BillingError(message, 409, `subscription_${field}_mismatch`);
  };
  if (remote.external_reference !== contract.id)
    mismatch('A referência da assinatura não corresponde à contratação.', 'reference');
  if (String(remote.collector_id) !== config.collectorId)
    mismatch(
      'A conta recebedora diverge. O suporte deve conferir MERCADO_PAGO_COLLECTOR_ID: use o User ID do vendedor, e não o Client ID.',
      'collector',
    );
  if (config.applicationId && String(remote.application_id) !== config.applicationId)
    mismatch(
      'A aplicação do Mercado Pago diverge da configuração do servidor. Consulte o suporte.',
      'application',
    );
  if (!cancellation) {
    if (!recurring || typeof recurring !== 'object')
      mismatch('O Mercado Pago não informou a recorrência da assinatura.', 'schedule');
    if (recurring!.currency_id !== 'BRL')
      mismatch('A moeda da assinatura difere do plano contratado.', 'currency');
    let amount: number;
    try {
      amount = cents(recurring!.transaction_amount);
    } catch {
      mismatch('O valor da assinatura difere do plano contratado.', 'amount');
    }
    if (amount! !== contract.plan_snapshot.amount_cents)
      mismatch('O valor da assinatura difere do plano contratado.', 'amount');
    if (
      Number(recurring!.frequency) !== contract.plan_snapshot.interval_months ||
      recurring!.frequency_type !== 'months'
    )
      mismatch('O intervalo de cobrança difere do plano contratado.', 'interval');
  }
  const id = resourceId(remote.id);
  if (contract.provider_id && contract.provider_id !== id)
    mismatch('Referência de assinatura divergente.', 'id');
  if (!['pending', 'authorized', 'paused', 'cancelled'].includes(String(remote.status)))
    throw new BillingError('Situação de assinatura desconhecida.', 502);
  return {
    id,
    status: String(remote.status),
    checkout_url: !cancellation && remote.init_point ? checkoutUrl(remote.init_point) : null,
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
