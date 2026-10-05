import { sceneryRect } from './scenery';
import type { BattleMapObject } from './types';

// Deterministic procedural art: no external images, downloads, or per-frame texture work.
export function surfaceCanvas(kind: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const colors =
    kind === 'water'
      ? ['#19475c', '#388b9e']
      : kind === 'lava'
        ? ['#341c24', '#de5627']
        : kind === 'fire'
          ? ['#292321', '#6a4131']
          : kind === 'stone'
            ? ['#6b7369', '#acada0']
            : ['#554b34', '#8c8157'];
  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 55; i++) {
    const x = (i * 37 + 11) % 128,
      y = (i * 71 + 19) % 128;
    ctx.fillStyle = i % 2 ? '#ffffff12' : '#00000018';
    ctx.fillRect(x, y, 3 + (i % 8), 2 + (i % 5));
  }
  if (kind === 'water') {
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#9ee4ed66';
    for (let row = 0; row < 8; row++) {
      ctx.beginPath();
      for (let x = 0; x <= 128; x += 4) {
        const y = row * 18 + Math.sin(x / 13 + row) * 3;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (kind === 'lava') {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffbc52';
    ctx.shadowColor = '#ff7031';
    ctx.shadowBlur = 9;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 31, 0);
      for (let y = 0; y <= 128; y += 16) ctx.lineTo(i * 31 + Math.sin(y / 13 + i) * 14, y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  } else if (kind === 'stone') {
    ctx.strokeStyle = '#222c2855';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 29);
      ctx.lineTo(128, i * 29 + 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * 29, 0);
      ctx.lineTo(i * 29 + 8, 128);
      ctx.stroke();
    }
  }
  return canvas;
}
export function drawScenery2D(
  ctx: CanvasRenderingContext2D,
  objects: BattleMapObject[],
  cell: number,
  textures: Map<string, HTMLCanvasElement>,
) {
  for (const object of objects) {
    const r = sceneryRect(object);
    if (!r) continue;
    const x = r.x * cell,
      y = r.y * cell,
      w = r.width * cell,
      h = r.height * cell;
    const kind = object.object_type;
    ctx.save();
    ctx.globalAlpha = object.visible ? 1 : 0.38;
    if (['water', 'lava', 'fire'].includes(kind)) {
      let tex = textures.get(kind);
      if (!tex) {
        tex = surfaceCanvas(kind);
        textures.set(kind, tex);
      }
      ctx.drawImage(tex, x + 1, y + 1, w - 2, h - 2);
      if (kind === 'fire') {
        for (let i = 0; i < r.width * r.height; i++) {
          const cx = x + ((i % r.width) + 0.5) * cell,
            cy = y + (Math.floor(i / r.width) + 0.58) * cell;
          ctx.beginPath();
          ctx.moveTo(cx - cell * 0.22, cy + cell * 0.22);
          ctx.quadraticCurveTo(
            cx - cell * 0.33,
            cy - cell * 0.06,
            cx - cell * 0.05,
            cy - cell * 0.34,
          );
          ctx.quadraticCurveTo(
            cx + cell * 0.02,
            cy - cell * 0.06,
            cx + cell * 0.16,
            cy - cell * 0.22,
          );
          ctx.quadraticCurveTo(cx + cell * 0.35, cy + cell * 0.2, cx, cy + cell * 0.26);
          ctx.fillStyle = '#f38836';
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(cx, cy + cell * 0.1, cell * 0.09, cell * 0.14, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#ffdb79';
          ctx.fill();
        }
      }
    } else {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(w, h);
      ctx.rotate((r.rotation * Math.PI) / 180);
      ctx.shadowColor = '#0009';
      ctx.shadowBlur = cell * 0.12;
      ctx.shadowOffsetY = cell * 0.06;
      if (kind === 'tree' || kind === 'pine') {
        ctx.fillStyle = '#704f31';
        ctx.fillRect(-0.06, -0.1, 0.12, 0.42);
        ctx.fillStyle = '#2b6141';
        if (kind === 'pine') {
          ctx.beginPath();
          ctx.moveTo(0, -0.43);
          ctx.lineTo(0.36, 0.3);
          ctx.lineTo(-0.36, 0.3);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#4c8460';
          ctx.beginPath();
          ctx.moveTo(0, -0.43);
          ctx.lineTo(0.08, 0.18);
          ctx.lineTo(-0.36, 0.3);
          ctx.closePath();
          ctx.fill();
        } else {
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.22, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#548c56';
          ctx.beginPath();
          ctx.arc(-0.08, -0.11, 0.19, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind === 'ruin') {
        ctx.fillStyle = '#aaa28e';
        ctx.fillRect(-0.38, -0.37, 0.76, 0.14);
        ctx.fillRect(-0.38, -0.37, 0.14, 0.73);
        ctx.fillRect(0.24, -0.37, 0.14, 0.52);
        ctx.fillStyle = '#635f52';
        ctx.fillRect(-0.24, -0.2, 0.47, 0.08);
      } else {
        ctx.fillStyle = kind === 'mountain' ? '#7c8581' : '#99978b';
        ctx.beginPath();
        ctx.moveTo(-0.43, 0.35);
        ctx.lineTo(-0.14, -0.38);
        ctx.lineTo(0.2, -0.24);
        ctx.lineTo(0.43, 0.32);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#b5bcb5';
        ctx.beginPath();
        ctx.moveTo(-0.14, -0.38);
        ctx.lineTo(-0.05, 0.26);
        ctx.lineTo(-0.43, 0.35);
        ctx.closePath();
        ctx.fill();
        if (kind === 'mountain') {
          ctx.fillStyle = '#e2e5d8';
          ctx.beginPath();
          ctx.moveTo(-0.14, -0.38);
          ctx.lineTo(0.03, -0.05);
          ctx.lineTo(-0.08, -0.11);
          ctx.lineTo(-0.23, -0.04);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}
