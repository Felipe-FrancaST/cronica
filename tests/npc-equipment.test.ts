import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseNpcInventory,
  serializeNpcInventory,
  suggestedNpcArmorClass,
} from '../src/lib/npc-equipment';
import { ITEM_CATALOG, equipItem } from '../src/systems/dnd5e/items';
import type { InventoryItem } from '../src/systems/dnd5e/types';

const dagger: InventoryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  catalog_id: 'dagger',
  category: 'weapon',
  name: 'Adaga',
  quantity: 2,
  weight: 0.5,
  equipped: true,
  damage: '1d4 perfurante',
  notes: 'Empunhada pela sentinela.',
};

test('legacy NPC inventory notes are preserved unchanged', () => {
  const legacy = 'Espada longa, chave dos arquivos';
  assert.equal(serializeNpcInventory(legacy), legacy);
  assert.deepEqual(parseNpcInventory(legacy), { inventory: legacy, equipment: [] });
});

test('NPC equipment and legacy notes survive persistence round trip', () => {
  const notes = 'Uma carta secreta, escondida na capa.\nNão revelar aos jogadores.';
  const encoded = serializeNpcInventory(notes, [dagger]);
  assert.deepEqual(parseNpcInventory(encoded), { inventory: notes, equipment: [dagger] });
});

test('removing the last item returns to the legacy plain text representation', () => {
  assert.equal(serializeNpcInventory('Anotações livres', []), 'Anotações livres');
});

test('bad equipment data is never silently dropped', () => {
  const corrupt = 'CRONICA_NPC_EQUIPMENT_V1\n{"notes":"foo","equipment":[{}]}';
  assert.deepEqual(parseNpcInventory(corrupt), { inventory: corrupt, equipment: [] });
});

test('equipment catalog has usable arms and armor, and equip enforces armor slots', () => {
  assert.ok(ITEM_CATALOG.find((item) => item.catalog_id === dagger.catalog_id));
  const armor = ITEM_CATALOG.find((item) => item.catalog_id === 'leather')!;
  const armor2 = ITEM_CATALOG.find((item) => item.catalog_id === 'plate')!;
  const shield = ITEM_CATALOG.find((item) => item.catalog_id === 'shield')!;
  const armorItems: InventoryItem[] = [armor, armor2, shield].map((item, index) => ({
    ...item,
    id: String(index),
    equipped: false,
  }));
  const result = equipItem(equipItem(equipItem(armorItems, '0', true), '2', true), '1', true);
  assert.equal(result[0].equipped, false);
  assert.equal(result[1].equipped, true);
  assert.equal(result[2].equipped, true);
});

test('equipped armor suggests a realistic AC without changing the NPC automatically', () => {
  const plate = ITEM_CATALOG.find((item) => item.catalog_id === 'plate')!;
  const shield = ITEM_CATALOG.find((item) => item.catalog_id === 'shield')!;
  const equipped: InventoryItem[] = [plate, shield].map((item, i) => ({
    ...item,
    id: String(i),
    equipped: true,
  }));
  assert.equal(suggestedNpcArmorClass(equipped, 18), 20); // heavy armor ignores Dexterity
  assert.equal(suggestedNpcArmorClass([], 18), null);
  assert.equal(suggestedNpcArmorClass([equipped[1]], 14), 14); // shield + unarmored
});
