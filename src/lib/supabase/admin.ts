import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { BillingError } from '@/features/billing/gateway';

export function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key)
    throw new BillingError(
      'O serviço ainda está sendo configurado. Consulte o suporte.',
      503,
      'configuration_required',
    );
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(12_000) }),
    },
  });
}
