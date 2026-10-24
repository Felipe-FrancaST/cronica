import type { DndSheet } from '@/systems/dnd5e/types';
export type LifeState = 'standing' | 'prone' | 'dying' | 'stable' | 'dead';
export const LIFE_LABELS: Record<LifeState, string> = {
  standing: 'Em pé',
  prone: 'Caído',
  dying: 'Inconsciente · contra a morte',
  stable: 'Estável · inconsciente',
  dead: 'Morto',
};
export function lifeState(
  s: Pick<DndSheet, 'hp_current' | 'conditions' | 'death_failures'>,
): LifeState {
  if (
    s.conditions.some((c) => c === 'Morto' || c === 'Dead') ||
    (s.hp_current === 0 && s.death_failures >= 3)
  )
    return 'dead';
  if (s.hp_current === 0) return s.conditions.includes('Estável') ? 'stable' : 'dying';
  return s.conditions.includes('Caído') ? 'prone' : 'standing';
}
