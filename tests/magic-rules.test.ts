import test from 'node:test';
import assert from 'node:assert/strict';
import audit from '../src/features/vtt/spell-audit.json';
import profiles from '../src/features/vtt/spell-effects.json';
import { validatePhysicalRolls, physicalDiceSlots } from '../src/features/vtt/physical-dice';
import { spellSaveDc, spellResolutionLabel } from '../src/features/vtt/spell-review';
import { defaultSheet } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
import { spellFromCatalog, SPELL_CATALOG } from '../src/systems/dnd5e/spell-catalog';
test('all 361 supplied 2014 spells are classified without assigning saves to Bless, illusions or later Web triggers', () => {
  assert.equal(Object.keys(audit).length, 361);
  assert.deepEqual(Object.keys(audit).sort(), SPELL_CATALOG.map((s) => s.id).sort());
  assert.equal(audit['bencao'].initialSave, '');
  assert.equal(audit['ilusao-menor'].initialSave, '');
  assert.equal(audit['teia'].initialSave, '');
  assert.equal(profiles['imobilizar-pessoa'].save, 'wis');
  assert.equal(profiles['imobilizar-pessoa'].repeatSave, 'end');
  assert.equal(profiles['onda-trovejante'].timing, 'immediate');
  assert.equal(profiles['vitalidade-ilusoria'].kind, 'temporary');
  assert.equal(audit['raio-doentio'].initialSave, '');
  assert.equal(audit['raio-doentio'].effectSave, 'con');
  assert.equal(audit['mente-debil'].initialSave, '');
  assert.match(spellResolutionLabel({ catalog_id: 'lanca-de-fogo' }), /CA/);
});
test('the displayed DC follows spell origin and total-level proficiency', () => {
  const sheet = withClassLevels(
    { ...defaultSheet(), abilities: { str: 16, dex: 16, con: 16, int: 14, wis: 16, cha: 18 } },
    [
      { class_id: 'wizard', level: 2 },
      { class_id: 'warlock', level: 3 },
    ],
  );
  const entry = SPELL_CATALOG.find((s) => s.english_name === 'Fire Bolt')!;
  assert.equal(spellSaveDc(sheet, spellFromCatalog(entry, 'test', 'wizard')), 13);
  assert.equal(spellSaveDc(sheet, spellFromCatalog(entry, 'test', 'warlock')), 15);
});
test('physical input keeps natural d20s, advantage, typed damage dice and weapon rerolls separate from modifiers', () => {
  const advantage = { expression: '1d20+6', mode: 'advantage' as const, label: 'Ataque' };
  assert.deepEqual(physicalDiceSlots(advantage), [20, 20]);
  assert.deepEqual(validatePhysicalRolls([advantage], ['4, 20']), [[4, 20]]);
  assert.throws(() => validatePhysicalRolls([advantage], ['26']), /2 face/);
  assert.throws(() => validatePhysicalRolls([advantage], ['20,21']), /inteiro/);
  const mixed = { expression: '2d8+4d6+3', mode: 'normal' as const, label: 'Dano' };
  assert.deepEqual(validatePhysicalRolls([mixed], ['8 7 6 5 4 3']), [[8, 7, 6, 5, 4, 3]]);
  assert.throws(() => validatePhysicalRolls([mixed], ['8 7 6 5 4 7']), /1 a 6/);
  const weapon = {
    expression: '2d6+3',
    mode: 'normal' as const,
    label: 'Arma',
    rerollWeaponDice: 2,
  };
  assert.deepEqual(validatePhysicalRolls([weapon], ['1 4 6']), [[1, 4, 6]]);
  assert.throws(() => validatePhysicalRolls([weapon], ['1 4']), /3 face/);
});
