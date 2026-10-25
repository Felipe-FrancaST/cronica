import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annotationSchema,
  boundAnnotationPoints,
  mergeAnnotationDelta,
  normalizedAnnotationPoint,
  type MuralAnnotation,
} from '../src/features/mural/annotation-model';
test('map coordinates preserve position through zoom, offset and differently sized displays', () => {
  assert.deepEqual(
    normalizedAnnotationPoint(400, 300, { left: 100, top: 100, width: 600, height: 400 }),
    { x: 0.5, y: 0.5 },
  );
  assert.deepEqual(
    normalizedAnnotationPoint(800, 600, { left: 200, top: 200, width: 1200, height: 800 }),
    { x: 0.5, y: 0.5 },
  );
  assert.deepEqual(
    normalizedAnnotationPoint(-20, 900, { left: 0, top: 0, width: 600, height: 400 }),
    { x: 0, y: 1 },
  );
});
test('long gestures keep their ends without exceeding the persisted point limit', () => {
  const points = Array.from({ length: 10000 }, (_, i) => ({ x: i / 10000, y: 0.5 }));
  const result = boundAnnotationPoints(points);
  assert.equal(result.length, 512);
  assert.equal(result[0], points[0]);
  assert.equal(result.at(-1), points.at(-1));
  assert.equal(points.length, 10000);
});
test('map annotation data rejects extra fields, invalid geometry and unbounded payloads', () => {
  const base = { kind: 'text', color: '#112233', x: 0.2, y: 0.4, text: 'Entrada' };
  assert.equal(annotationSchema.safeParse(base).success, true);
  for (const bad of [
    { ...base, x: NaN },
    { ...base, x: 1.01 },
    { ...base, text: '' },
    { ...base, text: 'x'.repeat(241) },
    { ...base, html: '<script />' },
    { kind: 'stroke', color: '#123456', width: 4, points: [{ x: 0.2, y: 0.3 }] },
  ])
    assert.equal(annotationSchema.safeParse(bad).success, false);
});
test('annotation deltas preserve unrelated marks, process deletions and reset after replacing the image', () => {
  const row = (id: string, version: number) => ({ id, version, deleted: false }) as MuralAnnotation;
  const initial = [
    { ...row('a', 3), created_at: '2026-01-01' },
    { ...row('b', 4), created_at: '2026-01-01' },
  ];
  const partial = mergeAnnotationDelta(initial, {
    snapshot: false,
    revision: 5,
    image_path: '',
    can_write: true,
    annotations: [{ ...row('b', 5), deleted: true }],
  });
  assert.deepEqual(
    partial.map((a) => a.id),
    ['a'],
  );
  assert.equal(initial.length, 2);
  const reset = mergeAnnotationDelta(partial, {
    snapshot: true,
    revision: 6,
    image_path: '',
    can_write: false,
    annotations: [],
  });
  assert.deepEqual(reset, []);
});
