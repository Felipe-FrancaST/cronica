import type { ClassLevel, DndSheet } from './types';
import {
  classLevels,
  cleanClassLevels,
  meetsPrerequisite,
  withClassLevels,
  hitDicePools,
} from './progression';
import { CLASSES } from './catalog';
import { normalizeSpellResources } from './spellcasting';
export function allocateClassLevel(
  levels: ClassLevel[],
  index: number,
  value: number,
  lockedTotal?: number,
): ClassLevel[] {
  if (!levels[index] || !Number.isInteger(value) || value < 1 || value > 20)
    throw new Error('Informe um nível de classe inteiro entre 1 e 20.');
  const next = levels.map((c) => ({ ...c }));
  let delta = value - next[index].level;
  if (lockedTotal) {
    if (delta > 0) {
      for (let i = next.length - 1; i >= 0 && delta > 0; i--) {
        if (i === index) continue;
        const take = Math.min(next[i].level - 1, delta);
        next[i].level -= take;
        delta -= take;
      }
      if (delta > 0)
        throw new Error(
          'Não há níveis disponíveis nas outras classes. Cada classe deve manter pelo menos um nível.',
        );
    } else if (delta < 0) {
      const donor = next.findIndex((_, i) => i !== index);
      if (donor < 0)
        throw new Error('Adicione outra classe antes de redistribuir o nível fixado pelo mestre.');
      next[donor].level -= delta;
    }
  }
  next[index].level = value;
  const total = next.reduce((n, c) => n + c.level, 0);
  if (total > 20 || (lockedTotal && total !== lockedTotal))
    throw new Error('A distribuição deve respeitar o nível total da campanha, até 20.');
  return cleanClassLevels(next);
}
export function changeClassAllocation(s: DndSheet, levels: ClassLevel[]) {
  const next = normalizeSpellResources(withClassLevels(s, cleanClassLevels(levels)));
  if (levels.length > 1) {
    const invalid = classLevels(next).find((c) => !meetsPrerequisite(c.class_id, next.abilities));
    if (invalid)
      throw new Error(
        `Os atributos finais não atendem aos requisitos de ${CLASSES[invalid.class_id]?.name}. Confira os atributos e as melhorias antes de redistribuir níveis.`,
      );
  }
  // Preserve already spent hit dice when a single-class sheet becomes multiclass.
  const pools = hitDicePools(s);
  next.hit_dice_by_class = Object.fromEntries(
    levels.map((c) => [c.class_id, Math.min(c.level, pools[c.class_id]?.used ?? 0)]),
  );
  next.hit_dice_used = Object.values(next.hit_dice_by_class).reduce((a, b) => a + b, 0);
  return next;
}
export function addClassLevel(s: DndSheet, id: string, lockedTotal?: number) {
  const levels = classLevels(s);
  if (!CLASSES[id] || levels.some((c) => c.class_id === id))
    throw new Error('Escolha uma classe diferente das que já possui.');
  if (!meetsPrerequisite(id, s.abilities))
    throw new Error('A nova classe precisa cumprir os requisitos de atributos.');
  const next = levels.map((c) => ({ ...c }));
  if (lockedTotal) {
    const donor = next.findIndex((c) => c.level > 1);
    if (donor < 0) throw new Error('É necessário um nível disponível em outra classe.');
    next[donor].level--;
  } else if (s.level >= 20) throw new Error('O nível total máximo é 20.');
  next.push({ class_id: id, level: 1, subclass_id: '' });
  return changeClassAllocation(s, next);
}
