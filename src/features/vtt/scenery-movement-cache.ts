import { sceneryMovementCells, sceneryRect } from './scenery';
import type { BattleMapCell, BattleMapObject } from './types';

/** Only obstacle footprints and movement costs invalidate pathfinding. */
export function sceneryMovementSignature(objects: BattleMapObject[]) {
  return JSON.stringify(
    objects.flatMap((object) => {
      const rect = sceneryRect(object);
      const cost = Math.min(10, Math.max(1, Number(object.metadata.movement_cost) || 1));
      return rect && (object.blocks_movement || cost > 1)
        ? [
            [
              object.id,
              object.map_id,
              rect.x,
              rect.y,
              rect.width,
              rect.height,
              object.z,
              object.object_type,
              object.blocks_movement,
              cost,
            ],
          ]
        : [];
    }),
  );
}

export function createSceneryMovementCache() {
  let previousCells: BattleMapCell[] | undefined;
  let previousSignature: string | undefined;
  let result: BattleMapCell[] = [];
  return (cells: BattleMapCell[], objects: BattleMapObject[]) => {
    const signature = sceneryMovementSignature(objects);
    if (previousCells !== cells || previousSignature !== signature) {
      result = sceneryMovementCells(cells, objects);
      previousCells = cells;
      previousSignature = signature;
    }
    return result;
  };
}
