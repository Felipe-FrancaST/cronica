import type { GridPoint } from './types';
import type { TerrainTool } from './viewport-types';
import type { EffectPreview } from './effects';

export function isAreaTool(tool: TerrainTool) {
  return ['normal', 'difficult', 'blocked', 'custom', 'erase-scenery'].includes(tool);
}
export function brushCells(
  map: { width: number; height: number },
  point: GridPoint | null,
  width: number,
  height: number,
) {
  if (
    !point ||
    !Number.isInteger(point.x) ||
    !Number.isInteger(point.y) ||
    point.x < 0 ||
    point.y < 0
  )
    return [];
  const w = Math.min(16, Math.max(1, Math.floor(width) || 1));
  const h = Math.min(16, Math.max(1, Math.floor(height) || 1));
  const cells: GridPoint[] = [];
  for (let y = point.y; y < Math.min(map.height, point.y + h); y++)
    for (let x = point.x; x < Math.min(map.width, point.x + w); x++) cells.push({ x, y });
  return cells;
}
export function terrainPreview(
  map: { width: number; height: number },
  point: GridPoint | null,
  tool: TerrainTool,
  width = 1,
  height = 1,
): EffectPreview | null {
  if (!point || !isAreaTool(tool)) return null;
  const cells = brushCells(map, point, width, height);
  return {
    cells,
    target: point,
    affected: [],
    kind: tool === 'erase-scenery' ? 'damage' : 'utility',
    valid: cells.length > 0,
  };
}
