'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
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
  const [items, setItems] = useState<MuralItem[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    mounted = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await loadMural(campaignId, demo, master, adventureSessionId);
      if (mounted.current && request === generation.current) {
        setItems(next);
        setError(null);
      }
    } catch (e) {
      if (mounted.current && request === generation.current) setError(errorMessage(e));
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }, [campaignId, demo, master, userId, adventureSessionId]);
  useEffect(() => {
    mounted.current = true;
    setItems([]);
    setLoading(true);
    void refresh();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      if (document.visibilityState === 'visible') {
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
      mounted.current = false;
      generation.current++;
      clearTimeout(timeout);
      clearInterval(timer);
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
      window.removeEventListener('storage', storage);
      window.removeEventListener('cronica:mural-change', local);
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [campaignId, demo, userId, refresh]);
  return { items, loading, error, refresh };
}
