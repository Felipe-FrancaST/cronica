import type { BattleMap, BattleSnapshot, BattleToken, GridPoint } from './types';

export type TerrainTool =
  | 'move'
  | 'normal'
  | 'difficult'
  | 'blocked'
  | 'custom'
  | 'scenery'
  | 'inspect'
  | 'hide'
  | 'reveal';
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
  map: BattleMap;
  cells: BattleSnapshot['cells'];
  objects?: BattleSnapshot['objects'];
  fog?: BattleSnapshot['fog'];
  fogBrushSize?: number;
  sceneryBrush?: import('./scenery').SceneryBrush | null;
  tokens: BattleToken[];
  sessionActiveTokenId: string | null;
  restrictToTurn: boolean;
  movementLimited: boolean;
  userId: string;
  characterOwners: Record<string, string>;
  master: boolean;
  selectedTokenId: string | null;
  onSelectToken(id: string | null): void;
  terrainTool: TerrainTool;
  forceMove: boolean;
  backgroundUrl: string | null;
  tokenUrls: Record<string, string>;
  disabled: boolean;
  targeting?: boolean;
  effectPreview?: import('./effects').EffectPreview | null;
  onTarget?(point: GridPoint, tokenId: string | null): void;
  cameraCommand?: CameraCommand | null;
  navigationMode?: NavigationMode;
  quality?: SceneQuality;
  onUnavailable?(): void;
  onMove(
    token: BattleToken,
    destination: GridPoint,
    path: GridPoint[],
    force: boolean,
  ): Promise<void>;
  onPaint(point: GridPoint, tool: TerrainTool): Promise<void>;
}
