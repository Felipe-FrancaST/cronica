import { characterSaveHandler } from '@/features/characters/save-handler';
import { serverSupabase } from '@/lib/supabase/server';
export const runtime = 'nodejs';
export const maxDuration = 40;
export const POST = characterSaveHandler(
  (signal) => serverSupabase(signal),
  25_000,
  process.env.NEXT_PUBLIC_SITE_URL?.trim(),
);
