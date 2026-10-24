'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { drawSymbol, drawFeature } from './render';
import { featureBase, routeDistance } from './model';
import {
  CELL,
  FEATURE_LAYER,
  LAYER_NAMES,
  ROUTES,
  SYMBOLS,
  TERRAINS,
  TOKEN_ICONS,
  TOKEN_LABELS,
  type AtlasDocument,
  type Brush,
  type MapFeature,
  type SymbolId,
  type TokenIcon,
  type RouteStyle,
  type AtlasTool,
} from './types';
export interface ToolOptions {
  brush: Brush;
  symbol: SymbolId;
  symbolSize: number;
  symbolColor: string;
  stamp: boolean;
  pieceRotation: number;
  token: TokenIcon;
  tokenColor: string;
  tokenSize: number;
  tokenName: string;
  tokenFaction: 'neutral' | 'ally' | 'enemy';
  tokenNumber: number;
  routeStyle: RouteStyle;
  routeColor: string;
  routeWidth: number;
  routeCurved: boolean;
  regionColor: string;
  regionOpacity: number;
  label: string;
  labelSize: number;
  labelColor: string;
}
export const INITIAL_OPTIONS: ToolOptions = {
  brush: { terrain: 3, elevation: 1, radius: 3, shape: 'circle', heightOnly: false },
  symbol: 'mountain',
  symbolSize: 64,
  symbolColor: '#66543c',
  stamp: false,
  pieceRotation: 0,
  token: 'warrior',
  tokenColor: '#638895',
  tokenSize: 48,
  tokenName: '',
  tokenFaction: 'ally',
  tokenNumber: 1,
  routeStyle: 'road',
  routeColor: '#98754b',
  routeWidth: 5,
  routeCurved: true,
  regionColor: '#b89b61',
  regionOpacity: 0.2,
  label: 'Novo lugar',
  labelSize: 24,
  labelColor: '#564630',
};
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(v: number): void;
  suffix?: string;
}) {
  return (
    <label className="atlas-range">
      <span>
        {label}
        <output>
          {Number(value.toFixed(2))}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange(v: number): void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
}) {
  const [text, setText] = useState(String(value));
  const skipBlur = useRef(false);
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    const n = Number(text);
    const next =
      text.trim() && Number.isFinite(n)
        ? Math.max(min, Math.min(max, step === 1 ? Math.round(n) : n))
        : value;
    setText(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            skipBlur.current = true;
            setText(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label className="atlas-color">
      <span>{label}</span>
      <span>
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}
export function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label className="atlas-check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function SymbolPreview({
  symbol,
  color,
  size = 50,
}: {
  symbol: SymbolId;
  color: string;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, 100, 100);
    c.save();
    c.translate(50, 52);
    drawSymbol(c, symbol, 76, color);
    c.restore();
  }, [symbol, color]);
  return (
    <canvas
      ref={ref}
      width={100}
      height={100}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
function TokenPreview({ icon, color }: { icon: TokenIcon; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, 80, 80);
    c.save();
    c.translate(40, 40);
    drawFeature(
      c,
      {
        ...featureBase({ x: 0, y: 0 }, ''),
        kind: 'token',
        icon,
        size: 58,
        color,
        faction: 'neutral',
        number: 0,
      },
      '#66543c',
    );
    c.restore();
  }, [icon, color]);
  return (
    <canvas ref={ref} width={80} height={80} style={{ width: 45, height: 45 }} aria-hidden="true" />
  );
}

export function ToolPanel({
  tool,
  options: o,
  onChange,
  document: d,
  onDocument,
  characters,
  onFinish,
  onCancel,
}: {
  tool: AtlasTool;
  options: ToolOptions;
  onChange(patch: Partial<ToolOptions>): void;
  document: AtlasDocument;
  onDocument(doc: AtlasDocument, group?: string): void;
  characters: { name: string; id: string }[];
  onFinish(): void;
  onCancel(): void;
}) {
  const [group, setGroup] = useState('all'),
    [search, setSearch] = useState('');
  const brush = (patch: Partial<Brush>) => onChange({ brush: { ...o.brush, ...patch } });
  const symbols = SYMBOLS.filter(
    (s) =>
      (group === 'all' || s[2] === group) &&
      s[1]
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(
          search
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase(),
        ),
  );
  return (
    <div className="atlas-options">
      {['paint', 'fill', 'erase', 'pick'].includes(tool) && (
        <>
          <p className="atlas-hint">
            {tool === 'fill'
              ? 'Preencha uma área conectada do mesmo terreno.'
              : tool === 'erase'
                ? 'Restaure o terreno inicial onde passar o pincel.'
                : tool === 'pick'
                  ? 'Clique no mapa para copiar o terreno e a altura.'
                  : 'Pinte arrastando. Cada traço pode ser desfeito de uma vez.'}
          </p>
          <div className="atlas-terrain-palette" role="group" aria-label="Tipos de terreno">
            {TERRAINS.map((t, i) => (
              <button
                type="button"
                key={t.name}
                className={o.brush.terrain === i ? 'selected' : ''}
                aria-pressed={o.brush.terrain === i}
                onClick={() => brush({ terrain: i, elevation: t.height })}
                title={t.name}
              >
                <i style={{ background: d.palette[i] }} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          <ColorField
            label={`Cor de ${TERRAINS[o.brush.terrain].name}`}
            value={d.palette[o.brush.terrain]}
            onChange={(value) =>
              onDocument(
                { ...d, palette: d.palette.map((c, i) => (i === o.brush.terrain ? value : c)) },
                `palette:${o.brush.terrain}`,
              )
            }
          />
          <Range
            label="Tamanho do pincel"
            value={o.brush.radius}
            min={0.5}
            max={18}
            step={0.5}
            onChange={(radius) => brush({ radius })}
          />
          <Field label="Formato do pincel">
            <Select
              value={o.brush.shape}
              onChange={(e) => brush({ shape: e.target.value as Brush['shape'] })}
            >
              <option value="circle">Circular</option>
              <option value="square">Quadrado</option>
            </Select>
          </Field>
          <Range
            label="Altura do relevo"
            value={o.brush.elevation}
            min={0}
            max={5}
            onChange={(elevation) => brush({ elevation })}
          />
          <Check
            label="Alterar somente o relevo"
            checked={o.brush.heightOnly}
            onChange={(heightOnly) => brush({ heightOnly })}
          />
        </>
      )}
      {(tool === 'symbol' || tool === 'token') && (
        <Range
          label="Rotação das novas peças"
          value={o.pieceRotation}
          min={-180}
          max={180}
          step={15}
          suffix="°"
          onChange={(pieceRotation) => onChange({ pieceRotation })}
        />
      )}
      {tool === 'symbol' && (
        <>
          <Input
            placeholder="Buscar símbolo"
            aria-label="Buscar símbolo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            aria-label="Categoria de símbolos"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="all">Todos os símbolos</option>
            <option value="nature">Natureza e relevo</option>
            <option value="places">Lugares e construções</option>
            <option value="adventure">Aventura e masmorra</option>
            <option value="interior">Móveis e objetos</option>
          </Select>
          <div className="atlas-symbol-grid" role="group" aria-label="Biblioteca de símbolos">
            {symbols.map(([id, name]) => (
              <button
                type="button"
                key={id}
                title={name}
                aria-label={name}
                aria-pressed={o.symbol === id}
                onClick={() => onChange({ symbol: id })}
              >
                <SymbolPreview symbol={id} color={o.symbolColor} />
                <span>{name}</span>
              </button>
            ))}
          </div>
          {!symbols.length && <p className="atlas-hint">Nenhum símbolo encontrado.</p>}
          <Range
            label="Tamanho do símbolo"
            value={o.symbolSize}
            min={12}
            max={256}
            onChange={(symbolSize) => onChange({ symbolSize })}
          />
          <ColorField
            label="Cor do símbolo"
            value={o.symbolColor}
            onChange={(symbolColor) => onChange({ symbolColor })}
          />
          <Check
            label="Pintar símbolos continuamente"
            checked={o.stamp}
            onChange={(stamp) => onChange({ stamp })}
          />
          <p className="atlas-hint">
            Use a pintura contínua para criar bosques ou cordilheiras. Selecione as peças depois
            para ajustar posição, rotação e tamanho.
          </p>
        </>
      )}
      {tool === 'token' && (
        <>
          <Input
            aria-label="Buscar token"
            placeholder="Buscar classe ou criatura"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="atlas-hint">
            Todas as 12 classes e criaturas com silhuetas próprias. A borda indica a facção; o
            número distingue encontros.
          </p>
          <div
            className="atlas-symbol-grid atlas-token-grid"
            role="group"
            aria-label="Tipos de token"
          >
            {TOKEN_ICONS.filter((icon) =>
              TOKEN_LABELS[icon]
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .includes(
                  search
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase(),
                ),
            ).map((icon) => (
              <button
                type="button"
                key={icon}
                aria-label={TOKEN_LABELS[icon]}
                aria-pressed={o.token === icon}
                onClick={() => onChange({ token: icon })}
              >
                <TokenPreview icon={icon} color={o.tokenColor} />
                <span>{TOKEN_LABELS[icon]}</span>
              </button>
            ))}
          </div>
          <Field label="Nome do token">
            <Input
              maxLength={120}
              value={o.tokenName}
              onChange={(e) => onChange({ tokenName: e.target.value })}
              placeholder="Ex.: Guardião do portão"
            />
          </Field>
          {!!characters.length && (
            <Field label="Usar nome de personagem">
              <Select
                value=""
                onChange={(e) => {
                  const c = characters.find((c) => c.id === e.target.value);
                  if (c) onChange({ tokenName: c.name.slice(0, 120) });
                }}
              >
                <option value="">Escolher personagem…</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Facção do token">
            <Select
              value={o.tokenFaction}
              onChange={(e) =>
                onChange({
                  tokenFaction: e.target.value as ToolOptions['tokenFaction'],
                  tokenColor:
                    e.target.value === 'enemy'
                      ? '#a2685a'
                      : e.target.value === 'ally'
                        ? '#638895'
                        : '#a48f60',
                })
              }
            >
              <option value="ally">Aliado</option>
              <option value="enemy">Inimigo</option>
              <option value="neutral">Neutro</option>
            </Select>
          </Field>
          <ColorField
            label="Cor do token"
            value={o.tokenColor}
            onChange={(tokenColor) => onChange({ tokenColor })}
          />
          <Range
            label="Tamanho do token"
            value={o.tokenSize}
            min={16}
            max={160}
            onChange={(tokenSize) => onChange({ tokenSize })}
          />
          <NumberField
            label="Número do token"
            value={o.tokenNumber}
            min={0}
            max={999}
            onChange={(tokenNumber) => onChange({ tokenNumber })}
          />
          <p className="atlas-hint">
            Os tokens organizam viagens e encontros neste mapa. A Mesa tem suas próprias peças de
            combate.
          </p>
        </>
      )}
      {tool === 'label' && (
        <>
          <Field label="Texto a colocar">
            <Input
              maxLength={300}
              value={o.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </Field>
          <Range
            label="Tamanho do texto"
            value={o.labelSize}
            min={8}
            max={100}
            onChange={(labelSize) => onChange({ labelSize })}
          />
          <ColorField
            label="Cor do texto"
            value={o.labelColor}
            onChange={(labelColor) => onChange({ labelColor })}
          />
          <p className="atlas-hint">
            Clique no mapa para colocar. Use Seleção para mover, girar ou editar.
          </p>
        </>
      )}
      {(tool === 'route' || tool === 'region') && (
        <>
          <p className="atlas-hint">
            Clique para marcar os pontos. Conclua com Enter ou duplo clique; Escape cancela.
          </p>
          {tool === 'route' ? (
            <>
              <Field label="Tipo de rota">
                <Select
                  value={o.routeStyle}
                  onChange={(e) => {
                    const style = e.target.value as RouteStyle;
                    onChange({
                      routeStyle: style,
                      routeColor:
                        style === 'river' ? '#588f9e' : style === 'border' ? '#a47b65' : '#98754b',
                    });
                  }}
                >
                  {Object.entries(ROUTES).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
              <ColorField
                label="Cor da rota"
                value={o.routeColor}
                onChange={(routeColor) => onChange({ routeColor })}
              />
              <Range
                label="Largura da rota"
                value={o.routeWidth}
                min={1}
                max={40}
                onChange={(routeWidth) => onChange({ routeWidth })}
              />
              <Check
                label="Curvar os caminhos"
                checked={o.routeCurved}
                onChange={(routeCurved) => onChange({ routeCurved })}
              />
            </>
          ) : (
            <>
              <ColorField
                label="Cor da região"
                value={o.regionColor}
                onChange={(regionColor) => onChange({ regionColor })}
              />
              <Range
                label="Transparência da região"
                value={o.regionOpacity}
                min={0}
                max={0.8}
                step={0.05}
                onChange={(regionOpacity) => onChange({ regionOpacity })}
              />
            </>
          )}
          <div className="atlas-panel-actions">
            <Button onClick={onFinish}>Concluir traçado</Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancelar traçado
            </Button>
          </div>
        </>
      )}
      {tool === 'measure' && (
        <>
          <p className="atlas-hint">
            Marque dois pontos para medir a distância pela escala do mapa. Clique novamente para
            começar outra medição.
          </p>
          <Button variant="secondary" onClick={onCancel}>
            Limpar medição
          </Button>
        </>
      )}
      {(tool === 'select' || tool === 'pan') && (
        <>
          <p className="atlas-hint">
            {tool === 'select'
              ? 'Clique e arraste para mover elementos. Shift adiciona à seleção; arrastar uma área seleciona vários. Os pontos dourados das rotas podem ser arrastados.'
              : 'Arraste para navegar. Use a roda ou dois dedos para aproximar. Espaço também ativa a navegação temporariamente.'}
          </p>
          <div className="atlas-shortcuts">
            <span>
              <kbd>V</kbd> Selecionar
            </span>
            <span>
              <kbd>B</kbd> Pincel
            </span>
            <span>
              <kbd>S</kbd> Símbolos
            </span>
            <span>
              <kbd>R</kbd> Rotas
            </span>
            <span>
              <kbd>L</kbd> Texto
            </span>
            <span>
              <kbd>Ctrl Z</kbd> Desfazer
            </span>
            <span>
              <kbd>Ctrl D</kbd> Duplicar
            </span>
            <span>
              <kbd>Del</kbd> Excluir seleção
            </span>
            <span>
              <kbd>0</kbd> Enquadrar
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function SelectionPanel({
  document: d,
  ids,
  onChange,
  onDuplicate,
  onDelete,
  onSelect,
}: {
  document: AtlasDocument;
  ids: string[];
  onChange(next: MapFeature): void;
  onDuplicate(): void;
  onDelete(): void;
  onSelect(ids: string[]): void;
}) {
  const selected = d.objects.filter((o) => ids.includes(o.id));
  if (!selected.length)
    return (
      <p className="atlas-hint">
        Use Seleção para escolher um elemento no mapa ou na lista de camadas.
      </p>
    );
  if (selected.length > 1)
    return (
      <div className="atlas-options">
        <h3>{selected.length} elementos selecionados</h3>
        <p className="atlas-hint">Arraste um dos elementos para mover o conjunto.</p>
        <Button onClick={onDuplicate}>
          <Copy size={16} />
          Duplicar seleção
        </Button>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={16} />
          Excluir seleção
        </Button>
        <Button variant="ghost" onClick={() => onSelect([])}>
          Limpar seleção
        </Button>
      </div>
    );
  const o = selected[0],
    layer = d.layers.find((l) => l.id === FEATURE_LAYER[o.kind])!,
    locked = o.locked || layer.locked;
  return (
    <div className="atlas-options">
      <div className="atlas-selection-kind">
        <strong>
          {o.kind === 'symbol'
            ? 'Símbolo'
            : o.kind === 'token'
              ? 'Token'
              : o.kind === 'route'
                ? 'Rota'
                : o.kind === 'region'
                  ? 'Região'
                  : 'Texto'}
        </strong>
        <span>{LAYER_NAMES[FEATURE_LAYER[o.kind]]}</span>
      </div>
      <div className="atlas-panel-actions">
        <Button variant="secondary" onClick={() => onChange({ ...o, locked: !o.locked })}>
          {o.locked ? <Unlock size={15} /> : <Lock size={15} />}{' '}
          {o.locked ? 'Desbloquear' : 'Bloquear'}
        </Button>
        <Button variant="ghost" onClick={() => onChange({ ...o, visible: !o.visible })}>
          {o.visible ? <EyeOff size={15} /> : <Eye size={15} />} {o.visible ? 'Ocultar' : 'Mostrar'}
        </Button>
      </div>
      {layer.locked && (
        <p className="atlas-hint">Desbloqueie a camada para editar as propriedades.</p>
      )}
      <fieldset disabled={locked} className="atlas-fieldset">
        <Field
          label="Nome do elemento"
          hint={
            o.kind === 'symbol'
              ? 'Nome de organização. Use Texto para criar uma legenda.'
              : undefined
          }
        >
          <Input
            maxLength={120}
            value={o.name}
            onChange={(e) => onChange({ ...o, name: e.target.value })}
          />
        </Field>
        <div className="atlas-two-fields">
          <NumberField
            label="Posição X"
            value={Math.round(o.x * 10) / 10}
            min={0}
            max={d.width}
            step={1}
            onChange={(x) => onChange({ ...o, x })}
          />
          <NumberField
            label="Posição Y"
            value={Math.round(o.y * 10) / 10}
            min={0}
            max={d.height}
            step={1}
            onChange={(y) => onChange({ ...o, y })}
          />
        </div>
        <Range
          label="Rotação"
          value={o.rotation}
          min={-180}
          max={180}
          onChange={(rotation) => onChange({ ...o, rotation })}
          suffix="°"
        />
        <Range
          label="Opacidade do elemento"
          value={o.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(opacity) => onChange({ ...o, opacity })}
        />
        {(o.kind === 'symbol' || o.kind === 'token') && (
          <>
            <Range
              label="Tamanho do elemento"
              value={o.size}
              min={o.kind === 'token' ? 16 : 8}
              max={o.kind === 'token' ? 256 : 512}
              onChange={(size) => onChange({ ...o, size })}
            />
            <ColorField
              label="Cor do elemento"
              value={o.color}
              onChange={(color) => onChange({ ...o, color })}
            />
          </>
        )}
        {o.kind === 'symbol' && (
          <Field label="Modelo do símbolo">
            <Select
              value={o.symbol}
              onChange={(e) => onChange({ ...o, symbol: e.target.value as SymbolId })}
            >
              {SYMBOLS.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {o.kind === 'token' && (
          <>
            <Field label="Ícone do token">
              <Select
                value={o.icon}
                onChange={(e) => onChange({ ...o, icon: e.target.value as TokenIcon })}
              >
                {TOKEN_ICONS.map((id) => (
                  <option key={id} value={id}>
                    {TOKEN_LABELS[id]}
                  </option>
                ))}
              </Select>
            </Field>
            <NumberField
              label="Número do elemento"
              value={o.number}
              min={0}
              max={999}
              onChange={(number) => onChange({ ...o, number })}
            />
            <Field label="Facção">
              <Select
                value={o.faction}
                onChange={(e) => onChange({ ...o, faction: e.target.value as TokenFeatureFaction })}
              >
                <option value="ally">Aliado</option>
                <option value="enemy">Inimigo</option>
                <option value="neutral">Neutro</option>
              </Select>
            </Field>
          </>
        )}
        {o.kind === 'label' && (
          <>
            <Field label="Conteúdo do texto">
              <Input
                maxLength={300}
                value={o.text}
                onChange={(e) =>
                  onChange({
                    ...o,
                    text: e.target.value || ' ',
                    name: e.target.value.slice(0, 120),
                  })
                }
              />
            </Field>
            <Range
              label="Tamanho da fonte"
              value={o.fontSize}
              min={8}
              max={144}
              onChange={(fontSize) => onChange({ ...o, fontSize })}
            />
            <ColorField
              label="Cor da fonte"
              value={o.color}
              onChange={(color) => onChange({ ...o, color })}
            />
            <Field label="Fonte">
              <Select
                value={o.font}
                onChange={(e) => onChange({ ...o, font: e.target.value as 'serif' | 'sans' })}
              >
                <option value="serif">Fantasia · serifada</option>
                <option value="sans">Legível · sem serifa</option>
              </Select>
            </Field>
            <Check
              label="Itálico"
              checked={o.italic}
              onChange={(italic) => onChange({ ...o, italic })}
            />
          </>
        )}
        {(o.kind === 'route' || o.kind === 'region') && (
          <>
            <p className="atlas-hint">
              {o.points.length} pontos. Arraste os pontos dourados no mapa para ajustar o traçado.
            </p>
            <ColorField
              label="Cor do contorno"
              value={o.color}
              onChange={(color) => onChange({ ...o, color })}
            />
            <Range
              label="Largura do contorno"
              value={o.width}
              min={1}
              max={o.kind === 'route' ? 64 : 32}
              onChange={(width) => onChange({ ...o, width })}
            />
            <Button
              variant="secondary"
              disabled={o.points.length <= (o.kind === 'route' ? 2 : 3)}
              onClick={() => onChange({ ...o, points: o.points.slice(0, -1) })}
            >
              Remover último ponto
            </Button>
          </>
        )}
        {o.kind === 'route' && (
          <>
            <Field label="Estilo da rota">
              <Select
                value={o.style}
                onChange={(e) => onChange({ ...o, style: e.target.value as RouteStyle })}
              >
                {Object.entries(ROUTES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Check
              label="Traçado curvo"
              checked={o.curved}
              onChange={(curved) => onChange({ ...o, curved })}
            />
            <p className="atlas-route-distance">
              Comprimento:{' '}
              <strong>
                {routeDistance(d, o.points, o.curved).toLocaleString('pt-BR', {
                  maximumFractionDigits: 2,
                })}{' '}
                {d.unit}
              </strong>
            </p>
          </>
        )}
        {o.kind === 'region' && (
          <>
            <ColorField
              label="Preenchimento da região"
              value={o.fill}
              onChange={(fill) => onChange({ ...o, fill })}
            />
            <Range
              label="Opacidade do preenchimento"
              value={o.fillOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(fillOpacity) => onChange({ ...o, fillOpacity })}
            />
          </>
        )}
      </fieldset>
      <div className="atlas-panel-actions">
        <Button variant="secondary" disabled={locked} onClick={onDuplicate}>
          <Copy size={15} />
          Duplicar
        </Button>
        <Button variant="danger" disabled={locked} onClick={onDelete}>
          <Trash2 size={15} />
          Excluir
        </Button>
      </div>
    </div>
  );
}
type TokenFeatureFaction = 'neutral' | 'ally' | 'enemy';

export function LayersPanel({
  document: d,
  onDocument,
  onSelect,
}: {
  document: AtlasDocument;
  onDocument(d: AtlasDocument, group?: string): void;
  onSelect(ids: string[]): void;
}) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(0);
  const results = [...d.objects]
    .reverse()
    .filter((o) =>
      (
        o.name ||
        (o.kind === 'label'
          ? o.text
          : o.kind === 'symbol'
            ? (SYMBOLS.find((s) => s[0] === o.symbol)?.[1] ?? 'Símbolo')
            : o.kind)
      )
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR')),
    );
  useEffect(() => setPage(0), [search]);
  useEffect(
    () => setPage((p) => Math.min(p, Math.max(0, Math.ceil(results.length / 10) - 1))),
    [results.length],
  );
  return (
    <div className="atlas-options">
      <p className="atlas-hint">
        As camadas do topo aparecem sobre as de baixo. Camadas ocultas não entram na imagem
        exportada.
      </p>
      <div className="atlas-layers">
        {[...d.layers].reverse().map((l) => {
          const index = d.layers.findIndex((v) => v.id === l.id);
          return (
            <div key={l.id} className="atlas-layer">
              <div>
                <strong>{LAYER_NAMES[l.id]}</strong>
                <div className="atlas-mini-actions">
                  <button
                    type="button"
                    title={l.visible ? 'Ocultar camada' : 'Mostrar camada'}
                    aria-label={`${l.visible ? 'Ocultar' : 'Mostrar'} ${LAYER_NAMES[l.id]}`}
                    onClick={() =>
                      onDocument({
                        ...d,
                        layers: d.layers.map((v) =>
                          v.id === l.id ? { ...v, visible: !v.visible } : v,
                        ),
                      })
                    }
                  >
                    {l.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    type="button"
                    title={l.locked ? 'Desbloquear camada' : 'Bloquear camada'}
                    aria-label={`${l.locked ? 'Desbloquear' : 'Bloquear'} ${LAYER_NAMES[l.id]}`}
                    onClick={() =>
                      onDocument({
                        ...d,
                        layers: d.layers.map((v) =>
                          v.id === l.id ? { ...v, locked: !v.locked } : v,
                        ),
                      })
                    }
                  >
                    {l.locked ? <Lock size={15} /> : <Unlock size={15} />}
                  </button>
                  <button
                    type="button"
                    disabled={index === d.layers.length - 1}
                    aria-label={`Subir ${LAYER_NAMES[l.id]}`}
                    onClick={() => {
                      const layers = [...d.layers];
                      [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
                      onDocument({ ...d, layers });
                    }}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Descer ${LAYER_NAMES[l.id]}`}
                    onClick={() => {
                      const layers = [...d.layers];
                      [layers[index], layers[index - 1]] = [layers[index - 1], layers[index]];
                      onDocument({ ...d, layers });
                    }}
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              </div>
              <Range
                label={`Opacidade de ${LAYER_NAMES[l.id]}`}
                value={l.opacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(opacity) =>
                  onDocument(
                    { ...d, layers: d.layers.map((v) => (v.id === l.id ? { ...v, opacity } : v)) },
                    `layer:${l.id}:opacity`,
                  )
                }
              />
            </div>
          );
        })}
      </div>
      <details className="atlas-disclosure">
        <summary>
          Elementos do mapa <span>{d.objects.length}</span>
        </summary>
        <div className="atlas-options">
          <Input
            aria-label="Buscar elemento no mapa"
            placeholder="Buscar elemento"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="atlas-element-list">
            {results.slice(page * 10, page * 10 + 10).map((o) => (
              <button type="button" key={o.id} onClick={() => onSelect([o.id])}>
                <span>
                  {o.name ||
                    (o.kind === 'symbol'
                      ? SYMBOLS.find((s) => s[0] === o.symbol)?.[1]
                      : o.kind === 'token'
                        ? TOKEN_LABELS[o.icon]
                        : o.kind === 'label'
                          ? o.text
                          : o.kind === 'region'
                            ? 'Região'
                            : 'Rota')}
                </span>
                {o.locked && <Lock size={12} />} {!o.visible && <EyeOff size={12} />}
              </button>
            ))}
          </div>
          {!results.length && <p className="atlas-hint">Nenhum elemento encontrado.</p>}
          {results.length > 10 && (
            <div className="atlas-pagination">
              <button
                type="button"
                aria-label="Elementos anteriores"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {page + 1} / {Math.ceil(results.length / 10)}
              </span>
              <button
                type="button"
                aria-label="Próximos elementos"
                disabled={(page + 1) * 10 >= results.length}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

export function MapPanel({
  document: d,
  onDocument,
  onResize,
}: {
  document: AtlasDocument;
  onDocument(d: AtlasDocument, group?: string): void;
  onResize(): void;
}) {
  return (
    <div className="atlas-options">
      <Field label="Nome do mapa">
        <Input
          maxLength={120}
          value={d.title}
          onChange={(e) => onDocument({ ...d, title: e.target.value }, 'title')}
        />
      </Field>
      <Field label="Estilo do papel">
        <Select
          value={d.theme}
          onChange={(e) => onDocument({ ...d, theme: e.target.value as AtlasDocument['theme'] })}
        >
          <option value="parchment">Pergaminho</option>
          <option value="natural">Natural</option>
          <option value="night">Noturno</option>
          <option value="blueprint">Planta arquitetônica</option>
        </Select>
      </Field>
      <Check
        label="Mostrar relevo"
        checked={d.relief}
        onChange={(relief) => onDocument({ ...d, relief })}
      />
      <Check
        label="Rosa dos ventos"
        checked={d.compass}
        onChange={(compass) => onDocument({ ...d, compass })}
      />
      <Check
        label="Barra de escala"
        checked={d.scaleBar}
        onChange={(scaleBar) => onDocument({ ...d, scaleBar })}
      />
      <Field label="Grade do mapa">
        <Select
          value={d.grid}
          onChange={(e) => onDocument({ ...d, grid: e.target.value as AtlasDocument['grid'] })}
        >
          <option value="none">Sem grade</option>
          <option value="square">Quadrada</option>
          <option value="hex">Hexagonal</option>
        </Select>
      </Field>
      {d.grid !== 'none' && (
        <>
          <ColorField
            label="Cor da grade"
            value={d.gridColor}
            onChange={(gridColor) => onDocument({ ...d, gridColor }, 'gridColor')}
          />
          <Range
            label="Opacidade da grade"
            value={d.gridOpacity}
            min={0}
            max={0.8}
            step={0.05}
            onChange={(gridOpacity) => onDocument({ ...d, gridOpacity }, 'gridOpacity')}
          />
        </>
      )}
      <div className="atlas-two-fields">
        <Field label="Unidade de distância">
          <Select
            value={d.unit}
            onChange={(e) => onDocument({ ...d, unit: e.target.value as AtlasDocument['unit'] })}
          >
            <option value="km">Quilômetros</option>
            <option value="m">Metros</option>
            <option value="mi">Milhas</option>
          </Select>
        </Field>
        <NumberField
          label="Distância por célula"
          value={d.distancePerCell}
          min={0.01}
          max={10000}
          step={0.01}
          onChange={(distancePerCell) => onDocument({ ...d, distancePerCell })}
        />
      </div>
      <p className="atlas-hint">
        Cada célula de terreno mede {CELL} unidades de desenho. A régua e as rotas usam a escala
        acima.
      </p>
      <details className="atlas-disclosure">
        <summary>Notas do mestre</summary>
        <Field
          label="Notas privadas"
          hint="Estas notas ficam na oficina. O backup editável inclui as notas; a imagem PNG não as inclui."
        >
          <Textarea
            maxLength={12000}
            value={d.notes}
            onChange={(e) => onDocument({ ...d, notes: e.target.value }, 'notes')}
            rows={7}
          />
        </Field>
      </details>
      <details className="atlas-disclosure">
        <summary>Dimensões e paleta</summary>
        <div className="atlas-options">
          <p className="atlas-hint">
            {d.width} × {d.height} · {d.objects.length} elementos
          </p>
          <Button variant="secondary" onClick={onResize}>
            Redimensionar mapa
          </Button>
          <Button
            variant="ghost"
            onClick={() => onDocument({ ...d, palette: TERRAINS.map((t) => t.color) })}
          >
            Restaurar cores dos terrenos
          </Button>
          <small className="atlas-hint">Semente original: {d.seed || 'sem semente'}</small>
        </div>
      </details>
    </div>
  );
}
