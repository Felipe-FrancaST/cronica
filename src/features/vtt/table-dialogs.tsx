'use client';
import dynamic from 'next/dynamic';
const MedievalCityPreview = dynamic(
  () => import('./medieval-city-preview').then((m) => m.MedievalCityPreview),
  { ssr: false },
);

import { ImageField } from '@/components/media';
import { Button, Confirm, ErrorBox, Field, Input, Modal, Select } from '@/components/ui';
import { BackgroundLibraryPicker } from '@/features/map-assets/background-picker';
import { useWorkspace } from '@/hooks/use-workspace';
import { npcGridSize } from '@/systems/dnd5e/npc-stat-block';
import { getSystem } from '@/systems/registry';
import type { Campaign } from '@/types';
import { Eye, EyeOff, LoaderCircle, Plus, Swords, Trash2, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ToolPagination } from './master-tool-menu';
import { MEDIEVAL_CITY } from './medieval-city';
import { convertDistance } from './movement';
import { addCharacterToken, addNpcToken, removeBattleToken, updateBattleToken } from './repository';
import { createSceneryMovementCache } from './scenery-movement-cache';
import { firstFreeCell } from './table-geometry';
import type { BattleMap, BattleMapObject, BattleSnapshot, BattleToken, GridUnit } from './types';

export function TokenStats({ token }: { token: BattleToken }) {
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

export function InitiativeModal({
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
          <Button
            type="submit"
            disabled={busy || tokens.length === 0}
            disabledReason={
              busy
                ? 'Aguarde o início do combate.'
                : 'Adicione pelo menos um personagem ou NPC ao Grid antes de começar o combate.'
            }
          >
            <Swords size={16} /> Começar combate
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function MovementHud({
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

export function ToolButton({
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

export function TokenManager({
  campaign,
  map,
  cells,
  objects,
  tokens,
  busy,
  onAction,
}: {
  campaign: Campaign;
  map: BattleMap;
  cells: BattleSnapshot['cells'];
  objects: BattleMapObject[];
  tokens: BattleToken[];
  busy: boolean;
  onAction(fn: () => Promise<unknown>): Promise<void>;
}) {
  const w = useWorkspace();
  const movementCache = useMemo(() => createSceneryMovementCache(), []);
  const movementCells = movementCache(cells, objects);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const filteredTokens = tokens.filter((token) =>
    token.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filteredTokens.length / 8) - 1));
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
    await onAction(() =>
      addCharacterToken(map.id, characterId, firstFreeCell(map, tokens, movementCells)),
    );
    setCharacterId('');
  };
  const addNpc = async () => {
    if (!npcId || !Number.isFinite(Number(npcSpeed)) || Number(npcSpeed) < 0) return;
    await onAction(() =>
      addNpcToken(
        map.id,
        npcId,
        Number(npcSpeed),
        'm',
        firstFreeCell(
          map,
          tokens,
          movementCells,
          npcGridSize(w.data.npcs.find((n) => n.id === npcId)),
        ),
      ),
    );
    setNpcId('');
  };
  return (
    <div className="vtt-tool-section">
      <strong>
        <Users size={15} /> Tokens
      </strong>
      <Select
        aria-label="Personagem para adicionar"
        value={characterId}
        onChange={(e) => setCharacterId(e.target.value)}
      >
        <option value="">Adicionar personagem…</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button
        variant="secondary"
        disabled={!characterId || busy}
        disabledReason={
          busy
            ? 'Aguarde a atualização das peças.'
            : 'Selecione o personagem que deseja adicionar ao Grid.'
        }
        onClick={addCharacter}
      >
        <UserPlus size={15} /> Adicionar personagem
      </Button>
      <div className="vtt-inline-fields">
        <Select
          aria-label="NPC para adicionar"
          value={npcId}
          onChange={(e) => {
            setNpcId(e.target.value);
            setNpcSpeed(
              String(
                w.data.npcs.find((n) => n.id === e.target.value)?.stat_block?.movement?.walk ?? 9,
              ),
            );
          }}
        >
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
      <Button
        variant="secondary"
        disabled={!npcId || busy}
        disabledReason={
          busy
            ? 'Aguarde a atualização das peças.'
            : 'Selecione o NPC que deseja adicionar ao Grid.'
        }
        onClick={addNpc}
      >
        <Plus size={15} /> Adicionar NPC
      </Button>
      <Field label={`Participantes no mapa (${tokens.length})`}>
        <Input
          placeholder="Buscar participante…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
      </Field>
      <div className="vtt-token-admin-list">
        {filteredTokens.slice(currentPage * 8, (currentPage + 1) * 8).map((token) => (
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
      <ToolPagination
        page={currentPage}
        total={filteredTokens.length}
        size={8}
        onPage={setPage}
        label="participantes"
      />
      {!filteredTokens.length && <small>Nenhum participante encontrado.</small>}
    </div>
  );
}

export function CreateMapModal({
  open,
  onClose,
  busy,
  error,
  onCreate,
}: {
  open: boolean;
  onClose(): void;
  busy: boolean;
  error: string | null;
  onCreate(
    payload: Record<string, unknown>,
    city: boolean,
    background?: File | null,
  ): Promise<void>;
}) {
  const [city, setCity] = useState(false);
  const [name, setName] = useState('Campo de batalha');
  const [width, setWidth] = useState(30);
  const [height, setHeight] = useState(20);
  const [scale, setScale] = useState(1.5);
  const [background, setBackground] = useState<File | null>(null);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  useEffect(() => {
    if (open) setBackground(null);
  }, [open]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || backgroundLoading) return;
    await onCreate(
      {
        name,
        session_name: name,
        width: city ? MEDIEVAL_CITY.width : width,
        height: city ? MEDIEVAL_CITY.height : height,
        description: city ? MEDIEVAL_CITY.description : '',
        cell_size: 64,
        scale_per_cell: city ? MEDIEVAL_CITY.scale_per_cell : scale,
        scale_unit: 'm',
        diagonal_rule: 'one',
        grid_visible: true,
        grid_opacity: 0.45,
      },
      city,
      background,
    );
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Criar mapa tático"
      description="Defina o espaço lógico do mapa. A imagem de fundo pode ser adicionada depois."
    >
      <form onSubmit={submit} className="form-stack">
        {error && <ErrorBox message={error} />}
        <Field label="Cenário inicial">
          <Select
            value={city ? 'medieval-city' : 'blank'}
            disabled={busy}
            onChange={(e) => {
              const value = e.target.value === 'medieval-city';
              setCity(value);
              setName(value ? MEDIEVAL_CITY.name : 'Campo de batalha');
            }}
          >
            <option value="blank">Mapa vazio</option>
            <option value="medieval-city">Valedouro · cidade medieval pronta</option>
          </Select>
        </Field>
        {city && <MedievalCityPreview />}
        <Field label="Nome">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="form-grid-three">
          <Field label="Largura (células)">
            <Input
              type="number"
              min="1"
              max="500"
              value={city ? MEDIEVAL_CITY.width : width}
              disabled={city}
              title={
                city
                  ? 'A cidade usa 128 × 112 células. Você pode ampliar o mapa depois de criá-la.'
                  : undefined
              }
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </Field>
          <Field label="Altura (células)">
            <Input
              type="number"
              min="1"
              max="500"
              value={city ? MEDIEVAL_CITY.height : height}
              disabled={city}
              title={
                city
                  ? 'A cidade usa 128 × 112 células. Você pode ampliar o mapa depois de criá-la.'
                  : undefined
              }
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </Field>
          <Field label="Escala por célula">
            <Input
              type="number"
              min="0.1"
              step="0.1"
              value={city ? MEDIEVAL_CITY.scale_per_cell : scale}
              disabled={city}
              title={
                city ? 'O tamanho das peças desta cidade considera 1,5 m por célula.' : undefined
              }
              onChange={(e) => setScale(Number(e.target.value))}
            />
          </Field>
        </div>
        <BackgroundLibraryPicker
          onChoose={setBackground}
          onBusyChange={setBackgroundLoading}
          disabled={busy}
        />
        {background && (
          <div>
            <p>Fundo escolhido: {background.name}</p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBackground(null)}
              disabled={busy}
            >
              Remover fundo escolhido
            </Button>
          </div>
        )}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || backgroundLoading}>
            {busy && <LoaderCircle className="spin" size={16} />}{' '}
            {city ? 'Criar cidade' : 'Criar mesa'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function MapSettingsModal({
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
  const [backgroundLoading, setBackgroundLoading] = useState(false);
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
    if (busy || backgroundLoading) return;
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
            <BackgroundLibraryPicker
              onBusyChange={setBackgroundLoading}
              disabled={busy}
              onChoose={(file) => {
                setFile(file);
                setRemoveImage(false);
                setFileError(null);
              }}
            />
            <ImageField
              label="Imagem do mapa"
              aspect="original"
              maxBytes={25 * 1024 * 1024}
              maxSide={4096}
              value={file}
              current={removeImage ? null : map.background_image}
              disabled={busy}
              onError={setFileError}
              onChange={(chosen) => {
                setFile(chosen);
                setRemoveImage(false);
                setFileError(null);
              }}
            />
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
            <Button type="submit" disabled={busy || backgroundLoading}>
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
