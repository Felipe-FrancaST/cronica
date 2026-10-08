/** Per-player D&D-style grid visibility. All distances and rule overrides are in metres. */
import { getRace } from '@/systems/dnd5e/ancestries';
import type { Character, Npc } from '@/types';
import { mapCellMetres } from './scenery-dimensions';
import { sceneryRect } from './scenery';
import type { BattleMap, BattleMapCell, BattleMapObject, BattleFogCell, BattleToken, BattleSpellEffect, BattleActionRequest } from './types';
import type { SceneryLight } from './scenery-lighting';

export type DarknessLevel = 'dim' | 'dark' | 'magical';
export function normalizeDarkness(value: unknown): DarknessLevel {
  return value === 'dim' || value === 'magical' ? value : 'dark';
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
  const enabled = map.lighting === 'night' && map.vision_enabled === true;
  if (!enabled) return { width, height, visible, enabled: false };
  if (!observers.length) return { width, height, visible, enabled: true };
  const metres = Math.max(0.01, mapCellMetres(map));
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
  const darkness = normalizeDarkness(map.darkness_level);
  const lit = new Uint8Array(width * height);
  // Precompute illumination once. Light does not shine through opaque blockers.
  if (darkness !== 'magical') for (const light of lights) {
    const lx = Math.floor(light.x), ly = Math.floor(light.y), radius = Math.min(120, light.radius);
    for (let y = Math.max(0, Math.floor(light.y - radius)); y < Math.min(height, Math.ceil(light.y + radius)); y++)
      for (let x = Math.max(0, Math.floor(light.x - radius)); x < Math.min(width, Math.ceil(light.x + radius)); x++) {
        const dx = x + 0.5 - light.x, dy = y + 0.5 - light.y;
        if (dx * dx + dy * dy > radius * radius) continue;
        if (hasLineOfSight(blocks, width, height, lx, ly, x, y)) lit[y * width + x] = 1;
      }
  }
  for (const eye of observers) {
    const ex = Math.floor(eye.x), ey = Math.floor(eye.y);
    if (ex < 0 || ey < 0 || ex >= width || ey >= height) continue;
    const darkRange = darkness === 'magical' ? Math.max(eye.devilSight, eye.trueSight) : Math.max(eye.darkvision, eye.devilSight, eye.trueSight);
    const naturalRange = darkness === 'dim' ? 18 : 0;
    const maxRange = Math.max(darkRange, naturalRange, darkness === 'magical' ? 0 : lights.length ? 60 : 0);
    const r = Math.min(Math.hypot(width, height), maxRange / metres);
    visible[ey * width + ex] = hidden[ey * width + ex] ? 0 : 1;
    for (let y = Math.max(0, Math.floor(eye.y - r)); y < Math.min(height, Math.ceil(eye.y + r)); y++)
      for (let x = Math.max(0, Math.floor(eye.x - r)); x < Math.min(width, Math.ceil(eye.x + r)); x++) {
        const index = y * width + x;
        if (hidden[index] || visible[index]) continue;
        const distance = Math.hypot(x + 0.5 - eye.x, y + 0.5 - eye.y) * metres;
        if (distance > maxRange) continue;
        const magical = darkness === 'magical';
        const canSee = distance <= darkRange || (!magical && (lit[index] || distance <= naturalRange));
        if (canSee && hasLineOfSight(blocks, width, height, ex, ey, x, y)) visible[index] = 1;
      }
  }
  return { width, height, visible, enabled: true };
}
