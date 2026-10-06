import type { BattleFogCell, GridPoint } from './types';

export function fogCells(
  map: { width: number; height: number },
  point: GridPoint | null,
  size: number,
) {
  if (!point) return [];
  const cells: GridPoint[] = [];
  const n = Math.max(1, Math.min(8, Math.floor(size) || 1));
  for (let y = point.y; y < Math.min(map.height, point.y + n); y++)
    for (let x = point.x; x < Math.min(map.width, point.x + n); x++) cells.push({ x, y });
  return cells;
}
export function areaHidden(
  fog: BattleFogCell[],
  area: { x: number; y: number; width?: number; height?: number; size?: number },
) {
  return fog.some(
    (c) =>
      c.x >= area.x &&
      c.y >= area.y &&
      c.x < area.x + (area.width ?? area.size ?? 1) &&
      c.y < area.y + (area.height ?? area.size ?? 1),
  );
}
export function drawFog(
  ctx: CanvasRenderingContext2D,
  fog: BattleFogCell[],
  cell: number,
  master: boolean,
) {
  ctx.save();
  ctx.fillStyle = master ? 'rgba(0,0,0,.88)' : '#000';
  for (const f of fog) ctx.fillRect(f.x * cell - 0.4, f.y * cell - 0.4, cell + 0.8, cell + 0.8);
  if (master) {
    ctx.strokeStyle = '#627b9255';
    ctx.lineWidth = 1;
    for (const f of fog) {
      ctx.strokeRect(f.x * cell, f.y * cell, cell, cell);
    }
  }
  ctx.restore();
}
