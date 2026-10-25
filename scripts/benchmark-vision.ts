import { performance } from 'node:perf_hooks';
import { computeVision, type VisionObserver } from '../src/features/vtt/vision';
import type { BattleMap, BattleMapCell } from '../src/features/vtt/types';
import type { SceneryLight } from '../src/features/vtt/scenery-lighting';

// Repeatable CPU workload, independent of a GPU, network or campaign data.
const cases = [
  { name: 'open-day', width: 250, height: 200, walls: false, night: false },
  { name: 'walls-day', width: 160, height: 120, walls: true, night: false },
  { name: 'lights-night', width: 160, height: 120, walls: true, night: true },
];
const results = cases.map((c) => {
  const map = {
    width: c.width,
    height: c.height,
    vision_enabled: true,
    scale_unit: 'm',
    scale_per_cell: 1.5,
    lighting: c.night ? 'night' : 'day',
    darkness_level: 'dark',
  } as BattleMap;
  const cells = c.walls
    ? (Array.from({ length: 60 }, (_, i) => ({
        x: 40 + (i % 15),
        y: 35 + Math.floor(i / 15),
        blocked: true,
      })) as BattleMapCell[])
    : [];
  const observers: VisionObserver[] = [
    { x: 12.5, y: 15.5, darkvision: 18, devilSight: 0, trueSight: 0 },
    { x: 23.5, y: 26.5, darkvision: 36, devilSight: 0, trueSight: 0 },
  ];
  const lights: SceneryLight[] = c.night
    ? Array.from({ length: 48 }, (_, i) => ({
        id: String(i),
        x: 10.5 + (i % 8) * 15,
        y: 10.5 + Math.floor(i / 8) * 15,
        height: 1,
        radius: 12,
        brightRadius: 6,
        strength: 1,
        color: '#ffe8ae',
      }))
    : [];
  const run = () => computeVision(map, cells, [], [], lights, observers);
  run();
  run();
  const samples: number[] = [];
  let visible = 0;
  for (let i = 0; i < 7; i++) {
    const start = performance.now(),
      result = run();
    samples.push(performance.now() - start);
    visible = result.visible.reduce((sum, n) => sum + n, 0);
  }
  samples.sort((a, b) => a - b);
  return {
    case: c.name,
    cells: c.width * c.height,
    observers: observers.length,
    lights: lights.length,
    visible,
    medianMs: +samples[3].toFixed(2),
  };
});
console.log(
  JSON.stringify(
    { scope: 'CPU visibility calculation; median of 7; no FPS or network claim', results },
    null,
    2,
  ),
);
