import type { GridPoint, BattleToken, BattleMap, BattleSnapshot } from './types';
export function pointKey(point: GridPoint) {
  return `${point.x}:${point.y}`;
}
export function firstFreeCell(
  map: BattleMap,
  tokens: BattleToken[],
  cells: BattleSnapshot['cells'],
  size = 1,
): GridPoint {
  const local = tokens.filter((t) => t.map_id === map.id);
  const blocked = new Set(
    cells.filter((c) => c.map_id === map.id && c.blocked).map((c) => pointKey(c)),
  );
  for (let y = 0; y + size <= map.height; y++)
    for (let x = 0; x + size <= map.width; x++) {
      if (
        local.some((t) => x < t.x + t.size && x + size > t.x && y < t.y + t.size && y + size > t.y)
      )
        continue;
      let clear = true;
      for (let yy = y; yy < y + size && clear; yy++)
        for (let xx = x; xx < x + size; xx++)
          if (blocked.has(`${xx}:${yy}`)) {
            clear = false;
            break;
          }
      if (clear) return { x, y };
    }
  throw new Error('Não há célula livre para adicionar outro token neste mapa.');
}
