import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneryDestinationGeometry } from '../src/features/vtt/scenery-selection';
import type { BattleMapObject } from '../src/features/vtt/types';

const map = { id: 'map', width: 16, height: 12 };
const chest: BattleMapObject = {
  id: 'chest',
  map_id: map.id,
  object_type: 'chest',
  geometry: { x: 3, y: 4, width: 2, height: 1, rotation: 90, custom: 'preserved' },
  z: 2,
  visible: false,
  blocks_movement: true,
  blocks_vision: false,
  metadata: { name: 'Baú do guardião', interaction_locked: true, has_key: true, has_loot: true },
  created_at: '2026-10-14T12:00:00Z',
  updated_at: '2026-10-14T12:00:00Z',
};
test('relocation changes only the coordinates, preserves geometry and does not mutate the selected element', () => {
  const before = structuredClone(chest);
  const geometry = sceneryDestinationGeometry(chest, { x: 14, y: 11 }, map);
  assert.deepEqual(geometry, { ...chest.geometry, x: 14, y: 11 });
  assert.deepEqual(chest, before);
});
test('relocation checks the whole footprint and refuses fractions, invalid cells and a different map', () => {
  for (const destination of [
    { x: 15, y: 11 },
    { x: -1, y: 4 },
    { x: 3, y: 12 },
    { x: 1.5, y: 2 },
    { x: NaN, y: 0 },
  ])
    assert.throws(() => sceneryDestinationGeometry(chest, destination, map), /bordas/);
  assert.throws(
    () => sceneryDestinationGeometry(chest, { x: 4, y: 4 }, { ...map, id: 'other' }),
    /deste mapa/,
  );
});
