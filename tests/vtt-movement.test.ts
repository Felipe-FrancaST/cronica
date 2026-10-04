import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMovementCost,
  convertDistance,
  pathDistanceInCells,
  reachableCells,
} from '../src/features/vtt/movement';
import type { BattleMapCell, BattleToken } from '../src/features/vtt/types';

const token = (x: number, y: number): BattleToken => ({
  id: 'token',
  campaign_id: 'campaign',
  map_id: 'map',
  character_id: null,
  npc_id: null,
  name: 'Hero',
  image: null,
  x,
  y,
  z: 0,
  size: 1,
  movement_speed: 9,
  movement_remaining: 9,
  movement_unit: 'm',
  controlled_by: null,
  visible: true,
  version: 0,
  created_at: '',
  updated_at: '',
});
const cell = (x: number, y: number, movement_cost = 1, blocked = false): BattleMapCell => ({
  id: `${x}-${y}`,
  map_id: 'map',
  x,
  y,
  z: 0,
  terrain_type: blocked ? 'blocked' : 'normal',
  movement_cost,
  blocked,
  metadata: {},
  created_at: '',
  updated_at: '',
});

test('A* avoids blocked cells and returns a logical path', () => {
  const result = calculateMovementCost({
    from: { x: 0, y: 0 },
    to: { x: 2, y: 0 },
    width: 5,
    height: 5,
    cells: [cell(1, 0, 1, true)],
    tokens: [token(0, 0)],
    movingTokenId: 'token',
    rules: { diagonalRule: 'one' },
  });
  assert.equal(result.allowed, true);
  assert.ok(result.path.length >= 2);
  assert.ok(!result.path.some((p) => p.x === 1 && p.y === 0));
});

test('terrain cost limits movement and reachable area', () => {
  const cells = [cell(1, 0, 2)];
  const result = calculateMovementCost({
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    width: 3,
    height: 3,
    cells,
    tokens: [token(0, 0)],
    movingTokenId: 'token',
    rules: { diagonalRule: 'one' },
    maxCost: 1,
  });
  assert.equal(result.allowed, false);
  const reachable = reachableCells({
    from: { x: 0, y: 0 },
    width: 3,
    height: 3,
    cells,
    tokens: [token(0, 0)],
    movingTokenId: 'token',
    rules: { diagonalRule: 'one' },
    maxCost: 1,
  });
  assert.equal(reachable.has('1:0'), false);
  assert.equal(reachable.has('0:1'), true);
});

test('movement rules do not force Euclidean distance', () => {
  const common = {
    from: { x: 0, y: 0 },
    to: { x: 2, y: 2 },
    width: 5,
    height: 5,
    cells: [],
    tokens: [token(0, 0)],
    movingTokenId: 'token',
  };
  const one = calculateMovementCost({ ...common, rules: { diagonalRule: 'one' } });
  const sqrt = calculateMovementCost({ ...common, rules: { diagonalRule: 'sqrt2' } });
  const alternating = calculateMovementCost({
    ...common,
    rules: { diagonalRule: 'five-ten-five' },
  });
  assert.equal(one.cost, 2);
  assert.ok(Math.abs(sqrt.cost - Math.SQRT2 * 2) < 0.001);
  assert.equal(alternating.cost, 3);
});

test('diagonal movement cannot cut through blocked corners', () => {
  const result = calculateMovementCost({
    from: { x: 0, y: 0 },
    to: { x: 1, y: 1 },
    width: 3,
    height: 3,
    cells: [cell(1, 0, 1, true), cell(0, 1, 1, true)],
    tokens: [token(0, 0)],
    movingTokenId: 'token',
    rules: { diagonalRule: 'one' },
  });
  assert.equal(result.allowed, false);
});

test('metric and imperial conversion is reversible', () => {
  const feet = convertDistance(9, 'm', 'ft');
  assert.ok(Math.abs(feet - 29.5276) < 0.001);
  assert.ok(Math.abs(convertDistance(feet, 'ft', 'm') - 9) < 0.001);
});

test('path distance follows the configured diagonal rule without terrain cost', () => {
  const path = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 2 },
  ];
  assert.equal(pathDistanceInCells({ x: 0, y: 0 }, path, 'one'), 3);
  assert.equal(pathDistanceInCells({ x: 0, y: 0 }, path, 'five-ten-five'), 4);
  assert.ok(
    Math.abs(pathDistanceInCells({ x: 0, y: 0 }, path, 'sqrt2') - (Math.SQRT2 * 2 + 1)) < 0.001,
  );
});

test('blocked destinations fail before searching a large map', () => {
  const result = calculateMovementCost({
    from: { x: 0, y: 0 },
    to: { x: 499, y: 499 },
    width: 500,
    height: 500,
    cells: [cell(499, 499, 1, true)],
    tokens: [token(0, 0)],
    movingTokenId: 'token',
    rules: { diagonalRule: 'one' },
  });
  assert.equal(result.allowed, false);
  assert.equal(result.path.length, 0);
  assert.match(result.reason!, /bloqueada/);
});

test('client previews reject paths beyond the RPC limit of 500 steps', () => {
  const result = calculateMovementCost({
    from: { x: 0, y: 0 },
    to: { x: 0, y: 2 },
    width: 300,
    height: 3,
    cells: Array.from({ length: 299 }, (_, x) => cell(x, 1, 1, true)),
    tokens: [token(0, 0)],
    movingTokenId: 'token',
    rules: { diagonalRule: 'one' },
  });
  assert.ok(result.path.length > 500);
  assert.equal(result.allowed, false);
  assert.match(result.reason!, /500/);
});
