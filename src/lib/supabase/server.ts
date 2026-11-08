import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function serverSupabase(signal?: AbortSignal) {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(signal
        ? {
            global: {
              fetch: (input: RequestInfo | URL, init?: RequestInit) =>
                fetch(input, {
                  ...init,
                  cache: 'no-store',
                  signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
                }),
            },
          }
        : {}),
      cookies: {
        getAll: () => store.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* Server Components rely on the session-refresh proxy for cookie writes. */
          }
        },
      },
    },
  );
}
