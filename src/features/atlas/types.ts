export const CELL = 16;
export const MAX_FEATURES = 1800;
export const LAYER_IDS = ['terrain', 'regions', 'routes', 'symbols', 'tokens', 'labels'] as const;
export type LayerId = (typeof LAYER_IDS)[number];
export type Point = { x: number; y: number };
export type Theme = 'parchment' | 'natural' | 'night' | 'blueprint';
export type Template =
  'blank' | 'island' | 'archipelago' | 'continent' | 'valley' | 'city' | 'dungeon' | 'desert';
export const TEMPLATES: { id: Template; name: string; description: string }[] = [
  {
    id: 'island',
    name: 'Ilha dos ventos',
    description: 'Costa orgânica, florestas e uma cordilheira central.',
  },
  { id: 'archipelago', name: 'Arquipélago', description: 'Ilhas, estreitos e rotas de navegação.' },
  {
    id: 'continent',
    name: 'Continente',
    description: 'Grandes extensões de terra e biomas variados.',
  },
  {
    id: 'valley',
    name: 'Vale de montanhas',
    description: 'Um corredor verde entre picos e caminhos.',
  },
  { id: 'desert', name: 'Terras áridas', description: 'Areia, desfiladeiros e antigas ruínas.' },
  { id: 'city', name: 'Cidade murada', description: 'Bairros, ruas, portões e edifícios.' },
  { id: 'dungeon', name: 'Masmorra', description: 'Salas, corredores, portas e encontros.' },
  { id: 'blank', name: 'Tela em branco', description: 'Comece pelo mar e desenhe cada detalhe.' },
];
export const TERRAINS = [
  { name: 'Oceano', color: '#538b99', height: 0, group: 'natural' },
  { name: 'Águas rasas', color: '#82b4b5', height: 0, group: 'natural' },
  { name: 'Praia', color: '#daca96', height: 0, group: 'natural' },
  { name: 'Planície', color: '#a6b77e', height: 1, group: 'natural' },
  { name: 'Floresta', color: '#6b8e65', height: 1, group: 'natural' },
  { name: 'Selva', color: '#3f775d', height: 1, group: 'natural' },
  { name: 'Colinas', color: '#9c9d6b', height: 2, group: 'natural' },
  { name: 'Montanha', color: '#999687', height: 4, group: 'natural' },
  { name: 'Neve', color: '#e4e8dc', height: 5, group: 'natural' },
  { name: 'Deserto', color: '#d4b078', height: 1, group: 'natural' },
  { name: 'Savana', color: '#bdad6b', height: 1, group: 'natural' },
  { name: 'Pântano', color: '#788c6c', height: 0, group: 'natural' },
  { name: 'Tundra', color: '#aeb9a5', height: 2, group: 'natural' },
  { name: 'Terra vulcânica', color: '#71615d', height: 3, group: 'natural' },
  { name: 'Lava', color: '#cf6542', height: 0, group: 'natural' },
  { name: 'Terra vermelha', color: '#ad7862', height: 1, group: 'natural' },
  { name: 'Pedra', color: '#a5a099', height: 0, group: 'built' },
  { name: 'Piso de madeira', color: '#b39a77', height: 0, group: 'built' },
  { name: 'Calçamento', color: '#bdb7a3', height: 0, group: 'built' },
  { name: 'Parede de pedra', color: '#696c65', height: 2, group: 'built' },
  { name: 'Solo escuro', color: '#78705c', height: 0, group: 'built' },
  { name: 'Cultivo', color: '#b4b77c', height: 0, group: 'built' },
] as const;
export const SYMBOLS = [
  ['mountain', 'Montanha', 'nature'],
  ['snowpeak', 'Pico nevado', 'nature'],
  ['ridge', 'Cordilheira', 'nature'],
  ['volcano', 'Vulcão', 'nature'],
  ['hill', 'Colina', 'nature'],
  ['rock', 'Rocha', 'nature'],
  ['pine', 'Pinheiro', 'nature'],
  ['tree', 'Árvore', 'nature'],
  ['forest', 'Bosque', 'nature'],
  ['palm', 'Palmeira', 'nature'],
  ['dead-tree', 'Árvore seca', 'nature'],
  ['crystal', 'Cristais', 'nature'],
  ['cactus', 'Cacto', 'nature'],
  ['city', 'Cidade', 'places'],
  ['village', 'Vila', 'places'],
  ['castle', 'Castelo', 'places'],
  ['tower', 'Torre', 'places'],
  ['temple', 'Templo', 'places'],
  ['ruin', 'Ruína', 'places'],
  ['harbor', 'Porto', 'places'],
  ['lighthouse', 'Farol', 'places'],
  ['house', 'Casa', 'places'],
  ['windmill', 'Moinho', 'places'],
  ['farm', 'Fazenda', 'places'],
  ['bridge', 'Ponte', 'places'],
  ['gate', 'Portão', 'places'],
  ['wall', 'Muralha', 'places'],
  ['well', 'Poço', 'places'],
  ['fountain', 'Fonte', 'places'],
  ['camp', 'Acampamento', 'adventure'],
  ['cave', 'Caverna', 'adventure'],
  ['mine', 'Mina', 'adventure'],
  ['dungeon', 'Masmorra', 'adventure'],
  ['graveyard', 'Cemitério', 'adventure'],
  ['shrine', 'Santuário', 'adventure'],
  ['obelisk', 'Obelisco', 'adventure'],
  ['portal', 'Portal', 'adventure'],
  ['ship', 'Navio', 'adventure'],
  ['wreck', 'Naufrágio', 'adventure'],
  ['chest', 'Baú', 'adventure'],
  ['skull', 'Perigo', 'adventure'],
  ['flag', 'Bandeira', 'adventure'],
  ['fire', 'Fogueira', 'adventure'],
  ['door', 'Porta', 'adventure'],
  ['stairs', 'Escada', 'adventure'],
  ['trap', 'Armadilha', 'adventure'],
  ['altar', 'Altar', 'adventure'],
  ['waterfall', 'Cachoeira', 'nature'],
  ['reeds', 'Juncos do pântano', 'nature'],
  ['mushroom', 'Cogumelos', 'nature'],
  ['glacier', 'Geleira', 'nature'],
  ['dunes', 'Dunas', 'nature'],
  ['fort', 'Forte militar', 'places'],
  ['tavern', 'Taverna', 'places'],
  ['blacksmith', 'Ferraria', 'places'],
  ['market', 'Mercado', 'places'],
  ['prison', 'Prisão', 'places'],
  ['hut', 'Cabana', 'places'],
  ['dock', 'Cais', 'places'],
  ['stone-circle', 'Círculo de pedras', 'adventure'],
  ['statue', 'Estátua', 'adventure'],
  ['barricade', 'Barricada', 'interior'],
  ['barrel', 'Barril', 'interior'],
  ['crate', 'Caixote', 'interior'],
  ['table', 'Mesa', 'interior'],
  ['bed', 'Cama', 'interior'],
  ['bookshelf', 'Estante de livros', 'interior'],
  ['torch', 'Tocha', 'interior'],
] as const;
export type SymbolId = (typeof SYMBOLS)[number][0];
export const TOKEN_ICONS = [
  'warrior',
  'mage',
  'rogue',
  'cleric',
  'ranger',
  'druid',
  'beast',
  'dragon',
  'goblin',
  'undead',
  'boss',
  'party',
  'barbarian',
  'bard',
  'monk',
  'paladin',
  'sorcerer',
  'warlock',
  'wolf',
  'spider',
  'giant',
  'ooze',
  'construct',
  'demon',
] as const;
export type TokenIcon = (typeof TOKEN_ICONS)[number];
export const TOKEN_LABELS: Record<TokenIcon, string> = {
  warrior: 'Guerreiro',
  mage: 'Mago',
  rogue: 'Ladino',
  cleric: 'Clérigo',
  ranger: 'Patrulheiro',
  druid: 'Druida',
  beast: 'Fera',
  dragon: 'Dragão',
  goblin: 'Goblin',
  undead: 'Morto-vivo',
  boss: 'Chefe',
  party: 'Grupo',
  barbarian: 'Bárbaro',
  bard: 'Bardo',
  monk: 'Monge',
  paladin: 'Paladino',
  sorcerer: 'Feiticeiro',
  warlock: 'Bruxo',
  wolf: 'Lobo',
  spider: 'Aranha',
  giant: 'Gigante',
  ooze: 'Gosma',
  construct: 'Construto',
  demon: 'Demônio',
};
export const ROUTES = {
  road: 'Estrada',
  trail: 'Trilha',
  river: 'Rio',
  border: 'Fronteira',
  wall: 'Muralha',
  arrow: 'Rota com seta',
} as const;
export type RouteStyle = keyof typeof ROUTES;
export interface Layer {
  id: LayerId;
  visible: boolean;
  locked: boolean;
  opacity: number;
}
export const LAYER_NAMES: Record<LayerId, string> = {
  terrain: 'Terreno e relevo',
  regions: 'Regiões',
  routes: 'Rotas e rios',
  symbols: 'Símbolos',
  tokens: 'Tokens',
  labels: 'Textos',
};
interface BaseFeature {
  id: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}
export interface SymbolFeature extends BaseFeature {
  kind: 'symbol';
  symbol: SymbolId;
  size: number;
  color: string;
}
export interface TokenFeature extends BaseFeature {
  kind: 'token';
  icon: TokenIcon;
  size: number;
  color: string;
  faction: 'neutral' | 'ally' | 'enemy';
  number: number;
}
export interface LabelFeature extends BaseFeature {
  kind: 'label';
  text: string;
  fontSize: number;
  color: string;
  font: 'serif' | 'sans';
  italic: boolean;
}
export interface RouteFeature extends BaseFeature {
  kind: 'route';
  points: Point[];
  color: string;
  width: number;
  style: RouteStyle;
  curved: boolean;
}
export interface RegionFeature extends BaseFeature {
  kind: 'region';
  points: Point[];
  color: string;
  fill: string;
  width: number;
  fillOpacity: number;
}
export type MapFeature = SymbolFeature | TokenFeature | LabelFeature | RouteFeature | RegionFeature;
export const FEATURE_LAYER: Record<MapFeature['kind'], LayerId> = {
  symbol: 'symbols',
  token: 'tokens',
  label: 'labels',
  route: 'routes',
  region: 'regions',
};
export interface AtlasDocument {
  schema: 1;
  title: string;
  notes: string;
  template: Template;
  seed: string;
  width: number;
  height: number;
  theme: Theme;
  palette: string[];
  terrain: number[];
  elevation: number[];
  baseTerrain: number;
  layers: Layer[];
  objects: MapFeature[];
  grid: 'none' | 'square' | 'hex';
  gridColor: string;
  gridOpacity: number;
  relief: boolean;
  compass: boolean;
  scaleBar: boolean;
  unit: 'km' | 'm' | 'mi';
  distancePerCell: number;
}
export interface AtlasSummary {
  id: string;
  campaign_id: string;
  name: string;
  revision: number;
  thumbnail: string | null;
  width: number;
  height: number;
  template: Template;
  created_at: string;
  updated_at: string;
}
export interface AtlasMap extends AtlasSummary {
  document: AtlasDocument;
}
export type AtlasTool =
  | 'select'
  | 'pan'
  | 'paint'
  | 'erase'
  | 'fill'
  | 'pick'
  | 'symbol'
  | 'token'
  | 'route'
  | 'region'
  | 'label'
  | 'measure';
export interface Brush {
  terrain: number;
  elevation: number;
  radius: number;
  shape: 'circle' | 'square';
  heightOnly: boolean;
}
