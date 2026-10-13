import { MAX_SCENERY_SIZE, sceneryDimensions, normalizeSceneryHeight } from './scenery-dimensions';
import type { BattleMapCell, BattleMapObject, GridPoint } from './types';
import { normalizeSceneryStyle, type SceneryStyle } from './scenery-styles';

export const SCENERY = [
  { id: 'tree', name: 'Árvore', symbol: '🌳', blocks: true, cost: 1 },
  { id: 'pine', name: 'Pinheiro', symbol: '🌲', blocks: true, cost: 1 },
  { id: 'rock', name: 'Pedra', symbol: '🪨', blocks: true, cost: 1 },
  { id: 'mountain', name: 'Montanha', symbol: '🏔️', blocks: true, cost: 1 },
  { id: 'ruin', name: 'Ruínas', symbol: '🏛️', blocks: true, cost: 1 },
  { id: 'water', name: 'Água', symbol: '🌊', blocks: false, cost: 2 },
  { id: 'fire', name: 'Fogo', symbol: '🔥', blocks: false, cost: 1 },
  { id: 'tent', name: 'Tenda', symbol: '⛺', blocks: true, cost: 1 },
  { id: 'road', name: 'Estrada', symbol: '🛤️', blocks: false, cost: 1 },
  { id: 'cart', name: 'Carroça', symbol: '🛒', blocks: true, cost: 1 },
  { id: 'ice', name: 'Gelo', symbol: '❄️', blocks: false, cost: 2 },
  { id: 'pit', name: 'Buraco', symbol: '🕳️', blocks: true, cost: 1 },
  { id: 'portal', name: 'Portal', symbol: '🌀', blocks: false, cost: 1 },
  { id: 'lava', name: 'Lava', symbol: '🌋', blocks: false, cost: 1 },
  { id: 'barrel', name: 'Barril', symbol: '🛢️', blocks: true, cost: 1 },
  { id: 'campfire', name: 'Fogueira', symbol: '🔥', blocks: false, cost: 1 },
  { id: 'boat', name: 'Barco', symbol: '⛵', blocks: true, cost: 1 },
  { id: 'bush', name: 'Arbusto', symbol: '🌿', blocks: true, cost: 1 },
  { id: 'flowers', name: 'Flores', symbol: '🌸', blocks: false, cost: 1 },
  { id: 'statue', name: 'Obelisco', symbol: '▴', blocks: true, cost: 1 },
  { id: 'chest', name: 'Baú', symbol: '📦', blocks: true, cost: 1 },
  { id: 'counter', name: 'Balcão', symbol: '🪵', blocks: true, cost: 1 },
  { id: 'crops', name: 'Plantação', symbol: '🌾', blocks: false, cost: 2 },
  { id: 'house', name: 'Casa medieval', symbol: '🏠', blocks: true, cost: 1 },
  { id: 'gravestone', name: 'Lápide', symbol: '🪦', blocks: true, cost: 1 },
  { id: 'cross', name: 'Cruz', symbol: '✝️', blocks: true, cost: 1 },
  { id: 'fence', name: 'Cerca', symbol: '🪵', blocks: true, cost: 1 },
  { id: 'grass', name: 'Grama', symbol: '🌱', blocks: false, cost: 1 },
  { id: 'well', name: 'Poço', symbol: '🪣', blocks: true, cost: 1 },
  { id: 'bridge', name: 'Ponte', symbol: '🌉', blocks: false, cost: 1 },
  { id: 'table', name: 'Mesa de taverna', symbol: '🍺', blocks: true, cost: 1 },
  { id: 'chair', name: 'Cadeira', symbol: '🪑', blocks: true, cost: 1 },
  { id: 'bookshelf', name: 'Estante', symbol: '📚', blocks: true, cost: 1 },
  { id: 'torch', name: 'Tocha', symbol: '🔥', blocks: false, cost: 1 },
  { id: 'market', name: 'Banca de feira', symbol: '🏪', blocks: true, cost: 1 },
  { id: 'signpost', name: 'Placa', symbol: '🪧', blocks: true, cost: 1 },
  { id: 'tavern', name: 'Taverna', symbol: '🍻', blocks: true, cost: 1 },
  { id: 'forge', name: 'Forja', symbol: '⚒️', blocks: true, cost: 1 },
  { id: 'stable', name: 'Estábulo', symbol: '🐎', blocks: true, cost: 1 },
  { id: 'wall', name: 'Parede', symbol: '🧱', blocks: true, cost: 1 },
  { id: 'floor', name: 'Piso', symbol: '⬜', blocks: false, cost: 1 },
  { id: 'stairs', name: 'Escadaria', symbol: '🪜', blocks: false, cost: 2 },
  { id: 'bed', name: 'Cama', symbol: '🛏️', blocks: true, cost: 1 },
  { id: 'rug', name: 'Tapete', symbol: '🟫', blocks: false, cost: 1 },
  { id: 'doorway', name: 'Passagem', symbol: '🚪', blocks: false, cost: 1 },
  { id: 'fountain', name: 'Fonte', symbol: '⛲', blocks: true, cost: 1 },
  { id: 'door', name: 'Porta de masmorra', symbol: '🚪', blocks: true, cost: 1 },
  { id: 'portcullis', name: 'Grade levadiça', symbol: '⛓️', blocks: true, cost: 1 },
  { id: 'pillar', name: 'Pilar', symbol: '🏛️', blocks: true, cost: 1 },
  { id: 'altar', name: 'Altar', symbol: '🕯️', blocks: true, cost: 1 },
  { id: 'sarcophagus', name: 'Sarcófago', symbol: '⚰️', blocks: true, cost: 1 },
  { id: 'cage', name: 'Cela de prisão', symbol: '🔒', blocks: true, cost: 1 },
  { id: 'weaponrack', name: 'Suporte de armas', symbol: '⚔️', blocks: true, cost: 1 },
  { id: 'lever', name: 'Alavanca', symbol: '⚙️', blocks: false, cost: 1 },
  { id: 'trap', name: 'Armadilha', symbol: '⚠️', blocks: false, cost: 2 },
  { id: 'treasure', name: 'Pilha de tesouro', symbol: '💰', blocks: false, cost: 1 },
  { id: 'rubble', name: 'Entulho', symbol: '🪨', blocks: false, cost: 2 },
  { id: 'web', name: 'Teia de aranha', symbol: '🕸️', blocks: false, cost: 2 },
  { id: 'stalagmite', name: 'Estalagmite', symbol: '⛰️', blocks: true, cost: 1 },
  { id: 'ladder', name: 'Escada de mão', symbol: '🪜', blocks: false, cost: 2 },
  { id: 'magiccircle', name: 'Círculo ritual', symbol: '🔮', blocks: false, cost: 1 },
  { id: 'barricade', name: 'Barricada', symbol: '🪵', blocks: true, cost: 1 },
] as const;
export type SceneryKind = (typeof SCENERY)[number]['id'];
export const SCENERY_GROUPS = [
  {
    id: 'dungeon',
    name: 'Masmorra',
    kinds: [
      'door',
      'portcullis',
      'pillar',
      'altar',
      'sarcophagus',
      'cage',
      'weaponrack',
      'lever',
      'trap',
      'treasure',
      'rubble',
      'web',
      'stalagmite',
      'ladder',
      'magiccircle',
      'barricade',
    ],
  },
  {
    id: 'nature',
    name: 'Natureza',
    kinds: ['tree', 'pine', 'rock', 'mountain', 'bush', 'flowers', 'crops', 'grass'],
  },
  {
    id: 'buildings',
    name: 'Construções',
    kinds: [
      'house',
      'tavern',
      'forge',
      'stable',
      'tent',
      'ruin',
      'wall',
      'doorway',
      'well',
      'fountain',
      'market',
    ],
  },
  {
    id: 'interiors',
    name: 'Interiores',
    kinds: [
      'floor',
      'stairs',
      'bed',
      'rug',
      'table',
      'chair',
      'counter',
      'bookshelf',
      'chest',
      'barrel',
      'torch',
    ],
  },
  { id: 'paths', name: 'Caminhos', kinds: ['road', 'bridge', 'fence', 'cart', 'boat', 'signpost'] },
  {
    id: 'hazards',
    name: 'Perigos e magia',
    kinds: [
      'water',
      'fire',
      'ice',
      'pit',
      'portal',
      'lava',
      'campfire',
      'statue',
      'gravestone',
      'cross',
    ],
  },
] as const;
export function scenerySize(
  kind: SceneryKind,
  variant = 'default',
): { width: number; height: number } {
  const { width, height } = sceneryDimensions(kind, variant);
  return { width, height };
}
export interface SceneryBrush {
  kind: SceneryKind;
  width: number;
  height: number;
  rotation: number;
  blocks: boolean;
  blocksVision?: boolean;
  name?: string;
  cost: number;
  portalCode?: string;
  variant?: string;
  color?: string;
  style?: SceneryStyle;
  heightMetres?: number;
  lightEnabled?: boolean;
  lightRadiusMetres?: number;
}
export const SCENERY_VARIANTS: Partial<
  Record<SceneryKind, readonly { id: string; name: string }[]>
> = {
  door: [
    { id: 'open', name: 'Porta de madeira aberta' },
    { id: 'iron', name: 'Porta de ferro' },
    { id: 'iron-open', name: 'Porta de ferro aberta' },
  ],
  portcullis: [{ id: 'open', name: 'Grade erguida' }],
  pillar: [{ id: 'broken', name: 'Pilar quebrado' }],
  altar: [{ id: 'arcane', name: 'Altar arcano' }],
  sarcophagus: [{ id: 'open', name: 'Sarcófago aberto' }],
  cage: [{ id: 'open', name: 'Cela aberta' }],
  weaponrack: [{ id: 'armor', name: 'Suporte de armadura' }],
  lever: [{ id: 'activated', name: 'Alavanca acionada' }],
  trap: [
    { id: 'runes', name: 'Armadilha rúnica' },
    { id: 'disarmed', name: 'Armadilha desarmada' },
  ],
  treasure: [{ id: 'gems', name: 'Tesouro com gemas' }],
  stalagmite: [{ id: 'crystal', name: 'Estalagmite de cristal' }],
  ladder: [{ id: 'rope', name: 'Escada de corda' }],
  magiccircle: [
    { id: 'summoning', name: 'Círculo de invocação' },
    { id: 'spent', name: 'Círculo apagado' },
  ],
  barricade: [{ id: 'spikes', name: 'Barricada de estacas' }],
  portal: [
    { id: 'door', name: 'Porta' },
    { id: 'cave', name: 'Entrada de caverna' },
  ],
  ice: [{ id: 'snow', name: 'Neve' }],
  boat: [{ id: 'ship', name: 'Navio' }],
  barrel: [{ id: 'crate', name: 'Caixote' }],
  campfire: [{ id: 'brazier', name: 'Braseiro' }],
  bush: [
    { id: 'thorn', name: 'Arbusto espinhoso' },
    { id: 'desert', name: 'Arbusto do deserto' },
    { id: 'frost', name: 'Arbusto congelado' },
  ],
  flowers: [
    { id: 'mushrooms', name: 'Cogumelos' },
    { id: 'roses', name: 'Rosas' },
    { id: 'sunflowers', name: 'Girassóis' },
    { id: 'lavender', name: 'Lavanda' },
    { id: 'dead', name: 'Flores secas' },
  ],
  chest: [{ id: 'open', name: 'Baú aberto' }],
  tree: [{ id: 'autumn', name: 'Árvore de outono' }],
  rock: [
    { id: 'crystal', name: 'Cristais' },
    { id: 'boulder', name: 'Rocha grande' },
    { id: 'pile', name: 'Pedregulhos' },
    { id: 'moss', name: 'Pedra com musgo' },
    { id: 'desert', name: 'Rocha do deserto' },
    { id: 'ice', name: 'Rocha congelada' },
  ],
  road: [{ id: 'cobblestone', name: 'Estrada de pedra' }],
  mountain: [
    { id: 'snowy', name: 'Montanha nevada' },
    { id: 'desert', name: 'Montanha árida' },
    { id: 'volcano', name: 'Vulcão' },
  ],
  ruin: [
    { id: 'wall', name: 'Muro em ruínas' },
    { id: 'arch', name: 'Arco antigo' },
    { id: 'columns', name: 'Colunas quebradas' },
    { id: 'temple', name: 'Templo em ruínas' },
  ],
  cart: [
    { id: 'covered', name: 'Carroça coberta' },
    { id: 'goods', name: 'Carroça de mercadorias' },
    { id: 'broken', name: 'Carroça quebrada' },
  ],
  tent: [
    { id: 'pavilion', name: 'Pavilhão' },
    { id: 'desert', name: 'Tenda do deserto' },
    { id: 'war', name: 'Tenda de guerra' },
  ],
  counter: [
    { id: 'stone', name: 'Balcão de pedra' },
    { id: 'merchant', name: 'Balcão de mercador' },
  ],
  crops: [
    { id: 'vegetables', name: 'Horta' },
    { id: 'pumpkins', name: 'Abóboras' },
    { id: 'corn', name: 'Milho' },
    { id: 'vineyard', name: 'Videiras' },
  ],
  house: [
    { id: 'cottage', name: 'Chalé de palha' },
    { id: 'inn', name: 'Estalagem' },
    { id: 'tower', name: 'Torre de vigia' },
    { id: 'timber', name: 'Casa enxaimel' },
    { id: 'stone', name: 'Casa de pedra' },
    { id: 'manor', name: 'Solar nobre' },
    { id: 'desert', name: 'Casa do deserto' },
    { id: 'ruined', name: 'Casa abandonada' },
  ],
  tavern: [
    { id: 'port', name: 'Taverna do porto' },
    { id: 'stone', name: 'Taverna de pedra' },
    { id: 'open', name: 'Taverna aberta · interior' },
  ],
  forge: [{ id: 'covered', name: 'Ferraria coberta' }],
  stable: [{ id: 'open', name: 'Estábulo aberto' }],
  wall: [
    { id: 'timber', name: 'Parede de madeira' },
    { id: 'brick', name: 'Parede de tijolos' },
    { id: 'low', name: 'Mureta baixa' },
  ],
  floor: [
    { id: 'wood', name: 'Assoalho' },
    { id: 'tile', name: 'Piso de mosaico' },
  ],
  stairs: [{ id: 'stone', name: 'Escada de pedra' }],
  bed: [
    { id: 'bunk', name: 'Beliche' },
    { id: 'royal', name: 'Cama com dossel' },
  ],
  rug: [
    { id: 'round', name: 'Tapete circular' },
    { id: 'royal', name: 'Tapete bordado' },
  ],
  doorway: [
    { id: 'arch', name: 'Arco de pedra' },
    { id: 'iron', name: 'Portão de ferro' },
  ],
  fountain: [
    { id: 'dry', name: 'Fonte seca' },
    { id: 'ornate', name: 'Fonte ornamental' },
  ],
  gravestone: [
    { id: 'ornate', name: 'Lápide ornamentada' },
    { id: 'broken', name: 'Lápide quebrada' },
  ],
  cross: [
    { id: 'stone', name: 'Cruz de pedra' },
    { id: 'rune', name: 'Cruz rúnica' },
  ],
  fence: [
    { id: 'stone', name: 'Mureta de pedra' },
    { id: 'palisade', name: 'Paliçada' },
    { id: 'iron', name: 'Grade de ferro' },
  ],
  grass: [
    { id: 'tall', name: 'Grama alta' },
    { id: 'dry', name: 'Grama seca' },
  ],
  well: [
    { id: 'roofed', name: 'Poço coberto' },
    { id: 'ruined', name: 'Poço abandonado' },
  ],
  bridge: [
    { id: 'stone', name: 'Ponte de pedra' },
    { id: 'rope', name: 'Ponte de corda' },
  ],
  table: [
    { id: 'round', name: 'Mesa redonda' },
    { id: 'feast', name: 'Mesa de banquete' },
  ],
  chair: [
    { id: 'throne', name: 'Trono' },
    { id: 'stool', name: 'Banqueta' },
  ],
  bookshelf: [
    { id: 'scrolls', name: 'Estante de pergaminhos' },
    { id: 'potions', name: 'Estante de poções' },
  ],
  torch: [
    { id: 'lantern', name: 'Lanterna' },
    { id: 'arcane', name: 'Luz arcana' },
  ],
  market: [
    { id: 'produce', name: 'Banca de alimentos' },
    { id: 'weapons', name: 'Banca de armas' },
  ],
  signpost: [
    { id: 'forked', name: 'Placa de direções' },
    { id: 'banner', name: 'Estandarte' },
  ],
};
export function sceneryMatches(kind: SceneryKind, query: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  return normalize(
    [
      SCENERY.find((s) => s.id === kind)?.name,
      ...(SCENERY_VARIANTS[kind] ?? []).map((v) => v.name),
    ].join(' '),
  ).includes(normalize(query.trim()));
}
export function sceneryVariant(kind: string, value: unknown) {
  if (kind === 'statue') return 'obelisk';
  return SCENERY_VARIANTS[kind as SceneryKind]?.some((v) => v.id === value)
    ? String(value)
    : 'default';
}
/** Low furniture can obstruct movement without hiding everything behind it. */
export function sceneryDefaults(kind: string, variant = 'default') {
  const entry = SCENERY.find((s) => s.id === kind);
  const open = ['open', 'iron-open'].includes(variant);
  const blocks =
    ['door', 'portcullis', 'cage'].includes(kind) && open ? false : (entry?.blocks ?? false);
  const blocksVision =
    [
      'tree',
      'pine',
      'mountain',
      'ruin',
      'tent',
      'house',
      'tavern',
      'forge',
      'stable',
      'wall',
      'bookshelf',
      'door',
      'pillar',
      'stalagmite',
    ].includes(kind) &&
    !(kind === 'wall' && variant === 'low') &&
    !(kind === 'pillar' && variant === 'broken') &&
    !(kind === 'door' && open);
  return {
    blocks,
    blocksVision,
    cost: kind === 'trap' && variant === 'disarmed' ? 1 : (entry?.cost ?? 1),
  };
}
export function sceneryInteraction(object: Pick<BattleMapObject, 'object_type' | 'metadata'>) {
  const variant = sceneryVariant(object.object_type, object.metadata.variant);
  const open = ['open', 'iron-open'].includes(variant);
  switch (object.object_type) {
    case 'door':
      return {
        label: open ? 'Fechar porta' : 'Abrir porta',
        variant: variant.startsWith('iron')
          ? open
            ? 'iron'
            : 'iron-open'
          : open
            ? 'default'
            : 'open',
      };
    case 'portcullis':
      return { label: open ? 'Baixar grade' : 'Erguer grade', variant: open ? 'default' : 'open' };
    case 'cage':
      return { label: open ? 'Fechar cela' : 'Abrir cela', variant: open ? 'default' : 'open' };
    case 'chest':
      return { label: open ? 'Fechar baú' : 'Abrir baú', variant: open ? 'default' : 'open' };
    case 'sarcophagus':
      return {
        label: open ? 'Fechar sarcófago' : 'Abrir sarcófago',
        variant: open ? 'default' : 'open',
      };
    case 'lever':
      return {
        label: variant === 'activated' ? 'Repor alavanca' : 'Acionar alavanca',
        variant: variant === 'activated' ? 'default' : 'activated',
      };
    default:
      return null;
  }
}
export function normalizeSceneryColor(value: unknown) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : undefined;
}
export function normalizeSceneryLightRadius(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 60
    ? value
    : undefined;
}
export function sceneryAppearance(
  brush: Pick<
    SceneryBrush,
    | 'kind'
    | 'variant'
    | 'color'
    | 'style'
    | 'heightMetres'
    | 'lightEnabled'
    | 'lightRadiusMetres'
    | 'name'
  >,
  metadata: Record<string, unknown> = {},
) {
  const result = { ...metadata };
  if (brush.name !== undefined) {
    delete result.name;
    if (brush.name.trim()) result.name = brush.name.trim().slice(0, 80);
  }
  delete result.variant;
  delete result.color;
  delete result.style;
  delete result.height_metres;
  delete result.light_enabled;
  delete result.light_radius;
  result.variant = sceneryVariant(brush.kind, brush.variant);
  const color = normalizeSceneryColor(brush.color);
  if (color) result.color = color;
  const style = normalizeSceneryStyle(brush.style);
  if (style !== 'original') result.style = style;
  const height = normalizeSceneryHeight(brush.heightMetres);
  if (height !== undefined) result.height_metres = height;
  if (typeof brush.lightEnabled === 'boolean') result.light_enabled = brush.lightEnabled;
  const radius = normalizeSceneryLightRadius(brush.lightRadiusMetres);
  if (radius !== undefined) result.light_radius = radius;
  return result;
}
export function sceneryLabel(object: Pick<BattleMapObject, 'object_type' | 'metadata'>) {
  if (typeof object.metadata.name === 'string' && object.metadata.name.trim())
    return object.metadata.name.trim().slice(0, 80);
  return (
    SCENERY_VARIANTS[object.object_type as SceneryKind]?.find(
      (v) => v.id === object.metadata.variant,
    )?.name ??
    SCENERY.find((s) => s.id === object.object_type)?.name ??
    object.object_type
  );
}
export const DEFAULT_BRUSH: SceneryBrush = {
  kind: 'tree',
  ...scenerySize('tree'),
  rotation: 0,
  blocks: true,
  blocksVision: true,
  cost: 1,
};
export function sceneryRect(object: BattleMapObject) {
  const g = object.geometry;
  if (!SCENERY.some((v) => v.id === object.object_type)) return null;
  const [x, y, width, height] = [g.x, g.y, g.width, g.height].map(Number);
  if (
    ![x, y, width, height].every(Number.isInteger) ||
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1 ||
    width > MAX_SCENERY_SIZE ||
    height > MAX_SCENERY_SIZE
  )
    return null;
  return { x, y, width, height, rotation: Number(g.rotation) || 0 };
}
export function sceneryAtCell(objects: BattleMapObject[], point: GridPoint) {
  return (
    sceneryStack(objects)
      .reverse()
      .find((o) => {
        const r = sceneryRect(o);
        return (
          r &&
          point.x >= r.x &&
          point.x < r.x + r.width &&
          point.y >= r.y &&
          point.y < r.y + r.height
        );
      }) ?? null
  );
}
export function sceneryStack(objects: BattleMapObject[]) {
  const layer = (kind: string) =>
    ['water', 'ice', 'lava', 'grass'].includes(kind)
      ? -4
      : ['road', 'floor'].includes(kind)
        ? -3
        : kind === 'rug'
          ? -1
          : ['trap', 'web', 'magiccircle', 'rubble'].includes(kind)
            ? -0.5
            : 0;
  return [...objects].sort((a, b) => a.z - b.z || layer(a.object_type) - layer(b.object_type));
}
// Preserve painted terrain underneath decorations. Removing an object restores it automatically.
export function sceneryMovementCells(cells: BattleMapCell[], objects: BattleMapObject[]) {
  if (!objects.length) return cells;
  const result = new Map(cells.map((c) => [`${c.x}:${c.y}:${c.z}`, c]));
  for (const object of objects) {
    const r = sceneryRect(object);
    if (!r) continue;
    const cost = Math.min(10, Math.max(1, Number(object.metadata.movement_cost) || 1));
    if (!object.blocks_movement && cost === 1) continue;
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) {
        const key = `${x}:${y}:${object.z}`,
          old = result.get(key);
        result.set(key, {
          id: old?.id ?? `${object.id}:${key}`,
          map_id: object.map_id,
          x,
          y,
          z: object.z,
          terrain_type: old?.terrain_type ?? object.object_type,
          movement_cost: Math.max(old?.movement_cost ?? 1, cost),
          blocked: !!old?.blocked || object.blocks_movement,
          metadata: old?.metadata ?? {},
          created_at: old?.created_at ?? object.created_at,
          updated_at: object.updated_at,
        });
      }
  }
  return [...result.values()];
}
export function makeScenery(mapId: string, point: GridPoint, brush: SceneryBrush) {
  return {
    map_id: mapId,
    object_type: brush.kind,
    geometry: {
      x: point.x,
      y: point.y,
      width: brush.width,
      height: brush.height,
      rotation: brush.rotation,
    },
    z: 0,
    blocks_movement: brush.kind === 'portal' ? false : brush.blocks,
    blocks_vision:
      brush.kind === 'portal'
        ? false
        : (brush.blocksVision ?? sceneryDefaults(brush.kind, brush.variant).blocksVision),
    visible: true,
    metadata: {
      ...sceneryAppearance(brush),
      movement_cost: brush.kind === 'portal' ? 1 : brush.cost,
      ...(brush.kind === 'portal'
        ? { portal_code: normalizePortalCode(brush.portalCode ?? '') }
        : {}),
    },
  };
}

export function sceneryPreview(
  map: { width: number; height: number },
  point: GridPoint | null,
  brush?: SceneryBrush | null,
): import('./effects').EffectPreview | null {
  if (!point || !brush) return null;
  const width = Math.min(MAX_SCENERY_SIZE, Math.max(1, Math.floor(brush.width) || 1)),
    height = Math.min(MAX_SCENERY_SIZE, Math.max(1, Math.floor(brush.height) || 1));
  const cells: GridPoint[] = [];
  for (let y = point.y; y < point.y + height; y++)
    for (let x = point.x; x < point.x + width; x++)
      if (
        x >= 0 &&
        y >= 0 &&
        x < map.width &&
        y < map.height &&
        (width * height <= 1024 ||
          x === point.x ||
          x === point.x + width - 1 ||
          y === point.y ||
          y === point.y + height - 1)
      )
        cells.push({ x, y });
  return {
    cells,
    target: point,
    affected: [],
    kind: 'utility',
    valid:
      point.x >= 0 &&
      point.y >= 0 &&
      Number.isInteger(brush.width) &&
      Number.isInteger(brush.height) &&
      brush.width >= 1 &&
      brush.height >= 1 &&
      brush.width <= MAX_SCENERY_SIZE &&
      brush.height <= MAX_SCENERY_SIZE &&
      point.x + width <= map.width &&
      point.y + height <= map.height,
  };
}

export function normalizePortalCode(code: string) {
  return code.trim().toUpperCase();
}
export function portalForToken(
  objects: BattleMapObject[],
  token: { x: number; y: number; size: number },
) {
  return (
    objects.find((o) => {
      const r = sceneryRect(o);
      return (
        o.object_type === 'portal' &&
        o.visible &&
        r &&
        token.x >= r.x &&
        token.y >= r.y &&
        token.x + token.size <= r.x + r.width &&
        token.y + token.size <= r.y + r.height
      );
    }) ?? null
  );
}
