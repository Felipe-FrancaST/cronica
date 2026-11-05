import type { RpgSystemModule } from '../types';
import type { ArkanisSheet } from './types';
import type { InventoryItem } from '../dnd5e/types';
import {
  defaultArkanisSheet,
  calculateArkanis,
  validateArkanis,
  applyRacialAptitudes,
} from './rules';

export const arkanis: RpgSystemModule<ArkanisSheet, ReturnType<typeof calculateArkanis>> = {
  slug: 'arkanis',
  name: 'Arkanis',
  version: 'Livro de Regras · 2026',
  defaultSheet: defaultArkanisSheet,
  hydrateSheet(stored) {
    const base = defaultArkanisSheet();
    const saved = stored.data as Partial<ArkanisSheet>;
    return applyRacialAptitudes({
      ...base,
      ...saved,
      system: 'arkanis',
      schema_version: 1,
      attributes: { ...base.attributes, ...saved.attributes },
      attribute_adjustments: { ...base.attribute_adjustments, ...saved.attribute_adjustments },
      arkano: { ...base.arkano, ...saved.arkano },
      armor: { ...base.armor, ...saved.armor },
      identity: { ...base.identity, ...saved.identity },
      background: { ...base.background, ...saved.background },
      aptitudes: { ...(saved.aptitudes ?? base.aptitudes) },
      inventory: stored.inventory as InventoryItem[],
      aptitude_training: saved.aptitude_training,
    });
  },
  calculate: calculateArkanis,
  validate: validateArkanis,
  describeSheet: (sheet) => ({
    ancestry: sheet.race,
    profession: 'Arkanis · sem classes',
    level: sheet.level,
  }),
};
