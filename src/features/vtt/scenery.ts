import type { BattleMapCell, BattleMapObject, GridPoint } from './types';

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
  { id: 'statue', name: 'Estátua', symbol: '🗿', blocks: true, cost: 1 },
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
] as const;
export type SceneryKind = (typeof SCENERY)[number]['id'];
export interface SceneryBrush {
  kind: SceneryKind;
  width: number;
  height: number;
  rotation: number;
  blocks: boolean;
  cost: number;
  portalCode?: string;
  variant?: string;
  color?: string;
}
export const SCENERY_VARIANTS: Partial<
  Record<SceneryKind, readonly { id: string; name: string }[]>
> = {
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
  statue: [{ id: 'obelisk', name: 'Obelisco' }],
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
  return SCENERY_VARIANTS[kind as SceneryKind]?.some((v) => v.id === value)
    ? String(value)
    : 'default';
}
export function normalizeSceneryColor(value: unknown) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : undefined;
}
export function sceneryAppearance(
  brush: Pick<SceneryBrush, 'kind' | 'variant' | 'color'>,
  metadata: Record<string, unknown> = {},
) {
  const result = { ...metadata };
  delete result.variant;
  delete result.color;
  result.variant = sceneryVariant(brush.kind, brush.variant);
  const color = normalizeSceneryColor(brush.color);
  if (color) result.color = color;
  return result;
}
export function sceneryLabel(object: Pick<BattleMapObject, 'object_type' | 'metadata'>) {
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
  width: 1,
  height: 1,
  rotation: 0,
  blocks: true,
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
    width > 8 ||
    height > 8
  )
    return null;
  return { x, y, width, height, rotation: Number(g.rotation) || 0 };
}
export function sceneryAtCell(objects: BattleMapObject[], point: GridPoint) {
  return (
    [...objects].reverse().find((o) => {
      const r = sceneryRect(o);
      return (
        r && point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height
      );
    }) ?? null
  );
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
    blocks_vision: brush.blocks,
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
  const width = Math.min(8, Math.max(1, Math.floor(brush.width) || 1)),
    height = Math.min(8, Math.max(1, Math.floor(brush.height) || 1));
  const cells: GridPoint[] = [];
  for (let y = point.y; y < point.y + height; y++)
    for (let x = point.x; x < point.x + width; x++)
      if (x < map.width && y < map.height) cells.push({ x, y });
  return {
    cells,
    target: point,
    affected: [],
    kind: 'utility',
    valid: point.x + width <= map.width && point.y + height <= map.height,
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
