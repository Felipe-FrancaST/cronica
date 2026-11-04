import { z } from 'zod';
import { apiError, authenticated, json, readJson } from '@/features/billing/server';
export async function POST(request: Request) {
  try {
    const { client } = await authenticated(request, true);
    const input = z
      .object({ reason: z.string().trim().min(5).max(500) })
      .strict()
      .parse(await readJson(request));
    const result = await client.rpc('site_retry_media_cleanup', { p_reason: input.reason });
    if (result.error) throw result.error;
    return json({ retried: result.data });
  } catch (error) {
    return apiError(error);
  }
}
