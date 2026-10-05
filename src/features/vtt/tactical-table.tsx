'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Box,
  Crosshair,
  Hand,
  Layers,
  MousePointer2,
  Orbit,
  RotateCw,
  Scan,
  Eye,
  EyeOff,
  Flag,
  Grid3X3,
  ImagePlus,
  LoaderCircle,
  Map as MapIcon,
  Maximize2,
  Mountain,
  Plus,
  RotateCcw,
  Shield,
  Swords,
  Trash2,
  UserPlus,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Campaign } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { getSupabase } from '@/lib/supabase/client';
import { getSystem } from '@/systems/registry';
import { errorMessage } from '@/lib/utils';
import { PageHeading } from '@/components/shell';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Input,
  Modal,
  Select,
  Confirm,
} from '@/components/ui';
import { resolveImage } from '@/services/storage';
import { validateMapImage } from './map-image';
import {
  addCharacterToken,
  addNpcToken,
  advanceBattleTurn,
  clearBattleCell,
  createBattleMap,
  deleteBattleMap,
  endBattleCombat,
  loadBattleSnapshot,
  moveBattleToken,
  removeBattleToken,
  updateBattleToken,
  startBattleCombat,
  updateBattleMap,
  updateBattleSession,
  uploadBattleMapBackground,
  upsertBattleCell,
} from './repository';
import { convertDistance } from './movement';
import {
  PlayerActionPanel,
  MasterActionQueue,
  ActionHistory,
  actionEffectPreview,
  changeActionTarget,
  type ActionDraft,
} from './action-panel';
import { factionColor, type EffectPreview } from './effects';
import { shareBattleSnapshot } from './snapshot';
import { DiceProvider, useDice } from './dice-provider';
import { DicePanel } from './dice-panel';
import { SceneryEditor } from './scenery-editor';
import {
  DEFAULT_BRUSH,
  sceneryRect,
  sceneryAtCell,
  makeScenery,
  sceneryMovementCells,
  type SceneryBrush,
  type SceneryKind,
} from './scenery';
import { saveScenery, deleteScenery } from './repository';
import {
  requestBattleAction,
  resolveBattleAction,
  approveBattleAction,
  rollApprovedBattleAction,
  cancelBattleAction,
  pulseBattleSpell,
  endBattleSpell,
  cancelBattleMovement,
} from './repository';
import dynamic from 'next/dynamic';
import { TacticalCanvas } from './tactical-canvas';
import type { CameraCommand, NavigationMode, SceneQuality, TerrainTool } from './viewport-types';
import type { BattleMap, BattleSnapshot, BattleToken, GridPoint, GridUnit } from './types';

const EMPTY: BattleSnapshot = {
  sessions: [],
  maps: [],
  cells: [],
  objects: [],
  tokens: [],
  turnOrder: [],
};
const TacticalScene = dynamic(() => import('./tactical-scene').then((m) => m.TacticalScene), {
  ssr: false,
  loading: () => (
    <div className="vtt-canvas-wrap vtt-loading">
      <LoaderCircle className="spin" size={24} /> Preparando a mesa 3D…
    </div>
  ),
});
const CharacterEditor = dynamic(
  () => import('@/systems/character-editor').then((m) => m.SystemCharacterEditor),
  { ssr: false },
);
const NpcEditor = dynamic(() => import('@/components/npcs').then((m) => m.NpcForm), { ssr: false });
function pointKey(point: GridPoint) {
  return `${point.x}:${point.y}`;
}
function firstFreeCell(
  map: BattleMap,
  tokens: BattleToken[],
  cells: BattleSnapshot['cells'],
): GridPoint {
  const occupied = new Set(tokens.filter((t) => t.map_id === map.id).map((t) => pointKey(t)));
  const blocked = new Set(
    cells.filter((cell) => cell.map_id === map.id && cell.blocked).map((cell) => pointKey(cell)),
  );
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1)
      if (!occupied.has(`${x}:${y}`) && !blocked.has(`${x}:${y}`)) return { x, y };
  throw new Error('Não há célula livre para adicionar outro token neste mapa.');
}

export function TacticalTable({ campaign }: { campaign: Campaign }) {
  return (
    <DiceProvider campaignId={campaign.id}>
      <BattleLayout campaign={campaign} />
    </DiceProvider>
  );
}
function BattleLayout({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace();
  const dice = useDice();
  const master = campaign.owner_id === w.user?.id;
  const [snapshot, setSnapshot] = useState<BattleSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [initiativeOpen, setInitiativeOpen] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [terrainTool, setTerrainTool] = useState<TerrainTool>('move');
  const [sceneryBrush, setSceneryBrush] = useState<SceneryBrush>(DEFAULT_BRUSH);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [customTerrainType, setCustomTerrainType] = useState('water');
  const [customTerrainCost, setCustomTerrainCost] = useState(2);
  const [customTerrainBlocked, setCustomTerrainBlocked] = useState(false);
  const [forceMove, setForceMove] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [tokenUrls, setTokenUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [navigation, setNavigation] = useState<NavigationMode>('play');
  const [quality, setQuality] = useState<SceneQuality>('balanced');
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null);
  const [viewNotice, setViewNotice] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [masterPreview, setMasterPreview] = useState<EffectPreview | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [npcSheetId, setNpcSheetId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<'combat' | 'scene' | 'dice'>(master ? 'combat' : 'dice');
  const snapshotRef = useRef<BattleSnapshot>(EMPTY);
  const terrainDirty = useRef(true);
  const terrainRevision = useRef(0);
  const terrainLastLoaded = useRef(0);
  const boardRef = useRef<HTMLElement | null>(null);
  const requestRef = useRef(0);
  const actionRef = useRef(false);
  const Viewport = view === '3d' ? TacticalScene : TacticalCanvas;

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cronica:vtt-view');
      if (stored === '2d') setView('2d');
      if (localStorage.getItem('cronica:vtt-quality') === 'low') setQuality('low');
    } catch {
      /* Preferences are optional when storage is unavailable. */
    }
    const changed = () => setFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  function chooseView(next: '3d' | '2d') {
    setView(next);
    setViewNotice(null);
    setNavigation('play');
    setCameraCommand(null);
    try {
      localStorage.setItem('cronica:vtt-view', next);
    } catch {}
  }
  function camera(action: CameraCommand['action']) {
    setCameraCommand((current) => ({ sequence: (current?.sequence ?? 0) + 1, action }));
  }
  function selectToken(id: string | null) {
    setSelectedTokenId(id);
    setDraft(null);
    setMasterPreview(null);
    setNavigation('play');
  }
  function chooseTerrain(tool: TerrainTool) {
    setTerrainTool(tool);
    setNavigation('play');
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (boardRef.current?.requestFullscreen) await boardRef.current.requestFullscreen();
    } catch {
      setViewNotice('O navegador não permitiu expandir a mesa.');
    }
  }

  const map = snapshot.maps.find((item) => item.id === activeMapId) ?? snapshot.maps[0] ?? null;
  const session = map
    ? (snapshot.sessions.find((item) => item.id === map.battle_session_id) ?? null)
    : null;
  const cells = useMemo(
    () => (map ? snapshot.cells.filter((cell) => cell.map_id === map.id) : []),
    [snapshot.cells, map],
  );
  const tokens = useMemo(
    () => (map ? snapshot.tokens.filter((token) => token.map_id === map.id) : []),
    [snapshot.tokens, map],
  );
  const objects = useMemo(
    () => snapshot.objects.filter((o) => o.map_id === map?.id),
    [snapshot.objects, map?.id],
  );
  function selectObject(id: string | null) {
    setSelectedObjectId(id);
    const object = objects.find((o) => o.id === id),
      rect = object ? sceneryRect(object) : null;
    if (object && rect)
      setSceneryBrush({
        kind: object.object_type as SceneryKind,
        width: rect.width,
        height: rect.height,
        rotation: rect.rotation,
        blocks: object.blocks_movement,
        cost: Number(object.metadata.movement_cost) || 1,
      });
  }
  const selected = tokens.find((token) => token.id === selectedTokenId) ?? null;
  const activeToken = tokens.find((token) => token.id === session?.active_token_id) ?? null;
  const requests = (snapshot.actions ?? []).filter((r) => r.map_id === map?.id);
  const spellEffects = (snapshot.spellEffects ?? []).filter(
    (e) => e.map_id === map?.id && e.active,
  );
  const owns = (token: BattleToken) =>
    master ||
    token.controlled_by === w.user?.id ||
    w.data.characters.some((c) => c.id === token.character_id && c.owner_id === w.user?.id);
  const actor =
    selected && owns(selected)
      ? selected
      : !master
        ? (tokens.find((t) => t.id === session?.active_token_id && owns(t)) ??
          tokens.find(owns) ??
          null)
        : null;
  const actorCharacter = w.data.characters.find((c) => c.id === actor?.character_id) ?? null;
  const actorNpc = w.data.npcs.find((n) => n.id === actor?.npc_id) ?? null;
  const openedCharacter = w.data.characters.find((c) => c.id === sheetId) ?? null;
  const openedNpc = master ? w.data.npcs.find((n) => n.id === npcSheetId) : null;
  const ownerKey = w.data.characters.map((c) => c.id + ':' + c.owner_id).join('|');
  const characterOwners = useMemo(
    () => Object.fromEntries(w.data.characters.map((c) => [c.id, c.owner_id])),
    [ownerKey],
  );
  const spellPreview = map ? actionEffectPreview(map, actor, draft, tokens) : null;
  const pendingMovement =
    snapshot.movementPlans?.find((p) => p.token_id === actor?.id && p.status === 'pending') ?? null;
  const hasPending =
    !!pendingMovement ||
    requests.some(
      (r) =>
        (r.status === 'pending' || r.status === 'approved') &&
        (r.token_id === actor?.id || r.kind === 'opportunity'),
    );
  useEffect(() => {
    setDraft(null);
    setMasterPreview(null);
    setSelectedObjectId(null);
  }, [map?.id, actor?.id, session?.turn_started_at]);
  useEffect(() => {
    if (actor && !selectedTokenId) setSelectedTokenId(actor.id);
  }, [actor?.id, selectedTokenId]);
  const playerCanEndTurn = Boolean(
    !master &&
    activeToken &&
    (activeToken.controlled_by === w.user?.id ||
      (activeToken.character_id &&
        w.data.characters.some(
          (character) =>
            character.id === activeToken.character_id && character.owner_id === w.user?.id,
        ))),
  );
  const turnOrder = useMemo(
    () =>
      session
        ? snapshot.turnOrder
            .filter((row) => row.session_id === session.id)
            .sort((a, b) => a.position - b.position)
        : [],
    [snapshot.turnOrder, session],
  );

  const refresh = useCallback(async () => {
    if (w.demo) {
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    try {
      const revision = terrainRevision.current;
      const reloadTerrain = terrainDirty.current || Date.now() - terrainLastLoaded.current > 30000;
      const loaded = await loadBattleSnapshot(campaign.id, {
        previous: snapshotRef.current,
        reloadTerrain,
      });
      if (request !== requestRef.current) return;
      const next = shareBattleSnapshot(snapshotRef.current, loaded);
      snapshotRef.current = next;
      if (reloadTerrain) {
        terrainLastLoaded.current = Date.now();
        if (revision === terrainRevision.current) terrainDirty.current = false;
      }
      setSnapshot(next);
      setActiveMapId((current) =>
        current && next.maps.some((item) => item.id === current)
          ? current
          : (next.maps[0]?.id ?? null),
      );
      setError(null);
    } catch (e) {
      if (request === requestRef.current) setError(errorMessage(e));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [campaign.id, w.demo]);

  useEffect(() => {
    void refresh();
    return () => {
      requestRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (w.demo) return;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(pending);
      pending = setTimeout(() => void refresh(), 150);
    };
    const onFocus = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    const channel = getSupabase().channel(`vtt-${campaign.id}`);
    [
      'battle_sessions',
      'battle_maps',
      'battle_map_tokens',
      'battle_action_requests',
      'battle_spell_effects',
      'battle_movement_plans',
    ].forEach((table) =>
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `campaign_id=eq.${campaign.id}` },
        scheduleRefresh,
      ),
    );
    ['battle_map_cells', 'battle_map_objects'].forEach((table) =>
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
      clearTimeout(pending);
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      void getSupabase().removeChannel(channel);
    };
  }, [campaign.id, refresh, w.demo]);

  const tokenMediaKey = useMemo(
    () =>
      tokens
        .map((token) => `${token.id}:${token.image ?? ''}`)
        .sort()
        .join('|'),
    [tokens],
  );

  useEffect(() => {
    let live = true;
    async function resolveBackground() {
      if (!map) {
        if (live) setBackgroundUrl(null);
        return;
      }
      const next = map.background_image ? await resolveImage(map.background_image, false) : null;
      if (live) setBackgroundUrl(next);
    }
    setBackgroundUrl(null);
    if (!w.demo)
      void resolveBackground().catch(() => {
        if (live) setBackgroundUrl(null);
      });
    const timer = !w.demo
      ? window.setInterval(() => void resolveBackground().catch(() => {}), 12 * 60 * 1000)
      : null;
    return () => {
      live = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [map?.id, map?.background_image, w.demo]);

  useEffect(() => {
    let live = true;
    async function resolveTokenMedia() {
      const entries = await Promise.all(
        tokens.map(
          async (token) =>
            [token.id, token.image ? await resolveImage(token.image, false) : null] as const,
        ),
      );
      if (live)
        setTokenUrls(
          Object.fromEntries(
            entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
          ),
        );
    }
    if (!w.demo)
      void resolveTokenMedia().catch(() => {
        if (live) setTokenUrls({});
      });
    const timer = !w.demo
      ? window.setInterval(() => void resolveTokenMedia().catch(() => {}), 12 * 60 * 1000)
      : null;
    return () => {
      live = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [tokenMediaKey, w.demo]);

  async function action(fn: () => Promise<unknown>, rethrow = false) {
    if (actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
      if (rethrow) throw e;
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  if (w.demo)
    return (
      <>
        <PageHeading
          eyebrow={campaign.name}
          title="Mesa tática"
          description="Grid tático persistente da campanha."
        />
        <Empty
          title="A mesa tática precisa do Supabase."
          description="Este módulo não usa posições simuladas no modo demonstração. Conecte o projeto ao Supabase e aplique as migrations para usar dados reais."
        />
      </>
    );

  if (loading)
    return (
      <div className="vtt-loading">
        <LoaderCircle className="spin" size={24} /> Carregando a mesa tática…
      </div>
    );

  return (
    <div className="vtt-page">
      <PageHeading
        eyebrow={campaign.name}
        title="Mesa tática"
        description="Seu campo de batalha em 3D. Peças, terreno e turnos sincronizados em tempo real."
        action={
          master ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={17} /> Novo mapa
            </Button>
          ) : undefined
        }
      />
      <nav className="vtt-mobile-nav" aria-label="Acesso rápido à batalha">
        <button type="button" onClick={() => boardRef.current?.scrollIntoView({ block: 'start' })}>
          Mapa
        </button>
        <button
          type="button"
          onClick={() =>
            document.getElementById('vtt-participants')?.scrollIntoView({ block: 'start' })
          }
        >
          Ficha / ações
        </button>
        {master && (
          <button
            type="button"
            onClick={() => {
              setPanelTab('combat');
              document.getElementById('vtt-tools')?.scrollIntoView({ block: 'start' });
            }}
          >
            Mestre
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setPanelTab('dice');
            document.getElementById('vtt-tools')?.scrollIntoView({ block: 'start' });
          }}
        >
          Dados
        </button>
      </nav>
      <ErrorBox message={error} />
      {viewNotice && (
        <div className="vtt-view-notice" role="status">
          {viewNotice}
        </div>
      )}
      {!map ? (
        <Empty
          title="Nenhum mapa tático criado."
          description={
            master
              ? 'Crie o primeiro mapa para posicionar personagens e iniciar a mesa.'
              : 'O mestre ainda não abriu um mapa para esta campanha.'
          }
          action={
            master ? (
              <Button onClick={() => setCreateOpen(true)}>
                <MapIcon size={17} /> Criar mapa
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={`vtt-shell vtt-battle-layout ${master ? 'is-master' : 'is-player'}`}>
          <aside
            id="vtt-participants"
            className="vtt-sidebar vtt-initiative"
            aria-label="Iniciativa e ficha"
          >
            <div className="vtt-panel-title">
              <span>
                <Swords size={18} /> Iniciativa
              </span>
              <Badge tone={session?.status === 'active' ? 'green' : 'muted'}>
                {session?.status === 'active' ? `Rodada ${session.round}` : 'Preparação'}
              </Badge>
            </div>
            <div className="vtt-turn-list">
              {(turnOrder.length
                ? turnOrder
                : tokens.map((token, position) => ({
                    id: token.id,
                    session_id: session?.id ?? '',
                    token_id: token.id,
                    position,
                    initiative: 0,
                    created_at: '',
                  }))
              ).map((entry) => {
                const token = tokens.find((item) => item.id === entry.token_id);
                if (!token) return null;
                const active = session?.active_token_id === token.id;
                return (
                  <button
                    key={entry.id}
                    className={`vtt-turn-row ${active ? 'is-active' : ''}`}
                    onClick={() => selectToken(token.id)}
                  >
                    <span className="vtt-token-mini">
                      {tokenUrls[token.id] ? (
                        <img src={tokenUrls[token.id]} alt="" />
                      ) : (
                        token.name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="vtt-faction-dot" style={{ background: factionColor(token) }} />
                    <span>
                      <strong>{token.name}</strong>
                      <small>
                        {turnOrder.length ? `Iniciativa ${entry.initiative}` : 'Fora de combate'}
                      </small>
                    </span>
                    {active && <Crosshair size={16} />}
                  </button>
                );
              })}
            </div>
            {master && (
              <div className="vtt-stack">
                {session?.status === 'active' ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => action(() => advanceBattleTurn(session.id))}
                    >
                      <Flag size={16} /> Próximo turno
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => action(() => endBattleCombat(session.id))}
                    >
                      Encerrar combate
                    </Button>
                  </>
                ) : tokens.length ? (
                  <Button disabled={busy} onClick={() => setInitiativeOpen(true)}>
                    <Swords size={16} /> Iniciar combate
                  </Button>
                ) : null}
              </div>
            )}
            {actor && map && (
              <PlayerActionPanel
                token={actor}
                character={actorCharacter}
                npc={actorNpc}
                map={map}
                session={session}
                tokens={tokens}
                requests={requests}
                movementPlan={pendingMovement}
                draft={draft}
                preview={spellPreview}
                ready={snapshot.actionsReady !== false}
                busy={busy}
                npcEditable={master}
                onSheet={() =>
                  actor.npc_id ? setNpcSheetId(actor.npc_id) : setSheetId(actor.character_id)
                }
                onEndTurn={
                  playerCanEndTurn && session
                    ? () => action(() => advanceBattleTurn(session.id))
                    : undefined
                }
                onMove={() => {
                  selectToken(actor.id);
                  setTerrainTool('move');
                  camera('focus');
                }}
                onDraft={(next) => {
                  setDraft(next);
                  setMasterPreview(null);
                  setSelectedTokenId(actor.id);
                  setNavigation('play');
                  setTerrainTool('move');
                }}
                onRequest={(payload, clientId) =>
                  action(async () => {
                    await requestBattleAction(actor.id, payload, clientId);
                    setDraft(null);
                  }, true)
                }
                onRoll={(id, clientId) =>
                  action(async () => {
                    const result = await rollApprovedBattleAction(id, clientId);
                    if (result.resolution.dice_roll)
                      dice.show(result.resolution.dice_roll, { toast: false });
                    await w.refresh();
                  }, true)
                }
                onCancel={(id) => action(() => cancelBattleAction(id))}
                onCancelMove={(id) => action(() => cancelBattleMovement(id))}
              />
            )}
            <ActionHistory requests={requests} />
          </aside>

          <main ref={boardRef} className={`vtt-board-panel ${fullscreen ? 'is-fullscreen' : ''}`}>
            <div className="vtt-board-toolbar">
              <Select
                value={map.id}
                onChange={(e) => {
                  setActiveMapId(e.target.value);
                  setSelectedTokenId(null);
                  setDraft(null);
                  setMasterPreview(null);
                  setCameraCommand(null);
                }}
                aria-label="Mapa ativo"
              >
                {snapshot.maps.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <div className="vtt-toolbar-group">
                <Button
                  variant="ghost"
                  className="vtt-icon-button"
                  onClick={() => camera('zoom-in')}
                  aria-label="Aproximar"
                >
                  <ZoomIn size={18} />
                </Button>
                <Button
                  variant="ghost"
                  className="vtt-icon-button"
                  onClick={() => camera('zoom-out')}
                  aria-label="Afastar"
                >
                  <ZoomOut size={18} />
                </Button>
                <Button
                  variant="ghost"
                  className="vtt-icon-button"
                  onClick={() => camera('center')}
                  aria-label="Centralizar mapa"
                >
                  <Crosshair size={18} />
                </Button>
                <Button
                  variant="ghost"
                  className="vtt-icon-button"
                  onClick={() => camera('fit')}
                  aria-label="Ajustar mapa"
                >
                  <Maximize2 size={18} />
                </Button>
              </div>
              <Button
                variant="ghost"
                className="vtt-icon-button vtt-expand-button"
                onClick={() => void toggleFullscreen()}
                aria-label={fullscreen ? 'Sair da tela cheia' : 'Expandir mesa'}
              >
                <Scan size={18} />
              </Button>
              {master && (
                <Button
                  variant="secondary"
                  className="vtt-settings-button"
                  onClick={() => setSettingsOpen(true)}
                >
                  Configurar mapa
                </Button>
              )}
            </div>
            <div className="vtt-scene-toolbar">
              <div className="vtt-view-toggle" role="group" aria-label="Visualização do mapa">
                <button type="button" aria-pressed={view === '3d'} onClick={() => chooseView('3d')}>
                  <Box size={15} /> 3D
                </button>
                <button type="button" aria-pressed={view === '2d'} onClick={() => chooseView('2d')}>
                  <Layers size={15} /> 2D
                </button>
              </div>
              {view === '3d' && (
                <>
                  <div className="vtt-view-toggle" role="group" aria-label="Controles da mesa">
                    <button
                      type="button"
                      aria-label="Jogar e mover peças"
                      aria-pressed={navigation === 'play'}
                      onClick={() => setNavigation('play')}
                    >
                      <MousePointer2 size={15} />
                      <span>Jogar</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Girar câmera"
                      aria-pressed={navigation === 'orbit'}
                      onClick={() => setNavigation('orbit')}
                    >
                      <Orbit size={15} />
                      <span>Girar</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Navegar pelo mapa"
                      aria-pressed={navigation === 'pan'}
                      onClick={() => setNavigation('pan')}
                    >
                      <Hand size={15} />
                      <span>Navegar</span>
                    </button>
                  </div>
                  <div className="vtt-camera-presets">
                    <button type="button" onClick={() => camera('isometric')}>
                      Isométrica
                    </button>
                    <button type="button" onClick={() => camera('top')}>
                      Superior
                    </button>
                    <button
                      type="button"
                      onClick={() => camera('rotate-left')}
                      aria-label="Girar câmera à esquerda"
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => camera('rotate-right')}
                      aria-label="Girar câmera à direita"
                    >
                      <RotateCw size={15} />
                    </button>
                  </div>
                  <Select
                    className="vtt-quality-select"
                    aria-label="Qualidade do 3D"
                    value={quality}
                    onChange={(e) => {
                      const value = e.target.value as SceneQuality;
                      setQuality(value);
                      try {
                        localStorage.setItem('cronica:vtt-quality', value);
                      } catch {}
                    }}
                  >
                    <option value="balanced">3D com sombras</option>
                    <option value="low">3D leve</option>
                  </Select>
                </>
              )}
              <button
                type="button"
                className="vtt-focus-button"
                disabled={!selected}
                onClick={() => camera('focus')}
                aria-label="Focar personagem selecionado"
              >
                <Crosshair size={15} /> Focar peça
              </button>
            </div>
            <Viewport
              key={map.id}
              map={map}
              cells={cells}
              objects={objects}
              sceneryBrush={terrainTool === 'scenery' ? sceneryBrush : null}
              tokens={tokens}
              sessionActiveTokenId={session?.active_token_id ?? null}
              restrictToTurn={session?.status === 'active' && session.restrict_movement_to_turn}
              movementLimited={session?.status === 'active'}
              userId={w.user?.id ?? ''}
              characterOwners={characterOwners}
              master={master}
              selectedTokenId={selectedTokenId}
              onSelectToken={setSelectedTokenId}
              cameraCommand={cameraCommand}
              navigationMode={navigation}
              quality={quality}
              onUnavailable={() => {
                setView('2d');
                setCameraCommand(null);
                setViewNotice('O 3D não está disponível neste aparelho. A mesa foi aberta em 2D.');
              }}
              terrainTool={terrainTool}
              forceMove={forceMove}
              backgroundUrl={backgroundUrl}
              tokenUrls={tokenUrls}
              disabled={busy || hasPending}
              targeting={!!draft}
              effectPreview={spellPreview ?? masterPreview}
              onTarget={(point, tokenId) => {
                if (draft) setDraft(changeActionTarget(draft, point, tokenId));
              }}
              onMove={(token, point, path, force) =>
                action(() => moveBattleToken(token, point, path, force))
              }
              onPaint={(point, tool) => {
                if (tool === 'inspect') {
                  selectObject(sceneryAtCell(objects, point)?.id ?? null);
                  setPanelTab('scene');
                  return Promise.resolve();
                }
                return action(() => paintCell(map.id, point, tool));
              }}
            />
            <div className="vtt-statusbar">
              <div>
                <strong>{selected?.name ?? 'Nenhum token selecionado'}</strong>
                {selected ? (
                  <span>
                    Posição {selected.x},{selected.y}
                  </span>
                ) : (
                  <span>
                    {view === '3d' && navigation !== 'play'
                      ? 'Use Jogar para selecionar e mover suas peças.'
                      : 'Selecione uma peça para movimentar.'}
                  </span>
                )}
              </div>
              {selected && (
                <div className="vtt-status-stats">
                  <TokenStats token={selected} />
                  <MovementHud token={selected} map={map} />
                </div>
              )}
            </div>
            {(spellPreview || masterPreview) && (
              <div className="vtt-area-caption" role="status">
                {spellPreview?.valid === false ? 'Fora do alcance · ' : ''}Área de efeito:{' '}
                {(spellPreview ?? masterPreview)?.cells.length} células{' '}
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setMasterPreview(null);
                  }}
                >
                  Fechar prévia
                </button>
              </div>
            )}
            <div className="vtt-faction-legend">
              <span>
                <i style={{ background: '#50be93' }} />
                Aliado
              </span>
              <span>
                <i style={{ background: '#e57070' }} />
                Inimigo
              </span>
              <span>
                <i style={{ background: '#deb060' }} />
                Neutro
              </span>
            </div>
          </main>

          <aside id="vtt-tools" className="vtt-sidebar vtt-tools" aria-label="Painel da batalha">
            <div className="vtt-panel-title">
              <span>
                <Shield size={18} /> {master ? 'Painel do mestre' : 'Ferramentas da mesa'}
              </span>
            </div>
            <div className="vtt-panel-tabs" role="tablist" aria-label="Painéis da batalha">
              {(master
                ? [
                    ['combat', 'Combate'],
                    ['scene', 'Cenário'],
                    ['dice', 'Dados'],
                  ]
                : [
                    ['dice', 'Dados'],
                    ['combat', 'Turno'],
                  ]
              ).map(([id, label]) => (
                <button
                  key={id}
                  id={`vtt-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={panelTab === id}
                  aria-controls={`vtt-panel-${id}`}
                  onClick={() => setPanelTab(id as typeof panelTab)}
                >
                  {label}
                  {id === 'combat' && requests.filter((r) => r.status === 'pending').length > 0 && (
                    <Badge tone="green">
                      {requests.filter((r) => r.status === 'pending').length}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
            <div
              id="vtt-panel-dice"
              className="vtt-panel-page"
              role="tabpanel"
              aria-labelledby="vtt-tab-dice"
              hidden={panelTab !== 'dice'}
            >
              <DicePanel mapId={map.id} master={master} />
            </div>
            {master ? (
              <>
                <div
                  id="vtt-panel-combat"
                  className="vtt-panel-page"
                  role="tabpanel"
                  aria-labelledby="vtt-tab-combat"
                  hidden={panelTab !== 'combat'}
                >
                  {session?.status !== 'active' && (
                    <Button variant="secondary" onClick={() => setPanelTab('scene')}>
                      Preparar cenário e participantes
                    </Button>
                  )}
                  <MasterActionQueue
                    requests={requests}
                    effects={spellEffects}
                    tokens={tokens}
                    map={map}
                    busy={busy || dice.rolling}
                    onResolve={(id, success, opts) =>
                      action(async () => {
                        const request = requests.find((r) => r.id === id);
                        const result = await (
                          request?.kind === 'opportunity'
                            ? resolveBattleAction
                            : approveBattleAction
                        )(id, success, opts);
                        if (result.resolution.dice_roll) dice.show(result.resolution.dice_roll);
                        setMasterPreview(null);
                        await w.refresh();
                      })
                    }
                    onCancel={(id) => action(() => cancelBattleAction(id))}
                    onPreview={(preview) => {
                      setMasterPreview(preview);
                      setDraft(null);
                    }}
                    onPulse={(effect, opts) =>
                      action(async () => {
                        const result = await pulseBattleSpell(effect, opts);
                        if (result.dice_roll) dice.show(result.dice_roll);
                        await w.refresh();
                      })
                    }
                    onEndEffect={(id) =>
                      action(async () => {
                        await endBattleSpell(id);
                        setMasterPreview(null);
                      })
                    }
                  />
                </div>
                <div
                  id="vtt-panel-scene"
                  className="vtt-panel-page"
                  role="tabpanel"
                  aria-labelledby="vtt-tab-scene"
                  hidden={panelTab !== 'scene'}
                >
                  <SceneryEditor
                    objects={objects}
                    brush={sceneryBrush}
                    onBrush={setSceneryBrush}
                    tool={terrainTool}
                    onTool={chooseTerrain}
                    selectedId={selectedObjectId}
                    onSelect={selectObject}
                    busy={busy}
                    onSave={(object) =>
                      action(async () => {
                        terrainDirty.current = true;
                        terrainRevision.current++;
                        await saveScenery(object, object.id);
                      })
                    }
                    onDelete={(id) =>
                      action(async () => {
                        terrainDirty.current = true;
                        terrainRevision.current++;
                        await deleteScenery(id);
                        selectObject(null);
                      })
                    }
                  />
                  <div className="vtt-tool-section">
                    <strong>Terreno</strong>
                    <div className="vtt-tool-grid">
                      <ToolButton
                        active={terrainTool === 'move'}
                        onClick={() => chooseTerrain('move')}
                        icon={<Crosshair size={16} />}
                        label="Mover"
                      />
                      <ToolButton
                        active={terrainTool === 'normal'}
                        onClick={() => chooseTerrain('normal')}
                        icon={<RotateCcw size={16} />}
                        label="Normal"
                      />
                      <ToolButton
                        active={terrainTool === 'difficult'}
                        onClick={() => chooseTerrain('difficult')}
                        icon={<Mountain size={16} />}
                        label="Difícil"
                      />
                      <ToolButton
                        active={terrainTool === 'blocked'}
                        onClick={() => chooseTerrain('blocked')}
                        icon={<Grid3X3 size={16} />}
                        label="Bloquear"
                      />
                      <ToolButton
                        active={terrainTool === 'custom'}
                        onClick={() => chooseTerrain('custom')}
                        icon={<MapIcon size={16} />}
                        label="Personalizado"
                      />
                    </div>
                    {terrainTool === 'custom' && (
                      <div className="vtt-custom-terrain">
                        <Input
                          value={customTerrainType}
                          onChange={(e) => setCustomTerrainType(e.target.value)}
                          placeholder="Tipo: água, gelo, lama…"
                        />
                        <Input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={customTerrainCost}
                          onChange={(e) => setCustomTerrainCost(Number(e.target.value))}
                          aria-label="Custo de movimento do terreno"
                        />
                        <label className="vtt-check">
                          <input
                            type="checkbox"
                            checked={customTerrainBlocked}
                            onChange={(e) => setCustomTerrainBlocked(e.target.checked)}
                          />{' '}
                          Bloqueado
                        </label>
                      </div>
                    )}
                    <small>Selecione uma ferramenta e toque/clique nas células do mapa.</small>
                  </div>
                  {session && (
                    <div className="vtt-tool-section">
                      <strong>Regras do turno</strong>
                      <label className="vtt-check">
                        <input
                          type="checkbox"
                          checked={session.failed_actions_consume !== false}
                          disabled={busy}
                          onChange={(e) =>
                            void action(() =>
                              updateBattleSession(session.id, {
                                failed_actions_consume: e.target.checked,
                              }),
                            )
                          }
                        />
                        Falha consome a ação e o espaço utilizado
                      </label>
                      <label className="vtt-check">
                        <input
                          type="checkbox"
                          checked={session.restrict_movement_to_turn}
                          disabled={busy}
                          onChange={(e) =>
                            void action(() =>
                              updateBattleSession(session.id, {
                                restrict_movement_to_turn: e.target.checked,
                              }),
                            )
                          }
                        />
                        Somente o token ativo pode mover durante o combate
                      </label>
                    </div>
                  )}
                  <TokenManager
                    campaign={campaign}
                    map={map}
                    cells={sceneryMovementCells(cells, objects)}
                    tokens={tokens}
                    busy={busy}
                    onAction={action}
                  />
                  <div className="vtt-tool-section">
                    <label className="vtt-check">
                      <input
                        type="checkbox"
                        checked={forceMove}
                        onChange={(e) => setForceMove(e.target.checked)}
                      />{' '}
                      Forçar movimento acima do limite
                    </label>
                    <small>Ainda respeita células bloqueadas e colisões.</small>
                  </div>
                </div>
              </>
            ) : (
              <div
                id="vtt-panel-combat"
                className="vtt-panel-page"
                role="tabpanel"
                aria-labelledby="vtt-tab-combat"
                hidden={panelTab !== 'combat'}
              >
                {selected ? (
                  <div className="vtt-tool-section">
                    <MovementHud token={selected} map={map} detailed />
                    <small>
                      {session?.active_token_id === selected.id || session?.status !== 'active'
                        ? 'Toque em uma célula válida ou arraste o token.'
                        : 'Aguarde o turno indicado na iniciativa.'}
                    </small>
                  </div>
                ) : (
                  <p className="vtt-muted">Selecione o seu personagem no mapa.</p>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      <CreateMapModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        busy={busy}
        onCreate={(payload) =>
          action(async () => {
            const created = await createBattleMap(campaign.id, payload);
            setActiveMapId(created.id);
            setCreateOpen(false);
          })
        }
      />
      {openedCharacter && (
        <Modal open onClose={() => setSheetId(null)} title={`Ficha · ${openedCharacter.name}`} wide>
          <CharacterEditor
            slug={
              w.data.systems.find((s) => s.id === openedCharacter.rpg_system_id)?.slug ?? 'dnd5e'
            }
            character={openedCharacter}
            onSaved={() => {
              setSheetId(null);
              void w.refresh();
            }}
            onCancel={() => setSheetId(null)}
            readOnly={!master && openedCharacter.owner_id !== w.user?.id}
          />
        </Modal>
      )}
      {openedNpc && master && (
        <Modal
          open
          onClose={() => setNpcSheetId(null)}
          title={`Ficha do NPC · ${openedNpc.name}`}
          description="Edite o NPC sem sair da batalha."
          wide
        >
          <NpcEditor
            key={openedNpc.id}
            npc={openedNpc}
            readOnly={false}
            campaignLocked
            initialTab="stats"
            onSaved={() => {
              setNpcSheetId(null);
              void refresh();
            }}
            onCancel={() => setNpcSheetId(null)}
          />
        </Modal>
      )}
      {map && (
        <MapSettingsModal
          map={map}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          busy={busy}
          error={error}
          backgroundUrl={backgroundUrl}
          onSave={(patch, file) =>
            action(async () => {
              let background = patch.background_image;
              if (file) background = await uploadBattleMapBackground(map.id, file);
              await updateBattleMap(map.id, { ...patch, background_image: background });
              setSettingsOpen(false);
            })
          }
          onDelete={() =>
            action(async () => {
              await deleteBattleMap(map.id);
              setSettingsOpen(false);
              setSelectedTokenId(null);
            })
          }
        />
      )}
      {session && (
        <InitiativeModal
          open={initiativeOpen}
          onClose={() => setInitiativeOpen(false)}
          tokens={tokens}
          busy={busy}
          onStart={(order) =>
            action(async () => {
              await startBattleCombat(session.id, order);
              setInitiativeOpen(false);
            })
          }
        />
      )}
    </div>
  );

  async function paintCell(mapId: string, point: GridPoint, tool: TerrainTool) {
    terrainDirty.current = true;
    terrainRevision.current++;
    if (tool === 'scenery') {
      await saveScenery(makeScenery(mapId, point, sceneryBrush));
    } else if (tool === 'normal') await clearBattleCell(mapId, point);
    else if (tool === 'difficult') await upsertBattleCell(mapId, point, 'difficult', 2, false);
    else if (tool === 'blocked') await upsertBattleCell(mapId, point, 'blocked', 1, true);
    else if (tool === 'custom') {
      const terrainType = customTerrainType.trim();
      if (!terrainType) throw new Error('Dê um nome ao terreno personalizado.');
      if (!Number.isFinite(customTerrainCost) || customTerrainCost <= 0)
        throw new Error('O custo do terreno deve ser maior que zero.');
      await upsertBattleCell(mapId, point, terrainType, customTerrainCost, customTerrainBlocked);
    }
  }
}

function TokenStats({ token }: { token: BattleToken }) {
  const w = useWorkspace();
  if (token.character_id) {
    const character = w.data.characters.find((c) => c.id === token.character_id);
    if (!character) return null;
    const system = w.data.systems.find((s) => s.id === character.rpg_system_id);
    if (!system) return null;
    const module = getSystem(system.slug);
    const derived = module.calculate(character.sheet);
    const summary = module.describeSheet(character.sheet);
    return (
      <div className="vtt-token-stats">
        <span>
          {summary.ancestry} · {summary.profession}
        </span>
        <span>
          CA <strong>{derived.armorClass}</strong>
        </span>
        <span>
          PV{' '}
          <strong>
            {character.sheet.hp_current}/{derived.hpMax}
          </strong>
        </span>
        <span>
          TAM <strong>{token.size}</strong>
        </span>
      </div>
    );
  }
  if (token.npc_id) {
    const npc = w.data.npcs.find((n) => n.id === token.npc_id);
    if (!npc) return null;
    return (
      <div className="vtt-token-stats">
        <span>
          CA <strong>{npc.ac}</strong>
        </span>
        <span>
          PV{' '}
          <strong>
            {npc.hp_current}/{npc.hp_max}
          </strong>
        </span>
      </div>
    );
  }
  return null;
}

function InitiativeModal({
  open,
  onClose,
  tokens,
  busy,
  onStart,
}: {
  open: boolean;
  onClose(): void;
  tokens: BattleToken[];
  busy: boolean;
  onStart(order: Array<{ token_id: string; initiative: number }>): Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, number>>({});
  useEffect(() => {
    if (open) setValues(Object.fromEntries(tokens.map((token) => [token.id, 0])));
  }, [open, tokens]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const order = tokens
      .map((token) => ({
        token_id: token.id,
        initiative: Number(values[token.id] ?? 0),
        name: token.name,
      }))
      .sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name))
      .map(({ token_id, initiative }) => ({ token_id, initiative }));
    await onStart(order);
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Definir iniciativa"
      description="Informe o resultado de iniciativa de cada participante. A mesa ordenará do maior para o menor."
    >
      <form onSubmit={submit} className="form-stack">
        <div className="vtt-initiative-form">
          {tokens.map((token) => (
            <Field key={token.id} label={token.name}>
              <Input
                type="number"
                step="1"
                value={values[token.id] ?? 0}
                onChange={(e) =>
                  setValues((current) => ({ ...current, [token.id]: Number(e.target.value) }))
                }
              />
            </Field>
          ))}
        </div>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || tokens.length === 0}>
            <Swords size={16} /> Começar combate
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MovementHud({
  token,
  map,
  detailed = false,
}: {
  token: BattleToken;
  map: BattleMap;
  detailed?: boolean;
}) {
  const maxInMapUnit = convertDistance(
    token.movement_speed + (token.movement_bonus ?? 0),
    token.movement_unit,
    map.scale_unit,
  );
  const remainingInMapUnit = convertDistance(
    token.movement_remaining,
    token.movement_unit,
    map.scale_unit,
  );
  const maxCells = maxInMapUnit / map.scale_per_cell;
  const remainingCells = remainingInMapUnit / map.scale_per_cell;
  return (
    <div className={`vtt-movement-hud ${detailed ? 'is-detailed' : ''}`}>
      <span>MOVIMENTO</span>
      <strong>
        {remainingCells.toFixed(1)} / {maxCells.toFixed(1)} células
      </strong>
      <small>
        {token.movement_remaining.toFixed(1)} /{' '}
        {(token.movement_speed + (token.movement_bonus ?? 0)).toFixed(1)} {token.movement_unit}
      </small>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick(): void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`vtt-tool-button ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TokenManager({
  campaign,
  map,
  cells,
  tokens,
  busy,
  onAction,
}: {
  campaign: Campaign;
  map: BattleMap;
  cells: BattleSnapshot['cells'];
  tokens: BattleToken[];
  busy: boolean;
  onAction(fn: () => Promise<unknown>): Promise<void>;
}) {
  const w = useWorkspace();
  const [characterId, setCharacterId] = useState('');
  const [npcId, setNpcId] = useState('');
  const [npcSpeed, setNpcSpeed] = useState('9');
  const usedCharacters = new Set(tokens.map((t) => t.character_id).filter(Boolean));
  const usedNpcs = new Set(tokens.map((t) => t.npc_id).filter(Boolean));
  const characters = w.data.characters.filter(
    (c) => c.campaign_id === campaign.id && !usedCharacters.has(c.id),
  );
  const npcs = w.data.npcs.filter((n) => n.campaign_id === campaign.id && !usedNpcs.has(n.id));
  const addCharacter = async () => {
    if (!characterId) return;
    await onAction(() => addCharacterToken(map.id, characterId, firstFreeCell(map, tokens, cells)));
    setCharacterId('');
  };
  const addNpc = async () => {
    if (!npcId || !Number.isFinite(Number(npcSpeed)) || Number(npcSpeed) < 0) return;
    await onAction(() =>
      addNpcToken(map.id, npcId, Number(npcSpeed), 'm', firstFreeCell(map, tokens, cells)),
    );
    setNpcId('');
  };
  return (
    <div className="vtt-tool-section">
      <strong>
        <Users size={15} /> Tokens
      </strong>
      <Select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
        <option value="">Adicionar personagem…</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button variant="secondary" disabled={!characterId || busy} onClick={addCharacter}>
        <UserPlus size={15} /> Adicionar personagem
      </Button>
      <div className="vtt-inline-fields">
        <Select value={npcId} onChange={(e) => setNpcId(e.target.value)}>
          <option value="">Adicionar NPC…</option>
          {npcs.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          min="0"
          step="0.5"
          value={npcSpeed}
          onChange={(e) => setNpcSpeed(e.target.value)}
          aria-label="Deslocamento do NPC em metros"
        />
      </div>
      <Button variant="secondary" disabled={!npcId || busy} onClick={addNpc}>
        <Plus size={15} /> Adicionar NPC
      </Button>
      <div className="vtt-token-admin-list">
        {tokens.map((token) => (
          <div key={token.id} className="vtt-token-admin-row">
            <span>{token.name}</span>
            <Select
              aria-label={`Aliança de ${token.name}`}
              value={token.faction ?? (token.npc_id ? 'neutral' : 'ally')}
              disabled={busy}
              onChange={(e) =>
                void onAction(() =>
                  updateBattleToken(token.id, {
                    faction: e.target.value as BattleToken['faction'],
                  }),
                )
              }
            >
              <option value="ally">Aliado</option>
              <option value="enemy">Inimigo</option>
              <option value="neutral">Neutro</option>
            </Select>
            <Select
              aria-label={`Controle de ${token.name}`}
              value={token.controlled_by ?? ''}
              onChange={(e) =>
                void onAction(() =>
                  updateBattleToken(token.id, { controlled_by: e.target.value || null }),
                )
              }
              disabled={busy}
            >
              <option value="">Somente mestre</option>
              {w.data.members
                .filter((m) => m.campaign_id === campaign.id)
                .map((member) => {
                  const profile = w.data.profiles.find((p) => p.id === member.user_id);
                  return (
                    <option key={member.user_id} value={member.user_id}>
                      {profile?.name ?? 'Jogador'}
                    </option>
                  );
                })}
            </Select>
            <button
              type="button"
              onClick={() =>
                void onAction(() => updateBattleToken(token.id, { visible: !token.visible }))
              }
              disabled={busy}
              aria-label={token.visible ? `Ocultar ${token.name}` : `Mostrar ${token.name}`}
            >
              {token.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button
              type="button"
              onClick={() => void onAction(() => removeBattleToken(token.id))}
              disabled={busy}
              aria-label={`Remover ${token.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateMapModal({
  open,
  onClose,
  busy,
  onCreate,
}: {
  open: boolean;
  onClose(): void;
  busy: boolean;
  onCreate(payload: Record<string, unknown>): Promise<void>;
}) {
  const [name, setName] = useState('Campo de batalha');
  const [width, setWidth] = useState(30);
  const [height, setHeight] = useState(20);
  const [scale, setScale] = useState(1.5);
  async function submit(e: FormEvent) {
    e.preventDefault();
    await onCreate({
      name,
      session_name: name,
      width,
      height,
      cell_size: 64,
      scale_per_cell: scale,
      scale_unit: 'm',
      diagonal_rule: 'one',
      grid_visible: true,
      grid_opacity: 0.45,
    });
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Criar mapa tático"
      description="Defina o espaço lógico do mapa. A imagem de fundo pode ser adicionada depois."
    >
      <form onSubmit={submit} className="form-stack">
        <Field label="Nome">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="form-grid-three">
          <Field label="Largura (células)">
            <Input
              type="number"
              min="1"
              max="500"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </Field>
          <Field label="Altura (células)">
            <Input
              type="number"
              min="1"
              max="500"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </Field>
          <Field label="Escala por célula">
            <Input
              type="number"
              min="0.1"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={16} />} Criar mesa
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MapSettingsModal({
  map,
  open,
  onClose,
  busy,
  error,
  backgroundUrl,
  onSave,
  onDelete,
}: {
  map: BattleMap;
  open: boolean;
  onClose(): void;
  busy: boolean;
  error: string | null;
  backgroundUrl: string | null;
  onSave(patch: Partial<BattleMap>, file: File | null): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const [name, setName] = useState(map.name);
  const [width, setWidth] = useState(map.width);
  const [height, setHeight] = useState(map.height);
  const [cellSize, setCellSize] = useState(map.cell_size);
  const [scale, setScale] = useState(map.scale_per_cell);
  const [unit, setUnit] = useState<GridUnit>(map.scale_unit);
  const [diagonal, setDiagonal] = useState(map.diagonal_rule);
  const [opacity, setOpacity] = useState(map.grid_opacity);
  const [gridVisible, setGridVisible] = useState(map.grid_visible);
  const [backgroundOffsetX, setBackgroundOffsetX] = useState(map.background_offset_x);
  const [backgroundOffsetY, setBackgroundOffsetY] = useState(map.background_offset_y);
  const [backgroundScale, setBackgroundScale] = useState(map.background_scale);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => {
    setName(map.name);
    setWidth(map.width);
    setHeight(map.height);
    setCellSize(map.cell_size);
    setScale(map.scale_per_cell);
    setUnit(map.scale_unit);
    setDiagonal(map.diagonal_rule);
    setOpacity(map.grid_opacity);
    setGridVisible(map.grid_visible);
    setBackgroundOffsetX(map.background_offset_x);
    setBackgroundOffsetY(map.background_offset_y);
    setBackgroundScale(map.background_scale);
    setFile(null);
    setFileError(null);
    setRemoveImage(false);
    setDeleteOpen(false);
    // Realtime creates new map objects. Only reopen/switching maps resets a draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id, open]);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    await onSave(
      {
        name,
        width,
        height,
        cell_size: cellSize,
        scale_per_cell: scale,
        scale_unit: unit,
        diagonal_rule: diagonal,
        grid_opacity: opacity,
        grid_visible: gridVisible,
        background_offset_x: backgroundOffsetX,
        background_offset_y: backgroundOffsetY,
        background_scale: backgroundScale,
        ...(removeImage ? { background_image: null } : {}),
      },
      file,
    );
  }
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Configurar mapa"
        description="A posição dos tokens continua em coordenadas lógicas mesmo quando o tamanho visual muda."
        wide
      >
        <form onSubmit={submit} className="form-stack">
          <ErrorBox message={fileError ?? error} />
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="form-grid-three">
            <Field label="Largura">
              <Input
                type="number"
                min="1"
                max="500"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </Field>
            <Field label="Altura">
              <Input
                type="number"
                min="1"
                max="500"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
              />
            </Field>
            <Field label="Tamanho visual da célula">
              <Input
                type="number"
                min="16"
                max="256"
                value={cellSize}
                onChange={(e) => setCellSize(Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="form-grid-three">
            <Field label="Distância por célula">
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
              />
            </Field>
            <Field label="Unidade">
              <Select value={unit} onChange={(e) => setUnit(e.target.value as GridUnit)}>
                <option value="m">metros</option>
                <option value="ft">pés</option>
              </Select>
            </Field>
            <Field label="Diagonal">
              <Select
                value={diagonal}
                onChange={(e) => setDiagonal(e.target.value as BattleMap['diagonal_rule'])}
              >
                <option value="one">1 por diagonal</option>
                <option value="five-ten-five">Alternada 1/2</option>
                <option value="sqrt2">Geométrica √2</option>
              </Select>
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Opacidade do grid">
              <Input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
            </Field>
            <Field label="Grid">
              <label className="vtt-check">
                <input
                  type="checkbox"
                  checked={gridVisible}
                  onChange={(e) => setGridVisible(e.target.checked)}
                />{' '}
                Mostrar linhas do grid
              </label>
            </Field>
          </div>
          <div className="form-grid-three">
            <Field label="Mapa X (px)">
              <Input
                type="number"
                step="1"
                value={backgroundOffsetX}
                onChange={(e) => setBackgroundOffsetX(Number(e.target.value))}
              />
            </Field>
            <Field label="Mapa Y (px)">
              <Input
                type="number"
                step="1"
                value={backgroundOffsetY}
                onChange={(e) => setBackgroundOffsetY(Number(e.target.value))}
              />
            </Field>
            <Field label="Escala da imagem">
              <Input
                type="number"
                min="0.1"
                step="0.05"
                value={backgroundScale}
                onChange={(e) => setBackgroundScale(Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="form-stack">
            <label className="image-field">
              <ImagePlus size={20} />
              <span>
                {file ? file.name : map.background_image ? 'Trocar imagem' : 'Escolher imagem'}
              </span>
              <small>JPG, PNG ou WebP · até 25 MB · otimização automática</small>
              <input
                type="file"
                aria-label="Imagem do mapa"
                disabled={busy}
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const chosen = e.target.files?.[0] ?? null;
                  if (chosen) {
                    try {
                      validateMapImage(chosen);
                      setFile(chosen);
                      setRemoveImage(false);
                      setFileError(null);
                    } catch (error) {
                      e.target.value = '';
                      setFileError(errorMessage(error));
                    }
                  }
                }}
              />
            </label>
            {!removeImage && (preview || backgroundUrl) && (
              <img
                className="vtt-map-image-preview"
                src={preview ?? backgroundUrl!}
                alt="Prévia da imagem do mapa"
              />
            )}
            {(file || map.background_image) && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setRemoveImage(true);
                }}
              >
                Remover imagem
              </Button>
            )}
          </div>
          <div className="form-actions vtt-settings-actions">
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} /> Excluir mapa
            </Button>
            <span />
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Otimizando e salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>
      <Confirm
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        title="Excluir mapa"
        description="O mapa, os tokens, os terrenos e o histórico de movimento deste mapa serão excluídos."
        onConfirm={onDelete}
        busy={busy}
      />
    </>
  );
}
