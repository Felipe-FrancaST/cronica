import { TOKEN_GLYPHS, SYMBOL_GLYPHS, drawGlyph } from './glyphs';
import type { AssetImages } from '@/features/map-assets/atlas-images';
import {
  CELL,
  FEATURE_LAYER,
  type AtlasDocument,
  type MapFeature,
  type Point,
  type SymbolId,
  type TokenFeature,
} from './types';
import { featureBounds } from './model';
export const THEMES = {
  parchment: { paper: '#e1d6b5', ink: '#584832', frame: '#85704a', water: '#6b9ba6' },
  natural: { paper: '#e5e4cd', ink: '#3c4e3b', frame: '#6e8165', water: '#6797a9' },
  night: { paper: '#273540', ink: '#e0d6ad', frame: '#9d9c78', water: '#496779' },
  blueprint: { paper: '#d8dfda', ink: '#485b5d', frame: '#668184', water: '#789ba8' },
};
function polygon(c: CanvasRenderingContext2D, points: number[][], fill?: string) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  c.stroke();
}
function line(c: CanvasRenderingContext2D, points: number[][]) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill?: string) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  c.stroke();
}

/** Native vector symbols stay sharp at every zoom and require no remote assets. */
const symbolSprites = new Map<string, HTMLCanvasElement>();
const seenSymbols = new Set<string>();
let spriteBytes = 0;
/** Repeated forests and settlements share a bounded bitmap cache at the current
 * screen resolution. Close views and large exports retain the vector drawing. */
export function drawSymbol(
  c: CanvasRenderingContext2D,
  id: SymbolId,
  size: number,
  color = '#66543c',
) {
  const transform = c.getTransform(),
    pixels = size * Math.hypot(transform.a, transform.b);
  if (pixels > 512) {
    drawSymbolVector(c, id, size, color);
    return;
  }
  const resolution = [32, 64, 128, 256, 512].find((n) => n >= pixels) ?? 512,
    key = `${id}:${color}:${resolution}`;
  let sprite = symbolSprites.get(key);
  if (sprite) {
    symbolSprites.delete(key);
    symbolSprites.set(key, sprite);
  } else {
    // Cache repeated pieces only. A map with many unique colors must not churn
    // through new bitmap surfaces on every frame.
    if (!seenSymbols.has(key)) {
      seenSymbols.add(key);
      drawSymbolVector(c, id, size, color);
      return;
    }
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = Math.ceil(resolution * 1.4);
    const ctx = sprite.getContext('2d');
    if (!ctx) {
      drawSymbolVector(c, id, size, color);
      return;
    }
    ctx.translate(sprite.width / 2, sprite.height / 2);
    drawSymbolVector(ctx, id, resolution, color);
    const bytes = sprite.width * sprite.height * 4;
    while (symbolSprites.size && (spriteBytes + bytes > 8_000_000 || symbolSprites.size >= 96)) {
      const oldest = symbolSprites.keys().next().value!;
      const removed = symbolSprites.get(oldest)!;
      spriteBytes -= removed.width * removed.height * 4;
      symbolSprites.delete(oldest);
    }
    spriteBytes += bytes;
    symbolSprites.set(key, sprite);
  }
  const dimension = (sprite.width * size) / resolution;
  c.drawImage(sprite, -dimension / 2, -dimension / 2, dimension, dimension);
}
function drawSymbolVector(
  c: CanvasRenderingContext2D,
  id: SymbolId,
  size: number,
  color = '#66543c',
) {
  if (SYMBOL_GLYPHS[id]) {
    drawGlyph(c, SYMBOL_GLYPHS[id], size, color);
    return;
  }
  c.save();
  c.scale(size / 100, size / 100);
  c.lineWidth = 2.1;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = color;
  c.fillStyle = '#d7c9a6';
  const mountain = (x = 0, y = 0, scale = 1, snow = false) => {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    polygon(
      c,
      [
        [-45, 38],
        [0, -43],
        [45, 38],
      ],
      '#c1b38b',
    );
    polygon(
      c,
      [
        [0, -43],
        [45, 38],
        [9, 25],
        [-4, 12],
      ],
      color + '70',
    );
    if (snow)
      polygon(
        c,
        [
          [-15, -15],
          [0, -43],
          [17, -12],
          [6, -17],
          [-1, -12],
          [-7, -20],
        ],
        '#eee9da',
      );
    line(c, [
      [0, -43],
      [-3, -3],
      [-14, 15],
      [-11, 26],
    ]);
    c.restore();
  };
  const pine = (x = 0, y = 0, scale = 1) => {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    line(c, [
      [0, 25],
      [0, 45],
    ]);
    for (const [y, w] of [
      [12, 31],
      [-5, 25],
      [-24, 18],
    ])
      polygon(
        c,
        [
          [-w, y + 22],
          [0, y - 19],
          [w, y + 22],
        ],
        color + 'bb',
      );
    c.restore();
  };
  const house = (x = 0, y = 0, scale = 1) => {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    c.fillStyle = '#d9caac';
    c.fillRect(-25, -2, 50, 35);
    c.strokeRect(-25, -2, 50, 35);
    polygon(
      c,
      [
        [-32, -1],
        [0, -26],
        [32, -1],
      ],
      color + '99',
    );
    c.fillStyle = color;
    c.fillRect(-6, 14, 12, 19);
    c.strokeRect(-18, 5, 7, 8);
    c.restore();
  };
  const tower = (x = 0, y = 0, scale = 1) => {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    polygon(
      c,
      [
        [-25, 38],
        [-25, -30],
        [-14, -30],
        [-14, -21],
        [-5, -21],
        [-5, -30],
        [5, -30],
        [5, -21],
        [14, -21],
        [14, -30],
        [25, -30],
        [25, 38],
      ],
      '#d8cbb0',
    );
    c.fillStyle = color;
    c.fillRect(-6, 0, 12, 15);
    c.fillRect(-7, 24, 14, 14);
    line(c, [
      [-23, 17],
      [23, 17],
    ]);
    c.restore();
  };
  if (id === 'mountain' || id === 'snowpeak') mountain(0, 0, 1, id === 'snowpeak');
  else if (id === 'ridge') {
    mountain(-23, 6, 0.68);
    mountain(25, 9, 0.6);
    mountain(0, -7, 0.85, true);
  } else if (id === 'volcano') {
    polygon(
      c,
      [
        [-46, 38],
        [-17, -32],
        [17, -32],
        [46, 38],
      ],
      '#a58f75',
    );
    c.beginPath();
    c.ellipse(0, -31, 17, 6, 0, 0, Math.PI * 2);
    c.fillStyle = '#c56c45';
    c.fill();
    c.stroke();
    line(c, [
      [-3, -25],
      [8, -4],
      [2, 7],
      [16, 24],
    ]);
    line(c, [
      [2, -38],
      [-7, -49],
      [3, -58],
    ]);
  } else if (id === 'hill') {
    c.beginPath();
    c.moveTo(-47, 28);
    c.quadraticCurveTo(0, -55, 47, 28);
    c.quadraticCurveTo(6, 3, -47, 28);
    c.fillStyle = '#a8a37a';
    c.fill();
    c.stroke();
    line(c, [
      [-21, 13],
      [-4, -7],
      [14, 8],
    ]);
  } else if (id === 'rock') {
    polygon(
      c,
      [
        [-38, 29],
        [-29, -13],
        [-6, -34],
        [29, -20],
        [43, 21],
        [12, 38],
      ],
      '#b2aa94',
    );
    line(c, [
      [-6, -34],
      [2, 6],
      [43, 21],
    ]);
    line(c, [
      [2, 6],
      [-38, 29],
    ]);
  } else if (id === 'pine') pine();
  else if (id === 'forest') {
    pine(-22, 8, 0.6);
    pine(20, 9, 0.67);
    pine(0, -10, 0.8);
  } else if (id === 'tree') {
    line(c, [
      [0, 6],
      [0, 42],
    ]);
    circle(c, -17, -9, 22, color + 'aa');
    circle(c, 18, -10, 24, color + 'bb');
    circle(c, 0, -30, 24, color + 'cc');
    line(c, [
      [0, 22],
      [-10, 8],
    ]);
  } else if (id === 'dead-tree') {
    line(c, [
      [0, 43],
      [0, -39],
    ]);
    line(c, [
      [0, 11],
      [-28, -6],
      [-33, -28],
    ]);
    line(c, [
      [-18, 0],
      [-7, -16],
    ]);
    line(c, [
      [0, -5],
      [25, -23],
      [30, -39],
    ]);
  } else if (id === 'palm') {
    c.lineWidth = 5;
    line(c, [
      [-8, 44],
      [4, 6],
      [3, -12],
    ]);
    c.lineWidth = 3;
    for (const x of [-42, -23, 24, 43]) {
      c.beginPath();
      c.moveTo(3, -12);
      c.quadraticCurveTo(x * 0.6, -42, x, -1);
      c.stroke();
    }
    circle(c, 2, -9, 5, color);
  } else if (id === 'cactus') {
    c.lineWidth = 10;
    line(c, [
      [0, 39],
      [0, -37],
    ]);
    line(c, [
      [-28, -10],
      [-28, 10],
      [0, 10],
    ]);
    line(c, [
      [0, -7],
      [27, -7],
      [27, -27],
    ]);
  } else if (id === 'crystal') {
    polygon(
      c,
      [
        [-13, 37],
        [-21, -14],
        [0, -45],
        [21, -14],
        [13, 37],
      ],
      '#b9c5c2',
    );
    polygon(
      c,
      [
        [-17, 31],
        [-39, -2],
        [-29, -23],
        [-10, -3],
      ],
      '#a1b4b7',
    );
    line(c, [
      [0, -45],
      [0, 37],
    ]);
  } else if (id === 'house') house();
  else if (id === 'village' || id === 'farm') {
    house(-23, 14, 0.6);
    house(21, 8, 0.76);
    if (id === 'farm') {
      for (let i = 0; i < 4; i++)
        line(c, [
          [-43 + i * 12, 32],
          [-39 + i * 12, 45],
        ]);
    } else house(-4, -23, 0.58);
  } else if (id === 'city') {
    house(-27, 20, 0.55);
    house(22, 19, 0.6);
    house(-24, -20, 0.55);
    tower(7, -11, 0.62);
    house(28, -19, 0.47);
  } else if (id === 'castle') {
    polygon(
      c,
      [
        [-34, 32],
        [-34, -3],
        [34, -3],
        [34, 32],
      ],
      '#d4c5a4',
    );
    tower(-31, 5, 0.55);
    tower(31, 5, 0.55);
    tower(0, -14, 0.8);
  } else if (id === 'tower') tower();
  else if (id === 'temple' || id === 'shrine') {
    polygon(
      c,
      [
        [-43, -13],
        [0, -40],
        [43, -13],
      ],
      '#d5c8ac',
    );
    for (const x of [-29, -10, 10, 29]) {
      c.fillStyle = '#c3b493';
      c.fillRect(x - 4, -11, 8, 43);
      c.strokeRect(x - 4, -11, 8, 43);
    }
    line(c, [
      [-44, 34],
      [44, 34],
    ]);
    line(c, [
      [-48, 41],
      [48, 41],
    ]);
  } else if (id === 'ruin') {
    polygon(
      c,
      [
        [-37, 34],
        [-37, -27],
        [-17, -31],
        [-17, -3],
        [1, -10],
        [1, 34],
      ],
      '#b2ab91',
    );
    polygon(
      c,
      [
        [17, 34],
        [17, -30],
        [33, -20],
        [33, 34],
      ],
      '#c5b79b',
    );
    line(c, [
      [-35, -10],
      [-21, -5],
      [-18, 9],
    ]);
    line(c, [
      [-43, 40],
      [-30, 32],
      [-16, 40],
    ]);
  } else if (id === 'harbor') {
    line(c, [
      [0, -40],
      [0, 34],
    ]);
    circle(c, 0, -30, 9);
    c.beginPath();
    c.arc(0, 0, 32, 0, Math.PI);
    c.stroke();
    line(c, [
      [-32, 0],
      [-41, 10],
      [-38, -6],
    ]);
    line(c, [
      [32, 0],
      [41, 10],
      [38, -6],
    ]);
    line(c, [
      [-16, -13],
      [16, -13],
    ]);
  } else if (id === 'lighthouse') {
    polygon(
      c,
      [
        [-23, 35],
        [-15, -29],
        [15, -29],
        [23, 35],
      ],
      '#e1d7bb',
    );
    c.fillStyle = color + '99';
    c.fillRect(-18, -10, 36, 9);
    polygon(
      c,
      [
        [-22, -28],
        [-22, -44],
        [22, -44],
        [22, -28],
      ],
      '#e3cb8b',
    );
    polygon(
      c,
      [
        [-27, -45],
        [0, -59],
        [27, -45],
      ],
      color,
    );
    line(c, [
      [-28, -37],
      [-48, -46],
    ]);
    line(c, [
      [28, -37],
      [48, -46],
    ]);
  } else if (id === 'windmill') {
    polygon(
      c,
      [
        [-24, 39],
        [-16, -20],
        [16, -20],
        [24, 39],
      ],
      '#d5c3a0',
    );
    polygon(
      c,
      [
        [-23, -20],
        [0, -39],
        [23, -20],
      ],
      color + '99',
    );
    c.lineWidth = 4;
    line(c, [
      [-32, -37],
      [32, 27],
    ]);
    line(c, [
      [32, -37],
      [-32, 27],
    ]);
    circle(c, 0, -5, 4, color);
  } else if (id === 'bridge') {
    line(c, [
      [-43, -21],
      [-43, 29],
    ]);
    line(c, [
      [43, -21],
      [43, 29],
    ]);
    for (const y of [-14, -2, 10, 22])
      line(c, [
        [-42, y],
        [42, y],
      ]);
    line(c, [
      [-36, -23],
      [-36, 31],
    ]);
    line(c, [
      [36, -23],
      [36, 31],
    ]);
  } else if (id === 'wall' || id === 'gate') {
    polygon(
      c,
      [
        [-44, 31],
        [-44, -20],
        [-29, -20],
        [-29, -9],
        [-15, -9],
        [-15, -20],
        [0, -20],
        [0, -9],
        [15, -9],
        [15, -20],
        [29, -20],
        [29, -9],
        [44, -9],
        [44, 31],
      ],
      '#c2b599',
    );
    for (const y of [4, 18])
      line(c, [
        [-43, y],
        [43, y],
      ]);
    if (id === 'gate') {
      c.fillStyle = color;
      c.beginPath();
      c.roundRect(-13, 0, 26, 31, [13, 13, 0, 0]);
      c.fill();
    }
  } else if (id === 'camp') {
    polygon(
      c,
      [
        [-44, 35],
        [0, -40],
        [44, 35],
      ],
      '#c4a976',
    );
    line(c, [
      [0, -40],
      [0, 35],
    ]);
    polygon(
      c,
      [
        [0, 0],
        [0, 35],
        [21, 35],
      ],
      color,
    );
    line(c, [
      [-49, 35],
      [49, 35],
    ]);
  } else if (id === 'cave' || id === 'mine' || id === 'dungeon') {
    polygon(
      c,
      [
        [-47, 35],
        [-30, -15],
        [-9, -39],
        [23, -31],
        [48, 35],
      ],
      '#a59d86',
    );
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(0, 20, 23, 30, 0, Math.PI, 0);
    c.lineTo(23, 35);
    c.lineTo(-23, 35);
    c.fill();
    if (id === 'mine') {
      line(c, [
        [-26, -3],
        [26, -3],
      ]);
      line(c, [
        [-22, -3],
        [-22, 35],
      ]);
      line(c, [
        [22, -3],
        [22, 35],
      ]);
    }
    if (id === 'dungeon')
      for (let i = 0; i < 4; i++)
        line(c, [
          [-22, 35 - i * 6],
          [22, 35 - i * 6],
        ]);
  } else if (id === 'graveyard') {
    for (const [x, y] of [
      [-27, 12],
      [0, -6],
      [27, 13],
    ]) {
      c.beginPath();
      c.roundRect(x - 9, y - 15, 18, 38, [9, 9, 0, 0]);
      c.fillStyle = '#bbb39d';
      c.fill();
      c.stroke();
      line(c, [
        [x, y - 7],
        [x, y + 12],
      ]);
      line(c, [
        [x - 5, y],
        [x + 5, y],
      ]);
    }
  } else if (id === 'obelisk') {
    polygon(
      c,
      [
        [-14, 36],
        [-10, -26],
        [0, -45],
        [10, -26],
        [14, 36],
      ],
      '#c4b999',
    );
    line(c, [
      [0, -45],
      [0, 36],
    ]);
    line(c, [
      [-23, 39],
      [23, 39],
    ]);
  } else if (id === 'portal') {
    c.lineWidth = 7;
    c.beginPath();
    c.ellipse(0, 0, 29, 43, 0, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(0, 0, 18, 29, -0.3, 0, Math.PI * 2);
    c.stroke();
    circle(c, 0, 0, 5);
  } else if (id === 'ship' || id === 'wreck') {
    polygon(
      c,
      [
        [-45, 19],
        [-28, 39],
        [29, 39],
        [46, 19],
      ],
      color + '99',
    );
    line(c, [
      [0, -44],
      [0, 19],
    ]);
    polygon(
      c,
      [
        [3, -39],
        [36, 9],
        [3, 9],
      ],
      '#e2d7b7',
    );
    polygon(
      c,
      [
        [-4, -30],
        [-31, 9],
        [-4, 9],
      ],
      '#cbbd99',
    );
    if (id === 'wreck') {
      line(c, [
        [-50, -20],
        [50, 46],
      ]);
      line(c, [
        [-12, 17],
        [1, 27],
        [-5, 39],
      ]);
    }
  } else if (id === 'chest') {
    c.fillStyle = '#c4a16e';
    c.beginPath();
    c.roundRect(-35, -18, 70, 54, [13, 13, 2, 2]);
    c.fill();
    c.stroke();
    line(c, [
      [-35, 1],
      [35, 1],
    ]);
    line(c, [
      [-18, -17],
      [-18, 35],
    ]);
    line(c, [
      [18, -17],
      [18, 35],
    ]);
    c.fillStyle = color;
    c.fillRect(-6, -3, 12, 15);
  } else if (id === 'skull') {
    c.beginPath();
    c.ellipse(0, -8, 33, 30, 0, 0, Math.PI * 2);
    c.fillStyle = '#dfd6bc';
    c.fill();
    c.stroke();
    c.fillStyle = color;
    circle(c, -13, -10, 9, color);
    circle(c, 13, -10, 9, color);
    polygon(
      c,
      [
        [-5, 8],
        [5, 8],
        [0, 0],
      ],
      color,
    );
    c.strokeRect(-18, 18, 36, 18);
    for (const x of [-9, 0, 9])
      line(c, [
        [x, 19],
        [x, 35],
      ]);
  } else if (id === 'flag') {
    c.lineWidth = 3;
    line(c, [
      [-23, 42],
      [-23, -45],
    ]);
    polygon(
      c,
      [
        [-23, -43],
        [38, -34],
        [11, -16],
        [-23, -24],
      ],
      color + 'aa',
    );
  } else if (id === 'fire') {
    line(c, [
      [-30, 35],
      [28, 23],
    ]);
    line(c, [
      [-28, 23],
      [30, 35],
    ]);
    polygon(
      c,
      [
        [-22, 19],
        [-14, -13],
        [-4, 0],
        [7, -39],
        [16, -6],
        [27, 19],
        [4, 29],
      ],
      '#c98e4b',
    );
    polygon(
      c,
      [
        [-8, 19],
        [2, -7],
        [11, 18],
      ],
      '#e7cd88',
    );
  } else if (id === 'door') {
    c.fillStyle = '#b49871';
    c.beginPath();
    c.roundRect(-25, -39, 50, 79, [21, 21, 0, 0]);
    c.fill();
    c.stroke();
    line(c, [
      [0, -37],
      [0, 39],
    ]);
    circle(c, 13, 7, 3, color);
  } else if (id === 'stairs') {
    for (let i = 0; i < 6; i++) {
      const y = 32 - i * 12;
      c.strokeRect(-36 + i * 4, y, 72 - i * 8, 9);
    }
  } else if (id === 'trap') {
    polygon(
      c,
      [
        [0, -41],
        [45, 37],
        [-45, 37],
      ],
      '#d9bd81',
    );
    c.lineWidth = 6;
    line(c, [
      [0, -14],
      [0, 10],
    ]);
    circle(c, 0, 24, 3, color);
  } else if (id === 'well' || id === 'fountain') {
    c.fillStyle = '#b9b7a0';
    c.beginPath();
    c.ellipse(0, 19, 34, 17, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.ellipse(0, 7, 34, 17, 0, 0, Math.PI * 2);
    c.fillStyle = '#88a6a6';
    c.fill();
    c.stroke();
    if (id === 'well') {
      line(c, [
        [-30, 6],
        [-30, -28],
        [30, -28],
        [30, 6],
      ]);
      polygon(
        c,
        [
          [-38, -29],
          [0, -47],
          [38, -29],
        ],
        color + '99',
      );
    } else {
      c.lineWidth = 5;
      line(c, [
        [0, 8],
        [0, -31],
      ]);
      c.beginPath();
      c.arc(0, -13, 20, Math.PI, 0);
      c.stroke();
    }
  } else if (id === 'altar') {
    polygon(
      c,
      [
        [-40, -9],
        [-30, -21],
        [29, -21],
        [40, -9],
        [40, 3],
        [-40, 3],
      ],
      '#c6bca6',
    );
    polygon(
      c,
      [
        [-26, 3],
        [-26, 34],
        [26, 34],
        [26, 3],
      ],
      '#ad9d7d',
    );
    line(c, [
      [0, -24],
      [0, -46],
    ]);
    line(c, [
      [-10, -37],
      [10, -37],
    ]);
  }
  c.restore();
}

function drawAssetImage(
  c: CanvasRenderingContext2D,
  id: string,
  size: number,
  images?: AssetImages,
) {
  const image = images?.[id];
  if (image?.naturalWidth) {
    const factor = size / Math.max(image.naturalWidth, image.naturalHeight);
    const width = image.naturalWidth * factor,
      height = image.naturalHeight * factor;
    c.drawImage(image, -width / 2, -height / 2, width, height);
  } else {
    c.save();
    c.strokeStyle = '#a68060';
    c.lineWidth = 2;
    c.setLineDash([4, 3]);
    c.strokeRect(-size / 2, -size / 2, size, size);
    c.restore();
  }
}
function drawToken(c: CanvasRenderingContext2D, o: TokenFeature, images?: AssetImages) {
  const r = o.size / 2;
  c.save();
  c.fillStyle = o.color;
  c.strokeStyle = o.faction === 'enemy' ? '#753e35' : o.faction === 'ally' ? '#3a6576' : '#665438';
  c.lineWidth = Math.max(2, o.size * 0.065);
  circle(c, 0, 0, r, o.color);
  if (o.asset_id) drawAssetImage(c, o.asset_id, o.size * 0.85, images);
  else drawGlyph(c, TOKEN_GLYPHS[o.icon], o.size * 0.78, '#fff4d5');
  c.restore();
  if (o.number) {
    c.save();
    c.fillStyle = '#f0e6ce';
    c.strokeStyle = '#594c35';
    c.lineWidth = 1;
    circle(c, r * 0.78, r * 0.65, r * 0.36, '#f0e6ce');
    c.fillStyle = '#493d29';
    c.font = `600 ${o.size * 0.22}px Inter,Arial,sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(o.number), r * 0.78, r * 0.65);
    c.restore();
  }
  if (o.name) {
    c.save();
    c.font = `600 ${Math.max(10, o.size * 0.21)}px Inter,Arial,sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.lineWidth = 3;
    c.strokeStyle = '#f3e7d3';
    c.fillStyle = '#463e30';
    const caption = o.name.length > 28 ? `${o.name.slice(0, 27)}…` : o.name;
    c.strokeText(caption, 0, r + 5);
    c.fillText(caption, 0, r + 5);
    c.restore();
  }
}

export function traceRoute(c: CanvasRenderingContext2D, points: Point[], curved = false) {
  c.beginPath();
  c.moveTo(points[0].x, points[0].y);
  if (curved && points.length > 2) {
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    const b = points.at(-1)!;
    c.lineTo(b.x, b.y);
  } else for (const p of points.slice(1)) c.lineTo(p.x, p.y);
}
export function drawFeature(
  c: CanvasRenderingContext2D,
  o: MapFeature,
  ink: string,
  images?: AssetImages,
) {
  c.save();
  c.translate(o.x, o.y);
  c.rotate((o.rotation * Math.PI) / 180);
  c.globalAlpha *= o.opacity;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (o.kind === 'symbol') {
    if (o.asset_id) drawAssetImage(c, o.asset_id, o.size, images);
    else drawSymbol(c, o.symbol, o.size, o.color);
  } else if (o.kind === 'token') drawToken(c, o, images);
  else if (o.kind === 'label') {
    c.fillStyle = o.color;
    c.font = `${o.italic ? 'italic ' : ''}${o.fontSize}px ${o.font === 'serif' ? 'Cinzel,Georgia,serif' : 'Inter,Arial,sans-serif'}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#eee2c7bb';
    c.shadowBlur = o.fontSize * 0.12;
    c.fillText(o.text, 0, 0);
  } else if (o.kind === 'region') {
    traceRoute(c, o.points);
    c.closePath();
    c.save();
    c.globalAlpha *= o.fillOpacity;
    c.fillStyle = o.fill;
    c.fill();
    c.restore();
    c.strokeStyle = o.color;
    c.lineWidth = o.width;
    c.stroke();
  } else {
    traceRoute(c, o.points, o.curved);
    c.lineWidth = o.width + (o.style === 'road' ? 3 : 0);
    c.strokeStyle = o.style === 'road' ? '#e8d5ac' : o.color;
    c.setLineDash(
      o.style === 'trail'
        ? [o.width, 3 * o.width]
        : o.style === 'border'
          ? [4 * o.width, 2 * o.width]
          : [],
    );
    c.stroke();
    if (o.style === 'road') {
      c.lineWidth = Math.max(1, o.width * 0.45);
      c.strokeStyle = o.color;
      c.setLineDash([o.width * 1.2, o.width]);
      c.stroke();
    }
    if (o.style === 'wall') {
      c.lineWidth = Math.max(1, o.width * 0.4);
      c.strokeStyle = ink;
      c.setLineDash([3, o.width]);
      c.stroke();
    }
    if (o.style === 'arrow') {
      const a = o.points.at(-2)!,
        b = o.points.at(-1)!,
        angle = Math.atan2(b.y - a.y, b.x - a.x),
        r = Math.max(12, o.width * 3);
      c.translate(b.x, b.y);
      c.rotate(angle);
      c.fillStyle = o.color;
      polygon(
        c,
        [
          [0, 0],
          [-r, -r * 0.5],
          [-r, r * 0.5],
        ],
        o.color,
      );
    }
  }
  c.restore();
}

const coastCases: Record<number, number[]> = {
  1: [3, 0],
  2: [0, 1],
  3: [3, 1],
  4: [1, 2],
  5: [3, 2, 0, 1],
  6: [0, 2],
  7: [3, 2],
  8: [2, 3],
  9: [2, 0],
  10: [0, 3, 1, 2],
  11: [1, 2],
  12: [1, 3],
  13: [0, 1],
  14: [3, 0],
};
export class AtlasPainter {
  private raster: HTMLCanvasElement | null = null;
  private coast: Path2D | null = null;
  private terrain: number[] | null = null;
  private heights: number[] | null = null;
  private palette: string[] | null = null;
  private relief: boolean | null = null;
  invalidateTerrain() {
    this.terrain = null;
  }
  private prepare(d: AtlasDocument) {
    if (
      this.terrain === d.terrain &&
      this.heights === d.elevation &&
      this.palette === d.palette &&
      this.relief === d.relief
    )
      return;
    const cols = Math.ceil(d.width / CELL),
      rows = Math.ceil(d.height / CELL),
      r = this.raster ?? document.createElement('canvas');
    r.width = cols * 2;
    r.height = rows * 2;
    const ctx = r.getContext('2d')!,
      image = ctx.createImageData(r.width, r.height),
      colors = d.palette.map((s) => [
        parseInt(s.slice(1, 3), 16),
        parseInt(s.slice(3, 5), 16),
        parseInt(s.slice(5, 7), 16),
      ]);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x,
          rgb = colors[d.terrain[i]],
          slope = d.relief
            ? ((d.elevation[Math.max(0, y - 1) * cols + Math.max(0, x - 1)] ?? 0) -
                (d.elevation[Math.min(rows - 1, y + 1) * cols + Math.min(cols - 1, x + 1)] ?? 0)) *
              0.027
            : 0;
        for (let yy = 0; yy < 2; yy++)
          for (let xx = 0; xx < 2; xx++) {
            const k = ((y * 2 + yy) * r.width + x * 2 + xx) * 4,
              grain = (((x * 29 + y * 47 + xx * 11 + yy * 19) % 17) - 8) * 0.45;
            for (let j = 0; j < 3; j++)
              image.data[k + j] = Math.max(0, Math.min(255, rgb[j] * (1 + slope) + grain));
            image.data[k + 3] = 255;
          }
      }
    ctx.putImageData(image, 0, 0);
    this.raster = r;
    this.coast = new Path2D();
    const land = (i: number) => (d.terrain[i] > 1 ? 1 : 0);
    for (let y = 0; y < rows - 1; y++)
      for (let x = 0; x < cols - 1; x++) {
        const i = y * cols + x,
          mask = land(i) + land(i + 1) * 2 + land(i + 1 + cols) * 4 + land(i + cols) * 8,
          edges = coastCases[mask];
        if (!edges) continue;
        const p = [
          [x + 1, y + 0.5],
          [x + 1.5, y + 1],
          [x + 1, y + 1.5],
          [x + 0.5, y + 1],
        ];
        for (let j = 0; j < edges.length; j += 2) {
          this.coast.moveTo(p[edges[j]][0] * CELL, p[edges[j]][1] * CELL);
          this.coast.lineTo(p[edges[j + 1]][0] * CELL, p[edges[j + 1]][1] * CELL);
        }
      }
    this.terrain = d.terrain;
    this.heights = d.elevation;
    this.palette = d.palette;
    this.relief = d.relief;
  }
  draw(
    c: CanvasRenderingContext2D,
    d: AtlasDocument,
    options: { includeTokens?: boolean; decoration?: boolean; assets?: AssetImages } = {},
  ) {
    seenSymbols.clear();
    const theme = THEMES[d.theme];
    c.save();
    c.beginPath();
    c.rect(0, 0, d.width, d.height);
    c.clip();
    c.fillStyle = theme.paper;
    c.fillRect(0, 0, d.width, d.height);
    for (const layer of d.layers) {
      if (!layer.visible || layer.opacity === 0) continue;
      c.save();
      c.globalAlpha = layer.opacity;
      if (layer.id === 'terrain') {
        this.prepare(d);
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(this.raster!, 0, 0, d.width, d.height);
        c.strokeStyle = '#dfd3aa';
        c.lineWidth = 3;
        c.stroke(this.coast!);
        c.strokeStyle = '#6b6d5660';
        c.lineWidth = 0.9;
        c.stroke(this.coast!);
        c.fillStyle = d.theme === 'night' ? '#000000' : '#534628';
        for (let i = 0; i < 1400; i++) {
          const x = (i * 739.73) % d.width,
            y = (i * 337.17) % d.height;
          c.globalAlpha = layer.opacity * (0.025 + (i % 7) * 0.003);
          c.fillRect(x, y, 1.4, 1.4);
        }
        c.globalAlpha = layer.opacity;
        if (d.grid !== 'none') {
          c.strokeStyle = d.gridColor;
          c.globalAlpha *= d.gridOpacity;
          c.lineWidth = 0.8;
          c.beginPath();
          if (d.grid === 'square') {
            for (let x = 0; x < d.width; x += CELL) {
              c.moveTo(x, 0);
              c.lineTo(x, d.height);
            }
            for (let y = 0; y < d.height; y += CELL) {
              c.moveTo(0, y);
              c.lineTo(d.width, y);
            }
          } else {
            const r = CELL * 0.9;
            for (let row = 0; row < d.height / (r * Math.sqrt(3)) + 1; row++)
              for (let col = 0; col < d.width / (r * 1.5) + 1; col++) {
                const x = col * r * 1.5,
                  y = (row + (col % 2) * 0.5) * r * Math.sqrt(3);
                for (let k = 0; k <= 6; k++) {
                  const a = (k * Math.PI) / 3,
                    px = x + Math.cos(a) * r,
                    py = y + Math.sin(a) * r;
                  k ? c.lineTo(px, py) : c.moveTo(px, py);
                }
              }
          }
          c.stroke();
        }
      } else
        for (const o of d.objects) {
          if (
            o.visible &&
            o.opacity > 0 &&
            FEATURE_LAYER[o.kind] === layer.id &&
            (options.includeTokens !== false || o.kind !== 'token')
          )
            drawFeature(c, o, theme.ink, options.assets);
        }
      c.restore();
    }
    if (options.decoration !== false) this.decoration(c, d);
    c.restore();
  }
  private decoration(c: CanvasRenderingContext2D, d: AtlasDocument) {
    const t = THEMES[d.theme],
      s = Math.max(0.6, Math.min(d.width, d.height) / 1000);
    c.save();
    c.strokeStyle = t.frame;
    c.lineWidth = 2 * s;
    c.strokeRect(12 * s, 12 * s, d.width - 24 * s, d.height - 24 * s);
    c.lineWidth = 0.65 * s;
    c.strokeRect(17 * s, 17 * s, d.width - 34 * s, d.height - 34 * s);
    const titleSize = 30 * s;
    c.font = `500 ${titleSize}px Cinzel,Georgia,serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = t.paper + 'e8';
    const tw = Math.min(d.width * 0.72, c.measureText(d.title).width + 58 * s);
    c.beginPath();
    c.roundRect((d.width - tw) / 2, 24 * s, tw, 52 * s, 3 * s);
    c.fill();
    c.strokeStyle = t.frame;
    c.lineWidth = 0.7 * s;
    c.stroke();
    c.fillStyle = t.ink;
    c.fillText(d.title, d.width / 2, 50 * s, tw - 22 * s);
    if (d.compass) {
      c.save();
      c.translate(d.width - 79 * s, 108 * s);
      c.scale(s, s);
      c.fillStyle = t.paper + 'd0';
      c.strokeStyle = t.ink;
      c.lineWidth = 1;
      circle(c, 0, 0, 36, t.paper + 'c0');
      for (let i = 0; i < 8; i++) {
        c.save();
        c.rotate((i * Math.PI) / 4);
        polygon(
          c,
          [
            [0, -46],
            [-5, 0],
            [0, 7],
            [5, 0],
          ],
          i % 2 ? t.paper : t.ink,
        );
        c.restore();
      }
      c.fillStyle = t.ink;
      c.font = '600 15px Georgia,serif';
      c.textAlign = 'center';
      c.fillText('N', 0, -59);
      c.restore();
    }
    if (d.scaleBar) {
      const count = 5,
        step = 24 * s,
        length = step * count,
        value = (length / CELL) * d.distancePerCell;
      c.save();
      c.translate(40 * s, d.height - 55 * s);
      c.fillStyle = t.paper + 'd9';
      c.fillRect(-12 * s, -32 * s, length + 24 * s, 59 * s);
      for (let i = 0; i < count; i++) {
        c.fillStyle = i % 2 ? t.paper : t.ink;
        c.fillRect(i * step, 0, step, 6 * s);
        c.strokeStyle = t.ink;
        c.lineWidth = s;
        c.strokeRect(i * step, 0, step, 6 * s);
      }
      c.fillStyle = t.ink;
      c.font = `${12 * s}px Inter,Arial,sans-serif`;
      c.textAlign = 'left';
      c.fillText('0', 0, -9 * s);
      c.textAlign = 'right';
      c.fillText(
        `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${d.unit}`,
        length,
        -9 * s,
      );
      c.restore();
    }
    c.restore();
  }
}
export function drawSelection(c: CanvasRenderingContext2D, o: MapFeature, zoom: number) {
  c.save();
  c.translate(o.x, o.y);
  c.rotate((o.rotation * Math.PI) / 180);
  const b = featureBounds(o),
    p = 7 / zoom;
  c.strokeStyle = '#e0af50';
  c.lineWidth = 1.6 / zoom;
  c.setLineDash([5 / zoom, 3 / zoom]);
  c.strokeRect(b.x - p, b.y - p, b.width + 2 * p, b.height + 2 * p);
  c.restore();
}
export function exportAtlasCanvas(
  d: AtlasDocument,
  width = d.width,
  includeTokens = true,
  assets?: AssetImages,
) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.max(1, Math.round((d.height * width) / d.width));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não conseguiu preparar a imagem do mapa.');
  ctx.scale(canvas.width / d.width, canvas.height / d.height);
  new AtlasPainter().draw(ctx, d, { includeTokens, assets });
  return canvas;
}
export function atlasThumbnail(d: AtlasDocument, assets?: AssetImages) {
  return exportAtlasCanvas(d, 320, true, assets).toDataURL('image/webp', 0.7);
}
