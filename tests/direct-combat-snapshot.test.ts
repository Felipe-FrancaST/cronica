import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCombatUpdate, type CombatUpdate } from '../src/features/vtt/repository';
import type { BattleSnapshot } from '../src/features/vtt/types';
test('compact combat replies retain terrain and unchanged pieces and reject another map scope', () => {
  const previous = {
    maps: [{ id: 'map', battle_session_id: 'session' }],
    sessions: [{ id: 'session', round: 1 }],
    tokens: [
      { id: 'hero', map_id: 'map', x: 1, action_used: false },
      { id: 'npc', map_id: 'map', x: 2 },
    ],
    cells: [{ id: 'terrain' }],
    objects: [{ id: 'torch' }],
    fog: [],
    turnOrder: [],
    actions: [],
    decisions: [],
    spellEffects: [],
    movementPlans: [],
  } as unknown as BattleSnapshot;
  const reply = {
    map_id: 'map',
    sessions: structuredClone(previous.sessions),
    tokens: structuredClone(previous.tokens),
    actions: [],
    decisions: [],
    spellEffects: [],
    movementPlans: [],
  } as CombatUpdate;
  assert.equal(mergeCombatUpdate(previous, reply), previous);
  reply.tokens[0].action_used = true;
  const next = mergeCombatUpdate(previous, reply);
  assert.equal(next.tokens[0].action_used, true);
  assert.equal(next.tokens[1], previous.tokens[1]);
  assert.equal(next.cells, previous.cells);
  assert.equal(next.objects, previous.objects);
  assert.equal(next.maps, previous.maps);
  assert.equal(mergeCombatUpdate(next, { ...reply, map_id: 'previous-campaign-map' }), next);
});
