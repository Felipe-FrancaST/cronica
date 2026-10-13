/** Top-down counterparts to the dungeon models, in a normalized footprint. */
export function drawDungeonScenery2D(
  ctx: CanvasRenderingContext2D,
  kind: string,
  variant: string,
  paint: (color: string) => string,
) {
  if (
    ![
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
    ].includes(kind)
  )
    return false;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = paint(color);
    ctx.fillRect(x, y, w, h);
  };
  const circle = (x: number, y: number, r: number, color: string) => {
    ctx.fillStyle = paint(color);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = (ax: number, ay: number, bx: number, by: number, color: string, width = 0.02) => {
    ctx.strokeStyle = paint(color);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };
  const ring = (r: number, color: string, width = 0.016) => {
    ctx.strokeStyle = paint(color);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  const wood = '#986a43',
    iron = '#70808a',
    stone = '#a09f91',
    gold = '#e3b853',
    glow = variant === 'spent' ? '#5b6871' : '#b78aff';
  if (kind === 'door' || kind === 'portcullis') {
    rect(-0.47, -0.17, 0.12, 0.34, stone);
    rect(0.35, -0.17, 0.12, 0.34, stone);
    const open = variant.endsWith('open');
    if (kind === 'door') {
      ctx.save();
      ctx.translate(-0.35, 0);
      ctx.rotate(open ? -Math.PI / 2 : 0);
      rect(0, -0.055, 0.7, 0.11, variant.startsWith('iron') ? iron : wood);
      line(0.08, -0.03, 0.61, -0.03, '#d4ad73', 0.009);
      circle(0.61, 0.06, 0.025, gold);
      ctx.restore();
      if (open) {
        ctx.setLineDash([0.03, 0.03]);
        line(-0.35, 0, 0.34, 0, '#d4c7aa', 0.009);
        ctx.setLineDash([]);
      }
    } else {
      rect(-0.35, open ? -0.15 : -0.035, 0.7, 0.07, iron);
      for (let i = 0; i < 7; i++)
        rect(-0.31 + i * 0.1, open ? -0.19 : -0.12, 0.025, open ? 0.13 : 0.24, '#bbc1bc');
    }
  } else if (kind === 'pillar') {
    rect(-0.37, -0.37, 0.74, 0.74, '#696c64');
    circle(0, 0, 0.31, stone);
    circle(-0.04, -0.04, 0.22, '#c2bcaa');
    if (variant === 'broken') {
      line(-0.16, -0.23, 0.02, 0.04, '#565c55', 0.04);
      line(0.02, 0.04, 0.23, 0.13, '#565c55', 0.04);
    } else ring(0.26, '#858677', 0.025);
  } else if (kind === 'altar') {
    rect(-0.44, -0.34, 0.88, 0.68, '#696f65');
    rect(-0.41, -0.3, 0.82, 0.59, stone);
    rect(-0.17, -0.32, 0.34, 0.67, variant === 'arcane' ? '#674b87' : '#a34f51');
    for (const x of [-0.3, 0.3]) {
      circle(x, -0.14, 0.055, gold);
      circle(x, -0.14, 0.022, '#fff0b2');
    }
    if (variant === 'arcane') {
      circle(0, 0, 0.095, glow);
      line(-0.06, 0, 0, -0.07, '#e9d6ff');
    }
  } else if (kind === 'sarcophagus') {
    rect(-0.34, -0.45, 0.68, 0.9, '#747971');
    rect(-0.27, -0.38, 0.54, 0.76, variant === 'open' ? '#28342f' : '#b5b19f');
    if (variant === 'open') {
      rect(-0.24, -0.48, 0.62, 0.19, stone);
      circle(0, -0.17, 0.075, '#d5caae');
      line(0, -0.05, 0, 0.25, '#d5caae', 0.035);
      for (let i = 0; i < 4; i++) line(-0.1, i * 0.055, 0.1, i * 0.055, '#d5caae', 0.018);
    } else {
      line(0, -0.25, 0, 0.26, gold, 0.035);
      line(-0.13, -0.1, 0.13, -0.1, gold, 0.035);
    }
  } else if (kind === 'cage') {
    rect(-0.45, -0.45, 0.9, 0.9, '#303a38');
    for (const x of [-0.43, 0.43]) line(x, -0.43, x, 0.43, iron, 0.04);
    line(-0.43, -0.43, 0.43, -0.43, iron, 0.04);
    if (variant !== 'open') line(-0.43, 0.43, 0.43, 0.43, iron, 0.04);
    for (let i = 0; i < 6; i++) {
      circle(-0.43, -0.4 + i * 0.16, 0.025, '#bfc6bb');
      circle(0.43, -0.4 + i * 0.16, 0.025, '#bfc6bb');
    }
    if (variant === 'open') line(-0.43, 0.43, -0.43, 0.1, '#c7b991', 0.04);
  } else if (kind === 'weaponrack') {
    rect(-0.4, -0.24, 0.8, 0.48, '#57432f');
    rect(-0.42, -0.08, 0.84, 0.16, wood);
    if (variant === 'armor') {
      rect(-0.21, -0.31, 0.42, 0.53, iron);
      circle(0, -0.27, 0.12, '#a5b6ba');
    } else
      for (const x of [-0.25, 0, 0.25]) {
        line(x, -0.38, x, 0.2, '#cbd5d2', 0.03);
        line(x - 0.08, 0.18, x + 0.08, 0.18, gold, 0.025);
        line(x, 0.2, x, 0.36, wood, 0.035);
      }
  } else if (kind === 'lever') {
    rect(-0.28, -0.23, 0.56, 0.46, '#6e756a');
    circle(0, 0, 0.12, iron);
    const y = variant === 'activated' ? 0.32 : -0.32;
    line(0, 0, 0, y, '#c0c6bb', 0.045);
    circle(0, y, 0.075, '#cd6556');
  } else if (kind === 'trap') {
    rect(-0.44, -0.44, 0.88, 0.88, '#36413e');
    ctx.shadowBlur = 0;
    if (variant === 'runes') {
      ring(0.32, glow, 0.035);
      for (let i = 0; i < 6; i++)
        circle(
          Math.cos((i * Math.PI) / 3) * 0.23,
          Math.sin((i * Math.PI) / 3) * 0.23,
          0.025,
          '#e5c6ff',
        );
    } else
      for (let x = -1; x <= 1; x++)
        for (let y = -1; y <= 1; y++) {
          circle(x * 0.25, y * 0.25, 0.06, variant === 'disarmed' ? '#617368' : iron);
          if (variant !== 'disarmed') circle(x * 0.25 - 0.01, y * 0.25 - 0.01, 0.024, '#e1e5d6');
        }
  } else if (kind === 'treasure') {
    circle(0, 0, 0.35, '#987131');
    for (let i = 0; i < 32; i++) {
      const a = i * 2.4,
        r = 0.06 + (i % 6) * 0.055;
      circle(Math.cos(a) * r, Math.sin(a) * r, 0.044, i % 2 ? '#d7a443' : '#f4d476');
    }
    if (variant === 'gems')
      for (let i = 0; i < 6; i++) {
        const x = Math.sin(i * 3) * 0.25,
          y = Math.cos(i * 3) * 0.2;
        ctx.fillStyle = paint(i % 2 ? '#d4779a' : '#63c0c1');
        ctx.beginPath();
        ctx.moveTo(x, y - 0.055);
        ctx.lineTo(x + 0.05, y);
        ctx.lineTo(x, y + 0.055);
        ctx.lineTo(x - 0.05, y);
        ctx.closePath();
        ctx.fill();
      }
  } else if (kind === 'rubble' || kind === 'stalagmite') {
    for (let i = 0; i < (kind === 'rubble' ? 14 : 5); i++) {
      const x = Math.sin(i * 2.4) * 0.31,
        y = Math.cos(i * 2.4) * 0.3,
        r = 0.06 + (i % 4) * 0.016;
      circle(x, y, r, variant === 'crystal' ? glow : i % 2 ? '#8c8b7a' : '#b1ad97');
      line(x - r / 2, y, x, y - r / 2, '#d2d0b7', 0.012);
    }
  } else if (kind === 'web') {
    ctx.shadowBlur = 0;
    ctx.globalAlpha *= 0.82;
    for (const r of [0.12, 0.23, 0.34, 0.46]) ring(r, '#c6d8d2', 0.01);
    for (let i = 0; i < 10; i++)
      line(
        0,
        0,
        Math.cos((i * Math.PI) / 5) * 0.46,
        Math.sin((i * Math.PI) / 5) * 0.46,
        '#d9e6e0',
        0.009,
      );
  } else if (kind === 'ladder') {
    for (const x of [-0.28, 0.28])
      line(x, -0.45, x, 0.45, variant === 'rope' ? '#d4c18d' : wood, 0.035);
    for (let i = 0; i < 7; i++)
      line(-0.29, -0.38 + i * 0.125, 0.29, -0.38 + i * 0.125, '#c39964', 0.03);
  } else if (kind === 'magiccircle') {
    ctx.shadowColor = paint(glow);
    ctx.shadowBlur = variant === 'spent' ? 0 : 3;
    for (const r of [0.29, 0.41, 0.46]) ring(r, glow, 0.009);
    const n = variant === 'summoning' ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n,
        b = ((i + (n === 5 ? 2 : 1)) * Math.PI * 2) / n;
      line(
        Math.cos(a) * 0.29,
        Math.sin(a) * 0.29,
        Math.cos(b) * 0.29,
        Math.sin(b) * 0.29,
        glow,
        0.012,
      );
    }
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      line(
        Math.cos(a) * 0.35,
        Math.sin(a) * 0.35,
        Math.cos(a) * 0.38,
        Math.sin(a) * 0.38,
        glow,
        0.014,
      );
    }
  } else if (kind === 'barricade') {
    for (const x of [-0.34, 0.34]) line(x, -0.28, x, 0.28, '#57432e', 0.085);
    line(-0.45, -0.14, 0.45, 0.1, wood, 0.09);
    line(-0.45, 0.1, 0.45, -0.14, '#c19560', 0.07);
    if (variant === 'spikes')
      for (let i = 0; i < 6; i++)
        line(-0.35 + i * 0.14, 0.02, -0.35 + i * 0.14, 0.4, '#d4b582', 0.035);
  }
  return true;
}
