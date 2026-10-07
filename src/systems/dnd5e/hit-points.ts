import { CLASSES } from './catalog';
import type { DndSheet } from './types';
import { classLevels } from './progression';

export type HitPointMethod = 'average' | 'maximum' | 'rolled';
export const HIT_POINT_METHODS: Record<HitPointMethod, string> = {
  average: 'Média fixa',
  maximum: 'Dado sempre cheio',
  rolled: 'Rolagem dos dados',
};
export function hitPointEntries(sheet: DndSheet) {
  return classLevels(sheet).flatMap((entry, index) => {
    const die = CLASSES[entry.class_id]?.hitDie ?? 10;
    return Array.from({ length: entry.level }, (_, level) => {
      const first = index === 0 && level === 0;
      const stored = sheet.hit_point_rolls?.[entry.class_id]?.[level];
      const valid = Number.isInteger(stored) && Number(stored) >= 1 && Number(stored) <= die;
      const pending = sheet.hit_point_method === 'rolled' && !first && !valid;
      const value =
        first || sheet.hit_point_method === 'maximum'
          ? die
          : sheet.hit_point_method === 'rolled' && valid
            ? Number(stored)
            : Math.floor(die / 2) + 1;
      return { classId: entry.class_id, level: level + 1, die, value, first, pending };
    });
  });
}
export const pendingHitPointRolls = (sheet: DndSheet) =>
  hitPointEntries(sheet).filter((entry) => entry.pending);
export function baseHitPoints(sheet: DndSheet, constitutionModifier: number) {
  return hitPointEntries(sheet).reduce(
    (total, entry) => total + Math.max(1, entry.value + constitutionModifier),
    0,
  );
}
export function rollHitPoints(
  sheet: DndSheet,
  previous: Record<string, number[]> = {},
  roll = (sides: number) => {
    const sample = new Uint32Array(1),
      limit = Math.floor(0x100000000 / sides) * sides;
    do {
      crypto.getRandomValues(sample);
    } while (sample[0] >= limit);
    return (sample[0] % sides) + 1;
  },
) {
  const result = structuredClone(previous);
  for (const entry of hitPointEntries({ ...sheet, hit_point_method: 'rolled' })) {
    const values = result[entry.classId] ?? [];
    const value = values[entry.level - 1];
    if (entry.first) values[0] = entry.die;
    else if (!Number.isInteger(value) || value < 1 || value > entry.die)
      values[entry.level - 1] = roll(entry.die);
    result[entry.classId] = values;
  }
  return result;
}
