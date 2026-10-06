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
  Database,
  Ship,
  Shrub,
  Flower2,
  PackageOpen,
  FlameKindling,
  Store,
  Wheat,
  House,
  Cross,
  Fence,
  Sprout,
  Droplets,
  Armchair,
  LibraryBig,
  ShoppingBasket,
  Signpost,
  Utensils,
  RectangleVertical,
} from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ui';
import {
  SCENERY,
  sceneryRect,
  type SceneryBrush,
  type SceneryKind,
  normalizePortalCode,
  SCENERY_VARIANTS,
  sceneryAppearance,
  sceneryLabel,
  normalizeSceneryColor,
  sceneryMatches,
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
  const [paletteSearch, setPaletteSearch] = useState('');
  const invalidColor = Boolean(brush.color && !normalizeSceneryColor(brush.color));
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
      <Input
        aria-label="Buscar elemento ou variante"
        placeholder="Buscar elemento ou variante…"
        value={paletteSearch}
        onChange={(e) => setPaletteSearch(e.target.value)}
      />
      <div className="vtt-scenery-palette">
        {SCENERY.filter((s) => sceneryMatches(s.id, paletteSearch)).map((s) => (
          <button
            type="button"
            aria-pressed={tool === 'scenery' && brush.kind === s.id}
            key={s.id}
            disabled={busy}
            onClick={() => {
              onSelect(null);
              onBrush({
                ...brush,
                kind: s.id as SceneryKind,
                blocks: s.blocks,
                cost: s.cost,
                variant: 'default',
              });
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
      {!SCENERY.some((s) => sceneryMatches(s.id, paletteSearch)) && (
        <small>Nenhum elemento encontrado.</small>
      )}
      <Field label="Variante do elemento">
        <Select
          value={brush.variant ?? 'default'}
          onChange={(e) => onBrush({ ...brush, variant: e.target.value })}
        >
          <option value="default">{SCENERY.find((s) => s.id === brush.kind)?.name} · padrão</option>
          {(SCENERY_VARIANTS[brush.kind] ?? []).map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="vtt-object-colors">
        <Field label="Cor do elemento">
          <Input
            type="color"
            value={normalizeSceneryColor(brush.color) ?? '#a17e59'}
            onChange={(e) => onBrush({ ...brush, color: e.target.value })}
          />
        </Field>
        <Field
          label="Código da cor"
          hint={invalidColor ? 'Use uma cor no formato #RRGGBB.' : undefined}
        >
          <Input
            aria-invalid={invalidColor}
            value={brush.color ?? ''}
            placeholder="Padrão · ou #RRGGBB"
            maxLength={7}
            onChange={(e) => onBrush({ ...brush, color: e.target.value })}
          />
        </Field>
        <div className="vtt-color-swatches">
          {[
            ['#cf635f', 'vermelha'],
            ['#dba65b', 'âmbar'],
            ['#8ab178', 'verde'],
            ['#76b6cf', 'azul'],
            ['#af80da', 'violeta'],
            ['#e3a1bd', 'rosa'],
            ['#f0e8da', 'branca'],
            ['#555f66', 'cinza'],
          ].map(([color, name]) => (
            <button
              type="button"
              key={color}
              disabled={busy}
              aria-label={`Cor ${name}`}
              aria-pressed={brush.color === color}
              style={{ background: color }}
              onClick={() => onBrush({ ...brush, color })}
            />
          ))}
          <Button
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={() => onBrush({ ...brush, color: undefined })}
          >
            Cor padrão
          </Button>
        </div>
        <small>
          {selected
            ? 'A cor e a variante serão salvas em Aplicar alterações.'
            : 'A cor será usada nas próximas peças. Cor padrão mantém os materiais originais.'}
        </small>
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
            aria-label="Código do portal"
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
          : brush.kind === 'fire' || brush.kind === 'campfire' || brush.kind === 'lava'
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
          <strong>Editando {sceneryLabel(selected)}</strong>
          <ObjectPosition
            object={selected}
            brush={brush}
            busy={busy || invalidColor}
            onSave={onSave}
          />
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
            sceneryLabel(o).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
          )
          .map((o) => {
            const r = sceneryRect(o);
            return (
              <div className="vtt-scenery-row" key={o.id}>
                <button
                  type="button"
                  className={selectedId === o.id ? 'selected' : ''}
                  onClick={() => {
                    onSelect(o.id);
                    onTool('inspect');
                  }}
                >
                  <span>
                    <SceneryIcon kind={o.object_type} size={15} /> {sceneryLabel(o)}
                    {normalizeSceneryColor(o.metadata.color) && (
                      <i
                        className="vtt-object-color-dot"
                        style={{ background: String(o.metadata.color) }}
                      />
                    )}
                  </span>
                  <small>
                    {r ? `${r.x},${r.y} · ${r.width}×${r.height}` : 'Objeto legado'}
                    {o.object_type === 'portal' ? ` · ${o.metadata.portal_code ?? ''}` : ''}
                    {!o.visible ? ' · oculto' : ''}
                  </small>
                </button>
                <button
                  className="vtt-scenery-delete"
                  type="button"
                  disabled={busy}
                  aria-label={`Excluir ${sceneryLabel(o)} em ${r?.x ?? '?'},${r?.y ?? '?'}`}
                  onClick={() => onDelete(o.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
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
              ...sceneryAppearance(brush, object.metadata),
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
      barrel: [Database, '#c79a67'],
      campfire: [FlameKindling, '#f3ab64'],
      boat: [Ship, '#bca184'],
      bush: [Shrub, '#8ab178'],
      flowers: [Flower2, '#e3a1bd'],
      statue: [Landmark, '#c4cebf'],
      chest: [PackageOpen, '#dba65b'],
      counter: [Store, '#c49b6e'],
      crops: [Wheat, '#d8bb68'],
      house: [House, '#c9a17e'],
      gravestone: [RectangleVertical, '#aeb6af'],
      cross: [Cross, '#c5bba5'],
      fence: [Fence, '#b69b79'],
      grass: [Sprout, '#91b37c'],
      well: [Droplets, '#8dacbb'],
      bridge: [Route, '#c4b395'],
      table: [Utensils, '#c6a875'],
      chair: [Armchair, '#b28e6b'],
      bookshelf: [LibraryBig, '#b59bc5'],
      torch: [Flame, '#f0b069'],
      market: [ShoppingBasket, '#b5c78d'],
      signpost: [Signpost, '#d5c291'],
    } as const
  )[kind as SceneryKind] ?? [Gem, '#aaa99b'];
  return <Icon size={size} color={color} fill={color + '18'} strokeWidth={1.6} aria-hidden />;
}
