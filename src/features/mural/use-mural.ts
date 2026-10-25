'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { createRefreshQueue } from '@/lib/refresh-queue';
import { errorMessage } from '@/lib/utils';
import { loadMural, muralStorageKey } from './repository';
import type { MuralItem } from './types';
export function useMural(
  campaignId: string,
  demo: boolean,
  master: boolean,
  userId: string | null,
  adventureSessionId?: string,
) {
  const scope = `${campaignId}:${adventureSessionId ?? ''}:${userId}:${demo}:${master}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; items: MuralItem[] } | null>(null),
    [settledFor, setSettledFor] = useState<string | null>(null),
    [failure, setFailure] = useState<{ scope: string; message: string } | null>(null);
  const queue = useMemo(
    () =>
      createRefreshQueue(() => loadMural(campaignId, demo, master, adventureSessionId), {
        onData(items) {
          setSnapshot((previous) =>
            previous?.scope === scope &&
            previous.items.length === items.length &&
            items.every((row, i) =>
              Object.keys(row).every(
                (key) => row[key as keyof MuralItem] === previous.items[i][key as keyof MuralItem],
              ),
            )
              ? previous
              : { scope, items },
          );
          setFailure(null);
        },
        onError(e) {
          setFailure({ scope, message: errorMessage(e) });
        },
        onSettled() {
          setSettledFor(scope);
        },
      }),
    [campaignId, demo, master, userId, adventureSessionId, scope],
  );
  const refresh = useCallback(() => queue.refresh().catch(() => {}), [queue]);
  useEffect(() => {
    void refresh();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      if (!document.hidden) {
        clearTimeout(timeout);
        timeout = setTimeout(() => void refresh(), 150);
      }
    };
    const storage = (e: StorageEvent) => {
      if (e.key === muralStorageKey(campaignId)) reload();
    };
    const local = (e: Event) => {
      if ((e as CustomEvent).detail === campaignId) reload();
    };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    window.addEventListener('storage', storage);
    window.addEventListener('cronica:mural-change', local);
    const timer = setInterval(reload, 30000);
    const channel = demo
      ? null
      : getSupabase()
          .channel(`mural-${campaignId}-${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'campaign_mural_states',
              filter: `campaign_id=eq.${campaignId}`,
            },
            reload,
          )
          .subscribe();
    return () => {
      queue.cancel();
      clearTimeout(timeout);
      clearInterval(timer);
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
      window.removeEventListener('storage', storage);
      window.removeEventListener('cronica:mural-change', local);
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [campaignId, demo, userId, queue, refresh]);
  return {
    items: snapshot?.scope === scope ? snapshot.items : [],
    loading: settledFor !== scope,
    error: failure?.scope === scope ? failure.message : null,
    refresh,
  };
}
