import { z } from 'zod';
export const ANNOTATION_LIMIT = 1000;
const color = z.string().regex(/^#[\da-f]{6}$/i);
const coordinate = z.number().finite().min(0).max(1);
export const annotationPoint = z.object({ x: coordinate, y: coordinate }).strict();
export type AnnotationPoint = z.infer<typeof annotationPoint>;
export const annotationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('stroke'),
      color,
      width: z.number().finite().min(1).max(16),
      points: z.array(annotationPoint).min(2).max(512),
    })
    .strict(),
  z
    .object({
      kind: z.literal('marker'),
      color,
      x: coordinate,
      y: coordinate,
      text: z.string().max(240),
    })
    .strict(),
  z
    .object({
      kind: z.literal('text'),
      color,
      x: coordinate,
      y: coordinate,
      text: z.string().trim().min(1).max(240),
    })
    .strict(),
]);
export type AnnotationPayload = z.infer<typeof annotationSchema>;
export interface MuralAnnotation {
  id: string;
  item_id: string;
  campaign_id: string;
  author_id: string;
  payload: AnnotationPayload;
  version: number;
  deleted: boolean;
  created_at: string;
}
export interface AnnotationDelta {
  revision: number;
  snapshot: boolean;
  can_write: boolean;
  image_path: string;
  annotations: MuralAnnotation[];
}
export function mergeAnnotationDelta(current: MuralAnnotation[], delta: AnnotationDelta) {
  const byId = new Map((delta.snapshot ? [] : current).map((a) => [a.id, a]));
  for (const row of delta.annotations) {
    if ((byId.get(row.id)?.version ?? -1) > row.version) continue;
    if (row.deleted) byId.delete(row.id);
    else byId.set(row.id, row);
  }
  return [...byId.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}
// Keep the ends of long gestures while bounding their stored geometry.
export function boundAnnotationPoints(points: AnnotationPoint[]) {
  if (points.length <= 512) return points;
  return Array.from({ length: 512 }, (_, i) => points[Math.round((i * (points.length - 1)) / 511)]);
}
export function normalizedAnnotationPoint(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
): AnnotationPoint {
  if (box.width <= 0 || box.height <= 0) throw new Error('Aguarde o carregamento da imagem.');
  return {
    x: Math.round(Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * 100000) / 100000,
    y: Math.round(Math.max(0, Math.min(1, (clientY - box.top) / box.height)) * 100000) / 100000,
  };
}
