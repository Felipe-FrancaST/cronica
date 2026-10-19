import { z } from 'zod';
import {
  apiError,
  authenticated,
  billingEngine,
  json,
  readJson,
  uuid,
} from '@/features/billing/server';
import { BillingError } from '@/features/billing/gateway';
export const runtime = 'nodejs';
export const maxDuration = 60;
const input = z.object({ contractId: uuid, force: z.boolean().optional().default(false) }).strict();
export async function POST(request: Request) {
  try {
    const { user } = await authenticated(request);
    const { contractId, force } = input.parse(await readJson(request));
    const engine = billingEngine();
    const contract = await engine.pix.owned(user.id, contractId);
    if (
      !(await engine.db.rpc<boolean>('billing_claim_sync', { p_user_id: user.id, p_force: force }))
    )
      throw new BillingError(
        'Uma conferência já está em andamento. Aguarde alguns instantes.',
        409,
        'sync_busy',
      );
    try {
      return json(await engine.pix.details(contract));
    } finally {
      await engine.db.rpc('billing_release_sync', { p_user_id: user.id, p_success: false });
    }
  } catch (error) {
    return apiError(error);
  }
}
