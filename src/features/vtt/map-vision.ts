import { ambientDarkness } from './vision';
import { shareBattleSnapshot } from './snapshot';
import type { BattleMap, BattleSnapshot, DarknessLevel } from './types';

export type MapVisionSettings = {
  enabled: boolean;
  lighting: 'day' | 'night';
  darkness: DarknessLevel;
};
export function mapVisionSettings(map: BattleMap): MapVisionSettings {
  return {
    enabled: map.vision_enabled === true,
    lighting: map.lighting === 'night' ? 'night' : 'day',
    darkness: ambientDarkness(map),
  };
}
/** Apply a confirmed map response without downloading terrain or changing maps. */
export function mergeVisionMap(snapshot: BattleSnapshot, map: BattleMap): BattleSnapshot {
  const previous = snapshot.maps.find((m) => m.id === map.id);
  if (!previous) return snapshot;
  const before = Date.parse(previous.updated_at),
    after = Date.parse(map.updated_at);
  const fraction = (s: string) => (s.match(/\.(\d+)/)?.[1] ?? '').padEnd(9, '0');
  if (
    before > after ||
    (before === after && fraction(previous.updated_at) > fraction(map.updated_at))
  )
    return snapshot;
  return shareBattleSnapshot(snapshot, {
    ...snapshot,
    maps: snapshot.maps.map((m) => (m.id === map.id ? map : m)),
  });
}

/** Dim light and ordinary darkvision retain the same readable attenuation. */
export const PERSONAL_SHADE_OPACITY = 0.35;
