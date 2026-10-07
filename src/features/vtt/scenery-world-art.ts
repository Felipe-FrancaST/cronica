// Hand-drawn overhead symbols in normalized cell coordinates, matching the 3D footprints.
export function drawWorldScenery2D(
  ctx: CanvasRenderingContext2D,
  kind: string,
  variant: string,
  color: (base: string) => string,
) {
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = color(c);
    ctx.fillRect(x, y, w, h);
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, c: string) => {
    ctx.fillStyle = color(c);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = (x: number, y: number, ex: number, ey: number, c: string, w = 0.025) => {
    ctx.strokeStyle = color(c);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  };
  const triangle = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = color(c);
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2);
    ctx.lineTo(x + w / 2, y + h / 2);
    ctx.lineTo(x - w / 2, y + h / 2);
    ctx.closePath();
    ctx.fill();
  };
  if (kind === 'mountain' && variant !== 'default') {
    triangle(
      -0.05,
      0,
      0.83,
      0.83,
      variant === 'desert' ? '#b39169' : variant === 'volcano' ? '#777b6d' : '#a5b7ba',
    );
    triangle(0.24, 0.15, 0.42, 0.46, variant === 'desert' ? '#d5b486' : '#dce7dc');
    if (variant === 'volcano') {
      ellipse(-0.05, -0.18, 0.13, 0.08, '#ef8b42');
      line(-0.02, -0.16, 0.15, 0.27, '#f8b567', 0.045);
    } else if (variant === 'snowy') triangle(-0.05, -0.22, 0.38, 0.36, '#f1f6ed');
  } else if (kind === 'rock' && !['default', 'crystal'].includes(variant)) {
    const c = variant === 'desert' ? '#c8a371' : variant === 'ice' ? '#a7d5dd' : '#abb2a0',
      count = variant === 'boulder' ? 1 : variant === 'pile' ? 7 : 3;
    for (let i = 0; i < count; i++)
      ellipse(
        count === 1 ? 0 : Math.cos(i * 2.4) * 0.24,
        count === 1 ? 0 : Math.sin(i * 2.4) * 0.23,
        count === 1 ? 0.38 : count > 3 ? 0.13 : 0.2,
        count === 1 ? 0.36 : 0.16,
        c,
      );
    if (variant === 'moss') ellipse(-0.08, -0.06, 0.21, 0.12, '#6a9356');
    if (variant === 'ice') line(-0.18, -0.2, 0.2, 0.17, '#e8fbf6', 0.045);
  } else if (kind === 'ruin' && variant !== 'default') {
    if (variant === 'wall')
      for (let i = 0; i < 6; i++)
        rect(
          ((i % 3) - 1) * 0.25 - 0.11,
          Math.floor(i / 3) * 0.16 - 0.15,
          0.22,
          0.14,
          i % 2 ? '#a0a88f' : '#c7c3a5',
        );
    else {
      for (const x of [-0.3, 0.3]) {
        ellipse(x, -0.15, 0.12, 0.13, '#bebca4');
        ellipse(x, 0.23, 0.1, 0.1, '#9aa48f');
      }
      if (variant !== 'columns') rect(-0.4, -0.35, 0.8, 0.17, '#ccc7ad');
      if (variant === 'temple') {
        rect(-0.43, 0.33, 0.86, 0.06, '#8a9983');
        triangle(0, -0.28, 0.75, 0.31, '#a7b295');
      }
    }
  } else if (kind === 'cart' && variant !== 'default') {
    rect(-0.33, -0.35, 0.66, 0.71, '#ac8959');
    for (const x of [-0.4, 0.34])
      for (const y of [-0.25, 0.2])
        if (!(variant === 'broken' && x > 0 && y > 0)) rect(x, y, 0.07, 0.16, '#494b40');
    line(-0.18, 0.35, -0.18, 0.47, '#c2a372');
    line(0.18, 0.35, 0.18, 0.47, '#c2a372');
    if (variant === 'covered') {
      rect(-0.31, -0.33, 0.62, 0.66, '#ddcba3');
      for (const y of [-0.2, 0, 0.2]) line(-0.3, y, 0.3, y, '#b4a67f');
    } else if (variant === 'goods') {
      rect(-0.25, -0.26, 0.25, 0.28, '#dbc294');
      ellipse(0.17, 0.12, 0.12, 0.13, '#94754e');
    } else line(-0.27, -0.28, 0.28, 0.26, '#dbc297', 0.09);
  } else if (kind === 'tent' && variant !== 'default') {
    const c = variant === 'desert' ? '#d8bf8d' : variant === 'war' ? '#a96863' : '#91b0a2';
    rect(-0.43, -0.4, 0.86, 0.8, c);
    triangle(0, 0, 0.81, 0.8, c);
    line(0, -0.39, 0, 0.37, '#e7d8b3', 0.035);
    for (const x of [-0.4, 0.4])
      for (const y of [-0.39, 0.39]) ellipse(x, y, 0.025, 0.025, '#bca476');
    if (variant === 'war') triangle(0.31, -0.24, 0.18, 0.21, '#774947');
  } else if (kind === 'bush' && ['desert', 'frost'].includes(variant)) {
    if (variant === 'desert') {
      rect(-0.075, -0.33, 0.15, 0.68, '#849e63');
      rect(-0.29, -0.13, 0.21, 0.1, '#748c52');
      rect(0.08, 0.06, 0.2, 0.1, '#748c52');
      ellipse(-0.25, -0.18, 0.05, 0.14, '#95a66c');
      ellipse(0.24, 0.04, 0.055, 0.13, '#95a66c');
    } else
      for (let i = 0; i < 3; i++) {
        ellipse((i - 1) * 0.2, i === 1 ? -0.15 : 0.12, 0.24, 0.22, '#83afb0');
        ellipse((i - 1) * 0.2, i === 1 ? -0.17 : 0.09, 0.18, 0.13, '#e6f6ef');
      }
  } else if (kind === 'flowers' && ['roses', 'sunflowers', 'lavender', 'dead'].includes(variant)) {
    for (let i = 0; i < 4; i++) {
      const x = Math.cos(i * 2.4) * 0.25,
        y = Math.sin(i * 2.4) * 0.25;
      if (variant === 'lavender') {
        line(x, y - 0.15, x, y + 0.12, '#a494d0', 0.07);
        ellipse(x, y - 0.1, 0.045, 0.07, '#c7b4e6');
      } else {
        for (let j = 0; j < 7; j++)
          ellipse(
            x + Math.cos((j * Math.PI * 2) / 7) * 0.066,
            y + Math.sin((j * Math.PI * 2) / 7) * 0.066,
            0.05,
            0.05,
            variant === 'roses' ? '#cf7186' : variant === 'dead' ? '#b8a28b' : '#efd473',
          );
        ellipse(x, y, 0.037, 0.037, variant === 'roses' ? '#eaa5b3' : '#786046');
      }
    }
  } else if (kind === 'grass') {
    const c = variant === 'dry' ? '#b6ab7a' : '#73914c';
    rect(-0.48, -0.48, 0.96, 0.96, variant === 'dry' ? '#92865d' : '#47633d');
    for (let i = 0; i < 13; i++) {
      const x = (((i * 7) % 11) - 5) * 0.075,
        y = (((i * 3) % 11) - 5) * 0.075;
      line(x, y + 0.04, x - 0.025, y - (variant === 'tall' ? 0.13 : 0.07), c, 0.02);
      line(x, y + 0.04, x + 0.035, y - 0.04, c, 0.02);
    }
  } else if (kind === 'crops') {
    rect(-0.47, -0.47, 0.94, 0.94, '#5f4931');
    for (const y of [-0.3, 0, 0.3]) {
      line(-0.42, y, 0.42, y, '#947244', 0.05);
      for (const x of [-0.3, 0, 0.3]) {
        if (variant === 'pumpkins') {
          ellipse(x, y, 0.09, 0.08, '#e2a352');
          line(x, y - 0.08, x + 0.02, y - 0.11, '#719450');
        } else if (variant === 'vegetables') ellipse(x, y, 0.085, 0.078, '#9fb36b');
        else if (variant === 'vineyard') {
          line(x, y - 0.11, x, y + 0.1, '#7ca064', 0.035);
          ellipse(x + 0.025, y, 0.044, 0.043, '#a985ae');
        } else {
          line(x, y + 0.09, x, y - 0.1, variant === 'corn' ? '#7a9c55' : '#c4b467', 0.023);
          ellipse(x, y - 0.07, 0.035, 0.071, variant === 'corn' ? '#ebce6d' : '#e5cf8e');
        }
      }
    }
  } else if (kind === 'counter' || kind === 'market') {
    rect(-0.43, -0.23, 0.86, 0.46, variant === 'stone' ? '#bcc5af' : '#cbb184');
    line(-0.38, 0.12, 0.38, 0.12, '#8a724e', 0.04);
    if (kind === 'market') {
      rect(-0.46, -0.3, 0.92, 0.26, '#c09473');
      for (const x of [-0.32, -0.1, 0.12, 0.34]) rect(x, -0.3, 0.1, 0.26, '#e4d0ac');
      for (const x of [-0.25, 0, 0.25])
        variant === 'weapons'
          ? line(x, 0.07, x, 0.25, '#d8e2dc', 0.025)
          : ellipse(x, 0.12, 0.054, 0.06, variant === 'produce' ? '#a9b26d' : '#dcad63');
    } else if (variant === 'merchant') {
      rect(-0.24, -0.19, 0.48, 0.3, '#a37d92');
      ellipse(0.26, 0, 0.06, 0.06, '#d2c28c');
    } else for (const x of [-0.24, 0, 0.24]) ellipse(x, -0.04, 0.038, 0.04, '#e5d8b5');
  } else if (kind === 'gravestone' || kind === 'cross') {
    if (kind === 'cross') {
      rect(-0.075, -0.4, 0.15, 0.8, variant === 'default' ? '#baa17a' : '#c1cfbe');
      rect(-0.29, -0.22, 0.58, 0.13, variant === 'default' ? '#baa17a' : '#c1cfbe');
      if (variant === 'rune') line(0, -0.15, 0, 0.25, '#9ee3d8', 0.03);
    } else {
      rect(-0.25, -0.26, 0.5, 0.59, '#aebca8');
      if (variant !== 'broken') ellipse(0, -0.26, 0.25, 0.16, '#cbd2b9');
      for (const y of [-0.07, 0.03, 0.13]) line(-0.14, y, 0.14, y, '#6e7d6c', 0.021);
      if (variant === 'ornate') {
        line(0, -0.32, 0, -0.14, '#e5dfc1');
        line(-0.07, -0.25, 0.07, -0.25, '#e5dfc1');
      }
      if (variant === 'broken') ellipse(0.28, 0.23, 0.12, 0.1, '#98a78e');
    }
  } else if (kind === 'fence') {
    if (variant === 'stone')
      for (let i = 0; i < 8; i++)
        rect(
          ((i % 4) - 1.5) * 0.22 - 0.1,
          Math.floor(i / 4) * 0.17 - 0.17,
          0.2,
          0.14,
          i % 2 ? '#a6b298' : '#c1c5aa',
        );
    else {
      line(-0.45, -0.08, 0.45, -0.08, variant === 'iron' ? '#aabbb2' : '#c4ad83', 0.04);
      line(-0.45, 0.09, 0.45, 0.09, variant === 'iron' ? '#8b9c93' : '#a9936d', 0.04);
      for (let i = 0; i < (variant === 'default' ? 3 : 7); i++) {
        const x = (i - (variant === 'default' ? 1 : 3)) * (variant === 'default' ? 0.4 : 0.12);
        line(
          x,
          -0.25,
          x,
          0.23,
          variant === 'iron' ? '#74887e' : '#b6a079',
          variant === 'iron' ? 0.025 : 0.055,
        );
      }
    }
  } else if (kind === 'well') {
    ellipse(0, 0, 0.37, 0.35, '#bcc4ae');
    ellipse(0, 0, 0.25, 0.25, '#233b40');
    if (variant !== 'ruined') {
      line(-0.36, 0, 0.36, 0, '#bfaa7d', 0.07);
      line(0, 0, 0, 0.19, '#e2d0a0', 0.02);
    }
    if (variant === 'roofed') {
      rect(-0.4, -0.17, 0.8, 0.34, '#bd8d71');
      line(-0.41, 0, 0.41, 0, '#e2b99a', 0.04);
    }
  } else if (kind === 'bridge') {
    rect(-0.34, -0.48, 0.68, 0.96, variant === 'stone' ? '#b2bfa8' : '#b69f74');
    for (const y of [-0.4, -0.2, 0, 0.2, 0.4]) line(-0.32, y, 0.32, y, '#7d886e');
    line(-0.39, -0.46, -0.39, 0.46, variant === 'rope' ? '#dacda5' : '#abb69b', 0.05);
    line(0.39, -0.46, 0.39, 0.46, variant === 'rope' ? '#dacda5' : '#abb69b', 0.05);
  } else if (kind === 'table' || kind === 'chair') {
    if (variant === 'round' || variant === 'stool')
      ellipse(0, 0, kind === 'table' ? 0.38 : 0.23, kind === 'table' ? 0.37 : 0.22, '#c7b085');
    else
      rect(
        kind === 'chair' ? -0.22 : -0.4,
        kind === 'chair' ? -0.2 : -0.3,
        kind === 'chair' ? 0.44 : 0.8,
        kind === 'chair' ? 0.4 : 0.6,
        '#c4a87c',
      );
    if (kind === 'chair' && variant !== 'stool')
      rect(-0.24, -0.28, 0.48, 0.09, variant === 'throne' ? '#beac7c' : '#8d7655');
    if (variant === 'throne') rect(-0.18, -0.17, 0.36, 0.33, '#926e99');
    if (variant === 'feast')
      for (const x of [-0.25, 0, 0.25]) {
        ellipse(x, 0, 0.068, 0.07, '#e1dab6');
        ellipse(x, 0.015, 0.033, 0.029, '#dba873');
      }
  } else if (kind === 'bookshelf') {
    rect(-0.41, -0.23, 0.82, 0.46, '#a38960');
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 0.12;
      if (variant === 'potions')
        ellipse(x, 0, 0.04, 0.06, ['#ab8fbe', '#94c4af', '#a6bdcd'][i % 3]);
      else
        rect(
          x - 0.038,
          -0.15,
          0.077,
          0.3,
          variant === 'scrolls' ? '#e1d5b2' : ['#a191b3', '#bba16d', '#8aaeb0'][i % 3],
        );
    }
  } else if (kind === 'torch') {
    ellipse(0, 0, 0.15, 0.15, variant === 'arcane' ? '#a9d5df' : '#e9ba6a');
    ellipse(0, 0, 0.065, 0.07, variant === 'arcane' ? '#e4f9f7' : '#fff0be');
    if (variant === 'lantern') {
      ctx.strokeStyle = '#899b89';
      ctx.lineWidth = 0.04;
      ctx.strokeRect(-0.17, -0.16, 0.34, 0.32);
    }
  } else if (kind === 'signpost') {
    rect(-0.035, -0.4, 0.07, 0.8, '#b79e70');
    if (variant === 'banner') rect(-0.21, -0.32, 0.49, 0.59, '#b27b80');
    else {
      rect(-0.3, -0.22, 0.64, 0.18, '#d2bd91');
      if (variant === 'forked') rect(-0.35, 0.12, 0.59, 0.17, '#bbaa77');
      line(-0.21, -0.13, 0.2, -0.13, '#6b644c');
    }
  } else return false;
  return true;
}
