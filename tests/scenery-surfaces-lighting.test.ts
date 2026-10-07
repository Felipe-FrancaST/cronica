import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeScenery,
  SCENERY,
  sceneryVariant,
  normalizeSceneryLightRadius,
} from '../src/features/vtt/scenery';
import { scenerySurfaces, surfaceObjectAt, surfaceKey } from '../src/features/vtt/scenery-surfaces';
import { sceneryLights, normalizeLighting } from '../src/features/vtt/scenery-lighting';
import type { BattleMapObject } from '../src/features/vtt/types';

function piece(
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number,
  metadata = {},
): BattleMapObject {
  return {
    id: `${kind}:${x}:${y}:${width}:${height}`,
    map_id: 'map',
    object_type: kind,
    geometry: { x, y, width, height, rotation: 0 },
    z: 0,
    visible: true,
    blocks_movement: false,
    blocks_vision: false,
    metadata,
    created_at: '',
    updated_at: '',
  };
}
const map = { scale_per_cell: 1.5, scale_unit: 'm' as const };

test('adjacent roads form a single rectangle while each piece remains selectable', () => {
  const a = piece('road', 1, 2, 4, 3),
    b = piece('road', 5, 2, 6, 3);
  const plan = scenerySurfaces([a, b]),
    key = surfaceKey(a);
  assert.deepEqual(plan.groups.get(key)?.rectangles, [{ x: 1, y: 2, width: 10, height: 3 }]);
  assert.equal(surfaceObjectAt(plan, 2.2, 3.8, key)?.id, a.id);
  assert.equal(surfaceObjectAt(plan, 9.1, 3.8, key)?.id, b.id);
  assert.equal(surfaceObjectAt(plan, 0, 3, key), null);
});
test('crossings, T junctions and overlapping variants have one visible surface per location', () => {
  const a = piece('road', 2, 0, 3, 12),
    b = piece('road', 0, 4, 12, 3, { variant: 'cobblestone' });
  const plan = scenerySurfaces([a, b]);
  const cells = new Set<string>();
  for (const group of plan.groups.values())
    for (const r of group.rectangles)
      for (let y = r.y; y < r.y + r.height; y++)
        for (let x = r.x; x < r.x + r.width; x++) {
          assert.equal(cells.has(`${x}:${y}`), false, 'coplanar surface overlap would flicker');
          cells.add(`${x}:${y}`);
        }
  assert.equal(cells.size, 3 * 12 * 2 - 3 * 3);
  assert.equal(surfaceObjectAt(plan, 3, 5, surfaceKey(b))?.id, b.id);
  assert.equal(surfaceObjectAt(plan, 3, 2, surfaceKey(a))?.id, a.id);
});
test('removing an overlapping piece restores the underlying water without changing either object', () => {
  const water = piece('water', 0, 0, 12, 8),
    floor = piece('floor', 2, 2, 3, 3);
  assert.equal(surfaceObjectAt(scenerySurfaces([water, floor]), 3, 3, surfaceKey(water)), null);
  const restored = scenerySurfaces([water]);
  assert.deepEqual(restored.groups.get(surfaceKey(water))?.rectangles, [
    { x: 0, y: 0, width: 12, height: 8 },
  ]);
  assert.deepEqual(water.geometry, { x: 0, y: 0, width: 12, height: 8, rotation: 0 });
});
test('all continuous kinds join and retain separate material and elevation choices', () => {
  for (const kind of ['road', 'water', 'lava', 'ice', 'floor']) {
    const a = piece(kind, 0, 0, 128, 128),
      b = piece(kind, 128, 0, 32, 128);
    assert.deepEqual(scenerySurfaces([a, b]).groups.get(surfaceKey(a))?.rectangles, [
      { x: 0, y: 0, width: 160, height: 128 },
    ]);
    const elevated = { ...a, z: 1 };
    const tinted = { ...b, metadata: { color: '#4488cc' } };
    assert.equal(scenerySurfaces([a, elevated, tinted]).groups.size, 3);
  }
});
test('fragmented and repeated road pieces collapse into a compact visual mesh', () => {
  const objects = Array.from({ length: 80 }, (_, x) => piece('road', x, 0, 1, 8));
  const plan = scenerySurfaces([...objects, ...objects]);
  assert.equal(plan.groups.size, 1);
  assert.deepEqual([...plan.groups.values()][0].rectangles, [{ x: 0, y: 0, width: 80, height: 8 }]);
});
test('legacy statues render as obelisks and the palette exposes only the obelisk', () => {
  for (const legacy of [undefined, 'default', 'obelisk', 'unknown'])
    assert.equal(sceneryVariant('statue', legacy), 'obelisk');
  assert.equal(SCENERY.find((s) => s.id === 'statue')?.name, 'Obelisco');
  assert.equal(
    SCENERY.some((s) => String(s.name) === 'Estátua'),
    false,
  );
});
test('light reaches the same physical distance in metric and imperial grids', () => {
  const torch = piece('torch', 3, 4, 1, 1);
  const a = sceneryLights([torch], map)[0],
    b = sceneryLights([torch], { scale_per_cell: 5, scale_unit: 'ft' })[0];
  assert.equal(a.radius, 5);
  assert.equal(a.radius, b.radius);
  assert.equal(sceneryLights([torch], { scale_per_cell: 3, scale_unit: 'm' })[0].radius, 2.5);
});
test('automatic flames, lanterns, forges, lava and magical objects emit different lights', () => {
  for (const [kind, variant] of [
    ['torch', 'lantern'],
    ['torch', 'arcane'],
    ['campfire', 'brazier'],
    ['fire', 'default'],
    ['forge', 'default'],
    ['lava', 'default'],
    ['portal', 'default'],
    ['mountain', 'volcano'],
    ['rock', 'crystal'],
  ]) {
    const lights = sceneryLights([piece(kind, 3, 4, 2, 2, { variant })], map);
    assert.ok(lights.length > 0, `${kind}/${variant} should illuminate`);
    assert.ok(lights.every((l) => l.radius > 0 && Number.isFinite(l.height)));
  }
  assert.deepEqual(sceneryLights([piece('house', 0, 0, 4, 6)], map), []);
});
test('explicit emission, radius, color and off settings work without modifying automatic defaults', () => {
  const lights = sceneryLights(
    [piece('house', 0, 0, 4, 6, { light_enabled: true, light_radius: 30, light_color: '#44ccaa' })],
    map,
  );
  assert.equal(lights[0].radius, 20);
  assert.equal(lights[0].color, '#44ccaa');
  assert.deepEqual(sceneryLights([piece('torch', 0, 0, 1, 1, { light_enabled: false })], map), []);
  for (const value of [NaN, Infinity, '6', 0, -1, 60.1, null])
    assert.equal(normalizeSceneryLightRadius(value), undefined);
  assert.equal(normalizeSceneryLightRadius(60), 60);
});
test('invisible and fog-covered sources cannot leak light into the revealed scene', () => {
  const torch = piece('torch', 3, 4, 1, 1);
  assert.deepEqual(sceneryLights([{ ...torch, visible: false }], map), []);
  assert.deepEqual(sceneryLights([torch], map, [{ id: 'fog', map_id: 'map', x: 3, y: 4 }]), []);
});
test('large fields of lava illuminate their area with a bounded number of sources', () => {
  const lights = sceneryLights([piece('lava', 0, 0, 128, 128)], map);
  assert.equal(lights.length, 16);
  assert.ok(lights.every((l) => l.radius >= 22.4));
});
test('light appearance saves booleans and numeric metres alongside the existing object data', () => {
  const result: Omit<BattleMapObject, 'id' | 'created_at' | 'updated_at'> = makeScenery(
    'map',
    { x: 0, y: 0 },
    {
      kind: 'torch',
      width: 1,
      height: 1,
      rotation: 0,
      blocks: false,
      cost: 1,
      lightEnabled: true,
      lightRadiusMetres: 12,
    },
  );
  assert.equal(result.metadata.light_enabled, true);
  assert.equal(result.metadata.light_radius, 12);
  assert.equal(normalizeLighting(undefined), 'day');
  assert.equal(normalizeLighting('night'), 'night');
  assert.equal(normalizeLighting('invalid'), 'day');
});
