import type { SceneryKind } from './scenery';

export const MAX_SCENERY_SIZE = 128;
export const DEFAULT_CELL_METRES = 1.5;
// Footprints are grid cells; the third dimension is physical height in metres.
// These values describe occupied scenery, rather than a creature's token size.
type Dimensions = readonly [width: number, depth: number, heightMetres: number];
const defaults: Record<SceneryKind, Dimensions> = {
  tree: [3, 3, 7],
  pine: [3, 3, 10],
  rock: [1, 1, 1.1],
  mountain: [32, 28, 38],
  ruin: [6, 5, 4],
  water: [8, 6, 0.08],
  fire: [2, 2, 1.2],
  tent: [2, 2, 2.2],
  road: [3, 8, 0.045],
  cart: [2, 3, 1.6],
  ice: [6, 6, 0.12],
  pit: [3, 3, 0.16],
  portal: [2, 1, 3.2],
  lava: [8, 6, 0.09],
  barrel: [1, 1, 1],
  campfire: [1, 1, 0.8],
  boat: [2, 4, 1.2],
  bush: [1, 1, 1.2],
  flowers: [2, 2, 0.55],
  statue: [2, 2, 5],
  chest: [1, 1, 0.7],
  counter: [2, 1, 1.1],
  crops: [8, 6, 1.2],
  house: [6, 5, 6.3],
  gravestone: [1, 1, 1.1],
  cross: [1, 1, 1.7],
  fence: [4, 1, 1.3],
  grass: [4, 4, 0.2],
  well: [2, 2, 1.8],
  bridge: [3, 6, 1.3],
  table: [2, 1, 0.8],
  chair: [1, 1, 1],
  bookshelf: [2, 1, 2.1],
  torch: [1, 1, 2.1],
  market: [3, 2, 2.8],
  signpost: [1, 1, 2.3],
  tavern: [8, 6, 8],
  forge: [4, 4, 3.6],
  stable: [7, 5, 4.5],
  wall: [4, 1, 3],
  floor: [4, 4, 0.025],
  stairs: [2, 3, 2.8],
  bed: [1, 2, 0.85],
  rug: [2, 3, 0.025],
  doorway: [2, 1, 3],
  fountain: [3, 3, 2.7],
};
const variants: Partial<Record<SceneryKind, Record<string, Dimensions>>> = {
  rock: {
    crystal: [2, 2, 3],
    boulder: [3, 3, 3.5],
    pile: [2, 2, 0.9],
    moss: [2, 2, 1.6],
    desert: [2, 2, 2],
    ice: [2, 2, 1.8],
  },
  mountain: { snowy: [40, 36, 55], desert: [32, 28, 30], volcano: [36, 36, 42] },
  ruin: { wall: [4, 1, 2.5], arch: [3, 1, 4], columns: [5, 5, 3.8], temple: [10, 8, 6] },
  tent: { pavilion: [4, 4, 4], desert: [3, 3, 2.4], war: [4, 3, 3.2] },
  cart: { covered: [2, 3, 2.8], goods: [2, 3, 2], broken: [2, 3, 0.9] },
  portal: { door: [1, 1, 2.4], cave: [4, 2, 4.8] },
  boat: { ship: [6, 16, 16] },
  campfire: { brazier: [1, 1, 1.4] },
  bush: { thorn: [2, 2, 1.7], desert: [1, 1, 0.8], frost: [1, 1, 0.9] },
  flowers: {
    mushrooms: [1, 1, 0.25],
    roses: [2, 2, 1.1],
    sunflowers: [2, 2, 1.8],
    lavender: [2, 2, 0.8],
    dead: [2, 2, 0.45],
  },
  statue: { obelisk: [2, 2, 5] },
  chest: { open: [1, 1, 0.95] },
  counter: { stone: [2, 1, 1.1], merchant: [3, 1, 1.4] },
  crops: {
    vegetables: [6, 4, 0.55],
    pumpkins: [8, 6, 0.6],
    corn: [8, 6, 2.2],
    vineyard: [8, 8, 1.8],
  },
  house: {
    cottage: [4, 4, 4.8],
    inn: [8, 6, 8.5],
    tower: [4, 4, 11],
    timber: [6, 5, 7],
    stone: [6, 5, 6.8],
    manor: [10, 8, 10],
    desert: [5, 5, 4.5],
    ruined: [5, 4, 3.5],
  },
  tavern: { port: [8, 6, 8], stone: [8, 7, 8.8], open: [8, 6, 3] },
  forge: { covered: [5, 4, 4.5] },
  stable: { open: [7, 5, 3] },
  wall: { timber: [4, 1, 2.7], brick: [4, 1, 3], low: [4, 1, 1] },
  bed: { bunk: [1, 2, 1.9], royal: [2, 2, 2.5] },
  rug: { round: [3, 3, 0.025], royal: [3, 4, 0.025] },
  doorway: { arch: [3, 1, 4], iron: [3, 1, 3.8] },
  fountain: { dry: [3, 3, 2.7], ornate: [4, 4, 4] },
  gravestone: { ornate: [1, 1, 1.5], broken: [1, 1, 0.65] },
  cross: { stone: [1, 1, 1.9], rune: [1, 1, 2.2] },
  fence: { stone: [4, 1, 1], palisade: [4, 1, 2.8], iron: [4, 1, 1.8] },
  grass: { tall: [4, 4, 0.9], dry: [4, 4, 0.4] },
  well: { roofed: [2, 2, 3], ruined: [2, 2, 0.8] },
  bridge: { stone: [4, 8, 1.6], rope: [2, 8, 1.4] },
  table: { round: [2, 2, 0.8], feast: [4, 2, 0.9] },
  chair: { throne: [1, 1, 1.8], stool: [1, 1, 0.5] },
  torch: { lantern: [1, 1, 1.9], arcane: [1, 1, 2.3] },
  signpost: { forked: [1, 1, 2.5], banner: [1, 1, 3.2] },
};
export function sceneryDimensions(kind: string, variant = 'default') {
  const [width, height, heightMetres] = variants[kind as SceneryKind]?.[variant] ??
    defaults[kind as SceneryKind] ?? [1, 1, 1.5];
  return { width, height, heightMetres };
}
export function normalizeSceneryHeight(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.01 && value <= 300
    ? value
    : undefined;
}
const fixedHeight = new Set([
  'water',
  'fire',
  'road',
  'ice',
  'lava',
  'floor',
  'rug',
  'crops',
  'flowers',
  'grass',
  'fence',
  'wall',
  'bridge',
]);
export function sceneryHeightMetres(
  kind: string,
  variant: string,
  width: number,
  depth: number,
  override?: unknown,
) {
  const explicit = normalizeSceneryHeight(override);
  if (explicit !== undefined) return explicit;
  const base = sceneryDimensions(kind, variant);
  const ratio = fixedHeight.has(kind) ? 1 : Math.sqrt((width * depth) / (base.width * base.height));
  return Math.min(300, Math.max(0.01, base.heightMetres * ratio));
}
export function mapCellMetres(map: { scale_per_cell: number; scale_unit: string }) {
  return map.scale_per_cell * (map.scale_unit === 'ft' ? 0.3 : 1);
}
