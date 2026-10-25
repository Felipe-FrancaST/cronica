import { authenticated, apiError, json } from '@/features/billing/server';
import { BillingError } from '@/features/billing/gateway';
import { serviceSupabase } from '@/lib/supabase/admin';
import type { MapAsset } from '@/features/map-assets/types';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const expected = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin;
    if (request.headers.get('origin') !== expected)
      throw new BillingError('Inicie o envio pelo próprio site.', 403);
    if (!(request.headers.get('content-type') ?? '').startsWith('multipart/form-data'))
      throw new BillingError('Escolha as imagens do recurso.', 415);
    if (Number(request.headers.get('content-length') ?? 0) > 4 * 1024 * 1024)
      throw new BillingError('A imagem ultrapassou o limite do envio.', 413);
    const { client } = await authenticated(undefined, true);
    const form = await request.formData(),
      id = String(form.get('id') ?? '');
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))
      throw new BillingError('Recurso inválido.', 400);
    const result = await client
      .from('map_assets')
      .select('*')
      .eq('id', id)
      .eq('scope', 'system')
      .single();
    if (result.error || !result.data) throw new BillingError('Recurso indisponível.', 403);
    const row = result.data as MapAsset;
    if (row.ready) return json({ uploaded: true });
    const full = form.get('image'),
      thumb = form.get('thumbnail');
    if (
      !(full instanceof File) ||
      !(thumb instanceof File) ||
      full.size > 3 * 1024 * 1024 ||
      thumb.size > 300 * 1024 ||
      !full.size ||
      !thumb.size ||
      ![full, thumb].every((f) => ['image/webp', 'image/png', 'image/jpeg'].includes(f.type))
    )
      throw new BillingError('Imagem inválida ou muito grande.', 400);
    // Service uploads have no personal owner: published site art survives the
    // deletion of the administrator who originally contributed it.
    const service = serviceSupabase();
    for (const [path, file] of [
      [row.image_path, full],
      [row.thumbnail_path, thumb],
    ] as const) {
      const uploaded = await service.storage
        .from('map-assets')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (
        uploaded.error &&
        String((uploaded.error as { statusCode?: string }).statusCode) !== '409' &&
        !/already exists|duplicate/i.test(uploaded.error.message)
      )
        throw new BillingError('Não foi possível enviar a imagem. Tente novamente.', 503);
    }
    return json({ uploaded: true });
  } catch (error) {
    return apiError(error);
  }
}
