import { performance } from 'node:perf_hooks';
import { calculateMovementCost, createMovementContext } from '../src/features/vtt/movement';
import type { BattleMapCell, BattleToken } from '../src/features/vtt/types';

// Microbenchmark of pointer previews, without a GPU, network or real campaign.
const cells: BattleMapCell[] = [];
for (let y = 15; y < 36; y++)
  for (let x = 0; x < 50; x++) {
    cells.push({
      id: `${x}:${y}`,
      x,
      y,
      z: 0,
      map_id: 'benchmark',
      terrain_type: 'difficult',
      movement_cost: 2,
      blocked: false,
      metadata: {},
      created_at: '',
      updated_at: '',
    });
  }
const tokens = Array.from({ length: 24 }, (_, i) => ({
  id: `token-${i}`,
  x: i ? i + 15 : 2,
  y: i ? 10 : 4,
  size: 1,
})) as BattleToken[];
const context = createMovementContext(cells, tokens, tokens[0].id);
const repetitions = 400;
function run(reuse: boolean) {
  const start = performance.now();
  for (let i = 0; i < repetitions; i++)
    calculateMovementCost({
      from: tokens[0],
      to: { x: 3 + (i % 11), y: 3 + (i % 8) },
      width: 50,
      height: 40,
      cells,
      tokens,
      movingTokenId: tokens[0].id,
      rules: { diagonalRule: 'one' },
      ...(reuse ? { context } : {}),
    });
  return performance.now() - start;
}
run(false);
run(true);
const samples = Array.from({ length: 7 }, () => ({ fresh: run(false), reused: run(true) }));
const median = (key: 'fresh' | 'reused') => samples.map((s) => s[key]).sort((a, b) => a - b)[3];
const fresh = median('fresh'),
  reused = median('reused');
console.log(
  JSON.stringify(
    {
      scope: 'A* pointer previews; CPU only; median of 7 samples',
      map: '50 × 40',
      terrainCells: cells.length,
      tokens: tokens.length,
      previewsPerSample: repetitions,
      milliseconds: { rebuildPerPreview: +fresh.toFixed(2), reusedIndexes: +reused.toFixed(2) },
      speedup: +(fresh / reused).toFixed(2),
    },
    null,
    2,
  ),
);
