import {
  apiError,
  authenticated,
  billingEngine,
  checkoutInput,
  json,
  readJson,
} from '@/features/billing/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { user } = await authenticated(request);
    const input = checkoutInput.parse(await readJson(request));
    return json(await billingEngine().checkout(user.id, input));
  } catch (error) {
    return apiError(error);
  }
}
