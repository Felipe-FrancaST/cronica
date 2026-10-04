import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canControlToken,
  gridToWorld,
  movementBudget,
  sameCell,
  tokenAtCell,
  worldToCell,
} from '../src/features/vtt/interaction';
import type { BattleToken } from '../src/features/vtt/types';

const token: BattleToken = {
  id: 'hero',
  campaign_id: 'campaign',
  map_id: 'arena',
  character_id: 'character',
  npc_id: null,
  name: 'Hero',
  image: null,
  x: 3,
  y: 7,
  z: 2,
  size: 1,
  movement_speed: 30,
  movement_remaining: 15,
  movement_unit: 'ft',
  controlled_by: 'player',
  visible: true,
  version: 0,
  created_at: '',
  updated_at: '',
};
const context = {
  master: false,
  userId: 'player',
  characterOwners: {},
  restrictToTurn: true,
  sessionActiveTokenId: 'hero',
};

test('3D projection keeps grid depth separate from stored elevation', () => {
  assert.deepEqual(gridToWorld(token), { x: 3.5, y: 2, z: 7.5 });
  assert.deepEqual(worldToCell(3.5, 7.5, 12, 12), { x: 3, y: 7 });
  assert.deepEqual(gridToWorld({ x: 0, y: 0 }, 2), { x: 1, y: 0, z: 1 });
});

test('picking accepts edge cells and rejects empty space and invalid coordinates', () => {
  assert.deepEqual(worldToCell(0, 0, 12, 8), { x: 0, y: 0 });
  assert.deepEqual(worldToCell(11.999, 7.999, 12, 8), { x: 11, y: 7 });
  for (const [x, z] of [
    [12, 0],
    [0, 8],
    [-0.001, 0],
    [0, -1],
    [NaN, 0],
    [0, Infinity],
  ])
    assert.equal(worldToCell(x, z, 12, 8), null);
});

test('both renderers respect controller, character owner and active turn', () => {
  assert.equal(canControlToken(token, context), true);
  assert.equal(canControlToken(token, { ...context, sessionActiveTokenId: 'enemy' }), false);
  assert.equal(canControlToken(token, { ...context, userId: 'outsider' }), false);
  assert.equal(
    canControlToken(token, {
      ...context,
      userId: 'owner',
      characterOwners: { character: 'owner' },
    } as typeof context),
    true,
  );
  assert.equal(
    canControlToken(token, { ...context, master: true, sessionActiveTokenId: 'enemy' }),
    true,
  );
});

test('movement budget uses map units and forced movement remains exclusive to the master', () => {
  const map = { scale_unit: 'm' as const, scale_per_cell: 1.5 };
  const props = { map, master: false, forceMove: false, movementLimited: true };
  assert.ok(
    Math.abs(movementBudget(token, props as Parameters<typeof movementBudget>[1])! - 3) < 0.001,
  );
  assert.notEqual(
    movementBudget(token, { ...props, forceMove: true } as Parameters<typeof movementBudget>[1]),
    undefined,
  );
  assert.equal(
    movementBudget(token, { ...props, master: true, forceMove: true } as Parameters<
      typeof movementBudget
    >[1]),
    undefined,
  );
  assert.equal(
    movementBudget(token, { ...props, movementLimited: false } as Parameters<
      typeof movementBudget
    >[1]),
    undefined,
  );
});

test('larger visual tokens can be selected across their footprint', () => {
  const large = { ...token, size: 2 };
  assert.equal(tokenAtCell([large], { x: 4, y: 8 })?.id, 'hero');
  assert.equal(tokenAtCell([large], { x: 5, y: 8 }), null);
  assert.equal(sameCell({ x: 2, y: 1 }, { x: 2, y: 1 }), true);
  assert.equal(sameCell(null, { x: 2, y: 1 }), false);
});
