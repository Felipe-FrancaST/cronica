import audit from './spell-audit.json';
import { proficiencyBonus } from '@/systems/dnd5e';
import { spellProfile } from '@/systems/dnd5e/spellcasting';
import type { DndSheet, Spell } from '@/systems/dnd5e/types';
export function spellSaveDc(sheet: DndSheet, spell: Spell) {
  const ability = spellProfile(sheet, spell).ability;
  return ability
    ? 8 + proficiencyBonus(sheet.level) + Math.floor((sheet.abilities[ability] - 10) / 2)
    : null;
}
export function spellReview(spell: Pick<Spell, 'catalog_id'>) {
  return audit[spell.catalog_id as keyof typeof audit];
}
export function spellResolutionLabel(spell: Pick<Spell, 'catalog_id'>) {
  const item = spellReview(spell);
  if (!item) return 'Efeito conforme a descrição';
  if (item.initialSave) return `Salvaguarda de ${item.initialSave.toUpperCase()}`;
  if (item.resolution === 'attack') return 'Ataque mágico contra CA';
  if (item.resolution === 'trigger') return 'Efeito por gatilho: acompanhe a descrição';
  if (item.effectSave) return 'Dano e depois salvaguarda do efeito adicional';
  if (item.conditionalSaves.length || item.abilityCheck)
    return 'Testes condicionais: consulte a descrição';
  return item.resolution === 'numeric'
    ? 'Efeito numérico calculado'
    : 'Efeito narrativo ou específico da descrição';
}
