import type { BattleMap, BattleMapCell } from './types';
/** Crawling adds one unit to each unit of terrain cost; difficult terrain costs 3. */
export function conditionMovementCells(
  cells: BattleMapCell[],
  map: BattleMap,
  conditions: readonly string[],
): BattleMapCell[] {
  if (!conditions.includes('Caído')) return cells;
  const existing = new Map(cells.map((c) => [`${c.x}:${c.y}`, c])),
    result: BattleMapCell[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const old = existing.get(`${x}:${y}`);
      result.push({
        ...old,
        id: old?.id ?? `crawl:${x}:${y}`,
        map_id: map.id,
        x,
        y,
        z: old?.z ?? 0,
        terrain_type: old?.terrain_type ?? 'normal',
        blocked: old?.blocked ?? false,
        movement_cost: Math.max(1, old?.movement_cost ?? 1) + 1,
        metadata: old?.metadata ?? {},
        created_at: old?.created_at ?? '',
        updated_at: old?.updated_at ?? '',
      });
    }
  return result;
}
