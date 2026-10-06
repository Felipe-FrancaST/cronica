import { getSupabase } from '@/lib/supabase/client';
import { muralPayload, sortMuralItems, type MuralItem } from './types';
const key = (campaignId: string) => `cronica:mural:v1:${campaignId}`;
export const muralStorageKey = key;
function stored(campaignId: string): MuralItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(campaignId)) || '[]');
    return Array.isArray(value) ? value.filter((item) => item?.campaign_id === campaignId) : [];
  } catch {
    return [];
  }
}
function persist(campaignId: string, items: MuralItem[]) {
  try {
    localStorage.setItem(key(campaignId), JSON.stringify(items));
  } catch {
    throw new Error('O armazenamento da demonstração está cheio. Use uma imagem menor.');
  }
  window.dispatchEvent(new CustomEvent('cronica:mural-change', { detail: campaignId }));
}
function fail(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (['42P01', 'PGRST202', 'PGRST205'].includes(error.code ?? ''))
    throw new Error('Aplique a migração 015 no Supabase para habilitar o Mural.');
  throw new Error(error.message);
}
export async function loadMural(campaignId: string, demo: boolean, master: boolean) {
  if (demo)
    return sortMuralItems(stored(campaignId).filter((item) => master || item.visible_to_players));
  const { data, error } = await getSupabase()
    .from('campaign_mural_items')
    .select(
      'id,campaign_id,kind,title,description,image_path,source_location_id,source_npc_id,visible_to_players,pinned,sort_order,created_at,updated_at',
    )
    .eq('campaign_id', campaignId)
    .order('pinned', { ascending: false })
    .order('sort_order')
    .order('id')
    .limit(300);
  fail(error);
  return sortMuralItems((data ?? []) as MuralItem[]);
}
export async function saveMural(item: MuralItem, expected: string | null, demo: boolean) {
  const payload = muralPayload(item, demo);
  if (demo) {
    const items = stored(item.campaign_id),
      previous = items.find((i) => i.id === item.id);
    if ((previous && previous.updated_at !== expected) || (!previous && expected))
      throw new Error('Este cartão mudou. Feche e reabra o editor.');
    if (!previous && items.length >= 300) throw new Error('Limite de 300 cartões neste mural.');
    const stamp = new Date(
      Math.max(Date.now(), Date.parse(previous?.updated_at ?? '') + 1 || 0),
    ).toISOString();
    const result = {
      ...payload,
      sort_order: previous
        ? payload.sort_order
        : Math.max(-1, ...items.map((i) => i.sort_order)) + 1,
      created_at: previous?.created_at ?? stamp,
      updated_at: stamp,
    };
    persist(item.campaign_id, [...items.filter((i) => i.id !== item.id), result]);
    return result;
  }
  const { data, error } = await getSupabase().rpc('save_campaign_mural_item', {
    p_payload: payload,
    p_expected_updated_at: expected,
  });
  fail(error);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.id) throw new Error('Não foi possível confirmar o cartão salvo.');
  return result as MuralItem;
}
export async function deleteMural(item: MuralItem, demo: boolean) {
  if (demo) {
    const items = stored(item.campaign_id),
      current = items.find((i) => i.id === item.id);
    if (!current || current.updated_at !== item.updated_at)
      throw new Error('Este cartão mudou. Atualize o mural.');
    persist(
      item.campaign_id,
      items.filter((i) => i.id !== item.id),
    );
    return;
  }
  const { error } = await getSupabase().rpc('delete_campaign_mural_item', {
    p_item_id: item.id,
    p_expected_updated_at: item.updated_at,
  });
  fail(error);
}
export async function reorderMural(campaignId: string, ids: string[], demo: boolean) {
  if (demo) {
    const items = stored(campaignId);
    if (
      ids.length !== items.length ||
      new Set(ids).size !== items.length ||
      items.some((i) => !ids.includes(i.id))
    )
      throw new Error('O mural mudou. Atualize os cartões.');
    persist(
      campaignId,
      items.map((i) => ({
        ...i,
        sort_order: ids.indexOf(i.id),
        updated_at: new Date(Math.max(Date.now(), Date.parse(i.updated_at) + 1)).toISOString(),
      })),
    );
    return;
  }
  const { error } = await getSupabase().rpc('reorder_campaign_mural', {
    p_campaign_id: campaignId,
    p_item_ids: ids,
  });
  fail(error);
}
