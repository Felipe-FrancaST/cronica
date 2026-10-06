'use client';
import { useState } from 'react';
import {
  Eye,
  MousePointer2,
  Trash2,
  TreeDeciduous,
  TreePine,
  Gem,
  MountainSnow,
  Landmark,
  Waves,
  Flame,
  Mountain,
  Tent,
  Route,
  Caravan,
  Snowflake,
  CircleDashed,
  Orbit,
} from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import {
  SCENERY,
  sceneryRect,
  type SceneryBrush,
  type SceneryKind,
  normalizePortalCode,
} from './scenery';
import type { BattleMapObject } from './types';
import type { TerrainTool } from './viewport-types';
export function SceneryEditor({
  objects,
  brush,
  onBrush,
  tool,
  onTool,
  selectedId,
  onSelect,
  busy,
  allObjects = objects,
  onSave,
  onDelete,
}: {
  objects: BattleMapObject[];
  brush: SceneryBrush;
  onBrush(b: SceneryBrush): void;
  tool: TerrainTool;
  onTool(t: TerrainTool): void;
  selectedId: string | null;
  onSelect(id: string | null): void;
  busy: boolean;
  allObjects?: BattleMapObject[];
  onSave(object: BattleMapObject): Promise<void>;
  onDelete(id: string): Promise<void>;
}) {
  const selected = objects.find((o) => o.id === selectedId);
  const rect = selected ? sceneryRect(selected) : null;
  const [search, setSearch] = useState('');
  const number = (key: 'width' | 'height' | 'rotation' | 'cost', label: string, max: number) => (
    <Field label={label}>
      <Input
        type="number"
        min={key === 'rotation' ? 0 : 1}
        max={max}
        step={key === 'rotation' ? 15 : 1}
        value={brush[key]}
        onChange={(e) => onBrush({ ...brush, [key]: Number(e.target.value) })}
      />
    </Field>
  );
  return (
    <section className="vtt-scenery-editor" aria-label="Decoração do cenário">
      <strong>Decorar o grid</strong>
      <small>Escolha um objeto e toque no grid para colocar. Cada clique adiciona uma peça.</small>
      <div className="vtt-scenery-palette">
        {SCENERY.map((s) => (
          <button
            type="button"
            aria-pressed={tool === 'scenery' && brush.kind === s.id}
            key={s.id}
            disabled={busy}
            onClick={() => {
              onSelect(null);
              onBrush({ ...brush, kind: s.id as SceneryKind, blocks: s.blocks, cost: s.cost });
              onTool('scenery');
            }}
          >
            <span aria-hidden>
              <SceneryIcon kind={s.id} />
            </span>
            {s.name}
          </button>
        ))}
      </div>
      <div className="vtt-scenery-dimensions">
        {number('width', 'Largura (células)', 8)}
        {number('height', 'Altura (células)', 8)}
        {number('rotation', 'Rotação visual (°)', 360)}
        {number('cost', 'Custo de movimento', 10)}
      </div>
      {brush.kind === 'portal' && (
        <Field label="Código do portal">
          <Input
            value={brush.portalCode ?? ''}
            maxLength={24}
            placeholder="Ex.: FLORESTA-01"
            onChange={(e) => onBrush({ ...brush, portalCode: normalizePortalCode(e.target.value) })}
          />
          <small>
            {
              allObjects.filter(
                (o) =>
                  o.object_type === 'portal' &&
                  o.metadata.portal_code === normalizePortalCode(brush.portalCode ?? ''),
              ).length
            }
            /2 pontas nesta campanha. Dois portais com o mesmo código conectam os mapas e
            compartilham a iniciativa.
          </small>
        </Field>
      )}
      <label className="vtt-check">
        <input
          type="checkbox"
          disabled={brush.kind === 'portal'}
          checked={brush.blocks}
          onChange={(e) => onBrush({ ...brush, blocks: e.target.checked })}
        />
        Bloquear deslocamento
      </label>
      <small>
        {brush.kind === 'water'
          ? 'Água pode ser atravessada. O custo 2 representa nadar sem velocidade de natação; ajuste o custo conforme a mesa.'
          : brush.kind === 'fire' || brush.kind === 'lava'
            ? 'Dano ambiental é aplicado pelo mestre conforme a situação.'
            : 'A área ocupada acompanha a largura e a altura em células.'}
      </small>
      <div className="vtt-action-buttons">
        <Button
          variant="secondary"
          aria-pressed={tool === 'inspect'}
          onClick={() => onTool('inspect')}
        >
          <MousePointer2 size={15} />
          Selecionar objeto
        </Button>
        <Button variant="secondary" onClick={() => onTool('move')}>
          Parar de decorar
        </Button>
      </div>
      {selected && rect && (
        <div className="vtt-scenery-selected" key={selected.id}>
          <strong>Editando {SCENERY.find((s) => s.id === selected.object_type)?.name}</strong>
          <ObjectPosition object={selected} brush={brush} busy={busy} onSave={onSave} />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onSave({ ...selected, visible: !selected.visible })}
          >
            <Eye size={15} />
            {selected.visible ? 'Ocultar dos jogadores' : 'Mostrar aos jogadores'}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => onDelete(selected.id)}>
            <Trash2 size={15} />
            Remover objeto
          </Button>
        </div>
      )}
      <Field label={`Objetos no mapa (${objects.length})`}>
        <Input
          aria-label="Buscar objeto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar objeto…"
        />
      </Field>
      <div className="vtt-scenery-list">
        {objects
          .filter((o) =>
            (SCENERY.find((s) => s.id === o.object_type)?.name ?? o.object_type)
              .toLocaleLowerCase('pt-BR')
              .includes(search.toLocaleLowerCase('pt-BR')),
          )
          .map((o) => {
            const r = sceneryRect(o);
            return (
              <button
                type="button"
                key={o.id}
                className={selectedId === o.id ? 'selected' : ''}
                onClick={() => {
                  onSelect(o.id);
                  onTool('inspect');
                }}
              >
                <span>
                  <SceneryIcon kind={o.object_type} size={15} />{' '}
                  {SCENERY.find((s) => s.id === o.object_type)?.name ?? o.object_type}
                </span>
                <small>
                  {r ? `${r.x},${r.y} · ${r.width}×${r.height}` : 'Objeto legado'}
                  {o.object_type === 'portal' ? ` · ${o.metadata.portal_code ?? ''}` : ''}
                  {!o.visible ? ' · oculto' : ''}
                </small>
              </button>
            );
          })}
      </div>
    </section>
  );
}
function ObjectPosition({
  object,
  brush,
  busy,
  onSave,
}: {
  object: BattleMapObject;
  brush: SceneryBrush;
  busy: boolean;
  onSave(o: BattleMapObject): Promise<void>;
}) {
  const rect = sceneryRect(object)!;
  const [x, setX] = useState(rect.x),
    [y, setY] = useState(rect.y);
  return (
    <>
      <div className="vtt-scenery-dimensions">
        <Field label="Posição X">
          <Input type="number" min={0} value={x} onChange={(e) => setX(Number(e.target.value))} />
        </Field>
        <Field label="Posição Y">
          <Input type="number" min={0} value={y} onChange={(e) => setY(Number(e.target.value))} />
        </Field>
      </div>
      <Button
        disabled={busy}
        onClick={() =>
          onSave({
            ...object,
            geometry: { x, y, width: brush.width, height: brush.height, rotation: brush.rotation },
            blocks_movement: brush.blocks,
            blocks_vision: brush.blocks,
            metadata: {
              ...object.metadata,
              movement_cost: brush.cost,
              ...(object.object_type === 'portal'
                ? { portal_code: normalizePortalCode(brush.portalCode ?? '') }
                : {}),
            },
          })
        }
      >
        Aplicar alterações
      </Button>
    </>
  );
}

function SceneryIcon({ kind, size = 27 }: { kind: string; size?: number }) {
  const [Icon, color] = (
    {
      tree: [TreeDeciduous, '#91b37c'],
      pine: [TreePine, '#70a98e'],
      rock: [Gem, '#aaa99b'],
      mountain: [MountainSnow, '#c4cebf'],
      ruin: [Landmark, '#c3b491'],
      water: [Waves, '#7ebccb'],
      fire: [Flame, '#f3ab64'],
      lava: [Mountain, '#ef865d'],
      tent: [Tent, '#d6b08b'],
      road: [Route, '#c1ad81'],
      cart: [Caravan, '#ad8f6d'],
      ice: [Snowflake, '#a7dfe9'],
      pit: [CircleDashed, '#a0a49a'],
      portal: [Orbit, '#bc97ff'],
    } as const
  )[kind as SceneryKind] ?? [Gem, '#aaa99b'];
  return <Icon size={size} color={color} fill={color + '18'} strokeWidth={1.6} aria-hidden />;
}
