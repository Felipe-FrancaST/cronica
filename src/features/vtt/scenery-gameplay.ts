import { getSupabase } from '@/lib/supabase/client';
import type { ItemDefinition } from '@/features/items/types';
import type { BattleMapObject, BattleToken } from './types';
import { sceneryRect } from './scenery';

export const CONTAINER_KINDS = ['chest', 'supplycrate', 'sarcophagus'];
export const PASSAGE_KINDS = ['door', 'portcullis', 'cage', 'secretwall'];
export const configurableScenery = (kind: string) =>
  [...CONTAINER_KINDS, ...PASSAGE_KINDS].includes(kind);
export function withinSceneryReach(o: BattleMapObject, t: BattleToken) {
  const r = sceneryRect(o);
  if (!r || o.map_id !== t.map_id) return false;
  return (
    Math.max(
      Math.max(0, r.x - (t.x + t.size - 1), t.x - (r.x + r.width - 1)),
      Math.max(0, r.y - (t.y + t.size - 1), t.y - (r.y + r.height - 1)),
    ) <= 1
  );
}
export interface ScenerySetup {
  requires_key: boolean;
  locked: boolean;
  key_name: string;
  loot_item_id: string | null;
  loot_version?: number | null;
  quantity: number;
  refill: boolean;
  key_item_id?: string | null;
  taken?: boolean;
}
export interface SceneryContents {
  object: BattleMapObject;
  opened: boolean;
  locked: boolean;
  taken: boolean;
  message?: string;
  loot: null | {
    item_id: string;
    version: number;
    name: string;
    data: ItemDefinition;
    quantity: number;
  };
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(name, args);
  if (error?.code === 'PGRST202')
    throw new Error(
      'Aplique a migração 026 no Supabase para usar fechaduras, chaves e recompensas.',
    );
  if (error) throw new Error(error.message);
  return data as T;
}
export async function loadScenerySetup(object: BattleMapObject): Promise<ScenerySetup> {
  const initial: ScenerySetup = {
    requires_key: false,
    locked: false,
    key_name: 'Chave de ' + (String(object.metadata.name || '') || 'aventura'),
    loot_item_id: null,
    quantity: 1,
    refill: false,
  };
  if (!object.updated_at) return initial;
  const { data, error } = await getSupabase()
    .from('scenery_interaction_settings')
    .select('*')
    .eq('object_id', object.id)
    .limit(1);
  if (error)
    throw new Error(
      error.code === '42P01' || error.code === 'PGRST205'
        ? 'Aplique a migração 026 no Supabase para configurar este elemento.'
        : error.message,
    );
  const row = data?.[0];
  if (!row) return initial;
  let key_name = initial.key_name;
  if (row.key_item_id) {
    const key = await getSupabase()
      .from('campaign_items')
      .select('name')
      .eq('id', row.key_item_id)
      .limit(1);
    if (key.error) throw new Error(key.error.message);
    key_name = key.data?.[0]?.name ?? key_name;
  }
  return { ...initial, ...row, loot_version: row.loot_version, key_name, refill: false };
}
export const saveSceneryElement = (object: BattleMapObject, settings: ScenerySetup) =>
  rpc<{
    object: BattleMapObject;
    key_item_id: string | null;
    key_name: string | null;
    message: string;
  }>('save_scenery_element', {
    p_object: {
      id: object.id,
      map_id: object.map_id,
      object_type: object.object_type,
      geometry: object.geometry,
      z: object.z,
      visible: object.visible,
      blocks_movement: object.blocks_movement,
      blocks_vision: object.blocks_vision,
      metadata: object.metadata,
    },
    p_settings: settings,
    p_expected_updated_at: object.updated_at || null,
  });
export const getSceneryContents = (objectId: string) =>
  rpc<SceneryContents>('get_scenery_contents', { p_object_id: objectId });
export const playerSceneryInteraction = (
  object: BattleMapObject,
  tokenId: string,
  intent: 'open' | 'close' | 'take',
  keyInventoryId: string | null,
  requestId: string,
) =>
  rpc<SceneryContents>('interact_scenery', {
    p_object_id: object.id,
    p_token_id: tokenId,
    p_intent: intent,
    p_key_inventory_id: keyInventoryId,
    p_expected_updated_at: object.updated_at,
    p_request_id: requestId,
  });
