/** Per-player D&D-style grid visibility. All distances and rule overrides are in metres. */
import { getRace } from '@/systems/dnd5e/ancestries';
import type { Character, Npc } from '@/types';
import { mapCellMetres } from './scenery-dimensions';
import { sceneryRect } from './scenery';
import type { BattleMap, BattleMapCell, BattleMapObject, BattleFogCell, BattleToken, BattleSpellEffect, BattleActionRequest, DarknessLevel, DarknessRegion } from './types';
import type { SceneryLight } from './scenery-lighting';

export function normalizeDarkness(value: unknown): DarknessLevel {
  return value === 'none' || value === 'dim' || value === 'magical' ? value : 'dark';
}
export function ambientDarkness(map: BattleMap): DarknessLevel {
  return map.lighting === 'night' ? normalizeDarkness(map.darkness_level) :
    (map.day_darkness_level === 'dim' || map.day_darkness_level === 'dark' || map.day_darkness_level === 'magical' ? map.day_darkness_level : 'none');
}
/** Painted regions are applied in order; the most recent region wins, including 'none'. */
export function darknessCells(map: BattleMap): Uint8Array {
  const width = Math.max(0, Math.floor(map.width));
  const height = Math.max(0, Math.floor(map.height));
  const levels = new Uint8Array(width * height);
  const levelCode: Record<DarknessLevel, number> = { none: 0, dim: 1, dark: 2, magical: 3 };
  levels.fill(levelCode[ambientDarkness(map)]);
  for (const region of map.darkness_regions ?? []) {
    if (!region || !Number.isFinite(region.x) || !Number.isFinite(region.y) ||
        !Number.isFinite(region.width) || !Number.isFinite(region.height) ||
        !['none', 'dim', 'dark', 'magical'].includes(region.level)) continue;
    const x0 = Math.max(0, Math.floor(region.x));
    const y0 = Math.max(0, Math.floor(region.y));
    const x1 = Math.min(width, Math.ceil(region.x + region.width));
    const y1 = Math.min(height, Math.ceil(region.y + region.height));
    for (let y = y0; y < y1; y++) levels.fill(levelCode[region.level], y * width + x0, y * width + x1);
  }
  return levels;
}
export function regionFromCorners(a: {x:number;y:number}, b: {x:number;y:number}, level: DarknessLevel): DarknessRegion {
  return { id: '', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1, level };
}

export interface VisionObserver { x: number; y: number; darkvision: number; devilSight: number; trueSight: number; }
export type VisionMap = { width: number; height: number; visible: Uint8Array; enabled: boolean };
export const visionCell = (vision: VisionMap | undefined, x: number, y: number) =>
  !vision?.enabled || (x >= 0 && y >= 0 && x < vision.width && y < vision.height && vision.visible[y * vision.width + x] === 1);

const normalizeName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function featuresHaveDevilSight(sheet: Character['sheet']) {
  const choices = sheet.class_levels?.flatMap((c) => Object.values(c.choices ?? {}).flat()) ?? [];
  return choices.some((c) => c === 'devil-sight') || /vis[aã]o diab[oó]lica/i.test(sheet.features || '');
}
export function characterVision(character: Character | undefined, npc: Npc | undefined) {
  if (character) {
    const race = getRace(character.sheet.race_id || character.sheet.race);
    const darkvision = race?.darkvision ?? 0;
    const superior = /vis[aã]o no escuro superior/i.test(character.sheet.features || '') ? 36 : 0;
    return { darkvision: Math.max(darkvision, superior), devilSight: featuresHaveDevilSight(character.sheet) ? 36 : 0, trueSight: 0 };
  }
  const race = getRace(npc?.race);
  const text = normalizeName(npc?.abilities_text || '');
  const explicit = text.match(/visao no escuro.{0,25}?(\d+)\s*m/);
  return {
    darkvision: Math.max(race?.darkvision ?? 0, explicit ? Number(explicit[1]) : 0),
    devilSight: text.includes('visao diabolica') ? 36 : 0,
    trueSight: text.includes('visao verdadeira') ? 36 : 0,
  };
}

function effectRecipients(effect: BattleSpellEffect, tokens: BattleToken[], requests: BattleActionRequest[]) {
  const request = requests.find((r) => r.id === effect.request_id);
  const ids = new Set(request?.target_ids ?? []);
  if (ids.size) return tokens.filter((t) => ids.has(t.id));
  return tokens.filter((t) => t.x <= effect.target.x && effect.target.x < t.x + t.size && t.y <= effect.target.y && effect.target.y < t.y + t.size);
}
export function observerFromToken(token: BattleToken, characters: Character[], npcs: Npc[], effects: BattleSpellEffect[], requests: BattleActionRequest[], tokens: BattleToken[]): VisionObserver {
  const c = characters.find((c) => c.id === token.character_id);
  const npc = npcs.find((n) => n.id === token.npc_id);
  const vision = characterVision(c, npc);
  for (const effect of effects) {
    if (!effect.active || !effectRecipients(effect, tokens, requests).some((t) => t.id === token.id)) continue;
    const id = normalizeName(effect.name);
    if (id.includes('visao no escuro') || id.includes('darkvision')) vision.darkvision = Math.max(vision.darkvision, 18);
    if (id.includes('visao da verdade') || id.includes('true seeing')) vision.trueSight = Math.max(vision.trueSight, 36);
  }
  return { x: token.x + token.size / 2, y: token.y + token.size / 2, ...vision };
}

/** Spell sources remain attached to their target token as that token moves. */
export function activeSpellLights(
  effects: BattleSpellEffect[], requests: BattleActionRequest[], tokens: BattleToken[], map: BattleMap,
): SceneryLight[] {
  const metres = Math.max(0.01, mapCellMetres(map));
  const result: SceneryLight[] = [];
  for (const effect of effects) {
    if (!effect.active) continue;
    const name = normalizeName(effect.name);
    let radiusMetres = 0;
    if (name === 'luz' || name === 'light') radiusMetres = 12;
    else if (name === 'luz do dia' || name === 'daylight') radiusMetres = 36;
    else if (name === 'luzes dancantes' || name === 'dancing lights') radiusMetres = 3;
    else if (name === 'chama continua' || name === 'continual flame') radiusMetres = 12;
    if (!radiusMetres) continue;
    const recipients = effectRecipients(effect, tokens, requests);
    const positions = recipients.length
      ? recipients.map((t) => ({ x: t.x + t.size / 2, y: t.y + t.size / 2 }))
      : [{ x: effect.target.x + 0.5, y: effect.target.y + 0.5 }];
    for (let i = 0; i < positions.length; i++) {
      result.push({
        id: `spell:${effect.id}:${i}`,
        x: positions[i].x, y: positions[i].y, height: 1,
        radius: radiusMetres / metres, strength: name.includes('dia') ? 1.4 : 1,
        color: '#ffe8ae',
      });
    }
  }
  return result;
}

function hasLineOfSight(blocks: Uint8Array, width: number, height: number, fromX: number, fromY: number, toX: number, toY: number) {
  let x = fromX, y = fromY;
  const dx = Math.abs(toX - x), dy = Math.abs(toY - y);
  const sx = x < toX ? 1 : -1, sy = y < toY ? 1 : -1;
  let err = dx - dy;
  while (x !== toX || y !== toY) {
    const prevX = x, prevY = y, twice = err * 2;
    if (twice > -dy) { err -= dy; x += sx; }
    if (twice < dx) { err += dx; y += sy; }
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    // A blocked target may be seen, but nothing behind it may be seen.
    if (x !== toX || y !== toY) {
      if (blocks[y * width + x]) return false;
      // Prevent diagonal peeking through a two-wall corner.
      if (x !== prevX && y !== prevY && blocks[prevY * width + x] && blocks[y * width + prevX]) return false;
    }
  }
  return true;
}

/** Recomputed on changes to tokens, scenery, effects or settings — not on each frame. */
export function computeVision(map: BattleMap, cells: BattleMapCell[], objects: BattleMapObject[], fog: BattleFogCell[], lights: SceneryLight[], observers: VisionObserver[]): VisionMap {
  const width = Math.max(0, Math.floor(map.width)), height = Math.max(0, Math.floor(map.height));
  const visible = new Uint8Array(width * height);
  if (!map.vision_enabled) return { width, height, visible, enabled: false };
  const levels = darknessCells(map);
  // With no dark cells, penumbra is cosmetic and sight needs no expensive mask.
  const enabled = levels.some((level) => level >= 2);
  if (!enabled) return { width, height, visible, enabled: false };
  const blocks = new Uint8Array(width * height), hidden = new Uint8Array(width * height);
  for (const c of cells) if (c.blocked && c.x >= 0 && c.y >= 0 && c.x < width && c.y < height) blocks[c.y * width + c.x] = 1;
  for (const c of fog) if (c.x >= 0 && c.y >= 0 && c.x < width && c.y < height) hidden[c.y * width + c.x] = 1;
  for (const object of objects) {
    if (!object.blocks_vision || !object.visible) continue;
    const r = sceneryRect(object);
    if (!r) continue;
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(height, Math.ceil(r.y + r.height)); y++)
      for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(width, Math.ceil(r.x + r.width)); x++) blocks[y * width + x] = 1;
  }
  // Bright areas and penumbra remain visible, including during daytime with isolated dark regions.
  // Dim light obscures perception in D&D, but does not impose a hard maximum sight distance.
  for (let i = 0; i < levels.length; i++) if (levels[i] <= 1 && !hidden[i]) visible[i] = 1;
  if (!observers.length || !levels.some((v) => v >= 2)) return { width, height, visible, enabled: true };
  const metres = Math.max(0.01, mapCellMetres(map));
  const lit = new Uint8Array(width * height);
  // Nonmagical darkness responds to real light; magical darkness ignores ordinary lights.
  for (const light of levels.includes(2) ? lights : []) {
    const lx = Math.floor(light.x), ly = Math.floor(light.y), radius = Math.max(0, Math.min(120, light.radius));
    for (let y = Math.max(0, Math.floor(light.y - radius)); y < Math.min(height, Math.ceil(light.y + radius)); y++)
      for (let x = Math.max(0, Math.floor(light.x - radius)); x < Math.min(width, Math.ceil(light.x + radius)); x++) {
        const i = y * width + x;
        if (levels[i] !== 2) continue;
        const dx = x + 0.5 - light.x, dy = y + 0.5 - light.y;
        if (dx * dx + dy * dy <= radius * radius && hasLineOfSight(blocks, width, height, lx, ly, x, y)) lit[i] = 1;
      }
  }
  for (const eye of observers) {
    const ex = Math.floor(eye.x), ey = Math.floor(eye.y);
    if (ex < 0 || ey < 0 || ex >= width || ey >= height) continue;
    const range = Math.max(eye.darkvision, eye.devilSight, eye.trueSight, lights.length ? 60 : 0);
    const r = Math.min(Math.hypot(width, height), range / metres);
    if (!hidden[ey * width + ex]) visible[ey * width + ex] = 1;
    for (let y = Math.max(0, Math.floor(eye.y - r)); y < Math.min(height, Math.ceil(eye.y + r)); y++)
      for (let x = Math.max(0, Math.floor(eye.x - r)); x < Math.min(width, Math.ceil(eye.x + r)); x++) {
        const index = y * width + x, level = levels[index];
        if (level < 2 || hidden[index] || visible[index]) continue;
        const distance = Math.hypot(x + 0.5 - eye.x, y + 0.5 - eye.y) * metres;
        const sightRange = level === 3 ? Math.max(eye.devilSight, eye.trueSight) : Math.max(eye.darkvision, eye.devilSight, eye.trueSight);
        if (distance > sightRange && !(level === 2 && lit[index] && distance <= 60)) continue;
        if (hasLineOfSight(blocks, width, height, ex, ey, x, y)) visible[index] = 1;
      }
  }
  return { width, height, visible, enabled: true };
}
