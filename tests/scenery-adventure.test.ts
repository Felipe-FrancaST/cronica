import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScenery, sceneryDefaults, sceneryInteraction } from '../src/features/vtt/scenery';
import { sceneryLights } from '../src/features/vtt/scenery-lighting';
import { changeSceneryState } from '../src/features/vtt/scenery-interactions';
import { sceneryModelParts } from '../src/features/vtt/scenery-meshes';
import { partBounds } from '../src/features/vtt/scenery-model-utils';
import { withinSceneryReach } from '../src/features/vtt/scenery-gameplay';
import type { BattleMapObject, BattleToken } from '../src/features/vtt/types';

function object(kind: string): BattleMapObject {
  return {
    ...makeScenery(
      'map',
      { x: 4, y: 3 },
      { kind: kind as 'torch', width: 1, height: 1, rotation: 0, ...sceneryDefaults(kind) },
    ),
    id: kind,
    created_at: '',
    updated_at: '',
  };
}
test('local light intensity and color preserve physical radius, and extinguishing removes the source', () => {
  const torch = object('torch'),
    map = { scale_per_cell: 1.5, scale_unit: 'm' as const },
    base = sceneryLights([torch], map)[0];
  torch.metadata.light_intensity = 2;
  torch.metadata.light_color = '#aa77ff';
  const brighter = sceneryLights([torch], map)[0];
  assert.equal(brighter.strength, base.strength * 2);
  assert.equal(brighter.radius, base.radius);
  assert.equal(brighter.color, '#aa77ff');
  const off = changeSceneryState(torch, 'light-off');
  assert.equal(sceneryLights([off], map).length, 0);
  assert.equal(sceneryInteraction(off)?.label, 'Acender');
  const on = changeSceneryState(off, 'light-on');
  assert.equal(sceneryLights([on], map).length, 1);
  assert.deepEqual(on.geometry, torch.geometry);
  assert.equal(sceneryLights([on], map, [{ x: 4, y: 3 } as never]).length, 0);
});
test('adventure pieces have finite solid geometry and extinguishing preserves the proportions of the light support', () => {
  for (const kind of [
    'lanternpost',
    'candelabra',
    'fireplace',
    'beacon',
    'gong',
    'pressureplate',
    'secretwall',
    'supplycrate',
  ]) {
    const parts = sceneryModelParts(kind);
    assert.ok(parts.length > 1, kind);
    for (const p of parts) {
      const values = p.geometry.getAttribute('position').array;
      assert.ok(Array.from(values).every(Number.isFinite), kind);
    }
    const bounds = partBounds(parts);
    assert.ok(bounds.max.y > bounds.min.y, kind);
    for (const p of parts) {
      p.geometry.dispose();
      p.material.dispose();
    }
  }
  const on = sceneryModelParts('candelabra'),
    off = sceneryModelParts('candelabra', 'default', 'original', 1, 1, false);
  assert.ok(partBounds(on).max.distanceTo(partBounds(off).max) < 1e-5);
  assert.ok(off.some((p) => p.material.opacity === 0));
  for (const p of [...on, ...off]) {
    p.geometry.dispose();
    p.material.dispose();
  }
});
test('interacting requires the controlled token to be on the same map and next to the footprint', () => {
  const chest = object('chest'),
    token = { id: 'hero', map_id: 'map', x: 3, y: 3, size: 1 } as BattleToken;
  assert.equal(withinSceneryReach(chest, token), true);
  assert.equal(withinSceneryReach(chest, { ...token, x: 0 }), false);
  assert.equal(withinSceneryReach(chest, { ...token, map_id: 'other' }), false);
  assert.equal(
    withinSceneryReach(
      { ...chest, geometry: { x: 6, y: 3, width: 2, height: 1 } },
      { ...token, x: 4, size: 2 },
    ),
    true,
  );
});
