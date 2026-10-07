import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSheet, calculate } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
import {
  castingClasses,
  spellEligibility,
  availableCastResources,
  specialSpellLimit,
  spellLearningUsage,
} from '../src/systems/dnd5e/spellcasting';
import { spellFromCatalog, SPELL_CATALOG } from '../src/systems/dnd5e/spell-catalog';
import { ITEM_CATALOG, normalizeItem, itemUse, equipItem } from '../src/systems/dnd5e/items';
import { combatFeatures } from '../src/systems/dnd5e/combat-features';
import { characterSpellEffect, weaponEffect, effectBoundary } from '../src/features/vtt/effects';
import type { ClassLevel } from '../src/types';
const make = (levels: ClassLevel[]) =>
  withClassLevels(
    { ...defaultSheet(), abilities: { str: 16, dex: 14, con: 14, int: 16, wis: 16, cha: 16 } },
    levels,
  );
const spell = (name: string, origin: string) => ({
  ...spellFromCatalog(
    SPELL_CATALOG.find((s) => s.english_name === name)!,
    name,
    origin,
  ),
  prepared: true,
});
const item = (id: string) => ({ ...ITEM_CATALOG.find((i) => i.catalog_id === id)!, id });
test('noncasters, early half-casters and invalid origins never gain magic through the bonus flag', () => {
  for (const id of ['fighter', 'barbarian', 'rogue', 'monk', 'paladin', 'ranger']) {
    const s = make([{ class_id: id, level: 1 }]),
      sp = { ...spell('Fire Bolt', id), casting_mode: 'bonus' as const };
    assert.equal(castingClasses(s).length, 0);
    assert.ok(spellEligibility(s, sp));
    assert.deepEqual(availableCastResources(s, sp), []);
  }
  const multi = make([
    { class_id: 'wizard', level: 5 },
    { class_id: 'fighter', level: 3, subclass_id: 'champion' },
  ]);
  assert.deepEqual(
    castingClasses(multi).map((c) => c.class_id),
    ['wizard'],
  );
  assert.ok(spellEligibility(multi, { ...spell('Fireball', 'fighter'), casting_mode: 'bonus' }));
  assert.ok(spellEligibility(multi, { ...spell('Cure Wounds', 'wizard'), casting_mode: 'bonus' }));
  assert.equal(
    spellEligibility(
      make([{ class_id: 'fighter', level: 3, subclass_id: 'eldritch-knight' }]),
      spell('Magic Missile', 'fighter'),
    ),
    null,
  );
  assert.ok(
    spellEligibility(make([{ class_id: 'paladin', level: 2 }]), spell('Fire Bolt', 'paladin')),
  );
});
test('special spell choices require their actual class, path, level and count', () => {
  let s = make([{ class_id: 'bard', level: 6, subclass_id: 'lore' }]);
  const fire = {
    ...spell('Fireball', 'bard'),
    granted_feature: 'magical-secrets' as const,
    casting_mode: 'bonus' as const,
  };
  assert.equal(spellEligibility(s, fire), null);
  assert.equal(specialSpellLimit(s, 'bard', 'magical-secrets'), 2);
  s.spells = [fire, { ...fire, id: 'two' }, { ...fire, id: 'three' }];
  assert.ok(spellEligibility(s, s.spells[2]));
  assert.ok(
    spellEligibility(make([{ class_id: 'fighter', level: 6 }]), { ...fire, class_id: 'fighter' }),
  );
  const tome = make([{ class_id: 'warlock', level: 3, choices: { pact: ['tome'] } }]);
  assert.equal(
    spellEligibility(tome, { ...spell('Sacred Flame', 'warlock'), granted_feature: 'pact-tome' }),
    null,
  );
  assert.ok(
    spellEligibility(tome, { ...spell('Cure Wounds', 'warlock'), granted_feature: 'pact-tome' }),
  );
  assert.equal(
    spellEligibility(
      make([{ class_id: 'warlock', level: 5, subclass_id: 'fiend' }]),
      spell('Fireball', 'warlock'),
    ),
    null,
  );
  assert.ok(
    spellEligibility(
      make([{ class_id: 'warlock', level: 3, subclass_id: 'fiend' }]),
      spell('Fireball', 'warlock'),
    ),
  );
});
test('class weapon modifiers, ki and healing use class levels and equipment', () => {
  const s = make([
    { class_id: 'fighter', level: 5, choices: { style: ['dueling'] } },
    { class_id: 'rogue', level: 3 },
  ]);
  assert.equal(weaponEffect(item('dagger'), s, { sneak: true }).dice, '1d4+5+2d6');
  assert.equal(weaponEffect(item('longsword'), s, { two_handed: true }).dice, '1d10+3');
  const monk = make([
    { class_id: 'fighter', level: 10 },
    { class_id: 'monk', level: 2 },
  ]);
  assert.equal(
    weaponEffect({ ...item('club'), catalog_id: 'unarmed', damage: '1 concussão' }, monk).dice,
    '1d4+3',
  );
  assert.equal(combatFeatures(monk).find((f) => f.id === 'fighter:second-wind')?.dice, '1d10+10');
  assert.equal(
    weaponEffect(item('longsword'), make([{ class_id: 'barbarian', level: 9 }]), {}, true).dice,
    '1d8+6',
  );
  const raging = combatFeatures(make([{ class_id: 'barbarian', level: 5 }]), true);
  assert.deepEqual(
    raging.map((f) => f.id),
    ['barbarian:end-rage'],
  );
  const life = make([{ class_id: 'cleric', level: 17, subclass_id: 'life' }]);
  assert.equal(characterSpellEffect(life, spell('Cure Wounds', 'cleric'), 2).dice, '8+8+3+4');
  assert.equal(calculate(make([{ class_id: 'paladin', level: 6 }])).saves.dex, 5);
  const warlock = make([
    { class_id: 'warlock', level: 5, choices: { invocations: ['agonizing-blast'] } },
  ]);
  assert.equal(characterSpellEffect(warlock, spell('Eldritch Blast', 'warlock'), 0).dice, '1d10+3');
});
test('typed items preserve legacy counts, never add spell attributes to potions and stop at zero uses', () => {
  const old = {
    ...item('potion-healing'),
    catalog_id: undefined,
    category: 'item' as const,
    quantity: 3,
    notes: 'Preservar nota',
  };
  const normalized = normalizeItem(old);
  assert.equal(normalized.quantity, 3);
  assert.equal(normalized.notes, old.notes);
  assert.equal(normalized.category, 'potion');
  assert.equal(itemUse(normalized)?.dice, '2d4+2');
  assert.equal(itemUse({ ...normalized, quantity: 0 }), undefined);
  assert.equal(itemUse({ ...item('healers-kit'), charges_used: 10 }), undefined);
  const inventory = equipItem(
    [{ ...item('leather'), equipped: true }, item('plate'), { ...item('shield'), equipped: true }],
    'plate',
    true,
  );
  assert.equal(inventory[0].equipped, false);
  assert.equal(inventory[2].equipped, true);
  assert.equal(new Set(ITEM_CATALOG.map((i) => i.catalog_id)).size, ITEM_CATALOG.length);
});
test('area outlines contain only the perimeter and remain linear in the footprint', () => {
  assert.equal(effectBoundary([{ x: 0, y: 0 }]).length, 4);
  assert.equal(
    effectBoundary([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]).length,
    6,
  );
  assert.equal(
    effectBoundary(Array.from({ length: 100 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10) })))
      .length,
    40,
  );
});

test('ordinary Magical Secrets count as known spells while Lore and Tome keep their extra allowance', () => {
  const s = make([{ class_id: 'bard', level: 10, subclass_id: 'lore' }]);
  s.spells = [
    ...Array.from({ length: 4 }, (_, i) => ({
      ...spell('Fireball', 'bard'),
      id: 'secret-' + i,
      granted_feature: 'magical-secrets' as const,
      casting_mode: 'bonus' as const,
    })),
    { ...spell('Cure Wounds', 'bard'), prepared: false },
  ];
  assert.equal(spellLearningUsage(s, 'bard').known, 3);
  const tome = make([{ class_id: 'warlock', level: 3, choices: { pact: ['tome'] } }]);
  tome.spells = [
    { ...spell('Sacred Flame', 'warlock'), granted_feature: 'pact-tome' },
    spell('Eldritch Blast', 'warlock'),
  ];
  assert.equal(spellLearningUsage(tome, 'warlock').cantrips, 1);
});
