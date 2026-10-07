export type GridUnit = 'm' | 'ft';
export type DiagonalRule = 'one' | 'sqrt2' | 'five-ten-five';
export type BattleStatus = 'preparing' | 'active' | 'ended';

export interface GridPoint {
  x: number;
  y: number;
  z?: number;
}

export interface BattleSession {
  adventure_session_id?: string;
  id: string;
  campaign_id: string;
  name: string;
  status: BattleStatus;
  round: number;
  turn_index: number;
  active_token_id: string | null;
  restrict_movement_to_turn: boolean;
  turn_started_at: string | null;
  failed_actions_consume?: boolean;
  created_at: string;
  updated_at: string;
}

export interface BattleMap {
  adventure_session_id?: string;
  id: string;
  campaign_id: string;
  battle_session_id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  grid_size: number;
  cell_size: number;
  scale_per_cell: number;
  scale_unit: GridUnit;
  diagonal_rule: DiagonalRule;
  background_image: string | null;
  background_offset_x: number;
  background_offset_y: number;
  background_scale: number;
  grid_visible: boolean;
  grid_opacity: number;
  created_at: string;
  updated_at: string;
}

export interface BattleMapCell {
  id: string;
  map_id: string;
  x: number;
  y: number;
  z: number;
  terrain_type: string;
  movement_cost: number;
  blocked: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BattleMapObject {
  id: string;
  map_id: string;
  object_type: string;
  geometry: Record<string, unknown>;
  z: number;
  blocks_movement: boolean;
  blocks_vision: boolean;
  visible: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BattleToken {
  id: string;
  campaign_id: string;
  map_id: string;
  character_id: string | null;
  npc_id: string | null;
  name: string;
  image: string | null;
  x: number;
  y: number;
  z: number;
  size: number;
  movement_speed: number;
  movement_remaining: number;
  movement_unit: GridUnit;
  controlled_by: string | null;
  visible: boolean;
  faction?: 'ally' | 'enemy' | 'neutral';
  action_used?: boolean;
  bonus_used?: boolean;
  reaction_used?: boolean;
  attacks_remaining?: number;
  disengaged?: boolean;
  dodging?: boolean;
  movement_bonus?: number;
  bonus_spell_cast?: boolean;
  action_spell_level?: number;
  raging?: boolean;
  sneak_used?: boolean;
  surge_used?: boolean;
  hunter_used?: boolean;
  weapon_attacked?: boolean;
  extra_actions?: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface BattleTurnOrder {
  id: string;
  session_id: string;
  token_id: string;
  position: number;
  initiative: number;
  created_at: string;
}

export interface BattleMovement {
  id: string;
  campaign_id: string;
  session_id: string | null;
  token_id: string;
  character_id: string | null;
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
  movement_cost: number;
  movement_unit: GridUnit;
  path: GridPoint[];
  turn_round: number | null;
  created_at: string;
}

export interface BattleSnapshot {
  sessions: BattleSession[];
  maps: BattleMap[];
  cells: BattleMapCell[];
  objects: BattleMapObject[];
  fog?: BattleFogCell[];
  tokens: BattleToken[];
  turnOrder: BattleTurnOrder[];
  actions?: BattleActionRequest[];
  spellEffects?: BattleSpellEffect[];
  actionsReady?: boolean;
  movementPlans?: BattleMovementPlan[];
}

export type BattleActionKind =
  'weapon' | 'spell' | 'item' | 'feature' | 'dash' | 'disengage' | 'dodge' | 'opportunity';
export interface BattleActionRequest {
  id: string;
  campaign_id: string;
  session_id: string;
  map_id: string;
  token_id: string;
  requested_by: string;
  client_id: string;
  kind: BattleActionKind;
  source_id: string | null;
  movement_plan_id?: string | null;
  name: string;
  cost: 'action' | 'bonus' | 'reaction' | 'free';
  resource_kind: 'none' | 'cantrip' | 'slot' | 'pact' | 'arcanum';
  resource_level: number;
  spell_level: number;
  target: GridPoint;
  target_ids: string[];
  definition: import('./effects').CombatEffect & {
    description?: string;
    duration?: string;
    concentration?: boolean;
    casting_time?: string;
  };
  round: number;
  turn_index: number;
  turn_started_at: string | null;
  status: 'pending' | 'approved' | 'success' | 'failure' | 'cancelled' | 'expired';
  resolution: {
    awaiting_roll?: boolean;
    required_dice?: string;
    roll_kind?: import('./effects').CombatEffect['kind'];
    roll?: number;
    dice_roll_id?: string;
    dice_roll?: import('./dice').DiceRoll;
    count?: number;
    resources_consumed?: boolean;
    affected?: { token_id: string; name: string; amount: number; kind: string; saved: boolean }[];
  };
  created_at: string;
  resolved_at: string | null;
}
export interface BattleSpellEffect {
  id: string;
  request_id: string;
  campaign_id: string;
  map_id: string;
  token_id: string;
  name: string;
  definition: BattleActionRequest['definition'];
  target: GridPoint;
  concentration: boolean;
  duration: string;
  active: boolean;
  pulses: number;
  created_at: string;
  updated_at: string;
}
export interface BattleActionPayload {
  kind: Exclude<BattleActionKind, 'opportunity'>;
  source_id?: string;
  target?: GridPoint;
  target_ids?: string[];
  resource_kind?: BattleActionRequest['resource_kind'];
  resource_level?: number;
  cost?: 'action' | 'bonus';
  feature_id?: string;
  feature_units?: number;
  weapon_options?: import('@/systems/dnd5e/combat-features').WeaponOptions;
}
export interface BattleMovementPlan {
  id: string;
  campaign_id: string;
  session_id: string;
  token_id: string;
  target: GridPoint;
  path: GridPoint[];
  status: 'pending' | 'done' | 'cancelled';
  reason: string;
  created_at: string;
}

export interface MovementRules {
  diagonalRule: DiagonalRule;
  allowOccupiedDestination?: boolean;
}

export interface MovementResult {
  distance: number;
  cost: number;
  path: GridPoint[];
  allowed: boolean;
  reason?: string;
}

export interface BattleFogCell {
  id: string;
  map_id: string;
  x: number;
  y: number;
}
