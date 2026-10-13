import { sceneryDefaults, sceneryInteraction } from './scenery';
import type { BattleMapObject } from './types';

/** A state change preserves position, custom costs, names and all other settings. */
export function changeSceneryState(object: BattleMapObject, variant: string): BattleMapObject {
  const interaction = sceneryInteraction(object);
  if (!interaction || interaction.variant !== variant)
    throw new Error('Esta interação não está disponível para o elemento.');
  const defaults = sceneryDefaults(object.object_type, variant);
  const passage = ['door', 'portcullis', 'cage'].includes(object.object_type);
  return {
    ...object,
    metadata: { ...object.metadata, variant },
    blocks_movement: passage ? defaults.blocks : object.blocks_movement,
    blocks_vision: passage ? defaults.blocksVision : object.blocks_vision,
  };
}
