import { apiError, assertCron, json } from '@/features/billing/server';
import { runMaintenance } from '@/features/media/maintenance-server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    assertCron(request);
    const result = await runMaintenance();
    const failed =
      'error' in result.billing ||
      'error' in result.media ||
      ('failed' in result.billing && result.billing.failed > 0) ||
      ('failed' in result.media && result.media.failed > 0);
    return json(result, failed ? 503 : 200);
  } catch (error) {
    return apiError(error);
  }
}
