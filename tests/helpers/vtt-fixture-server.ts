import { demoBillingContext } from '../../src/features/billing/model';
import { combatFeatures } from '../../src/systems/dnd5e/combat-features';
import { itemUse } from '../../src/systems/dnd5e/items';
import { grantedInventoryItem, itemDefinitionErrors } from '../../src/features/items/model';
import { newItemDefinition } from '../../src/features/items/model';
import { withinSceneryReach, type ScenerySetup } from '../../src/features/vtt/scenery-gameplay';
import { emptyCurrency, hasCoins } from '../../src/systems/dnd5e/currency';
import {
  CONTAINER_KINDS,
  PASSAGE_KINDS,
  LIGHT_KINDS,
  MECHANISM_KINDS,
} from '../../src/features/vtt/scenery-capabilities';
import type { CampaignItem, ItemDelivery } from '../../src/features/items/types';
import type { WeaponOptions } from '../../src/systems/dnd5e/combat-features';
// Local browser-test API. It never connects to Supabase or touches campaign data.
import { createServer } from 'node:http';
import {
  defaultRules,
  type CampaignSession,
  type SessionEvent,
} from '../../src/features/sessions/types';
import { randomUUID } from 'node:crypto';
import { validateDocument } from '../../src/features/atlas/model';
import type { AtlasMap } from '../../src/features/atlas/types';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';
import { calculateMovementCost, convertDistance } from '../../src/features/vtt/movement';
import { SPELL_CATALOG, spellFromCatalog } from '../../src/systems/dnd5e/spell-catalog';
import {
  spellEffect,
  weaponEffect,
  characterSpellEffect,
  previewEffect,
  EMPTY_EFFECT,
} from '../../src/features/vtt/effects';
import { sceneryMovementCells } from '../../src/features/vtt/scenery';
import { areaHidden } from '../../src/features/vtt/fog';
import { sceneryRect } from '../../src/features/vtt/scenery';
import { changeSceneryState } from '../../src/features/vtt/scenery-interactions';
import { muralPayload, type MuralItem } from '../../src/features/mural/types';
import { withCharacterLevel } from '../../src/systems/dnd5e/progression';
import { rollHitPoints } from '../../src/systems/dnd5e/hit-points';
import { characterRuleErrors } from '../../src/features/sessions/character-rules';
import type { Character } from '../../src/types';
import { calculate, validate } from '../../src/systems/dnd5e';
import { parseDiceExpression, type DiceRoll, type RollMode } from '../../src/features/vtt/dice';
import type {
  BattleMap,
  BattleMapCell,
  BattleFogCell,
  BattleMapObject,
  BattleSession,
  BattleToken,
  BattleActionRequest,
  BattleDecision,
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
let decisions: BattleDecision[] = [];
let rolls: DiceRoll[] = [];
let objects: BattleMapObject[] = [];
let fog: BattleFogCell[] = [];
let extraMaps: BattleMap[] = [];
let atlasMaps: AtlasMap[] = [];
const atlasExports = new Map<string, { map: BattleMap; image_path: string }>();
const sceneRequests = new Map<string, BattleMap>();
let extraSessions: BattleSession[] = [];
let muralItems: MuralItem[] = [];
let muralRevision = 0;
const adventureId = '95000000-0000-4000-8000-000000000001';
let adventures: CampaignSession[] = [];
let journal: SessionEvent[] = [];
let campaignItems: CampaignItem[] = [];
let itemDeliveries: ItemDelivery[] = [];
const scenerySettings = new Map<string, ScenerySetup>();
const sceneryLoot = new Map<string, CampaignItem>();
const sceneryClaims = new Map<string, { objectId: string; characterId: string }>();
function sceneryContents(object: BattleMapObject, user: string) {
  const s = scenerySettings.get(object.id),
    loot = sceneryLoot.get(object.id);
  const opened = ['open', 'iron-open'].includes(String(object.metadata.variant));
  const revealed = [...CONTAINER_KINDS, ...PASSAGE_KINDS].includes(object.object_type)
    ? opened
    : object.metadata.interaction_revealed === true;
  const target = objects.find((o) => o.id === s?.linked_object_id);
  return {
    object,
    opened,
    locked: s?.locked ?? false,
    taken: s?.taken ?? false,
    can_interact: user === DEMO_USER_ID || s?.player_enabled !== false,
    description: revealed ? s?.discovery_text || null : null,
    coins: revealed && !s?.taken ? (s?.coins ?? emptyCurrency()) : null,
    changed_objects:
      target &&
      (user === DEMO_USER_ID || object.metadata.interaction_revealed === true) &&
      (user === DEMO_USER_ID || (target.visible && !areaHidden(fog, sceneryRect(target)!)))
        ? [target]
        : [],
    loot:
      revealed && loot && !s?.taken
        ? {
            item_id: loot.id,
            version: loot.version,
            name: loot.name,
            data: loot.data,
            quantity: s?.quantity ?? 1,
          }
        : null,
  };
}
function linkedSceneryChange(source: BattleMapObject) {
  const setup = scenerySettings.get(source.id);
  const target = objects.find((o) => o.id === setup?.linked_object_id);
  if (!MECHANISM_KINDS.includes(source.object_type)) return null;
  if (!target) {
    if (source.metadata.has_link === true)
      throw new Error(
        'O alvo deste mecanismo foi removido. Peça ao mestre para configurar outra ligação.',
      );
    return null;
  }
  const active = source.metadata.variant === 'activated';
  const changed = structuredClone(target);
  if (LIGHT_KINDS.includes(target.object_type)) changed.metadata.light_enabled = active;
  else {
    changed.metadata.variant = String(target.metadata.variant).startsWith('iron')
      ? active
        ? 'iron-open'
        : 'iron'
      : active
        ? 'open'
        : 'default';
    changed.blocks_movement = !active;
    changed.blocks_vision = !active && ['door', 'secretwall'].includes(target.object_type);
    const rect = sceneryRect(changed)!;
    if (
      changed.blocks_movement &&
      tokens.some(
        (t) =>
          t.map_id === changed.map_id &&
          t.x < rect.x + rect.width &&
          t.x + t.size > rect.x &&
          t.y < rect.y + rect.height &&
          t.y + t.size > rect.y,
      )
    )
      throw new Error('O objeto bloqueia um personagem. Escolha outra posição.');
    if (active) changed.metadata.interaction_locked = false;
  }
  changed.updated_at = new Date(
    Math.max(Date.now(), Date.parse(target.updated_at) + 1),
  ).toISOString();
  return changed;
}
function commitLinkedScenery(changed: BattleMapObject | null) {
  if (!changed) return;
  const setup = scenerySettings.get(changed.id);
  if (setup && changed.metadata.interaction_locked === false) setup.locked = false;
  objects[objects.findIndex((o) => o.id === changed.id)] = changed;
}
function journalEvent(
  sid: string,
  kind: string,
  title: string,
  description = '',
  image: string | null = null,
  visible = true,
) {
  if (!adventures.some((s) => s.id === sid && s.status === 'active')) return;
  journal.unshift({
    id: randomUUID(),
    campaign_id: campaignId,
    adventure_session_id: sid,
    kind,
    title,
    description,
    image_path: image,
    visibility: visible ? 'players' : 'gm',
    data: {},
    created_at: new Date().toISOString(),
  });
}
function sessionForMap(mapId: unknown) {
  const currentMap = [map, ...extraMaps].find((m) => m.id === mapId);
  return [session, ...extraSessions].find((s) => s.id === currentMap?.battle_session_id);
}
const approvals = new Map<string, Record<string, unknown>>();
let reads: { table: string; offset: number }[] = [];
const hitPointLedger = new Map<string, Record<string, number[]>>();
let uploadError = false;
const media = new Map<string, Buffer>();
const playerId = seed.profiles[1].id;
function reset() {
  atlasMaps = [];
  atlasExports.clear();
  scenerySettings.clear();
  sceneryLoot.clear();
  sceneryClaims.clear();
  campaignItems = [];
  itemDeliveries = [];
  Object.assign(seed, structuredClone(originalSeed));
  seed.rules = [defaultRules(campaignId)];
  adventures = [
    {
      id: adventureId,
      campaign_id: campaignId,
      name: 'O início',
      number: 1,
      status: 'active',
      summary: '',
      created_by: DEMO_USER_ID,
      created_at: date,
      started_at: date,
      ended_at: null,
      updated_at: date,
    },
  ];
  journal = [];
  actions = [];
  decisions = [];
  objects = [];
  fog = [];
  extraMaps = [];
  sceneRequests.clear();
  extraSessions = [];
  muralItems = [];
  muralRevision = 0;
  approvals.clear();
  rolls = [];
  reads = [];
  uploadError = false;
  media.clear();
  map = {
    id: '90000000-0000-4000-8000-000000000001',
    campaign_id: campaignId,
    adventure_session_id: adventureId,
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
    lighting: 'day',
    grid_opacity: 0.28,
    created_at: date,
    updated_at: date,
  };
  session = {
    id: map.battle_session_id,
    adventure_session_id: adventureId,
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
    const route = url.pathname.split('/').pop();
    if (
      status === 200 &&
      [
        'perform_battle_action',
        'answer_battle_decision_fast',
        'battle_combat_update',
        'finish_battle_turn',
      ].includes(route ?? '')
    ) {
      const uid = actor(req.headers.authorization);
      const controlled = (tokenId: string) => {
        const token = tokens.find((t) => t.id === tokenId);
        return (
          !!token &&
          (token.npc_id
            ? uid === DEMO_USER_ID
            : uid !== DEMO_USER_ID &&
              seed.characters.some((c) => c.id === token.character_id && c.owner_id === uid))
        );
      };
      const update = {
        map_id: map.id,
        sessions: [session],
        tokens,
        actions,
        decisions: decisions.filter((d) => d.status === 'pending' && controlled(d.token_id)),
        spellEffects: [],
        movementPlans: [],
      };
      data = {
        ...update,
        ...(route === 'answer_battle_decision_fast'
          ? { decision: data }
          : route === 'perform_battle_action'
            ? { action: data }
            : {}),
      };
    }
    res.end(JSON.stringify(data));
  };
  if (url.pathname === '/health') {
    send({ ready: true });
    return;
  }
  if (url.pathname === '/__fixture/reset') {
    reset();
    hitPointLedger.clear();
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
      decisions,
      rolls,
      characters: seed.characters,
      npcs: seed.npcs,
      world: seed.world,
      muralItems,
      muralRevision,
      adventures,
      journal,
      rules: seed.rules,
      campaignItems,
      scenerySettings: [...scenerySettings.entries()],
      itemDeliveries,
      atlasMaps,
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
    if (body.decisions) decisions = body.decisions as BattleDecision[];
    if (body.battleActions) actions = body.battleActions as BattleActionRequest[];
    if (body.atlasMaps) atlasMaps = body.atlasMaps as AtlasMap[];
    if (body.rules) seed.rules = [{ ...defaultRules(campaignId), ...(body.rules as object) }];
    if (body.adventures) adventures = body.adventures as CampaignSession[];
    if (body.muralItems)
      muralItems = (body.muralItems as MuralItem[]).map((i) => ({
        ...i,
        adventure_session_id: i.adventure_session_id ?? adventureId,
      }));
    if (body.cells) cells = body.cells as BattleMapCell[];
    if (body.tokens) tokens = body.tokens as BattleToken[];
    if (body.mapSize) {
      const size = body.mapSize as { width: number; height: number };
      map.width = size.width;
      map.height = size.height;
    }
    if (body.extraMaps)
      extraMaps = (body.extraMaps as BattleMap[]).map((m) => ({
        ...m,
        adventure_session_id: m.adventure_session_id ?? adventureId,
      }));
    if (body.extraSessions)
      extraSessions = (body.extraSessions as BattleSession[]).map((m) => ({
        ...m,
        adventure_session_id: m.adventure_session_id ?? adventureId,
      }));
    if (body.uploadError !== undefined) uploadError = !!body.uploadError;
    if (body.combatActions) {
      const c = seed.characters.find((c) => c.id === tokens[0].character_id)!;
      c.sheet = {
        ...c.sheet,
        class_id: 'wizard',
        level: 10,
        class_levels: [
          { class_id: 'wizard', level: 5 },
          { class_id: 'cleric', level: 5 },
        ],
        hp_current: 40,
        hp_max_override: 40,
        slots_used: {},
        abilities: { ...c.sheet.abilities, int: 16, wis: 16 },
        spells: ['bola-de-fogo', 'maos-flamejantes', 'curar-ferimentos'].map((key, i) => ({
          ...spellFromCatalog(
            SPELL_CATALOG.find((sp) => sp.id === key)!,
            `81000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
            key === 'curar-ferimentos' ? 'cleric' : 'wizard',
          ),
          prepared: true,
          casting_mode: 'class',
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
    if (body.actorSheet) {
      const c = seed.characters.find((c) => c.id === tokens[0].character_id)!;
      c.sheet = { ...c.sheet, ...(body.actorSheet as Partial<Character['sheet']>) };
    }
    if (body.heroHP !== undefined)
      seed.characters.find((c) => c.id === tokens[0].character_id)!.sheet.hp_current = Number(
        body.heroHP,
      );
    if (body.background) map.background_image = String(body.background);
    if (body.lighting === 'day' || body.lighting === 'night') map.lighting = body.lighting;
    if (body.fog) fog = body.fog as BattleFogCell[];
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
    const requestedRpc = url.pathname.split('/').pop()!;
    const rpc =
      requestedRpc === 'finish_battle_turn'
        ? 'advance_battle_turn'
        : requestedRpc === 'perform_battle_action'
          ? 'request_battle_action'
          : requestedRpc === 'answer_battle_decision_fast'
            ? 'answer_battle_decision'
            : requestedRpc;
    if (rpc === 'battle_combat_update') {
      send({});
      return;
    }
    // Access refreshes are background reads, not gameplay operations such as movement.
    if (rpc !== 'get_billing_context') calls.push({ rpc, ...body });
    if (
      [
        'save_campaign_atlas',
        'delete_campaign_atlas',
        'prepare_atlas_scene',
        'attach_atlas_scene_image',
      ].includes(rpc)
    ) {
      if (id !== DEMO_USER_ID) {
        send({ message: 'Somente o mestre pode gerenciar mapas.', code: '42501' }, 403);
        return;
      }
      const current = atlasMaps.find((m) => m.id === body.p_id);
      if (rpc === 'save_campaign_atlas') {
        try {
          const document = validateDocument(body.p_document),
            expected = Number(body.p_expected_revision ?? 0);
          if (current && current.revision !== expected) {
            if (
              current.revision === expected + 1 &&
              JSON.stringify(current.document) === JSON.stringify(document)
            ) {
              send(current);
              return;
            }
            send(
              {
                message: 'Este mapa mudou em outra janela. Recarregue ou salve uma cópia.',
                code: '40001',
              },
              409,
            );
            return;
          }
          if (!current && expected) {
            send({ message: 'Este mapa foi removido.', code: '40001' }, 409);
            return;
          }
          const stamp = new Date().toISOString(),
            next: AtlasMap = {
              id: String(body.p_id),
              campaign_id: String(body.p_campaign_id),
              document,
              name: document.title,
              width: document.width,
              height: document.height,
              template: document.template,
              thumbnail: body.p_thumbnail as string | null,
              revision: expected + 1,
              created_at: current?.created_at ?? stamp,
              updated_at: stamp,
            };
          atlasMaps = [...atlasMaps.filter((m) => m.id !== next.id), next];
          send(next);
        } catch (e) {
          send({ message: e instanceof Error ? e.message : 'Mapa inválido' }, 400);
        }
        return;
      }
      if (rpc === 'delete_campaign_atlas') {
        if (!current || current.revision !== body.p_expected_revision) {
          send({ message: 'O mapa mudou.', code: '40001' }, 409);
          return;
        }
        atlasMaps = atlasMaps.filter((m) => m.id !== current.id);
        send(current.id);
        return;
      }
      if (rpc === 'prepare_atlas_scene') {
        if (!current || current.revision !== body.p_revision) {
          send({ message: 'O mapa mudou.', code: '40001' }, 409);
          return;
        }
        const chapter = adventures.find(
          (a) => a.id === body.p_adventure_session_id && a.status !== 'ended',
        );
        if (!chapter) {
          send({ message: 'Capítulo indisponível.' }, 400);
          return;
        }
        const key = JSON.stringify([
          current.id,
          current.revision,
          chapter.id,
          body.p_columns,
          body.p_rows,
          body.p_scale,
        ]);
        if (atlasExports.has(key)) {
          send(atlasExports.get(key));
          return;
        }
        const encounter: BattleSession = {
          ...session,
          id: randomUUID(),
          adventure_session_id: chapter.id,
          status: 'preparing',
          round: 0,
          turn_index: 0,
          active_token_id: null,
        };
        const next: BattleMap = {
          ...map,
          id: randomUUID(),
          adventure_session_id: chapter.id,
          battle_session_id: encounter.id,
          name: current.name,
          description: 'Cenário criado na Oficina de mapas.',
          width: Number(body.p_columns),
          height: Number(body.p_rows),
          scale_per_cell: Number(body.p_scale),
          background_image: null,
        };
        extraMaps.push(next);
        extraSessions.push(encounter);
        const prepared = {
          map: next,
          image_path: `battle_maps/${next.id}/atlas-${current.id}-r${current.revision}.webp`,
        };
        atlasExports.set(key, prepared);
        send(prepared);
        return;
      }
      const found = [...atlasExports.values()].find((e) => e.map.id === body.p_map_id);
      if (!found || !media.has(found.image_path)) {
        send({ message: 'A imagem ainda não foi enviada. Tente novamente.' }, 400);
        return;
      }
      found.map.background_image = found.image_path;
      send(found.map);
      return;
    }
    if (rpc === 'update_profile_preferences') {
      const profile = seed.profiles.find((p) => p.id === id)!;
      profile.preferences = {
        ...profile.preferences,
        ...(body.p_preferences as Record<string, unknown>),
      };
      send(profile.preferences);
      return;
    }
    if (rpc === 'get_billing_context') {
      send(demoBillingContext());
      return;
    }
    if (rpc === 'site_is_admin') {
      send(false);
      return;
    }
    if (rpc === 'set_battle_map_lighting') {
      const current = [map, ...extraMaps].find((m) => m.id === body.p_map_id);
      if (id !== DEMO_USER_ID || !current) {
        send(
          { message: 'Somente o mestre pode alterar a iluminação do grid.', code: '42501' },
          403,
        );
      } else if (
        adventures.find((s) => s.id === current.adventure_session_id)?.status === 'ended'
      ) {
        send({ message: 'A sessão está encerrada e seu histórico é somente para consulta.' }, 400);
      } else {
        current.lighting = body.p_lighting as 'day' | 'night';
        current.updated_at = new Date().toISOString();
        send(current);
      }
      return;
    }
    if (['save_scenery_element', 'get_scenery_contents', 'interact_scenery'].includes(rpc)) {
      const contents = (object: BattleMapObject) => sceneryContents(object, id);
      if (rpc === 'save_scenery_element') {
        if (id !== DEMO_USER_ID) {
          send({ message: 'Somente o mestre pode configurar elementos.' }, 403);
          return;
        }
        const input = body.p_object as unknown as BattleMapObject,
          settings = body.p_settings as unknown as ScenerySetup;
        const old = objects.find((o) => o.id === input.id),
          prior = scenerySettings.get(input.id);
        if (old && old.updated_at !== body.p_expected_updated_at) {
          send({ message: 'Este elemento mudou.', code: '40001' }, 409);
          return;
        }
        const item = campaignItems.find((i) => i.id === settings.loot_item_id);
        if (settings.loot_item_id && !item) {
          send({ message: 'Escolha um item ativo.' }, 400);
          return;
        }
        const next = {
          ...structuredClone(input),
          created_at: old?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        let key = campaignItems.find((i) => i.id === prior?.key_item_id);
        if (settings.requires_key) {
          if (!key) {
            const data = {
              ...newItemDefinition(),
              name: settings.key_name,
              category: 'gear' as const,
              weight: 0.05,
              tags: ['chave'],
              recharge: 'none' as const,
              notes: 'Abre ' + String(next.metadata.name || next.object_type),
            };
            key = {
              id: randomUUID(),
              campaign_id: campaignId,
              name: data.name,
              data,
              visible_to_players: false,
              archived: false,
              version: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              private_notes: 'Fechadura: ' + next.id,
            };
            campaignItems.push(key);
          } else if (key.name !== settings.key_name) {
            key.name = settings.key_name;
            key.data.name = settings.key_name;
            key.version++;
          }
        }
        const setup = {
          ...settings,
          coins: settings.coins ?? emptyCurrency(),
          discovery_text: settings.discovery_text ?? '',
          player_enabled: settings.player_enabled ?? true,
          linked_object_id: settings.linked_object_id ?? null,
          key_item_id: key?.id,
          taken: !!prior?.taken && !settings.refill,
        };
        setup.locked = setup.requires_key && setup.locked;
        scenerySettings.set(next.id, setup);
        if (item) sceneryLoot.set(next.id, structuredClone(item));
        else sceneryLoot.delete(next.id);
        next.metadata = {
          ...next.metadata,
          interaction_source: next.id,
          interaction_locked: setup.locked,
          has_key: setup.requires_key,
          has_loot: !!item || hasCoins(setup.coins),
          loot_taken: setup.taken,
          interaction_configured: true,
          player_interaction: setup.player_enabled,
          has_clue: !!setup.discovery_text,
          has_link: !!setup.linked_object_id,
        };
        if (setup.locked && ['open', 'iron-open'].includes(String(next.metadata.variant))) {
          next.metadata.variant = next.metadata.variant === 'iron-open' ? 'iron' : 'default';
          if (['door', 'secretwall', 'cage', 'portcullis'].includes(next.object_type)) {
            next.blocks_movement = true;
            next.blocks_vision = ['door', 'secretwall'].includes(next.object_type);
          }
        }
        objects = old ? objects.map((o) => (o.id === next.id ? next : o)) : [...objects, next];
        const changedMap = [map, ...extraMaps].find((m) => m.id === next.map_id);
        if (changedMap) changedMap.updated_at = next.updated_at;
        send({
          object: next,
          key_item_id: key?.id ?? null,
          key_name: key?.name ?? null,
          message: settings.requires_key
            ? 'Elemento salvo. A chave está na seção Itens.'
            : 'Elemento salvo sem exigir chave.',
        });
        return;
      }
      const object = objects.find((o) => o.id === body.p_object_id);
      if (
        !object ||
        (id !== DEMO_USER_ID && (!object.visible || areaHidden(fog, sceneryRect(object)!)))
      ) {
        send({ message: 'Este elemento não está disponível.' }, 403);
        return;
      }
      if (rpc === 'get_scenery_contents') {
        send(contents(object));
        return;
      }
      const actor = tokens.find((t) => t.id === body.p_token_id),
        character = seed.characters.find((c) => c.id === actor?.character_id),
        setup = scenerySettings.get(object.id);
      if (!actor || !character || (id !== DEMO_USER_ID && character.owner_id !== id)) {
        send({ message: 'Você não controla esse personagem.' }, 403);
        return;
      }
      if (!withinSceneryReach(object, actor)) {
        send({ message: 'Aproxime seu personagem do elemento para interagir.' }, 400);
        return;
      }
      if (setup?.player_enabled === false && id !== DEMO_USER_ID) {
        send({ message: 'Este elemento é controlado pelo mestre.' }, 403);
        return;
      }
      const claim = sceneryClaims.get(String(body.p_request_id));
      if (
        body.p_intent === 'take' &&
        claim?.objectId === object.id &&
        claim.characterId === character.id
      ) {
        send({ ...contents(object), message: 'Item já recolhido para o seu inventário.' });
        return;
      }
      if (object.updated_at !== body.p_expected_updated_at) {
        send({ message: 'Este elemento mudou. Reabra antes de interagir.', code: '40001' }, 409);
        return;
      }
      let message = 'Elemento aberto.';
      if (body.p_intent === 'take') {
        const loot = sceneryLoot.get(object.id);
        if (
          (!loot && !hasCoins(setup?.coins)) ||
          setup?.taken ||
          !(contents(object).opened || object.metadata.interaction_revealed === true)
        ) {
          send(
            {
              message:
                'Não há recompensa disponível. Abra ou examine o elemento antes de recolher.',
            },
            400,
          );
          return;
        }
        const inventory = loot ? grantedInventoryItem(loot, setup?.quantity ?? 1) : null;
        if (inventory) character.sheet.inventory.push(inventory);
        for (const coin of ['cp', 'sp', 'ep', 'gp', 'pp'] as const)
          character.sheet.currency[coin] += setup?.coins?.[coin] ?? 0;
        character.updated_at = new Date().toISOString();
        setup!.taken = true;
        object.metadata.loot_taken = true;
        sceneryClaims.set(String(body.p_request_id), {
          objectId: object.id,
          characterId: character.id,
        });
        if (loot && inventory)
          itemDeliveries.push({
            id: String(body.p_request_id),
            campaign_id: campaignId,
            item_id: loot.id,
            character_id: character.id,
            inventory_id: inventory.id,
            item_name: loot.name,
            quantity: inventory.quantity,
            definition_version: loot.version,
            created_at: new Date().toISOString(),
          });
        message = hasCoins(setup?.coins)
          ? 'Moedas recolhidas e somadas à sua ficha.'
          : 'Você recolheu ' + loot?.name + '. O item está no seu inventário.';
      } else if (
        ['inspect', 'activate', 'deactivate', 'light-on', 'light-off'].includes(
          String(body.p_intent),
        )
      ) {
        const changed = structuredClone(object);
        changed.metadata.interaction_revealed = true;
        if (body.p_intent === 'inspect')
          message = setup?.discovery_text
            ? 'Você examinou o elemento e encontrou uma pista.'
            : 'Você examinou o elemento.';
        else if (body.p_intent === 'light-on' || body.p_intent === 'light-off') {
          changed.metadata.light_enabled = body.p_intent === 'light-on';
          message = changed.metadata.light_enabled ? 'Luz acesa.' : 'Luz apagada.';
        } else {
          changed.metadata.variant = body.p_intent === 'activate' ? 'activated' : 'default';
          try {
            commitLinkedScenery(linkedSceneryChange(changed));
          } catch (error) {
            send({ message: error instanceof Error ? error.message : 'Interação inválida.' }, 400);
            return;
          }
          message = body.p_intent === 'activate' ? 'Mecanismo acionado.' : 'Mecanismo reposto.';
        }
        Object.assign(object, changed);
      } else {
        if (body.p_intent === 'open' && setup?.locked) {
          const key = character.sheet.inventory.find(
            (i) =>
              i.id === body.p_key_inventory_id &&
              i.campaign_item_id === setup.key_item_id &&
              i.quantity > 0,
          );
          if (!key) {
            send(
              {
                message:
                  (object.object_type === 'door' ? 'Porta trancada' : 'Baú trancado') +
                  '. Use a chave correta do inventário.',
              },
              400,
            );
            return;
          }
          setup.locked = false;
          object.metadata.interaction_locked = false;
        }
        const opened = body.p_intent === 'open';
        const changed = {
          ...object,
          metadata: {
            ...object.metadata,
            variant: String(object.metadata.variant).startsWith('iron')
              ? opened
                ? 'iron-open'
                : 'iron'
              : opened
                ? 'open'
                : 'default',
          },
        };
        if (['door', 'secretwall', 'cage', 'portcullis'].includes(object.object_type)) {
          changed.blocks_movement = !opened;
          changed.blocks_vision = !opened && ['door', 'secretwall'].includes(object.object_type);
        }
        const r = sceneryRect(changed)!;
        if (
          changed.blocks_movement &&
          tokens.some(
            (t) =>
              t.map_id === object.map_id &&
              t.x < r.x + r.width &&
              t.x + t.size > r.x &&
              t.y < r.y + r.height &&
              t.y + t.size > r.y,
          )
        ) {
          send({ message: 'O objeto bloqueia um personagem. Escolha outra posição.' }, 400);
          return;
        }
        Object.assign(object, changed);
        message = opened
          ? sceneryLoot.has(object.id)
            ? 'Baú aberto. Você encontrou um item!'
            : 'Elemento aberto.'
          : 'Elemento fechado.';
      }
      object.updated_at = new Date().toISOString();
      const changedMap = [map, ...extraMaps].find((m) => m.id === object.map_id);
      if (changedMap) changedMap.updated_at = object.updated_at;
      send({ ...contents(object), message });
      return;
    }
    if (['save_campaign_item', 'give_campaign_item', 'recharge_campaign_item'].includes(rpc)) {
      if (id !== DEMO_USER_ID) {
        send({ message: 'Somente o mestre pode alterar os itens.', code: '42501' }, 403);
        return;
      }
      if (rpc === 'save_campaign_item') {
        const input = body.p_payload as CampaignItem,
          old = campaignItems.find((i) => i.id === input.id);
        if (old && old.version !== body.p_expected_version) {
          send({ message: 'Este item mudou em outra janela.', code: '40001' }, 409);
          return;
        }
        const errors = itemDefinitionErrors(input.data);
        if (errors.length) {
          send({ message: errors.join(' ') }, 400);
          return;
        }
        const next = {
          ...structuredClone(input),
          name: input.data.name,
          version: (old?.version ?? 0) + 1,
          updated_at: new Date().toISOString(),
        };
        campaignItems = old
          ? campaignItems.map((i) => (i.id === next.id ? next : i))
          : [...campaignItems, next];
        send(next);
      } else if (rpc === 'give_campaign_item') {
        const item = campaignItems.find((i) => i.id === body.p_item_id),
          character = seed.characters.find(
            (c) => c.id === body.p_character_id && c.campaign_id === item?.campaign_id,
          );
        const prior = itemDeliveries.find((d) => d.id === body.p_request_id);
        if (prior) {
          send(prior);
          return;
        }
        if (!item || item.archived || !character || item.version !== body.p_expected_version) {
          send({ message: 'Item ou personagem inválido.' }, 400);
          return;
        }
        const quantity = Number(body.p_quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || (item.data.charges && quantity > 1)) {
          send({ message: 'Quantidade inválida para este item.' }, 400);
          return;
        }
        const inventory = grantedInventoryItem(item, quantity);
        character.sheet.inventory.push(inventory);
        character.updated_at = new Date().toISOString();
        const delivery: ItemDelivery = {
          id: String(body.p_request_id),
          campaign_id: item.campaign_id,
          item_id: item.id,
          character_id: character.id,
          inventory_id: inventory.id,
          item_name: item.name,
          quantity,
          definition_version: item.version,
          created_at: new Date().toISOString(),
        };
        itemDeliveries.push(delivery);
        send(delivery);
      } else {
        const character = seed.characters.find((c) =>
          c.sheet.inventory.some((i) => i.id === body.p_inventory_id),
        );
        const item = character?.sheet.inventory.find((i) => i.id === body.p_inventory_id);
        if (!character || !item || character.updated_at !== body.p_expected_updated_at) {
          send(
            { message: 'A ficha mudou. Atualize antes de restaurar as cargas.', code: '40001' },
            409,
          );
          return;
        }
        item.charges_used = 0;
        character.updated_at = new Date().toISOString();
        send(item);
      }
      return;
    }
    if (rpc === 'set_battle_scenery_state' || rpc === 'set_scenery_mechanism_state') {
      const object = objects.find((o) => o.id === body.p_object_id);
      if (id !== DEMO_USER_ID || !object) {
        send({ message: 'Somente o mestre pode interagir com o cenário.', code: '42501' }, 403);
        return;
      }
      const ownerMap = [map, ...extraMaps].find((m) => m.id === object.map_id);
      if (adventures.some((s) => s.id === ownerMap?.adventure_session_id && s.status === 'ended')) {
        send({ message: 'A sessão está encerrada.', code: '42501' }, 403);
        return;
      }
      if (object.updated_at !== body.p_expected_updated_at) {
        send(
          { message: 'Este elemento mudou. Atualize a mesa antes de interagir.', code: '40001' },
          409,
        );
        return;
      }
      try {
        let changed: BattleMapObject;
        if (body.p_variant === 'lock' || body.p_variant === 'unlock') {
          const s = scenerySettings.get(object.id);
          if (!s?.requires_key) throw new Error('Configure uma chave antes de trancar.');
          s.locked = body.p_variant === 'lock';
          changed = { ...object, metadata: { ...object.metadata, interaction_locked: s.locked } };
          if (s.locked) {
            changed.metadata.variant = String(object.metadata.variant).startsWith('iron')
              ? 'iron'
              : 'default';
            if (['door', 'secretwall', 'cage', 'portcullis'].includes(object.object_type)) {
              changed.blocks_movement = true;
              changed.blocks_vision = ['door', 'secretwall'].includes(object.object_type);
            }
          }
        } else changed = changeSceneryState(object, String(body.p_variant));
        const linked = MECHANISM_KINDS.includes(changed.object_type)
          ? linkedSceneryChange(changed)
          : null;
        const r = sceneryRect(changed)!;
        if (
          changed.blocks_movement &&
          tokens.some(
            (t) =>
              t.map_id === changed.map_id &&
              t.x < r.x + r.width &&
              t.x + t.size > r.x &&
              t.y < r.y + r.height &&
              t.y + t.size > r.y,
          )
        ) {
          send({ message: 'O objeto bloqueia um personagem. Escolha outra posição.' }, 400);
          return;
        }
        changed.updated_at = new Date(
          Math.max(Date.now(), Date.parse(object.updated_at) + 1),
        ).toISOString();
        if (ownerMap) ownerMap.updated_at = changed.updated_at;
        objects[objects.indexOf(object)] = changed;
        commitLinkedScenery(linked);
        calls.push({ sceneryInteraction: changed.id, variant: body.p_variant });
        send(rpc === 'set_scenery_mechanism_state' ? sceneryContents(changed, id) : changed);
      } catch (error) {
        send({ message: error instanceof Error ? error.message : 'Interação inválida.' }, 400);
      }
      return;
    }
    if (rpc === 'create_battle_scene' || rpc === 'create_battle_map') {
      if (id !== DEMO_USER_ID) {
        send({ message: 'Apenas o mestre pode criar cenários.' }, 403);
        return;
      }
      const key = String(body.p_request_id ?? '');
      if (key && sceneRequests.has(key)) {
        send(sceneRequests.get(key));
        return;
      }
      const input = body.p_payload as Partial<BattleMap>;
      const stamp = new Date().toISOString();
      const encounter: BattleSession = {
        ...session,
        id: randomUUID(),
        adventure_session_id:
          input.adventure_session_id ?? adventures.find((s) => s.status === 'active')?.id,
        status: 'preparing',
        round: 0,
        turn_index: 0,
        active_token_id: null,
        created_at: stamp,
        updated_at: stamp,
      };
      const result: BattleMap = {
        ...map,
        ...input,
        id: randomUUID(),
        campaign_id: campaignId,
        adventure_session_id: encounter.adventure_session_id,
        battle_session_id: encounter.id,
        created_at: stamp,
        updated_at: stamp,
      };
      extraSessions.push(encounter);
      extraMaps.push(result);
      if (rpc === 'create_battle_scene')
        objects.push(
          ...(
            body.p_objects as Omit<BattleMapObject, 'id' | 'map_id' | 'created_at' | 'updated_at'>[]
          ).map((o) => ({
            ...o,
            id: randomUUID(),
            map_id: result.id,
            created_at: stamp,
            updated_at: stamp,
          })),
        );
      if (key) sceneRequests.set(key, result);
      send(result);
      return;
    }
    if (rpc === 'save_character') {
      const c = body.p_payload as unknown as Character;
      const previous = seed.characters.find((x) => x.id === c.id);
      const errors = [
        ...validate(c),
        ...characterRuleErrors(
          c.sheet,
          seed.rules?.[0] ?? defaultRules(campaignId),
          previous?.sheet,
          id === DEMO_USER_ID,
        ),
      ];
      if (
        c.campaign_id !== campaignId ||
        (id !== DEMO_USER_ID && c.owner_id !== id) ||
        errors.length
      ) {
        send({ message: errors.join(' ') || 'Ficha não autorizada', code: '42501' }, 400);
        return;
      }
      const rules = seed.rules?.[0];
      if (rules?.lock_player_level && c.sheet.level !== rules.party_level) {
        send({ message: 'Nível definido pelo mestre.', code: '42501' }, 400);
        return;
      }
      if (
        previous &&
        body.p_expected_updated_at &&
        body.p_expected_updated_at !== previous.updated_at
      ) {
        send({ message: 'Esta ficha foi atualizada.', code: '40001' }, 409);
        return;
      }
      c.updated_at = new Date().toISOString();
      seed.characters = [...seed.characters.filter((x) => x.id !== c.id), c];
      send({ id: c.id, updated_at: c.updated_at });
      return;
    }

    if (rpc === 'roll_character_hit_points') {
      const character = seed.characters.find((c) => c.id === body.p_character_id);
      if (
        seed.rules?.[0]?.hit_point_method !== 'rolled' ||
        (character && id !== DEMO_USER_ID && character.owner_id !== id)
      ) {
        send({ message: 'Rolagem de PV não permitida.' }, 403);
        return;
      }
      const sheet = withCharacterLevel(character?.sheet ?? seed.characters[0].sheet, 1);
      const levels = body.p_levels as Character['sheet']['class_levels'];
      const rolled = rollHitPoints(
        {
          ...sheet,
          class_levels: levels,
          class_id: levels?.[0]?.class_id ?? sheet.class_id,
          hit_point_method: 'rolled',
        },
        hitPointLedger.get(String(body.p_character_id)) ?? character?.sheet.hit_point_rolls ?? {},
        (sides) => Math.ceil(sides / 2),
      );
      hitPointLedger.set(String(body.p_character_id), rolled);
      send(rolled);
      return;
    }
    if (
      [
        'save_campaign_session',
        'delete_campaign_session',
        'start_campaign_session',
        'end_campaign_session',
        'add_campaign_session_note',
        'save_campaign_rules',
        'save_campaign_rules_v19',
        'copy_battle_map_to_session',
        'copy_campaign_mural_to_session',
        'confirm_campaign_session_death',
      ].includes(rpc)
    ) {
      if (id !== DEMO_USER_ID) {
        send({ message: 'Somente o mestre pode alterar sessões ou regras.', code: '42501' }, 403);
        return;
      }
      const stamp = new Date().toISOString();
      if (rpc === 'delete_campaign_session') {
        const adventure = adventures.find((s) => s.id === body.p_session_id);
        if (!adventure || adventure.updated_at !== body.p_expected_updated_at) {
          send({ message: 'A sessão mudou. Atualize a lista antes de excluir.' }, 409);
          return;
        }
        if (adventure.status === 'active') {
          send({ message: 'Encerre a sessão em andamento antes de excluí-la.' }, 400);
          return;
        }
        const removed = [map, ...extraMaps]
          .filter((m) => m.adventure_session_id === adventure.id)
          .map((m) => m.id);
        extraMaps = extraMaps.filter((m) => !removed.includes(m.id));
        extraSessions = extraSessions.filter((s) => s.adventure_session_id !== adventure.id);
        cells = cells.filter((c) => !removed.includes(c.map_id));
        fog = fog.filter((f) => !removed.includes(f.map_id));
        objects = objects.filter((o) => !removed.includes(o.map_id));
        tokens = tokens.filter((t) => !removed.includes(t.map_id));
        muralItems = muralItems.filter((i) => i.adventure_session_id !== adventure.id);
        journal = journal.filter((e) => e.adventure_session_id !== adventure.id);
        adventures = adventures.filter((s) => s.id !== adventure.id);
        send(null);
        return;
      }
      if (rpc === 'save_campaign_session') {
        const old = adventures.find((s) => s.id === body.p_session_id);
        if (adventures.some((s) => s.number === body.p_number && s.id !== old?.id)) {
          send({ message: 'Já existe uma sessão com este número.', code: '23505' }, 409);
          return;
        }
        const item: CampaignSession = {
          id: randomUUID(),
          campaign_id: campaignId,
          name: String(body.p_name),
          number: Number(body.p_number),
          status: 'planned',
          summary: '',
          created_by: id,
          created_at: stamp,
          updated_at: stamp,
          started_at: null,
          ended_at: null,
          ...old,
        };
        item.name = String(body.p_name);
        item.number = Number(body.p_number);
        item.updated_at = stamp;
        adventures = [...adventures.filter((s) => s.id !== item.id), item].sort(
          (a, b) => b.number - a.number,
        );
        send(item);
        return;
      }
      if (rpc === 'save_campaign_rules' || rpc === 'save_campaign_rules_v19') {
        const rules = {
          ...defaultRules(campaignId),
          ...(body.p_rules as object),
          updated_at: stamp,
        };
        seed.rules = [rules];
        for (const c of seed.characters.filter((c) => c.campaign_id === campaignId)) {
          if (rules.lock_player_level) c.sheet = withCharacterLevel(c.sheet, rules.party_level);
          c.sheet.hit_point_method = rules.hit_point_method;
          if (rules.hit_point_method === 'rolled') {
            c.sheet.hit_point_rolls = rollHitPoints(
              c.sheet,
              hitPointLedger.get(c.id) ?? c.sheet.hit_point_rolls ?? {},
              (sides) => Math.ceil(sides / 2),
            );
            hitPointLedger.set(c.id, c.sheet.hit_point_rolls);
          }
          c.sheet.hp_current = Math.min(c.sheet.hp_current, calculate(c.sheet).hpMax);
          c.updated_at = stamp;
        }
        send(rules);
        return;
      }
      if (rpc === 'copy_battle_map_to_session') {
        const origin = [map, ...extraMaps].find((m) => m.id === body.p_map_id)!;
        const dest = adventures.find((s) => s.id === body.p_session_id && s.status !== 'ended');
        if (!dest) {
          send({ message: 'Escolha outra sessão.' }, 400);
          return;
        }
        const encounter = {
          ...session,
          id: randomUUID(),
          adventure_session_id: dest.id,
          status: 'preparing' as const,
          active_token_id: null,
          round: 0,
        };
        extraSessions.push(encounter);
        const result = {
          ...origin,
          id: randomUUID(),
          adventure_session_id: dest.id,
          battle_session_id: encounter.id,
          name: String(body.p_name),
          created_at: stamp,
          updated_at: stamp,
        };
        extraMaps.push(result);
        cells.push(
          ...cells
            .filter((c) => c.map_id === origin.id)
            .map((c) => ({ ...c, id: randomUUID(), map_id: result.id })),
        );
        objects.push(
          ...objects
            .filter((o) => o.map_id === origin.id)
            .map((o) => ({ ...o, id: randomUUID(), map_id: result.id })),
        );
        fog.push(
          ...fog
            .filter((f) => f.map_id === origin.id)
            .map((f) => ({ ...f, id: randomUUID(), map_id: result.id })),
        );
        send(result);
        return;
      }
      if (rpc === 'copy_campaign_mural_to_session') {
        const copies = muralItems
          .filter((i) => i.adventure_session_id === body.p_source_session)
          .map((i) => ({
            ...i,
            id: randomUUID(),
            adventure_session_id: String(body.p_target_session),
            created_at: stamp,
            updated_at: stamp,
          }));
        muralItems.push(...copies);
        send(copies.length);
        return;
      }
      const adventure = adventures.find((s) => s.id === body.p_session_id)!;
      if (!adventure) {
        send({ message: 'Sessão não encontrada.' }, 400);
        return;
      }
      if (rpc === 'start_campaign_session') {
        if (adventures.some((s) => s.status === 'active')) {
          send({ message: 'Encerre a sessão atual antes de iniciar outra.' }, 400);
          return;
        }
        adventure.status = 'active';
        adventure.started_at = stamp;
        adventure.updated_at = stamp;
        journalEvent(adventure.id, 'session_started', 'Sessão iniciada', adventure.name);
        send(adventure);
        return;
      }
      if (rpc === 'end_campaign_session') {
        journalEvent(
          adventure.id,
          'session_ended',
          'Sessão encerrada',
          String(body.p_summary ?? ''),
        );
        const mapIds = [map, ...extraMaps]
          .filter((m) => m.adventure_session_id === adventure.id)
          .map((m) => m.id);
        tokens = tokens.filter((t) => !mapIds.includes(t.map_id));
        actions = actions.filter((a) => !mapIds.includes(a.map_id));
        for (const battle of [session, ...extraSessions].filter(
          (s) => s.adventure_session_id === adventure.id,
        )) {
          battle.status = 'ended';
          battle.active_token_id = null;
        }
        adventure.status = 'ended';
        adventure.ended_at = stamp;
        adventure.summary = String(body.p_summary ?? '');
        adventure.updated_at = stamp;
        send(adventure);
        return;
      }
      if (rpc === 'add_campaign_session_note') {
        journalEvent(
          adventure.id,
          'note',
          String(body.p_title),
          String(body.p_description),
          body.p_image_path as string | null,
          body.p_visible as boolean,
        );
        send(null);
        return;
      }
      if (rpc === 'confirm_campaign_session_death') {
        if (body.p_kind === 'character') {
          const c = seed.characters.find((c) => c.id === body.p_entity_id)!;
          c.sheet.hp_current = 0;
          c.sheet.death_failures = 3;
          journalEvent(
            adventure.id,
            'character_death',
            c.name + ' morreu',
            'Morte confirmada pelo mestre.',
          );
        } else {
          const n = seed.npcs.find((n) => n.id === body.p_entity_id)!;
          n.hp_current = 0;
          n.status = 'Morto';
          journalEvent(
            adventure.id,
            'npc_death',
            n.name + ' morreu',
            'Morte confirmada pelo mestre.',
            n.image_path,
            n.visible_to_players,
          );
        }
        send(null);
        return;
      }
    }
    if (
      ['save_campaign_mural_item', 'delete_campaign_mural_item', 'reorder_campaign_mural'].includes(
        rpc,
      )
    ) {
      if (id !== DEMO_USER_ID) {
        send({ message: 'Somente o mestre pode editar o mural.', code: '42501' }, 403);
        return;
      }
      if (rpc === 'save_campaign_mural_item') {
        const payload = muralPayload({
          ...(body.p_payload as MuralItem),
          adventure_session_id: (body.p_payload as MuralItem).adventure_session_id ?? adventureId,
        });
        if (adventures.find((s) => s.id === payload.adventure_session_id)?.status === 'ended') {
          send({ message: 'Esta sessão está encerrada.' }, 400);
          return;
        }
        const previous = muralItems.find((i) => i.id === payload.id);
        if (
          (previous && previous.updated_at !== body.p_expected_updated_at) ||
          (!previous && body.p_expected_updated_at)
        ) {
          send(
            {
              message: 'Este cartão mudou em outra janela. Atualize o mural antes de salvar.',
              code: '40001',
            },
            409,
          );
          return;
        }
        const stamp = new Date(
          Math.max(Date.now(), Date.parse(previous?.updated_at ?? '') + 1 || 0),
        ).toISOString();
        const item: MuralItem = {
          ...payload,
          sort_order: previous
            ? payload.sort_order
            : Math.max(-1, ...muralItems.map((i) => i.sort_order)) + 1,
          created_at: previous?.created_at ?? stamp,
          updated_at: stamp,
        };
        muralItems = [...muralItems.filter((i) => i.id !== item.id), item];
        muralRevision++;
        journalEvent(
          item.adventure_session_id!,
          'mural_added',
          item.title,
          item.description,
          item.image_path,
          item.visible_to_players,
        );
        send(item);
      } else if (rpc === 'delete_campaign_mural_item') {
        const item = muralItems.find((i) => i.id === body.p_item_id);
        if (!item || item.updated_at !== body.p_expected_updated_at) {
          send({ message: 'Este cartão mudou em outra janela.', code: '40001' }, 409);
          return;
        }
        muralItems = muralItems.filter((i) => i.id !== item.id);
        muralRevision++;
        send(null);
      } else {
        const ids = body.p_item_ids as string[];
        if (
          ids.length !== muralItems.length ||
          new Set(ids).size !== muralItems.length ||
          muralItems.some((i) => !ids.includes(i.id))
        ) {
          send({ message: 'O mural mudou. Atualize os cartões.', code: '40001' }, 409);
          return;
        }
        muralItems = muralItems.map((i) => ({
          ...i,
          sort_order: ids.indexOf(i.id),
          updated_at: new Date(Math.max(Date.now(), Date.parse(i.updated_at) + 1)).toISOString(),
        }));
        muralRevision++;
        send(null);
      }
      return;
    }
    if (rpc === 'paint_battle_terrain' || rpc === 'erase_battle_scenery') {
      const m = [map, ...extraMaps].find((m) => m.id === body.p_map_id)!;
      if (id !== DEMO_USER_ID || sessionForMap(m.id)?.status === 'active') {
        send({ message: 'Encerre o combate desta mesa antes de editar o grid.' }, 400);
        return;
      }
      const x = Number(body.p_x),
        y = Number(body.p_y),
        width = Number(body.p_width),
        height = Number(body.p_height);
      let count = 0;
      if (rpc === 'erase_battle_scenery') {
        const before = objects.length;
        objects = objects.filter((o) => {
          const r = sceneryRect(o);
          return (
            o.map_id !== m.id ||
            !r ||
            !(r.x < x + width && r.x + r.width > x && r.y < y + height && r.y + r.height > y)
          );
        });
        count = before - objects.length;
      } else {
        if (
          body.p_blocked &&
          tokens.some(
            (t) =>
              t.map_id === m.id &&
              t.x < Math.min(m.width, x + width) &&
              t.x + t.size > x &&
              t.y < Math.min(m.height, y + height) &&
              t.y + t.size > y,
          )
        ) {
          send({ message: 'O pincel bloqueia um personagem.' }, 400);
          return;
        }
        for (let cy = y; cy < Math.min(m.height, y + height); cy++)
          for (let cx = x; cx < Math.min(m.width, x + width); cx++) {
            const index = cells.findIndex(
              (c) => c.map_id === m.id && c.x === cx && c.y === cy && c.z === 0,
            );
            if (body.p_terrain_type === 'normal') {
              if (index >= 0) {
                cells.splice(index, 1);
                count++;
              }
            } else {
              const cell: BattleMapCell = {
                id: index >= 0 ? cells[index].id : randomUUID(),
                map_id: m.id,
                x: cx,
                y: cy,
                z: 0,
                terrain_type: String(body.p_terrain_type),
                movement_cost: Number(body.p_movement_cost),
                blocked: Boolean(body.p_blocked),
                metadata: {},
                created_at: date,
                updated_at: new Date().toISOString(),
              };
              if (index >= 0) cells[index] = cell;
              else cells.push(cell);
              count++;
            }
          }
      }
      m.updated_at = new Date().toISOString();
      send(count);
      return;
    }
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
    if (rpc === 'configure_battle_decision') {
      const d = decisions.find((entry) => entry.id === body.p_decision_id)!;
      if (id !== DEMO_USER_ID) {
        send({ message: 'Somente o mestre pode ajustar a vantagem.' }, 403);
        return;
      }
      d.mode = body.p_mode as BattleDecision['mode'];
      if (body.p_modifier !== undefined) d.modifier = Number(body.p_modifier);
      send(d);
      return;
    }
    if (rpc === 'guide_battle_action') {
      const q = actions.find((entry) => entry.id === body.p_request_id)!;
      if (id !== DEMO_USER_ID) {
        send({ message: 'Somente o mestre pode autorizar.' }, 403);
        return;
      }
      q.resolution.guided = true;
      const kind: BattleDecision['kind'] =
        q.kind === 'weapon' || q.definition.attackRoll ? 'attack' : 'damage';
      decisions.push({
        id: randomUUID(),
        campaign_id: campaignId,
        session_id: session.id,
        request_id: q.id,
        token_id: q.token_id,
        kind,
        sequence: 0,
        label: q.name,
        ability: null,
        dc: null,
        modifier: kind === 'attack' ? (q.definition.attackBonus ?? 5) : 0,
        mode: 'normal',
        status: 'pending',
        options: { dice: q.definition.dice, target_id: q.target_ids[0] },
        result: {},
        answered_by: null,
        client_id: null,
        created_at: new Date().toISOString(),
        answered_at: null,
      });
      send(q);
      return;
    }
    if (rpc === 'answer_battle_decision') {
      const d = decisions.find((entry) => entry.id === body.p_decision_id)!;
      const token = tokens.find((entry) => entry.id === d.token_id)!;
      if (
        id !== DEMO_USER_ID &&
        token.controlled_by !== id &&
        !seed.characters.some((c) => c.id === token.character_id && c.owner_id === id)
      ) {
        send({ message: 'Esta decisão pertence a outro participante.' }, 403);
        return;
      }
      if (d.status !== 'pending') {
        send(d);
        return;
      }
      const q = actions.find((entry) => entry.id === d.request_id);
      if (d.kind === 'choice') d.result = { choice: String((body.p_answer as any)?.choice) };
      else {
        const roll = recordRoll(id, {
          p_client_id: body.p_client_id,
          p_expression:
            d.kind === 'damage' ? d.options.dice : `1d20${d.modifier >= 0 ? '+' : ''}${d.modifier}`,
          p_mode: d.mode,
          p_label: d.label,
          p_visibility: 'public',
        });
        d.result = {
          roll,
          ...(d.kind === 'attack'
            ? { hit: true, critical: false }
            : d.kind === 'damage'
              ? { message: 'Efeito aplicado aos alvos.' }
              : { passed: roll.total >= (d.dc ?? 10) }),
        };
      }
      d.status = 'answered';
      d.answered_by = id;
      d.client_id = String(body.p_client_id);
      d.answered_at = new Date().toISOString();
      if (q && d.kind === 'attack')
        decisions.push({
          ...d,
          id: randomUUID(),
          kind: 'damage',
          label: q.name + ' · dano',
          modifier: 0,
          mode: 'normal',
          status: 'pending',
          options: { dice: q.definition.dice },
          result: {},
          answered_by: null,
          client_id: null,
          answered_at: null,
        });
      if (q && d.kind === 'damage') {
        q.status = 'success';
        q.resolution = {
          guided: true,
          dice_roll: d.result.roll,
          resources_consumed: true,
          message: 'Efeito aplicado.',
          affected: q.target_ids.map((id) => ({
            token_id: id,
            name: tokens.find((t) => t.id === id)?.name ?? 'Alvo',
            amount: d.result.roll?.total ?? 0,
            kind: q.definition.kind,
            saved: false,
          })),
        };
        token.action_used = true;
      }
      send(d);
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
      if (sp) e = characterSpellEffect(c.sheet, sp, Number(p.resource_level));
      const feature =
        p.kind === 'feature'
          ? combatFeatures(c.sheet, !!token.raging).find((f) => f.id === p.feature_id)
          : null;
      const use =
        p.kind === 'item' && item ? itemUse(item, p.item_function_id as string | undefined) : null;
      if (feature)
        e = {
          ...EMPTY_EFFECT,
          ...feature,
          shape: feature.self ? 'self' : 'single',
          origin: feature.self ? 'self' : 'point',
          review: feature.operation === 'manual',
        };
      if (use)
        e = {
          ...EMPTY_EFFECT,
          ...use,
          shape: use.shape ?? 'single',
          origin: use.origin ?? 'point',
          review: true,
          ...({ item_function_id: use.id } as object),
        };
      if (p.kind === 'weapon' && item)
        e = weaponEffect(item, c.sheet, (p.weapon_options ?? {}) as WeaponOptions, !!token.raging);
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
        name:
          feature?.name ??
          sp?.name ??
          (item?.campaign_item_id && use ? `${item.name} · ${use.name}` : undefined) ??
          item?.name ??
          (p.kind === 'disengage' ? 'Desengajar' : 'Disparada'),
        cost: feature?.cost ?? use?.cost ?? (p.cost === 'bonus' ? 'bonus' : 'action'),
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
      if (requestedRpc === 'perform_battle_action') {
        r.resolution.guided = true;
        if (['dash', 'disengage', 'dodge'].includes(r.kind)) {
          r.status = 'success';
          token.action_used = true;
        } else
          decisions.push({
            id: randomUUID(),
            campaign_id: campaignId,
            session_id: session.id,
            request_id: r.id,
            token_id: r.token_id,
            kind: r.kind === 'weapon' || r.definition.attackRoll ? 'attack' : 'damage',
            sequence: 0,
            label: r.name,
            ability: null,
            dc: null,
            modifier: r.definition.attackBonus ?? 5,
            mode: 'normal',
            status: 'pending',
            options: { dice: r.definition.dice, target_id: r.target_ids[0] },
            result: {},
            answered_by: null,
            client_id: null,
            created_at: new Date().toISOString(),
            answered_at: null,
          });
      }
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
        if (!playerRoll) {
          if (r.cost === 'action') token.action_used = true;
          if (r.cost === 'bonus') token.bonus_used = true;
          if (r.cost === 'reaction') token.reaction_used = true;
          if (success && r.kind === 'item') {
            const item = c.sheet.inventory.find((i) => i.id === r.source_id)!;
            if (item.campaign_item_id) {
              const fn = item.functions!.find(
                (f) =>
                  f.id ===
                  (r.definition as unknown as { item_function_id: string }).item_function_id,
              )!;
              item.quantity -= fn.quantity_cost;
              item.charges_used = (item.charges_used ?? 0) + fn.charge_cost;
            } else if (item.charges) item.charges_used = (item.charges_used ?? 0) + 1;
            else if (itemUse(item)?.consumed) item.quantity = Math.max(0, item.quantity - 1);
          }
          if (success && r.kind === 'feature') {
            const f = combatFeatures(c.sheet, !!token.raging).find((f) => f.name === r.name)!;
            if (f.resource)
              c.sheet.feature_uses = {
                ...c.sheet.feature_uses,
                [f.resource]: (c.sheet.feature_uses?.[f.resource] ?? 0) + 1,
              };
            if (f.operation === 'rage') token.raging = true;
            if (f.operation === 'end-rage') token.raging = false;
            if (f.operation === 'surge') {
              token.extra_actions = (token.extra_actions ?? 0) + 1;
              token.surge_used = true;
            }
          }
        }
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
  if (table === 'campaign_atlas_maps') {
    let rows = id === DEMO_USER_ID ? [...atlasMaps] : [];
    for (const field of ['id', 'campaign_id']) {
      const match = url.searchParams.get(field);
      if (match?.startsWith('eq.'))
        rows = rows.filter((m) => m[field as 'id' | 'campaign_id'] === match.slice(3));
    }
    const search = url.searchParams.get('name');
    if (search?.startsWith('ilike.')) {
      const text = search
        .slice(7, -1)
        .replace(/\\([\\%_])/g, '$1')
        .toLocaleLowerCase('pt-BR');
      rows = rows.filter((m) => m.name.toLocaleLowerCase('pt-BR').includes(text));
    }
    rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
    const offset = Number(url.searchParams.get('offset') ?? 0),
      limit = Number(url.searchParams.get('limit') ?? 1000),
      total = rows.length;
    res.setHeader(
      'Content-Range',
      `${offset}-${Math.max(offset, Math.min(total - 1, offset + limit - 1))}/${total}`,
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
    reads.push({ table, offset });
    const selected = url.searchParams.get('select');
    const sliced = rows
      .slice(offset, offset + limit)
      .map((row) =>
        selected === '*'
          ? row
          : Object.fromEntries(
              (selected ?? '').split(',').map((k) => [k, row[k as keyof AtlasMap]]),
            ),
      );
    send(
      String(req.headers.accept).includes('application/vnd.pgrst.object+json')
        ? (sliced[0] ?? null)
        : sliced,
    );
    return;
  }
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
    ...Object.fromEntries(
      ['region', 'city', 'location'].flatMap((kind) => {
        const table = {
          region: 'world_regions',
          city: 'world_cities',
          location: 'world_locations',
        }[kind]!;
        const rows = seed.world.filter((w) => w.kind === kind);
        return [
          [
            table,
            rows
              .filter((w) => id === DEMO_USER_ID || w.visible_to_players)
              .map(({ secrets, private_notes, ...row }) => row),
          ],
          [
            table + '_private',
            id === DEMO_USER_ID
              ? rows.map((w) => ({
                  entry_id: w.id,
                  secrets: w.secrets,
                  private_notes: w.private_notes,
                }))
              : [],
          ],
        ];
      }),
    ),
    campaign_sessions: adventures.filter((s) => id === DEMO_USER_ID || s.status !== 'planned'),
    campaign_rules: seed.rules ?? [],
    scenery_interaction_settings:
      id === DEMO_USER_ID
        ? [...scenerySettings.entries()].map(([object_id, s]) => ({
            ...s,
            object_id,
            campaign_id: campaignId,
          }))
        : [],
    campaign_items: campaignItems
      .filter((i) => id === DEMO_USER_ID || (i.visible_to_players && !i.archived))
      .map(({ private_notes: _private, ...item }) => item),
    campaign_item_private:
      id === DEMO_USER_ID
        ? campaignItems.map((i) => ({
            item_id: i.id,
            campaign_id: i.campaign_id,
            notes: i.private_notes ?? '',
          }))
        : [],
    campaign_item_deliveries: itemDeliveries.filter(
      (d) =>
        id === DEMO_USER_ID ||
        seed.characters.some((c) => c.id === d.character_id && c.owner_id === id),
    ),
    campaign_session_events: journal.filter(
      (e) => id === DEMO_USER_ID || e.visibility === 'players',
    ),
    campaign_mural_items: muralItems.filter((i) => id === DEMO_USER_ID || i.visible_to_players),
    campaign_mural_states: [
      { campaign_id: campaignId, revision: muralRevision, updated_at: new Date().toISOString() },
    ],
    npcs: seed.npcs
      .filter((npc) => id === DEMO_USER_ID || npc.visible_to_players)
      .map((npc) => ({
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
    battle_decisions: decisions.filter(
      (d) =>
        id === DEMO_USER_ID ||
        tokens.some(
          (token) =>
            token.id === d.token_id &&
            (token.controlled_by === id ||
              seed.characters.some((c) => c.id === token.character_id && c.owner_id === id)),
        ),
    ),
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
  if (table === 'battle_sessions' && req.method === 'PATCH') {
    if (id !== DEMO_USER_ID) {
      send({ message: 'Somente o mestre pode alterar as regras do turno.' }, 403);
      return;
    }
    const key = url.searchParams.get('id')?.replace('eq.', '');
    const current = [session, ...extraSessions].find((item) => item.id === key);
    if (!current) {
      send({ message: 'Mesa não encontrada.' }, 404);
      return;
    }
    const values = Object.fromEntries(
      Object.entries(body).filter(([field]) =>
        ['restrict_movement_to_turn', 'failed_actions_consume', 'name'].includes(field),
      ),
    );
    Object.assign(current, values, { updated_at: new Date().toISOString() });
    calls.push({ sessionPatch: { id: key, values } });
    send([]);
    return;
  }
  if (table === 'battle_map_tokens' && req.method === 'PATCH') {
    if (id !== DEMO_USER_ID) {
      send({ message: 'Somente o mestre pode administrar participantes.' }, 403);
      return;
    }
    const key = url.searchParams.get('id')?.replace('eq.', '');
    const token = tokens.find((item) => item.id === key);
    if (!token) {
      send({ message: 'Participante não encontrado.' }, 404);
      return;
    }
    Object.assign(token, body, { updated_at: new Date().toISOString() });
    calls.push({ tokenPatch: { id: key, values: body } });
    send([]);
    return;
  }
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
    if (
      req.method === 'PATCH' &&
      url.searchParams.has('updated_at') &&
      url.searchParams.get('updated_at') !== 'eq.' + existing?.updated_at
    ) {
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
