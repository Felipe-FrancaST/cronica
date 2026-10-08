import test from 'node:test';
import assert from 'node:assert/strict';
import { ambientDarkness, computeVision, darknessCells, regionFromCorners, visionCell } from '../src/features/vtt/vision';
import type { BattleMap, DarknessRegion } from '../src/features/vtt/types';

const base = {
  id: 'map', width: 30, height: 25, lighting: 'day', day_darkness_level: 'none',
  darkness_level: 'dark', vision_enabled: true, scale_per_cell: 1, scale_unit: 'm',
  darkness_regions: [],
} as unknown as BattleMap;
const eye = { x: 2.5, y: 4.5, darkvision: 0, devilSight: 0, trueSight: 0 };
const zone = (x: number, y: number, width: number, height: number, level: DarknessRegion['level']): DarknessRegion =>
  ({ id: `${x}:${y}`, x, y, width, height, level });
const check = (map: BattleMap, observers = [eye], lights: Parameters<typeof computeVision>[4] = []) =>
  computeVision(map, [], [], [], lights, observers);

test('regional darkness defaults off and does not impact daylight outside painted areas', () => {
  assert.equal(ambientDarkness(base), 'none');
  const map = { ...base, darkness_regions: [zone(4, 3, 8, 8, 'dark')] };
  assert.equal(visionCell(check(map), 5, 4), false);
  assert.equal(visionCell(check(map), 20, 4), true);
});

test('daytime magical darkness defeats ordinary lights and darkvision but not devil sight', () => {
  const map = { ...base, darkness_regions: [zone(4, 3, 8, 8, 'magical')] };
  const lights = [{ id: 'light', x: 6, y: 4, radius: 5, height: 1, strength: 1, color: '#fff' }];
  assert.equal(visionCell(check(map, [{ ...eye, darkvision: 18 }], lights), 5, 4), false);
  assert.equal(visionCell(check(map, [{ ...eye, devilSight: 36 }]), 5, 4), true);
});

test('light reveals normal darkness', () => {
  const map = { ...base, darkness_regions: [zone(4, 3, 8, 8, 'dark')] };
  assert.equal(visionCell(check(map, [eye], [{ id: 'light', x: 5, y: 4, height: 1, radius: 4, strength: 1, color: '#fff' }]), 5, 4), true);
});

test('none clears darkness in a defined region, and the last overlapping region wins', () => {
  const map = { ...base, lighting: 'night' as const, darkness_regions: [
    zone(10, 8, 8, 8, 'none'), zone(12, 10, 3, 3, 'magical'),
  ] };
  const cells = darknessCells(map);
  assert.equal(cells[9 * 30 + 11], 0);
  assert.equal(cells[11 * 30 + 13], 3);
  assert.equal(cells[0], 2);
  assert.equal(visionCell(check(map), 11, 9), true);
  assert.equal(visionCell(check(map), 13, 11), false);
});

test('penumbra does not block sight and region selection includes both corners', () => {
  const map = { ...base, darkness_regions: [zone(10, 8, 8, 8, 'dim')] };
  assert.equal(visionCell(check(map, []), 12, 10), true);
  const region = regionFromCorners({ x: 13, y: 11 }, { x: 5, y: 6 }, 'magical');
  assert.deepEqual([region.x, region.y, region.width, region.height], [5, 6, 9, 6]);
});

test('without individual vision, regions shade the scene but do not black out player cells', () => {
  const map = { ...base, vision_enabled: false, darkness_regions: [zone(4, 3, 8, 8, 'dark')] };
  assert.equal(check(map).enabled, false);
  assert.equal(visionCell(check(map), 5, 4), true);
  assert.equal(darknessCells(map)[4 * 30 + 5], 2);
});
