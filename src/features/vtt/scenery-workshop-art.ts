import { sceneryPalette } from './scenery-styles';

export function drawWorkshopScenery2D(
  ctx: CanvasRenderingContext2D,
  kind: string,
  variant: string,
  tint: (color: string) => string,
  style: unknown,
  width = 4,
  depth = 4,
) {
  if (
    ![
      'house',
      'tavern',
      'forge',
      'stable',
      'wall',
      'floor',
      'stairs',
      'bed',
      'rug',
      'doorway',
      'fountain',
    ].includes(kind)
  )
    return false;
  const chosen = sceneryPalette(style);
  const palette = {
    ...chosen,
    ...(chosen.id === 'original' && kind === 'house' && variant === 'desert'
      ? { wall: '#d7b77f', cloth: '#3e8c8a' }
      : {}),
    ...(chosen.id === 'original' && kind === 'house' && variant === 'cottage'
      ? { roof: '#b2a165' }
      : {}),
    ...(chosen.id === 'original' && kind === 'tavern' && variant === 'port'
      ? { roof: '#537f91' }
      : {}),
  };
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = ['#253138', '#ffd17b'].includes(color) ? color : tint(color);
    ctx.fillRect(x, y, w, h);
  };
  const circle = (x: number, y: number, radius: number, color: string, accent = false) => {
    ctx.fillStyle = accent ? color : tint(color);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = (x: number, y: number, x2: number, y2: number, color: string, width = 0.018) => {
    ctx.strokeStyle = tint(color);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  ctx.shadowBlur = 0;
  if (kind === 'house' || kind === 'tavern' || kind === 'stable') {
    rect(-0.46, -0.46, 0.92, 0.92, palette.stone);
    const open = variant === 'open';
    if (open) {
      rect(-0.4, -0.4, 0.8, 0.8, palette.wood);
      for (let n = 0; n < 6; n++)
        line(-0.37, -0.33 + n * 0.12, 0.37, -0.33 + n * 0.12, palette.wall, 0.01);
      if (kind === 'tavern') {
        rect(-0.32, -0.36, 0.64, 0.15, palette.wood);
        for (const x of [-0.18, 0.18]) {
          circle(x, 0.17, 0.14, palette.wall);
          circle(x - 0.1, 0.34, 0.046, palette.wood);
          circle(x + 0.1, 0.34, 0.046, palette.wood);
          circle(x, 0.17, 0.024, '#ffd17b', true);
        }
      } else {
        for (const x of [-0.19, 0.19]) {
          rect(x - 0.015, -0.32, 0.03, 0.63, palette.wall);
          rect(x - 0.1, -0.28, 0.2, 0.16, palette.roof);
        }
      }
      for (const x of [-0.39, 0.34])
        for (const y of [-0.39, 0.34]) rect(x, y, 0.05, 0.05, palette.wood);
    } else if (variant === 'tower') {
      rect(-0.36, -0.36, 0.72, 0.72, palette.stone);
      rect(-0.27, -0.27, 0.54, 0.54, palette.wood);
      for (const x of [-0.36, -0.065, 0.23])
        for (const y of [-0.41, 0.29]) rect(x, y, 0.13, 0.13, palette.wall);
      for (const y of [-0.1, 0.15]) {
        rect(-0.42, y, 0.12, 0.13, palette.wall);
        rect(0.3, y, 0.12, 0.13, palette.wall);
      }
    } else if (variant === 'desert') {
      rect(-0.42, -0.42, 0.84, 0.84, palette.wall);
      rect(-0.34, -0.34, 0.68, 0.68, palette.stone);
      rect(-0.15, -0.17, 0.43, 0.43, palette.cloth);
      circle(-0.22, 0.26, 0.075, palette.wood);
    } else if (variant === 'ruined') {
      rect(-0.4, -0.4, 0.8, 0.8, palette.stone);
      rect(-0.27, -0.23, 0.54, 0.48, palette.wood);
      rect(-0.32, -0.39, 0.55, 0.25, palette.roof);
      for (let n = 0; n < 5; n++)
        circle(-0.31 + n * 0.13, 0.29 + (n % 2) * 0.06, 0.048, palette.stone);
    } else {
      rect(-0.47, -0.44, 0.94, 0.88, palette.roof);
      rect(-0.44, -0.41, 0.43, 0.82, palette.roof);
      ctx.fillStyle = '#ffffff16';
      ctx.fillRect(-0.44, -0.41, 0.42, 0.82);
      line(0, -0.45, 0, 0.45, palette.wood, 0.035);
      for (let n = 1; n < 5; n++)
        for (const side of [-1, 1])
          line(side * n * 0.085, -0.42, side * n * 0.085, 0.42, palette.wood, 0.009);
      if (kind !== 'stable') {
        rect(0.2, -0.22, 0.13, 0.16, palette.stone);
        rect(0.226, -0.194, 0.078, 0.1, '#253138');
      }
      if (variant === 'inn' || variant === 'manor' || variant === 'timber') {
        rect(-0.31, 0.36, 0.2, 0.1, palette.wall);
        rect(0.11, 0.36, 0.2, 0.1, palette.wall);
        line(-0.31, 0.36, -0.11, 0.46, palette.wood, 0.022);
        line(0.11, 0.46, 0.31, 0.36, palette.wood, 0.022);
      }
    }
    rect(-0.09, 0.37, 0.18, 0.08, palette.wood);
    if (kind === 'tavern' && !open) {
      rect(-0.41, 0.24, 0.17, 0.16, palette.wood);
      rect(-0.36, 0.28, 0.065, 0.065, '#ffd17b');
    }
  } else if (kind === 'wall' || kind === 'doorway') {
    const color =
      variant === 'timber' || (variant === 'default' && kind === 'doorway')
        ? palette.wood
        : variant === 'brick'
          ? palette.roof
          : palette.stone;
    if (kind === 'wall') {
      rect(-0.5, -0.1, 1, 0.2, color);
      for (let n = 1; n < 5; n++)
        line(-0.5 + n * 0.2, -0.08, -0.5 + n * 0.2, 0.08, palette.wall, 0.015);
    } else {
      rect(-0.45, -0.14, 0.13, 0.28, color);
      rect(0.32, -0.14, 0.13, 0.28, color);
      line(-0.32, -0.08, 0.32, -0.08, color, 0.025);
    }
  } else if (kind === 'floor') {
    rect(-0.5, -0.5, 1, 1, variant === 'wood' ? palette.wood : palette.stone);
    const count = Math.min(48, Math.max(4, Math.round(width * 4)));
    const rows = Math.min(48, Math.max(4, Math.round(depth * 4)));
    for (let n = 1; n < count; n++) {
      const offset = -0.5 + n / count;
      line(offset, -0.5, offset, 0.5, palette.wall, 0.012 / width);
    }
    if (variant !== 'wood')
      for (let n = 1; n < rows; n++)
        line(-0.5, -0.5 + n / rows, 0.5, -0.5 + n / rows, palette.wall, 0.012 / depth);
    if (variant === 'tile')
      for (const x of [-0.25, 0.25])
        for (const y of [-0.25, 0.25]) rect(x - 0.09, y - 0.09, 0.18, 0.18, palette.cloth);
  } else if (kind === 'stairs') {
    rect(-0.4, -0.43, 0.8, 0.86, variant === 'stone' ? palette.stone : palette.wood);
    for (let n = 0; n < 7; n++)
      line(-0.4, -0.37 + n * 0.12, 0.4, -0.37 + n * 0.12, palette.wall, 0.016);
    line(-0.1, 0.15, 0, -0.16, palette.wall);
    line(0, -0.16, 0.1, 0.15, palette.wall);
  } else if (kind === 'bed') {
    rect(-0.33, -0.44, 0.66, 0.88, palette.wood);
    rect(-0.28, -0.39, 0.56, 0.78, palette.wall);
    rect(-0.27, -0.06, 0.54, 0.45, palette.cloth);
    rect(-0.18, -0.31, 0.36, 0.14, palette.wall);
    if (variant === 'royal')
      for (const x of [-0.31, 0.26])
        for (const y of [-0.42, 0.37]) rect(x, y, 0.05, 0.05, palette.wood);
    if (variant === 'bunk')
      for (let n = 0; n < 4; n++)
        line(0.24, -0.05 + n * 0.1, 0.35, -0.05 + n * 0.1, palette.wood, 0.023);
  } else if (kind === 'rug') {
    if (variant === 'round') {
      circle(0, 0, 0.43, palette.cloth);
      ctx.strokeStyle = tint(palette.wall);
      ctx.lineWidth = 0.018;
      ctx.beginPath();
      ctx.arc(0, 0, 0.34, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      rect(-0.4, -0.43, 0.8, 0.86, palette.cloth);
      ctx.strokeStyle = tint(palette.wall);
      ctx.lineWidth = 0.018;
      ctx.strokeRect(-0.35, -0.38, 0.7, 0.76);
      if (variant === 'royal')
        for (const y of [-0.23, 0, 0.23]) {
          ctx.save();
          ctx.translate(0, y);
          ctx.rotate(Math.PI / 4);
          rect(-0.07, -0.07, 0.14, 0.14, palette.wall);
          ctx.restore();
        }
    }
  } else if (kind === 'fountain') {
    circle(0, 0, 0.44, palette.stone);
    circle(0, 0, 0.32, variant === 'dry' ? palette.wall : '#599eaf', variant !== 'dry');
    circle(0, 0, 0.22, palette.stone);
    circle(0, 0, 0.15, variant === 'dry' ? palette.wall : '#79bfca', variant !== 'dry');
    circle(0, 0, variant === 'ornate' ? 0.075 : 0.04, palette.stone);
  } else if (kind === 'forge') {
    rect(-0.45, -0.44, 0.9, 0.88, palette.stone);
    rect(-0.4, -0.37, 0.34, 0.33, palette.stone);
    rect(-0.31, -0.27, 0.16, 0.13, '#ffd17b');
    rect(0.08, 0.08, 0.29, 0.15, palette.metal);
    rect(0.11, -0.32, 0.28, 0.22, palette.wood);
    if (variant === 'covered') {
      rect(-0.45, -0.44, 0.9, 0.19, palette.roof);
      line(-0.42, -0.21, 0.42, -0.21, palette.wood, 0.033);
    }
  }
  return true;
}
