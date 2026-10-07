import { convertDistance } from './movement';
import type { BattleToken, GridPoint } from './types';
import type { TacticalViewportProps } from './viewport-types';

type ControlContext = Pick<
  TacticalViewportProps,
  'master' | 'userId' | 'characterOwners' | 'restrictToTurn' | 'sessionActiveTokenId'
>;

export function canControlToken(token: BattleToken, context: ControlContext) {
  if (context.master) return true;
  const owned =
    token.controlled_by === context.userId ||
    Boolean(token.character_id && context.characterOwners[token.character_id] === context.userId);
  return owned && (!context.restrictToTurn || context.sessionActiveTokenId === token.id);
}
export function tokenControlReason(token: BattleToken, context: ControlContext) {
  if (canControlToken(token, context)) return null;
  const owned =
    token.controlled_by === context.userId ||
    Boolean(token.character_id && context.characterOwners[token.character_id] === context.userId);
  return owned
    ? 'Aguarde o turno deste personagem para movê-lo.'
    : 'Você não controla este personagem. Selecione o seu token ou peça ao mestre para atribuir o controle.';
}

export function tokenAtCell(tokens: BattleToken[], point: GridPoint | null) {
  if (!point) return null;
  return (
    tokens.find(
      (token) =>
        point.x >= token.x &&
        point.y >= token.y &&
        point.x < token.x + token.size &&
        point.y < token.y + token.size,
    ) ?? null
  );
}

export function movementBudget(
  token: BattleToken,
  props: Pick<TacticalViewportProps, 'map' | 'master' | 'forceMove' | 'movementLimited'>,
) {
  if (!props.movementLimited || (props.master && props.forceMove)) return undefined;
  return (
    convertDistance(token.movement_remaining, token.movement_unit, props.map.scale_unit) /
    props.map.scale_per_cell
  );
}

export function sameCell(a: GridPoint | null, b: GridPoint | null) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

// Logical y is the depth axis of the 3D scene. Logical z remains elevation.
export function gridToWorld(point: GridPoint, size = 1) {
  return { x: point.x + size / 2, y: point.z ?? 0, z: point.y + size / 2 };
}

export function worldToCell(x: number, z: number, width: number, height: number): GridPoint | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < 0 || z < 0 || x >= width || z >= height)
    return null;
  return { x: Math.floor(x), y: Math.floor(z) };
}
