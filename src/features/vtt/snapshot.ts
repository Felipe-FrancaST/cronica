import type { BattleSnapshot } from './types';

/** Keep unchanged rows/arrays alive so polling never rebuilds the GPU or path indexes. */
function shareRows<T extends { id: string }>(old: T[] | undefined, next: T[] | undefined) {
  if (old === next) return old;
  if (!next || !old) return next;
  const byId = new Map(old.map((row) => [row.id, row]));
  const rows = next.map((row) => {
    const previous = byId.get(row.id);
    return previous && JSON.stringify(previous) === JSON.stringify(row) ? previous : row;
  });
  return rows.length === old.length && rows.every((row, i) => row === old[i]) ? old : rows;
}
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
    spellEffects: shareRows(old.spellEffects, next.spellEffects),
    movementPlans: shareRows(old.movementPlans, next.movementPlans),
  };
  return Object.keys(result).every(
    (key) => result[key as keyof BattleSnapshot] === old[key as keyof BattleSnapshot],
  )
    ? old
    : result;
}
