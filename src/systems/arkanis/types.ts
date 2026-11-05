import type { InventoryItem } from '@/systems/dnd5e/types';

export type ArkanisAttribute = 'for' | 'agi' | 'res' | 'int' | 'sen' | 'pre';
export type AptitudeRank = 0 | 1 | 2 | 3;
export type MagicOrder = 'primaria' | 'desperta' | 'elevada' | 'arcana' | 'suprema' | 'divina';
export interface ArkanisSpell {
  id: string;
  name: string;
  learning_level: number;
  source: string;
  learned: boolean;
  highest_order: MagicOrder;
  description: string;
  orders: Partial<
    Record<
      MagicOrder,
      {
        mana: number;
        damage: string;
        area: string;
        requirements: string;
        materials: string;
        casting_time: string;
        duration: string;
        effects: string;
      }
    >
  >;
}
export interface ArkanisTechnique {
  id: string;
  name: string;
  learning_level: number;
  attribute: 'for' | 'agi';
  source: string;
  learned: boolean;
  requirements: string;
  description: string;
}
export interface ArkanisWeapon {
  id: string;
  name: string;
  die: number;
  mastery: number;
  dice_at_third: 3 | 4 | null;
  range: string;
  requirements: string;
  notes: string;
}
export interface ArkanisSheet {
  system: 'arkanis';
  schema_version: 1;
  race: string;
  race_id: string;
  human_attribute: ArkanisAttribute;
  level: number;
  xp: number;
  attributes: Record<ArkanisAttribute, number>;
  attribute_adjustments: Record<ArkanisAttribute, number>;
  attribute_method: 'standard' | 'rolled' | 'manual';
  attribute_rolls: number[][];
  arkano: {
    body: number;
    mind: number;
    spirit: number;
    bonus: number;
    modifier_override: number | null;
  };
  hp_current: number;
  hp_max: number;
  hit_point_notes: string;
  mana_current: number;
  mana_max_override: number | null;
  sanity_current: number;
  sanity_max: number;
  reflex_bonus: number;
  speed_override: number | null;
  armor: { name: string; value: number; durability_current: number; durability_max: number };
  aptitudes: Record<string, AptitudeRank>;
  inventory: InventoryItem[];
  weapons: ArkanisWeapon[];
  grimoire: ArkanisSpell[];
  techniques: ArkanisTechnique[];
  identity: {
    age: string;
    height: string;
    weight: string;
    eyes: string;
    hair: string;
    languages: string;
  };
  background: { origin: string; motivation: string; defining_trait: string; notes: string };
  racial_notes: string;
  wealth: string;
  notes: string;
}

export interface Ingredient {
  id: string;
  number: number;
  name: string;
  habitat_id: string;
  habitat: string;
  affinities: string;
  tags: string[];
  icon: string;
  form: string;
}
