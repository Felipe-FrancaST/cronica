import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultArkanisSheet,
  syncArkanis,
  RACIAL_APTITUDES,
  calculateArkanis,
} from '../src/systems/arkanis/rules';
import { POTIONS, brewPotion, potionFor } from '../src/systems/arkanis/potions';
import { INGREDIENTS, ingredientItem } from '../src/systems/arkanis/ingredients';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
test('racial aptitudes follow race without accumulating and preserve training', () => {
  let s = syncArkanis(defaultArkanisSheet(), 'maximum');
  for (const [race, aptitudes] of Object.entries(RACIAL_APTITUDES)) {
    s = syncArkanis({ ...s, race_id: race }, 'maximum');
    assert.deepEqual(s.aptitudes, aptitudes);
  }
  s = syncArkanis({ ...s, aptitude_training: { percepcao: 3 }, race_id: 'harpy' }, 'maximum');
  s = syncArkanis({ ...s, race_id: 'elf' }, 'maximum');
  assert.equal(s.aptitudes.percepcao, 3);
  assert.equal(s.aptitudes.intimidacao, undefined);
});
test('PV adds resistance per level, orc total plus racial eight once; rolls survive level decrease', () => {
  let s = syncArkanis({ ...defaultArkanisSheet(), level: 3 }, 'maximum');
  assert.equal(s.hp_max, 3 * (8 + calculateArkanis(s).modifiers.res));
  s = syncArkanis({ ...s, race_id: 'orc' }, 'maximum');
  assert.equal(s.hp_max, 3 * (12 + 18) + 8);
  s = syncArkanis({ ...s, pv_rolls: { orc: [1, 4, 12] } }, 'rolled');
  assert.equal(s.hp_max, 17 + 3 * 18 + 8);
  s = syncArkanis({ ...s, level: 1 }, 'rolled');
  assert.equal(s.hp_max, 27);
  s = syncArkanis({ ...s, level: 3 }, 'rolled');
  assert.equal(s.hp_max, 79);
});
test('all 75 recipes resolve ingredients and icons; every tier crafts in either slot order', () => {
  assert.equal(POTIONS.length, 75);
  for (const recipe of POTIONS) {
    assert.ok(existsSync(`public${recipe.icon}`));
    const inventory = recipe.ingredients.map((name) => {
      const ingredient = INGREDIENTS.find((i) => i.name === name);
      if (ingredient) return ingredientItem(ingredient, randomUUID(), 1);
      const base = POTIONS.find((p) => p.name === name);
      assert.ok(base, name);
      return {
        id: randomUUID(),
        name,
        category: 'consumable' as const,
        quantity: 1,
        weight: 0,
        equipped: false,
        notes: base.effect,
        tags: ['poções'],
        image_path: base.icon,
      };
    });
    assert.equal(potionFor([...inventory].reverse())?.id, recipe.id);
    const brewed = brewPotion(inventory, inventory.map((i) => i.id).reverse(), randomUUID());
    assert.equal(brewed.at(-1)?.name, recipe.name);
    assert.equal(brewed.at(-1)?.quantity, 1);
    assert.equal(brewed[0].quantity, 0);
    assert.equal(brewed[1].quantity, 0);
    assert.equal(inventory[0].quantity, 1);
    assert.throws(
      () =>
        brewPotion(
          brewed,
          inventory.map((i) => i.id),
          randomUUID(),
        ),
      /insuficientes/,
    );
  }
});
test('invalid recipes and missing materials never mutate the inventory', () => {
  const bag = [ingredientItem(INGREDIENTS[0], randomUUID(), 1)];
  const before = structuredClone(bag);
  assert.throws(() => brewPotion(bag, [bag[0].id, 'missing'], randomUUID()));
  assert.throws(() => brewPotion(bag, [bag[0].id, bag[0].id], randomUUID()));
  assert.deepEqual(bag, before);
});
