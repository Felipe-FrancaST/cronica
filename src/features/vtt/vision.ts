/** Per-player D&D-style grid visibility. All distances and rule overrides are in metres. */
import { sceneRule, type SpellZone } from './spell-scenes';
import { getRace } from '@/systems/dnd5e/ancestries';
import type { Character, Npc } from '@/types';
import { mapCellMetres } from './scenery-dimensions';
import { sceneryRect } from './scenery';
import { createSightTest } from './vision-rays';
import type {
  BattleMap,
  BattleMapCell,
  BattleMapObject,
  BattleFogCell,
  BattleToken,
  BattleSpellEffect,
  BattleActionRequest,
  DarknessLevel,
  DarknessRegion,
} from './types';
import type { SceneryLight } from './scenery-lighting';

export function normalizeDarkness(value: unknown): DarknessLevel {
  return value === 'none' || value === 'dim' || value === 'magical' ? value : 'dark';
}
export function ambientDarkness(map: BattleMap): DarknessLevel {
  return map.lighting === 'night'
    ? normalizeDarkness(map.darkness_level)
    : map.day_darkness_level === 'dim' ||
        map.day_darkness_level === 'dark' ||
        map.day_darkness_level === 'magical'
      ? map.day_darkness_level
      : 'none';
}
/** Painted regions are applied in order; the most recent region wins, including 'none'. */
export function darknessCells(map: BattleMap): Uint8Array {
  const width = Math.max(0, Math.floor(map.width));
  const height = Math.max(0, Math.floor(map.height));
  const levels = new Uint8Array(width * height);
  const levelCode: Record<DarknessLevel, number> = { none: 0, dim: 1, dark: 2, magical: 3 };
  levels.fill(levelCode[ambientDarkness(map)]);
  for (const region of map.darkness_regions ?? []) {
    if (
      !region ||
      !Number.isFinite(region.x) ||
      !Number.isFinite(region.y) ||
      !Number.isFinite(region.width) ||
      !Number.isFinite(region.height) ||
      !['none', 'dim', 'dark', 'magical'].includes(region.level)
    )
      continue;
    const x0 = Math.max(0, Math.floor(region.x));
    const y0 = Math.max(0, Math.floor(region.y));
    const x1 = Math.min(width, Math.ceil(region.x + region.width));
    const y1 = Math.min(height, Math.ceil(region.y + region.height));
    for (let y = y0; y < y1; y++)
      levels.fill(levelCode[region.level], y * width + x0, y * width + x1);
  }
  return levels;
}
export function regionFromCorners(
  a: { x: number; y: number },
  b: { x: number; y: number },
  level: DarknessLevel,
): DarknessRegion {
  return {
    id: '',
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x) + 1,
    height: Math.abs(a.y - b.y) + 1,
    level,
  };
}

export interface VisionObserver {
  x: number;
  y: number;
  darkvision: number;
  devilSight: number;
  trueSight: number;
  tokenId?: string;
  blindsight?: number;
  seeInvisible?: boolean;
  blind?: boolean;
  unconscious?: boolean;
  blindBeyond?: boolean;
}
export type VisionMap = {
  width: number;
  height: number;
  visible: Uint8Array;
  enabled: boolean;
  /** 0: normal colour, 1: lightly obscured, 2: darkvision in greyscale. */
  perceived?: Uint8Array;
  observers?: VisionObserver[];
  observerVisibility?: Uint8Array[];
  hiddenTokenIds?: string[];
  metres?: number;
};
export const visionToken = (vision: VisionMap | undefined, token: BattleToken) =>
  !vision?.hiddenTokenIds?.includes(token.id) &&
  visionCell(vision, Math.floor(token.x + token.size / 2), Math.floor(token.y + token.size / 2));
export const visionCell = (vision: VisionMap | undefined, x: number, y: number) =>
  !vision?.enabled ||
  (x >= 0 &&
    y >= 0 &&
    x < vision.width &&
    y < vision.height &&
    vision.visible[y * vision.width + x] === 1);

const normalizeName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
function featuresHaveDevilSight(sheet: Character['sheet']) {
  const choices = sheet.class_levels?.flatMap((c) => Object.values(c.choices ?? {}).flat()) ?? [];
  return (
    choices.some((c) => c === 'devil-sight') || /vis[aã]o diab[oó]lica/i.test(sheet.features || '')
  );
}
export function characterVision(character: Character | undefined, npc: Npc | undefined) {
  if (character) {
    const race = getRace(character.sheet.race_id || character.sheet.race);
    const darkvision = race?.darkvision ?? 0;
    const superior = /vis[aã]o no escuro superior/i.test(character.sheet.features || '') ? 36 : 0;
    return {
      darkvision: Math.max(darkvision, superior),
      devilSight: featuresHaveDevilSight(character.sheet) ? 36 : 0,
      trueSight: 0,
      blindsight: 0,
      seeInvisible: false,
      blindBeyond: false,
    };
  }
  const race = getRace(npc?.race),
    senses = npc?.stat_block?.senses;
  const text = normalizeName(npc?.abilities_text || '');
  const explicit = text.match(/visao no escuro.{0,25}?(\d+)\s*m/);
  return {
    darkvision:
      senses?.darkvision ?? Math.max(race?.darkvision ?? 0, explicit ? Number(explicit[1]) : 0),
    devilSight: senses?.devilSight ?? (text.includes('visao diabolica') ? 36 : 0),
    trueSight: senses?.trueSight ?? (text.includes('visao verdadeira') ? 36 : 0),
    blindsight: senses?.blindsight ?? 0,
    seeInvisible: senses?.seeInvisible ?? false,
    blindBeyond: senses?.blindBeyond ?? false,
  };
}

function effectRecipients(
  effect: BattleSpellEffect,
  tokens: BattleToken[],
  requests: BattleActionRequest[],
) {
  const request = requests.find((r) => r.id === effect.request_id);
  const ids = new Set(effect.definition?.scene_targets ?? request?.target_ids ?? []);
  if (ids.size) return tokens.filter((t) => ids.has(t.id));
  return tokens.filter(
    (t) =>
      t.x <= effect.target.x &&
      effect.target.x < t.x + t.size &&
      t.y <= effect.target.y &&
      effect.target.y < t.y + t.size,
  );
}
export function observerFromToken(
  token: BattleToken,
  characters: Character[],
  npcs: Npc[],
  effects: BattleSpellEffect[],
  requests: BattleActionRequest[],
  tokens: BattleToken[],
  conditionNames: string[] = [],
): VisionObserver {
  const c = characters.find((c) => c.id === token.character_id);
  const npc = npcs.find((n) => n.id === token.npc_id);
  const vision = characterVision(c, npc);
  for (const effect of effects) {
    if (
      !effect.active ||
      !effectRecipients(effect, tokens, requests).some((t) => t.id === token.id)
    )
      continue;
    const id = String(effect.definition?.entry?.catalog_id ?? normalizeName(effect.name));
    if (id === 'visao-no-escuro' || id.includes('visao no escuro') || id.includes('darkvision'))
      vision.darkvision = Math.max(vision.darkvision, 18);
    if (id === 'visao-da-verdade' || id.includes('visao da verdade') || id.includes('true seeing'))
      vision.trueSight = Math.max(vision.trueSight, 36);
    if (
      id === 'ver-invisibilidade' ||
      id === 'ver-o-invisivel' ||
      id === 'ver-invisibilidade' ||
      id.includes('ver o invis') ||
      id.includes('see invisibility')
    )
      vision.seeInvisible = true;
  }
  const conditions = [
    ...(c?.sheet.conditions ?? npc?.stat_block?.conditions ?? []),
    ...conditionNames,
  ];
  return {
    x: token.x + token.size / 2,
    y: token.y + token.size / 2,
    ...vision,
    tokenId: token.id,
    blind: conditions.includes('Cego'),
    unconscious:
      conditions.some((c) => ['Inconsciente', 'Morto', 'Dead'].includes(c)) ||
      (c?.sheet.hp_current ?? npc?.hp_current ?? 1) <= 0,
  };
}

/** Spell sources remain attached to their target token as that token moves. */
export function activeSpellLights(
  effects: BattleSpellEffect[],
  requests: BattleActionRequest[],
  tokens: BattleToken[],
  map: BattleMap,
): SceneryLight[] {
  const metres = Math.max(0.01, mapCellMetres(map));
  const result: SceneryLight[] = [];
  for (const effect of effects) {
    if (!effect.active) continue;
    const name = normalizeName(effect.name),
      rule = sceneRule(effect);
    const legacy =
      name === 'luz' || name === 'light'
        ? { bright: 6, dim: 6, anchor: 'target' }
        : name === 'luz do dia'
          ? { bright: 18, dim: 18, anchor: 'point' }
          : name === 'chama continua'
            ? { bright: 6, dim: 6, anchor: 'target' }
            : undefined;
    const light = rule.light ?? legacy;
    if (!light) continue;
    const radiusMetres = light.bright + light.dim;
    let recipients =
      light.anchor === 'caster'
        ? tokens.filter((t) => t.id === effect.token_id)
        : light.anchor === 'target'
          ? effectRecipients(effect, tokens, requests)
          : light.anchor === 'failedTargets'
            ? tokens.filter((t) => effect.definition.light_targets?.includes(t.id))
            : [];
    const positions = recipients.length
      ? recipients.map((t) => ({ x: t.x + t.size / 2, y: t.y + t.size / 2 }))
      : light.anchor === 'failedTargets'
        ? []
        : [{ x: effect.target.x + 0.5, y: effect.target.y + 0.5 }];
    for (let i = 0; i < positions.length; i++) {
      result.push({
        id: `spell:${effect.id}:${i}`,
        x: positions[i].x,
        y: positions[i].y,
        height: 1,
        radius: radiusMetres / metres,
        strength: light.bright === 0 ? 0.45 : 1,
        brightRadius: light.bright / metres,
        color: '#ffe8ae',
        magicLevel: Math.max(
          requests.find((r) => r.id === effect.request_id)?.resource_level ?? 0,
          Number(effect.definition?.entry?.level ?? 0),
          (
            {
              'luz-do-dia': 3,
              'chama-continua': 2,
              'escudo-de-fogo': 4,
              'raio-de-sol': 6,
            } as Record<string, number>
          )[String(effect.definition?.entry?.catalog_id)] ?? 0,
        ),
      });
    }
  }
  return result;
}

/** Recomputed on state changes, never in the drawing loop. Ordinary darkness does not
 * obstruct a ray to a distant light; walls, fog and magical darkness do. */
export function computeVision(
  map: BattleMap,
  cells: BattleMapCell[],
  objects: BattleMapObject[],
  fog: BattleFogCell[],
  lights: SceneryLight[],
  observers: VisionObserver[],
  zones: SpellZone[] = [],
): VisionMap {
  const width = Math.max(0, Math.floor(map.width)),
    height = Math.max(0, Math.floor(map.height));
  const visible = new Uint8Array(width * height),
    perceived = new Uint8Array(width * height).fill(3);
  if (!map.vision_enabled) return { width, height, visible, enabled: false };
  const levels = darknessCells(map),
    opaque = new Uint8Array(width * height),
    hidden = new Uint8Array(width * height),
    blocks = new Uint8Array(width * height);
  const valid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  for (const z of zones)
    for (const p of z.cells)
      if (valid(p.x, p.y)) {
        const i = p.y * width + p.x;
        if (z.darkness === 'absolute' || z.opaque) {
          levels[i] = 4;
          opaque[i] = 1;
        } else if (z.darkness === 'magical' && levels[i] !== 4) levels[i] = 3;
      }
  for (const c of cells) if (c.blocked && valid(c.x, c.y)) blocks[c.y * width + c.x] = 1;
  for (const c of fog) if (valid(c.x, c.y)) hidden[c.y * width + c.x] = 1;
  for (const o of objects) {
    if (!o.blocks_vision || !o.visible) continue;
    const r = sceneryRect(o);
    if (!r) continue;
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(height, Math.ceil(r.y + r.height)); y++)
      for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(width, Math.ceil(r.x + r.width)); x++)
        blocks[y * width + x] = 1;
  }
  const metres = Math.max(0.01, mapCellMetres(map));
  const ordinarySight = createSightTest(blocks, width, height);
  // Determine bright/dim illumination first. Light rays respect walls and opaque fog.
  const lightBlocks = new Uint8Array(blocks);
  for (let i = 0; i < opaque.length; i++) if (opaque[i]) lightBlocks[i] = 1;
  const lightSight = opaque.some(Boolean)
    ? createSightTest(lightBlocks, width, height)
    : ordinarySight;
  const hasMagicalDarkness = levels.includes(3);
  for (const light of lights) {
    const r = Math.max(0, Math.min(Math.hypot(width, height), light.radius)),
      lx = Math.floor(light.x),
      ly = Math.floor(light.y);
    if (!valid(lx, ly) || opaque[ly * width + lx]) continue;
    if (levels[ly * width + lx] === 3 && (light.magicLevel ?? 0) < 3) continue;
    const bright = light.brightRadius ?? r / 2;
    const lampBlocks =
      hasMagicalDarkness && (light.magicLevel ?? 0) < 3 ? new Uint8Array(lightBlocks) : lightBlocks;
    if (lampBlocks !== lightBlocks)
      for (let i = 0; i < levels.length; i++) if (levels[i] === 3) lampBlocks[i] = 1;
    const lampSight =
      lampBlocks === lightBlocks ? lightSight : createSightTest(lampBlocks, width, height);
    for (
      let y = Math.max(0, Math.floor(light.y - r));
      y < Math.min(height, Math.ceil(light.y + r));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(light.x - r));
        x < Math.min(width, Math.ceil(light.x + r));
        x++
      ) {
        const i = y * width + x,
          d = Math.hypot(x + 0.5 - light.x, y + 0.5 - light.y);
        if (d > r || levels[i] === 4 || (levels[i] === 3 && (light.magicLevel ?? 0) < 3)) continue;
        if (!lampSight(lx, ly, x, y)) continue;
        levels[i] = Math.min(levels[i], d <= bright ? 0 : 1);
      }
  }
  const views: Uint8Array[] = [];
  const hasSpecialDarkness = levels.some((level) => level >= 3);
  for (const eye of observers) {
    const view = new Uint8Array(width * height);
    views.push(view);
    const ex = Math.floor(eye.x),
      ey = Math.floor(eye.y);
    if (!valid(ex, ey) || eye.unconscious) continue;
    const sense = (x: number, y: number, r: number) =>
      Math.hypot(x + 0.5 - eye.x, y + 0.5 - eye.y) * metres <= r + 0.00001;
    const eyeBlocks = hasSpecialDarkness ? new Uint8Array(blocks) : blocks;
    if (hasSpecialDarkness)
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          if (
            (levels[i] === 4 && !sense(x, y, eye.blindsight ?? 0)) ||
            (levels[i] === 3 &&
              !sense(x, y, Math.max(eye.devilSight, eye.trueSight, eye.blindsight ?? 0)))
          )
            eyeBlocks[i] = 1;
        }
    const eyeSight =
      eyeBlocks === blocks ? ordinarySight : createSightTest(eyeBlocks, width, height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (hidden[i]) continue;
        const d = Math.hypot(x + 0.5 - eye.x, y + 0.5 - eye.y) * metres,
          level = levels[i],
          blind = (eye.blindsight ?? 0) > 0 && d <= (eye.blindsight ?? 0) + 0.00001;
        if ((eye.blind || eye.blindBeyond) && !blind) continue;
        if (
          !blind &&
          (levels[ey * width + ex] === 4 ||
            (levels[ey * width + ex] === 3 &&
              (Math.max(eye.devilSight, eye.trueSight) <= 0 ||
                !sense(ex, ey, Math.max(eye.devilSight, eye.trueSight)))))
        )
          continue;
        let shade = 0;
        if (!blind) {
          if (level === 4) continue;
          if (level === 3) {
            if (
              Math.max(eye.devilSight, eye.trueSight) <= 0 ||
              d > Math.max(eye.devilSight, eye.trueSight)
            )
              continue;
          } else if (level === 2) {
            if (d <= Math.max(eye.devilSight, eye.trueSight)) shade = 0;
            else if (d <= eye.darkvision) shade = 2;
            else continue;
          } else if (level === 1) shade = d <= Math.max(eye.darkvision, eye.trueSight) ? 0 : 1;
        }
        if (!eyeSight(ex, ey, x, y)) continue;
        view[i] = 1;
        visible[i] = 1;
        perceived[i] = Math.min(perceived[i], shade);
      }
  }
  return {
    width,
    height,
    visible,
    perceived,
    enabled: true,
    observers,
    observerVisibility: views,
    metres,
  };
}

/** Invisibility is independent of the terrain's illumination. GM-hidden tokens remain
 * protected by RLS and the viewport's explicit visible flag. */
export function withCreatureVision(
  vision: VisionMap,
  tokens: BattleToken[],
  conditions: Record<string, string[]>,
  effects: BattleSpellEffect[],
): VisionMap {
  if (!vision.enabled) return vision;
  const outlined = new Set(
    effects
      .filter((e) => e.active && e.definition.entry?.catalog_id === 'fogo-das-fadas')
      .flatMap((e) => e.definition.light_targets ?? []),
  );
  const hiddenTokenIds = tokens
    .filter((t) => {
      const invisible =
        conditions[t.id]?.includes('Invisível') ||
        effects.some(
          (e) =>
            e.active &&
            ['invisibilidade', 'invisibilidade-maior'].includes(
              String(e.definition.entry?.catalog_id),
            ) &&
            e.definition.scene_targets?.includes(t.id),
        );
      if (!invisible || outlined.has(t.id)) return false;
      const x = Math.floor(t.x + t.size / 2),
        y = Math.floor(t.y + t.size / 2);
      return !(vision.observers ?? []).some((eye, j) => {
        if (!vision.observerVisibility?.[j]?.[y * vision.width + x]) return false;
        const d = Math.hypot(x + 0.5 - eye.x, y + 0.5 - eye.y) * mapMetresForVision(vision);
        return eye.seeInvisible || d <= Math.max(eye.trueSight, eye.blindsight ?? 0);
      });
    })
    .map((t) => t.id);
  return { ...vision, hiddenTokenIds };
}
function mapMetresForVision(vision: VisionMap) {
  return (vision as VisionMap & { metres?: number }).metres ?? 1.5;
}
