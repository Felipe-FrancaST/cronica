import type { BattleMap, BattleSnapshot, BattleToken, GridPoint } from './types';

export type TerrainTool =
  | 'interact'
  | 'move'
  | 'move-scenery'
  | 'normal'
  | 'difficult'
  | 'blocked'
  | 'custom'
  | 'scenery'
  | 'inspect'
  | 'erase-scenery'
  | 'hide'
  | 'reveal'
  | 'darkness';
export type NavigationMode = 'play' | 'orbit' | 'pan';
export type SceneQuality = 'balanced' | 'low';
export interface CameraCommand {
  sequence: number;
  action:
    | 'zoom-in'
    | 'zoom-out'
    | 'fit'
    | 'center'
    | 'focus'
    | 'isometric'
    | 'top'
    | 'rotate-left'
    | 'rotate-right';
}

export interface TacticalViewportProps {
  onCombatProjection?(projection: import('./combat-visuals').CombatProjection | null): void;
  map: BattleMap;
  cells: BattleSnapshot['cells'];
  objects?: BattleSnapshot['objects'];
  fog?: BattleSnapshot['fog'];
  vision?: import('./vision').VisionMap;
  darknessStart?: GridPoint | null;
  darknessBrush?: import('./types').DarknessLevel;
  spellZones?: import('./spell-scenes').SpellZone[];
  spellLights?: import('./scenery-lighting').SceneryLight[];
  fogBrushSize?: number;
  terrainBrushWidth?: number;
  terrainBrushHeight?: number;
  sceneryBrush?: import('./scenery').SceneryBrush | null;
  tokens: BattleToken[];
  tokenLife?: Record<string, import('./life-state').LifeState>;
  sessionActiveTokenId: string | null;
  restrictToTurn: boolean;
  movementLimited: boolean;
  userId: string;
  characterOwners: Record<string, string>;
  master: boolean;
  selectedTokenId: string | null;
  onSelectToken(id: string | null): void;
  onTokenTap?(id: string): void;
  terrainTool: TerrainTool;
  forceMove: boolean;
  backgroundUrl: string | null;
  tokenUrls: Record<string, string>;
  disabled: boolean;
  targeting?: boolean;
  effectPreview?: import('./effects').EffectPreview | null;
  onTarget?(point: GridPoint, tokenId: string | null): void;
  onTargetHover?(point: GridPoint | null): void;
  /** Returning true consumes a scenery tap before any character movement or painting. */
  onSceneryTap?(point: GridPoint, objectId?: string): boolean;
  cameraCommand?: CameraCommand | null;
  navigationMode?: NavigationMode;
  quality?: SceneQuality;
  reducedMotion?: boolean;
  onUnavailable?(): void;
  onBlocked?(reason: string): void;
  onMove(
    token: BattleToken,
    destination: GridPoint,
    path: GridPoint[],
    force: boolean,
  ): Promise<void>;
  onPaint(point: GridPoint, tool: TerrainTool, objectId?: string): Promise<void>;
}
