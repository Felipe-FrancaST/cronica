'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { getSupabase } from '@/lib/supabase/client';
import { createRefreshQueue } from '@/lib/refresh-queue';
import { errorMessage } from '@/lib/utils';
import { loadCampaignSessions } from './repository';
import type { CampaignSession } from './types';
export function useCampaignSessions(campaignId: string, master: boolean) {
  const w = useWorkspace(),
    userId = w.user?.id,
    scope = `${campaignId}:${userId}:${w.demo}:${master}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; items: CampaignSession[] } | null>(
      null,
    ),
    [settledFor, setSettledFor] = useState<string | null>(null),
    [failure, setFailure] = useState<{ scope: string; message: string } | null>(null);
  const queue = useMemo(
    () =>
      createRefreshQueue(() => loadCampaignSessions(campaignId, w.demo, master), {
        onData(items) {
          setSnapshot((previous) =>
            previous?.scope === scope &&
            previous.items.length === items.length &&
            items.every((row, i) =>
              Object.keys(row).every(
                (key) =>
                  row[key as keyof CampaignSession] ===
                  previous.items[i][key as keyof CampaignSession],
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
    [campaignId, w.demo, master, userId, scope],
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
      if (e.key === `cronica:sessions:v1:${campaignId}`) reload();
    };
    const local = (e: Event) => {
      if ((e as CustomEvent).detail === campaignId) reload();
    };
    const timer = setInterval(reload, 15000);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    window.addEventListener('storage', storage);
    window.addEventListener('cronica:sessions-change', local);
    const channel = w.demo
      ? null
      : getSupabase()
          .channel(`adventures-${campaignId}-${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'campaign_sessions',
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
      window.removeEventListener('cronica:sessions-change', local);
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [refresh, queue, campaignId, w.demo, userId]);
  return {
    items: snapshot?.scope === scope ? snapshot.items : [],
    loading: settledFor !== scope,
    error: failure?.scope === scope ? failure.message : null,
    refresh,
  };
}
