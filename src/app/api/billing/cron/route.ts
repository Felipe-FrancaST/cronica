import { apiError, assertCron, billingEngine, json } from '@/features/billing/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    assertCron(request);
    return json(await billingEngine().reconcile(10));
  } catch (error) {
    return apiError(error);
  }
}
