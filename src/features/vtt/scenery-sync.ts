import type { BattleMapObject } from './types';

type Row = BattleMapObject | null;
interface Change {
  row: Row;
  rollback: Row;
  pending: boolean;
  revision: number;
  remoteDeleted: boolean;
}

function newer(a: BattleMapObject, b: BattleMapObject) {
  const timeA = Date.parse(a.updated_at),
    timeB = Date.parse(b.updated_at);
  if (timeA !== timeB) return timeA > timeB;
  // PostgreSQL timestamps can differ by microseconds within one JS millisecond.
  const fraction = (s: string) => (s.match(/\.(\d+)/)?.[1] ?? '').padEnd(9, '0');
  return fraction(a.updated_at) > fraction(b.updated_at);
}

/** Replace one row while retaining every unrelated terrain/token reference. */
export function replaceSceneryRow(rows: BattleMapObject[], id: string, row: Row) {
  const index = rows.findIndex((o) => o.id === id);
  if (!row) return index < 0 ? rows : rows.filter((o) => o.id !== id);
  if (index < 0) return [...rows, row].sort((a, b) => a.id.localeCompare(b.id));
  if (rows[index] === row || JSON.stringify(rows[index]) === JSON.stringify(row)) return rows;
  const next = rows.slice();
  next[index] = row;
  return next;
}

/** Pending previews and acknowledgements cannot be overwritten by an older poll. */
export class ScenerySync {
  revision = 0;
  private changes = new Map<string, Change>();

  get pendingIds() {
    return new Set([...this.changes].filter(([, c]) => c.pending).map(([id]) => id));
  }
  isPending(id: string) {
    return this.changes.get(id)?.pending === true;
  }
  row(id: string) {
    return this.changes.get(id)?.row;
  }

  begin(object: BattleMapObject, preview: Row) {
    if (this.isPending(object.id)) return false;
    this.changes.set(object.id, {
      row: preview,
      rollback: object,
      pending: true,
      revision: ++this.revision,
      remoteDeleted: false,
    });
    return true;
  }

  receive(id: string, row: Row, current?: BattleMapObject) {
    // A realtime event can arrive after a newer poll has already completed.
    if (row && current && newer(current, row)) row = current;
    const previous = this.changes.get(id);
    if (previous?.pending) {
      if (!row) {
        previous.rollback = null;
        previous.remoteDeleted = true;
      } else if (!previous.remoteDeleted && (!previous.rollback || newer(row, previous.rollback)))
        previous.rollback = row;
      return previous.row;
    }
    if (row && previous?.row && newer(previous.row, row)) return previous.row;
    this.changes.set(id, {
      row,
      rollback: row,
      pending: false,
      revision: ++this.revision,
      remoteDeleted: false,
    });
    return row;
  }

  commit(id: string, confirmed: Row) {
    const previous = this.changes.get(id);
    const row = previous?.remoteDeleted
      ? null
      : confirmed && previous?.rollback && newer(previous.rollback, confirmed)
        ? previous.rollback
        : confirmed;
    this.changes.set(id, {
      row,
      rollback: row,
      pending: false,
      revision: ++this.revision,
      remoteDeleted: false,
    });
    return row;
  }

  rollback(id: string) {
    const row = this.changes.get(id)?.rollback ?? null;
    this.changes.set(id, {
      row,
      rollback: row,
      pending: false,
      revision: ++this.revision,
      remoteDeleted: false,
    });
    return row;
  }

  reconcile(rows: BattleMapObject[], startedAt: number, mapIds: Set<string>) {
    let result = rows;
    for (const [id, change] of this.changes) {
      const incoming = rows.find((o) => o.id === id);
      if (change.pending) {
        if (
          incoming &&
          !change.remoteDeleted &&
          (!change.rollback || newer(incoming, change.rollback))
        )
          change.rollback = incoming;
      } else if (change.revision <= startedAt) {
        // A fresh authorized read is authoritative, including removal by RLS.
        this.changes.delete(id);
        continue;
      } else if (incoming && change.row && newer(incoming, change.row)) {
        // The read started earlier, but its row includes a still newer server write.
        change.row = incoming;
        change.rollback = incoming;
      }
      if (!change.row || mapIds.has(change.row.map_id))
        result = replaceSceneryRow(result, id, change.row);
    }
    return result;
  }
}
