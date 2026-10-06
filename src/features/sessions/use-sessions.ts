'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { getSupabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/utils';
import { loadCampaignSessions } from './repository';
import type { CampaignSession } from './types';
export function useCampaignSessions(campaignId: string, master: boolean) {
  const w = useWorkspace(),
    [items, setItems] = useState<CampaignSession[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    mounted = useRef(false);
  const refresh = useCallback(async () => {
    const n = ++generation.current;
    try {
      const rows = await loadCampaignSessions(campaignId, w.demo, master);
      if (mounted.current && n === generation.current) {
        setItems(rows);
        setError(null);
      }
    } catch (e) {
      if (mounted.current && n === generation.current) setError(errorMessage(e));
    } finally {
      if (mounted.current && n === generation.current) setLoading(false);
    }
  }, [campaignId, w.demo, master, w.user?.id]);
  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setItems([]);
    void refresh();
    const reload = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const local = (e: Event) => {
      if ((e as CustomEvent).detail === campaignId) reload();
    };
    const timer = setInterval(reload, 15000);
    window.addEventListener('focus', reload);
    window.addEventListener('storage', reload);
    window.addEventListener('cronica:sessions-change', local);
    const channel = w.demo
      ? null
      : getSupabase()
          .channel(`adventures-${campaignId}-${w.user?.id}`)
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
      mounted.current = false;
      generation.current++;
      clearInterval(timer);
      window.removeEventListener('focus', reload);
      window.removeEventListener('storage', reload);
      window.removeEventListener('cronica:sessions-change', local);
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [refresh, campaignId, w.demo, w.user?.id]);
  return { items, loading, error, refresh };
}
