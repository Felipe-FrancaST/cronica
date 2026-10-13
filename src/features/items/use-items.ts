'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/utils';
import { loadCampaignItems, type ItemCollection } from './repository';
export function useCampaignItems(cid: string, demo: boolean) {
  const [data, setData] = useState<ItemCollection>({ items: [], deliveries: [] });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await loadCampaignItems(cid, demo);
      if (current === sequence.current) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (current === sequence.current) setError(errorMessage(e));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [cid, demo]);
  useEffect(() => {
    setData({ items: [], deliveries: [] });
    setLoading(true);
    void refresh();
    const update = () => void refresh();
    window.addEventListener('cronica:items-change', update);
    window.addEventListener('focus', update);
    const channel = demo
      ? null
      : getSupabase()
          .channel('campaign-items:' + cid)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'campaign_items',
              filter: `campaign_id=eq.${cid}`,
            },
            update,
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'campaign_item_deliveries',
              filter: `campaign_id=eq.${cid}`,
            },
            update,
          )
          .subscribe();
    return () => {
      sequence.current++;
      window.removeEventListener('cronica:items-change', update);
      window.removeEventListener('focus', update);
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [cid, demo, refresh]);
  return { ...data, loading, error, refresh };
}
