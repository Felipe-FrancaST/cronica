import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSheet } from '../src/systems/dnd5e';
import { BACKGROUNDS, backgroundTools, ARTISAN_TOOLS } from '../src/systems/dnd5e/backgrounds';
import {
  CLASS_PATHS,
  SUBCLASS_LEVELS,
  featureChoices,
} from '../src/systems/dnd5e/progression-catalog';
import { subclassTerm } from '../src/systems/dnd5e/class-vocabulary';
import { selectBackground, creationErrors } from '../src/systems/dnd5e/creation';
import {
  withClassLevels,
  extraAttacks,
  effectiveSkills,
  progressionErrors,
} from '../src/systems/dnd5e/progression';
import { pathSpells, expandedSpells } from '../src/systems/dnd5e/path-spells';
import { SPELL_CATALOG } from '../src/systems/dnd5e/spell-catalog';
import {
  CLASS_STARTING_EQUIPMENT,
  applyBookStartingEquipment,
  resolveStartingEquipment,
  backgroundStartingEquipment,
  bookEquipmentLimits,
} from '../src/systems/dnd5e/starting-equipment';
import type { DndSheet } from '../src/systems/dnd5e/types';
const sheet = (id = 'wizard', level = 1, sub = '') =>
  withClassLevels(defaultSheet(), [{ class_id: id, level, subclass_id: sub }]);
const build = (id = 'wizard', bg = 'sage') => selectBackground(sheet(id), bg);
const quantity = (s: DndSheet, name: string) =>
  resolveStartingEquipment(s).find((i) => i.name === name)?.quantity ?? 0;
let sequence = 0;
const uid = () => `starter-${++sequence}`;

test('all forty PHB specializations and eight wizard schools have the correct level and terminology', () => {
  const expected: Record<string, number> = {
    barbarian: 2,
    bard: 2,
    cleric: 7,
    druid: 2,
    fighter: 3,
    monk: 3,
    paladin: 3,
    ranger: 2,
    rogue: 3,
    sorcerer: 2,
    warlock: 3,
    wizard: 8,
    artificer: 4,
  };
  assert.equal(CLASS_PATHS.length, 44);
  assert.equal(new Set(CLASS_PATHS.map((p) => `${p.class_id}:${p.id}`)).size, 44);
  for (const [id, count] of Object.entries(expected)) {
    const paths = CLASS_PATHS.filter((p) => p.class_id === id);
    assert.equal(paths.length, count, id);
    for (const p of paths) {
      assert.equal(Math.min(...p.features.map((f) => f.level)), SUBCLASS_LEVELS[id], p.name);
      assert.ok(
        id === 'artificer' ? p.source?.includes('2020') : /2014|SRD 5.1/.test(p.source ?? ''),
        p.name,
      );
    }
  }
  assert.equal(subclassTerm('wizard'), 'Tradição Arcana');
  assert.equal(subclassTerm('cleric'), 'Domínio Divino');
  assert.deepEqual(
    CLASS_PATHS.filter((p) => p.class_id === 'wizard')
      .map((p) => p.id)
      .sort(),
    [
      'abjuration',
      'conjuration',
      'divination',
      'enchantment',
      'evocation',
      'illusion',
      'necromancy',
      'transmutation',
    ],
  );
});

test('thirteen backgrounds, five variants and customization preserve existing abilities and benefits', () => {
  assert.equal(BACKGROUNDS.filter((b) => !b.variantOf && b.id !== 'custom').length, 13);
  assert.equal(BACKGROUNDS.filter((b) => b.variantOf).length, 5);
  for (const bg of BACKGROUNDS) {
    const original = {
      ...defaultSheet(),
      abilities: { str: 12, dex: 17, con: 14, int: 10, wis: 9, cha: 11 },
    };
    const next = selectBackground(original, bg.id);
    assert.deepEqual(next.abilities, original.abilities);
    assert.equal(next.background, bg.name);
    assert.deepEqual(next.creation?.background_skills, bg.skills);
    assert.deepEqual(creationErrors(next), [], bg.name);
  }
  assert.equal(backgroundTools(BACKGROUNDS.find((b) => b.id === 'guild-artisan')!).length, 17);
  assert.ok(
    backgroundTools(BACKGROUNDS.find((b) => b.id === 'guild-merchant')!).includes(
      'Ferramentas de navegador',
    ),
  );
  const old = build('fighter', 'folk-hero');
  old.creation!.background_tools = ['Ferramentas de cozinheiro'];
  assert.deepEqual(creationErrors(old), []);
});

test('each book equipment alternative resolves and stays within its server grant, including full packs', () => {
  for (const id of Object.keys(CLASS_STARTING_EQUIPMENT))
    for (const bg of BACKGROUNDS) {
      const s = build(id, bg.id),
        limits = bookEquipmentLimits(id, bg.id);
      const groups = [
        ...CLASS_STARTING_EQUIPMENT[id].choices,
        ...backgroundStartingEquipment(s).choices,
      ];
      for (const group of groups)
        for (const option of group.options) {
          const next = {
            ...s,
            creation: { ...s.creation!, equipment_choices: { [group.id]: [option.id] } },
          };
          for (const i of resolveStartingEquipment(next)) {
            assert.ok(i.quantity > 0 && Number.isInteger(i.quantity), `${id}/${bg.id}/${i.name}`);
            assert.ok((limits.get(i.name) ?? 0) >= i.quantity, `${id}/${bg.id}/${i.name}`);
          }
        }
    }
  const barbarian = build('barbarian', 'outlander');
  assert.equal(quantity(barbarian, 'Azagaia'), 4);
  assert.equal(quantity(barbarian, 'Tocha'), 10);
  assert.equal(quantity(barbarian, 'Rações (dia)'), 10);
  const monk = build('monk', 'hermit');
  assert.equal(quantity(monk, 'Dardo'), 10);
});

test('independent alternatives allow two equal weapons, apply gold once and keep older inventory', () => {
  const s = build('fighter', 'noble');
  s.creation!.equipment_choices = {
    armor: ['leather-bow'],
    weapon: ['two-martial'],
    'weapon:two-martial:two-martial': ['Rapieira', 'Rapieira'],
    secondary: ['handaxes'],
    pack: ['explorer'],
  };
  s.currency.gp = 7;
  const before = structuredClone(s),
    next = applyBookStartingEquipment(s, uid);
  assert.equal(next.inventory.find((i) => i.name === 'Rapieira')?.quantity, 2);
  assert.equal(next.inventory.find((i) => i.name === 'Flechas')?.quantity, 20);
  assert.equal(next.inventory.find((i) => i.name === 'Machadinha')?.quantity, 2);
  assert.equal(next.currency.gp, 32);
  assert.equal(next.creation?.equipment_version, 'phb-2014');
  assert.ok(next.inventory.find((i) => i.armor_type === 'light')?.equipped);
  assert.throws(() => applyBookStartingEquipment(next, uid), /já foi aplicado/);
  assert.equal(selectBackground(next, 'sage'), next);
  assert.deepEqual(s, before);
  const invalid = build();
  invalid.creation!.equipment_choices = { weapon: ['unavailable'] };
  assert.throws(() => resolveStartingEquipment(invalid), /Escolha inválida/);
  const artisan = build('wizard', 'guild-artisan');
  artisan.creation!.background_tools = [ARTISAN_TOOLS[6]];
  assert.equal(quantity(artisan, ARTISAN_TOOLS[6]), 1);
});

test('class-specific choices gate maneuvers, disciplines and expertise by their own class level', () => {
  const maneuvers = featureChoices('fighter', 3, 'battle-master').find(
    (c) => c.id === 'maneuvers',
  )!;
  assert.equal(maneuvers.options.length, 16);
  assert.equal(maneuvers.count, 3);
  const disciplines = featureChoices('monk', 3, 'four-elements').find(
    (c) => c.id === 'disciplines',
  )!;
  assert.equal(disciplines.options.length, 17);
  assert.deepEqual(disciplines.required, ['attunement']);
  const monk = sheet('monk', 3, 'four-elements');
  assert.ok(progressionErrors(monk).some((e) => /obrigat|Sintonia/i.test(e)));
  monk.class_levels![0].choices = { disciplines: ['attunement', 'fangs'] };
  assert.deepEqual(progressionErrors(monk), []);
  monk.class_levels![0].choices.disciplines = ['attunement', 'flames'];
  assert.ok(progressionErrors(monk).length);
  const cleric = sheet('cleric', 1, 'knowledge');
  cleric.class_levels![0].choices = { 'knowledge-skills': ['arcana', 'history'] };
  assert.equal(effectiveSkills(cleric).arcana, 2);
  assert.equal(extraAttacks(sheet('bard', 5, 'valor')), 1);
  assert.equal(extraAttacks(sheet('bard', 6, 'valor')), 2);
  assert.equal(extraAttacks(sheet('artificer', 5, 'battle-smith')), 2);
});

test('granted spells resolve to the catalog and patrons expand choices without granting preparation', () => {
  for (const p of CLASS_PATHS)
    for (const level of [SUBCLASS_LEVELS[p.class_id], 9, 17, 20]) {
      const s = sheet(p.class_id, level, p.id);
      for (const name of [...pathSpells(s, p.class_id), ...expandedSpells(s, p.class_id)])
        assert.ok(
          SPELL_CATALOG.some((sp) => sp.english_name === name),
          `${p.id}/${name}`,
        );
    }
  assert.ok(pathSpells(sheet('cleric', 1, 'light'), 'cleric').includes('Light'));
  assert.deepEqual(pathSpells(sheet('warlock', 3, 'archfey'), 'warlock'), []);
  assert.ok(expandedSpells(sheet('warlock', 3, 'archfey'), 'warlock').includes('Faerie Fire'));
  assert.equal(pathSpells(sheet('paladin', 3, 'vengeance'), 'paladin').length, 2);
  for (const [classId, sub] of [
    ['paladin', 'ancients'],
    ['paladin', 'vengeance'],
    ['artificer', 'alchemist'],
    ['artificer', 'armorer'],
    ['artificer', 'artillerist'],
    ['artificer', 'battle-smith'],
  ]) {
    for (const [index, level] of [3, 5, 9, 13, 17].entries()) {
      assert.equal(
        pathSpells(sheet(classId, level, sub), classId).length,
        2 * (index + 1),
        `${sub}/${level}`,
      );
      assert.equal(
        pathSpells(sheet(classId, level - 1, sub), classId).length,
        2 * index,
        `${sub}/${level - 1}`,
      );
    }
  }
});
