import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnedToken, canControlToken } from '../src/features/vtt/interaction';
import { computeVision, visionCell } from '../src/features/vtt/vision';
import { calculateMovementCost } from '../src/features/vtt/movement';
import type { BattleMap, BattleMapCell, BattleToken } from '../src/features/vtt/types';

const map = { width: 12, height: 12, lighting: 'day', day_darkness_level: 'magical',
  vision_enabled: true, scale_per_cell: 1.5, scale_unit: 'm' } as BattleMap;
const hero = { id: 'hero', controlled_by: 'player', character_id: null, x: 2, y: 2,
  size: 1, visible: true, name: 'Herói' } as BattleToken;
const context = { master: false, userId: 'player', characterOwners: {},
  restrictToTurn: true, sessionActiveTokenId: 'hero' };
const eye = { x: 2.5, y: 2.5, darkvision: 18, devilSight: 0, trueSight: 0 };

test('magical darkness hides the whole board, including the player square, without revoking token ownership', () => {
  const vision = computeVision(map, [], [], [], [], [eye]);
  assert.equal(visionCell(vision, 2, 2), false);
  assert.equal(visionCell(vision, 3, 2), false);
  assert.equal(isOwnedToken(hero, context), true);
  assert.equal(canControlToken(hero, context), true);
  assert.equal(isOwnedToken({ ...hero, controlled_by: 'someone-else' }, context), false);
  assert.equal(canControlToken(hero, { ...context, sessionActiveTokenId: 'enemy' }), false);
  assert.equal(isOwnedToken(hero, { ...context, sessionActiveTokenId: 'enemy' }), true);
});

test('blind movement keeps collision and distance validation unchanged', () => {
  const cells = [{ x: 3, y: 2, blocked: true, movement_cost: 1 }] as BattleMapCell[];
  const base = { from: hero, width: map.width, height: map.height, cells,
    tokens: [hero], movingTokenId: hero.id, rules: { diagonalRule: 'one' as const } };
  const detour = calculateMovementCost({ ...base, to: { x: 4, y: 2 }, maxCost: 10 });
  assert.equal(detour.allowed, true);
  assert.ok(detour.path.length > 0);
  assert.equal(detour.path.some((point) => point.x === 3 && point.y === 2), false);
  const blocked = calculateMovementCost({ ...base, to: { x: 3, y: 2 }, maxCost: 10 });
  assert.equal(blocked.allowed, false);
  const tooFar = calculateMovementCost({ ...base, to: { x: 10, y: 10 }, maxCost: 1 });
  assert.equal(tooFar.allowed, false);
});