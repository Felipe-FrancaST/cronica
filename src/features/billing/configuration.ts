import { BillingError } from './gateway';

export const requiredBillingVariables = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_COLLECTOR_ID',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'CRON_SECRET',
] as const;

export function billingConfiguration(env: Record<string, string | undefined>) {
  const value = (name: string) => env[name]?.trim() ?? '';
  const missing: string[] = requiredBillingVariables.filter((name) => !value(name));
  const invalid: string[] = [];
  const identifier = /^[1-9]\d{0,19}$/;
  if (value('MERCADO_PAGO_COLLECTOR_ID') && !identifier.test(value('MERCADO_PAGO_COLLECTOR_ID')))
    invalid.push('MERCADO_PAGO_COLLECTOR_ID');
  if (
    value('MERCADO_PAGO_APPLICATION_ID') &&
    !identifier.test(value('MERCADO_PAGO_APPLICATION_ID'))
  )
    invalid.push('MERCADO_PAGO_APPLICATION_ID');
  if (!['test', 'production'].includes(value('MERCADO_PAGO_ENVIRONMENT')))
    invalid.push('MERCADO_PAGO_ENVIRONMENT');
  if (value('CRON_SECRET') && value('CRON_SECRET').length < 32) invalid.push('CRON_SECRET');
  return { missing, invalid, value };
}

export function validatedBillingConfiguration(env: Record<string, string | undefined>) {
  const config = billingConfiguration(env);
  if (config.missing.length || config.invalid.length)
    throw new BillingError(
      'Os pagamentos ainda estão sendo configurados. Entre em contato com o suporte.',
      503,
      'configuration_required',
    );
  return config.value;
}
