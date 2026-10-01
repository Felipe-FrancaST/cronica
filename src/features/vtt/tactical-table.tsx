'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type ReactNode,
} from 'react';
import {
  Crosshair,
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
import { Badge, Button, Empty, ErrorBox, Field, Input, Modal, Select } from '@/components/ui';
import { resolveImage, validateImage } from '@/services/storage';
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
import { calculateMovementCost, convertDistance, pathDistanceInCells, reachableCells } from './movement';
import type {
  BattleMap,
  BattleSnapshot,
  BattleToken,
  GridPoint,
  GridUnit,
  MovementResult,
} from './types';

const EMPTY: BattleSnapshot = { sessions: [], maps: [], cells: [], objects: [], tokens: [], turnOrder: [] };
type TerrainTool = 'move' | 'normal' | 'difficult' | 'blocked' | 'custom';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function pointKey(point: GridPoint) {
  return `${point.x}:${point.y}`;
}
function firstFreeCell(map: BattleMap, tokens: BattleToken[], cells: BattleSnapshot['cells']): GridPoint {
  const occupied = new Set(tokens.filter((t) => t.map_id === map.id).map((t) => pointKey(t)));
  const blocked = new Set(cells.filter((cell) => cell.map_id === map.id && cell.blocked).map((cell) => pointKey(cell)));
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) if (!occupied.has(`${x}:${y}`) && !blocked.has(`${x}:${y}`)) return { x, y };
  throw new Error('Não há célula livre para adicionar outro token neste mapa.');
}

export function TacticalTable({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace();
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
  const [customTerrainType, setCustomTerrainType] = useState('water');
  const [customTerrainCost, setCustomTerrainCost] = useState(2);
  const [customTerrainBlocked, setCustomTerrainBlocked] = useState(false);
  const [forceMove, setForceMove] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [tokenUrls, setTokenUrls] = useState<Record<string, string>>({});

  const map = snapshot.maps.find((item) => item.id === activeMapId) ?? snapshot.maps[0] ?? null;
  const session = map
    ? snapshot.sessions.find((item) => item.id === map.battle_session_id) ?? null
    : null;
  const cells = useMemo(
    () => (map ? snapshot.cells.filter((cell) => cell.map_id === map.id) : []),
    [snapshot.cells, map],
  );
  const tokens = useMemo(
    () => (map ? snapshot.tokens.filter((token) => token.map_id === map.id) : []),
    [snapshot.tokens, map],
  );
  const selected = tokens.find((token) => token.id === selectedTokenId) ?? null;
  const activeToken = tokens.find((token) => token.id === session?.active_token_id) ?? null;
  const playerCanEndTurn = Boolean(
    !master &&
      activeToken &&
      (activeToken.controlled_by === w.user?.id ||
        (activeToken.character_id &&
          w.data.characters.some(
            (character) => character.id === activeToken.character_id && character.owner_id === w.user?.id,
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
    try {
      const next = await loadBattleSnapshot(campaign.id);
      setSnapshot(next);
      setActiveMapId((current) =>
        current && next.maps.some((item) => item.id === current) ? current : next.maps[0]?.id ?? null,
      );
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [campaign.id, w.demo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (w.demo) return;
    const channel = getSupabase().channel(`vtt-${campaign.id}`);
    ['battle_sessions', 'battle_maps', 'battle_map_cells', 'battle_map_objects', 'battle_map_tokens', 'battle_turn_order'].forEach(
      (table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void refresh()),
    );
    channel.subscribe();
    return () => {
      void getSupabase().removeChannel(channel);
    };
  }, [campaign.id, refresh, w.demo]);

  const tokenMediaKey = useMemo(
    () => tokens.map((token) => `${token.id}:${token.image ?? ''}`).sort().join('|'),
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
    if (!w.demo) void resolveBackground();
    const timer = !w.demo ? window.setInterval(() => void resolveBackground(), 12 * 60 * 1000) : null;
    return () => {
      live = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [map?.id, map?.background_image, w.demo]);

  useEffect(() => {
    let live = true;
    async function resolveTokenMedia() {
      const entries = await Promise.all(
        tokens.map(async (token) => [token.id, token.image ? await resolveImage(token.image, false) : null] as const),
      );
      if (live)
        setTokenUrls(
          Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))),
        );
    }
    if (!w.demo) void resolveTokenMedia();
    const timer = !w.demo ? window.setInterval(() => void resolveTokenMedia(), 12 * 60 * 1000) : null;
    return () => {
      live = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [tokenMediaKey, w.demo]);

  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (w.demo)
    return (
      <>
        <PageHeading eyebrow={campaign.name} title="Mesa tática" description="Grid tático persistente da campanha." />
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
    <>
      <PageHeading
        eyebrow={campaign.name}
        title="Mesa tática"
        description="Mapa, grid lógico, tokens, terreno e turnos sincronizados em tempo real."
        action={
          master ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={17} /> Novo mapa
            </Button>
          ) : undefined
        }
      />
      <ErrorBox message={error} />
      {!map ? (
        <Empty
          title="Nenhum mapa tático criado."
          description={master ? 'Crie o primeiro mapa para posicionar personagens e iniciar a mesa.' : 'O mestre ainda não abriu um mapa para esta campanha.'}
          action={master ? <Button onClick={() => setCreateOpen(true)}><MapIcon size={17} /> Criar mapa</Button> : undefined}
        />
      ) : (
        <div className="vtt-shell">
          <aside className="vtt-sidebar vtt-initiative">
            <div className="vtt-panel-title">
              <span><Swords size={18} /> Iniciativa</span>
              <Badge tone={session?.status === 'active' ? 'green' : 'muted'}>
                {session?.status === 'active' ? `Rodada ${session.round}` : 'Preparação'}
              </Badge>
            </div>
            <div className="vtt-turn-list">
              {(turnOrder.length ? turnOrder : tokens.map((token, position) => ({ id: token.id, session_id: session?.id ?? '', token_id: token.id, position, initiative: 0, created_at: '' }))).map((entry) => {
                const token = tokens.find((item) => item.id === entry.token_id);
                if (!token) return null;
                const active = session?.active_token_id === token.id;
                return (
                  <button key={entry.id} className={`vtt-turn-row ${active ? 'is-active' : ''}`} onClick={() => setSelectedTokenId(token.id)}>
                    <span className="vtt-token-mini">{tokenUrls[token.id] ? <img src={tokenUrls[token.id]} alt="" /> : token.name.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{token.name}</strong><small>{turnOrder.length ? `Iniciativa ${entry.initiative}` : 'Fora de combate'}</small></span>
                    {active && <Crosshair size={16} />}
                  </button>
                );
              })}
            </div>
            {master && (
              <div className="vtt-stack">
                {session?.status === 'active' ? (
                  <>
                    <Button disabled={busy} onClick={() => action(() => advanceBattleTurn(session.id))}><Flag size={16} /> Próximo turno</Button>
                    <Button variant="ghost" disabled={busy} onClick={() => action(() => endBattleCombat(session.id))}>Encerrar combate</Button>
                  </>
                ) : tokens.length ? (
                  <Button disabled={busy} onClick={() => setInitiativeOpen(true)}><Swords size={16} /> Iniciar combate</Button>
                ) : null}
              </div>
            )}
          </aside>

          <main className="vtt-board-panel">
            <div className="vtt-board-toolbar">
              <Select value={map.id} onChange={(e) => { setActiveMapId(e.target.value); setSelectedTokenId(null); }} aria-label="Mapa ativo">
                {snapshot.maps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
              <div className="vtt-toolbar-group">
                <Button variant="ghost" className="vtt-icon-button" onClick={() => document.dispatchEvent(new CustomEvent('vtt:zoom', { detail: 1.18 }))} aria-label="Aproximar"><ZoomIn size={18} /></Button>
                <Button variant="ghost" className="vtt-icon-button" onClick={() => document.dispatchEvent(new CustomEvent('vtt:zoom', { detail: 0.84 }))} aria-label="Afastar"><ZoomOut size={18} /></Button>
                <Button variant="ghost" className="vtt-icon-button" onClick={() => document.dispatchEvent(new CustomEvent('vtt:center'))} aria-label="Centralizar mapa"><Crosshair size={18} /></Button>
                <Button variant="ghost" className="vtt-icon-button" onClick={() => document.dispatchEvent(new CustomEvent('vtt:fit'))} aria-label="Ajustar mapa"><Maximize2 size={18} /></Button>
              </div>
              {master && <Button variant="secondary" onClick={() => setSettingsOpen(true)}>Configurar mapa</Button>}
            </div>
            <TacticalCanvas
              map={map}
              cells={cells}
              tokens={tokens}
              sessionActiveTokenId={session?.active_token_id ?? null}
              restrictToTurn={session?.status === 'active' && session.restrict_movement_to_turn}
              movementLimited={session?.status === 'active'}
              userId={w.user?.id ?? ''}
              characterOwners={Object.fromEntries(w.data.characters.map((c) => [c.id, c.owner_id]))}
              master={master}
              selectedTokenId={selectedTokenId}
              onSelectToken={setSelectedTokenId}
              terrainTool={terrainTool}
              forceMove={forceMove}
              backgroundUrl={backgroundUrl}
              tokenUrls={tokenUrls}
              disabled={busy}
              onMove={(token, point, path, force) => action(() => moveBattleToken(token, point, path, force))}
              onPaint={(point, tool) => action(() => paintCell(map.id, point, tool))}
            />
            <div className="vtt-statusbar">
              <div>
                <strong>{selected?.name ?? 'Nenhum token selecionado'}</strong>
                {selected ? <span>Posição {selected.x},{selected.y}</span> : <span>Selecione um token para movimentar.</span>}
              </div>
              {selected && <div className="vtt-status-stats"><TokenStats token={selected} /><MovementHud token={selected} map={map} /></div>}
            </div>
          </main>

          <aside className="vtt-sidebar vtt-tools">
            <div className="vtt-panel-title"><span><Shield size={18} /> {master ? 'Ferramentas do mestre' : 'Seu turno'}</span></div>
            {master ? (
              <>
                <div className="vtt-tool-section">
                  <strong>Terreno</strong>
                  <div className="vtt-tool-grid">
                    <ToolButton active={terrainTool === 'move'} onClick={() => setTerrainTool('move')} icon={<Crosshair size={16} />} label="Mover" />
                    <ToolButton active={terrainTool === 'normal'} onClick={() => setTerrainTool('normal')} icon={<RotateCcw size={16} />} label="Normal" />
                    <ToolButton active={terrainTool === 'difficult'} onClick={() => setTerrainTool('difficult')} icon={<Mountain size={16} />} label="Difícil" />
                    <ToolButton active={terrainTool === 'blocked'} onClick={() => setTerrainTool('blocked')} icon={<Grid3X3 size={16} />} label="Bloquear" />
                    <ToolButton active={terrainTool === 'custom'} onClick={() => setTerrainTool('custom')} icon={<MapIcon size={16} />} label="Personalizado" />
                  </div>
                  {terrainTool === 'custom' && (
                    <div className="vtt-custom-terrain">
                      <Input value={customTerrainType} onChange={(e) => setCustomTerrainType(e.target.value)} placeholder="Tipo: água, gelo, lama…" />
                      <Input type="number" min="0.1" step="0.1" value={customTerrainCost} onChange={(e) => setCustomTerrainCost(Number(e.target.value))} aria-label="Custo de movimento do terreno" />
                      <label className="vtt-check"><input type="checkbox" checked={customTerrainBlocked} onChange={(e) => setCustomTerrainBlocked(e.target.checked)} /> Bloqueado</label>
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
                        checked={session.restrict_movement_to_turn}
                        disabled={busy}
                        onChange={(e) => void action(() => updateBattleSession(session.id, { restrict_movement_to_turn: e.target.checked }))}
                      />
                      Somente o token ativo pode mover durante o combate
                    </label>
                  </div>
                )}
                <TokenManager campaign={campaign} map={map} cells={cells} tokens={tokens} busy={busy} onAction={action} />
                <div className="vtt-tool-section">
                  <label className="vtt-check"><input type="checkbox" checked={forceMove} onChange={(e) => setForceMove(e.target.checked)} /> Forçar movimento acima do limite</label>
                  <small>Ainda respeita células bloqueadas e colisões.</small>
                </div>
              </>
            ) : selected ? (
              <div className="vtt-tool-section">
                <MovementHud token={selected} map={map} detailed />
                <small>{session?.active_token_id === selected.id || session?.status !== 'active' ? 'Toque em uma célula válida ou arraste o token.' : 'Aguarde o turno indicado na iniciativa.'}</small>
              </div>
            ) : (
              <p className="vtt-muted">Selecione o seu personagem no mapa.</p>
            )}
            {playerCanEndTurn && session && (
              <Button disabled={busy} onClick={() => action(() => advanceBattleTurn(session.id))}>
                <Flag size={16} /> Fim do turno
              </Button>
            )}
          </aside>
        </div>
      )}

      <CreateMapModal open={createOpen} onClose={() => setCreateOpen(false)} busy={busy} onCreate={(payload) => action(async () => { const created = await createBattleMap(campaign.id, payload); setActiveMapId(created.id); setCreateOpen(false); })} />
      {map && <MapSettingsModal map={map} open={settingsOpen} onClose={() => setSettingsOpen(false)} busy={busy} onSave={(patch, file) => action(async () => { let background = patch.background_image; if (file) background = await uploadBattleMapBackground(map.id, file); await updateBattleMap(map.id, { ...patch, background_image: background }); setSettingsOpen(false); })} onDelete={() => action(async () => { await deleteBattleMap(map.id); setSettingsOpen(false); setSelectedTokenId(null); })} />}
      {session && <InitiativeModal open={initiativeOpen} onClose={() => setInitiativeOpen(false)} tokens={tokens} busy={busy} onStart={(order) => action(async () => { await startBattleCombat(session.id, order); setInitiativeOpen(false); })} />}
    </>
  );

  async function paintCell(mapId: string, point: GridPoint, tool: TerrainTool) {
    if (tool === 'normal') await clearBattleCell(mapId, point);
    else if (tool === 'difficult') await upsertBattleCell(mapId, point, 'difficult', 2, false);
    else if (tool === 'blocked') await upsertBattleCell(mapId, point, 'blocked', 1, true);
    else if (tool === 'custom') {
      const terrainType = customTerrainType.trim();
      if (!terrainType) throw new Error('Dê um nome ao terreno personalizado.');
      if (!Number.isFinite(customTerrainCost) || customTerrainCost <= 0) throw new Error('O custo do terreno deve ser maior que zero.');
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
    return <div className="vtt-token-stats"><span>{summary.ancestry} · {summary.profession}</span><span>CA <strong>{derived.armorClass}</strong></span><span>PV <strong>{character.sheet.hp_current}/{derived.hpMax}</strong></span><span>TAM <strong>{token.size}</strong></span></div>;
  }
  if (token.npc_id) {
    const npc = w.data.npcs.find((n) => n.id === token.npc_id);
    if (!npc) return null;
    return <div className="vtt-token-stats"><span>CA <strong>{npc.ac}</strong></span><span>PV <strong>{npc.hp_current}/{npc.hp_max}</strong></span></div>;
  }
  return null;
}

function InitiativeModal({ open, onClose, tokens, busy, onStart }: { open: boolean; onClose(): void; tokens: BattleToken[]; busy: boolean; onStart(order: Array<{ token_id: string; initiative: number }>): Promise<void> }) {
  const [values, setValues] = useState<Record<string, number>>({});
  useEffect(() => {
    if (open) setValues(Object.fromEntries(tokens.map((token) => [token.id, 0])));
  }, [open, tokens]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const order = tokens
      .map((token) => ({ token_id: token.id, initiative: Number(values[token.id] ?? 0), name: token.name }))
      .sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name))
      .map(({ token_id, initiative }) => ({ token_id, initiative }));
    await onStart(order);
  }
  return <Modal open={open} onClose={onClose} title="Definir iniciativa" description="Informe o resultado de iniciativa de cada participante. A mesa ordenará do maior para o menor."><form onSubmit={submit} className="form-stack"><div className="vtt-initiative-form">{tokens.map((token) => <Field key={token.id} label={token.name}><Input type="number" step="1" value={values[token.id] ?? 0} onChange={(e) => setValues((current) => ({ ...current, [token.id]: Number(e.target.value) }))} /></Field>)}</div><div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || tokens.length === 0}><Swords size={16} /> Começar combate</Button></div></form></Modal>;
}

function MovementHud({ token, map, detailed = false }: { token: BattleToken; map: BattleMap; detailed?: boolean }) {
  const maxInMapUnit = convertDistance(token.movement_speed, token.movement_unit, map.scale_unit);
  const remainingInMapUnit = convertDistance(token.movement_remaining, token.movement_unit, map.scale_unit);
  const maxCells = maxInMapUnit / map.scale_per_cell;
  const remainingCells = remainingInMapUnit / map.scale_per_cell;
  return (
    <div className={`vtt-movement-hud ${detailed ? 'is-detailed' : ''}`}>
      <span>MOVIMENTO</span>
      <strong>{remainingCells.toFixed(1)} / {maxCells.toFixed(1)} células</strong>
      <small>{token.movement_remaining.toFixed(1)} / {token.movement_speed.toFixed(1)} {token.movement_unit}</small>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean; onClick(): void; icon: ReactNode; label: string }) {
  return <button type="button" className={`vtt-tool-button ${active ? 'is-active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function TokenManager({ campaign, map, cells, tokens, busy, onAction }: { campaign: Campaign; map: BattleMap; cells: BattleSnapshot['cells']; tokens: BattleToken[]; busy: boolean; onAction(fn: () => Promise<unknown>): Promise<void> }) {
  const w = useWorkspace();
  const [characterId, setCharacterId] = useState('');
  const [npcId, setNpcId] = useState('');
  const [npcSpeed, setNpcSpeed] = useState('9');
  const usedCharacters = new Set(tokens.map((t) => t.character_id).filter(Boolean));
  const usedNpcs = new Set(tokens.map((t) => t.npc_id).filter(Boolean));
  const characters = w.data.characters.filter((c) => c.campaign_id === campaign.id && !usedCharacters.has(c.id));
  const npcs = w.data.npcs.filter((n) => n.campaign_id === campaign.id && !usedNpcs.has(n.id));
  const addCharacter = async () => {
    if (!characterId) return;
    await onAction(() => addCharacterToken(map.id, characterId, firstFreeCell(map, tokens, cells)));
    setCharacterId('');
  };
  const addNpc = async () => {
    if (!npcId || !Number.isFinite(Number(npcSpeed)) || Number(npcSpeed) < 0) return;
    await onAction(() => addNpcToken(map.id, npcId, Number(npcSpeed), 'm', firstFreeCell(map, tokens, cells)));
    setNpcId('');
  };
  return (
    <div className="vtt-tool-section">
      <strong><Users size={15} /> Tokens</strong>
      <Select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
        <option value="">Adicionar personagem…</option>
        {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Button variant="secondary" disabled={!characterId || busy} onClick={addCharacter}><UserPlus size={15} /> Adicionar personagem</Button>
      <div className="vtt-inline-fields">
        <Select value={npcId} onChange={(e) => setNpcId(e.target.value)}><option value="">Adicionar NPC…</option>{npcs.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select>
        <Input type="number" min="0" step="0.5" value={npcSpeed} onChange={(e) => setNpcSpeed(e.target.value)} aria-label="Deslocamento do NPC em metros" />
      </div>
      <Button variant="secondary" disabled={!npcId || busy} onClick={addNpc}><Plus size={15} /> Adicionar NPC</Button>
      <div className="vtt-token-admin-list">
        {tokens.map((token) => (
          <div key={token.id} className="vtt-token-admin-row">
            <span>{token.name}</span>
            <Select
              aria-label={`Controle de ${token.name}`}
              value={token.controlled_by ?? ''}
              onChange={(e) => void onAction(() => updateBattleToken(token.id, { controlled_by: e.target.value || null }))}
              disabled={busy}
            >
              <option value="">Somente mestre</option>
              {w.data.members.filter((m) => m.campaign_id === campaign.id).map((member) => {
                const profile = w.data.profiles.find((p) => p.id === member.user_id);
                return <option key={member.user_id} value={member.user_id}>{profile?.name ?? 'Jogador'}</option>;
              })}
            </Select>
            <button type="button" onClick={() => void onAction(() => updateBattleToken(token.id, { visible: !token.visible }))} disabled={busy} aria-label={token.visible ? `Ocultar ${token.name}` : `Mostrar ${token.name}`}>{token.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
            <button type="button" onClick={() => void onAction(() => removeBattleToken(token.id))} disabled={busy} aria-label={`Remover ${token.name}`}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateMapModal({ open, onClose, busy, onCreate }: { open: boolean; onClose(): void; busy: boolean; onCreate(payload: Record<string, unknown>): Promise<void> }) {
  const [name, setName] = useState('Campo de batalha');
  const [width, setWidth] = useState(30);
  const [height, setHeight] = useState(20);
  const [scale, setScale] = useState(1.5);
  async function submit(e: FormEvent) {
    e.preventDefault();
    await onCreate({ name, session_name: name, width, height, cell_size: 64, scale_per_cell: scale, scale_unit: 'm', diagonal_rule: 'one', grid_visible: true, grid_opacity: 0.45 });
  }
  return <Modal open={open} onClose={onClose} title="Criar mapa tático" description="Defina o espaço lógico do mapa. A imagem de fundo pode ser adicionada depois."><form onSubmit={submit} className="form-stack"><Field label="Nome"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field><div className="form-grid-three"><Field label="Largura (células)"><Input type="number" min="1" max="500" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></Field><Field label="Altura (células)"><Input type="number" min="1" max="500" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></Field><Field label="Escala por célula"><Input type="number" min="0.1" step="0.1" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></Field></div><div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />} Criar mesa</Button></div></form></Modal>;
}

function MapSettingsModal({ map, open, onClose, busy, onSave, onDelete }: { map: BattleMap; open: boolean; onClose(): void; busy: boolean; onSave(patch: Partial<BattleMap>, file: File | null): Promise<void>; onDelete(): Promise<void> }) {
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
  useEffect(() => { setName(map.name); setWidth(map.width); setHeight(map.height); setCellSize(map.cell_size); setScale(map.scale_per_cell); setUnit(map.scale_unit); setDiagonal(map.diagonal_rule); setOpacity(map.grid_opacity); setGridVisible(map.grid_visible); setBackgroundOffsetX(map.background_offset_x); setBackgroundOffsetY(map.background_offset_y); setBackgroundScale(map.background_scale); setFile(null); }, [map, open]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    await onSave({ name, width, height, cell_size: cellSize, scale_per_cell: scale, scale_unit: unit, diagonal_rule: diagonal, grid_opacity: opacity, grid_visible: gridVisible, background_offset_x: backgroundOffsetX, background_offset_y: backgroundOffsetY, background_scale: backgroundScale }, file);
  }
  return <Modal open={open} onClose={onClose} title="Configurar mapa" description="A posição dos tokens continua em coordenadas lógicas mesmo quando o tamanho visual muda." wide><form onSubmit={submit} className="form-stack"><Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><div className="form-grid-three"><Field label="Largura"><Input type="number" min="1" max="500" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></Field><Field label="Altura"><Input type="number" min="1" max="500" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></Field><Field label="Tamanho visual da célula"><Input type="number" min="16" max="256" value={cellSize} onChange={(e) => setCellSize(Number(e.target.value))} /></Field></div><div className="form-grid-three"><Field label="Distância por célula"><Input type="number" min="0.1" step="0.1" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></Field><Field label="Unidade"><Select value={unit} onChange={(e) => setUnit(e.target.value as GridUnit)}><option value="m">metros</option><option value="ft">pés</option></Select></Field><Field label="Diagonal"><Select value={diagonal} onChange={(e) => setDiagonal(e.target.value as BattleMap['diagonal_rule'])}><option value="one">1 por diagonal</option><option value="five-ten-five">Alternada 1/2</option><option value="sqrt2">Geométrica √2</option></Select></Field></div><div className="form-grid"><Field label="Opacidade do grid"><Input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></Field><Field label="Grid"><label className="vtt-check"><input type="checkbox" checked={gridVisible} onChange={(e) => setGridVisible(e.target.checked)} /> Mostrar linhas do grid</label></Field></div><div className="form-grid-three"><Field label="Mapa X (px)"><Input type="number" step="1" value={backgroundOffsetX} onChange={(e) => setBackgroundOffsetX(Number(e.target.value))} /></Field><Field label="Mapa Y (px)"><Input type="number" step="1" value={backgroundOffsetY} onChange={(e) => setBackgroundOffsetY(Number(e.target.value))} /></Field><Field label="Escala da imagem"><Input type="number" min="0.1" step="0.05" value={backgroundScale} onChange={(e) => setBackgroundScale(Number(e.target.value))} /></Field></div><Field label="Imagem do mapa"><label className="image-field"><ImagePlus size={20} /><span>{file ? file.name : map.background_image ? 'Trocar imagem' : 'Escolher imagem'}</span><small>JPG, PNG ou WebP · até 5 MB</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const chosen=e.target.files?.[0] ?? null; if (chosen) { try { validateImage(chosen); setFile(chosen); } catch { e.target.value=''; } } }} /></label></Field><div className="form-actions vtt-settings-actions"><Button type="button" variant="danger" disabled={busy} onClick={() => void onDelete()}><Trash2 size={16} /> Excluir mapa</Button><span /><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>Salvar</Button></div></form></Modal>;
}

function TacticalCanvas(props: {
  map: BattleMap;
  cells: BattleSnapshot['cells'];
  tokens: BattleToken[];
  sessionActiveTokenId: string | null;
  restrictToTurn: boolean;
  movementLimited: boolean;
  userId: string;
  characterOwners: Record<string, string>;
  master: boolean;
  selectedTokenId: string | null;
  onSelectToken(id: string | null): void;
  terrainTool: TerrainTool;
  forceMove: boolean;
  backgroundUrl: string | null;
  tokenUrls: Record<string, string>;
  disabled: boolean;
  onMove(token: BattleToken, destination: GridPoint, path: GridPoint[], force: boolean): Promise<void>;
  onPaint(point: GridPoint, tool: TerrainTool): Promise<void>;
}) {
  const { map, cells, tokens, master, selectedTokenId, onSelectToken, terrainTool, backgroundUrl, tokenUrls, forceMove, disabled } = props;
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 900, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [hoverCell, setHoverCell] = useState<GridPoint | null>(null);
  const [preview, setPreview] = useState<MovementResult | null>(null);
  const [dragToken, setDragToken] = useState<string | null>(null);
  const [pendingTouchCell, setPendingTouchCell] = useState<GridPoint | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean; lastPinch?: number }>({ startX: 0, startY: 0, panX: 0, panY: 0, moved: false });
  const selected = tokens.find((token) => token.id === selectedTokenId) ?? null;
  useEffect(() => setPendingTouchCell(null), [selectedTokenId, map.id]);
  const cellRenderKey = useMemo(
    () => cells.map((cell) => `${cell.x}:${cell.y}:${cell.movement_cost}:${cell.blocked ? 1 : 0}:${cell.terrain_type}`).sort().join('|'),
    [cells],
  );
  const mapRenderKey = `${map.id}:${map.width}:${map.height}:${map.cell_size}:${map.background_offset_x}:${map.background_offset_y}:${map.background_scale}:${map.grid_visible ? 1 : 0}:${map.grid_opacity}`;

  const canControl = useCallback((token: BattleToken) => {
    if (master) return true;
    const owned = token.controlled_by === props.userId || (!!token.character_id && props.characterOwners[token.character_id] === props.userId);
    if (!owned) return false;
    return !props.restrictToTurn || props.sessionActiveTokenId === token.id;
  }, [master, props.userId, props.characterOwners, props.restrictToTurn, props.sessionActiveTokenId]);

  const remainingGridCost = useMemo(() => {
    if (!selected) return 0;
    return convertDistance(selected.movement_remaining, selected.movement_unit, map.scale_unit) / map.scale_per_cell;
  }, [selected, map.scale_per_cell, map.scale_unit]);
  const reachable = useMemo(() => selected && canControl(selected) && props.movementLimited && !(forceMove && master) ? reachableCells({ from: selected, width: map.width, height: map.height, cells, tokens, movingTokenId: selected.id, rules: { diagonalRule: map.diagonal_rule }, maxCost: remainingGridCost }) : new Map<string, number>(), [selected, canControl, props.movementLimited, map.width, map.height, map.diagonal_rule, cells, tokens, forceMove, master, remainingGridCost]);

  const fit = useCallback(() => {
    const padding = 36;
    const worldWidth = map.width * map.cell_size;
    const worldHeight = map.height * map.cell_size;
    const nextZoom = clamp(Math.min((viewport.width - padding * 2) / worldWidth, (viewport.height - padding * 2) / worldHeight), 0.08, 2.5);
    setZoom(nextZoom);
    setPan({ x: (viewport.width - worldWidth * nextZoom) / 2, y: (viewport.height - worldHeight * nextZoom) / 2 });
  }, [map.width, map.height, map.cell_size, viewport]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const resize = () => setViewport({ width: Math.max(320, node.clientWidth), height: Math.max(420, node.clientHeight) });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { fit(); }, [fit]);
  useEffect(() => {
    const onZoom = (event: Event) => {
      const factor = (event as CustomEvent<number>).detail;
      setZoom((value) => clamp(value * factor, 0.08, 4));
    };
    const onFit = () => fit();
    const onCenter = () => setPan({ x: (viewport.width - map.width * map.cell_size * zoom) / 2, y: (viewport.height - map.height * map.cell_size * zoom) / 2 });
    document.addEventListener('vtt:zoom', onZoom);
    document.addEventListener('vtt:fit', onFit);
    document.addEventListener('vtt:center', onCenter);
    return () => { document.removeEventListener('vtt:zoom', onZoom); document.removeEventListener('vtt:fit', onFit); document.removeEventListener('vtt:center', onCenter); };
  }, [fit, viewport, map.width, map.height, map.cell_size, zoom]);

  useEffect(() => {
    if (!selected || !hoverCell || !canControl(selected) || terrainTool !== 'move') { setPreview(null); return; }
    setPreview(calculateMovementCost({ from: selected, to: hoverCell, width: map.width, height: map.height, cells, tokens, movingTokenId: selected.id, rules: { diagonalRule: map.diagonal_rule }, maxCost: !props.movementLimited || (forceMove && master) ? undefined : remainingGridCost }));
  }, [selected, hoverCell, canControl, terrainTool, map.width, map.height, map.diagonal_rule, cells, tokens, forceMove, master, remainingGridCost, props.movementLimited]);

  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    ctx.fillStyle = '#111710';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    const imageCache = imageCacheRef.current;
    const load = (src: string | null | undefined) => {
      if (!src) return null;
      let image = imageCache.get(src);
      if (!image) {
        image = new Image();
        image.src = src;
        image.onload = () => setPan((current) => ({ ...current }));
        imageCache.set(src, image);
      }
      return image.complete ? image : null;
    };
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    const cellSize = map.cell_size;
    const worldWidth = map.width * cellSize;
    const worldHeight = map.height * cellSize;
    const bg = load(backgroundUrl);
    if (bg) {
      ctx.globalAlpha = 0.96;
      ctx.drawImage(
        bg,
        map.background_offset_x,
        map.background_offset_y,
        worldWidth * map.background_scale,
        worldHeight * map.background_scale,
      );
      ctx.globalAlpha = 1;
    } else {
      const gradient = ctx.createLinearGradient(0, 0, worldWidth, worldHeight);
      gradient.addColorStop(0, '#283321');
      gradient.addColorStop(1, '#161c14');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, worldWidth, worldHeight);
    }
    for (const cell of cells) {
      const x = cell.x * cellSize;
      const y = cell.y * cellSize;
      ctx.fillStyle = cell.blocked
        ? 'rgba(116,39,35,.58)'
        : cell.movement_cost > 1
          ? 'rgba(157,121,51,.34)'
          : 'rgba(74,112,64,.18)';
      ctx.fillRect(x, y, cellSize, cellSize);
    }
    if (map.grid_visible) {
      ctx.strokeStyle = `rgba(226,205,146,${map.grid_opacity})`;
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      for (let x = 0; x <= map.width; x += 1) {
        ctx.moveTo(x * cellSize, 0);
        ctx.lineTo(x * cellSize, worldHeight);
      }
      for (let y = 0; y <= map.height; y += 1) {
        ctx.moveTo(0, y * cellSize);
        ctx.lineTo(worldWidth, y * cellSize);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, [viewport.width, viewport.height, mapRenderKey, cellRenderKey, pan, zoom, backgroundUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    const imageCache = imageCacheRef.current;
    const load = (src: string | null | undefined) => {
      if (!src) return null;
      let image = imageCache.get(src);
      if (!image) {
        image = new Image();
        image.src = src;
        image.onload = () => setPan((current) => ({ ...current }));
        imageCache.set(src, image);
      }
      return image.complete ? image : null;
    };
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    const cellSize = map.cell_size;
    if (selected && canControl(selected)) {
      ctx.fillStyle = 'rgba(114,163,92,.13)';
      for (const reachableKey of reachable.keys()) {
        const [x, y] = reachableKey.split(':').map(Number);
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
    if (preview?.path.length) {
      ctx.fillStyle = preview.allowed ? 'rgba(216,181,91,.35)' : 'rgba(180,58,54,.38)';
      for (const point of preview.path)
        ctx.fillRect(point.x * cellSize, point.y * cellSize, cellSize, cellSize);
    }
    for (const token of tokens) {
      const x = (token.x + token.size / 2) * cellSize;
      const y = (token.y + token.size / 2) * cellSize;
      const radius = cellSize * 0.39 * token.size;
      ctx.save();
      ctx.globalAlpha = token.visible || master ? 1 : 0.35;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.clip();
      const image = load(tokenUrls[token.id]);
      if (image) ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
      else {
        ctx.fillStyle = '#34402c';
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        ctx.fillStyle = '#f0dfb0';
        ctx.font = `600 ${Math.max(12, cellSize * 0.28)}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(token.name.slice(0, 2).toUpperCase(), x, y);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle =
        token.id === selectedTokenId
          ? '#f0cc68'
          : props.sessionActiveTokenId === token.id
            ? '#81c979'
            : '#1b2118';
      ctx.lineWidth = (token.id === selectedTokenId ? 4 : 3) / zoom;
      ctx.stroke();
      ctx.font = `600 ${12 / zoom}px Inter`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelY = y + radius + 5 / zoom;
      const label = token.name;
      const width = ctx.measureText(label).width + 10 / zoom;
      ctx.fillStyle = 'rgba(10,13,9,.82)';
      ctx.fillRect(x - width / 2, labelY, width, 18 / zoom);
      ctx.fillStyle = '#f1e6c5';
      ctx.fillText(label, x, labelY + 2 / zoom);
    }
    ctx.restore();
  }, [viewport.width, viewport.height, map.cell_size, tokens, selectedTokenId, props.sessionActiveTokenId, pan, zoom, tokenUrls, reachable, preview, selected, canControl, master]);

  function cellFromClient(clientX: number, clientY: number): GridPoint | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor(((clientX - rect.left - pan.x) / zoom) / map.cell_size);
    const y = Math.floor(((clientY - rect.top - pan.y) / zoom) / map.cell_size);
    return x >= 0 && y >= 0 && x < map.width && y < map.height ? { x, y } : null;
  }
  function tokenAt(point: GridPoint | null) { return point ? tokens.find((token) => token.x === point.x && token.y === point.y) ?? null : null; }

  async function completeMove(token: BattleToken, point: GridPoint | null) {
    if (!point || disabled || !canControl(token)) return;
    const result = calculateMovementCost({ from: token, to: point, width: map.width, height: map.height, cells, tokens, movingTokenId: token.id, rules: { diagonalRule: map.diagonal_rule }, maxCost: !props.movementLimited || (forceMove && master) ? undefined : convertDistance(token.movement_remaining, token.movement_unit, map.scale_unit) / map.scale_per_cell });
    if (!result.allowed || !result.path.length) return;
    await props.onMove(token, point, result.path, forceMove && master);
  }

  function pointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const point = cellFromClient(e.clientX, e.clientY);
    const hit = tokenAt(point);
    gesture.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
    if (pointers.current.size === 2) return;
    if (terrainTool !== 'move' && master) return;
    if (hit) { setPendingTouchCell(null); onSelectToken(hit.id); if (canControl(hit)) setDragToken(hit.id); }
  }
  function pointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setHoverCell(cellFromClient(e.clientX, e.clientY));
    const values = [...pointers.current.values()];
    if (values.length === 2) {
      gesture.current.moved = true;
      const distance = Math.hypot(values[0].x-values[1].x, values[0].y-values[1].y);
      const last = gesture.current.lastPinch ?? distance;
      setZoom((value) => clamp(value * (distance / Math.max(1,last)), 0.08, 4));
      gesture.current.lastPinch = distance; return;
    }
    const dx=e.clientX-gesture.current.startX, dy=e.clientY-gesture.current.startY;
    if (Math.hypot(dx,dy)>4) gesture.current.moved=true;
    if (!dragToken && terrainTool==='move' && !tokenAt(cellFromClient(gesture.current.startX,gesture.current.startY))) setPan({ x: gesture.current.panX+dx, y: gesture.current.panY+dy });
  }
  async function pointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    const point = cellFromClient(e.clientX,e.clientY);
    const hitStart = tokenAt(cellFromClient(gesture.current.startX,gesture.current.startY));
    pointers.current.delete(e.pointerId);
    gesture.current.lastPinch=undefined;
    if (terrainTool !== 'move' && master && !gesture.current.moved && point) {
      setPendingTouchCell(null);
      await props.onPaint(point, terrainTool);
    } else if (dragToken) {
      const token=tokens.find((t)=>t.id===dragToken);
      if (token) await completeMove(token,point);
      setPendingTouchCell(null);
    } else if (!gesture.current.moved && !hitStart && selected && point) {
      if (e.pointerType === 'touch') {
        const confirms = pendingTouchCell?.x === point.x && pendingTouchCell?.y === point.y;
        if (confirms) {
          await completeMove(selected, point);
          setPendingTouchCell(null);
        } else {
          setHoverCell(point);
          setPendingTouchCell(point);
        }
      } else {
        await completeMove(selected,point);
      }
    }
    setDragToken(null);
  }
  function wheel(e: ReactWheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const rect=e.currentTarget.getBoundingClientRect(); const mouseX=e.clientX-rect.left, mouseY=e.clientY-rect.top;
    const worldX=(mouseX-pan.x)/zoom, worldY=(mouseY-pan.y)/zoom;
    const next=clamp(zoom*(e.deltaY<0?1.12:0.89),0.08,4);
    setPan({x:mouseX-worldX*next,y:mouseY-worldY*next}); setZoom(next);
  }
  const previewDistance = preview && selected
    ? pathDistanceInCells(selected, preview.path, map.diagonal_rule) * map.scale_per_cell
    : 0;
  const previewMovement = preview ? preview.cost * map.scale_per_cell : 0;
  const previewRemaining = selected
    ? Math.max(0, convertDistance(selected.movement_remaining, selected.movement_unit, map.scale_unit) - previewMovement)
    : 0;

  return (
    <div ref={wrapRef} className={`vtt-canvas-wrap ${terrainTool !== 'move' ? 'is-painting' : ''}`}>
      <canvas ref={baseCanvasRef} className="vtt-canvas-base" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="vtt-canvas-overlay"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={(e) => void pointerUp(e)}
        onPointerCancel={(e) => { pointers.current.delete(e.pointerId); setDragToken(null); }}
        onWheel={wheel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Mapa tático interativo"
      />
      <div className="vtt-canvas-help">
        {terrainTool === 'move'
          ? 'Arraste o mapa · scroll/pinça para zoom · selecione ou arraste seu token'
          : 'Clique/toque em células para pintar o terreno'}
      </div>
      {preview && selected && hoverCell && (
        <div className={`vtt-preview ${preview.allowed ? '' : 'is-invalid'}`}>
          <strong>{preview.distance} células</strong>
          <span>Distância {previewDistance.toFixed(1)} {map.scale_unit}</span>
          <span>Custo {previewMovement.toFixed(1)} {map.scale_unit}</span>
          <small>
            {!preview.allowed
              ? preview.reason
              : props.movementLimited
                ? `${pendingTouchCell?.x === hoverCell.x && pendingTouchCell?.y === hoverCell.y ? 'Toque novamente para confirmar · ' : ''}Restante ${previewRemaining.toFixed(1)} ${map.scale_unit}`
                : `${pendingTouchCell?.x === hoverCell.x && pendingTouchCell?.y === hoverCell.y ? 'Toque novamente para confirmar · ' : ''}Fora de combate · sem consumo`}
          </small>
        </div>
      )}
    </div>
  );
}
