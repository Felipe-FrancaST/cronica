import { sceneryDefaults, sceneryInteraction } from './scenery';
import type { BattleMapObject } from './types';

/** A state change preserves position, custom costs, names and all other settings. */
export function changeSceneryState(object: BattleMapObject, variant: string): BattleMapObject {
  const interaction = sceneryInteraction(object);
  if (!interaction || interaction.variant !== variant)
    throw new Error('Esta interação não está disponível para o elemento.');
  if (variant === 'light-on' || variant === 'light-off')
    return { ...object, metadata: { ...object.metadata, light_enabled: variant === 'light-on' } };
  const defaults = sceneryDefaults(object.object_type, variant);
  const passage = ['door', 'portcullis', 'cage', 'secretwall'].includes(object.object_type);
  return {
    ...object,
    metadata: { ...object.metadata, variant },
    blocks_movement: passage ? defaults.blocks : object.blocks_movement,
    blocks_vision: passage ? defaults.blocksVision : object.blocks_vision,
  };
}
