import { apiError, authenticated, billingEngine, json } from '@/features/billing/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { user } = await authenticated(request);
    return json(await billingEngine().syncUser(user.id));
  } catch (error) {
    return apiError(error);
  }
}
