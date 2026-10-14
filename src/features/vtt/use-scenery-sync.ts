'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ScenerySync, replaceSceneryRow } from './scenery-sync';
import type { BattleMapObject, BattleSnapshot } from './types';

export function useScenerySync(
  scope: string,
  snapshot: RefObject<BattleSnapshot>,
  publish: (next: BattleSnapshot) => void,
) {
  const sync = useMemo(() => new ScenerySync(), [scope]);
  const active = useRef<ScenerySync | null>(sync);
  active.current = sync;
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    active.current = sync;
    setPendingIds(new Set());
    return () => {
      if (active.current === sync) active.current = null;
    };
  }, [sync]);
  const show = useCallback(
    (id: string, row: BattleMapObject | null) => {
      if (active.current !== sync) return;
      const current = snapshot.current;
      if (row && !current.maps.some((m) => m.id === row.map_id)) return;
      const objects = replaceSceneryRow(current.objects, id, row);
      if (objects !== current.objects) publish({ ...current, objects });
    },
    [sync, snapshot, publish],
  );
  const receive = useCallback(
    (id: string, row: BattleMapObject | null) => {
      if (active.current === sync)
        show(
          id,
          sync.receive(
            id,
            row,
            snapshot.current.objects.find((o) => o.id === id),
          ),
        );
    },
    [sync, show, snapshot],
  );
  const mutate = useCallback(
    async (
      object: BattleMapObject,
      preview: BattleMapObject | null,
      write: () => Promise<BattleMapObject | null>,
    ) => {
      if (active.current !== sync || !sync.begin(object, preview)) return false;
      show(object.id, preview);
      setPendingIds(sync.pendingIds);
      try {
        const confirmed = await write();
        if (active.current !== sync) return false;
        show(object.id, sync.commit(object.id, confirmed));
        return true;
      } catch (e) {
        if (active.current !== sync) return false;
        show(object.id, sync.rollback(object.id));
        throw e;
      } finally {
        if (active.current === sync) setPendingIds(sync.pendingIds);
      }
    },
    [sync, show],
  );
  return { sync, pendingIds, receive, mutate };
}
