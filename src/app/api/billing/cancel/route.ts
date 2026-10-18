import { z } from 'zod';
import {
  apiError,
  authenticated,
  billingEngine,
  json,
  readJson,
  uuid,
} from '@/features/billing/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { user } = await authenticated(request);
    const { contractId } = z
      .object({ contractId: uuid })
      .strict()
      .parse(await readJson(request));
    return json({ contract: await billingEngine().cancel(user.id, contractId) });
  } catch (error) {
    return apiError(error);
  }
}
