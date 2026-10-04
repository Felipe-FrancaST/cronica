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
export const EQUIPMENT: Omit<InventoryItem, 'id'>[] = [
  {
    name: 'Espada longa',
    category: 'weapon',
    quantity: 1,
    weight: 1.5,
    equipped: false,
    damage: '1d8 cortante (versátil 1d10)',
    notes: '',
  },
  {
    name: 'Adaga',
    category: 'weapon',
    quantity: 1,
    weight: 0.5,
    equipped: false,
    damage: '1d4 perfurante',
    notes: 'Acuidade, leve, arremesso',
  },
  {
    name: 'Arco curto',
    category: 'weapon',
    quantity: 1,
    weight: 1,
    equipped: false,
    damage: '1d6 perfurante',
    notes: 'Alcance 24/96 m',
  },
  {
    name: 'Machado grande',
    category: 'weapon',
    quantity: 1,
    weight: 3.5,
    equipped: false,
    damage: '1d12 cortante',
    notes: 'Pesada, duas mãos',
  },
  {
    name: 'Armadura de couro',
    category: 'armor',
    quantity: 1,
    weight: 5,
    equipped: false,
    armor_base: 11,
    armor_type: 'light',
    notes: '',
  },
  {
    name: 'Couro batido',
    category: 'armor',
    quantity: 1,
    weight: 6.5,
    equipped: false,
    armor_base: 12,
    armor_type: 'light',
    notes: '',
  },
  {
    name: 'Cota de malha parcial',
    category: 'armor',
    quantity: 1,
    weight: 10,
    equipped: false,
    armor_base: 13,
    armor_type: 'medium',
    notes: '',
  },
  {
    name: 'Peitoral',
    category: 'armor',
    quantity: 1,
    weight: 10,
    equipped: false,
    armor_base: 14,
    armor_type: 'medium',
    notes: '',
  },
  {
    name: 'Meia armadura',
    category: 'armor',
    quantity: 1,
    weight: 20,
    equipped: false,
    armor_base: 15,
    armor_type: 'medium',
    notes: 'Desvantagem em Furtividade',
  },
  {
    name: 'Cota de malha',
    category: 'armor',
    quantity: 1,
    weight: 27.5,
    equipped: false,
    armor_base: 16,
    armor_type: 'heavy',
    notes: 'Força 13; desvantagem em Furtividade',
  },
  {
    name: 'Armadura de placas',
    category: 'armor',
    quantity: 1,
    weight: 32.5,
    equipped: false,
    armor_base: 18,
    armor_type: 'heavy',
    notes: 'Força 15; desvantagem em Furtividade',
  },
  {
    name: 'Escudo',
    category: 'armor',
    quantity: 1,
    weight: 3,
    equipped: false,
    armor_base: 2,
    armor_type: 'shield',
    notes: '',
  },
  { name: 'Mochila', category: 'gear', quantity: 1, weight: 2.5, equipped: false, notes: '' },
  {
    name: 'Corda de cânhamo',
    category: 'gear',
    quantity: 1,
    weight: 5,
    equipped: false,
    notes: '15 metros',
  },
  {
    name: 'Rações de viagem',
    category: 'gear',
    quantity: 5,
    weight: 1,
    equipped: false,
    notes: 'Uma por dia',
  },
  {
    name: 'Poção de cura',
    category: 'item',
    quantity: 1,
    weight: 0.25,
    equipped: false,
    notes: 'Recupera 2d4 + 2 PV',
  },
];
