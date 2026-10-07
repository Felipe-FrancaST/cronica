import { sceneryRect, sceneryStack, sceneryVariant, normalizeSceneryColor } from './scenery';
import { normalizeSceneryStyle } from './scenery-styles';
import { normalizeSceneryHeight } from './scenery-dimensions';
import type { BattleMapObject } from './types';

export const CONTINUOUS_SURFACES = ['road', 'water', 'ice', 'lava', 'floor'] as const;
export function isContinuousSurface(kind: string) {
  return (CONTINUOUS_SURFACES as readonly string[]).includes(kind);
}
export interface SurfaceSpan {
  start: number;
  end: number;
  key: string;
  object: BattleMapObject;
}
export interface SurfaceRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SurfaceGroup {
  key: string;
  object: BattleMapObject;
  rectangles: SurfaceRectangle[];
}
export interface SurfacePlan {
  groups: Map<string, SurfaceGroup>;
  rows: Map<number, Map<number, SurfaceSpan[]>>;
}
export function surfaceKey(object: BattleMapObject) {
  return [
    object.object_type,
    sceneryVariant(object.object_type, object.metadata.variant),
    normalizeSceneryStyle(object.metadata.style),
    normalizeSceneryColor(object.metadata.color) ?? '',
    object.visible,
    object.z,
    normalizeSceneryHeight(object.metadata.height_metres) ?? 'auto',
    object.metadata.light_enabled !== false,
  ].join(':');
}

// Paint row intervals, rather than allocating a cell for every overlapping piece.
// The last surface in the same stack wins. No pair of quads shares the same area.
// Ownership is retained separately from the merged visual geometry.
export function scenerySurfaces(objects: BattleMapObject[]): SurfacePlan {
  const plan: SurfacePlan = { groups: new Map(), rows: new Map() };
  for (const object of sceneryStack(objects)) {
    if (!isContinuousSurface(object.object_type)) continue;
    const r = sceneryRect(object);
    if (!r) continue;
    const key = surfaceKey(object);
    if (!plan.groups.has(key)) plan.groups.set(key, { key, object, rectangles: [] });
    let rows = plan.rows.get(object.z);
    if (!rows) {
      rows = new Map();
      plan.rows.set(object.z, rows);
    }
    for (let y = r.y; y < r.y + r.height; y++) {
      const spans: SurfaceSpan[] = [];
      for (const old of rows.get(y) ?? []) {
        if (old.end <= r.x || old.start >= r.x + r.width) spans.push(old);
        else {
          if (old.start < r.x) spans.push({ ...old, end: r.x });
          if (old.end > r.x + r.width) spans.push({ ...old, start: r.x + r.width });
        }
      }
      spans.push({ start: r.x, end: r.x + r.width, key, object });
      spans.sort((a, b) => a.start - b.start);
      rows.set(y, spans);
    }
  }
  for (const rows of plan.rows.values()) {
    let active = new Map<string, SurfaceRectangle>();
    let previousY = -Infinity;
    for (const [y, owned] of [...rows].sort(([a], [b]) => a - b)) {
      if (y !== previousY + 1) active.clear();
      const runs: Pick<SurfaceSpan, 'start' | 'end' | 'key'>[] = [];
      for (const span of owned) {
        const last = runs.at(-1);
        if (last && last.end === span.start && last.key === span.key) last.end = span.end;
        else runs.push({ start: span.start, end: span.end, key: span.key });
      }
      const next = new Map<string, SurfaceRectangle>();
      for (const run of runs) {
        const identity = run.key + ':' + run.start + ':' + run.end;
        let rect = active.get(identity);
        if (rect) rect.height++;
        else {
          rect = { x: run.start, y, width: run.end - run.start, height: 1 };
          plan.groups.get(run.key)!.rectangles.push(rect);
        }
        next.set(identity, rect);
      }
      active = next;
      previousY = y;
    }
  }
  return plan;
}

export function surfaceObjectAt(plan: SurfacePlan, x: number, y: number, key: string) {
  for (const rows of plan.rows.values()) {
    const span = rows.get(Math.floor(y))?.find((s) => s.key === key && x >= s.start && x < s.end);
    if (span) return span.object;
  }
  return null;
}
