import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSheet, calculate, validate } from '../src/systems/dnd5e';
import {
  classLevels,
  withClassLevels,
  withCharacterLevel,
  featureResources,
  recoverFeatures,
  extraAttacks,
  progressionErrors,
  effectiveSkills,
} from '../src/systems/dnd5e/progression';
import {
  spellPools,
  castingProfile,
  castSpell,
  availableCastResources,
  spellProfile,
  recoverSpellResources,
  normalizeSpellResources,
  spellIsInactive,
} from '../src/systems/dnd5e/spellcasting';
import {
  newCreation,
  withCreation,
  selectBackground,
  applyStartingEquipment,
  rollAbilities,
  creationErrors,
  pointCost,
} from '../src/systems/dnd5e/creation';
import {
  CLASS_FEATURES,
  CLASS_PATHS,
  featureChoices,
} from '../src/systems/dnd5e/progression-catalog';
import { spellFromCatalog, SPELL_CATALOG } from '../src/systems/dnd5e/spell-catalog';
import type { ClassLevel, Character } from '../src/types';
import { characterSpellEffect } from '../src/features/vtt/effects';
const sheet = (levels: ClassLevel[]) =>
  withClassLevels(
    { ...defaultSheet(), abilities: { str: 13, dex: 13, con: 14, int: 16, wis: 16, cha: 18 } },
    levels,
  );
test('multiclass total proficiency, hit points, hit dice and movement use their own levels', () => {
  const s = sheet([
      { class_id: 'fighter', level: 5 },
      { class_id: 'wizard', level: 3 },
    ]),
    d = calculate(s);
  assert.equal(s.level, 8);
  assert.equal(d.proficiency, 3);
  assert.equal(d.hpMax, 12 + 4 * 8 + 3 * 6);
  assert.equal(d.hitDicePools.fighter.total, 5);
  assert.equal(d.hitDicePools.wizard.die, 6);
  assert.equal(
    calculate(
      sheet([
        { class_id: 'fighter', level: 1 },
        { class_id: 'monk', level: 6 },
      ]),
    ).speed,
    13.5,
  );
  assert.equal(
    calculate(
      sheet([
        { class_id: 'fighter', level: 18 },
        { class_id: 'monk', level: 2 },
      ]),
    ).speed,
    12,
  );
  assert.equal(
    extraAttacks(
      sheet([
        { class_id: 'fighter', level: 5 },
        { class_id: 'paladin', level: 5 },
      ]),
    ),
    2,
  );
  assert.equal(
    extraAttacks(
      sheet([
        { class_id: 'fighter', level: 11 },
        { class_id: 'barbarian', level: 5 },
      ]),
    ),
    3,
  );
});
test('shared spell slots count full, half and third casters while learning stays per class', () => {
  const s = sheet([
    { class_id: 'ranger', level: 4 },
    { class_id: 'wizard', level: 3 },
  ]);
  assert.deepEqual(spellPools(s).slots, [4, 3, 2]);
  assert.equal(castingProfile(s, 'ranger').spellLimit, 1);
  assert.equal(castingProfile(s, 'wizard').spellLimit, 2);
  assert.deepEqual(
    spellPools(
      sheet([
        { class_id: 'paladin', level: 3 },
        { class_id: 'fighter', level: 2 },
      ]),
    ).slots,
    [3],
  );
  assert.deepEqual(
    spellPools(
      sheet([
        { class_id: 'paladin', level: 3 },
        { class_id: 'wizard', level: 1 },
      ]),
    ).slots,
    [3],
  );
  assert.deepEqual(
    spellPools(
      sheet([
        { class_id: 'fighter', level: 4, subclass_id: 'eldritch-knight' },
        { class_id: 'wizard', level: 2 },
      ]),
    ).slots,
    [4, 2],
  );
  assert.deepEqual(
    spellPools(
      sheet([
        { class_id: 'artificer', level: 3 },
        { class_id: 'wizard', level: 1 },
      ]),
    ).slots,
    [4, 2],
  );
});
test('pact and common slots can cast other class spells and recover independently', () => {
  const s = sheet([
    { class_id: 'cleric', level: 3 },
    { class_id: 'warlock', level: 3, subclass_id: 'fiend' },
  ]);
  const cure = spellFromCatalog(
    SPELL_CATALOG.find((e) => e.english_name === 'Cure Wounds')!,
    'cure',
    'cleric',
  );
  cure.prepared = true;
  assert.equal(spellProfile(s, cure).ability, 'wis');
  assert.equal(spellPools(s).pactSlots, 2);
  assert.ok(availableCastResources(s, cure).some((r) => r.kind === 'pact' && r.level === 2));
  const cast = castSpell(castSpell(s, cure, 'slot', 1), cure, 'pact', 2);
  assert.equal(cast.slots_used['1'], 1);
  assert.equal(cast.pact_slots_used, 1);
  const short = recoverSpellResources(cast, 'short');
  assert.equal(short.slots_used['1'], 1);
  assert.equal(short.pact_slots_used, 0);
  const fire = spellFromCatalog(
    SPELL_CATALOG.find((e) => e.english_name === 'Fireball')!,
    'fire',
    'wizard',
  );
  assert.deepEqual(availableCastResources(s, fire), []);
});
test('multiclass prerequisites, duplicate classes and early subclass choices are rejected', () => {
  const low = {
    ...sheet([
      { class_id: 'fighter', level: 1 },
      { class_id: 'wizard', level: 1 },
    ]),
    abilities: { ...defaultSheet().abilities },
  };
  assert.ok(progressionErrors(low).some((e) => e.includes('mínimos')));
  assert.ok(
    progressionErrors(
      sheet([
        { class_id: 'fighter', level: 1 },
        { class_id: 'fighter', level: 1 },
      ]),
    ).some((e) => e.includes('uma vez')),
  );
  assert.ok(
    progressionErrors(sheet([{ class_id: 'fighter', level: 2, subclass_id: 'champion' }])).some(
      (e) => e.includes('caminho'),
    ),
  );
  assert.ok(
    !progressionErrors(sheet([{ class_id: 'fighter', level: 3, subclass_id: 'champion' }])).length,
  );
});
test('ASIs belong to class level, apply once and disappear correctly when the master reduces level', () => {
  let s = withCreation(
    sheet([
      { class_id: 'fighter', level: 4 },
      { class_id: 'wizard', level: 3 },
    ]),
    newCreation(),
  );
  s = withClassLevels(s, [
    { class_id: 'fighter', level: 4, improvements: { '4': { str: 2 } } },
    { class_id: 'wizard', level: 3 },
  ]);
  assert.equal(s.abilities.str, 17);
  assert.equal(withClassLevels(s, classLevels(s)).abilities.str, 17);
  const down = withCharacterLevel(s, 6);
  assert.equal(down.level, 6);
  assert.equal(down.abilities.str, 15);
  assert.ok(
    progressionErrors(sheet([{ class_id: 'wizard', level: 3, improvements: { '4': { int: 2 } } }]))
      .length,
  );
});
test('background and initial package grant benefits exactly once, with no secondary class equipment', () => {
  let s = withCreation(defaultSheet(), newCreation());
  s = selectBackground(s, 'acolyte');
  s.creation!.background_languages = ['Élfico', 'Dracônico'];
  s.creation!.class_skills = ['athletics', 'perception'];
  assert.equal(effectiveSkills(s).religion, 1);
  let n = 0;
  s = applyStartingEquipment(s, 0, () => String(++n));
  assert.equal(s.currency.gp, 15);
  assert.ok(s.inventory.some((i) => i.name === 'Símbolo sagrado'));
  assert.ok(s.inventory.some((i) => i.name === 'Espada longa'));
  assert.throws(() => applyStartingEquipment(s, 0, () => String(++n)), /já foi aplicado/);
  const count = s.inventory.length;
  s = withClassLevels(s, [
    { class_id: 'fighter', level: 1 },
    { class_id: 'wizard', level: 1 },
  ]);
  assert.equal(s.inventory.length, count);
  assert.equal(s.currency.gp, 15);
});
test('standard array, 27 point buy and 4d6 provenance reject malformed builds', () => {
  const s = withCreation(defaultSheet(), newCreation());
  assert.deepEqual(creationErrors(s), []);
  const invalid = {
    ...s,
    creation: { ...s.creation!, base: { str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15 } },
  };
  assert.ok(creationErrors(invalid).length);
  const bought = withCreation(s, {
    ...s.creation!,
    method: 'point-buy',
    base: { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 },
  });
  assert.equal(pointCost(bought.creation!.base), 27);
  assert.deepEqual(creationErrors(bought), []);
  let i = 0;
  const rolled = rollAbilities(() => [1, 2, 3, 6][i++ % 4]);
  assert.deepEqual(rolled.scores, [11, 11, 11, 11, 11, 11]);
  assert.deepEqual(
    creationErrors(
      withCreation(s, {
        ...s.creation!,
        method: 'rolled',
        rolls: rolled.rolls,
        base: { str: 11, dex: 11, con: 11, int: 11, wis: 11, cha: 11 },
      }),
    ),
    [],
  );
});
test('resource recovery, channel divinity and class choices do not stack incorrectly', () => {
  const s = sheet([
    { class_id: 'cleric', level: 6 },
    { class_id: 'paladin', level: 3 },
  ]);
  assert.equal(featureResources(s).filter((r) => r.id === 'shared:channel-divinity').length, 1);
  assert.equal(featureResources(s).find((r) => r.id === 'shared:channel-divinity')!.max, 2);
  const used = { ...s, feature_uses: { 'shared:channel-divinity': 2, 'paladin:lay-hands': 5 } };
  const short = recoverFeatures(used, 'short');
  assert.equal(short.feature_uses!['shared:channel-divinity'], 0);
  assert.equal(short.feature_uses!['paladin:lay-hands'], 5);
  assert.ok(featureChoices('sorcerer', 3).find((c) => c.id === 'metamagic')?.count === 2);
  assert.equal(featureChoices('warlock', 12).find((c) => c.id === 'invocations')?.count, 6);
  assert.ok(
    progressionErrors(
      sheet([{ class_id: 'warlock', level: 3, choices: { invocations: ['thirsting-blade'] } }]),
    ).length,
  );
});
test('SRD class paths and legacy sheets stay coherent', () => {
  for (const id of [
    'barbarian',
    'bard',
    'cleric',
    'druid',
    'fighter',
    'monk',
    'paladin',
    'ranger',
    'rogue',
    'sorcerer',
    'warlock',
    'wizard',
  ]) {
    assert.ok(CLASS_FEATURES[id].length >= 8);
    assert.ok(CLASS_PATHS.some((p) => p.class_id === id));
  }
  assert.deepEqual(validate({ name: 'Legado', sheet: defaultSheet() } as Character), []);
});
test('class path bonuses use the correct origin and slot level in combat formulas', () => {
  const cure = spellFromCatalog(
    SPELL_CATALOG.find((e) => e.english_name === 'Cure Wounds')!,
    'cure',
    'cleric',
  );
  const life = sheet([{ class_id: 'cleric', level: 3, subclass_id: 'life' }]);
  assert.equal(characterSpellEffect(life, cure, 1).dice, '1d8+3+3');
  assert.equal(characterSpellEffect(life, cure, 2).dice, '1d8+1d8+3+4');
  const fire = spellFromCatalog(
    SPELL_CATALOG.find((e) => e.english_name === 'Fireball')!,
    'fire',
    'wizard',
  );
  assert.equal(
    characterSpellEffect(
      sheet([{ class_id: 'wizard', level: 10, subclass_id: 'evocation' }]),
      fire,
      3,
    ).dice,
    '8d6+3',
  );
  fire.class_id = 'sorcerer';
  const dragon = sheet([
    {
      class_id: 'sorcerer',
      level: 6,
      subclass_id: 'draconic',
      choices: { dragon: ['Vermelho · fogo'] },
    },
  ]);
  assert.equal(characterSpellEffect(dragon, fire, 3).dice, '8d6+4');
  dragon.class_levels![0].choices!.dragon = ['Branco · frio'];
  assert.equal(characterSpellEffect(dragon, fire, 3).dice, '8d6');
});
test('lost class, circle and path spells remain recorded but cannot spend shared slots', () => {
  const fire = spellFromCatalog(
    SPELL_CATALOG.find((e) => e.english_name === 'Fireball')!,
    'fire',
    'wizard',
  );
  const s = sheet([
    { class_id: 'wizard', level: 3 },
    { class_id: 'cleric', level: 4 },
  ]);
  assert.equal(spellIsInactive(s, fire), true);
  assert.deepEqual(availableCastResources(s, fire), []);
  assert.equal(
    normalizeSpellResources({ ...s, spells: [fire] }).spells[0].catalog_id,
    fire.catalog_id,
  );
  const grant = {
    ...spellFromCatalog(
      SPELL_CATALOG.find((e) => e.english_name === 'Cure Wounds')!,
      'cure',
      'cleric',
    ),
    casting_mode: 'bonus' as const,
    granted_path: 'life',
    always_prepared: true,
  };
  const life = sheet([{ class_id: 'cleric', level: 3, subclass_id: 'life' }]);
  assert.equal(spellIsInactive(life, grant), false);
  assert.equal(
    spellIsInactive({ ...life, class_levels: [{ class_id: 'cleric', level: 3 }] }, grant),
    true,
  );
  assert.equal(spellIsInactive(sheet([{ class_id: 'fighter', level: 7 }]), fire), true);
});
