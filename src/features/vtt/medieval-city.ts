import { makeScenery, SCENERY, scenerySize, type SceneryKind } from './scenery';
import type { BattleMapObject } from './types';

export const MEDIEVAL_CITY = {
  id: 'medieval-city',
  name: 'Valedouro · cidade medieval',
  width: 128,
  height: 112,
  scale_per_cell: 1.5,
  description:
    'Cidade murada de Valedouro. Praça da Fonte e mercado no centro; bairros residenciais ao norte e ao sul; taverna, ferraria e estábulo junto às vias principais. Ponte sobre o rio a oeste, hortas, lavouras e pomar a leste. Todas as peças são editáveis.',
} as const;

export type SceneObject = Omit<BattleMapObject, 'id' | 'map_id' | 'created_at' | 'updated_at'>;
export function medievalCityObjects(): SceneObject[] {
  const result: SceneObject[] = [];
  const add = (
    kind: SceneryKind,
    x: number,
    y: number,
    width: number,
    height: number,
    variant = 'default',
    rotation = 0,
    name?: string,
    heightMetres?: number,
    color?: string,
  ) => {
    const def = SCENERY.find((s) => s.id === kind)!;
    const { map_id: _map, ...object } = makeScenery(
      '',
      { x, y },
      {
        kind,
        width,
        height,
        variant,
        rotation,
        blocks: def.blocks,
        cost: def.cost,
        style: 'village',
        heightMetres,
        color,
      },
    );
    result.push({
      ...object,
      metadata: { ...object.metadata, ...(name ? { name } : {}), scene_template: MEDIEVAL_CITY.id },
    });
  };
  const road = (x: number, y: number, w: number, h: number, cobble = true) => {
    if (w > 0 && h > 0) add('road', x, y, w, h, cobble ? 'cobblestone' : 'default');
  };
  const house = (
    x: number,
    y: number,
    variant: string,
    north = false,
    w?: number,
    h?: number,
    name?: string,
  ) => {
    const size = scenerySize('house', variant),
      width = w ?? size.width,
      height = h ?? size.height;
    add('house', x, y, width, height, variant, north ? 180 : 0, name);
    const centre = x + Math.floor(width / 2) - 1;
    if (north) road(centre, 74, 2, y - 74);
    else if (y < 30) road(centre, y + height, 2, 30 - y - height);
    else if (y < 41) road(centre, y + height, 2, 41 - y - height);
    else if (y > 55 && y < 61) road(centre, y + height, 2, 61 - y - height);
    else if (y >= 64 && y < 71) road(centre, y + height, 2, 71 - y - height);
  };
  // Ground and river precede roads. The bridge occupies a gap in the water
  // footprint so walking over it has ordinary movement cost.
  add('grass', 0, 0, 128, 112, 'default', 0, 'Vale verde', 0.07);
  add('water', 8, 0, 4, 49, 'default', 0, 'Rio do Vale · norte');
  add('water', 8, 55, 4, 57, 'default', 0, 'Rio do Vale · sul');
  road(0, 49, 128, 6, false);
  road(55, 0, 6, 112, false);
  road(21, 49, 76, 6);
  road(55, 17, 6, 70);
  road(23, 30, 72, 3);
  road(23, 71, 72, 3);
  road(31, 19, 3, 65);
  road(82, 19, 3, 65);
  road(23, 41, 72, 2);
  road(23, 61, 72, 3);
  add('bridge', 6, 49, 8, 6, 'stone', 90, 'Ponte do Vale');
  // Fortifications stop at all four gateways.
  for (const y of [16, 87]) {
    add('wall', 20, y, 35, 1, 'default', 0, 'Muralha', 5);
    add('wall', 61, y, 37, 1, 'default', 0, 'Muralha', 5);
    add('doorway', 55, y, 6, 1, 'arch', 0, y === 16 ? 'Portão Norte' : 'Portão Sul', 6);
  }
  for (const x of [20, 97]) {
    add('wall', x, 17, 1, 32, 'default', 90, 'Muralha', 5);
    add('wall', x, 55, 1, 32, 'default', 90, 'Muralha', 5);
    add(
      'doorway',
      x,
      49,
      1,
      6,
      'arch',
      90,
      x === 20 ? 'Portão da Ponte' : 'Portão das Colheitas',
      6,
    );
  }
  for (const x of [18, 94])
    for (const y of [14, 84]) add('house', x, y, 4, 4, 'tower', 0, 'Torre da muralha', 10);
  // Plaza: unobstructed circulation around the fountain and the market.
  add('floor', 45, 41, 27, 22, 'tile', 0, 'Praça da Fonte', 0.04, '#c3b998');
  add('fountain', 56, 50, 4, 4, 'ornate', 0, 'Fonte de Valedouro', 3.4);
  for (const x of [47, 51, 63, 67]) {
    add('market', x, 44, 3, 2, x % 3 ? 'produce' : 'default', 0, 'Feira da praça');
    add('market', x, 58, 3, 2, x % 3 ? 'default' : 'weapons', 180, 'Feira da praça');
  }
  add('well', 66, 53, 2, 2, 'roofed', 0, 'Poço público');
  for (const x of [47, 64]) {
    add('table', x, 51, 2, 1, 'default', 0, 'Mesa da praça');
    add('chair', x, 50, 1, 1, 'stool');
    add('chair', x + 1, 52, 1, 1, 'stool');
  }
  add('statue', 49, 54, 2, 2, 'default', 180, 'Monumento dos fundadores');
  // Houses face a street, each with a short path to its door.
  house(24, 21, 'cottage', false, 6, 5, 'Casa do carpinteiro');
  house(36, 20, 'timber', false, 6, 6, 'Casa da tecelã');
  house(47, 20, 'stone', false, 6, 5, 'Casa do escriba');
  house(65, 20, 'timber', false, 6, 5, 'Casa do boticário');
  house(74, 20, 'cottage', false, 6, 5, 'Casa do padeiro');
  house(88, 20, 'stone', false, 6, 6, 'Casa do oleiro');
  house(24, 35, 'timber', false, 6, 5, 'Casa das famílias');
  house(36, 35, 'cottage', false, 7, 5, 'Casa do jardineiro');
  add('house', 73, 35, 8, 6, 'manor', 270, 'Solar do conselho');
  road(71, 37, 2, 6);
  add('house', 87, 35, 7, 6, 'inn', 0, 'Estalagem do Caminho');
  add('tavern', 23, 43, 7, 6, 'default', 0, 'Taverna do Javali Dourado');
  add('tavern', 86, 43, 8, 6, 'stone', 0, 'Taverna das Colheitas');
  add('forge', 23, 57, 6, 4, 'covered', 0, 'Ferraria da Ponte');
  house(36, 56, 'stone', false, 6, 5, 'Casa do ferreiro');
  add('forge', 86, 57, 6, 4, 'default', 0, 'Oficina dos artesãos');
  house(24, 65, 'cottage', false, 6, 6, 'Casa do lenhador');
  house(36, 65, 'timber', false, 6, 6, 'Casa da costureira');
  house(65, 65, 'stone', false, 6, 5, 'Casa do tratador');
  add('stable', 73, 65, 8, 6, 'default', 0, 'Estábulo das caravanas');
  add('cart', 77, 57, 2, 3, 'goods', 90, 'Carroça do mercado');
  add('barrel', 74, 58, 1, 1);
  add('barrel', 74, 60, 1, 1, 'crate');
  for (const [i, x] of [24, 36, 47, 65, 74, 88].entries())
    house(
      x,
      77,
      ['timber', 'cottage', 'stone'][i % 3],
      true,
      6,
      5,
      `Moradia do bairro sul ${i + 1}`,
    );
  // Kitchen gardens and trees fill the setbacks without blocking roads.
  for (const x of [24, 37, 65, 88]) add('crops', x, 27, 4, 2, 'vegetables', 0, 'Horta doméstica');
  for (const [x, y] of [
    [44, 25],
    [80, 25],
    [28, 40],
    [43, 58],
    [88, 68],
    [45, 68],
    [93, 78],
  ])
    add('flowers', x, y, 2, 2, 'roses');
  for (const [x, y] of [
    [35, 44],
    [79, 44],
    [43, 66],
    [88, 65],
  ])
    add('tree', x, y, 3, 3);
  for (const [x, y] of [
    [54, 44],
    [61, 44],
    [53, 57],
    [61, 57],
    [21, 47],
    [95, 55],
    [53, 18],
    [61, 83],
  ])
    add('torch', x, y, 1, 1, 'lantern');
  add('signpost', 16, 46, 1, 1, 'forked', 90, 'Caminho de Valedouro');
  add('signpost', 99, 56, 1, 1, 'banner', 270, 'Brasão de Valedouro');
  // Agricultural belt: lanes between fields, irrigation pond and orchard.
  road(112, 19, 2, 30, false);
  road(112, 55, 2, 43, false);
  for (const [x, y, w, h, variant] of [
    [102, 20, 10, 10, 'default'],
    [115, 20, 10, 10, 'corn'],
    [102, 34, 10, 9, 'pumpkins'],
    [115, 34, 10, 9, 'vegetables'],
    [102, 60, 10, 12, 'vineyard'],
    [115, 60, 10, 12, 'default'],
  ] as const)
    add('crops', x, y, w, h, variant, 0, 'Lavoura do vale');
  for (const x of [102, 115]) for (const y of [18, 32, 44, 58, 74]) add('fence', x, y, 10, 1);
  for (const x of [103, 109, 116, 122])
    for (const y of [78, 85]) add('tree', x, y, 3, 3, 'default', 0, 'Pomar');
  add('well', 119, 92, 2, 2, 'default', 0, 'Poço dos lavradores');
  add('water', 102, 97, 15, 9, 'default', 0, 'Lago de irrigação');
  add('house', 118, 98, 6, 5, 'cottage', 180, 'Casa do lavrador');
  road(120, 94, 2, 4, false);
  road(114, 93, 8, 2, false);
  for (const [x, y] of [
    [2, 6],
    [14, 9],
    [2, 23],
    [14, 30],
    [1, 62],
    [14, 65],
    [2, 79],
    [14, 86],
    [34, 96],
    [42, 98],
    [69, 98],
    [80, 96],
    [89, 100],
    [101, 8],
    [115, 8],
  ])
    add('tree', x, y, 3, 3);
  for (const [x, y] of [
    [2, 15],
    [15, 20],
    [2, 90],
    [15, 99],
  ])
    add('pine', x, y, 3, 3);
  for (const [x, y] of [
    [15, 39],
    [2, 101],
    [75, 104],
    [124, 93],
  ])
    add('rock', x, y, 2, 2, 'moss');
  for (const [x, y] of [
    [33, 90],
    [66, 90],
    [90, 9],
    [103, 92],
  ])
    add('bush', x, y, 2, 2);
  return result;
}

// A stable, renderable preview. Database inserts allocate their own UUIDs.
export function medievalCityPreview(): BattleMapObject[] {
  return medievalCityObjects().map((object, i) => ({
    ...object,
    id: `valedouro-${i}`,
    map_id: 'preview-city',
    created_at: '',
    updated_at: '',
  }));
}
