import classData from './data/classes.json';
import { RACE_CATALOG } from './ancestries';
import type { Ability, InventoryItem } from '@/types';
export const ABILITIES: { id: Ability; label: string; short: string }[] = [
  { id: 'str', label: 'Força', short: 'FOR' },
  { id: 'dex', label: 'Destreza', short: 'DES' },
  { id: 'con', label: 'Constituição', short: 'CON' },
  { id: 'int', label: 'Inteligência', short: 'INT' },
  { id: 'wis', label: 'Sabedoria', short: 'SAB' },
  { id: 'cha', label: 'Carisma', short: 'CAR' },
];
export const SKILLS: { id: string; label: string; ability: Ability }[] = [
  { id: 'acrobatics', label: 'Acrobacia', ability: 'dex' },
  { id: 'animal_handling', label: 'Adestrar animais', ability: 'wis' },
  { id: 'arcana', label: 'Arcanismo', ability: 'int' },
  { id: 'athletics', label: 'Atletismo', ability: 'str' },
  { id: 'deception', label: 'Enganação', ability: 'cha' },
  { id: 'history', label: 'História', ability: 'int' },
  { id: 'insight', label: 'Intuição', ability: 'wis' },
  { id: 'intimidation', label: 'Intimidação', ability: 'cha' },
  { id: 'investigation', label: 'Investigação', ability: 'int' },
  { id: 'medicine', label: 'Medicina', ability: 'wis' },
  { id: 'nature', label: 'Natureza', ability: 'int' },
  { id: 'perception', label: 'Percepção', ability: 'wis' },
  { id: 'performance', label: 'Atuação', ability: 'cha' },
  { id: 'persuasion', label: 'Persuasão', ability: 'cha' },
  { id: 'religion', label: 'Religião', ability: 'int' },
  { id: 'sleight_of_hand', label: 'Prestidigitação', ability: 'dex' },
  { id: 'stealth', label: 'Furtividade', ability: 'dex' },
  { id: 'survival', label: 'Sobrevivência', ability: 'wis' },
];
export interface ClassDefinition {
  id: string;
  name: string;
  hitDie: number;
  saves: Ability[];
  caster: 'full' | 'half' | 'artificer' | 'pact' | 'none';
  spellAbility: Ability | null;
  spellLearning: 'known' | 'prepared' | 'none';
  source: string;
  edition: string;
  description: string;
}
export const CLASSES: Record<string, ClassDefinition> = Object.fromEntries(
  (classData as ClassDefinition[]).map((c) => [c.id, c]),
);
export const RACES = RACE_CATALOG.map((r) => r.name);
export const CONDITIONS = [
  'Agarrado',
  'Amedrontado',
  'Atordoado',
  'Caído',
  'Cego',
  'Enfeitiçado',
  'Envenenado',
  'Impedido',
  'Incapacitado',
  'Inconsciente',
  'Invisível',
  'Paralisado',
  'Petrificado',
  'Surdo',
  'Exaustão',
];
export { ITEM_CATALOG as EQUIPMENT } from './items';
