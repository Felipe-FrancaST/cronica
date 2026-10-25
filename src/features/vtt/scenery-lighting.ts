import {
  sceneryRect,
  sceneryVariant,
  normalizeSceneryColor,
  normalizeSceneryLightRadius,
} from './scenery';
import { sceneryHeightMetres, mapCellMetres } from './scenery-dimensions';
import type { BattleMap, BattleMapObject, BattleFogCell } from './types';

export type MapLighting = 'day' | 'night';
export const normalizeLighting = (value: unknown): MapLighting =>
  value === 'night' ? 'night' : 'day';
export interface SceneryLight {
  id: string;
  x: number;
  y: number;
  height: number;
  radius: number;
  brightRadius?: number;
  magicLevel?: number;
  strength: number;
  color: string;
}
export function automaticSceneryLight(kind: string, variant = 'default') {
  if (kind === 'lanternpost')
    return { radius: 10.5, strength: 1.2, color: '#ffd4a0', height: 0.83 };
  if (kind === 'candelabra') return { radius: 4.5, strength: 0.65, color: '#ffe0ad', height: 0.88 };
  if (kind === 'fireplace') return { radius: 9, strength: 1.3, color: '#ffbb78', height: 0.25 };
  if (kind === 'beacon') return { radius: 9, strength: 1, color: '#87ccff', height: 0.72 };
  if (kind === 'torch')
    return {
      radius: variant === 'arcane' ? 9 : 12,
      strength: 1,
      color: variant === 'arcane' ? '#83caff' : '#ffd197',
      height: 0.86,
    };
  if (kind === 'campfire')
    return {
      radius: variant === 'brazier' ? 12 : 9,
      strength: 1.45,
      color: '#ffb568',
      height: 0.72,
    };
  if (kind === 'fire') return { radius: 10.5, strength: 1.5, color: '#ffac61', height: 0.65 };
  if (kind === 'forge') return { radius: 6, strength: 0.7, color: '#ff8a52', height: 0.24 };
  if (kind === 'lava' || (kind === 'mountain' && variant === 'volcano'))
    return { radius: 9, strength: 1.05, color: '#ff7241', height: kind === 'lava' ? 0.3 : 0.9 };
  if (kind === 'portal') return { radius: 7.5, strength: 0.8, color: '#b496ff', height: 0.55 };
  if (kind === 'rock' && variant === 'crystal')
    return { radius: 4.5, strength: 0.55, color: '#98d7fa', height: 0.55 };
  if (kind === 'magiccircle' && variant !== 'spent')
    return { radius: 4.5, strength: 0.55, color: '#b394ff', height: 0.3 };
  if (kind === 'altar')
    return {
      radius: variant === 'arcane' ? 6 : 3,
      strength: 0.6,
      color: variant === 'arcane' ? '#b394ff' : '#ffd197',
      height: 0.9,
    };
  if (kind === 'stalagmite' && variant === 'crystal')
    return { radius: 4.5, strength: 0.5, color: '#b394ff', height: 0.55 };
  return null;
}
export function sceneryLights(
  objects: BattleMapObject[],
  map: Pick<BattleMap, 'scale_per_cell' | 'scale_unit'>,
  fog: BattleFogCell[] = [],
) {
  const hidden = new Set(fog.map((f) => f.x + ':' + f.y));
  const metres = mapCellMetres(map);
  const result: SceneryLight[] = [];
  for (const object of objects) {
    const r = sceneryRect(object);
    if (!r || !object.visible || object.metadata.light_enabled === false) continue;
    const variant = sceneryVariant(object.object_type, object.metadata.variant);
    const automatic = automaticSceneryLight(object.object_type, variant);
    if (!automatic && object.metadata.light_enabled !== true) continue;
    const profile = automatic ?? { radius: 6, strength: 1, color: '#ffd197', height: 0.75 };
    const radius =
      (normalizeSceneryLightRadius(object.metadata.light_radius) ?? profile.radius) / metres;
    const extended = ['fire', 'lava'].includes(object.object_type);
    const nx = extended ? Math.min(4, Math.max(1, Math.ceil(r.width / (radius * 1.5)))) : 1;
    const ny = extended ? Math.min(4, Math.max(1, Math.ceil(r.height / (radius * 1.5)))) : 1;
    const height =
      object.z +
      (sceneryHeightMetres(
        object.object_type,
        variant,
        r.width,
        r.height,
        object.metadata.height_metres,
      ) /
        metres) *
        profile.height;
    for (let row = 0; row < ny; row++)
      for (let col = 0; col < nx; col++) {
        const x = r.x + ((col + 0.5) * r.width) / nx,
          y = r.y + ((row + 0.5) * r.height) / ny;
        if (hidden.has(Math.floor(x) + ':' + Math.floor(y))) continue;
        result.push({
          id: object.id + ':' + col + ':' + row,
          x,
          y,
          height,
          radius: extended ? Math.max(radius, (r.width / nx) * 0.7, (r.height / ny) * 0.7) : radius,
          brightRadius: radius / 2,
          strength: profile.strength * normalizeLightIntensity(object.metadata.light_intensity),
          color: normalizeSceneryColor(object.metadata.light_color) ?? profile.color,
        });
      }
  }
  return result;
}
export function normalizeLightIntensity(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.2 && value <= 3
    ? value
    : 1;
}

// Rebuilt only when scenery, scale, fog or lighting changes, never every frame.
export function lightingCanvas(
  width: number,
  height: number,
  lights: SceneryLight[],
  filter = false,
) {
  const canvas = document.createElement('canvas');
  const cell = Math.min(24, 1024 / Math.max(width, height));
  canvas.width = Math.max(1, Math.ceil(width * cell));
  canvas.height = Math.max(1, Math.ceil(height * cell));
  const ctx = canvas.getContext('2d')!;
  if (filter) {
    ctx.fillStyle = '#586184';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.globalCompositeOperation = filter ? 'screen' : 'source-over';
  for (const light of lights) {
    const x = light.x * cell,
      y = light.y * cell,
      radius = light.radius * cell;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const strength = Math.min(0.94, (filter ? 0.88 : 0.27) * light.strength);
    gradient.addColorStop(
      0,
      light.color +
        Math.round(strength * 255)
          .toString(16)
          .padStart(2, '0'),
    );
    gradient.addColorStop(
      0.18,
      light.color +
        Math.round(strength * 145)
          .toString(16)
          .padStart(2, '0'),
    );
    gradient.addColorStop(
      0.5,
      light.color +
        Math.round(strength * 48)
          .toString(16)
          .padStart(2, '0'),
    );
    gradient.addColorStop(1, light.color + '00');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
