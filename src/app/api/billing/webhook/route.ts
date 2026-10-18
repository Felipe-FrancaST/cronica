import { after } from 'next/server';
import { apiError, billingEngine, json, readJson } from '@/features/billing/server';
import { verifyWebhook } from '@/features/billing/gateway';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const input = await readJson(request);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return json({ error: 'Notificação inválida.' }, 400);
    const event = verifyWebhook(
      request,
      input as Record<string, unknown>,
      process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? '',
    );
    const engine = billingEngine();
    const id = await engine.db.rpc<string | null>('billing_enqueue_webhook', {
      p_fingerprint: event.fingerprint,
      p_topic: event.topic,
      p_resource_id: event.id,
    });
    if (id)
      after(async () => {
        try {
          await engine.processQueue(3);
        } catch {
          /* The durable queue is retried by cron. */
        }
      });
    return json({ received: true });
  } catch (error) {
    return apiError(error);
  }
}
