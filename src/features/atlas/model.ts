import { z } from 'zod';
import {
  CELL,
  TERRAINS,
  SYMBOLS,
  TOKEN_ICONS,
  LAYER_IDS,
  FEATURE_LAYER,
  MAX_FEATURES,
  TEMPLATES,
  type AtlasDocument,
  type AtlasMap,
  type Brush,
  type MapFeature,
  type Point,
} from './types';
const color = z.string().regex(/^#[\da-f]{6}$/i, 'Escolha uma cor válida.');
const finite = z.number().finite();
const point = z.object({ x: finite.min(-8192).max(8192), y: finite.min(-8192).max(8192) }).strict();
const base = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  name: z.string().max(120),
  x: finite.min(0).max(4096),
  y: finite.min(0).max(4096),
  rotation: finite.min(-360).max(360),
  opacity: finite.min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
};
const objects = z.discriminatedUnion('kind', [
  z
    .object({
      ...base,
      kind: z.literal('symbol'),
      symbol: z.enum(
        SYMBOLS.map((s) => s[0]) as [(typeof SYMBOLS)[number][0], ...(typeof SYMBOLS)[number][0][]],
      ),
      size: finite.min(8).max(512),
      color,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('token'),
      icon: z.enum(TOKEN_ICONS),
      size: finite.min(16).max(256),
      color,
      faction: z.enum(['neutral', 'ally', 'enemy']),
      number: z.number().int().min(0).max(999),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('label'),
      text: z.string().min(1).max(300),
      fontSize: finite.min(8).max(144),
      color,
      font: z.enum(['serif', 'sans']),
      italic: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('route'),
      points: z.array(point).min(2).max(300),
      color,
      width: finite.min(1).max(64),
      style: z.enum(['road', 'trail', 'river', 'border', 'wall', 'arrow']),
      curved: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('region'),
      points: z.array(point).min(3).max(300),
      color,
      fill: color,
      width: finite.min(1).max(32),
      fillOpacity: finite.min(0).max(1),
    })
    .strict(),
]);
export const atlasSchema = z
  .object({
    schema: z.literal(1),
    title: z.string().trim().min(1, 'Dê um nome ao mapa.').max(120),
    notes: z.string().max(12000),
    template: z.enum(
      TEMPLATES.map((t) => t.id) as [AtlasDocument['template'], ...AtlasDocument['template'][]],
    ),
    seed: z.string().max(80),
    width: z.number().int().min(320).max(4096),
    height: z.number().int().min(320).max(4096),
    theme: z.enum(['parchment', 'natural', 'night', 'blueprint']),
    palette: z.array(color).length(TERRAINS.length),
    terrain: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(TERRAINS.length - 1),
      )
      .max(65536),
    elevation: z.array(z.number().int().min(0).max(5)).max(65536),
    baseTerrain: z
      .number()
      .int()
      .min(0)
      .max(TERRAINS.length - 1),
    layers: z
      .array(
        z
          .object({
            id: z.enum(LAYER_IDS),
            visible: z.boolean(),
            locked: z.boolean(),
            opacity: finite.min(0).max(1),
          })
          .strict(),
      )
      .length(LAYER_IDS.length),
    objects: z.array(objects).max(MAX_FEATURES),
    grid: z.enum(['none', 'square', 'hex']),
    gridColor: color,
    gridOpacity: finite.min(0).max(0.8),
    relief: z.boolean(),
    compass: z.boolean(),
    scaleBar: z.boolean(),
    unit: z.enum(['km', 'm', 'mi']),
    distancePerCell: finite.min(0.01).max(10000),
  })
  .strict()
  .superRefine((d, ctx) => {
    const length = Math.ceil(d.width / CELL) * Math.ceil(d.height / CELL);
    if (d.terrain.length !== length || d.elevation.length !== length)
      ctx.addIssue({
        code: 'custom',
        message: 'A malha de terreno não corresponde ao tamanho do mapa.',
      });
    if (new Set(d.layers.map((l) => l.id)).size !== LAYER_IDS.length)
      ctx.addIssue({ code: 'custom', message: 'As camadas precisam ter identificadores únicos.' });
    if (new Set(d.objects.map((o) => o.id)).size !== d.objects.length)
      ctx.addIssue({ code: 'custom', message: 'Há elementos repetidos no mapa.' });
    if (d.objects.some((o) => o.x > d.width || o.y > d.height))
      ctx.addIssue({ code: 'custom', message: 'Há um elemento fora dos limites do mapa.' });
    if (d.objects.reduce((n, o) => n + ('points' in o ? o.points.length : 0), 0) > 20000)
      ctx.addIssue({
        code: 'custom',
        message: 'Use até 20.000 pontos de rotas e regiões por mapa.',
      });
  });
export function validateDocument(value: unknown): AtlasDocument {
  const parsed = atlasSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return parsed.data;
}
export function parseAtlasFile(text: string) {
  if (text.length > 2_000_000) throw new Error('O arquivo do mapa deve ter até 2 MB.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não contém um mapa JSON válido.');
  }
  const envelope = z
    .object({ format: z.literal('cronica-atlas'), version: z.literal(1), document: z.unknown() })
    .strict()
    .safeParse(raw);
  if (!envelope.success) throw new Error('Use um mapa exportado pela Oficina de mapas da Crônica.');
  return validateDocument(envelope.data.document);
}
export function serializeAtlas(doc: AtlasDocument) {
  return JSON.stringify({ format: 'cronica-atlas', version: 1, document: validateDocument(doc) });
}
export function columns(doc: AtlasDocument) {
  return Math.ceil(doc.width / CELL);
}
export function layerFor(doc: AtlasDocument, kind: MapFeature['kind']) {
  return doc.layers.find((l) => l.id === FEATURE_LAYER[kind])!;
}
export function canDraw(doc: AtlasDocument, layer: (typeof LAYER_IDS)[number]) {
  const l = doc.layers.find((v) => v.id === layer);
  return !!l?.visible && !l.locked;
}
export function cloneForStroke(doc: AtlasDocument, terrain: boolean): AtlasDocument {
  return {
    ...doc,
    terrain: terrain ? [...doc.terrain] : doc.terrain,
    elevation: terrain ? [...doc.elevation] : doc.elevation,
    objects: terrain ? doc.objects : structuredClone(doc.objects),
  };
}
export function paintAt(doc: AtlasDocument, p: Point, brush: Brush, erase = false) {
  const cols = columns(doc),
    rows = Math.ceil(doc.height / CELL),
    cx = p.x / CELL,
    cy = p.y / CELL,
    r = brush.radius;
  let changed = false;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(rows - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(cols - 1, Math.ceil(cx + r)); x++) {
      if (brush.shape === 'circle' && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
      const i = y * cols + x,
        kind = erase ? doc.baseTerrain : brush.terrain,
        height = erase ? TERRAINS[doc.baseTerrain].height : brush.elevation;
      if ((!brush.heightOnly || erase) && doc.terrain[i] !== kind) {
        doc.terrain[i] = kind;
        changed = true;
      }
      if (doc.elevation[i] !== height) {
        doc.elevation[i] = height;
        changed = true;
      }
    }
  return changed;
}
export function paintLine(doc: AtlasDocument, from: Point, to: Point, brush: Brush, erase = false) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(3, brush.radius * CELL * 0.35)),
  );
  let changed = false;
  for (let i = 0; i <= steps; i++)
    changed =
      paintAt(
        doc,
        { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps },
        brush,
        erase,
      ) || changed;
  return changed;
}
export function floodFill(doc: AtlasDocument, p: Point, brush: Brush) {
  const cols = columns(doc),
    rows = Math.ceil(doc.height / CELL),
    x = Math.floor(p.x / CELL),
    y = Math.floor(p.y / CELL);
  if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
  const start = y * cols + x,
    original = doc.terrain[start];
  if (
    original === brush.terrain &&
    !brush.heightOnly &&
    doc.elevation.every((h, i) => doc.terrain[i] !== original || h === brush.elevation)
  )
    return false;
  const visited = new Uint8Array(doc.terrain.length),
    stack = [start];
  let changed = false;
  while (stack.length) {
    const i = stack.pop()!;
    if (visited[i] || doc.terrain[i] !== original) continue;
    visited[i] = 1;
    if (!brush.heightOnly && doc.terrain[i] !== brush.terrain) {
      doc.terrain[i] = brush.terrain;
      changed = true;
    }
    if (doc.elevation[i] !== brush.elevation) {
      doc.elevation[i] = brush.elevation;
      changed = true;
    }
    const xx = i % cols,
      yy = Math.floor(i / cols);
    if (xx > 0) stack.push(i - 1);
    if (xx < cols - 1) stack.push(i + 1);
    if (yy > 0) stack.push(i - cols);
    if (yy < rows - 1) stack.push(i + cols);
  }
  return changed;
}
export function featureBase(p: Point, name: string) {
  return {
    id: crypto.randomUUID(),
    name,
    x: p.x,
    y: p.y,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
  };
}
export function featureBounds(o: MapFeature) {
  if (o.kind === 'route' || o.kind === 'region') {
    const xs = o.points.map((p) => p.x),
      ys = o.points.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }
  if (o.kind === 'label') {
    const width = Math.min(4096, o.text.length * o.fontSize * 0.64);
    return { x: -width / 2, y: -o.fontSize * 0.75, width, height: o.fontSize * 1.5 };
  }
  return { x: -o.size / 2, y: -o.size / 2, width: o.size, height: o.size };
}
function pointInPolygon(p: Point, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
export function hitFeature(doc: AtlasDocument, p: Point, zoom = 1): MapFeature | null {
  for (const l of [...doc.layers].reverse()) {
    if (!l.visible || l.locked || l.opacity === 0) continue;
    for (const o of [...doc.objects].reverse()) {
      if (FEATURE_LAYER[o.kind] !== l.id || !o.visible || o.locked || o.opacity === 0) continue;
      const angle = (-o.rotation * Math.PI) / 180,
        dx = p.x - o.x,
        dy = p.y - o.y,
        q = {
          x: dx * Math.cos(angle) - dy * Math.sin(angle),
          y: dx * Math.sin(angle) + dy * Math.cos(angle),
        };
      if (o.kind === 'route') {
        const path = routePoints(o.points, o.curved);
        if (path.slice(1).some((b, i) => segmentDistance(q, path[i], b) <= o.width / 2 + 7 / zoom))
          return o;
      } else if (o.kind === 'region') {
        if (pointInPolygon(q, o.points)) return o;
      } else {
        const b = featureBounds(o),
          margin = 5 / zoom;
        if (
          q.x >= b.x - margin &&
          q.x <= b.x + b.width + margin &&
          q.y >= b.y - margin &&
          q.y <= b.y + b.height + margin
        )
          return o;
      }
    }
  }
  return null;
}
export function routePoints(points: Point[], curved = false): Point[] {
  if (!curved || points.length < 3) return points;
  const result = [points[0]];
  let start = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i],
      end = { x: (control.x + points[i + 1].x) / 2, y: (control.y + points[i + 1].y) / 2 };
    for (let step = 1; step <= 12; step++) {
      const t = step / 12,
        u = 1 - t;
      result.push({
        x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
      });
    }
    start = end;
  }
  result.push(points.at(-1)!);
  return result;
}
export function routeDistance(doc: AtlasDocument, original: Point[], curved = false) {
  const points = routePoints(original, curved);
  return (
    (points
      .slice(1)
      .reduce((sum, b, i) => sum + Math.hypot(b.x - points[i].x, b.y - points[i].y), 0) /
      CELL) *
    doc.distancePerCell
  );
}
export interface AtlasHistory {
  present: AtlasDocument;
  past: AtlasDocument[];
  future: AtlasDocument[];
}
export function historyCommit(h: AtlasHistory, next: AtlasDocument): AtlasHistory {
  if (next === h.present) return h;
  const bytes = next.terrain.length * 16 + next.objects.length * 700;
  const capacity = Math.max(1, Math.min(35, Math.floor(24_000_000 / Math.max(1, bytes))));
  return { present: next, past: [...h.past, h.present].slice(-capacity), future: [] };
}
export function historyUndo(h: AtlasHistory): AtlasHistory {
  return h.past.length
    ? { present: h.past.at(-1)!, past: h.past.slice(0, -1), future: [h.present, ...h.future] }
    : h;
}
export function historyRedo(h: AtlasHistory): AtlasHistory {
  return h.future.length
    ? { present: h.future[0], past: [...h.past, h.present], future: h.future.slice(1) }
    : h;
}
export function mapRecord(campaignId: string, document: AtlasDocument): AtlasMap {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    campaign_id: campaignId,
    name: document.title,
    revision: 0,
    thumbnail: null,
    width: document.width,
    height: document.height,
    template: document.template,
    created_at: stamp,
    updated_at: stamp,
    document,
  };
}

export function resizeAtlas(
  doc: AtlasDocument,
  width: number,
  height: number,
  scaleContent: boolean,
): AtlasDocument {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    height < 320 ||
    width > 4096 ||
    height > 4096
  )
    throw new Error('Use dimensões inteiras entre 320 e 4.096.');
  const cols = Math.ceil(width / CELL),
    rows = Math.ceil(height / CELL),
    oldCols = columns(doc),
    oldRows = Math.ceil(doc.height / CELL),
    terrain: number[] = [],
    elevation: number[] = [],
    sx = width / doc.width,
    sy = height / doc.height;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const ox = scaleContent ? Math.min(oldCols - 1, Math.floor((x * oldCols) / cols)) : x,
        oy = scaleContent ? Math.min(oldRows - 1, Math.floor((y * oldRows) / rows)) : y,
        i = oy * oldCols + ox;
      terrain.push(ox < oldCols && oy < oldRows ? doc.terrain[i] : doc.baseTerrain);
      elevation.push(
        ox < oldCols && oy < oldRows ? doc.elevation[i] : TERRAINS[doc.baseTerrain].height,
      );
    }
  const objects = doc.objects.map((o) => {
    const next = {
      ...structuredClone(o),
      x: Math.min(width, scaleContent ? o.x * sx : o.x),
      y: Math.min(height, scaleContent ? o.y * sy : o.y),
    };
    if (scaleContent) {
      if (next.kind === 'route' || next.kind === 'region')
        next.points = next.points.map((p) => ({ x: p.x * sx, y: p.y * sy }));
      else if (next.kind === 'label')
        next.fontSize = Math.max(8, Math.min(144, next.fontSize * Math.sqrt(sx * sy)));
      else
        next.size = Math.max(
          next.kind === 'token' ? 16 : 8,
          Math.min(next.kind === 'token' ? 256 : 512, next.size * Math.sqrt(sx * sy)),
        );
    }
    return next;
  });
  return { ...doc, width, height, terrain, elevation, objects };
}
