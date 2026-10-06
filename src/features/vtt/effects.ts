import profiles from './spell-effects.json';
import type { InventoryItem, DndSheet, Spell } from '@/systems/dnd5e/types';
import { classLevels } from '@/systems/dnd5e/progression';
import { spellProfile } from '@/systems/dnd5e/spellcasting';
import type { BattleMap, BattleToken, GridPoint } from './types';

export type EffectShape = 'single' | 'self' | 'sphere' | 'cone' | 'line' | 'cube';
export interface CombatEffect {
  shape: EffectShape;
  kind: 'damage' | 'healing' | 'temporary' | 'utility';
  range: number; // meters; converted at the grid boundary
  size: number; // radius, length, or cube side in meters
  width: number;
  origin: 'self' | 'point';
  dice: string;
  damageType: string;
  ability: boolean;
  upcast: string;
  cantripScale: boolean;
  save: string;
  halfOnSave: boolean;
  selective: boolean;
  maxTargets: number;
  timing: 'immediate' | 'trigger';
  review: boolean;
  note: string;
  sizePerSlot?: number;
  pool?: number;
  restoreFull?: boolean;
  pulseDice?: string;
  pulseUpcast?: string;
  pulseCost?: 'action' | 'bonus';
  pulseOnce?: boolean;
  lifeSteal?: number;
}
export interface EffectPreview {
  cells: GridPoint[];
  affected: string[];
  kind: CombatEffect['kind'];
  target: GridPoint;
  valid: boolean;
}
export const EMPTY_EFFECT: CombatEffect = {
  shape: 'single',
  kind: 'utility',
  range: 9,
  size: 0,
  width: 1.5,
  origin: 'point',
  dice: '',
  damageType: '',
  ability: false,
  upcast: '',
  cantripScale: false,
  save: '',
  halfOnSave: false,
  selective: false,
  maxTargets: 1,
  timing: 'immediate',
  review: true,
  note: 'O mestre revisa os efeitos especiais descritos na magia.',
};
export function spellEffect(spell: Pick<Spell, 'catalog_id'>): CombatEffect {
  return {
    ...EMPTY_EFFECT,
    ...(profiles as Record<string, Partial<CombatEffect>>)[spell.catalog_id ?? ''],
  };
}
export function weaponEffect(item: InventoryItem, sheet: DndSheet): CombatEffect {
  const dex = Math.floor((sheet.abilities.dex - 10) / 2);
  const str = Math.floor((sheet.abilities.str - 10) / 2);
  const text = `${item.name} ${item.notes}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const ranged = item.weapon_mode === 'ranged' || /arco|besta|funda|zarabatana/.test(text);
  const mod = item.weapon_ability
    ? Math.floor((sheet.abilities[item.weapon_ability] - 10) / 2)
    : ranged
      ? dex
      : /acuidade|adaga|rapieira/.test(text)
        ? Math.max(str, dex)
        : str;
  const base = item.damage?.match(/\b\d+d\d+(?:\s*[+-]\s*\d+)?/)?.[0].replace(/\s/g, '') ?? '1';
  const reach =
    item.weapon_range ??
    (ranged
      ? Number(text.match(/alcance\s+(\d+)/)?.[1] ?? 24)
      : /alcance|glaive|alabarda|chicote/.test(text)
        ? 3
        : 1.5);
  const damageType =
    item.damage?.match(
      /cortante|perfurante|concuss[aã]o|fogo|frio|radiante|necr[oó]tico|veneno|[aá]cido|trovejante|el[eé]trico|ps[ií]quico|energia/i,
    )?.[0] ?? '';
  return {
    ...EMPTY_EFFECT,
    kind: 'damage',
    range: reach,
    dice: `${base}${mod >= 0 ? '+' : ''}${mod}`,
    damageType,
    review: !item.damage,
    note: 'O mestre decide o acerto, vantagem e modificadores especiais.',
  };
}
export function effectDice(
  effect: CombatEffect,
  baseLevel: number,
  castLevel: number,
  characterLevel: number,
  modifier: number,
) {
  let dice = effect.dice;
  if (effect.cantripScale && baseLevel === 0) {
    const scale = characterLevel >= 17 ? 4 : characterLevel >= 11 ? 3 : characterLevel >= 5 ? 2 : 1;
    dice = dice.replace(/(\d+)d(\d+)/g, (_, n, sides) => `${Number(n) * scale}d${sides}`);
  }
  if (effect.upcast && castLevel > baseLevel)
    for (let i = baseLevel; i < castLevel; i++) dice += `+${effect.upcast}`;
  if (effect.ability) dice += `${modifier >= 0 ? '+' : ''}${modifier}`;
  return dice.replace(/\+\-/g, '-');
}
export function scaledSpellEffect(
  effect: CombatEffect,
  baseLevel: number,
  castLevel: number,
  characterLevel: number,
  modifier: number,
): CombatEffect {
  return {
    ...effect,
    dice: effectDice(effect, baseLevel, castLevel, characterLevel, modifier),
    size: effect.size + Math.max(0, castLevel - baseLevel) * (effect.sizePerSlot ?? 0),
  };
}
export function characterSpellEffect(
  sheet: DndSheet,
  spell: Spell,
  castLevel: number,
): CombatEffect {
  const effect = spellEffect(spell),
    origin = spellProfile(sheet, spell);
  const mod = origin.ability ? Math.floor((sheet.abilities[origin.ability] - 10) / 2) : 0;
  const scaled = scaledSpellEffect(effect, spell.level, castLevel, sheet.level, mod);
  let bonus = 0;
  const levels = classLevels(sheet);
  if (
    effect.kind === 'healing' &&
    spell.level > 0 &&
    levels.some((c) => c.class_id === 'cleric' && c.subclass_id === 'life')
  )
    bonus += 2 + castLevel;
  if (
    effect.kind === 'damage' &&
    origin.classId === 'wizard' &&
    spell.school === 'Evocação' &&
    levels.some((c) => c.class_id === 'wizard' && c.subclass_id === 'evocation' && c.level >= 10)
  )
    bonus += mod;
  const dragon = levels.find(
    (c) => c.class_id === 'sorcerer' && c.subclass_id === 'draconic' && c.level >= 6,
  );
  if (
    effect.kind === 'damage' &&
    origin.classId === 'sorcerer' &&
    dragon?.choices?.dragon?.[0]?.toLowerCase().includes(effect.damageType.toLowerCase()) &&
    effect.damageType
  )
    bonus += mod;
  return bonus && scaled.dice
    ? { ...scaled, dice: `${scaled.dice}${bonus >= 0 ? '+' : ''}${bonus}` }
    : scaled;
}
export function metersPerCell(map: BattleMap) {
  return map.scale_unit === 'ft' ? map.scale_per_cell * 0.3 : map.scale_per_cell;
}

/** Ground footprints use cell centers, including the full footprint of Large creatures.
 * This same predicate is implemented in SQL; database tests check parity. */
export function pointInEffect(
  point: GridPoint,
  actor: BattleToken,
  target: GridPoint,
  e: CombatEffect,
  scale: number,
) {
  const origin =
    e.origin === 'self'
      ? { x: actor.x + actor.size / 2 - 0.5, y: actor.y + actor.size / 2 - 0.5 }
      : target;
  const dx = (point.x - origin.x) * scale,
    dy = (point.y - origin.y) * scale;
  if (e.shape === 'self')
    return (
      point.x >= actor.x &&
      point.x < actor.x + actor.size &&
      point.y >= actor.y &&
      point.y < actor.y + actor.size
    );
  if (e.shape === 'single') return point.x === target.x && point.y === target.y;
  if (e.shape === 'sphere') return dx * dx + dy * dy <= e.size * e.size + 0.00001;
  let vx = target.x - origin.x,
    vy = target.y - origin.y;
  const norm = Math.hypot(vx, vy) || 1;
  if (!vx && !vy) vy = 1;
  vx /= norm;
  vy /= norm;
  const along = dx * vx + dy * vy,
    across = Math.abs(dx * vy - dy * vx);
  if (e.shape === 'cone')
    return along > 0 && Math.hypot(dx, dy) <= e.size + 0.00001 && across <= along / 2 + 0.00001;
  if (e.shape === 'line')
    return along > 0 && along <= e.size + 0.00001 && across <= e.width / 2 + 0.00001;
  if (e.origin === 'self')
    return along > 0 && along <= e.size + 0.00001 && across <= e.size / 2 + 0.00001;
  return Math.abs(dx) <= e.size / 2 + 0.00001 && Math.abs(dy) <= e.size / 2 + 0.00001;
}
export function previewEffect(
  map: BattleMap,
  actor: BattleToken,
  target: GridPoint,
  e: CombatEffect,
  tokens: BattleToken[],
): EffectPreview {
  const scale = metersPerCell(map);
  const center = e.origin === 'self' ? actor : target;
  const radius = Math.ceil(Math.max(e.size, e.width, actor.size * scale) / scale) + 2;
  const cells: GridPoint[] = [];
  const minX = Math.max(0, center.x - radius),
    maxX = Math.min(map.width - 1, center.x + radius);
  const minY = Math.max(0, center.y - radius),
    maxY = Math.min(map.height - 1, center.y + radius);
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++)
      if (cells.length < 20000 && pointInEffect({ x, y }, actor, target, e, scale))
        cells.push({ x, y });
  const affected = tokens
    .filter((t) => {
      for (let y = t.y; y < t.y + t.size; y++)
        for (let x = t.x; x < t.x + t.size; x++)
          if (pointInEffect({ x, y }, actor, target, e, scale)) return true;
      return false;
    })
    .map((t) => t.id);
  // Touch/melee distances are measured between the nearest occupied squares.
  const dx = Math.max(0, actor.x - target.x, target.x - (actor.x + actor.size - 1));
  const dy = Math.max(0, actor.y - target.y, target.y - (actor.y + actor.size - 1));
  const distance =
    (map.diagonal_rule === 'sqrt2'
      ? Math.hypot(dx, dy)
      : map.diagonal_rule === 'five-ten-five'
        ? Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2)
        : Math.max(dx, dy)) * scale;
  return {
    cells,
    affected,
    target,
    kind: e.kind,
    valid: e.origin === 'self' || distance <= e.range + 0.00001,
  };
}
export const FACTION_COLORS = { ally: '#50be93', enemy: '#e57070', neutral: '#deb060' };
export const FACTION_LABELS = { ally: 'Aliado', enemy: 'Inimigo', neutral: 'Neutro' };
export function factionColor(token: BattleToken) {
  return FACTION_COLORS[token.faction ?? (token.npc_id ? 'neutral' : 'ally')];
}
