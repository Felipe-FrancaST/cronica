export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export interface InventoryItem {
  id: string;
  name: string;
  category: 'weapon' | 'armor' | 'gear' | 'item';
  quantity: number;
  weight: number;
  equipped: boolean;
  armor_base?: number;
  armor_type?: 'light' | 'medium' | 'heavy' | 'shield';
  damage?: string;
  notes: string;
}
export interface Spell {
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
