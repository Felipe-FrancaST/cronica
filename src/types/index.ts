import type { Ability, Spell, DndSheet } from '@/systems/dnd5e/types';
export type {
  Ability,
  InventoryItem,
  Spell,
  DndSheet,
  ClassLevel,
  CharacterCreation,
} from '@/systems/dnd5e/types';
export type Mode = 'master' | 'player';
export type CampaignStatus = 'active' | 'archived';
export type JsonRecord = Record<string, unknown>;
export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_path: string | null;
  preferences: JsonRecord;
  created_at: string;
}
export interface RpgSystem {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  active: boolean;
}
export interface Campaign {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  theme: string;
  cover_path: string | null;
  rpg_system_id: string;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}
export interface Member {
  id: string;
  campaign_id: string;
  user_id: string;
  status: 'active';
  created_at: string;
  profile?: Profile;
}
export interface Character<TSheet = DndSheet> {
  id: string;
  campaign_id: string;
  owner_id: string;
  rpg_system_id: string;
  name: string;
  portrait_path: string | null;
  appearance: string;
  biography: string;
  sheet: TSheet;
  created_at: string;
  updated_at: string;
}
export type WorldKind = 'region' | 'city' | 'location';
export interface WorldEntry {
  id: string;
  campaign_id: string;
  kind: WorldKind;
  name: string;
  description: string;
  image_path: string | null;
  type: string;
  location: string;
  notes: string;
  region_id: string | null;
  population: number | null;
  government: string;
  visible_to_players: boolean;
  secrets?: string;
  private_notes?: string;
  created_at: string;
  updated_at: string;
}
export interface NpcAttack {
  id: string;
  name: string;
  bonus: number;
  damage: string;
  range: string;
  description: string;
}
export interface Npc {
  id: string;
  campaign_id: string;
  rpg_system_id: string;
  name: string;
  image_path: string | null;
  race: string;
  type: string;
  level: number;
  age: string;
  appearance: string;
  personality: string;
  biography: string;
  location: string;
  faction: string;
  relationship: string;
  status: string;
  visible_to_players: boolean;
  abilities: Record<Ability, number>;
  hp_current: number;
  hp_max: number;
  hp_temp?: number;
  ac: number;
  attacks: NpcAttack[];
  spells: Spell[];
  abilities_text: string;
  resistances: string;
  weaknesses: string;
  inventory: string;
  created_at: string;
  updated_at: string;
}
export interface Workspace {
  rules?: import('@/features/sessions/types').CampaignRules[];
  profiles: Profile[];
  systems: RpgSystem[];
  campaigns: Campaign[];
  members: Member[];
  characters: Character[];
  world: WorldEntry[];
  npcs: Npc[];
}
export interface WorkspaceRepository {
  load(): Promise<Workspace>;
  saveCampaign(campaign: Campaign): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  addMember(campaignId: string, email: string): Promise<void>;
  removeMember(id: string): Promise<void>;
  saveCharacter(character: Character): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  saveWorld(entry: WorldEntry): Promise<void>;
  deleteWorld(entry: WorldEntry): Promise<void>;
  saveNpc(npc: Npc): Promise<void>;
  deleteNpc(id: string): Promise<void>;
  saveProfile(profile: Profile): Promise<void>;
}
