import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiceExpression,
  canUseAdvantage,
  diceForAnimation,
  rollBreakdown,
} from '../src/features/vtt/dice';
import meshes from '../src/features/vtt/dice-meshes.json';
import { shareBattleSnapshot } from '../src/features/vtt/snapshot';
import { calculateMovementCost, createMovementContext } from '../src/features/vtt/movement';
import type { BattleSnapshot, BattleMapCell, BattleToken } from '../src/features/vtt/types';

test('dice formulas normalize shorthand, retain negative modifiers, and reject code and unbounded work', () => {
  assert.equal(parseDiceExpression(' d20 + 3 ').expression, '1d20+3');
  assert.deepEqual(parseDiceExpression('2d6-d4-3').terms, [
    { sign: 1, count: 2, sides: 6 },
    { sign: -1, count: 1, sides: 4 },
    { sign: -1, count: 3, sides: null },
  ]);
  assert.equal(canUseAdvantage('d20-5'), true);
  assert.equal(canUseAdvantage('2d20'), false);
  assert.equal(canUseAdvantage('-1d20'), false);
  for (const bad of [
    '',
    '0d6',
    '101d4',
    '1d3',
    '1d1000',
    '1.5d6',
    'Infinity',
    '1d6;drop table x',
    '(1d4)*10',
    '1d6+100001',
  ])
    assert.throws(() => parseDiceExpression(bad), bad);
});
test('polyhedra have the correct physical faces, including a kite-faced d10 and pentagonal d12', () => {
  for (const [sides, mesh] of Object.entries(meshes)) {
    assert.equal(mesh.faces.length, Number(sides));
    assert.equal(new Set(mesh.faces.flat()).size, mesh.vertices.length);
    assert.ok(
      mesh.faces.every(
        (f) => f.length === (sides === '6' || sides === '10' ? 4 : sides === '12' ? 5 : 3),
      ),
    );
  }
});
test('the animation honors advantage discards and large-roll limits without changing the recorded total', () => {
  const r = {
    mode: 'advantage' as const,
    terms: [
      { sign: 1, count: 2, sides: 20, values: [4, 18], kept: 1, subtotal: 18 },
      { sign: 1, count: 3, sides: null, values: [], subtotal: 3 },
    ],
  };
  assert.deepEqual(diceForAnimation(r), [
    { sides: 20, value: 4, discarded: true },
    { sides: 20, value: 18, discarded: false },
  ]);
  assert.equal(rollBreakdown(r), '[4, 18] → 18 +3');
  assert.equal(
    diceForAnimation({
      terms: [{ sign: 1, count: 100, sides: 6, values: Array(100).fill(6), subtotal: 600 }],
    }).length,
    12,
  );
});
test('snapshot sharing retains terrain and unchanged pieces across turns without missing actual changes', () => {
  const old = {
    maps: [{ id: 'map', width: 20 }],
    sessions: [{ id: 'session', round: 1 }],
    tokens: [{ id: 'token', x: 1, y: 1 }],
    cells: [{ id: 'cell', x: 3, blocked: false }],
    objects: [],
    turnOrder: [],
  } as unknown as BattleSnapshot;
  assert.equal(shareBattleSnapshot(old, structuredClone(old)), old);
  const next = structuredClone(old);
  next.tokens[0].x = 2;
  next.sessions[0].round = 2;
  const shared = shareBattleSnapshot(old, next);
  assert.equal(shared.cells, old.cells);
  assert.equal(shared.maps, old.maps);
  assert.notEqual(shared.tokens, old.tokens);
  assert.equal(shared.tokens[0].x, 2);
  const painted = structuredClone(shared);
  painted.cells[0].blocked = true;
  assert.notEqual(shareBattleSnapshot(shared, painted).cells, shared.cells);
});
test('prepared movement indexes match uncached paths and rebuild correctly after terrain changes', () => {
  const cells = [{ id: 'c', x: 2, y: 1, blocked: true, movement_cost: 1 }] as BattleMapCell[],
    tokens = [{ id: 'hero', x: 0, y: 1, size: 1 }] as BattleToken[];
  const input = {
    from: tokens[0],
    to: { x: 4, y: 1 },
    width: 6,
    height: 6,
    cells,
    tokens,
    movingTokenId: 'hero',
    rules: { diagonalRule: 'one' as const },
  };
  const context = createMovementContext(cells, tokens, 'hero');
  assert.deepEqual(calculateMovementCost({ ...input, context }), calculateMovementCost(input));
  const fresh = cells.map((c) => ({ ...c, x: 4 })),
    changed = { ...input, cells: fresh, context: createMovementContext(fresh, tokens, 'hero') };
  assert.equal(calculateMovementCost(changed).allowed, false);
});
