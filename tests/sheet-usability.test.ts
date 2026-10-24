import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSheet } from '../src/systems/dnd5e';
import { withClassLevels, classLevels } from '../src/systems/dnd5e/progression';
import { allocateClassLevel, addClassLevel } from '../src/systems/dnd5e/class-allocation';
import { newCreation, withCreation, selectBackground } from '../src/systems/dnd5e/creation';
import { characterRest, inspirationCount } from '../src/systems/dnd5e/character-rest';
const abilities = { str: 16, dex: 16, con: 16, int: 16, wis: 16, cha: 16 };
test('fixed-level allocation can take levels from multiple donors without violating the total', () => {
  const next = allocateClassLevel(
    [
      { class_id: 'fighter', level: 4 },
      { class_id: 'wizard', level: 3 },
      { class_id: 'rogue', level: 3 },
    ],
    0,
    8,
    10,
  );
  assert.deepEqual(
    next.map((c) => c.level),
    [8, 1, 1],
  );
  assert.throws(() => allocateClassLevel(next, 0, 9, 10), /Não há níveis/);
  assert.equal(
    next.reduce((n, c) => n + c.level, 0),
    10,
  );
});
test('multiclass addition keeps initial proficiencies and spent dice, and respects final prerequisites', () => {
  const s = withClassLevels({ ...defaultSheet(), abilities, hit_dice_used: 2 }, [
    { class_id: 'fighter', level: 3 },
  ]);
  const next = addClassLevel(s, 'wizard', 3);
  assert.deepEqual(
    classLevels(next).map((c) => [c.class_id, c.level]),
    [
      ['fighter', 2],
      ['wizard', 1],
    ],
  );
  assert.deepEqual(next.saves, s.saves);
  assert.equal(next.hit_dice_by_class?.fighter, 2);
  assert.equal(next.hit_dice_used, 2);
  assert.deepEqual(next.inventory, s.inventory);
  assert.throws(
    () => addClassLevel({ ...s, abilities: { ...abilities, int: 12 } }, 'wizard'),
    /requisitos/,
  );
  const improved = withClassLevels(
    { ...defaultSheet(), abilities: { ...abilities, str: 12, dex: 12 } },
    [{ class_id: 'fighter', level: 4, improvements: { '4': { str: 2 } } }],
  );
  assert.equal(improved.abilities.str, 14);
  assert.throws(() => addClassLevel(improved, 'wizard', 4), /atributos finais/);
});
test('background language choices synchronize the actual sheet without duplicates or deleting other languages', () => {
  let s = {
    ...defaultSheet(),
    languages: 'Comum, Élfico',
    creation: { ...newCreation(), method: 'manual' as const },
  };
  s = withCreation(s, { ...s.creation, background_languages: ['Anão'] }) as typeof s;
  assert.equal(s.languages, 'Comum, Élfico, Anão');
  s = withCreation(s, { ...s.creation, background_languages: ['Anão', 'Dracônico'] }) as typeof s;
  assert.equal(s.languages, 'Comum, Élfico, Anão, Dracônico');
  s = withCreation(s, { ...s.creation, background_languages: ['Dracônico'] }) as typeof s;
  assert.equal(s.languages, 'Comum, Élfico, Dracônico');
  s = selectBackground(s, 'acolyte') as typeof s;
  assert.equal(s.languages, 'Comum, Élfico');
});
test('short rest spends chosen hit dice and long rest restores half while retaining inspiration', () => {
  const s = withClassLevels(
    {
      ...defaultSheet(),
      abilities,
      hp_current: 10,
      hp_max_override: 100,
      hit_dice_used: 3,
      hit_dice_by_class: { fighter: 3 },
      inspiration_count: 4,
    },
    [{ class_id: 'fighter', level: 5 }],
  );
  const short = characterRest(s, 'short', { fighter: 2 }, () => 6);
  assert.equal(short.sheet.hp_current, 28);
  assert.equal(short.sheet.hit_dice_used, 5);
  assert.equal(short.result.hit_dice_spent, 2);
  assert.equal(short.result.healing_rolls[0].modifier, 3);
  const long = characterRest(short.sheet, 'long');
  assert.equal(long.sheet.hp_current, 100);
  assert.equal(long.sheet.hit_dice_used, 3);
  assert.equal(long.result.hit_dice_recovered, 2);
  assert.equal(inspirationCount(long.sheet), 4);
  assert.throws(() => characterRest(s, 'long', { fighter: 3 }), /até 2/);
  assert.throws(() => characterRest({ ...s, hp_current: 0 }, 'long'), /consciente/);
});
