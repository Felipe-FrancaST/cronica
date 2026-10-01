import type { Ability, DndSheet, Character } from '@/types';
export interface StoredSheet {
  data: Record<string, unknown>;
  attributes: { ability: string; score: number }[];
  skills: { skill: string; proficiency: number }[];
  inventory: unknown[];
  spells: unknown[];
}
export interface DerivedSheet {
  modifiers: Record<Ability, number>;
  proficiency: number;
  armorClass: number;
  initiative: number;
  speed: number;
  hpMax: number;
  hitDie: number;
  spellAbility: Ability | null;
  spellDc: number | null;
  spellAttack: number | null;
  spellSlots: number[];
  skills: Record<string, number>;
  saves: Record<Ability, number>;
  passivePerception: number;
}
export interface RpgSystemModule<TSheet = DndSheet, TDerived = DerivedSheet> {
  slug: string;
  name: string;
  version: string;
  defaultSheet(): TSheet;
  hydrateSheet(stored: StoredSheet): TSheet;
  calculate(sheet: TSheet): TDerived;
  validate(character: Character<TSheet>): string[];
  describeSheet(sheet: TSheet): { ancestry: string; profession: string; level: number };
}
