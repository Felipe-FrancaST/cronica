import catalogue from './spell-scenes.json';
import { previewEffect } from './effects';
import type { BattleMap, BattleSpellEffect, BattleToken, GridPoint, BattleMapCell } from './types';
export interface SpellScene {
  drift?: { metres: number; mode: 'away' | 'bearing' };
  light?: {
    bright: number;
    dim: number;
    anchor: 'point' | 'target' | 'caster' | 'failedTargets';
    count?: number;
  };
  visual?: string;
  persistent?: boolean;
  anchor?: 'caster';
  rounds?: number;
  opaque?: boolean;
  darkness?: 'magical' | 'absolute';
  difficult?: boolean;
  triggers?: string[];
  manual?: string;
}
export interface SpellZone {
  id: string;
  name: string;
  cells: GridPoint[];
  color: string;
  visual: string;
  opaque: boolean;
  darkness?: SpellScene['darkness'];
  difficult: boolean;
}
export function sceneRule(effect: BattleSpellEffect): SpellScene {
  const id = effect.definition?.entry?.catalog_id as keyof typeof catalogue;
  return effect.definition?.scene ?? (catalogue[id] as SpellScene) ?? {};
}
export const ZONE_COLORS: Record<string, string> = {
  fire: '#ed7739',
  mist: '#a5b9ae',
  darkness: '#675485',
  void: '#49385e',
  radiant: '#eddf9b',
  blades: '#b4d4dc',
  thorns: '#83a15c',
  web: '#c7cfc3',
  vines: '#69a272',
  spirit: '#9ed8db',
  ice: '#8ecadf',
  barrier: '#b2a68c',
  grease: '#a88b5e',
  arcane: '#9995dd',
};
export function spellZones(
  effects: BattleSpellEffect[],
  tokens: BattleToken[],
  map: BattleMap,
): SpellZone[] {
  return effects
    .filter((e) => e.active && e.map_id === map.id)
    .flatMap((e) => {
      const rule = sceneRule(e),
        caster = tokens.find((t) => t.id === e.token_id);
      if (!rule.persistent || !rule.visual || !caster) return [];
      const actor =
        rule.anchor === 'caster'
          ? caster
          : { ...caster, ...(e.definition.scene_origin ?? e.target) };
      const definition = {
        ...e.definition,
        origin: rule.anchor === 'caster' ? ('self' as const) : e.definition.origin,
      };
      return [
        {
          id: e.id,
          name: e.name,
          cells: previewEffect(map, actor, e.target, definition, []).cells,
          color: ZONE_COLORS[rule.visual] ?? ZONE_COLORS.arcane,
          visual: rule.visual,
          opaque: !!rule.opaque,
          darkness: rule.darkness,
          difficult: !!rule.difficult,
        },
      ];
    });
}
export function spellTerrainCells(cells: BattleMapCell[], zones: SpellZone[], map: BattleMap) {
  const result = new Map(cells.map((c) => [`${c.x}:${c.y}`, c]));
  for (const zone of zones.filter((z) => z.difficult))
    for (const p of zone.cells) {
      const k = `${p.x}:${p.y}`,
        old = result.get(k);
      result.set(k, {
        id: `spell:${zone.id}:${k}`,
        map_id: map.id,
        z: 0,
        terrain_type: 'difficult',
        blocked: false,
        ...old,
        ...p,
        movement_cost: Math.max(2, old?.movement_cost ?? 1),
      } as BattleMapCell);
    }
  return [...result.values()];
}
