import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { addSceneryMeshes } from '../src/features/vtt/scenery-meshes';
import { SceneryMeshLayer } from '../src/features/vtt/scenery-mesh-layer';
import { makeScenery, sceneryDefaults } from '../src/features/vtt/scenery';
import { disposeSceneObject } from '../src/features/vtt/scene-resources';
import type { BattleMapObject } from '../src/features/vtt/types';

// Repeated scene refreshes without a browser, GPU, network or real campaign.
const objects: BattleMapObject[] = Array.from({ length: 480 }, (_, i) => {
  const kind = (['pillar', 'door', 'treasure'] as const)[i % 3];
  return {
    ...makeScenery(
      'benchmark',
      { x: (i % 32) * 2, y: Math.floor(i / 32) * 2 },
      { kind, width: 1, height: 1, rotation: 0, ...sceneryDefaults(kind) },
    ),
    id: String(i),
    created_at: '',
    updated_at: '',
  };
});
const refreshes = 40;
function run(reuse: boolean) {
  const root = new THREE.Group(),
    layer = new SceneryMeshLayer(root, { value: 0 });
  if (reuse) layer.update(objects, 1.5);
  const start = performance.now();
  for (let i = 0; i < refreshes; i++) {
    const snapshot = objects.map((o) => ({ ...o, updated_at: String(i) }));
    if (reuse) layer.update(snapshot, 1.5);
    else {
      disposeSceneObject(root);
      addSceneryMeshes(root, snapshot, { value: 0 }, 1.5);
    }
  }
  const elapsed = performance.now() - start;
  layer.dispose();
  disposeSceneObject(root);
  return elapsed;
}
run(false);
run(true);
const samples = Array.from({ length: 5 }, () => ({ rebuild: run(false), reuse: run(true) }));
const median = (key: 'rebuild' | 'reuse') => samples.map((s) => s[key]).sort((a, b) => a - b)[2];
const rebuild = median('rebuild'),
  reuse = median('reuse');
console.log(
  JSON.stringify(
    {
      scope: 'CPU scene refresh; median of 5 samples; no GPU or FPS measurement',
      objects: objects.length,
      refreshesPerSample: refreshes,
      milliseconds: { rebuildAll: +rebuild.toFixed(2), retainBatches: +reuse.toFixed(2) },
      speedup: +(rebuild / reuse).toFixed(2),
    },
    null,
    2,
  ),
);
