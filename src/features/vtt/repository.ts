import { sceneryRect, SCENERY, normalizeSceneryLightRadius } from './scenery';
import { MAX_SCENERY_SIZE, normalizeSceneryHeight } from './scenery-dimensions';
import { getSupabase } from '@/lib/supabase/client';
import { uploadImage } from '@/services/storage';
import { prepareMapImage } from './map-image';
import type {
  BattleMap,
  BattleMapCell,
  BattleFogCell,
  BattleMapObject,
  BattleSession,
  BattleSnapshot,
  BattleToken,
  BattleTurnOrder,
  GridPoint,
  GridUnit,
  BattleActionRequest,
  BattleActionPayload,
  BattleSpellEffect,
  BattleMovementPlan,
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

export async function loadBattleSnapshot(
  campaignId: string,
  options: { previous?: BattleSnapshot; reloadTerrain?: boolean; adventureSessionId?: string } = {},
): Promise<BattleSnapshot> {
  const s = getSupabase();
  const scoped = (query: ReturnType<ReturnType<typeof s.from>['select']>) =>
    options.adventureSessionId
      ? query.eq('adventure_session_id', options.adventureSessionId)
      : query;
  const [sessions, maps] = await Promise.all([
    allRows<BattleSession>((from, to) =>
      scoped(s.from('battle_sessions').select('*').eq('campaign_id', campaignId))
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
    allRows<BattleMap>((from, to) =>
      scoped(s.from('battle_maps').select('*').eq('campaign_id', campaignId))
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
  ]);
  const mapIds = maps.map((map) => map.id);
  const tokens = mapIds.length
    ? await allRows<BattleToken>((from, to) =>
        s
          .from('battle_map_tokens')
          .select('*')
          .eq('campaign_id', campaignId)
          .in('map_id', mapIds)
          .order('created_at')
          .order('id')
          .range(from, to),
      )
    : [];
  const sessionIds = sessions.map((session) => session.id);
  const reuseTerrain =
    options.previous &&
    options.reloadTerrain === false &&
    maps.length === options.previous.maps.length &&
    maps.every((m) =>
      options.previous!.maps.some((old) => old.id === m.id && old.updated_at === m.updated_at),
    );
  const [cells, objects, fog, turnOrder] = await Promise.all([
    reuseTerrain
      ? options.previous!.cells
      : mapIds.length
        ? allRows<BattleMapCell>((from, to) =>
            s.from('battle_map_cells').select('*').in('map_id', mapIds).order('id').range(from, to),
          )
        : [],
    reuseTerrain
      ? options.previous!.objects
      : mapIds.length
        ? allRows<BattleMapObject>((from, to) =>
            s
              .from('battle_map_objects')
              .select('*')
              .in('map_id', mapIds)
              .order('id')
              .range(from, to),
          )
        : [],
    reuseTerrain
      ? (options.previous!.fog ?? [])
      : mapIds.length
        ? allRows<BattleFogCell>((from, to) =>
            s.from('battle_map_fog').select('*').in('map_id', mapIds).order('id').range(from, to),
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
  let actions: BattleActionRequest[] = [],
    spellEffects: BattleSpellEffect[] = [],
    actionsReady = true;
  // An empty IN () is rejected by PostgREST on campaigns without a session/map.
  const emptyResult = { data: [], error: null };
  const [pending, history, effects, plans] = await Promise.all([
    sessionIds.length ? s
      .from('battle_action_requests')
      .select('*')
      .eq('campaign_id', campaignId)
      .in('session_id', sessionIds)
      .in('status', ['pending', 'approved'])
      .order('created_at') : emptyResult,
    sessionIds.length ? s
      .from('battle_action_requests')
      .select('*')
      .eq('campaign_id', campaignId)
      .not('status', 'in', '(pending,approved)')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false })
      .limit(40) : emptyResult,
    mapIds.length ? s
      .from('battle_spell_effects')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('active', true)
      .in('map_id', mapIds)
      .order('created_at') : emptyResult,
    sessionIds.length ? s
      .from('battle_movement_plans')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .in('session_id', sessionIds)
      .order('created_at') : emptyResult,
  ]);
  const schemaError = [pending, history, effects, plans].find((r) => r.error)?.error;
  if (schemaError) {
    if (['PGRST205', '42P01'].includes(schemaError.code)) actionsReady = false;
    else fail(schemaError);
  } else {
    actions = [...(pending.data ?? []), ...(history.data ?? [])] as BattleActionRequest[];
    spellEffects = (effects.data ?? []) as BattleSpellEffect[];
  }
  return {
    sessions,
    maps,
    tokens,
    cells,
    objects,
    fog,
    turnOrder,
    actions,
    spellEffects,
    actionsReady,
    movementPlans: (plans.data ?? []) as BattleMovementPlan[],
  };
}

export async function createBattleMap(campaignId: string, payload: Record<string, unknown>) {
  const { data, error } = await getSupabase().rpc('create_battle_map', {
    p_campaign_id: campaignId,
    p_payload: payload,
  });
  fail(error);
  return data as BattleMap;
}

export async function createBattleScene(
  campaignId: string,
  payload: Record<string, unknown>,
  requestId: string,
) {
  const { medievalCityObjects } = await import('./medieval-city');
  const { data, error } = await getSupabase().rpc('create_battle_scene', {
    p_campaign_id: campaignId,
    p_payload: payload,
    p_objects: medievalCityObjects(),
    p_request_id: requestId,
  });
  if (error?.code === 'PGRST202')
    throw new Error('Execute a migração 020 no Supabase para criar a cidade medieval.');
  fail(error);
  return data as BattleMap;
}

export async function updateBattleSession(
  id: string,
  patch: Pick<
    Partial<BattleSession>,
    'restrict_movement_to_turn' | 'failed_actions_consume' | 'name'
  >,
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

export async function setBattleMapLighting(id: string, lighting: 'day' | 'night') {
  const { data, error } = await getSupabase().rpc('set_battle_map_lighting', {
    p_map_id: id,
    p_lighting: lighting,
  });
  if (error?.code === 'PGRST202')
    throw new Error('Execute a migração 022 no Supabase para salvar o período do grid.');
  fail(error);
  return data as BattleMap;
}

export async function setBattleMapVision(id: string, enabled: boolean, darkness: 'dim' | 'dark' | 'magical') {
  const { data, error } = await getSupabase().rpc('set_battle_map_vision', {
    p_map_id: id, p_enabled: enabled, p_darkness: darkness,
  });
  if (error?.code === 'PGRST202')
    throw new Error('Execute a migração 022 no Supabase para ativar as regras de visão.');
  fail(error);
  return data as BattleMap;
}

/** Applies general darkness to the selected day/night mode, independent of the clock. */
export async function setBattleMapDarkness(id: string, level: import('./types').DarknessLevel, period: 'day' | 'night') {
  const { data, error } = await getSupabase().rpc('set_battle_map_darkness', {
    p_map_id: id, p_level: level, p_period: period,
  });
  if (error?.code === 'PGRST202') throw new Error('Execute a migração 023 no Supabase para salvar a iluminação personalizada.');
  fail(error);
  return data as BattleMap;
}

export async function setBattleMapDarknessRegions(id: string, regions: import('./types').DarknessRegion[]) {
  const { data, error } = await getSupabase().rpc('set_battle_map_darkness_regions', {
    p_map_id: id, p_regions: regions,
  });
  if (error?.code === 'PGRST202') throw new Error('Execute a migração 023 no Supabase para salvar regiões de escuridão.');
  fail(error);
  return data as BattleMap;
}

export async function uploadBattleMapBackground(mapId: string, file: File) {
  return uploadImage(await prepareMapImage(file), 'battle_maps', mapId, false);
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
  patch: Pick<Partial<BattleToken>, 'visible' | 'controlled_by' | 'size' | 'faction'>,
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

export async function requestBattleAction(
  tokenId: string,
  payload: BattleActionPayload,
  clientId: string,
) {
  const { data, error } = await getSupabase().rpc('request_battle_action', {
    p_token_id: tokenId,
    p_payload: payload,
    p_client_id: clientId,
  });
  fail(error);
  return data as BattleActionRequest;
}
export async function resolveBattleAction(
  id: string,
  success: boolean,
  resolution: Record<string, unknown> = {},
) {
  const { data, error } = await getSupabase().rpc('resolve_battle_action', {
    p_request_id: id,
    p_success: success,
    p_resolution: resolution,
  });
  fail(error);
  return data as BattleActionRequest;
}
export async function cancelBattleAction(id: string) {
  const { error } = await getSupabase().rpc('cancel_battle_action', { p_request_id: id });
  fail(error);
}
export async function pulseBattleSpell(
  effect: BattleSpellEffect,
  resolution: Record<string, unknown>,
) {
  const { data, error } = await getSupabase().rpc('pulse_battle_spell', {
    p_effect_id: effect.id,
    p_resolution: resolution,
    p_expected_pulses: effect.pulses,
  });
  fail(error);
  return data as { dice_roll?: import('./dice').DiceRoll; [key: string]: unknown };
}
export async function endBattleSpell(id: string) {
  const { error } = await getSupabase().rpc('end_battle_spell', { p_effect_id: id });
  fail(error);
}
export async function cancelBattleMovement(id: string) {
  const { error } = await getSupabase().rpc('cancel_battle_movement', { p_plan_id: id });
  fail(error);
}

export async function approveBattleAction(
  id: string,
  success: boolean,
  resolution: Record<string, unknown> = {},
) {
  const { data, error } = await getSupabase().rpc('approve_battle_action', {
    p_request_id: id,
    p_success: success,
    p_resolution: resolution,
  });
  fail(error);
  return data as BattleActionRequest;
}
export async function rollApprovedBattleAction(id: string, clientId: string) {
  const { data, error } = await getSupabase().rpc('roll_approved_battle_action', {
    p_request_id: id,
    p_client_id: clientId,
  });
  fail(error);
  return data as BattleActionRequest;
}
export async function saveScenery(
  object: Omit<BattleMapObject, 'id' | 'created_at' | 'updated_at'>,
  id?: string,
) {
  if (
    SCENERY.some((s) => s.id === object.object_type) &&
    !sceneryRect({ ...object, id: id ?? '', created_at: '', updated_at: '' })
  )
    throw new Error(
      `Use posições válidas e dimensões inteiras de 1 a ${MAX_SCENERY_SIZE} células.`,
    );
  if (
    object.metadata.height_metres !== undefined &&
    normalizeSceneryHeight(object.metadata.height_metres) === undefined
  )
    throw new Error('Use uma altura de 0,01 a 300 metros ou deixe automática.');
  if (
    object.metadata.light_radius !== undefined &&
    normalizeSceneryLightRadius(object.metadata.light_radius) === undefined
  )
    throw new Error('Use um alcance de luz de 1 a 60 metros ou deixe automático.');
  const query = id
    ? getSupabase().from('battle_map_objects').update(object).eq('id', id)
    : getSupabase().from('battle_map_objects').insert(object);
  const { data, error } = await query.select('*').single();
  if (error?.message.includes('1 a 8 células'))
    throw new Error(
      'Execute a migração 020 no Supabase para usar elementos maiores que 8 células.',
    );
  fail(error);
  return data as BattleMapObject;
}
export async function deleteScenery(id: string) {
  const { error } = await getSupabase().from('battle_map_objects').delete().eq('id', id);
  fail(error);
}

export async function paintBattleTerrain(
  mapId: string,
  point: GridPoint,
  width: number,
  height: number,
  terrainType: string,
  movementCost: number,
  blocked: boolean,
) {
  const { error } = await getSupabase().rpc('paint_battle_terrain', {
    p_map_id: mapId,
    p_x: point.x,
    p_y: point.y,
    p_width: width,
    p_height: height,
    p_terrain_type: terrainType,
    p_movement_cost: movementCost,
    p_blocked: blocked,
  });
  fail(error);
}
export async function eraseBattleScenery(
  mapId: string,
  point: GridPoint,
  width: number,
  height: number,
) {
  const { data, error } = await getSupabase().rpc('erase_battle_scenery', {
    p_map_id: mapId,
    p_x: point.x,
    p_y: point.y,
    p_width: width,
    p_height: height,
  });
  fail(error);
  return Number(data);
}

export async function setBattleFog(
  mapId: string,
  point: GridPoint,
  width: number,
  height: number,
  hidden: boolean,
) {
  const r = await getSupabase().rpc('set_battle_fog', {
    p_map_id: mapId,
    p_x: point.x,
    p_y: point.y,
    p_width: width,
    p_height: height,
    p_hidden: hidden,
  });
  fail(r.error);
}
export async function useBattlePortal(token: BattleToken, portalId: string, clientId: string) {
  const r = await getSupabase().rpc('use_battle_portal', {
    p_token_id: token.id,
    p_portal_id: portalId,
    p_expected_version: token.version,
    p_client_id: clientId,
  });
  fail(r.error);
  return r.data as BattleToken;
}
