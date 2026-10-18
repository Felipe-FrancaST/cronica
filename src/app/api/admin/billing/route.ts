import { z } from 'zod';
import { apiError, authenticated, billingReadiness, json, uuid } from '@/features/billing/server';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const { client } = await authenticated(undefined, true);
    const params = new URL(request.url).searchParams;
    const view = z
      .enum(['overview', 'users', 'user', 'finance', 'audit'])
      .parse(params.get('view') ?? 'overview');
    const options = z
      .object({
        offset: z.coerce.number().int().min(0).max(1000000).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        query: z.string().max(254).optional(),
        user_id: uuid.optional(),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(Object.fromEntries([...params].filter(([key]) => key !== 'view')));
    const { data, error } = await client.rpc('site_admin_read', {
      p_view: view,
      p_options: options,
    });
    if (error) return json({ error: error.message }, 400);
    return json(view === 'overview' ? { ...data, configuration: billingReadiness() } : data);
  } catch (error) {
    return apiError(error);
  }
}
