import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/systems/dnd5e/data/spells.json';
const spells = JSON.parse(readFileSync(file, 'utf8'));
const normalize = (s) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
// Tasha's 2014 Artificer list, restricted to spells present in the supplied PDF.
const artificer = [
  'Acid Splash',
  'Dancing Lights',
  'Fire Bolt',
  'Guidance',
  'Light',
  'Mage Hand',
  'Mending',
  'Message',
  'Poison Spray',
  'Prestidigitation',
  'Ray of Frost',
  'Resistance',
  'Shocking Grasp',
  'Spare the Dying',
  'Thorn Whip',
  'Alarm',
  'Cure Wounds',
  'Detect Magic',
  'Disguise Self',
  'Expeditious Retreat',
  'Faerie Fire',
  'False Life',
  'Feather Fall',
  'Grease',
  'Identify',
  'Jump',
  'Longstrider',
  'Purify Food and Drink',
  'Sanctuary',
  'Aid',
  'Alter Self',
  'Arcane Lock',
  'Blur',
  'Continual Flame',
  'Darkvision',
  'Enhance Ability',
  'Enlarge/Reduce',
  'Heat Metal',
  'Invisibility',
  'Lesser Restoration',
  'Levitate',
  'Magic Mouth',
  'Magic Weapon',
  'Protection from Poison',
  'Rope Trick',
  'See Invisibility',
  'Spider Climb',
  'Web',
  'Blink',
  'Create Food and Water',
  'Dispel Magic',
  'Elemental Weapon',
  'Fly',
  'Glyph of Warding',
  'Haste',
  'Protection from Energy',
  'Revivify',
  'Water Breathing',
  'Water Walk',
  'Arcane Eye',
  'Fabricate',
  'Freedom of Movement',
  'Leomund’s Secret Chest',
  'Mordenkainen’s Faithful Hound',
  'Mordenkainen’s Private Sanctum',
  'Otiluke’s Resilient Sphere',
  'Stone Shape',
  'Stoneskin',
  'Animate Objects',
  'Bigby’s Hand',
  'Creation',
  'Greater Restoration',
  'Wall of Stone',
];
for (const name of artificer) {
  const found = spells.find((s) => normalize(s.english_name) === normalize(name));
  if (!found) throw new Error(`Unmatched Artificer spell: ${name}`);
  if (!found.classes.includes('artificer')) found.classes.push('artificer');
  found.class_sources = { artificer: 'Tasha’s Cauldron of Everything (2020), lista de 2014' };
  found.classes.sort();
}
writeFileSync(file, JSON.stringify(spells, null, 2) + '\n');
writeFileSync(
  'src/systems/dnd5e/data/spell-index.json',
  JSON.stringify(
    spells.map(({ id, level, classes }) => ({ id, level, classes })),
    null,
    2,
  ) + '\n',
);
console.log(
  `${spells.length} spells; ${artificer.length} linked to Artificer; reference index created.`,
);
