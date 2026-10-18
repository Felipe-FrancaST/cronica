import 'server-only';
import { serviceSupabase } from '@/lib/supabase/admin';
import { billingConfiguration, validatedBillingConfiguration } from './configuration';
export { requiredBillingVariables } from './configuration';
import { z } from 'zod';
import { serverSupabase } from '@/lib/supabase/server';
import { BillingEngine, type BillingDatabase } from './engine';
import { BillingError, MercadoPagoGateway, secureEqual } from './gateway';
import type { BillingContract } from './types';

export const uuid = z.string().uuid();
export const scope = z.enum(['master', 'player']);
export const reason = z.string().trim().min(3, 'Informe o motivo desta alteração.').max(500);
export const checkoutInput = z
  .object({
    planId: uuid,
    scope,
    requestId: uuid,
    planVersion: z.number().int().positive(),
    payerEmail: z.string().trim().email().max(254),
    consent: z.literal(true),
  })
  .strict();
const scopes = z
  .array(scope)
  .min(1)
  .max(2)
  .refine((v) => new Set(v).size === v.length);
const settings = z.object({
  version: z.number().int().positive(),
  site_name: z.string().trim().min(1).max(80),
  billing_enabled: z.boolean(),
  require_master: z.boolean(),
  require_player: z.boolean(),
  maintenance: z.boolean(),
  maintenance_message: z.string().max(500),
  support_email: z.union([z.literal(''), z.string().email().max(254)]),
  terms_url: z.union([z.literal(''), z.string().url().startsWith('https://').max(500)]),
  privacy_url: z.union([z.literal(''), z.string().url().startsWith('https://').max(500)]),
  grace_days: z.number().int().min(0).max(14),
});
const plan = z.object({
  id: uuid.optional(),
  version: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1200),
  amount_cents: z.number().int().min(100).max(10_000_000),
  interval_months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  scopes,
  max_campaigns: z.number().int().min(1).max(10000).nullable(),
  max_players_per_campaign: z.number().int().min(1).max(10000).nullable(),
  active: z.boolean(),
  sort_order: z.number().int().min(-10000).max(10000),
});
export const mutationInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('plan'), data: plan, reason }),
  z.object({ action: z.literal('settings'), data: settings, reason }),
  z.object({
    action: z.literal('block'),
    data: z.object({ user_id: uuid, blocked: z.boolean() }),
    reason,
  }),
  z.object({
    action: z.literal('grant'),
    data: z.object({ user_id: uuid, scopes, days: z.number().int().min(1).max(365) }),
    reason,
  }),
  z.object({
    action: z.literal('revoke_grant'),
    data: z.object({ user_id: uuid, grant_id: uuid }),
    reason,
  }),
  z.object({
    action: z.literal('administrator'),
    data: z.object({ user_id: uuid, enabled: z.boolean() }),
    reason,
  }),
]);
export function siteOrigin() {
  const url = new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000');
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    !!url.search ||
    !!url.hash ||
    (url.protocol !== 'https:' &&
      !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  )
    throw new BillingError(
      'Configure o endereço HTTPS do site antes de ativar pagamentos.',
      503,
      'configuration_required',
    );
  return url.origin;
}
export function assertOrigin(request: Request) {
  if (request.headers.get('origin') !== siteOrigin())
    throw new BillingError('Esta operação deve ser iniciada pelo próprio site.', 403);
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
    throw new BillingError('Envie os dados em JSON.', 415);
}
export async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 16_384) throw new BillingError('Solicitação muito grande.', 413);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BillingError('Solicitação inválida.');
  }
}
export async function authenticated(request?: Request, admin = false) {
  if (request) assertOrigin(request);
  const client = await serverSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new BillingError('Entre na sua conta para continuar.', 401);
  if (admin) {
    const check = await client.rpc('site_is_admin');
    if (check.error || check.data !== true)
      throw new BillingError('Acesso exclusivo da administração.', 403);
  }
  return { user: data.user, client };
}
export function billingReadiness() {
  const config = billingConfiguration(process.env);
  return {
    missing: [...config.missing, ...config.invalid],
    invalid: config.invalid,
    environment: config.value('MERCADO_PAGO_ENVIRONMENT') === 'production' ? 'production' : 'test',
    site_url: process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? '',
  };
}
export function billingEngine() {
  const value = validatedBillingConfiguration(process.env);
  let baseUrl: string | undefined;
  if (process.env.NODE_ENV !== 'production' && process.env.MERCADO_PAGO_TEST_API_URL) {
    const url = new URL(process.env.MERCADO_PAGO_TEST_API_URL);
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new BillingError('Servidor local de testes inválido.', 503);
    baseUrl = url.origin;
  }
  const client = serviceSupabase();
  const database: BillingDatabase = {
    async rpc<T>(name: string, args?: Record<string, unknown>) {
      const { data, error } = await client.rpc(name, args);
      if (error)
        throw new BillingError(
          error.message,
          error.code === '42501' ? 403 : error.code === '40001' ? 409 : 400,
          error.code ?? 'database_error',
        );
      return data as T;
    },
    async contracts(userId) {
      const { data, error } = await client
        .from('billing_contracts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new BillingError('Não foi possível consultar as assinaturas.', 503);
      return data as BillingContract[];
    },
    async contract(id) {
      const { data, error } = await client
        .from('billing_contracts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new BillingError('Não foi possível consultar a assinatura.', 503);
      return data as BillingContract | null;
    },
    async byProvider(id) {
      const { data, error } = await client
        .from('billing_contracts')
        .select('*')
        .eq('provider_id', id)
        .maybeSingle();
      if (error) throw new BillingError('Não foi possível consultar a assinatura.', 503);
      return data as BillingContract | null;
    },
    async paymentIds(contractId) {
      const { data, error } = await client
        .from('billing_payments')
        .select('provider_payment_id')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw new BillingError('Não foi possível consultar os pagamentos.', 503);
      return data.map((row) => String(row.provider_payment_id));
    },
  };
  return new BillingEngine(
    database,
    new MercadoPagoGateway({
      accessToken: value('MERCADO_PAGO_ACCESS_TOKEN'),
      collectorId: value('MERCADO_PAGO_COLLECTOR_ID'),
      applicationId: value('MERCADO_PAGO_APPLICATION_ID') || undefined,
      environment: value('MERCADO_PAGO_ENVIRONMENT') as 'test' | 'production',
      baseUrl,
    }),
    siteOrigin(),
  );
}
export function assertCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (
    !secret ||
    secret.length < 32 ||
    !secureEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)
  )
    throw new BillingError('Acesso não autorizado.', 401);
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export function apiError(error: unknown) {
  if (error instanceof z.ZodError)
    return json({ error: error.issues[0]?.message ?? 'Confira os dados informados.' }, 400);
  if (error instanceof BillingError)
    return json({ error: error.message, code: error.code }, error.status);
  return json(
    { error: 'Não foi possível concluir a operação. Tente novamente em alguns instantes.' },
    503,
  );
}
