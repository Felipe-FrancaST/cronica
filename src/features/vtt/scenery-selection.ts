import { sceneryRect } from './scenery';
import type { BattleMap, BattleMapObject, GridPoint } from './types';

/** Relocation updates the existing element, keeping its contents, key and visual settings. */
export function sceneryDestinationGeometry(
  object: BattleMapObject,
  destination: GridPoint,
  map: Pick<BattleMap, 'id' | 'width' | 'height'>,
): BattleMapObject['geometry'] {
  const rect = sceneryRect(object);
  if (!rect || object.map_id !== map.id) throw new Error('Selecione um elemento deste mapa.');
  if (
    !Number.isInteger(destination.x) ||
    !Number.isInteger(destination.y) ||
    destination.x < 0 ||
    destination.y < 0 ||
    destination.x + rect.width > map.width ||
    destination.y + rect.height > map.height
  )
    throw new Error('O elemento ultrapassa as bordas do mapa. Escolha outra célula de destino.');
  return { ...object.geometry, x: destination.x, y: destination.y };
}
