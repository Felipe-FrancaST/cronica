export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export interface ClassLevel {
  class_id: string;
  level: number;
  subclass_id?: string;
  custom_subclass_name?: string;
  choices?: Record<string, string[]>;
  improvements?: Record<string, Partial<Record<Ability, number>>>;
}
export interface CharacterCreation {
  method: 'standard' | 'point-buy' | 'rolled' | 'manual';
  base: Record<Ability, number>;
  bonuses: Partial<Record<Ability, number>>;
  rolls?: number[][];
  background_id?: string;
  background_skills?: string[];
  background_languages?: string[];
  background_tools?: string[];
  class_skills?: string[];
  equipment_applied?: boolean;
  granted_skills?: string[];
  custom_background_name?: string;
  custom_background_feature?: string;
  traits?: string;
  ideal?: string;
  bond?: string;
  flaw?: string;
}
export interface InventoryItem {
  id: string;
  name: string;
  category:
    | 'weapon'
    | 'armor'
    | 'gear'
    | 'item'
    | 'potion'
    | 'ammunition'
    | 'tool'
    | 'focus'
    | 'consumable'
    | 'container'
    | 'treasure'
    | 'magic';
  catalog_id?: string;
  weapon_type?: 'simple' | 'martial';
  weapon_proficiency?: 'auto' | 'proficient' | 'untrained';
  weapon_attack_bonus?: number;
  properties?: string[];
  versatile_damage?: string;
  ammunition?: string;
  cost_gp?: number;
  rarity?: string;
  attunement?: boolean;
  attuned?: boolean;
  charges?: number;
  charges_used?: number;
  quantity: number;
  weight: number;
  equipped: boolean;
  armor_base?: number;
  armor_type?: 'light' | 'medium' | 'heavy' | 'shield';
  damage?: string;
  weapon_mode?: 'melee' | 'ranged';
  weapon_range?: number;
  weapon_ability?: Ability;
  notes: string;
}
export interface Spell {
  catalog_id?: string | null;
  english_name?: string;
  school?: string;
  casting_time?: string;
  ritual?: boolean;
  concentration?: boolean;
  source?: string;
  source_page?: number;
  source_reference_page?: number;
  source_pages?: number[];
  catalog_classes?: string[];
  class_id?: string;
  casting_mode?: 'class' | 'bonus' | 'arcanum';
  always_prepared?: boolean;
  inactive?: boolean;
  granted_path?: string;
  granted_feature?: 'magical-secrets' | 'pact-tome';
  notes?: string;
  id: string;
  name: string;
  level: number;
  prepared: boolean;
  description: string;
  range: string;
  duration: string;
  components: string;
}
export interface DndSheet {
  hit_point_method?: 'average' | 'maximum' | 'rolled';
  hit_point_rolls?: Record<string, number[]>;
  class_levels?: ClassLevel[];
  creation?: CharacterCreation;
  feature_uses?: Record<string, number>;
  hit_dice_by_class?: Record<string, number>;
  race_id?: string | null;
  subclass_id?: string;
  pact_slots_used?: number;
  arcanum_used?: Record<string, number>;
  race: string;
  class_id: string;
  level: number;
  background: string;
  alignment: string;
  xp: number;
  hp_current: number;
  hp_max_override: number | null;
  hp_temp: number;
  speed_override: number | null;
  ac_bonus: number;
  initiative_bonus: number;
  hit_dice_used: number;
  abilities: Record<Ability, number>;
  skills: Record<string, 0 | 1 | 2>;
  saves: Ability[];
  inventory: InventoryItem[];
  spells: Spell[];
  slots_used: Record<string, number>;
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  conditions: string[];
  features: string;
  languages: string;
  death_successes: number;
  death_failures: number;
}
