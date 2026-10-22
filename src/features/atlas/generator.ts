import {
  CELL,
  TERRAINS,
  LAYER_IDS,
  type AtlasDocument,
  type MapFeature,
  type Point,
  type SymbolId,
  type Template,
} from './types';

export function seedNumber(seed: string) {
  let h = 2166136261;
  for (const c of seed) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function randomAt(x: number, y: number, seed: number) {
  let h = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy,
    sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = randomAt(ix, iy, seed),
    b = randomAt(ix + 1, iy, seed),
    c = randomAt(ix, iy + 1, seed),
    d = randomAt(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fractal(x: number, y: number, seed: number) {
  return (
    noise(x, y, seed) * 0.55 +
    noise(x * 2, y * 2, seed + 1) * 0.27 +
    noise(x * 4, y * 4, seed + 2) * 0.13 +
    noise(x * 8, y * 8, seed + 3) * 0.05
  );
}

export function generateAtlas(
  template: Template = 'island',
  width = 1600,
  height = 1024,
  seed = 'Ventobravo',
  title = 'Terras de Ventobravo',
): AtlasDocument {
  width = Math.max(320, Math.min(4096, Math.round(width)));
  height = Math.max(320, Math.min(4096, Math.round(height)));
  const cols = Math.ceil(width / CELL),
    rows = Math.ceil(height / CELL),
    s = seedNumber(seed),
    base = template === 'city' ? 3 : template === 'dungeon' ? 19 : 0;
  const d: AtlasDocument = {
    schema: 1,
    title,
    notes: '',
    template,
    seed,
    width,
    height,
    theme: template === 'dungeon' ? 'blueprint' : 'parchment',
    palette: TERRAINS.map((t) => t.color),
    terrain: Array(cols * rows).fill(base),
    elevation: Array(cols * rows).fill(0),
    baseTerrain: base,
    layers: LAYER_IDS.map((id) => ({ id, visible: true, locked: false, opacity: 1 })),
    objects: [],
    grid: template === 'dungeon' ? 'square' : 'none',
    gridColor: '#5b675b',
    gridOpacity: 0.18,
    relief: true,
    compass: true,
    scaleBar: true,
    unit: template === 'city' || template === 'dungeon' ? 'm' : 'km',
    distancePerCell: template === 'dungeon' ? 1.5 : template === 'city' ? 10 : 2,
  };
  let counter = 0;
  const common = (p: Point, name: string) => ({
    id: `generated-${s}-${++counter}`,
    name,
    x: Math.round(p.x),
    y: Math.round(p.y),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
  });
  const symbol = (symbol: SymbolId, x: number, y: number, size: number, name = '') =>
    d.objects.push({ ...common({ x, y }, name), kind: 'symbol', symbol, size, color: '#66543c' });
  const label = (text: string, x: number, y: number, fontSize = 24) =>
    d.objects.push({
      ...common({ x, y }, text),
      kind: 'label',
      text,
      fontSize,
      color: '#564630',
      font: 'serif',
      italic: true,
    });
  const route = (points: Point[], name: string, style: 'road' | 'river' | 'wall' = 'road') => {
    const origin = points[0];
    d.objects.push({
      ...common(origin, name),
      kind: 'route',
      points: points.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
      color: style === 'river' ? '#538f9d' : style === 'wall' ? '#6b6558' : '#a68154',
      width: style === 'wall' ? 10 : style === 'river' ? 7 : 5,
      style,
      curved: style !== 'wall',
    });
  };
  if (template === 'blank') return d;
  if (template === 'city') {
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (x > cols * 0.16 && x < cols * 0.84 && y > rows * 0.15 && y < rows * 0.85)
          d.terrain[i] = 18;
        else if (fractal(x / 8, y / 8, s) > 0.58) d.terrain[i] = 4;
      }
    const left = width * 0.18,
      right = width * 0.82,
      top = height * 0.16,
      bottom = height * 0.84;
    route(
      [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
        { x: left, y: top },
      ],
      'Muralhas da cidade',
      'wall',
    );
    route(
      [
        { x: width * 0.5, y: height * 0.12 },
        { x: width * 0.5, y: height * 0.86 },
      ],
      'Via dos mercadores',
    );
    route(
      [
        { x: width * 0.14, y: height * 0.55 },
        { x: width * 0.86, y: height * 0.55 },
      ],
      'Rua da ponte',
    );
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 7; x++)
        if (x !== 3 && !(y === 0 && x > 1 && x < 5))
          symbol(
            'house',
            width * (0.25 + x * 0.085),
            height * (0.29 + y * 0.105),
            Math.min(width, height) * (0.035 + randomAt(x, y, s) * 0.012),
          );
    symbol('castle', width * 0.5, height * 0.29, 90, 'Cidadela');
    symbol('temple', width * 0.7, height * 0.7, 65, 'Templo');
    symbol('fountain', width * 0.5, height * 0.55, 40, 'Praça central');
    symbol('gate', width * 0.5, bottom, 54, 'Portão sul');
    label('Cidadela', width * 0.5, height * 0.2, 26);
    label('Bairro dos Mercadores', width * 0.34, height * 0.64, 20);
    label('Distrito do Templo', width * 0.69, height * 0.8, 20);
    return d;
  }
  if (template === 'dungeon') {
    const carve = (x: number, y: number, w: number, h: number, kind = 16) => {
      for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++)
        for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
          if (xx >= 0 && xx < cols && yy >= 0 && yy < rows) d.terrain[yy * cols + xx] = kind;
        }
    };
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 3; x++) {
        const cx = cols * (0.2 + x * 0.3),
          cy = rows * (0.3 + y * 0.4),
          rw = cols * (0.15 + randomAt(x, y, s) * 0.08),
          rh = rows * (0.18 + randomAt(x + 8, y, s) * 0.1);
        carve(cx - rw / 2, cy - rh / 2, rw, rh);
        if (x < 2) carve(cx, cy - 1, cols * 0.3, 3, 18);
        if (y === 0 && x !== 1) carve(cx - 1, cy, 3, rows * 0.4, 18);
        symbol(
          x === 2 && y === 1 ? 'altar' : x === 1 ? 'chest' : 'stairs',
          cx * CELL,
          cy * CELL,
          36,
        );
        label(
          ['Entrada', 'Tesouro', 'Biblioteca', 'Cripta', 'Arsenal', 'Santuário'][y * 3 + x],
          cx * CELL,
          cy * CELL + rh * CELL * 0.24,
          20,
        );
      }
    symbol('door', cols * 0.35 * CELL, rows * 0.3 * CELL, 25, 'Porta antiga');
    symbol('trap', cols * 0.35 * CELL, rows * 0.7 * CELL, 30, 'Armadilha');
    d.compass = false;
    return d;
  }
  const centers = Array.from({ length: 7 }, (_, i) => ({
    x: 0.16 + randomAt(i, 1, s) * 0.68,
    y: 0.18 + randomAt(i, 2, s) * 0.64,
    r: 0.13 + randomAt(i, 3, s) * 0.1,
  }));
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const u = (x + 0.5) / cols,
        v = (y + 0.5) / rows,
        detail = fractal(u * 7, v * 7, s),
        moisture = fractal(u * 4 + 17, v * 4 + 29, s + 71);
      let altitude =
        0.9 - Math.hypot((u - 0.5) * 1.1, (v - 0.5) * 1.3) * 1.55 + (detail - 0.5) * 0.55;
      if (template === 'archipelago')
        altitude =
          Math.max(...centers.map((c) => (1 - Math.hypot(u - c.x, v - c.y) / c.r) * 0.7)) +
          (detail - 0.5) * 0.35;
      if (template === 'continent')
        altitude =
          0.5 +
          (detail - 0.5) * 0.9 -
          Math.pow(Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 1.7, 3) * 0.5;
      if (template === 'valley') altitude = 0.25 + Math.abs(u - 0.5) * 0.9 + (detail - 0.5) * 0.2;
      if (template === 'desert') altitude = 0.4 + (detail - 0.5) * 0.5;
      let kind =
        altitude < 0.03
          ? 0
          : altitude < 0.1
            ? 1
            : altitude < 0.15
              ? 2
              : altitude > 0.61
                ? 8
                : altitude > 0.49
                  ? 7
                  : altitude > 0.4
                    ? 6
                    : moisture > 0.6
                      ? 5
                      : moisture > 0.48
                        ? 4
                        : moisture < 0.28
                          ? 9
                          : 3;
      if (template === 'desert') kind = altitude > 0.52 ? 15 : 9;
      if (template === 'valley' && Math.abs(u - 0.5) < 0.045 + (detail - 0.5) * 0.02) kind = 1;
      d.terrain[y * cols + x] = kind;
      d.elevation[y * cols + x] = TERRAINS[kind].height;
    }
  const candidates: { x: number; y: number; kind: number }[] = [];
  for (let y = 4; y < rows - 4; y += 3)
    for (let x = 4; x < cols - 4; x += 3) {
      const kind = d.terrain[y * cols + x],
        r = randomAt(x, y, s + 99);
      if ((kind === 7 || kind === 8) && r > 0.32)
        candidates.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, kind });
      else if ((kind === 4 || kind === 5) && r > 0.38)
        candidates.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, kind });
      else if (kind === 9 && r > 0.96)
        candidates.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, kind });
    }
  for (const p of candidates.slice(0, 340))
    symbol(
      p.kind === 8 ? 'snowpeak' : p.kind === 7 ? 'mountain' : p.kind === 9 ? 'cactus' : 'pine',
      p.x,
      p.y,
      28 + randomAt(Math.round(p.x), Math.round(p.y), s) * 24,
    );
  const settlements: Point[] = [];
  for (let n = 0; n < 3; n++) {
    let best: Point | null = null,
      score = Infinity;
    const target = { x: width * (0.3 + n * 0.2), y: height * (n % 2 ? 0.65 : 0.48) };
    for (let y = 4; y < rows - 4; y += 2)
      for (let x = 4; x < cols - 4; x += 2) {
        const k = d.terrain[y * cols + x];
        if (![2, 3, 4, 6, 9].includes(k)) continue;
        const p = { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL },
          v = Math.hypot(p.x - target.x, p.y - target.y);
        if (
          v < score &&
          settlements.every((t) => Math.hypot(t.x - p.x, t.y - p.y) > width * 0.12)
        ) {
          best = p;
          score = v;
        }
      }
    if (best) {
      settlements.push(best);
      symbol(
        n === 0 ? 'city' : n === 1 ? 'castle' : 'village',
        best.x,
        best.y,
        55,
        ['Porto dos Ventos', 'Fortaleza da Aurora', 'Vila do Carvalho'][n],
      );
      label(['Porto dos Ventos', 'Aurora', 'Vila do Carvalho'][n], best.x, best.y + 43, 20);
    }
  }
  if (template !== 'archipelago')
    for (let i = 1; i < settlements.length; i++)
      route(
        [
          settlements[i - 1],
          {
            x: (settlements[i - 1].x + settlements[i].x) / 2,
            y: (settlements[i - 1].y + settlements[i].y) / 2 + height * 0.07,
          },
          settlements[i],
        ],
        `Caminho ${i}`,
      );
  if (template === 'archipelago' && settlements.length > 1) route(settlements, 'Rota das ilhas');
  label(
    template === 'desert'
      ? 'Ermos do Sol'
      : template === 'valley'
        ? 'Vale dos Ecos'
        : 'Montes da Bruma',
    width * 0.53,
    height * 0.31,
    30,
  );
  return d;
}

export function duplicateFeatures(
  objects: MapFeature[],
  id: string,
  width: number,
  height: number,
) {
  const o = objects.find((o) => o.id === id);
  if (!o) return objects;
  const copy = {
    ...structuredClone(o),
    id: crypto.randomUUID(),
    name: o.name ? `${o.name.slice(0, 112)} · cópia` : o.name,
    x: Math.min(width, o.x + 24),
    y: Math.min(height, o.y + 24),
    locked: false,
  };
  return [...objects, copy];
}
