import test from 'node:test';
import assert from 'node:assert/strict';
import {
  characterVision,
  computeVision,
  observerFromToken,
  visionCell,
} from '../src/features/vtt/vision';
import { sceneryLights } from '../src/features/vtt/scenery-lighting';
import { createVisionComputer } from '../src/features/vtt/vision-cache';
import { mergeVisionMap } from '../src/features/vtt/map-vision';
import { defaultSheet } from '../src/systems/dnd5e';
import { RACE_CATALOG } from '../src/systems/dnd5e/ancestries';
import type { Character } from '../src/types';
import type {
  BattleMap,
  BattleMapCell,
  BattleMapObject,
  BattleSnapshot,
  BattleToken,
} from '../src/features/vtt/types';
const map = {
  id: 'map',
  width: 70,
  height: 15,
  lighting: 'night',
  darkness_level: 'dark',
  vision_enabled: true,
  scale_unit: 'm',
  scale_per_cell: 1.5,
} as BattleMap;
const human = { x: 5.5, y: 5.5, darkvision: 0, devilSight: 0, trueSight: 0 };
const torch = {
  id: 'torch',
  map_id: map.id,
  object_type: 'torch',
  geometry: { x: 30, y: 5, width: 1, height: 1 },
  visible: true,
  z: 0,
  blocks_vision: false,
  blocks_movement: false,
  created_at: '',
  updated_at: '',
  metadata: { light_enabled: true },
} as BattleMapObject;

test('a human in total darkness cannot see even the terrain beneath their own piece', () => {
  const sight = computeVision(map, [], [], [], [], [human]);
  assert.equal(sight.visible.some(Boolean), false);
  assert.equal(visionCell(sight, 5, 5), false);
  const dim = computeVision({ ...map, darkness_level: 'dim' }, [], [], [], [], [human]);
  assert.equal(dim.visible.every(Boolean), true);
  assert.equal(dim.perceived![5 * map.width + 5], 1);
});

test('every race uses its catalogued darkvision range and the map scale', () => {
  const token = { id: 'hero', character_id: 'character', x: 5, y: 5, size: 1 } as BattleToken;
  for (const race of RACE_CATALOG) {
    const character = {
      id: 'character',
      sheet: { ...defaultSheet(), race_id: race.id, race: race.name },
    } as Character;
    const observer = observerFromToken(token, [character], [], [], [], [token]);
    assert.equal(observer.darkvision, race.darkvision, race.name);
    const sight = computeVision(map, [], [], [], [], [observer]);
    if (!race.darkvision) assert.equal(sight.visible.some(Boolean), false, race.name);
    else {
      const cells = Math.floor(race.darkvision / 1.5);
      assert.equal(visionCell(sight, 5 + cells, 5), true, race.name);
      assert.equal(sight.perceived![5 * map.width + 5 + cells], 2, race.name);
      assert.equal(visionCell(sight, 6 + cells, 5), false, race.name);
    }
  }
  const dwarf = {
    ...human,
    darkvision: characterVision({ sheet: { race: 'Anão' } } as Character, undefined).darkvision,
  };
  const feet = computeVision(
    { ...map, scale_unit: 'ft', scale_per_cell: 10 },
    [],
    [],
    [],
    [],
    [dwarf],
  );
  assert.equal(visionCell(feet, 11, 5), true);
  assert.equal(visionCell(feet, 12, 5), false);
});

test('an ordinary torch opens its bright and dim areas beyond racial vision without exposing the dark path', () => {
  const lights = sceneryLights([torch], map);
  assert.equal(lights[0].brightRadius, 4);
  assert.equal(lights[0].radius, 8);
  const lit = computeVision(map, [], [torch], [], lights, [human]);
  assert.equal(lit.perceived![5 * map.width + 30], 0);
  assert.equal(lit.perceived![5 * map.width + 35], 1);
  assert.equal(visionCell(lit, 39, 5), false);
  assert.equal(visionCell(lit, 15, 5), false);
  const dwarf = computeVision(map, [], [torch], [], lights, [{ ...human, darkvision: 18 }]);
  assert.equal(visionCell(dwarf, 30, 5), true);
  assert.equal(visionCell(dwarf, 20, 5), false);
});

test('extinguishing a torch hides its area immediately; walls and GM fog still win', () => {
  const computer = createVisionComputer(),
    cells: BattleMapCell[] = [],
    fog: [] = [];
  const lit = computer.compute(map, cells, [torch], fog, sceneryLights([torch], map), [human]);
  assert.equal(visionCell(lit, 30, 5), true);
  const off = { ...torch, metadata: { light_enabled: false } };
  const dark = computer.compute(map, cells, [off], fog, sceneryLights([off], map), [human]);
  assert.equal(dark.visible.some(Boolean), false);
  const wall = Array.from({ length: map.height }, (_, y) => ({
    x: 20,
    y,
    blocked: true,
  })) as BattleMapCell[];
  assert.equal(
    visionCell(computeVision(map, wall, [torch], [], sceneryLights([torch], map), [human]), 30, 5),
    false,
  );
  assert.equal(
    visionCell(
      computeVision(
        map,
        [],
        [torch],
        [{ id: 'fog', map_id: map.id, x: 30, y: 5 }],
        sceneryLights([torch], map),
        [human],
      ),
      30,
      5,
    ),
    false,
  );
});

test('confirmed vision settings retain terrain references and cannot resurrect an unauthorized or older map', () => {
  const before = { ...map, updated_at: '2026-10-25T10:00:00.000002Z' };
  const snapshot = {
    maps: [before],
    sessions: [],
    tokens: [],
    cells: [],
    fog: [],
    objects: [],
    turnOrder: [],
  } as BattleSnapshot;
  const changed = mergeVisionMap(snapshot, {
    ...before,
    darkness_level: 'dim',
    updated_at: '2026-10-25T10:00:00.000003Z',
  });
  assert.equal(changed.cells, snapshot.cells);
  assert.equal(changed.objects, snapshot.objects);
  assert.equal(changed.maps[0].darkness_level, 'dim');
  assert.equal(mergeVisionMap(changed, before), changed);
  assert.equal(mergeVisionMap(changed, { ...before, id: 'unknown' }), changed);
});
