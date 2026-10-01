import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
export const isConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const demoEnabled = () =>
  process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' || process.env.NODE_ENV === 'development';
let browserClient: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!isConfigured()) throw new Error('Configure o Supabase para acessar sua conta.');
  browserClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return browserClient;
}
