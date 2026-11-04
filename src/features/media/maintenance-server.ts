import 'server-only';
import { serviceSupabase } from '@/lib/supabase/admin';
import { billingEngine } from '@/features/billing/server';
import { cleanUnusedMedia, type CleanupJob } from './maintenance';

export async function runMaintenance() {
  const started = Date.now();
  const signal = AbortSignal.timeout(43_000);
  const client = serviceSupabase(signal);
  const [billing, media] = await Promise.allSettled([
    Promise.resolve().then(() => billingEngine(signal).drain(started + 40_000)),
    cleanUnusedMedia(
      {
        async lease(limit) {
          const result = await client.rpc('lease_media_cleanup', { p_limit: limit });
          if (result.error) throw result.error;
          return result.data as CleanupJob[];
        },
        async remove(bucket, name) {
          const result = await client.storage.from(bucket).remove([name]);
          if (result.error) throw result.error;
        },
        async finish(id, error) {
          const result = await client.rpc('finish_media_cleanup', {
            p_id: id,
            p_error: error ?? null,
          });
          if (result.error) throw result.error;
        },
      },
      started + 38_000,
    ),
  ]);
  const result = {
    billing:
      billing.status === 'fulfilled' ? billing.value : { error: 'billing_maintenance_unavailable' },
    media: media.status === 'fulfilled' ? media.value : { error: 'media_maintenance_unavailable' },
    duration_ms: Date.now() - started,
  };
  // Use a fresh deadline to persist the outcome even after a worker's deadline elapsed.
  const recorded = await serviceSupabase().rpc('record_maintenance_run', { p_result: result });
  if (recorded.error) throw new Error('Não foi possível registrar a manutenção.');
  return result;
}
