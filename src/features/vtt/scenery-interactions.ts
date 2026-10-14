import { sceneryDefaults, sceneryInteraction, sceneryRect } from './scenery';
import type { BattleMapObject, BattleToken } from './types';

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

/** Master-only visual preview. Contents and player permissions still come from the server. */
export function previewSceneryState(
  object: BattleMapObject,
  variant: string,
  tokens: BattleToken[],
) {
  let changed: BattleMapObject;
  const passage = ['door', 'portcullis', 'cage', 'secretwall'].includes(object.object_type);
  if (variant === 'lock' || variant === 'unlock') {
    if (object.metadata.has_key !== true) return object;
    changed = {
      ...object,
      metadata: { ...object.metadata, interaction_locked: variant === 'lock' },
    };
    if (variant === 'lock') {
      changed.metadata.variant = String(object.metadata.variant ?? '').startsWith('iron')
        ? 'iron'
        : 'default';
      if (passage) {
        changed.blocks_movement = true;
        changed.blocks_vision = ['door', 'secretwall'].includes(object.object_type);
      }
    }
  } else {
    changed = changeSceneryState(object, variant);
    if (['open', 'iron-open'].includes(variant) && object.metadata.interaction_locked === true)
      changed.metadata = { ...changed.metadata, interaction_locked: false };
  }
  // Avoid flashing a closed passage over a known occupant while the server checks it.
  const rect = sceneryRect(changed);
  if (
    passage &&
    changed.blocks_movement &&
    !object.blocks_movement &&
    rect &&
    tokens.some(
      (t) =>
        t.map_id === changed.map_id &&
        t.x < rect.x + rect.width &&
        t.x + t.size > rect.x &&
        t.y < rect.y + rect.height &&
        t.y + t.size > rect.y,
    )
  )
    return object;
  return changed;
}
