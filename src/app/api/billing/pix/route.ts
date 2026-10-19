import {
  apiError,
  authenticated,
  billingEngine,
  json,
  pixCheckoutInput,
  readJson,
} from '@/features/billing/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { user } = await authenticated(request);
    return json(
      await billingEngine().pix.checkout(user.id, pixCheckoutInput.parse(await readJson(request))),
    );
  } catch (error) {
    return apiError(error);
  }
}
