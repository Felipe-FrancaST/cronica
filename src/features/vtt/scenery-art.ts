import { sceneryRect, sceneryVariant, normalizeSceneryColor } from './scenery';
import { drawExtraScenery2D } from './scenery-extra-art';
import type { BattleMapObject } from './types';

// Deterministic procedural art: no external images, downloads, or per-frame texture work.
export function surfaceCanvas(kind: string, color?: string) {
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
          : kind === 'snow'
            ? ['#b8cad3', '#f7fbf6']
            : kind === 'ice'
              ? ['#4e8fa8', '#d3f1f4']
              : kind === 'portal'
                ? ['#221b48', '#925bdd']
                : kind === 'road'
                  ? ['#615239', '#b6a27a']
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
  if (kind === 'snow') {
    for (let i = 0; i < 24; i++) {
      const x = (i * 37) % 128,
        y = (i * 71) % 128;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 15);
      glow.addColorStop(0, '#ffffffbb');
      glow.addColorStop(1, '#ffffff00');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 15, y - 15, 30, 30);
    }
  } else if (kind === 'water') {
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
  } else if (kind === 'ice') {
    ctx.strokeStyle = '#eafaffaa';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo((i * 29) % 128, 0);
      ctx.lineTo((i * 17 + 36) % 128, 48);
      ctx.lineTo((i * 41 + 9) % 128, 128);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff22';
    ctx.beginPath();
    ctx.ellipse(30, 38, 20, 42, 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'portal') {
    const glow = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    glow.addColorStop(0, '#eaf4ff');
    glow.addColorStop(0.18, '#a9ccff');
    glow.addColorStop(0.55, '#815ae4');
    glow.addColorStop(1, '#22173e');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i % 2 ? '#dbccff9c' : '#96b9ff77';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let t = 0; t < 12; t += 0.1) {
        const r = t * 5;
        const x = 64 + Math.cos(t + i * 1.26) * r,
          y = 64 + Math.sin(t + i * 1.26) * r;
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (kind === 'road') {
    ctx.strokeStyle = '#cfbc9244';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(38, 0);
    ctx.lineTo(38, 128);
    ctx.moveTo(89, 0);
    ctx.lineTo(89, 128);
    ctx.stroke();
    for (let i = 0; i < 35; i++) {
      ctx.fillStyle = i % 2 ? '#554c3866' : '#d2bd9544';
      ctx.beginPath();
      ctx.ellipse((i * 37) % 128, (i * 73) % 128, 2 + (i % 3), 1 + (i % 2), i, 0, Math.PI * 2);
      ctx.fill();
    }
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
  if (color) {
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    ctx.globalCompositeOperation = 'source-over';
  }
  return canvas;
}
export function tintSceneryColor(base: string, color?: string) {
  if (!color || !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(base)) return base;
  const b = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  const shade = 0.3 + (b[0] * 0.25 + b[1] * 0.6 + b[2] * 0.15) / 210;
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(Math.min(255, parseInt(color.slice(i, i + 2), 16) * shade))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('') +
    base.slice(7)
  );
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
    const variant = sceneryVariant(kind, object.metadata.variant);
    const color = normalizeSceneryColor(object.metadata.color);
    const paintColor = (base: string) => tintSceneryColor(base, color);
    const surface =
      kind === 'ice' && variant === 'snow'
        ? 'snow'
        : kind === 'road' && variant === 'cobblestone'
          ? 'stone'
          : kind;
    const textureFor = (name: string) => {
      const key = `${name}:${color ?? ''}`;
      let texture = textures.get(key);
      if (!texture) {
        texture = surfaceCanvas(name, color);
        if (textures.size >= 96) textures.delete(textures.keys().next().value!);
        textures.set(key, texture);
      }
      return texture;
    };
    ctx.save();
    ctx.globalAlpha = object.visible ? 1 : 0.38;
    if (['water', 'lava', 'fire', 'road', 'ice'].includes(kind)) {
      const tex = textureFor(surface);
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
          const gradient = ctx.createLinearGradient(cx, cy + cell * 0.25, cx, cy - cell * 0.34);
          gradient.addColorStop(0, paintColor('#c94a20'));
          gradient.addColorStop(0.45, paintColor('#ff983b'));
          gradient.addColorStop(1, paintColor('#ffdc91'));
          ctx.fillStyle = gradient;
          ctx.shadowColor = paintColor('#f89c34');
          ctx.shadowBlur = cell * 0.15;
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(cx, cy + cell * 0.1, cell * 0.09, cell * 0.14, 0, 0, Math.PI * 2);
          ctx.fillStyle = paintColor('#ffdb79');
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
      if (drawExtraScenery2D(ctx, kind, variant, paintColor)) {
        // Additional models share the same normalized footprint and shadow pass.
      } else if (kind === 'tree' || kind === 'pine') {
        ctx.fillStyle = paintColor('#704f31');
        ctx.fillRect(-0.06, -0.1, 0.12, 0.42);
        ctx.fillStyle = paintColor(variant === 'autumn' ? '#c28a43' : '#2b6141');
        if (kind === 'pine') {
          ctx.beginPath();
          ctx.moveTo(0, -0.43);
          ctx.lineTo(0.36, 0.3);
          ctx.lineTo(-0.36, 0.3);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = paintColor('#4c8460');
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
          ctx.fillStyle = paintColor(variant === 'autumn' ? '#dfb362' : '#548c56');
          ctx.beginPath();
          ctx.arc(-0.08, -0.11, 0.19, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind === 'tent') {
        ctx.fillStyle = paintColor('#684a39');
        ctx.fillRect(-0.42, -0.4, 0.84, 0.8);
        ctx.fillStyle = paintColor('#bb8c68');
        ctx.beginPath();
        ctx.moveTo(-0.4, -0.4);
        ctx.lineTo(0.05, 0);
        ctx.lineTo(-0.4, 0.4);
        ctx.fill();
        ctx.fillStyle = paintColor('#d5ab80');
        ctx.beginPath();
        ctx.moveTo(0.4, -0.4);
        ctx.lineTo(0.05, 0);
        ctx.lineTo(0.4, 0.4);
        ctx.fill();
        ctx.strokeStyle = paintColor('#f0dbb7');
        ctx.lineWidth = 0.025;
        ctx.beginPath();
        ctx.moveTo(0.04, -0.46);
        ctx.lineTo(0.04, 0.46);
        ctx.stroke();
      } else if (kind === 'cart') {
        ctx.fillStyle = paintColor('#352f28');
        ctx.fillRect(-0.45, -0.36, 0.1, 0.17);
        ctx.fillRect(0.35, -0.36, 0.1, 0.17);
        ctx.fillRect(-0.45, 0.2, 0.1, 0.17);
        ctx.fillRect(0.35, 0.2, 0.1, 0.17);
        ctx.fillStyle = paintColor('#936740');
        ctx.fillRect(-0.35, -0.4, 0.7, 0.8);
        ctx.strokeStyle = paintColor('#ce9e67');
        ctx.lineWidth = 0.04;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(-0.31, -0.33 + i * 0.16);
          ctx.lineTo(0.31, -0.33 + i * 0.16);
          ctx.stroke();
        }
        ctx.fillStyle = paintColor('#553a2b');
        ctx.fillRect(-0.3, -0.36, 0.6, 0.13);
        ctx.fillRect(-0.24, 0.4, 0.04, 0.2);
        ctx.fillRect(0.2, 0.4, 0.04, 0.2);
      } else if (kind === 'pit') {
        ctx.fillStyle = paintColor('#7d7767');
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.46, 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        const dark = ctx.createRadialGradient(-0.08, -0.06, 0.02, 0, 0, 0.4);
        dark.addColorStop(0, '#000');
        dark.addColorStop(0.75, '#080d0c');
        dark.addColorStop(1, '#433d30');
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.38, 0.33, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'portal') {
        const texture = textureFor(kind);
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.34, 0.44, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(texture, -0.34, -0.44, 0.68, 0.88);
        ctx.restore();
        ctx.strokeStyle = paintColor('#d7c9f8');
        ctx.lineWidth = 0.045;
        ctx.shadowColor = paintColor('#be86ff');
        ctx.shadowBlur = cell * 0.16;
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.35, 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (kind === 'ruin') {
        ctx.fillStyle = paintColor('#aaa28e');
        ctx.fillRect(-0.38, -0.37, 0.76, 0.14);
        ctx.fillRect(-0.38, -0.37, 0.14, 0.73);
        ctx.fillRect(0.24, -0.37, 0.14, 0.52);
        ctx.fillStyle = paintColor('#635f52');
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
        ctx.fillStyle = paintColor('#b5bcb5');
        ctx.beginPath();
        ctx.moveTo(-0.14, -0.38);
        ctx.lineTo(-0.05, 0.26);
        ctx.lineTo(-0.43, 0.35);
        ctx.closePath();
        ctx.fill();
        if (kind === 'mountain') {
          ctx.fillStyle = paintColor('#e2e5d8');
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
