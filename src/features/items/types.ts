import type { InventoryItem } from '@/systems/dnd5e/types';

export type ItemActionCost = 'action' | 'bonus' | 'reaction' | 'free';
export interface ItemFunction {
  id: string;
  name: string;
  kind: 'healing' | 'damage' | 'temporary' | 'utility';
  dice: string;
  cost: ItemActionCost;
  range: number;
  shape: 'single' | 'self' | 'sphere' | 'cone' | 'line' | 'cube';
  origin: 'point' | 'self';
  size: number;
  width: number;
  damageType: string;
  save: string;
  save_dc?: number;
  attackRoll?: boolean;
  attack_bonus?: number;
  halfOnSave: boolean;
  charge_cost: number;
  quantity_cost: number;
  requires_equipped: boolean;
  note: string;
}
export interface ItemBonuses {
  ac: number;
  speed: number;
  attack: number;
  damage: number;
}
export type ItemRecharge = 'manual' | 'short' | 'long' | 'dawn' | 'none';
export type ItemDefinition = Omit<
  InventoryItem,
  | 'id'
  | 'quantity'
  | 'equipped'
  | 'charges_used'
  | 'attuned'
  | 'catalog_id'
  | 'campaign_item_id'
  | 'definition_version'
> & {
  functions: ItemFunction[];
  bonuses: ItemBonuses;
  tags: string[];
  recharge: ItemRecharge;
  passive_requires_equipped: boolean;
  image_path: string | null;
};
export interface CampaignItem {
  id: string;
  campaign_id: string;
  name: string;
  data: ItemDefinition;
  visible_to_players: boolean;
  archived: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  private_notes?: string;
}
export interface ItemDelivery {
  id: string;
  campaign_id: string;
  item_id: string;
  character_id: string;
  inventory_id: string;
  item_name: string;
  quantity: number;
  definition_version: number;
  created_at: string;
}
