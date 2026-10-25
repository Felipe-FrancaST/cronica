import { getSupabase } from '@/lib/supabase/client';
import type { MapAsset, MapAssetKind, MapAssetScope } from './types';
import { prepareAssetImage } from './prepare';
function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (['42P01', 'PGRST202', 'PGRST205'].includes(error.code ?? ''))
    throw new Error('Execute a migração 045 para habilitar a biblioteca de imagens.');
  throw new Error(error.message);
}
export async function listMapAssets(
  kind: MapAssetKind,
  scope: MapAssetScope | 'all',
  search: string,
  page: number,
  archived = false,
) {
  let q = getSupabase()
    .from('map_assets')
    .select('*', { count: 'exact' })
    .eq('ready', true)
    .eq('kind', kind)
    .order('search_name')
    .order('id');
  if (!archived) q = q.eq('active', true);
  if (scope !== 'all') q = q.eq('scope', scope);
  if (search.trim())
    q = q.ilike(
      'search_name',
      '%' +
        search
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .slice(0, 120)
          .replace(/[\\%_]/g, '\\$&') +
        '%',
    );
  const { data, error, count } = await q.range(page * 12, page * 12 + 11);
  fail(error);
  return { rows: (data ?? []) as MapAsset[], total: count ?? 0 };
}
export async function getMapAssets(ids: string[]) {
  if (!ids.length) return [];
  if (
    ids.length > 96 ||
    ids.some((id) => !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))
  )
    throw new Error('Referência de imagem inválida.');
  const { data, error } = await getSupabase()
    .from('map_assets')
    .select('*')
    .eq('ready', true)
    .in('id', ids);
  fail(error);
  return (data ?? []) as MapAsset[];
}
export async function assetUrls(
  rows: MapAsset[],
  thumbnail = false,
): Promise<Record<string, string>> {
  if (!rows.length) return {};
  const paths = rows.map((a) => (thumbnail ? a.thumbnail_path : a.image_path));
  const { data, error } = await getSupabase()
    .storage.from('map-assets')
    .createSignedUrls(paths, 900);
  fail(error);
  const byPath = new Map(data?.map((item) => [item.path, item.signedUrl]));
  return Object.fromEntries(
    rows.flatMap((a, i) => {
      const url = byPath.get(paths[i]);
      return url ? [[a.id, url]] : [];
    }),
  );
}
export async function uploadMapAsset(
  id: string,
  file: File,
  kind: MapAssetKind,
  scope: MapAssetScope,
  name: string,
  tags: string[],
) {
  const s = getSupabase();
  const reserved = await s.rpc('reserve_map_asset', {
    p_id: id,
    p_kind: kind,
    p_scope: scope,
    p_name: name.trim(),
    p_tags: tags,
  });
  fail(reserved.error);
  const row = reserved.data as MapAsset;
  if (row.ready) return row;
  const image = await prepareAssetImage(file, kind);
  if (scope === 'system') {
    const body = new FormData();
    body.set('id', row.id);
    body.set('image', image.full, 'image.webp');
    body.set('thumbnail', image.thumbnail, 'thumb.webp');
    const response = await fetch('/api/admin/map-assets/upload', { method: 'POST', body });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Não foi possível enviar a imagem.');
    }
  } else
    for (const [path, data] of [
      [row.image_path, image.full],
      [row.thumbnail_path, image.thumbnail],
    ] as const) {
      const result = await s.storage
        .from('map-assets')
        .upload(path, data, { contentType: data.type, upsert: false });
      if (
        result.error &&
        !['409', 'Duplicate'].includes(
          String((result.error as { statusCode?: string }).statusCode),
        ) &&
        !/already exists|duplicate/i.test(result.error.message)
      )
        throw new Error(result.error.message);
    }
  const result = await s.rpc('confirm_map_asset', { p_id: row.id });
  fail(result.error);
  return result.data as MapAsset;
}
export async function updateMapAsset(
  asset: MapAsset,
  name: string,
  tags: string[],
  active: boolean,
) {
  const { data, error } = await getSupabase().rpc('update_map_asset', {
    p_id: asset.id,
    p_name: name.trim(),
    p_tags: tags,
    p_active: active,
  });
  fail(error);
  return data as MapAsset;
}
export async function mapAssetFile(asset: MapAsset) {
  const urls = await assetUrls([asset]);
  if (!urls[asset.id]) throw new Error('A imagem não está disponível.');
  const result = await fetch(urls[asset.id], { signal: AbortSignal.timeout(20000) });
  if (!result.ok) throw new Error('Não foi possível carregar a imagem da biblioteca.');
  return new File([await result.blob()], asset.name + '.webp', { type: 'image/webp' });
}
