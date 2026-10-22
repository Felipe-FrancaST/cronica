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
export const DOMAIN_SPELLS: Record<string, string[][]> = {
  knowledge: [
    ['Command', 'Identify'],
    ['Augury', 'Suggestion'],
    ['Nondetection', 'Speak with Dead'],
    ['Arcane Eye', 'Confusion'],
    ['Legend Lore', 'Scrying'],
  ],
  light: [
    ['Burning Hands', 'Faerie Fire'],
    ['Flaming Sphere', 'Scorching Ray'],
    ['Daylight', 'Fireball'],
    ['Guardian of Faith', 'Wall of Fire'],
    ['Flame Strike', 'Scrying'],
  ],
  nature: [
    ['Animal Friendship', 'Speak with Animals'],
    ['Barkskin', 'Spike Growth'],
    ['Plant Growth', 'Wind Wall'],
    ['Dominate Beast', 'Grasping Vine'],
    ['Insect Plague', 'Tree Stride'],
  ],
  tempest: [
    ['Fog Cloud', 'Thunderwave'],
    ['Gust of Wind', 'Shatter'],
    ['Call Lightning', 'Sleet Storm'],
    ['Control Water', 'Ice Storm'],
    ['Destructive Wave', 'Insect Plague'],
  ],
  trickery: [
    ['Charm Person', 'Disguise Self'],
    ['Mirror Image', 'Pass Without Trace'],
    ['Blink', 'Dispel Magic'],
    ['Dimension Door', 'Polymorph'],
    ['Dominate Person', 'Modify Memory'],
  ],
  war: [
    ['Divine Favor', 'Shield of Faith'],
    ['Magic Weapon', 'Spiritual Weapon'],
    ['Crusader’s Mantle', 'Spirit Guardians'],
    ['Freedom of Movement', 'Stoneskin'],
    ['Flame Strike', 'Hold Monster'],
  ],
};
export const OATH_SPELLS: Record<string, string[][]> = {
  ancients: [
    ['Ensnaring Strike', 'Speak with Animals'],
    ['Moonbeam', 'Misty Step'],
    ['Plant Growth', 'Protection from Energy'],
    ['Ice Storm', 'Stoneskin'],
    ['Commune with Nature', 'Tree Stride'],
  ],
  vengeance: [
    ['Bane', 'Hunter’s Mark'],
    ['Hold Person', 'Misty Step'],
    ['Haste', 'Protection from Energy'],
    ['Banishment', 'Dimension Door'],
    ['Hold Monster', 'Scrying'],
  ],
};
export const PATRON_SPELLS: Record<string, string[][]> = {
  fiend: [
    ['Burning Hands', 'Command'],
    ['Blindness/Deafness', 'Scorching Ray'],
    ['Fireball', 'Stinking Cloud'],
    ['Fire Shield', 'Wall of Fire'],
    ['Flame Strike', 'Hallow'],
  ],
  archfey: [
    ['Faerie Fire', 'Sleep'],
    ['Calm Emotions', 'Phantasmal Force'],
    ['Blink', 'Plant Growth'],
    ['Dominate Beast', 'Greater Invisibility'],
    ['Dominate Person', 'Seeming'],
  ],
  'great-old-one': [
    ['Dissonant Whispers', 'Tasha’s Hideous Laughter'],
    ['Detect Thoughts', 'Phantasmal Force'],
    ['Clairvoyance', 'Sending'],
    ['Dominate Beast', 'Evard’s Black Tentacles'],
    ['Dominate Person', 'Telekinesis'],
  ],
};
export const ARTIFICER_SPELLS: Record<string, string[][]> = {
  alchemist: [
    ['Healing Word', 'Ray of Sickness'],
    ['Flaming Sphere', 'Melf’s Acid Arrow'],
    ['Gaseous Form', 'Mass Healing Word'],
    ['Blight', 'Death Ward'],
    ['Cloudkill', 'Raise Dead'],
  ],
  armorer: [
    ['Magic Missile', 'Thunderwave'],
    ['Mirror Image', 'Shatter'],
    ['Hypnotic Pattern', 'Lightning Bolt'],
    ['Fire Shield', 'Greater Invisibility'],
    ['Passwall', 'Wall of Force'],
  ],
  artillerist: [
    ['Shield', 'Thunderwave'],
    ['Scorching Ray', 'Shatter'],
    ['Fireball', 'Wind Wall'],
    ['Ice Storm', 'Wall of Fire'],
    ['Cone of Cold', 'Wall of Force'],
  ],
  'battle-smith': [
    ['Heroism', 'Shield'],
    ['Branding Smite', 'Warding Bond'],
    ['Aura of Vitality', 'Conjure Barrage'],
    ['Aura of Purity', 'Fire Shield'],
    ['Banishing Smite', 'Mass Cure Wounds'],
  ],
};
export const PATH_SPELL_TERRAINS = Object.keys(LAND);
export function expandedSpells(sheet: DndSheet, classId: string) {
  const c = classLevels(sheet).find((c) => c.class_id === classId);
  if (c?.class_id !== 'warlock') return [];
  return (PATRON_SPELLS[c.subclass_id ?? ''] ?? [])
    .slice(0, Math.min(5, Math.ceil(c.level / 2)))
    .flat();
}
export function pathSpells(sheet: DndSheet, classId: string) {
  const c = classLevels(sheet).find((c) => c.class_id === classId);
  if (!c) return [];
  let list: [number, string[]][] = [];
  if (c.class_id === 'cleric' && c.subclass_id === 'life') list = LIFE;
  else if (c.class_id === 'cleric')
    list = (DOMAIN_SPELLS[c.subclass_id ?? ''] ?? []).map((names, i) => [1 + i * 2, names]);
  if (c.class_id === 'paladin' && c.subclass_id === 'devotion') list = DEVOTION;
  else if (c.class_id === 'paladin')
    list = (OATH_SPELLS[c.subclass_id ?? ''] ?? []).map((names, i) => [
      [3, 5, 9, 13, 17][i],
      names,
    ]);
  if (c.class_id === 'artificer')
    list = (ARTIFICER_SPELLS[c.subclass_id ?? ''] ?? []).map((names, i) => [
      [3, 5, 9, 13, 17][i],
      names,
    ]);
  if (c.class_id === 'druid' && c.subclass_id === 'land')
    list = (LAND[c.choices?.land?.[0] ?? ''] ?? []).map((names, i) => [3 + i * 2, names]);
  const spells = list.filter(([level]) => level <= c.level).flatMap(([, names]) => names);
  if (c.class_id === 'cleric' && c.subclass_id === 'light' && c.level >= 1) spells.push('Light');
  return spells;
}
