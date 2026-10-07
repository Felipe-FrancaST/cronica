import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { defaultSheet, calculate } from '../src/systems/dnd5e';
import { withClassLevels } from '../src/systems/dnd5e/progression';
import {
  hitPointEntries,
  rollHitPoints,
  pendingHitPointRolls,
} from '../src/systems/dnd5e/hit-points';
import { defaultRules, rulesFor } from '../src/features/sessions/types';
import { characterRuleErrors } from '../src/features/sessions/character-rules';
import {
  applyStartingEquipment,
  newCreation,
  selectBackground,
  withCreation,
} from '../src/systems/dnd5e/creation';
import { addSceneryMeshes } from '../src/features/vtt/scenery-meshes';
import { workshopSceneryParts } from '../src/features/vtt/scenery-workshop-meshes';
import {
  SCENERY_VARIANTS,
  SCENERY_GROUPS,
  makeScenery,
  sceneryStack,
  sceneryAtCell,
} from '../src/features/vtt/scenery';
import { SCENERY_STYLES } from '../src/features/vtt/scenery-styles';
import type { BattleMapObject } from '../src/features/vtt/types';

const sheet = () =>
  withClassLevels(
    { ...defaultSheet(), abilities: { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 } },
    [
      { class_id: 'fighter', level: 2 },
      { class_id: 'wizard', level: 2 },
    ],
  );
test('HP methods use the correct die for each class and only the initial level receives a full die', () => {
  const current = sheet();
  assert.deepEqual(
    hitPointEntries(current).map((entry) => entry.value),
    [10, 6, 4, 4],
  );
  assert.equal(calculate(current).hpMax, 32);
  assert.equal(calculate({ ...current, hit_point_method: 'maximum' }).hpMax, 40);
  assert.equal(
    calculate({
      ...current,
      hit_point_method: 'rolled',
      hit_point_rolls: { fighter: [10, 1], wizard: [3, 6] },
    }).hpMax,
    28,
  );
  assert.equal(pendingHitPointRolls({ ...current, hit_point_method: 'rolled' }).length, 3);
});
test('HP rolls are stable across retries, level decreases and increases, with minimum per-level HP', () => {
  const current = { ...sheet(), hit_point_method: 'rolled' as const };
  let calls = 0;
  const rolls = rollHitPoints(current, {}, () => {
    calls++;
    return 1;
  });
  assert.equal(calls, 3);
  assert.deepEqual(
    rollHitPoints(current, rolls, () => {
      throw new Error('reroll');
    }),
    rolls,
  );
  const decreased = withClassLevels(current, [{ class_id: 'fighter', level: 1 }]);
  assert.deepEqual(
    rollHitPoints(decreased, rolls, () => {
      throw new Error('reroll');
    }),
    rolls,
  );
  assert.deepEqual(
    rollHitPoints(current, rolls, () => {
      throw new Error('reroll');
    }),
    rolls,
  );
  const weak = { ...current, abilities: { ...current.abilities, con: 1 }, hit_point_rolls: rolls };
  assert.equal(calculate(weak).hpMax, 8);
});
test('legacy campaign rules receive defaults and existing multiclass builds can progress when new combinations are forbidden', () => {
  const rules = rulesFor(
    [{ campaign_id: 'campaign', party_level: 3 } as ReturnType<typeof defaultRules>],
    'campaign',
  );
  assert.equal(rules.hit_point_method, 'average');
  rules.allow_multiclass = false;
  assert.match(characterRuleErrors(sheet(), rules).join(' '), /desativou a multiclasse/);
  assert.deepEqual(characterRuleErrors(sheet(), rules, sheet()), []);
});
test('new custom items and unauthorized rests are blocked while existing supplies and starting equipment remain editable', () => {
  const rules = {
    ...defaultRules('campaign'),
    players_can_create_custom_items: false,
    players_can_rest: false,
  };
  const old = { ...defaultSheet(), feature_uses: { 'fighter:second-wind': 1 } };
  assert.match(characterRuleErrors({ ...old, feature_uses: {} }, rules, old).join(' '), /descanso/);
  assert.deepEqual(characterRuleErrors({ ...old, feature_uses: {} }, rules, old, true), []);
  const item = {
    id: 'old',
    name: 'Relíquia',
    category: 'item' as const,
    quantity: 1,
    weight: 0,
    equipped: false,
    notes: '',
  };
  assert.deepEqual(
    characterRuleErrors({ ...old, inventory: [item] }, rules, { ...old, inventory: [item] }),
    [],
  );
  assert.match(
    characterRuleErrors({ ...old, inventory: [item] }, rules, old).join(' '),
    /personalizados/,
  );
  const initial = selectBackground(withCreation(defaultSheet(), newCreation()), 'noble');
  let id = 0;
  const equipped = applyStartingEquipment(initial, 0, () => `starter-${++id}`);
  assert.deepEqual(characterRuleErrors(equipped, rules, initial), []);
});
test('every workshop model and variant produces finite geometry and groups detailed parts into at most nine material draws', () => {
  for (const kind of [
    'house',
    'tavern',
    'forge',
    'stable',
    'wall',
    'floor',
    'stairs',
    'bed',
    'rug',
    'doorway',
    'fountain',
  ] as const) {
    for (const variant of ['default', ...(SCENERY_VARIANTS[kind] ?? []).map((v) => v.id)]) {
      const parts = workshopSceneryParts(kind, variant, 'original')!;
      assert.ok(parts.length > 0 && parts.length <= 9, `${kind}/${variant}`);
      for (const part of parts) {
        assert.ok(part.geometry.attributes.position.count > 0);
        assert.ok(Array.from(part.geometry.attributes.position.array).every(Number.isFinite));
        part.geometry.dispose();
        part.material.dispose();
      }
    }
  }
});
test('repeating 100 detailed houses shares the same draw count and retains object identity and style boundaries', () => {
  const object = (index: number, style = 'original') =>
    ({
      ...makeScenery(
        'map',
        { x: (index % 10) * 3, y: Math.floor(index / 10) * 3 },
        {
          kind: 'house',
          variant: 'timber',
          width: 3,
          height: 3,
          rotation: 0,
          blocks: true,
          cost: 1,
        },
      ),
      id: `house-${index}`,
      created_at: '',
      updated_at: '',
      metadata: { style, variant: 'timber' },
    }) as BattleMapObject;
  const one = new THREE.Group(),
    many = new THREE.Group();
  addSceneryMeshes(one, [object(0)]);
  addSceneryMeshes(
    many,
    Array.from({ length: 100 }, (_, i) => object(i)),
  );
  assert.equal(many.children.length, one.children.length);
  for (const child of many.children) {
    assert.equal((child as THREE.InstancedMesh).count, 100);
    assert.equal(child.userData.sceneryIds.length, 100);
  }
  const themed = new THREE.Group();
  addSceneryMeshes(themed, [object(0, 'coastal'), object(1, 'winter')]);
  assert.equal(themed.children.length, one.children.length * 2);
  assert.equal(SCENERY_STYLES.length, 7);
  assert.equal(new Set(SCENERY_GROUPS.flatMap((group) => [...group.kinds])).size, 46);
  for (const layer of [one, many, themed])
    for (const child of layer.children) {
      const mesh = child as THREE.InstancedMesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
});
test('interior floors and rugs stay below furniture and picking selects furniture even when the floor was placed last', () => {
  const object = (kind: 'table' | 'floor' | 'rug') =>
    ({
      ...makeScenery(
        'map',
        { x: 0, y: 0 },
        { kind, width: 1, height: 1, rotation: 0, blocks: false, cost: 1 },
      ),
      id: kind,
      created_at: '',
      updated_at: '',
    }) as BattleMapObject;
  const input = [object('table'), object('rug'), object('floor')];
  assert.deepEqual(
    sceneryStack(input).map((o) => o.id),
    ['floor', 'rug', 'table'],
  );
  assert.equal(sceneryAtCell(input, { x: 0, y: 0 })?.id, 'table');
  assert.deepEqual(
    input.map((o) => o.id),
    ['table', 'rug', 'floor'],
  );
});
