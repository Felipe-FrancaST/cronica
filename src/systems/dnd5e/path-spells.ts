import type { DndSheet } from './types';
import { classLevels } from './progression';
const LIFE: [number, string[]][] = [
  [1, ['Bless', 'Cure Wounds']],
  [3, ['Lesser Restoration', 'Spiritual Weapon']],
  [5, ['Beacon of Hope', 'Revivify']],
  [7, ['Death Ward', 'Guardian of Faith']],
  [9, ['Mass Cure Wounds', 'Raise Dead']],
];
const DEVOTION: [number, string[]][] = [
  [3, ['Protection from Evil and Good', 'Sanctuary']],
  [5, ['Lesser Restoration', 'Zone of Truth']],
  [9, ['Beacon of Hope', 'Dispel Magic']],
  [13, ['Freedom of Movement', 'Guardian of Faith']],
  [17, ['Commune', 'Flame Strike']],
];
const LAND: Record<string, string[][]> = {
  Ártico: [
    ['Hold Person', 'Spike Growth'],
    ['Sleet Storm', 'Slow'],
    ['Freedom of Movement', 'Ice Storm'],
    ['Commune with Nature', 'Cone of Cold'],
  ],
  Costa: [
    ['Mirror Image', 'Misty Step'],
    ['Water Breathing', 'Water Walk'],
    ['Control Water', 'Freedom of Movement'],
    ['Conjure Elemental', 'Scrying'],
  ],
  Deserto: [
    ['Blur', 'Silence'],
    ['Create Food and Water', 'Protection from Energy'],
    ['Blight', 'Hallucinatory Terrain'],
    ['Insect Plague', 'Wall of Stone'],
  ],
  Floresta: [
    ['Barkskin', 'Spider Climb'],
    ['Call Lightning', 'Plant Growth'],
    ['Divination', 'Freedom of Movement'],
    ['Commune with Nature', 'Tree Stride'],
  ],
  Montanha: [
    ['Spider Climb', 'Spike Growth'],
    ['Lightning Bolt', 'Meld into Stone'],
    ['Stone Shape', 'Stoneskin'],
    ['Passwall', 'Wall of Stone'],
  ],
  Pântano: [
    ['Darkness', 'Melf’s Acid Arrow'],
    ['Water Walk', 'Stinking Cloud'],
    ['Freedom of Movement', 'Locate Creature'],
    ['Insect Plague', 'Scrying'],
  ],
  Planície: [
    ['Invisibility', 'Pass Without Trace'],
    ['Daylight', 'Haste'],
    ['Divination', 'Freedom of Movement'],
    ['Dream', 'Insect Plague'],
  ],
  Subterrâneo: [
    ['Spider Climb', 'Web'],
    ['Gaseous Form', 'Stinking Cloud'],
    ['Greater Invisibility', 'Stone Shape'],
    ['Cloudkill', 'Insect Plague'],
  ],
};
export const PATH_SPELL_TERRAINS = Object.keys(LAND);
export function pathSpells(sheet: DndSheet, classId: string) {
  const c = classLevels(sheet).find((c) => c.class_id === classId);
  if (!c) return [];
  let list: [number, string[]][] = [];
  if (c.class_id === 'cleric' && c.subclass_id === 'life') list = LIFE;
  if (c.class_id === 'paladin' && c.subclass_id === 'devotion') list = DEVOTION;
  if (c.class_id === 'druid' && c.subclass_id === 'land')
    list = (LAND[c.choices?.land?.[0] ?? ''] ?? []).map((names, i) => [3 + i * 2, names]);
  return list.filter(([level]) => level <= c.level).flatMap(([, names]) => names);
}
