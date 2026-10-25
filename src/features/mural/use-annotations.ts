'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { useActionNotice } from '@/components/action-notice';
import { createRefreshQueue } from '@/lib/refresh-queue';
import { getSupabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/utils';
import type { MuralItem } from './types';
import {
  mergeAnnotationDelta,
  type AnnotationPayload,
  type MuralAnnotation,
} from './annotation-model';
import {
  addMuralAnnotation,
  annotationStorageKey,
  clearMuralAnnotations,
  eraseMuralAnnotation,
  getMuralAnnotations,
} from './annotation-repository';
type Operation = {
  id: string;
  type: 'add' | 'erase' | 'clear';
  row?: MuralAnnotation;
  status: 'saving' | 'failed';
};
export function useAnnotations(item: MuralItem, allowed: boolean) {
  const w = useWorkspace(),
    user = w.user!.id,
    announce = useActionNotice();
  const [rows, setRows] = useState<MuralAnnotation[]>([]),
    [pending, setPending] = useState<Operation[]>([]),
    [loading, setLoading] = useState(true),
    [permitted, setPermitted] = useState(false),
    [error, setError] = useState<string | null>(null);
  const cursor = useRef(0),
    mounted = useRef(false),
    epoch = useRef(0),
    operations = useRef(new Map<string, Operation>()),
    tail = useRef<Promise<void>>(Promise.resolve());
  const queue = useMemo(
    () =>
      createRefreshQueue(() => getMuralAnnotations(item, cursor.current, w.demo, user), {
        onData(delta) {
          if (delta.image_path !== item.image_path) {
            setPermitted(false);
            setRows([]);
            setError('A imagem mudou. Atualize o mural para continuar.');
            return;
          }
          cursor.current = delta.revision;
          setRows((current) => mergeAnnotationDelta(current, delta));
          setPermitted(delta.can_write);
          setError(null);
        },
        onError(e) {
          setError(errorMessage(e));
          setPermitted(false);
          setRows([]);
          cursor.current = 0;
        },
        onSettled() {
          setLoading(false);
        },
      }),
    [item.id, item.image_path, w.demo, user],
  );
  useEffect(() => {
    mounted.current = true;
    epoch.current++;
    operations.current.clear();
    setPending([]);
    tail.current = Promise.resolve();
    cursor.current = 0;
    setRows([]);
    setLoading(true);
    setPermitted(false);
    const refresh = () => {
      if (!document.hidden) void queue.refresh().catch(() => {});
    };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timeout);
      timeout = setTimeout(refresh, 120);
    };
    const local = (e: Event) => {
      if ((e as CustomEvent).detail === item.id) schedule();
    };
    const storage = (e: StorageEvent) => {
      if (e.key === annotationStorageKey(item.id)) schedule();
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('storage', storage);
    window.addEventListener('cronica:mural-annotation-change', local);
    const channel = w.demo
      ? null
      : getSupabase()
          .channel(`mural-marks-${item.id}-${user}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'campaign_mural_annotation_states',
              filter: `item_id=eq.${item.id}`,
            },
            schedule,
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'campaign_rules',
              filter: `campaign_id=eq.${item.campaign_id}`,
            },
            schedule,
          )
          .subscribe();
    return () => {
      mounted.current = false;
      epoch.current++;
      queue.cancel();
      clearInterval(timer);
      clearTimeout(timeout);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('storage', storage);
      window.removeEventListener('cronica:mural-annotation-change', local);
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [queue, item.id, item.campaign_id, user, w.demo]);
  useEffect(() => {
    void queue.refresh().catch(() => {});
  }, [allowed, queue]);
  useEffect(() => {
    if (!pending.length) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [pending.length]);
  function updatePending() {
    if (mounted.current) setPending([...operations.current.values()]);
  }
  function enqueue(operation: Operation) {
    const scope = epoch.current;
    const active = () => mounted.current && scope === epoch.current;
    operations.current.set(operation.id, operation);
    updatePending();
    tail.current = tail.current
      .catch(() => {})
      .then(async () => {
        if (!active()) return;
        try {
          if (operation.type === 'add') {
            const row = await addMuralAnnotation(
              item,
              operation.id,
              operation.row!.payload,
              w.demo,
              user,
            );
            if (active())
              setRows((all) =>
                mergeAnnotationDelta(all, {
                  revision: row.version,
                  snapshot: false,
                  can_write: true,
                  image_path: item.image_path!,
                  annotations: [row],
                }),
              );
          } else if (operation.type === 'erase') {
            await eraseMuralAnnotation(item, operation.id, w.demo, user);
            if (active()) setRows((all) => all.filter((a) => a.id !== operation.id));
          } else {
            await clearMuralAnnotations(item, w.demo, user);
            if (active()) setRows([]);
          }
          if (active()) {
            operations.current.delete(operation.id);
            updatePending();
            void queue.refresh().catch(() => {});
          }
        } catch (e) {
          operation.status = 'failed';
          if (active()) {
            updatePending();
            announce(errorMessage(e), 'error');
            void queue.refresh().catch(() => {});
          }
        }
      });
  }
  const canWrite = permitted && allowed && !loading;
  function add(payload: AnnotationPayload) {
    if (!canWrite) return;
    const id = crypto.randomUUID();
    enqueue({
      id,
      type: 'add',
      status: 'saving',
      row: {
        id,
        item_id: item.id,
        campaign_id: item.campaign_id,
        author_id: user,
        payload,
        created_at: new Date().toISOString(),
        version: 0,
        deleted: false,
      },
    });
  }
  function erase(id: string) {
    if (!canWrite || operations.current.has(id)) return;
    enqueue({ id, type: 'erase', status: 'saving' });
  }
  function clear() {
    if (canWrite && !operations.current.size)
      enqueue({ id: crypto.randomUUID(), type: 'clear', status: 'saving' });
  }
  const visible = new Map(rows.map((a) => [a.id, a]));
  for (const op of pending) {
    if (op.type === 'add') visible.set(op.id, op.row!);
    else if (op.type === 'erase') visible.delete(op.id);
    else visible.clear();
  }
  return {
    rows: [...visible.values()],
    pending: pending.length,
    failed: pending.filter((p) => p.status === 'failed').length,
    loading,
    error,
    canWrite,
    add,
    erase,
    clear,
    refresh: () => queue.refresh().catch(() => {}),
    retry: () => {
      for (const op of operations.current.values())
        if (op.status === 'failed') {
          op.status = 'saving';
          enqueue(op);
        }
    },
    savingIds: new Set(pending.map((p) => p.id)),
  };
}
