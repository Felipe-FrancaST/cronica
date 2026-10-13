import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEM_STARTERS,
  itemDefinitionErrors,
  grantedInventoryItem,
  duplicateDefinition,
  itemMatches,
  definitionFromCatalog,
} from '../src/features/items/model';
import { ITEM_CATALOG, itemUses } from '../src/systems/dnd5e/items';
import { defaultSheet, calculate } from '../src/systems/dnd5e';
import { weaponEffect } from '../src/features/vtt/effects';
import type { CampaignItem } from '../src/features/items/types';

const model = (id: string): CampaignItem => ({
  id: '10000000-0000-4000-8000-000000000025',
  campaign_id: 'campaign',
  name: '',
  data: ITEM_STARTERS.find((t) => t.id === id)!.create(),
  visible_to_players: false,
  archived: false,
  version: 1,
  created_at: '',
  updated_at: '',
  private_notes: 'A maldição é secreta.',
});
test('every compendium base can start a workshop item, including the non-damaging net', () => {
  for (const entry of ITEM_CATALOG)
    assert.deepEqual(itemDefinitionErrors(definitionFromCatalog(entry)), [], entry.name);
  const net = definitionFromCatalog(ITEM_CATALOG.find((i) => i.catalog_id === 'net')!);
  assert.equal(net.category, 'gear');
  assert.equal(net.functions[0].kind, 'utility');
  assert.equal(net.functions[0].dice, '');
});
test('workshop starters have valid definitions, and invalid costs or dice cannot be saved', () => {
  for (const starter of ITEM_STARTERS.filter((s) => s.id !== 'blank'))
    assert.deepEqual(itemDefinitionErrors(starter.create()), [], starter.id);
  const data = model('wand').data;
  data.functions[0].charge_cost = 8;
  assert.match(itemDefinitionErrors(data).join(' '), /capacidade/);
  data.functions[0].charge_cost = 1;
  data.functions[0].dice = 'alert(1)';
  assert.match(itemDefinitionErrors(data).join(' '), /dados/);
});
test('one item offers multiple functions and each has independent requirements and costs', () => {
  const item = grantedInventoryItem(model('wand'), 1);
  assert.equal(itemUses(item).length, 2);
  item.charges_used = 6;
  assert.equal(itemUses(item).length, 1);
  item.charges_used = 7;
  assert.equal(itemUses(item).length, 0);
  const charm = grantedInventoryItem(model('charm'), 1);
  assert.equal(itemUses(charm).length, 0);
  charm.attuned = true;
  assert.equal(itemUses(charm)[0].kind, 'temporary');
  assert.equal(itemUses(charm)[0].cost, 'bonus');
  charm.quantity = 0;
  assert.equal(itemUses(charm).length, 0);
});
test('deliveries and duplicates do not share mutable data or reveal master secrets', () => {
  const item = model('wand'),
    gift = grantedInventoryItem(item, 1),
    copy = duplicateDefinition(item.data);
  gift.functions![0].dice = '1';
  copy.functions[1].dice = '1';
  assert.equal(item.data.functions[0].dice, '2d6');
  assert.equal(item.data.functions[1].dice, '3d6');
  assert.equal(copy.functions[0].id === item.data.functions[0].id, false);
  assert.equal(Object.hasOwn(gift, 'private_notes'), false);
  assert.equal(itemMatches({ ...item, name: 'Varinha mágica' }, 'magica'), true);
});
test('passive equipment and attunement bonuses affect AC, speed and weapon attacks only when active', () => {
  const sheet = defaultSheet(),
    before = calculate(sheet),
    cloak = grantedInventoryItem(model('cloak'), 1),
    boots = grantedInventoryItem(model('boots'), 1);
  sheet.inventory = [cloak, boots];
  assert.equal(calculate(sheet).armorClass, before.armorClass);
  cloak.equipped = true;
  cloak.attuned = true;
  boots.equipped = true;
  assert.equal(calculate(sheet).armorClass, before.armorClass + 1);
  assert.equal(calculate(sheet).speed, before.speed + 3);
  cloak.bonuses!.attack = 2;
  cloak.bonuses!.damage = 3;
  const weapon = {
    id: 'weapon',
    name: 'Espada',
    category: 'weapon' as const,
    quantity: 1,
    equipped: true,
    weight: 1,
    notes: '',
    damage: '1d8 cortante',
    weapon_type: 'simple' as const,
  };
  const enhanced = weaponEffect(weapon, sheet);
  cloak.attuned = false;
  const base = weaponEffect(weapon, sheet);
  assert.equal(enhanced.attackBonus!, base.attackBonus! + 2);
  assert.notEqual(enhanced.dice, base.dice);
  boots.quantity = 0;
  assert.equal(calculate(sheet).speed, before.speed);
});
