import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_CATALOG, filterSpells, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
import { CLASSES } from '../src/systems/dnd5e/catalog';
import { RACE_CATALOG, getRace } from '../src/systems/dnd5e/ancestries';
import { defaultSheet, calculate, validate, dnd5e } from '../src/systems/dnd5e';
import {
  spellSlots,
  castingProfile,
  castSpell,
  recoverSpellResources,
  normalizeSpellResources,
} from '../src/systems/dnd5e/spellcasting';
import { createDemoWorkspace } from '../src/lib/demo-data';
const entry = (english: string) => {
  const found = SPELL_CATALOG.find((sp) => sp.english_name === english);
  assert.ok(found, english);
  return found;
};
test('the PDF reference has 361 unique complete entries and 27 cantrips, with valid class links', () => {
  assert.equal(SPELL_CATALOG.length, 361);
  assert.equal(SPELL_CATALOG.filter((s) => s.level === 0).length, 27);
  assert.equal(new Set(SPELL_CATALOG.map((s) => s.id)).size, 361);
  assert.equal(new Set(SPELL_CATALOG.map((s) => s.english_name)).size, 361);
  for (const sp of SPELL_CATALOG) {
    assert.ok(sp.description.length > 50, sp.name);
    for (const key of ['casting_time', 'range', 'components', 'duration', 'school'] as const)
      assert.ok(sp[key], `${sp.name} ${key}`);
    assert.ok(sp.source_page >= 7 && sp.source_page <= 74);
    assert.ok(sp.classes.length);
    assert.ok(sp.classes.every((c) => !!CLASSES[c]));
  }
  assert.equal(entry('Fireball').level, 3);
  assert.deepEqual(entry('Eldritch Blast').classes, ['warlock']);
  assert.ok(entry('Cure Wounds').classes.includes('artificer'));
  assert.ok(!entry('Fireball').classes.includes('artificer'));
});
test('search supports accents, English aliases, class, level zero, school, rituals and concentration', () => {
  assert.equal(
    filterSpells(SPELL_CATALOG, { query: 'bola fogo', classId: 'wizard', level: '3' }).length,
    1,
  );
  assert.equal(
    filterSpells(SPELL_CATALOG, { query: 'fireball', level: '3' })[0].name,
    'Bola de Fogo',
  );
  assert.equal(
    filterSpells(SPELL_CATALOG, { query: 'orientacao', level: '0' })[0].name,
    'Orientação',
  );
  assert.ok(
    filterSpells(SPELL_CATALOG, { classId: 'warlock', level: '0' }).every(
      (s) => s.level === 0 && s.classes.includes('warlock'),
    ),
  );
  assert.ok(
    filterSpells(SPELL_CATALOG, { ritual: true, school: 'Adivinhação' }).every(
      (s) => s.ritual && s.school === 'Adivinhação',
    ),
  );
  assert.ok(
    filterSpells(SPELL_CATALOG, { concentration: true, maxLevel: 2 }).every(
      (s) => s.concentration && s.level <= 2,
    ),
  );
});
test('all thirteen 2014 classes and 112 sourced races/variants remain available with correct walking speeds', () => {
  assert.equal(Object.keys(CLASSES).length, 13);
  assert.equal(RACE_CATALOG.length, 112);
  assert.equal(new Set(RACE_CATALOG.map((r) => r.id)).size, 112);
  assert.ok(RACE_CATALOG.every((r) => r.source && r.traits.length));
  assert.equal(getRace('Elfo da floresta')?.speed, 10.5);
  assert.equal(getRace('Centauro')?.speed, 12);
  const s = { ...defaultSheet(), race: 'Anão da montanha' };
  assert.equal(calculate(s).speed, 7.5);
  s.speed_override = 12;
  assert.equal(calculate(s).speed, 12);
  assert.equal(CLASSES.artificer.hitDie, 8);
  assert.equal(CLASSES.artificer.spellAbility, 'int');
});
test('half casters, Artificer and third casters unlock the correct spell-circle thresholds', () => {
  assert.deepEqual(spellSlots('paladin', 1), []);
  assert.deepEqual(spellSlots('paladin', 2), [2]);
  assert.deepEqual(spellSlots('paladin', 3), [3]);
  assert.deepEqual(spellSlots('ranger', 4), [3]);
  assert.deepEqual(spellSlots('ranger', 5), [4, 2]);
  assert.deepEqual(spellSlots('paladin', 19), [4, 3, 3, 3, 2]);
  assert.deepEqual(spellSlots('artificer', 1), [2]);
  assert.deepEqual(spellSlots('artificer', 20), [4, 3, 3, 3, 2]);
  assert.deepEqual(spellSlots('fighter', 2, 'eldritch-knight'), []);
  assert.deepEqual(spellSlots('fighter', 6, 'eldritch-knight'), [3]);
  assert.deepEqual(spellSlots('fighter', 7, 'eldritch-knight'), [4, 2]);
  assert.deepEqual(spellSlots('rogue', 13, 'arcane-trickster'), [4, 3, 2]);
  assert.deepEqual(spellSlots('rogue', 19, 'arcane-trickster'), [4, 3, 3, 1]);
  assert.deepEqual(spellSlots('wizard', 21), []);
  assert.equal(
    calculate({
      ...defaultSheet(),
      class_id: 'rogue',
      subclass_id: 'arcane-trickster',
      level: 3,
      abilities: { ...defaultSheet().abilities, int: 18 },
    }).spellDc,
    14,
  );
});
test('known, prepared and cantrip limits follow class level and the casting ability', () => {
  const s = {
    ...defaultSheet(),
    class_id: 'wizard',
    level: 5,
    abilities: { ...defaultSheet().abilities, int: 18 },
  };
  assert.equal(castingProfile(s).prepared, 9);
  assert.equal(castingProfile(s).cantrips, 4);
  assert.equal(castingProfile({ ...s, class_id: 'artificer', level: 1 }).prepared, 4);
  assert.equal(castingProfile({ ...s, class_id: 'sorcerer', level: 10 }).known, 11);
  assert.equal(castingProfile({ ...s, class_id: 'ranger', level: 1 }).known, 0);
  assert.equal(castingProfile({ ...s, class_id: 'bard', level: 10 }).known, 14);
  assert.equal(
    castingProfile({ ...s, class_id: 'rogue', subclass_id: 'arcane-trickster', level: 3 }).cantrips,
    3,
  );
});
test('casting consumes the selected higher slot, cantrips and eligible rituals cost no slots, and exhausted pools reject casting', () => {
  const s = { ...defaultSheet(), class_id: 'wizard', level: 5 };
  const fireball = { ...spellFromCatalog(entry('Fireball'), 'fb', 'wizard'), prepared: true };
  let next = castSpell(s, fireball, 'slot', 3);
  assert.equal(next.slots_used['3'], 1);
  assert.equal(s.slots_used['3'], undefined);
  next = castSpell(next, fireball, 'slot', 3);
  assert.throws(() => castSpell(next, fireball, 'slot', 3), /disponíveis/);
  const light = spellFromCatalog(entry('Light'), 'light');
  assert.deepEqual(castSpell(next, light, 'cantrip', 0).slots_used, next.slots_used);
  const ritual = spellFromCatalog(entry('Detect Magic'), 'detect');
  assert.deepEqual(castSpell(next, ritual, 'ritual', 1).slots_used, next.slots_used);
  assert.throws(
    () => castSpell({ ...s, class_id: 'sorcerer' }, { ...ritual, prepared: true }, 'ritual', 1),
    /disponíveis/,
  );
  const cure = { ...spellFromCatalog(entry('Cure Wounds'), 'cure'), prepared: true };
  assert.equal(castSpell({ ...s, class_id: 'cleric' }, cure, 'slot', 2).slots_used['2'], 1);
  assert.throws(() => castSpell(s, { ...fireball, prepared: false }, 'slot', 3), /preparada/);
});
test('pact slots and Mystic Arcana are independent pools and recover with the proper rest', () => {
  const s = { ...defaultSheet(), class_id: 'warlock', level: 11 };
  const hex = { ...spellFromCatalog(entry('Hex'), 'hex'), prepared: true };
  const arc = spellFromCatalog(entry('True Seeing'), 'arc', 'warlock', true);
  let next = castSpell(s, hex, 'pact', 5);
  next = castSpell(next, arc, 'arcanum', 6);
  assert.equal(next.pact_slots_used, 1);
  assert.equal(next.arcanum_used?.['6'], 1);
  assert.deepEqual(next.slots_used, {});
  const short = recoverSpellResources(next, 'short');
  assert.equal(short.pact_slots_used, 0);
  assert.equal(short.arcanum_used?.['6'], 1);
  const long = recoverSpellResources(next, 'long');
  assert.equal(long.pact_slots_used, 0);
  assert.deepEqual(long.arcanum_used, {});
  assert.throws(() => castSpell({ ...s, level: 10 }, arc, 'arcanum', 6), /disponíveis/);
  assert.deepEqual(castingProfile({ ...s, level: 17 }).arcanumLevels, [6, 7, 8, 9]);
  assert.deepEqual(spellSlots('warlock', 17), [0, 0, 0, 0, 4]);
  const normal = {
    ...defaultSheet(),
    class_id: 'wizard',
    level: 3,
    slots_used: { '1': 2, '2': 1 },
  };
  assert.deepEqual(recoverSpellResources(normal, 'short').slots_used, normal.slots_used);
});
test('legacy Warlock hydration preserves consumed slots while migrating to the pact counter', () => {
  const raw = { ...defaultSheet(), class_id: 'warlock', level: 5, slots_used: { '3': 1 } };
  delete raw.pact_slots_used;
  assert.equal(normalizeSpellResources(raw).pact_slots_used, 1);
  const sheet = dnd5e.hydrateSheet({
    data: raw,
    attributes: [],
    skills: [],
    inventory: [],
    spells: [],
  });
  assert.equal(sheet.pact_slots_used, 1);
  assert.deepEqual(sheet.slots_used, {});
});
test('invalid resources, catalog mismatches and duplicate Arcana are rejected before saving', () => {
  const c = createDemoWorkspace().characters[0];
  c.sheet = { ...defaultSheet(), class_id: 'wizard', level: 5, slots_used: { '3': 3 } };
  assert.ok(validate(c).some((e) => e.includes('espaços')));
  c.sheet.slots_used = {};
  c.sheet.spells = [{ ...spellFromCatalog(entry('Fireball'), 'bad'), level: 1 }];
  assert.ok(validate(c).some((e) => e.includes('referências')));
  c.sheet = {
    ...defaultSheet(),
    class_id: 'warlock',
    level: 11,
    spells: [
      spellFromCatalog(entry('True Seeing'), 'a', undefined, true),
      spellFromCatalog(entry('Conjure Fey'), 'b', undefined, true),
    ],
  };
  assert.ok(validate(c).some((e) => e.includes('apenas um')));
});

test('reducing Warlock level retains future spells while deactivating unavailable Arcana', () => {
  const arc = spellFromCatalog(entry('True Seeing'), 'arc', 'warlock', true);
  const next = normalizeSpellResources({
    ...defaultSheet(),
    class_id: 'warlock',
    level: 10,
    spells: [arc],
    arcanum_used: { '6': 1 },
  });
  assert.equal(next.spells[0].name, arc.name);
  assert.equal(next.spells[0].casting_mode, 'class');
  assert.deepEqual(next.arcanum_used, {});
  assert.throws(() => castSpell(next, next.spells[0], 'arcanum', 6), /disponíveis/);
});

test('racial armor, dwarf toughness and class movement affect derived combat values without stacking armor formulas', () => {
  const s = { ...defaultSheet(), race: 'Tortle' };
  assert.equal(calculate(s).armorClass, 17);
  s.race = 'Forjado bélico';
  assert.equal(calculate(s).armorClass, 11);
  s.race = 'Anão da colina';
  s.level = 3;
  assert.equal(calculate(s).hpMax, 25);
  s.hp_max_override = 30;
  assert.equal(calculate(s).hpMax, 30);
  const monk = { ...defaultSheet(), class_id: 'monk', level: 10 };
  assert.equal(calculate(monk).speed, 15);
  const armor = {
    id: 'armor',
    name: 'Couro',
    category: 'armor' as const,
    quantity: 1,
    weight: 1,
    equipped: true,
    armor_base: 11,
    armor_type: 'light' as const,
    notes: '',
  };
  monk.inventory = [armor];
  assert.equal(calculate(monk).speed, 9);
  const barb = { ...defaultSheet(), class_id: 'barbarian', level: 5 };
  assert.equal(calculate(barb).speed, 12);
  barb.inventory = [{ ...armor, armor_type: 'heavy', armor_base: 18 }];
  assert.equal(calculate(barb).speed, 9);
  const natural = {
    ...defaultSheet(),
    race: 'Homem-lagarto',
    class_id: 'monk',
    abilities: { ...defaultSheet().abilities, dex: 16, wis: 18 },
  };
  assert.equal(calculate(natural).armorClass, 17);
});
