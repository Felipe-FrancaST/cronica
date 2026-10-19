import type { BillingContext, BillingScope } from './types';

export const billingScopeLabel = (scope: BillingScope) =>
  scope === 'master' ? 'Mestre' : 'Jogador';
export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const billingDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'medium',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(value))
    : '—';
export const intervalLabel = (months: number) =>
  months === 1 ? 'mês' : months === 12 ? 'ano' : `${months} meses`;
export const contractStatusLabel: Record<string, string> = {
  creating: 'Preparando checkout',
  uncertain: 'Confirmação pendente',
  pending: 'Aguardando autorização',
  authorized: 'Renovação autorizada',
  paused: 'Renovação pausada',
  cancelled: 'Renovação cancelada',
  failed: 'Não concluída',
  approved: 'Aprovado',
  refunded: 'Reembolsado',
  charged_back: 'Contestado',
  rejected: 'Recusado',
  in_process: 'Em análise',
  pending_payment: 'Aguardando pagamento',
  completed: 'Pagamento confirmado',
  expired: 'Pix expirado',
};
export const paymentMethodLabel = (method?: string) => (method === 'pix' ? 'Pix' : 'Recorrente');
export const paymentStatusLabel = (status: string) =>
  (
    ({
      pending: 'Aguardando pagamento',
      cancelled: 'Cancelado',
      authorized: 'Autorizado',
    }) as Record<string, string>
  )[status] ??
  contractStatusLabel[status] ??
  status;
export function validCpf(value: string) {
  if (!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value)) return false;
  const cpf = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  return [9, 10].every((length) => {
    const sum = [...cpf.slice(0, length)].reduce(
      (n, digit, i) => n + Number(digit) * (length + 1 - i),
      0,
    );
    return Number(cpf[length]) === ((sum * 10) % 11) % 10;
  });
}
export function cents(value: unknown): number {
  const n =
    typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value)
      ? Number(value)
      : typeof value === 'number'
        ? value
        : NaN;
  const result = Math.round(n * 100);
  if (
    !Number.isSafeInteger(result) ||
    result < 0 ||
    result > 1_000_000_000 ||
    Math.abs(n * 100 - result) > 0.00001
  )
    throw new Error('Valor monetário inválido.');
  return result;
}
export function addCalendarMonths(date: string, months: number) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime()) || !Number.isInteger(months) || months < 1 || months > 12)
    throw new Error('Período de assinatura inválido.');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}
export function safeContinue(value: string | null) {
  if (
    !value ||
    !/^\/(?!\/)/.test(value) ||
    /[\\\x00-\x20]/.test(value) ||
    /^\/(?:api|auth|entrar|cadastro|assinatura|administracao)(?:\/|\?|$)/.test(value)
  )
    return '/';
  return value;
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (typeof value !== 'number' && (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export const demoBillingContext = (): BillingContext => ({
  is_admin: false,
  blocked: false,
  settings: {
    id: 1,
    site_name: 'Crônica',
    billing_enabled: false,
    require_master: true,
    require_player: false,
    maintenance: false,
    maintenance_message: 'Voltamos em breve.',
    support_email: '',
    terms_url: '',
    privacy_url: '',
    grace_days: 0,
    version: 1,
    updated_at: '2026-10-01T00:00:00Z',
  },
  plans: [],
  contracts: [],
  payments: [],
  access: {
    master: { allowed: true, reason: 'free', paid_until: null },
    player: { allowed: true, reason: 'free', paid_until: null },
  },
});
