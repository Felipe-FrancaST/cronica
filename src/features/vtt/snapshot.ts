import type { BattleSnapshot } from './types';
import { shareRows } from '@/lib/structural-sharing';

/** Keep unchanged rows/arrays alive so polling never rebuilds the GPU or path indexes. */
export function shareBattleSnapshot(old: BattleSnapshot, next: BattleSnapshot): BattleSnapshot {
  const result: BattleSnapshot = {
    ...next,
    maps: shareRows(old.maps, next.maps)!,
    sessions: shareRows(old.sessions, next.sessions)!,
    tokens: shareRows(old.tokens, next.tokens)!,
    cells: shareRows(old.cells, next.cells)!,
    fog: shareRows(old.fog, next.fog),
    objects: shareRows(old.objects, next.objects)!,
    turnOrder: shareRows(old.turnOrder, next.turnOrder)!,
    actions: shareRows(old.actions, next.actions),
    decisions: shareRows(old.decisions, next.decisions),
    lifeStates: shareRows(old.lifeStates, next.lifeStates),
    conditionEffects: shareRows(old.conditionEffects, next.conditionEffects),
    spellEffects: shareRows(old.spellEffects, next.spellEffects),
    movementPlans: shareRows(old.movementPlans, next.movementPlans),
  };
  return Object.keys(result).every(
    (key) => result[key as keyof BattleSnapshot] === old[key as keyof BattleSnapshot],
  )
    ? old
    : result;
}
