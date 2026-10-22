import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAtlas, duplicateFeatures } from '../src/features/atlas/generator';
import {
  canDraw,
  cloneForStroke,
  featureBase,
  floodFill,
  historyCommit,
  historyRedo,
  historyUndo,
  hitFeature,
  paintLine,
  parseAtlasFile,
  resizeAtlas,
  routeDistance,
  routePoints,
  serializeAtlas,
  validateDocument,
  type AtlasHistory,
} from '../src/features/atlas/model';
import {
  TEMPLATES,
  TERRAINS,
  type AtlasDocument,
  type MapFeature,
} from '../src/features/atlas/types';
const blank = () => generateAtlas('blank', 640, 480, 'seed', 'Teste');
const marker = (x = 100, y = 100): MapFeature => ({
  ...featureBase({ x, y }, 'Montanha'),
  kind: 'symbol',
  symbol: 'mountain',
  size: 50,
  color: '#66543c',
});
test('all map templates are valid, reproducible and differ across seeds', () => {
  for (const { id } of TEMPLATES) {
    const a = generateAtlas(id, 960, 640, 'one', 'Mapa');
    assert.deepEqual(validateDocument(a), a);
    assert.deepEqual(a, generateAtlas(id, 960, 640, 'one', 'Mapa'));
    if (id !== 'blank')
      assert.notDeepEqual(a.terrain, generateAtlas(id, 960, 640, 'two', 'Mapa').terrain);
  }
});
test('brush strokes interpolate without changing history snapshots; fill stops at a terrain boundary', () => {
  const before = blank(),
    after = cloneForStroke(before, true),
    brush = { terrain: 4, elevation: 3, radius: 1, shape: 'square' as const, heightOnly: false };
  paintLine(after, { x: 160, y: 0 }, { x: 160, y: 480 }, brush, false);
  assert.ok(before.terrain.every((t) => t === 0));
  assert.ok(after.terrain.some((t) => t === 4));
  floodFill(after, { x: 30, y: 30 }, { ...brush, terrain: 9, elevation: 1 });
  assert.equal(after.terrain[1], 9);
  assert.equal(after.terrain[39], 0);
  assert.equal(after.elevation[1], 1);
  const heights = cloneForStroke(after, true);
  paintLine(
    heights,
    { x: 50, y: 50 },
    { x: 50, y: 50 },
    { ...brush, heightOnly: true, elevation: 5 },
    false,
  );
  assert.deepEqual(heights.terrain, after.terrain);
  assert.ok(heights.elevation.some((h) => h === 5));
});
test('history restores complete immutable documents and clears redo after a new edit', () => {
  const d = blank();
  let h: AtlasHistory = { present: d, past: [], future: [] };
  const withObject = { ...d, objects: [marker()] };
  h = historyCommit(h, withObject);
  h = historyUndo(h);
  assert.equal(h.present, d);
  h = historyRedo(h);
  assert.equal(h.present, withObject);
  h = historyUndo(h);
  h = historyCommit(h, { ...d, title: 'Outro' });
  assert.equal(h.future.length, 0);
  for (let i = 0; i < 90; i++) h = historyCommit(h, { ...h.present, title: String(i) });
  assert.ok(h.past.length <= 35);
});
test('hit testing respects layer order, hidden and locked objects, rotated routes and regions', () => {
  const d = blank(),
    first = marker(),
    last = { ...marker(), id: 'top' };
  d.objects = [first, last];
  assert.equal(hitFeature(d, { x: 100, y: 100 }, 1)?.id, last.id);
  last.visible = false;
  assert.equal(hitFeature(d, { x: 100, y: 100 }, 1)?.id, first.id);
  first.locked = true;
  assert.equal(hitFeature(d, { x: 100, y: 100 }, 1), null);
  d.layers = d.layers.map((l) => (l.id === 'symbols' ? { ...l, locked: true } : l));
  assert.equal(canDraw(d, 'symbols'), false);
  const route: MapFeature = {
    ...featureBase({ x: 300, y: 100 }, 'Estrada'),
    kind: 'route',
    rotation: 90,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    color: '#66543c',
    width: 4,
    style: 'road',
    curved: false,
  };
  d.objects = [route];
  assert.equal(hitFeature(d, { x: 300, y: 150 }, 1)?.id, route.id);
  const region: MapFeature = {
    ...featureBase({ x: 100, y: 100 }, 'Reino'),
    kind: 'region',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ],
    color: '#66543c',
    fill: '#eeeeee',
    width: 2,
    fillOpacity: 0.3,
  };
  d.objects = [region];
  assert.equal(hitFeature(d, { x: 120, y: 120 }, 1)?.id, region.id);
  assert.equal(hitFeature(d, { x: 220, y: 220 }, 1), null);
});
test('editable backups preserve private notes; invalid imports fail before saving', () => {
  const d = blank();
  d.notes = 'Segredo do mestre';
  d.objects = [marker()];
  assert.deepEqual(parseAtlasFile(serializeAtlas(d)), d);
  for (const invalid of [
    { ...d, terrain: [] },
    { ...d, width: 5000 },
    { ...d, layers: [...d.layers.slice(1), d.layers[1]] },
    { ...d, objects: [d.objects[0], d.objects[0]] },
    { ...d, palette: ['url(https://unsafe.test)', ...d.palette.slice(1)] },
    { ...d, unexpected: true },
    { ...d, objects: [{ ...d.objects[0], x: NaN }] },
  ])
    assert.throws(() => validateDocument(invalid));
  assert.throws(() => parseAtlasFile('{invalid'));
  assert.throws(() => parseAtlasFile(JSON.stringify({ document: d })));
  assert.throws(() => parseAtlasFile(' '.repeat(2000001)));
});
test('resizing rescales routes and terrain or extends the canvas with its base material', () => {
  const d = blank();
  d.terrain[0] = 4;
  d.objects = [
    marker(100, 100),
    {
      ...featureBase({ x: 200, y: 200 }, ''),
      kind: 'route',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      color: '#66543c',
      width: 2,
      style: 'river',
      curved: true,
    },
  ];
  const bigger = resizeAtlas(d, 1280, 960, true);
  assert.equal(bigger.objects[0].x, 200);
  assert.equal(bigger.terrain[0], 4);
  assert.equal((bigger.objects[1] as Extract<MapFeature, { kind: 'route' }>).points[1].x, 200);
  validateDocument(bigger);
  const extended = resizeAtlas(d, 1280, 960, false);
  assert.equal(extended.objects[0].x, 100);
  assert.equal(extended.terrain.at(-1), d.baseTerrain);
  validateDocument(extended);
  const small = resizeAtlas(bigger, 320, 320, false);
  assert.ok(small.objects.every((o) => o.x <= 320 && o.y <= 320));
  validateDocument(small);
  assert.throws(() => resizeAtlas(d, 1, 480, true));
});
test('duplicates have fresh IDs and bounded names; distance uses the configured map scale', () => {
  const original = { ...marker(), name: 'M'.repeat(120) };
  const result = duplicateFeatures([original], original.id, 640, 480);
  assert.equal(result.length, 2);
  assert.notEqual(result[1].id, original.id);
  assert.ok(result[1].name.length <= 120);
  assert.equal(result[1].x, 124);
  assert.equal(
    routeDistance({ ...blank(), distancePerCell: 2 }, [
      { x: 0, y: 0 },
      { x: 48, y: 64 },
    ]),
    10,
  );
  assert.equal(TERRAINS.length, 22);
});
test('map validation bounds total path complexity and oversized feature collections', () => {
  const d = blank(),
    route: MapFeature = {
      ...featureBase({ x: 20, y: 20 }, ''),
      kind: 'route',
      points: Array.from({ length: 300 }, (_, i) => ({ x: i, y: i })),
      color: '#66543c',
      width: 1,
      style: 'road',
      curved: true,
    };
  const crowded: AtlasDocument = {
    ...d,
    objects: Array.from({ length: 67 }, (_, i) => ({ ...route, id: `r${i}` })),
  };
  assert.throws(() => validateDocument(crowded), /20.000/);
  assert.throws(() =>
    validateDocument({
      ...d,
      objects: Array.from({ length: 1801 }, (_, i) => ({ ...marker(), id: `s${i}` })),
    }),
  );
});
test('curved route selection follows the drawn curve and its measured distance', () => {
  const d = blank(),
    points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 0 },
    ],
    path = routePoints(points, true);
  const route: MapFeature = {
    ...featureBase({ x: 100, y: 100 }, 'Curva'),
    kind: 'route',
    points,
    color: '#66543c',
    width: 2,
    style: 'road',
    curved: true,
  };
  d.objects = [route];
  const midpoint = path[6];
  assert.equal(hitFeature(d, { x: 100 + midpoint.x, y: 100 + midpoint.y }, 2)?.id, route.id);
  assert.ok(routeDistance(d, points, true) < routeDistance(d, points, false));
  assert.deepEqual(path.at(-1), points.at(-1));
});
