import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { arkanis } from '../src/systems/arkanis';
import {
  ATTRIBUTES,
  ANCESTRIES,
  defaultArkanisSheet,
  attributeModifier,
  arkanoModifier,
  calculateArkanis,
  validateArkanis,
} from '../src/systems/arkanis/rules';
import {
  INGREDIENTS,
  HABITATS,
  ingredientItem,
  addIngredient,
  availableIngredients,
  isIngredient,
  normalizeSearch,
} from '../src/systems/arkanis/ingredients';
import { getSystem } from '../src/systems/registry';

test('Arkanis has a separate module and sheet without D&D classes, slots or abilities', () => {
  const s = defaultArkanisSheet();
  assert.equal(getSystem('arkanis').slug, 'arkanis');
  assert.equal(getSystem('dnd5e').slug, 'dnd5e');
  for (const field of ['class_id', 'class_levels', 'abilities', 'slots_used', 'saves'])
    assert.equal(field in s, false);
  assert.deepEqual(
    ATTRIBUTES.map((a) => a.id),
    ['for', 'agi', 'res', 'int', 'sen', 'pre'],
  );
  assert.equal(ANCESTRIES.length, 7);
  assert.equal(s.sanity_current, 10);
});
test('Arkanis attribute modifiers follow every band from the supplied book', () => {
  const expectations = [
    [1, -5],
    [2, -5],
    [3, -4],
    [5, -4],
    [6, -3],
    [8, -3],
    [9, -2],
    [11, -2],
    [12, -1],
    [14, -1],
    [15, 0],
    [16, 0],
    [17, 1],
    [19, 1],
    [20, 2],
    [22, 2],
    [23, 3],
    [25, 3],
    [26, 4],
    [28, 4],
    [29, 5],
    [30, 5],
  ];
  for (const [score, bonus] of expectations) assert.equal(attributeModifier(score), bonus);
});
test('Arkano bands preserve the ambiguous 75 and allow a recorded GM ruling', () => {
  for (const [score, bonus] of [
    [20, 0],
    [21, 1],
    [30, 1],
    [31, 2],
    [50, 2],
    [51, 3],
    [70, 3],
    [71, 4],
    [74, 4],
    [76, 5],
    [80, 5],
    [81, 6],
    [86, 7],
    [91, 8],
    [96, 9],
    [100, 10],
  ])
    assert.equal(arkanoModifier(score), bonus);
  assert.equal(arkanoModifier(75), null);
  const s = defaultArkanisSheet();
  s.arkano = { body: 10, mind: 10, spirit: 10, bonus: 45, modifier_override: null };
  assert.equal(calculateArkanis(s).manaMax, null);
  s.arkano.modifier_override = 4;
  assert.equal(calculateArkanis(s).arkModifier, 4);
});
test('racial bonuses and each Arkano ten are included once, including after hydration', () => {
  const s = defaultArkanisSheet();
  s.race_id = 'elf';
  s.race = 'Elfo';
  s.arkano = { body: 10, mind: 10, spirit: 10, bonus: 0, modifier_override: null };
  const first = calculateArkanis(s);
  assert.equal(first.arkano, 37);
  assert.equal(first.attributes.res, 19);
  assert.equal(first.attributes.int, 17);
  assert.equal(first.attributes.agi, 20);
  assert.equal(first.manaMax, 44);
  const hydrated = arkanis.hydrateSheet({
    data: s as unknown as Record<string, unknown>,
    attributes: [],
    skills: [],
    inventory: [],
    spells: [],
  });
  assert.deepEqual(calculateArkanis(hydrated), first);
});
test('Reflexes use final Agility and Sensibility, not D&D modifiers, and HP stays manual', () => {
  const s = defaultArkanisSheet();
  s.hp_max = 31;
  s.hp_current = 20;
  s.arkano.body = s.arkano.mind = s.arkano.spirit = 5;
  const d = calculateArkanis(s);
  assert.equal(d.reflex, 16);
  assert.equal(d.hpMax, 31);
  assert.equal(d.manaMax, 21);
  s.race_id = 'demon';
  assert.equal(calculateArkanis(s).reflex, 17);
});
test('all 180 named ingredients, 18 habitats and 180 unique safe SVG assets are included', () => {
  assert.equal(INGREDIENTS.length, 180);
  assert.equal(HABITATS.length, 18);
  assert.equal(new Set(INGREDIENTS.map((i) => i.id)).size, 180);
  assert.equal(INGREDIENTS[0].name, 'Pérola Negra');
  assert.equal(INGREDIENTS[179].name, 'Semente do Fim');
  const hashes = new Set<string>();
  for (const item of INGREDIENTS) {
    assert.deepEqual(item.tags, ['ingredientes']);
    const svg = readFileSync(new URL('../public' + item.icon, import.meta.url), 'utf8');
    assert.match(svg, /viewBox="0 0 96 96"/);
    assert.ok(svg.includes(item.name));
    assert.doesNotMatch(svg, /<script|<foreignObject|href=["']https?:/i);
    hashes.add(createHash('sha256').update(svg).digest('hex'));
  }
  assert.equal(hashes.size, 180);
  for (const h of HABITATS)
    assert.equal(INGREDIENTS.filter((i) => i.habitat_id === h.id).length, 10);
});
test('stock uses tagged positive quantities, combines the same catalogue ingredient and never crafts', () => {
  const id = randomUUID(),
    ref = INGREDIENTS[0];
  const first = ingredientItem(ref, id, 2);
  const original = JSON.stringify(first);
  const next = addIngredient([first], ref, randomUUID(), 3);
  assert.equal(next.length, 1);
  assert.equal(next[0].quantity, 5);
  assert.equal(JSON.stringify(first), original);
  assert.equal(availableIngredients([{ ...first, quantity: 0 }]).length, 0);
  assert.equal(availableIngredients([{ ...first, tags: [] }]).length, 0);
  assert.ok(isIngredient({ tags: ['Ingredientes'] }));
  assert.ok(isIngredient({ tags: ['ingrediente'] }));
  assert.equal(normalizeSearch('Pérola'), 'perola');
  assert.throws(() => addIngredient(next, ref, randomUUID(), -1));
  assert.throws(() => addIngredient(next, ref, randomUUID(), 9999));
});
test('validation rejects missing HP/Arkano, invalid resources and unresolved mastery three', () => {
  const s = defaultArkanisSheet();
  const c = {
    id: randomUUID(),
    campaign_id: randomUUID(),
    owner_id: randomUUID(),
    rpg_system_id: randomUUID(),
    name: 'Ayla',
    portrait_path: null,
    appearance: '',
    biography: '',
    created_at: '',
    updated_at: '',
    sheet: s,
  };
  assert.ok(validateArkanis(c).length > 0);
  s.hp_max = 20;
  s.hp_current = 20;
  s.arkano.body = s.arkano.mind = s.arkano.spirit = 5;
  assert.deepEqual(validateArkanis(c), []);
  s.mana_current = 999;
  assert.ok(validateArkanis(c).some((e) => e.includes('Mana')));
  s.mana_current = 0;
  s.weapons = [
    {
      id: randomUUID(),
      name: 'Lança',
      die: 8,
      mastery: 3,
      dice_at_third: null,
      range: '',
      requirements: '',
      notes: '',
    },
  ];
  assert.ok(validateArkanis(c).some((e) => e.includes('maestria')));
  s.weapons[0].dice_at_third = 3;
  assert.deepEqual(validateArkanis(c), []);
});
