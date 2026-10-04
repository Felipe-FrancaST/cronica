import { getSupabase } from '@/lib/supabase/client';
import { uploadImage } from '@/services/storage';
import type {
  BattleMap,
  BattleMapCell,
  BattleMapObject,
  BattleSession,
  BattleSnapshot,
  BattleToken,
  BattleTurnOrder,
  GridPoint,
  GridUnit,
} from './types';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// Supabase limits the number of rows returned by one request. Terrain must be
// loaded in pages, otherwise larger painted maps silently lose their obstacles.
async function allRows<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await query(from, from + pageSize - 1);
    fail(result.error);
    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function loadBattleSnapshot(campaignId: string): Promise<BattleSnapshot> {
  const s = getSupabase();
  const [sessions, maps, tokens] = await Promise.all([
    allRows<BattleSession>((from, to) =>
      s
        .from('battle_sessions')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
    allRows<BattleMap>((from, to) =>
      s
        .from('battle_maps')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
    allRows<BattleToken>((from, to) =>
      s
        .from('battle_map_tokens')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
  ]);
  const mapIds = maps.map((map) => map.id);
  const sessionIds = sessions.map((session) => session.id);
  const [cells, objects, turnOrder] = await Promise.all([
    mapIds.length
      ? allRows<BattleMapCell>((from, to) =>
          s.from('battle_map_cells').select('*').in('map_id', mapIds).order('id').range(from, to),
        )
      : [],
    mapIds.length
      ? allRows<BattleMapObject>((from, to) =>
          s.from('battle_map_objects').select('*').in('map_id', mapIds).order('id').range(from, to),
        )
      : [],
    sessionIds.length
      ? allRows<BattleTurnOrder>((from, to) =>
          s
            .from('battle_turn_order')
            .select('*')
            .in('session_id', sessionIds)
            .order('position')
            .order('id')
            .range(from, to),
        )
      : [],
  ]);
  return { sessions, maps, tokens, cells, objects, turnOrder };
}

export async function createBattleMap(campaignId: string, payload: Record<string, unknown>) {
  const { data, error } = await getSupabase().rpc('create_battle_map', {
    p_campaign_id: campaignId,
    p_payload: payload,
  });
  fail(error);
  return data as BattleMap;
}

export async function updateBattleSession(
  id: string,
  patch: Pick<Partial<BattleSession>, 'restrict_movement_to_turn' | 'name'>,
) {
  const values = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  const { error } = await getSupabase().from('battle_sessions').update(values).eq('id', id);
  fail(error);
}

export async function updateBattleMap(id: string, patch: Partial<BattleMap>) {
  const allowed = {
    name: patch.name,
    description: patch.description,
    width: patch.width,
    height: patch.height,
    cell_size: patch.cell_size,
    scale_per_cell: patch.scale_per_cell,
    scale_unit: patch.scale_unit,
    diagonal_rule: patch.diagonal_rule,
    background_image: patch.background_image,
    background_offset_x: patch.background_offset_x,
    background_offset_y: patch.background_offset_y,
    background_scale: patch.background_scale,
    grid_visible: patch.grid_visible,
    grid_opacity: patch.grid_opacity,
  };
  const values = Object.fromEntries(
    Object.entries(allowed).filter(([, value]) => value !== undefined),
  );
  const { error } = await getSupabase().from('battle_maps').update(values).eq('id', id);
  fail(error);
}

export async function uploadBattleMapBackground(mapId: string, file: File) {
  return uploadImage(file, 'battle_maps', mapId, false);
}

export async function deleteBattleMap(id: string) {
  const { error } = await getSupabase().from('battle_maps').delete().eq('id', id);
  fail(error);
}

export async function upsertBattleCell(
  mapId: string,
  point: GridPoint,
  terrainType: string,
  movementCost: number,
  blocked: boolean,
) {
  const { error } = await getSupabase()
    .from('battle_map_cells')
    .upsert(
      {
        map_id: mapId,
        x: point.x,
        y: point.y,
        z: point.z ?? 0,
        terrain_type: terrainType,
        movement_cost: movementCost,
        blocked,
        metadata: {},
      },
      { onConflict: 'map_id,x,y,z' },
    );
  fail(error);
}

export async function clearBattleCell(mapId: string, point: GridPoint) {
  const { error } = await getSupabase()
    .from('battle_map_cells')
    .delete()
    .eq('map_id', mapId)
    .eq('x', point.x)
    .eq('y', point.y)
    .eq('z', point.z ?? 0);
  fail(error);
}

export async function addCharacterToken(mapId: string, characterId: string, point: GridPoint) {
  const { data, error } = await getSupabase().rpc('add_character_to_battle_map', {
    p_map_id: mapId,
    p_character_id: characterId,
    p_x: point.x,
    p_y: point.y,
  });
  fail(error);
  return data as BattleToken;
}

export async function addNpcToken(
  mapId: string,
  npcId: string,
  speed: number,
  unit: GridUnit,
  point: GridPoint,
) {
  const { data, error } = await getSupabase().rpc('add_npc_to_battle_map', {
    p_map_id: mapId,
    p_npc_id: npcId,
    p_movement_speed: speed,
    p_movement_unit: unit,
    p_x: point.x,
    p_y: point.y,
  });
  fail(error);
  return data as BattleToken;
}

export async function updateBattleToken(
  id: string,
  patch: Pick<Partial<BattleToken>, 'visible' | 'controlled_by' | 'size'>,
) {
  const values = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  const { error } = await getSupabase().from('battle_map_tokens').update(values).eq('id', id);
  fail(error);
}

export async function removeBattleToken(id: string) {
  const { error } = await getSupabase().from('battle_map_tokens').delete().eq('id', id);
  fail(error);
}

export async function moveBattleToken(
  token: BattleToken,
  destination: GridPoint,
  path: GridPoint[],
  force = false,
) {
  const { data, error } = await getSupabase().rpc('move_battle_token', {
    p_token_id: token.id,
    p_to_x: destination.x,
    p_to_y: destination.y,
    p_path: path,
    p_expected_version: token.version,
    p_force: force,
  });
  fail(error);
  return data as BattleToken;
}

export async function startBattleCombat(
  sessionId: string,
  order: Array<{ token_id: string; initiative: number }>,
) {
  const { data, error } = await getSupabase().rpc('start_battle_combat', {
    p_session_id: sessionId,
    p_order: order,
  });
  fail(error);
  return data as BattleSession;
}

export async function advanceBattleTurn(sessionId: string) {
  const { data, error } = await getSupabase().rpc('advance_battle_turn', {
    p_session_id: sessionId,
  });
  fail(error);
  return data as BattleSession;
}

export async function endBattleCombat(sessionId: string) {
  const { data, error } = await getSupabase().rpc('end_battle_combat', {
    p_session_id: sessionId,
  });
  fail(error);
  return data as BattleSession;
}
