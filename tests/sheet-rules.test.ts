import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSheet, calculate } from '../src/systems/dnd5e';
import {
  classLevels,
  withClassLevels,
  effectiveSkills,
  effectiveSaves,
  progressionErrors,
} from '../src/systems/dnd5e/progression';
import {
  castingProfile,
  spellPools,
  spellSelectionErrors,
  spellPreparationUsage,
} from '../src/systems/dnd5e/spellcasting';
import { SPELL_CATALOG, spellFromCatalog } from '../src/systems/dnd5e/spell-catalog';
import { characterSpellEffect } from '../src/features/vtt/effects';
import { creationErrors } from '../src/systems/dnd5e/creation';
import type { ClassLevel } from '../src/systems/dnd5e/types';
const make = (levels: ClassLevel[]) =>
  withClassLevels(
    { ...defaultSheet(), abilities: { str: 16, dex: 14, con: 14, int: 16, wis: 16, cha: 16 } },
    levels,
  );
const spell = (name: string, origin = 'wizard') => ({
  ...spellFromCatalog(
    SPELL_CATALOG.find((entry) => entry.english_name === name)!,
    name,
    origin,
  ),
  prepared: true,
});

test('saving throws follow the starting class; multiclass never grants the second class saves', () => {
  const wizard = make([{ class_id: 'wizard', level: 5 }]);
  assert.deepEqual(effectiveSaves(wizard), ['int', 'wis']);
  assert.equal(calculate(wizard).saves.str, 3);
  const multi = withClassLevels(wizard, [
    ...classLevels(wizard),
    { class_id: 'fighter', level: 1 },
  ]);
  assert.deepEqual(effectiveSaves(multi), ['int', 'wis']);
  assert.equal(calculate(multi).saves.con, 2);
  assert.equal(calculate(make([{ class_id: 'monk', level: 14 }])).saves.cha, 8);
});
test('proficiency is applied once, expertise twice, and Jack of All Trades only to untrained checks', () => {
  const s = make([{ class_id: 'bard', level: 3, choices: { 'expertise-3': ['perception'] } }]);
  s.creation = {
    method: 'manual',
    base: s.abilities,
    bonuses: {},
    class_skills: ['perception'],
    background_skills: ['perception'],
  };
  assert.equal(effectiveSkills(s).perception, 2);
  assert.equal(calculate(s).skills.perception, 7);
  assert.equal(calculate(s).passivePerception, 17);
  assert.equal(calculate(s).skills.athletics, 4);
  assert.equal(calculate(s).saves.str, 3);
});
test('expertise can use a proficiency from another class, but cannot grant its own prerequisite', () => {
  const s = make([
    { class_id: 'wizard', level: 3 },
    { class_id: 'rogue', level: 1, choices: { 'expertise-1': ['arcana'] } },
  ]);
  assert.ok(progressionErrors(s).some((message) => message.includes('prévia')));
  s.creation = { method: 'manual', base: s.abilities, bonuses: {}, class_skills: ['arcana'] };
  assert.ok(!progressionErrors(s).some((message) => message.includes('prévia')));
});
test('PHB racial proficiencies and half-elf choices are included without inventing expertise', () => {
  const elf = { ...defaultSheet(), race: 'Alto elfo' };
  assert.equal(effectiveSkills(elf).perception, 1);
  const orc = { ...defaultSheet(), race: 'Meio-orc' };
  assert.equal(effectiveSkills(orc).intimidation, 1);
  const s = {
    ...defaultSheet(),
    race: 'Meio-elfo',
    creation: {
      method: 'manual' as const,
      base: defaultSheet().abilities,
      bonuses: {},
      race_skills: ['arcana', 'perception'],
    },
  };
  assert.equal(effectiveSkills(s).arcana, 1);
  assert.deepEqual(creationErrors(s), []);
  assert.ok(
    creationErrors({
      ...s,
      creation: { ...s.creation, race_skills: ['arcana', 'perception', 'history'] },
    }).length,
  );
});
test('class preparation limits include unverified extra/always-prepared flags but exclude valid domain grants', () => {
  const cleric = make([{ class_id: 'cleric', level: 1, subclass_id: 'life' }]);
  cleric.spells = SPELL_CATALOG.filter(
    (entry) => entry.classes.includes('cleric') && entry.level === 1,
  )
    .slice(0, 5)
    .map((entry) => ({
      ...spellFromCatalog(entry, entry.id, 'cleric'),
      prepared: true,
      always_prepared: true,
      casting_mode: 'bonus',
    }));
  assert.equal(spellPreparationUsage(cleric, 'cleric'), 5);
  assert.ok(spellSelectionErrors(cleric).some((message) => message.includes('prepare até 4')));
  const cure = {
    ...spell('Cure Wounds', 'cleric'),
    always_prepared: true,
    granted_path: 'life',
    casting_mode: 'bonus' as const,
  };
  cleric.spells = [cure];
  assert.equal(spellPreparationUsage(cleric, 'cleric'), 0);
  assert.deepEqual(spellSelectionErrors(cleric), []);
});
test('wizard spellbooks may contain copied spells, while the prepared list stays limited', () => {
  const s = make([{ class_id: 'wizard', level: 1 }]);
  s.spells = SPELL_CATALOG.filter((entry) => entry.classes.includes('wizard') && entry.level === 1)
    .slice(0, 12)
    .map((entry) => ({ ...spellFromCatalog(entry, entry.id, 'wizard'), prepared: false }));
  assert.deepEqual(spellSelectionErrors(s), []);
  s.spells.forEach((sp) => (sp.prepared = true));
  assert.ok(spellSelectionErrors(s).some((message) => message.includes('prepare até 4')));
});
test('Eldritch Knight and Arcane Trickster retain their school allowance and mandatory Mage Hand', () => {
  const s = make([{ class_id: 'fighter', level: 3, subclass_id: 'eldritch-knight' }]);
  s.spells = [spell('Charm Person', 'fighter'), spell('Disguise Self', 'fighter')];
  assert.ok(spellSelectionErrors(s).some((message) => message.includes('fora de')));
  const upgraded = withClassLevels(s, [
    { class_id: 'fighter', level: 8, subclass_id: 'eldritch-knight' },
  ]);
  assert.ok(!spellSelectionErrors(upgraded).some((message) => message.includes('fora de')));
  const rogue = make([{ class_id: 'rogue', level: 3, subclass_id: 'arcane-trickster' }]);
  rogue.spells = [
    spell('Fire Bolt', 'rogue'),
    spell('Ray of Frost', 'rogue'),
    spell('Minor Illusion', 'rogue'),
  ];
  assert.ok(spellSelectionErrors(rogue).some((message) => message.includes('Mãos Mágicas')));
  rogue.spells[0] = spell('Mage Hand', 'rogue');
  assert.deepEqual(spellSelectionErrors(rogue), []);
});
test('spell limits use class level while cantrip damage, proficiency and Eldritch Blast use total level', () => {
  const s = make([
    { class_id: 'warlock', level: 2, choices: { invocations: ['agonizing-blast'] } },
    { class_id: 'sorcerer', level: 9 },
  ]);
  const p = castingProfile(s, 'warlock');
  assert.equal(p.known, 3);
  assert.equal(p.spellLimit, 1);
  const blast = characterSpellEffect(s, spell('Eldritch Blast', 'warlock'), 0);
  assert.equal(blast.attackCount, 3);
  assert.equal(blast.dice, '1d10+3');
  assert.equal(blast.maxTargets, 3);
  const ray = characterSpellEffect(
    make([{ class_id: 'wizard', level: 7 }]),
    spell('Scorching Ray'),
    4,
  );
  assert.equal(ray.attackCount, 5);
  assert.equal(ray.dice, '2d6');
  assert.equal(ray.attackRoll, true);
  const missile = characterSpellEffect(
    make([{ class_id: 'wizard', level: 3 }]),
    spell('Magic Missile'),
    1,
  );
  assert.ok(!missile.attackRoll);
});
test('slots, pact slots and high-level known spells stay separate in multiclass progression', () => {
  const s = make([
    { class_id: 'wizard', level: 3 },
    { class_id: 'cleric', level: 2 },
    { class_id: 'warlock', level: 2 },
  ]);
  assert.deepEqual(spellPools(s).slots, [4, 3, 2]);
  assert.equal(spellPools(s).pactLevel, 1);
  assert.equal(spellPools(s).pactSlots, 2);
  assert.equal(castingProfile(s, 'wizard').spellLimit, 2);
  assert.equal(castingProfile(s, 'cleric').spellLimit, 1);
  assert.equal(castingProfile(make([{ class_id: 'paladin', level: 5 }])).prepared, 5);
});

test('Spiritual Weapon scales every two slot levels and area spells preserve their trigger timing', () => {
  const s = make([{ class_id: 'cleric', level: 7 }]);
  const weapon = spell('Spiritual Weapon', 'cleric');
  assert.equal(characterSpellEffect(s, weapon, 3).dice, '1d8+3');
  assert.equal(characterSpellEffect(s, weapon, 4).dice, '1d8+1d8+3');
  const moon = characterSpellEffect(
    make([{ class_id: 'druid', level: 5 }]),
    spell('Moonbeam', 'druid'),
    2,
  );
  assert.equal(moon.shape, 'sphere');
  assert.equal(moon.size, 1.5);
  assert.equal(moon.timing, 'trigger');
  assert.equal(moon.save, 'con');
});

test('guided results total the applied damage across beams instead of repeating the final roll', async () => {
  const { actionOutcome } = await import('../src/features/vtt/action-outcome');
  const q = {
    status: 'success',
    definition: { kind: 'damage', damageType: 'fogo' },
    resolution: {
      guided: true,
      affected: [
        { token_id: 'one', kind: 'damage', amount: 12 },
        { token_id: 'two', kind: 'damage', amount: 7 },
      ],
      dice_roll: { total: 4 },
    },
  } as unknown as import('../src/features/vtt/types').BattleActionRequest;
  assert.equal(actionOutcome(q), 'Você causou 19 de dano no total (fogo).');
  q.status = 'failure';
  q.resolution.message = 'O ataque não acertou. A ação foi utilizada.';
  assert.equal(actionOutcome(q), q.resolution.message);
});
test('temporary HP summaries show the amount actually granted and interrupted sources request manual review', async () => {
  const { actionOutcome } = await import('../src/features/vtt/action-outcome');
  const q = {
    status: 'success',
    definition: { kind: 'temporary' },
    resolution: {
      guided: true,
      affected: [{ kind: 'temporary', amount: 0 }],
      dice_roll: { total: 8 },
    },
  } as unknown as import('../src/features/vtt/types').BattleActionRequest;
  assert.equal(actionOutcome(q), 'Você concedeu 0 PV temporários.');
  q.status = 'cancelled';
  q.resolution.manual_resource_review = true;
  q.resolution.message = 'Confira os gastos desta tentativa.';
  assert.equal(actionOutcome(q), q.resolution.message);
});
