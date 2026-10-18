import { apiError, authenticated, json, mutationInput, readJson } from '@/features/billing/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const { client } = await authenticated(request, true);
    const input = mutationInput.parse(await readJson(request));
    const { data, error } = await client.rpc('site_admin_mutate', {
      p_action: input.action,
      p_data: input.data,
      p_reason: input.reason,
    });
    if (error) return json({ error: error.message }, error.code === '40001' ? 409 : 400);
    return json(data);
  } catch (error) {
    return apiError(error);
  }
}
