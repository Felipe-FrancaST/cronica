// Local browser-test API. It never connects to Supabase or touches campaign data.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';
import { calculateMovementCost, convertDistance } from '../../src/features/vtt/movement';
import type {
  BattleMap,
  BattleMapCell,
  BattleSession,
  BattleToken,
} from '../../src/features/vtt/types';

const seed = createDemoWorkspace();
export const campaignId = seed.campaigns[0].id;
const date = '2026-10-04T12:00:00Z';
let map: BattleMap;
let session: BattleSession;
let tokens: BattleToken[];
let cells: BattleMapCell[];
let calls: Record<string, unknown>[] = [];
const playerId = seed.profiles[1].id;
function reset() {
  map = {
    id: '90000000-0000-4000-8000-000000000001',
    campaign_id: campaignId,
    battle_session_id: '90000000-0000-4000-8000-000000000002',
    name: 'Ruínas da fronteira',
    description: '',
    width: 16,
    height: 12,
    grid_size: 1,
    cell_size: 64,
    scale_per_cell: 1.5,
    scale_unit: 'm',
    diagonal_rule: 'one',
    background_image: null,
    background_offset_x: 0,
    background_offset_y: 0,
    background_scale: 1,
    grid_visible: true,
    grid_opacity: 0.28,
    created_at: date,
    updated_at: date,
  };
  session = {
    id: map.battle_session_id,
    campaign_id: campaignId,
    name: map.name,
    status: 'active',
    round: 1,
    turn_index: 0,
    active_token_id: 'hero',
    restrict_movement_to_turn: true,
    turn_started_at: date,
    created_at: date,
    updated_at: date,
  };
  const chars = seed.characters.filter((character) => character.campaign_id === campaignId);
  tokens = [
    {
      id: 'hero',
      name: 'Elara, guardiã',
      x: 2,
      y: 4,
      character_id: chars.find((c) => c.owner_id === playerId)?.id ?? chars[0].id,
      controlled_by: playerId,
    },
    {
      id: 'rogue',
      name: 'Kael, batedor',
      x: 3,
      y: 7,
      character_id: chars.find((c) => c.owner_id !== playerId)?.id ?? chars[0].id,
      controlled_by: seed.profiles[2].id,
    },
    { id: 'enemy', name: 'Sentinela das ruínas', x: 11, y: 4, npc_id: seed.npcs[0].id },
    { id: 'hidden', name: 'Guardião oculto', x: 12, y: 7, npc_id: seed.npcs[0].id, visible: false },
  ].map((values) => ({
    campaign_id: campaignId,
    map_id: map.id,
    character_id: null,
    npc_id: null,
    image: null,
    z: 0,
    size: 1,
    movement_speed: 9,
    movement_remaining: 9,
    movement_unit: 'm',
    controlled_by: null,
    visible: true,
    version: 0,
    created_at: date,
    updated_at: date,
    ...values,
  })) as BattleToken[];
  cells = [];
  function cell(x: number, y: number, type: string, cost: number, blocked: boolean) {
    cells.push({
      id: randomUUID(),
      map_id: map.id,
      x,
      y,
      z: 0,
      terrain_type: type,
      movement_cost: cost,
      blocked,
      metadata: {},
      created_at: date,
      updated_at: date,
    });
  }
  for (let y = 2; y <= 9; y++) if (y !== 5 && y !== 6) cell(7, y, 'blocked', 1, true);
  for (let x = 7; x <= 12; x++) cell(x, 2, 'blocked', 1, true);
  for (let x = 9; x <= 12; x++) cell(x, 9, 'blocked', 1, true);
  for (let x = 4; x <= 5; x++) for (let y = 7; y <= 9; y++) cell(x, y, 'water', 2, false);
  for (let x = 9; x <= 11; x++) cell(x, 6, 'difficult', 2, false);
  calls = [];
}
reset();

function actor(auth: string | undefined) {
  try {
    return JSON.parse(Buffer.from(auth?.split('.')[1] ?? '', 'base64url').toString()).sub as string;
  } catch {
    return DEMO_USER_ID;
  }
}
function user(id: string) {
  const profile = seed.profiles.find((p) => p.id === id)!;
  return {
    id,
    email: profile.email,
    aud: 'authenticated',
    role: 'authenticated',
    created_at: date,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: profile.name },
  };
}
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1:54329');
  const send = (data: unknown, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  if (url.pathname === '/health') {
    send({ ready: true });
    return;
  }
  if (url.pathname === '/__fixture/reset') {
    reset();
    send({ map, session, tokens });
    return;
  }
  if (url.pathname === '/__fixture/state') {
    send({ map, session, tokens, cells, calls });
    return;
  }
  let body: Record<string, unknown> = {};
  if (req.method !== 'GET') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    try {
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    } catch {}
  }
  if (url.pathname === '/__fixture/scenario') {
    if (body.status) session.status = body.status as BattleSession['status'];
    if (body.active) session.active_token_id = String(body.active);
    if (body.speed !== undefined) tokens[0].movement_remaining = Number(body.speed);
    if (body.background) map.background_image = String(body.background);
    if (body.largeTerrain) {
      map.width = 50;
      map.height = 40;
      for (let y = 15; y < 36; y++)
        for (let x = 0; x < 50; x++)
          cells.push({
            id: randomUUID(),
            map_id: map.id,
            x,
            y,
            z: 0,
            terrain_type: 'difficult',
            movement_cost: 2,
            blocked: false,
            metadata: {},
            created_at: date,
            updated_at: date,
          });
    }
    send({ ok: true });
    return;
  }
  const id = actor(req.headers.authorization);
  if (url.pathname === '/auth/v1/user') {
    send(user(id));
    return;
  }
  if (url.pathname === '/auth/v1/logout') {
    send({});
    return;
  }
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const rpc = url.pathname.split('/').pop()!;
    calls.push({ rpc, ...body });
    if (rpc === 'move_battle_token') {
      const token = tokens.find((t) => t.id === body.p_token_id)!;
      const result = calculateMovementCost({
        from: token,
        to: { x: Number(body.p_to_x), y: Number(body.p_to_y) },
        width: map.width,
        height: map.height,
        cells,
        tokens,
        movingTokenId: token.id,
        rules: { diagonalRule: map.diagonal_rule },
      });
      token.x = Number(body.p_to_x);
      token.y = Number(body.p_to_y);
      token.version++;
      if (session.status === 'active')
        token.movement_remaining = Math.max(
          0,
          token.movement_remaining -
            convertDistance(result.cost * map.scale_per_cell, map.scale_unit, token.movement_unit),
        );
      send(token);
      return;
    }
    if (rpc === 'advance_battle_turn') {
      session.active_token_id = 'rogue';
      session.turn_index++;
      send(session);
      return;
    }
    if (rpc === 'end_battle_combat') {
      session.status = 'ended';
      session.active_token_id = null;
      send(session);
      return;
    }
    send({});
    return;
  }
  const table = url.pathname.split('/').pop()!;
  const data: Record<string, unknown[]> = {
    profiles: seed.profiles,
    rpg_systems: seed.systems,
    campaigns: seed.campaigns,
    campaign_members: seed.members,
    characters: seed.characters
      .filter((c) => id === DEMO_USER_ID || c.owner_id === id)
      .map((c) => ({
        ...c,
        system_data: c.sheet,
        character_attributes: Object.entries(c.sheet.abilities).map(([ability, score]) => ({
          ability,
          score,
        })),
        character_skills: Object.entries(c.sheet.skills).map(([skill, proficiency]) => ({
          skill,
          proficiency,
        })),
        character_inventory: c.sheet.inventory.map((item) => ({ id: item.id, data: item })),
        character_spells: c.sheet.spells.map((item) => ({ id: item.id, data: item })),
      })),
    world_regions: [],
    world_cities: [],
    world_locations: [],
    world_regions_private: [],
    world_cities_private: [],
    world_locations_private: [],
    npcs: seed.npcs.map((npc) => ({ ...npc, npc_stats: [npc], npc_attacks: [], npc_spells: [] })),
    battle_maps: [map],
    battle_sessions: [session],
    battle_map_tokens: tokens.filter((t) => id === DEMO_USER_ID || t.visible),
    battle_map_cells: cells,
    battle_map_objects: [],
    battle_turn_order: tokens
      .filter((t) => id === DEMO_USER_ID || t.visible)
      .map((t, position) => ({
        id: `order-${t.id}`,
        session_id: session.id,
        token_id: t.id,
        position,
        initiative: 20 - position * 3,
        created_at: date,
      })),
  };
  if (table === 'battle_map_cells' && req.method === 'POST') {
    const index = cells.findIndex((cell) => cell.x === body.x && cell.y === body.y);
    const value = {
      id: randomUUID(),
      created_at: date,
      updated_at: date,
      ...body,
    } as unknown as BattleMapCell;
    if (index >= 0) cells[index] = value;
    else cells.push(value);
    calls.push({ paint: body });
    send([]);
    return;
  }
  if (table === 'battle_maps' && req.method === 'PATCH') {
    Object.assign(map, body);
    send([]);
    return;
  }
  let rows = data[table] ?? [];
  for (const [field, value] of url.searchParams) {
    if (value.startsWith('eq.'))
      rows = rows.filter(
        (row) => String((row as Record<string, unknown>)[field]) === value.slice(3),
      );
  }
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? 1000);
  send(rows.slice(offset, offset + limit));
});
server.listen(54329, '127.0.0.1', () => console.log('Local VTT fixture ready on 54329'));
process.on('SIGTERM', () => server.close());
