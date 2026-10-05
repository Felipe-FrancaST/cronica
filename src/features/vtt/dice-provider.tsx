'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { loadDiceHistory, rollBattleDice } from './dice-repository';
import { rollBreakdown, type DiceRoll, type RollOptions } from './dice';
const DiceAnimation = dynamic(() => import('./dice-animation').then((m) => m.DiceAnimation), {
  ssr: false,
});
interface DiceContextValue {
  history: DiceRoll[];
  ready: boolean;
  rolling: boolean;
  animated: boolean;
  setAnimated(v: boolean): void;
  show(roll: DiceRoll): void;
  roll(mapId: string, options: RollOptions, clientId: string): Promise<DiceRoll>;
}
const Context = createContext<DiceContextValue | null>(null);
export function DiceProvider({
  campaignId,
  children,
}: {
  campaignId: string;
  children: ReactNode;
}) {
  const w = useWorkspace();
  const [history, setHistory] = useState<DiceRoll[]>([]),
    [ready, setReady] = useState(true),
    [rolling, setRolling] = useState(false),
    [animated, setAnimatedState] = useState(true),
    [current, setCurrent] = useState<DiceRoll | null>(null),
    [toastHost, setToastHost] = useState<Element | null>(null);
  const active = useRef(true),
    busy = useRef(false),
    revision = useRef(0),
    currentCampaign = useRef(campaignId),
    seen = useRef(new Set<string>()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  currentCampaign.current = campaignId;
  useEffect(() => {
    const update = () => setToastHost(document.fullscreenElement ?? document.body);
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    try {
      setAnimatedState(localStorage.getItem('cronica:dice-animation') !== 'false');
    } catch {}
  }, []);
  function setAnimated(v: boolean) {
    setAnimatedState(v);
    try {
      localStorage.setItem('cronica:dice-animation', String(v));
    } catch {}
  }
  function show(roll: DiceRoll) {
    if (!active.current || roll.campaign_id !== currentCampaign.current) return;
    revision.current++;
    setHistory((prev) =>
      [roll, ...prev.filter((r) => r.id !== roll.id)]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 40),
    );
    if (seen.current.has(roll.id)) return;
    seen.current.add(roll.id);
    if (seen.current.size > 300) seen.current.delete(seen.current.values().next().value!);
    setCurrent(roll);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCurrent(null), 5200);
  }
  useEffect(() => {
    active.current = true;
    setHistory([]);
    setCurrent(null);
    seen.current.clear();
    if (w.demo || !w.user) return;
    let live = true;
    async function refresh() {
      const seq = ++revision.current;
      try {
        const rows = await loadDiceHistory(campaignId);
        if (live && seq === revision.current) {
          setReady(true);
          setHistory(rows);
          for (const r of rows) seen.current.add(r.id);
        }
      } catch (e) {
        if (live && seq === revision.current)
          setReady(!['PGRST205', '42P01'].includes((e as { code: string }).code));
      }
    }
    void refresh();
    const channel = getSupabase()
      .channel(`dice-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'battle_dice_rolls',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const row = payload.new as DiceRoll;
          if (live && row.id && row.map_id && Array.isArray(row.terms)) {
            show(row);
          }
        },
      )
      .subscribe();
    const focus = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const poll = setInterval(focus, 30000);
    window.addEventListener('focus', focus);
    return () => {
      live = false;
      active.current = false;
      revision.current++;
      clearInterval(poll);
      window.removeEventListener('focus', focus);
      if (timer.current) clearTimeout(timer.current);
      void getSupabase().removeChannel(channel);
    };
  }, [campaignId, w.demo, w.user?.id]);
  async function roll(mapId: string, options: RollOptions, clientId: string) {
    if (busy.current) throw new Error('Aguarde a rolagem em andamento.');
    busy.current = true;
    setRolling(true);
    try {
      const result = await rollBattleDice(mapId, options, clientId);
      show(result);
      setReady(true);
      return result;
    } finally {
      busy.current = false;
      if (active.current) setRolling(false);
    }
  }
  const value = useMemo(
    () => ({ history, ready, rolling, animated, setAnimated, roll, show }),
    [history, ready, rolling, animated],
  );
  const name = current
    ? (w.data.profiles.find((p) => p.id === current.rolled_by)?.name ??
      (current.rolled_by === w.user?.id ? w.user.name : 'Participante'))
    : '';
  return (
    <Context.Provider value={value}>
      {children}
      {current &&
        toastHost &&
        createPortal(
          <div className="dice-toast" role="status" aria-label="Resultado da rolagem">
            <div className="dice-toast-heading">
              <span>
                {name}
                {current.visibility === 'gm'
                  ? ' · mestre'
                  : current.visibility === 'self'
                    ? ' · privada'
                    : ''}
              </span>
              <button
                type="button"
                aria-label="Fechar resultado dos dados"
                onClick={() => setCurrent(null)}
              >
                <X size={16} />
              </button>
            </div>
            <DiceAnimation roll={current} animated={animated} />
            <div className="dice-total">
              <div>
                <strong>{current.label || 'Rolagem de dados'}</strong>
                <small>
                  {current.expression}
                  {current.mode === 'advantage'
                    ? ' · vantagem'
                    : current.mode === 'disadvantage'
                      ? ' · desvantagem'
                      : ''}
                </small>
              </div>
              <b>{current.total}</b>
            </div>
            <small className="dice-breakdown">{rollBreakdown(current)}</small>
          </div>,
          toastHost,
        )}
    </Context.Provider>
  );
}
export function useDice() {
  const value = useContext(Context);
  if (!value) throw new Error('DiceProvider ausente.');
  return value;
}
