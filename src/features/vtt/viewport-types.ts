import type { BattleMap, BattleSnapshot, BattleToken, GridPoint } from './types';

export type TerrainTool = 'move' | 'normal' | 'difficult' | 'blocked' | 'custom';
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
