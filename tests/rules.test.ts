import test from 'node:test';
import assert from 'node:assert/strict';
import {
  abilityModifier,
  proficiencyBonus,
  calculate,
  defaultSheet,
  spellSlots,
  validate,
} from '../src/systems/dnd5e';
import { createDemoWorkspace } from '../src/lib/demo-data';
import { accessibleWorkspace } from '../src/services/demo-repository';
test('ability modifiers include negative odd scores', () => {
  assert.equal(abilityModifier(9), -1);
  assert.equal(abilityModifier(8), -1);
  assert.equal(abilityModifier(11), 0);
  assert.equal(abilityModifier(18), 4);
});
test('proficiency scales from level 1 to 20', () => {
  assert.deepEqual([1, 4, 5, 9, 13, 17, 20].map(proficiencyBonus), [2, 2, 3, 4, 5, 6, 6]);
});
test('expertise and saving throws recalculate with ability and level', () => {
  const s = defaultSheet();
  s.level = 5;
  s.abilities.dex = 18;
  s.skills.stealth = 2;
  s.saves = ['dex'];
  const d = calculate(s);
  assert.equal(d.skills.stealth, 10);
  assert.equal(d.saves.dex, 7);
  s.level = 9;
  assert.equal(calculate(s).skills.stealth, 12);
});
test('light, medium and heavy armor, shield and unarmored defenses', () => {
  const s = defaultSheet();
  s.abilities.dex = 18;
  const armor = {
    id: 'armor',
    name: 'Peitoral',
    category: 'armor' as const,
    quantity: 1,
    weight: 1,
    equipped: true,
    armor_base: 14,
    armor_type: 'medium' as const,
    notes: '',
  };
  s.inventory = [armor];
  assert.equal(calculate(s).armorClass, 16);
  s.inventory = [{ ...armor, armor_type: 'heavy', armor_base: 18 }];
  assert.equal(calculate(s).armorClass, 18);
  s.inventory.push({ ...armor, id: 'shield', armor_type: 'shield', armor_base: 2 });
  assert.equal(calculate(s).armorClass, 20);
  s.inventory = [];
  s.class_id = 'barbarian';
  s.abilities.con = 16;
  assert.equal(calculate(s).armorClass, 17);
  s.class_id = 'monk';
  s.abilities.wis = 16;
  assert.equal(calculate(s).armorClass, 17);
});
test('spell slots distinguish full, half and pact casters', () => {
  assert.deepEqual(spellSlots('wizard', 5), [4, 3, 2]);
  assert.deepEqual(spellSlots('paladin', 1), []);
  assert.deepEqual(spellSlots('paladin', 5), [4, 2]);
  assert.deepEqual(spellSlots('warlock', 5), [0, 0, 2]);
  assert.deepEqual(spellSlots('fighter', 5), []);
});
test('hit points use class hit dice, constitution and optional manual maximum', () => {
  const s = defaultSheet();
  s.level = 5;
  s.abilities.con = 14;
  assert.equal(calculate(s).hpMax, 44);
  s.hp_max_override = 57;
  assert.equal(calculate(s).hpMax, 57);
  s.hp_max_override = null;
  s.class_id = 'wizard';
  assert.equal(calculate(s).hpMax, 32);
});
test('demo players only see their own characters and revealed records', () => {
  const data = createDemoWorkspace();
  const player = data.profiles[1];
  const accessible = accessibleWorkspace(data, player.id);
  assert.ok(
    accessible.characters.every(
      (c) =>
        c.owner_id === player.id ||
        data.campaigns.some((x) => x.id === c.campaign_id && x.owner_id === player.id),
    ),
  );
  assert.ok(
    accessible.world
      .filter((w) => w.campaign_id === data.campaigns[0].id)
      .every((w) => w.visible_to_players && w.secrets === undefined),
  );
  assert.ok(!accessible.npcs.some((n) => n.name === 'O Colecionador de Ecos'));
});
test('validation rejects invalid character levels and negative currency', () => {
  const c = createDemoWorkspace().characters[0];
  c.sheet.level = 21;
  c.sheet.currency.gp = -1;
  assert.equal(validate(c).length, 2);
});
