import { z } from 'zod';
import {
  apiError,
  authenticated,
  billingEngine,
  json,
  readJson,
  reason,
  uuid,
} from '@/features/billing/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { client } = await authenticated(request, true);
    const input = z
      .object({
        action: z.enum(['cancel_renewal', 'reconcile', 'retry_webhooks']),
        userId: uuid.optional(),
        contractId: uuid.optional(),
        reason,
      })
      .strict()
      .parse(await readJson(request));
    if (input.action === 'cancel_renewal' && (!input.userId || !input.contractId))
      return json({ error: 'Selecione uma assinatura.' }, 400);
    const audit = await client.rpc('site_admin_record_operation', {
      p_action: input.action,
      p_user_id: input.userId ?? null,
      p_reason: input.reason,
    });
    if (audit.error) return json({ error: audit.error.message }, 400);
    const engine = billingEngine();
    let result: unknown;
    if (input.action === 'cancel_renewal')
      result = await engine.cancel(input.userId!, input.contractId!);
    else if (input.action === 'reconcile')
      result = input.userId
        ? await engine.syncUser(input.userId, true)
        : await engine.reconcile(10);
    else {
      await engine.db.rpc('billing_retry_webhooks');
      result = await engine.processQueue(5);
    }
    return json({ result });
  } catch (error) {
    return apiError(error);
  }
}
