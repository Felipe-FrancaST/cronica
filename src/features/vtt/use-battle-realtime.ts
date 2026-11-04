'use client';
import { getSupabase } from '@/lib/supabase/client';
import { useEffect, type RefObject } from 'react';
import { loadCombatUpdate, mergeCombatUpdate } from './repository';
import type { ScenerySync } from './scenery-sync';
import { shareBattleSnapshot } from './snapshot';
import type { BattleMap, BattleMapObject, BattleSnapshot } from './types';
interface RealtimeOptions {
  enabled: boolean;
  campaignId: string;
  refresh(): Promise<void>;
  actionRef: RefObject<boolean>;
  combatMapRef: RefObject<string | null>;
  snapshotRef: RefObject<BattleSnapshot>;
  combatEpoch: RefObject<number>;
  scenerySync: ScenerySync;
  playerContext: RefObject<{ master: boolean }>;
  terrainDirty: RefObject<boolean>;
  terrainRevision: RefObject<number>;
  receiveScenery(id: string, row: BattleMapObject | null): void;
  publishSnapshot(snapshot: BattleSnapshot): void;
}
export function useBattleRealtime({
  enabled,
  campaignId,
  refresh,
  actionRef,
  combatMapRef,
  snapshotRef,
  combatEpoch,
  scenerySync,
  receiveScenery,
  publishSnapshot,
  playerContext,
  terrainDirty,
  terrainRevision,
}: RealtimeOptions) {
  useEffect(() => {
    if (!enabled) return;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(pending);
      pending = setTimeout(() => void refresh(), 150);
    };
    let combatPending: ReturnType<typeof setTimeout> | undefined;
    let combatLive = true;
    let combatRevision = 0;
    const scheduleCombat = () => {
      const revision = ++combatRevision;
      clearTimeout(combatPending);
      combatPending = setTimeout(async () => {
        if (actionRef.current) {
          scheduleCombat();
          return;
        }
        const epoch = combatEpoch.current;
        const ids = snapshotRef.current.maps
          .filter((m) => m.id === combatMapRef.current)
          .map((m) => m.id);
        try {
          const updates = await Promise.all(ids.map(loadCombatUpdate));
          if (!combatLive || revision !== combatRevision || epoch !== combatEpoch.current) return;
          publishSnapshot(updates.reduce(mergeCombatUpdate, snapshotRef.current));
        } catch {
          if (combatLive) scheduleRefresh();
        }
      }, 60);
    };
    const onFocus = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    const channel = getSupabase().channel(`vtt-${campaignId}`);
    [
      'battle_sessions',
      'battle_map_tokens',
      'battle_action_requests',
      'battle_spell_effects',
      'battle_movement_plans',
      'battle_decisions',
    ].forEach((table) =>
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `campaign_id=eq.${campaignId}` },
        scheduleCombat,
      ),
    );
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'battle_maps',
        filter: `campaign_id=eq.${campaignId}`,
      },
      (payload) => {
        const row = payload.new as BattleMap;
        const current = snapshotRef.current;
        const previous = current.maps.find((m) => m.id === row.id);
        if (
          playerContext.current.master &&
          payload.eventType === 'UPDATE' &&
          previous &&
          typeof row.updated_at === 'string'
        ) {
          publishSnapshot(
            shareBattleSnapshot(current, {
              ...current,
              maps: current.maps.map((m) => (m.id === row.id ? row : m)),
            }),
          );
          if (
            row.width === previous.width &&
            row.height === previous.height &&
            row.battle_session_id === previous.battle_session_id
          )
            return;
        }
        // Players revalidate visibility through RLS even when a hidden update emits no object row.
        terrainDirty.current = true;
        terrainRevision.current++;
        scheduleRefresh();
      },
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'battle_map_objects' },
      (payload) => {
        const row = payload.new as BattleMapObject;
        const id = payload.eventType === 'DELETE' ? String(payload.old.id ?? '') : row.id;
        if (playerContext.current.master) {
          if (payload.eventType === 'DELETE') {
            if (snapshotRef.current.objects.some((o) => o.id === id) || scenerySync.isPending(id))
              receiveScenery(id, null);
            return;
          }
          if (
            typeof row.id === 'string' &&
            typeof row.updated_at === 'string' &&
            row.geometry &&
            row.metadata &&
            snapshotRef.current.maps.some((m) => m.id === row.map_id)
          ) {
            receiveScenery(id, row);
            return;
          }
        }
        const mapId = row.map_id ?? (payload.old as Partial<BattleMapObject>).map_id;
        if (mapId && !snapshotRef.current.maps.some((m) => m.id === mapId)) return;
        terrainDirty.current = true;
        terrainRevision.current++;
        scheduleRefresh();
      },
    );
    ['battle_map_cells', 'battle_map_fog'].forEach((table) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        const record = (
          payload.new && Object.keys(payload.new).length ? payload.new : payload.old
        ) as { map_id?: string };
        if (record.map_id && !snapshotRef.current.maps.some((m) => m.id === record.map_id)) return;
        terrainDirty.current = true;
        terrainRevision.current++;
        scheduleRefresh();
      }),
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'battle_turn_order' },
      scheduleRefresh,
    );
    channel.subscribe();
    const timer = setInterval(onFocus, 30000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      combatLive = false;
      clearTimeout(combatPending);
      clearTimeout(pending);
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      void getSupabase().removeChannel(channel);
    };
  }, [campaignId, refresh, !enabled, scenerySync, receiveScenery, publishSnapshot]);
}
