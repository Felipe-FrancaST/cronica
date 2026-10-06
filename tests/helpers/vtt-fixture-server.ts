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
  EMPTY_EFFECT,
} from '../../src/features/vtt/effects';
import { sceneryMovementCells } from '../../src/features/vtt/scenery';
import { areaHidden } from '../../src/features/vtt/fog';
import { sceneryRect } from '../../src/features/vtt/scenery';
import { calculate } from '../../src/systems/dnd5e';
import { parseDiceExpression, type DiceRoll, type RollMode } from '../../src/features/vtt/dice';
import type {
  BattleMap,
  BattleMapCell,
  BattleFogCell,
  BattleMapObject,
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
let rolls: DiceRoll[] = [];
let objects: BattleMapObject[] = [];
let fog: BattleFogCell[] = [];
let extraMaps: BattleMap[] = [];
let extraSessions: BattleSession[] = [];
function sessionForMap(mapId: unknown) {
  const currentMap = [map, ...extraMaps].find((m) => m.id === mapId);
  return [session, ...extraSessions].find((s) => s.id === currentMap?.battle_session_id);
}
const approvals = new Map<string, Record<string, unknown>>();
let reads: { table: string; offset: number }[] = [];
let uploadError = false;
const media = new Map<string, Buffer>();
const playerId = seed.profiles[1].id;
function reset() {
  Object.assign(seed, structuredClone(originalSeed));
  actions = [];
  objects = [];
  fog = [];
  extraMaps = [];
  extraSessions = [];
  approvals.clear();
  rolls = [];
  reads = [];
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
// Deterministic API double for UI flows. Real randomness, locks, permissions and
// transactional consumption are exercised against PostgreSQL in battle-actions.test.ts.
function recordRoll(id: string, input: Record<string, unknown>) {
  const previous = rolls.find((r) => r.rolled_by === id && r.client_id === input.p_client_id);
  if (previous) return previous;
  const { expression, terms } = parseDiceExpression(String(input.p_expression));
  const mode = (input.p_mode ?? 'normal') as RollMode;
  const evaluated = terms.map((t) => {
    const values = t.sides
      ? Array.from({ length: mode !== 'normal' && t.sides === 20 ? 2 : t.count }, (_, i) =>
          mode !== 'normal' && t.sides === 20 ? (i ? 5 : 17) : Math.ceil(t.sides! / 2),
        )
      : [];
    const kept = mode !== 'normal' && t.sides === 20 ? (mode === 'advantage' ? 0 : 1) : undefined;
    return {
      ...t,
      values,
      subtotal:
        t.sign *
        (t.sides
          ? kept === undefined
            ? values.reduce((a, b) => a + b, 0)
            : values[kept]
          : t.count),
      ...(kept === undefined ? {} : { kept }),
    };
  });
  const result: DiceRoll = {
    id: randomUUID(),
    campaign_id: campaignId,
    map_id: map.id,
    rolled_by: id,
    client_id: String(input.p_client_id),
    expression,
    label: String(input.p_label ?? ''),
    mode,
    visibility:
      input.p_request_id || input.p_effect_id
        ? input.p_visibility === 'public'
          ? 'public'
          : 'gm'
        : ((input.p_visibility ?? 'public') as DiceRoll['visibility']),
    terms: evaluated,
    total: evaluated.reduce((n, t) => n + t.subtotal, 0),
    request_id: input.p_request_id ? String(input.p_request_id) : null,
    effect_id: input.p_effect_id ? String(input.p_effect_id) : null,
    effect_pulse: null,
    consumed_at: null,
    created_at: new Date().toISOString(),
  };
  rolls.push(result);
  return result;
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
    send({
      map,
      session,
      tokens,
      cells,
      objects,
      fog,
      extraMaps,
      extraSessions,
      calls,
      reads,
      actions,
      rolls,
      characters: seed.characters,
      npcs: seed.npcs,
    });
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
    if (body.extraMaps) extraMaps = body.extraMaps as BattleMap[];
    if (body.extraSessions) extraSessions = body.extraSessions as BattleSession[];
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
    if (body.objects) {
      objects = body.objects as BattleMapObject[];
      map.updated_at = new Date().toISOString();
    }
    if (body.portalMaps) {
      const next = { ...map, id: '90000000-0000-4000-8000-000000000003', name: 'Caverna dos ecos' };
      extraMaps = [next];
      objects = [
        {
          id: 'portal-a',
          map_id: map.id,
          object_type: 'portal',
          geometry: { x: 2, y: 4, width: 1, height: 1, rotation: 0 },
          z: 0,
          visible: true,
          blocks_movement: false,
          blocks_vision: false,
          metadata: { movement_cost: 1, portal_code: 'ECOS-01' },
          created_at: date,
          updated_at: date,
        },
        {
          id: 'portal-b',
          map_id: next.id,
          object_type: 'portal',
          geometry: { x: 4, y: 4, width: 1, height: 1, rotation: 0 },
          z: 0,
          visible: true,
          blocks_movement: false,
          blocks_vision: false,
          metadata: { movement_cost: 1, portal_code: 'ECOS-01' },
          created_at: date,
          updated_at: date,
        },
      ];
      map.updated_at = new Date().toISOString();
    }
    if (body.waitingHero)
      actions.push({
        id: randomUUID(),
        campaign_id: campaignId,
        session_id: session.id,
        map_id: map.id,
        token_id: 'hero',
        requested_by: playerId,
        client_id: randomUUID(),
        kind: 'dash',
        source_id: null,
        name: 'Disparada',
        cost: 'action',
        resource_kind: 'none',
        resource_level: 0,
        spell_level: 0,
        target: { x: 2, y: 4 },
        target_ids: [],
        definition: { ...EMPTY_EFFECT },
        round: session.round,
        turn_index: session.turn_index,
        turn_started_at: session.turn_started_at,
        status: 'pending',
        resolution: {},
        created_at: date,
        resolved_at: null,
      });
    if (body.status) session.status = body.status as BattleSession['status'];
    if (body.active) session.active_token_id = String(body.active);
    if (body.speed !== undefined) tokens[0].movement_remaining = Number(body.speed);
    if (body.heroHP !== undefined)
      seed.characters.find((c) => c.id === tokens[0].character_id)!.sheet.hp_current = Number(
        body.heroHP,
      );
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
    if (rpc === 'set_battle_fog') {
      if (
        id !== DEMO_USER_ID ||
        (body.p_hidden && sessionForMap(body.p_map_id)?.status === 'active')
      ) {
        send({ message: 'Encerre o combate antes de editar o grid.' }, 400);
        return;
      }
      const m = [map, ...extraMaps].find((m) => m.id === body.p_map_id)!;
      for (
        let y = Number(body.p_y);
        y < Math.min(m.height, Number(body.p_y) + Number(body.p_height));
        y++
      )
        for (
          let x = Number(body.p_x);
          x < Math.min(m.width, Number(body.p_x) + Number(body.p_width));
          x++
        ) {
          if (body.p_hidden) {
            if (!fog.some((f) => f.map_id === m.id && f.x === x && f.y === y))
              fog.push({ id: randomUUID(), map_id: m.id, x, y });
          } else fog = fog.filter((f) => f.map_id !== m.id || f.x !== x || f.y !== y);
        }
      m.updated_at = new Date().toISOString();
      send(null);
      return;
    }
    if (rpc === 'use_battle_portal') {
      const t = tokens.find((t) => t.id === body.p_token_id)!;
      const entry = objects.find((o) => o.id === body.p_portal_id)!;
      const exit = objects.find(
        (o) =>
          o.object_type === 'portal' &&
          o.id !== entry.id &&
          o.metadata.portal_code === entry.metadata.portal_code,
      )!;
      const r = sceneryRect(exit)!;
      if (
        !exit ||
        t.version !== body.p_expected_version ||
        (id !== DEMO_USER_ID && t.controlled_by !== id)
      ) {
        send({ message: 'Travessia inválida.' }, 400);
        return;
      }
      t.map_id = exit.map_id;
      t.x = r.x;
      t.y = r.y;
      t.version++;
      send(t);
      return;
    }
    if (rpc === 'roll_battle_dice') {
      try {
        send(recordRoll(id, body));
      } catch (e) {
        send({ code: '22023', message: (e as Error).message }, 400);
      }
      return;
    }
    if (rpc === 'save_npc') {
      const p = body.p_payload as Record<string, unknown>;
      const npc = seed.npcs.find((n) => n.id === p.id)!;
      if (p.expected_updated_at && p.expected_updated_at !== npc.updated_at) {
        send({ code: '40001', message: 'A ficha mudou. Reabra para editar a versão atual.' }, 409);
        return;
      }
      const { expected_updated_at, ...values } = p;
      Object.assign(npc, values, { updated_at: new Date().toISOString() });
      for (const t of tokens.filter((t) => t.npc_id === npc.id)) {
        t.name = npc.name;
        t.image = npc.image_path;
        t.faction =
          npc.relationship === 'Aliada'
            ? 'ally'
            : npc.relationship === 'Hostil'
              ? 'enemy'
              : 'neutral';
      }
      send(npc.id);
      return;
    }
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
    if (
      ['resolve_battle_action', 'approve_battle_action', 'roll_approved_battle_action'].includes(
        rpc,
      )
    ) {
      const r = actions.find((r) => r.id === body.p_request_id)!;
      const playerRoll = rpc === 'roll_approved_battle_action';
      if ((r.status === 'pending' && !playerRoll) || (r.status === 'approved' && playerRoll)) {
        const success = playerRoll || !!body.p_success,
          opts = (playerRoll ? approvals.get(r.id) : body.p_resolution) as {
            dice?: string;
            roll_id?: string;
            targets?: Record<string, { saved: boolean; multiplier: number }>;
          };
        const token = tokens.find((t) => t.id === r.token_id)!,
          c = seed.characters.find((c) => c.id === token.character_id)!;
        r.status = success ? 'success' : 'failure';
        r.resolved_at = new Date().toISOString();
        if (!playerRoll) token.action_used = true;
        if (!playerRoll && r.resource_kind === 'slot')
          c.sheet.slots_used[String(r.resource_level)] =
            (c.sheet.slots_used[String(r.resource_level)] ?? 0) + 1;
        if (success && r.kind === 'dash') {
          token.movement_remaining += token.movement_speed;
          token.movement_bonus = token.movement_speed;
        }
        if (success && r.kind === 'disengage') token.disengaged = true;
        if (
          rpc === 'approve_battle_action' &&
          success &&
          ['damage', 'healing', 'temporary'].includes(r.definition.kind) &&
          r.definition.dice.includes('d')
        ) {
          r.status = 'approved';
          r.resolution = {
            awaiting_roll: true,
            required_dice: r.definition.dice,
            roll_kind: r.definition.kind,
            resources_consumed: true,
          };
          approvals.set(r.id, opts as Record<string, unknown>);
          send(r);
          return;
        }
        if (success && ['damage', 'healing'].includes(r.definition.kind)) {
          const area = previewEffect(map, token, r.target, r.definition, tokens);
          const ids =
            r.definition.shape === 'single' || r.definition.selective
              ? r.target_ids
              : area.affected;
          const roll = opts.roll_id
            ? rolls.find((d) => d.id === opts.roll_id)!
            : recordRoll(id, {
                p_expression: playerRoll
                  ? r.definition.dice
                  : opts.dice || r.definition.dice || '0',
                p_client_id: playerRoll ? String(body.p_client_id) : randomUUID(),
                p_visibility: playerRoll ? 'public' : 'gm',
                p_request_id: r.id,
                p_label: r.name,
              });
          const amount = Math.max(0, roll.total);
          roll.consumed_at = new Date().toISOString();
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
            awaiting_roll: false,
            roll_kind: r.definition.kind,
            roll: amount,
            affected,
            count: affected.length,
            resources_consumed: true,
            dice_roll_id: roll.id,
            dice_roll: roll,
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
      const movingMap = [map, ...extraMaps].find((m) => m.id === token.map_id)!;
      const result = calculateMovementCost({
        from: token,
        to: { x: Number(body.p_to_x), y: Number(body.p_to_y) },
        width: movingMap.width,
        height: movingMap.height,
        cells: sceneryMovementCells(
          cells.filter((c) => c.map_id === movingMap.id),
          objects.filter((o) => o.map_id === movingMap.id),
        ),
        tokens: tokens.filter((t) => t.map_id === movingMap.id),
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
    if (rpc === 'start_battle_combat') {
      const order = body.p_order as { token_id: string }[];
      session.status = 'active';
      session.active_token_id = order[0]?.token_id ?? 'hero';
      session.turn_index = 0;
      tokens.forEach((t) => {
        t.movement_remaining = t.movement_speed;
        t.action_used = false;
        t.bonus_used = false;
        t.reaction_used = false;
      });
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
    npcs: seed.npcs.map((npc) => ({
      ...npc,
      // Identity and child statistics can have different timestamps.
      npc_stats: [{ ...npc, updated_at: '2026-09-01T00:00:00Z' }],
      npc_attacks: [],
      npc_spells: [],
    })),
    battle_maps: [map, ...extraMaps],
    battle_sessions: [session, ...extraSessions],
    battle_map_tokens: tokens.filter(
      (t) =>
        id === DEMO_USER_ID ||
        t.controlled_by === id ||
        (t.visible &&
          !areaHidden(
            fog.filter((f) => f.map_id === t.map_id),
            t,
          )),
    ),
    battle_map_fog: fog,
    battle_map_cells: cells.filter(
      (c) =>
        id === DEMO_USER_ID ||
        !areaHidden(
          fog.filter((f) => f.map_id === c.map_id),
          c,
        ),
    ),
    battle_map_objects: objects.filter(
      (o) =>
        id === DEMO_USER_ID ||
        (o.visible &&
          !areaHidden(
            fog.filter((f) => f.map_id === o.map_id),
            sceneryRect(o)!,
          )),
    ),
    battle_dice_rolls: rolls
      .filter(
        (r) =>
          r.visibility === 'public' ||
          r.rolled_by === id ||
          (r.visibility === 'gm' && id === DEMO_USER_ID),
      )
      .slice()
      .reverse(),
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
  if (req.method === 'GET')
    reads.push({ table, offset: Number(url.searchParams.get('offset') ?? 0) });
  if (table === 'battle_map_objects' && req.method !== 'GET') {
    const key = url.searchParams.get('id')?.replace('eq.', '');
    const existing = objects.find((o) => o.id === key);
    if (
      id !== DEMO_USER_ID ||
      sessionForMap(body.map_id ?? existing?.map_id)?.status === 'active'
    ) {
      send({ message: 'Encerre o combate antes de editar o grid.' }, 400);
      return;
    }
    if (req.method === 'DELETE') {
      objects = objects.filter((o) => o.id !== key);
      send(null);
      return;
    }
    const object = {
      ...existing,
      ...body,
      id: existing?.id ?? randomUUID(),
      created_at: existing?.created_at ?? date,
      updated_at: new Date().toISOString(),
    } as BattleMapObject;
    if (existing) objects[objects.indexOf(existing)] = object;
    else objects.push(object);
    map.updated_at = object.updated_at;
    calls.push({ scenery: object });
    send(object);
    return;
  }
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
    const key = url.searchParams.get('id')?.replace('eq.', '');
    const currentMap = [map, ...extraMaps].find((m) => m.id === key)!;
    if (id !== DEMO_USER_ID || sessionForMap(key)?.status === 'active') {
      send({ message: 'Encerre o combate desta mesa antes de editar o grid.' }, 400);
      return;
    }
    Object.assign(currentMap, body, { updated_at: new Date().toISOString() });
    send([]);
    return;
  }
  let rows = data[table] ?? [];
  for (const [field, value] of url.searchParams) {
    if (value.startsWith('eq.'))
      rows = rows.filter(
        (row) => String((row as Record<string, unknown>)[field]) === value.slice(3),
      );
    if (value.startsWith('in.(') || value.startsWith('not.in.(')) {
      const exclude = value.startsWith('not.');
      const values = value.slice(exclude ? 8 : 4, -1).split(',');
      rows = rows.filter(
        (row) => values.includes(String((row as Record<string, unknown>)[field])) !== exclude,
      );
    }
    if (value.startsWith('neq.'))
      rows = rows.filter(
        (row) => String((row as Record<string, unknown>)[field]) !== value.slice(4),
      );
  }
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? 1000);
  send(
    String(req.headers.accept).includes('application/vnd.pgrst.object+json')
      ? (rows[0] ?? null)
      : rows.slice(offset, offset + limit),
  );
});
server.listen(54329, '127.0.0.1', () => console.log('Local VTT fixture ready on 54329'));
process.on('SIGTERM', () => server.close());
