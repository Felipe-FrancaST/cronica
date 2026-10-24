import type { BattleActionRequest, BattleMap, BattleToken, GridPoint } from './types';
import { metersPerCell } from './effects';
export type CombatVisualKind = 'slash' | 'arrow' | 'bolt' | 'orb' | 'heal' | 'rune';
export function combatEffectStyle(q: BattleActionRequest) {
  const type = (q.definition.damageType ?? '').toLowerCase();
  const color = /fogo|fire/.test(type)
    ? '#ff9554'
    : /frio|cold/.test(type)
      ? '#9aeaff'
      : /elétr|eletr|lightning/.test(type)
        ? '#b4bfff'
        : /ácido|acido|acid|veneno|poison/.test(type)
          ? '#ade878'
          : /necr|necrotic/.test(type)
            ? '#be88d9'
            : /radiante|radiant/.test(type)
              ? '#ffe6a1'
              : /psíqu|psiqu|psychic/.test(type)
                ? '#ee9cdf'
                : /trovej|thunder/.test(type)
                  ? '#b6d6ed'
                  : q.kind === 'spell'
                    ? '#c2afff'
                    : '#fbe0a0';
  if (q.definition.kind === 'healing' || q.definition.kind === 'temporary')
    return { kind: 'heal' as const, color: '#79efb9' };
  if (q.kind === 'weapon' || q.kind === 'opportunity') {
    const entry = q.definition.entry;
    const ranged =
      Number(q.definition.range) > 3 ||
      /arco|besta|bow|crossbow|arremesso|thrown/i.test(
        String(entry?.name ?? '') + ' ' + String(entry?.properties ?? ''),
      );
    return { kind: ranged ? ('arrow' as const) : ('slash' as const), color };
  }
  if (q.definition.kind === 'utility') return { kind: 'rune' as const, color };
  return {
    kind:
      /elétr|eletr|lightning/.test(type) || q.definition.shape === 'line'
        ? ('bolt' as const)
        : ('orb' as const),
    color,
  };
}
/** Bounded analytic geometry, independent of map dimensions. */
export function combatAreaPoints(
  q: BattleActionRequest,
  actor: BattleToken,
  map: BattleMap,
): GridPoint[] {
  const e = q.definition,
    r = Math.min(100, e.size / metersPerCell(map));
  if (!r || !['sphere', 'cone', 'cube', 'line'].includes(e.shape)) return [];
  const o =
    e.origin === 'self'
      ? { x: actor.x + actor.size / 2 - 0.5, y: actor.y + actor.size / 2 - 0.5 }
      : q.target;
  if (e.shape === 'sphere')
    return Array.from({ length: 24 }, (_, i) => ({
      x: o.x + Math.cos((i * Math.PI) / 12) * r,
      y: o.y + Math.sin((i * Math.PI) / 12) * r,
    }));
  if (e.shape === 'cube' && e.origin !== 'self')
    return [
      { x: o.x - r / 2, y: o.y - r / 2 },
      { x: o.x + r / 2, y: o.y - r / 2 },
      { x: o.x + r / 2, y: o.y + r / 2 },
      { x: o.x - r / 2, y: o.y + r / 2 },
    ];
  const angle = Math.atan2(q.target.y - o.y, q.target.x - o.x) || Math.PI / 2;
  if (e.shape === 'cone') {
    const spread = Math.atan(0.5);
    return [
      o,
      ...Array.from({ length: 13 }, (_, i) => ({
        x: o.x + Math.cos(angle - spread + (2 * spread * i) / 12) * r,
        y: o.y + Math.sin(angle - spread + (2 * spread * i) / 12) * r,
      })),
    ];
  }
  const w = e.shape === 'cube' ? r / 2 : e.width / metersPerCell(map) / 2,
    dx = Math.cos(angle),
    dy = Math.sin(angle);
  return [
    { x: o.x - dy * w, y: o.y + dx * w },
    { x: o.x + dx * r - dy * w, y: o.y + dy * r + dx * w },
    { x: o.x + dx * r + dy * w, y: o.y + dy * r - dx * w },
    { x: o.x + dy * w, y: o.y - dx * w },
  ];
}
