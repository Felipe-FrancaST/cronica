// Local browser-test API. It never connects to Supabase or touches campaign data.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';
import { calculateMovementCost, convertDistance } from '../../src/features/vtt/movement';
import { SPELL_CATALOG, spellFromCatalog } from '../../src/systems/dnd5e/spell-catalog';
import {
  spellEffect,
  weaponEffect,
  effectDice,
  previewEffect,
} from '../../src/features/vtt/effects';
import { calculate } from '../../src/systems/dnd5e';
import type {
  BattleMap,
  BattleMapCell,
  BattleSession,
  BattleToken,
  BattleActionRequest,
} from '../../src/features/vtt/types';

const seed = createDemoWorkspace();
const originalSeed = structuredClone(seed);
export const campaignId = seed.campaigns[0].id;
const date = '2026-10-04T12:00:00Z';
let map: BattleMap;
let session: BattleSession;
let tokens: BattleToken[];
let cells: BattleMapCell[];
let calls: Record<string, unknown>[] = [];
let actions: BattleActionRequest[] = [];
let uploadError = false;
const media = new Map<string, Buffer>();
const playerId = seed.profiles[1].id;
function reset() {
  Object.assign(seed, structuredClone(originalSeed));
  actions = [];
  uploadError = false;
  media.clear();
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
    faction: values.npc_id ? 'enemy' : 'ally',
    action_used: false,
    bonus_used: false,
    reaction_used: false,
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
    send({ map, session, tokens, cells, calls, actions, characters: seed.characters });
    return;
  }
  let body: Record<string, unknown> = {};
  let rawBody = Buffer.alloc(0);
  if (req.method !== 'GET') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    rawBody = Buffer.concat(chunks);
    try {
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    } catch {}
  }
  if (url.pathname === '/__fixture/scenario') {
    if (body.uploadError !== undefined) uploadError = !!body.uploadError;
    if (body.combatActions) {
      const c = seed.characters.find((c) => c.id === tokens[0].character_id)!;
      c.sheet = {
        ...c.sheet,
        class_id: 'wizard',
        level: 5,
        hp_current: 40,
        hp_max_override: 40,
        slots_used: {},
        abilities: { ...c.sheet.abilities, int: 16 },
        spells: ['bola-de-fogo', 'maos-flamejantes', 'curar-ferimentos'].map((key, i) => ({
          ...spellFromCatalog(
            SPELL_CATALOG.find((sp) => sp.id === key)!,
            `81000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
            'wizard',
          ),
          prepared: true,
          casting_mode: 'bonus',
        })),
      };
      c.sheet.inventory = [
        {
          id: '81000000-0000-4000-8000-000000000004',
          name: 'Adaga',
          category: 'weapon',
          quantity: 1,
          weight: 0.5,
          equipped: true,
          damage: '1d4 perfurante',
          notes: 'Acuidade',
        },
      ];
      tokens[2].x = 3;
      tokens[2].y = 4;
    }
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
  if (url.pathname.startsWith('/storage/v1/object/')) {
    const signing = url.pathname.startsWith('/storage/v1/object/sign/');
    const key = url.pathname.split('/campaign-media/')[1]?.split('?')[0] ?? '';
    if (signing && req.method === 'POST') {
      send({ signedURL: `/object/sign/campaign-media/${key}?token=local` });
      return;
    }
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'image/png');
      res.end(
        media.get(key) ??
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOMKPRgwAaYsIoOWgkA2j4BIfv4ZIMAAAAASUVORK5CYII=',
            'base64',
          ),
      );
      return;
    }
    if (uploadError) {
      send({ message: 'Falha simulada no upload', error: 'Storage error', statusCode: '400' }, 400);
      return;
    }
    const boundary = String(req.headers['content-type'] ?? '').match(/boundary=(.*)/)?.[1];
    const header = rawBody.indexOf(Buffer.from('filename="'));
    const start = rawBody.indexOf(Buffer.from('\r\n\r\n'), header) + 4;
    const end = boundary
      ? rawBody.indexOf(Buffer.from(`\r\n--${boundary}`), start)
      : rawBody.length;
    media.set(key, header >= 0 ? rawBody.subarray(start, end) : rawBody);
    calls.push({ upload: key, size: media.get(key)!.length });
    send({ Id: randomUUID(), Key: `campaign-media/${key}` });
    return;
  }
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
    if (rpc === 'request_battle_action') {
      const token = tokens.find((t) => t.id === body.p_token_id)!,
        c = seed.characters.find((c) => c.id === token.character_id)!;
      const p = body.p_payload as Record<string, unknown>;
      const sp = c.sheet.spells.find((s) => s.id === p.source_id),
        item = c.sheet.inventory.find((i) => i.id === p.source_id);
      let e =
        p.kind === 'spell'
          ? spellEffect(sp!)
          : item
            ? weaponEffect(item, c.sheet)
            : {
                ...spellEffect({ catalog_id: 'orientacao' }),
                shape: 'self' as const,
                origin: 'self' as const,
              };
      if (sp)
        e = {
          ...e,
          dice: effectDice(
            e,
            sp.level,
            Number(p.resource_level),
            c.sheet.level,
            calculate(c.sheet).modifiers.int,
          ),
        };
      const r = {
        id: randomUUID(),
        client_id: String(body.p_client_id),
        campaign_id: campaignId,
        session_id: session.id,
        map_id: map.id,
        token_id: token.id,
        requested_by: id,
        kind: p.kind,
        source_id: p.source_id ?? null,
        name: sp?.name ?? item?.name ?? (p.kind === 'disengage' ? 'Desengajar' : 'Disparada'),
        cost: 'action',
        resource_kind: p.resource_kind ?? 'none',
        resource_level: p.resource_level ?? 0,
        spell_level: sp?.level ?? 0,
        target: p.target ?? { x: token.x, y: token.y },
        target_ids: p.target_ids ?? [],
        definition: e,
        round: session.round,
        turn_index: session.turn_index,
        turn_started_at: session.turn_started_at,
        status: 'pending',
        resolution: {},
        created_at: new Date().toISOString(),
        resolved_at: null,
      } as BattleActionRequest;
      actions.push(r);
      send(r);
      return;
    }
    if (rpc === 'resolve_battle_action') {
      const r = actions.find((r) => r.id === body.p_request_id)!;
      if (r.status === 'pending') {
        const success = !!body.p_success,
          opts = body.p_resolution as {
            dice?: string;
            targets?: Record<string, { saved: boolean; multiplier: number }>;
          };
        const token = tokens.find((t) => t.id === r.token_id)!,
          c = seed.characters.find((c) => c.id === token.character_id)!;
        r.status = success ? 'success' : 'failure';
        r.resolved_at = new Date().toISOString();
        token.action_used = true;
        if (r.resource_kind === 'slot')
          c.sheet.slots_used[String(r.resource_level)] =
            (c.sheet.slots_used[String(r.resource_level)] ?? 0) + 1;
        if (success && r.kind === 'dash') {
          token.movement_remaining += token.movement_speed;
          token.movement_bonus = token.movement_speed;
        }
        if (success && r.kind === 'disengage') token.disengaged = true;
        if (success && ['damage', 'healing'].includes(r.definition.kind)) {
          const area = previewEffect(map, token, r.target, r.definition, tokens);
          const ids =
            r.definition.shape === 'single' || r.definition.selective
              ? r.target_ids
              : area.affected;
          const amount = Number(opts.dice) || 12;
          const affected = tokens
            .filter((t) => ids.includes(t.id))
            .map((t) => {
              const saved = opts.targets?.[t.id]?.saved;
              const value = Math.floor(
                amount *
                  (saved ? (r.definition.halfOnSave ? 0.5 : 0) : 1) *
                  (opts.targets?.[t.id]?.multiplier ?? 1),
              );
              const ch = seed.characters.find((c) => c.id === t.character_id),
                n = seed.npcs.find((n) => n.id === t.npc_id);
              if (ch)
                ch.sheet.hp_current =
                  r.definition.kind === 'healing'
                    ? Math.min(calculate(ch.sheet).hpMax, ch.sheet.hp_current + value)
                    : Math.max(0, ch.sheet.hp_current - value);
              if (n)
                n.hp_current =
                  r.definition.kind === 'healing'
                    ? Math.min(n.hp_max, n.hp_current + value)
                    : Math.max(0, n.hp_current - value);
              return {
                token_id: t.id,
                name: t.name,
                amount: value,
                kind: r.definition.kind,
                saved: !!saved,
              };
            });
          r.resolution = {
            roll: amount,
            affected,
            count: affected.length,
            resources_consumed: true,
          };
        }
      }
      send(r);
      return;
    }
    if (rpc === 'cancel_battle_action') {
      const r = actions.find((r) => r.id === body.p_request_id);
      if (r) r.status = 'cancelled';
      send(null);
      return;
    }
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
    battle_action_requests: actions.filter((r) => id === DEMO_USER_ID || r.requested_by === id),
    battle_spell_effects: [],
    battle_movement_plans: [],
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
    if (value.startsWith('neq.'))
      rows = rows.filter(
        (row) => String((row as Record<string, unknown>)[field]) !== value.slice(4),
      );
  }
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? 1000);
  send(rows.slice(offset, offset + limit));
});
server.listen(54329, '127.0.0.1', () => console.log('Local VTT fixture ready on 54329'));
process.on('SIGTERM', () => server.close());
