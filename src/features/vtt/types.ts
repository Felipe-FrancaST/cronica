export type GridUnit = 'm' | 'ft';
export type DiagonalRule = 'one' | 'sqrt2' | 'five-ten-five';
export type BattleStatus = 'preparing' | 'active' | 'ended';

export interface GridPoint {
  x: number;
  y: number;
  z?: number;
}

export interface BattleSession {
  id: string;
  campaign_id: string;
  name: string;
  status: BattleStatus;
  round: number;
  turn_index: number;
  active_token_id: string | null;
  restrict_movement_to_turn: boolean;
  turn_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BattleMap {
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
  tokens: BattleToken[];
  turnOrder: BattleTurnOrder[];
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
