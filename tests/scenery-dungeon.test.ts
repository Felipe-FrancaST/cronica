import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SCENERY,
  SCENERY_GROUPS,
  sceneryDefaults,
  makeScenery,
  sceneryInteraction,
  sceneryMovementCells,
  sceneryMatches,
} from '../src/features/vtt/scenery';
import { changeSceneryState } from '../src/features/vtt/scenery-interactions';
import { SceneryMeshLayer } from '../src/features/vtt/scenery-mesh-layer';
import { automaticSceneryLight } from '../src/features/vtt/scenery-lighting';
import type { BattleMapObject } from '../src/features/vtt/types';
import { TacticalSceneEngine } from '../src/features/vtt/scene-engine';
import { disposeSceneObject } from '../src/features/vtt/scene-resources';

function object(
  kind: 'door' | 'portcullis' | 'cage' | 'chest' | 'lever' | 'pillar' | 'treasure',
  id = kind,
  variant = 'default',
): BattleMapObject {
  return {
    ...makeScenery(
      'map',
      { x: 3, y: 4 },
      { kind, variant, width: 1, height: 1, rotation: 0, ...sceneryDefaults(kind, variant) },
    ),
    id,
    created_at: '',
    updated_at: '',
  };
}

test('dungeon pieces are discoverable and every element belongs to a workshop category', () => {
  assert.equal(SCENERY.length, 62);
  assert.equal(new Set(SCENERY.map((s) => s.id)).size, SCENERY.length);
  for (const s of SCENERY)
    assert.ok(
      SCENERY_GROUPS.some((g) => (g.kinds as readonly string[]).includes(s.id)),
      s.id,
    );
  assert.equal(sceneryMatches('door', 'ferro aberta'), true);
  assert.equal(sceneryMatches('magiccircle', 'circulo'), true);
});

test('movement, sight and interactive state have independent semantics', () => {
  assert.deepEqual(sceneryDefaults('wall', 'low'), { blocks: true, blocksVision: false, cost: 1 });
  assert.equal(sceneryDefaults('table').blocksVision, false);
  assert.equal(sceneryDefaults('portcullis').blocksVision, false);
  const door = object('door');
  assert.equal(sceneryMovementCells([], [door])[0].blocked, true);
  const opened = changeSceneryState(door, 'open');
  assert.equal(opened.blocks_movement, false);
  assert.equal(opened.blocks_vision, false);
  assert.deepEqual(sceneryMovementCells([], [opened]), []);
  assert.equal(sceneryInteraction(opened)?.label, 'Fechar porta');
  assert.equal(changeSceneryState(opened, 'default').blocks_vision, true);
  assert.equal(sceneryDefaults('web').cost, 2);
  assert.equal(sceneryDefaults('trap', 'disarmed').cost, 1);
  assert.equal(automaticSceneryLight('magiccircle', 'spent'), null);
  assert.ok(automaticSceneryLight('magiccircle', 'summoning'));
});

test('state changes preserve custom settings and cannot replace a reinforced door with a different style', () => {
  const door = {
    ...object('door', 'door', 'iron'),
    metadata: {
      variant: 'iron',
      movement_cost: 3,
      name: 'Cripta',
      color: '#887766',
      style: 'gothic',
    },
  };
  const opened = changeSceneryState(door, 'iron-open');
  assert.deepEqual(opened.geometry, door.geometry);
  assert.deepEqual(opened.metadata, { ...door.metadata, variant: 'iron-open' });
  assert.throws(() => changeSceneryState(door, 'open'), /interação/);
  assert.throws(() => changeSceneryState(object('pillar'), 'broken'), /interação/);
  const chest = { ...object('chest'), blocks_vision: true, blocks_movement: false };
  assert.equal(changeSceneryState(chest, 'open').blocks_vision, true);
  assert.equal(changeSceneryState(chest, 'open').blocks_movement, false);
});

test('realtime refreshes keep unchanged meshes and editing one family preserves all other batches', () => {
  const root = new THREE.Group(),
    layer = new SceneryMeshLayer(root, { value: 0 });
  try {
    const door = object('door'),
      pillar = object('pillar');
    assert.equal(layer.update([door, pillar], 1.5), true);
    const untouched = root.children.find((g) => g.name.includes('pillar:'))!;
    const originalDoor = root.children.find((g) => g.name.includes('door:'))!;
    let freed = 0;
    originalDoor.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.addEventListener('dispose', () => freed++);
    });
    for (let i = 0; i < 30; i++)
      assert.equal(
        layer.update(
          [
            { ...pillar, updated_at: 'new' },
            { ...door, metadata: { ...door.metadata, name: 'Nova porta' } },
          ],
          1.5,
        ),
        false,
      );
    assert.equal(layer.update([changeSceneryState(door, 'open'), pillar], 1.5), true);
    assert.equal(root.children.includes(untouched), true);
    assert.equal(root.children.includes(originalDoor), false);
    assert.ok(freed > 0, 'Removed instance buffers must be disposed');
    assert.equal(layer.update([pillar], 1.5), true);
    assert.equal(root.children.length, 1);
    assert.equal(layer.update([pillar], 3), true, 'Changing physical scale changes model heights');
  } finally {
    layer.dispose();
  }
  assert.equal(root.children.length, 0);
});

test('pointer previews preserve reachable instances and do not invalidate scene clipping', () => {
  const engine = Object.create(TacticalSceneEngine.prototype) as TacticalSceneEngine;
  const overlay = new THREE.Group(),
    reachableOverlay = new THREE.Group();
  const internal = {
    overlay,
    reachableOverlay,
    reachableKey: '',
    boundsDirty: false,
    board: new THREE.Group(),
    terrain: new THREE.Group(),
    scenery: new THREE.Group(),
    tokenLayer: new THREE.Group(),
    invalidate() {},
  };
  Object.assign(engine, internal);
  try {
    const reachable = new Map([
      ['2:3', 1],
      ['3:3', 2],
    ]);
    engine.setOverlay(reachable, null, null, { x: 2, y: 3 });
    const instance = reachableOverlay.children[0];
    for (let i = 0; i < 50; i++)
      engine.setOverlay(new Map(reachable), null, null, { x: i % 8, y: 4 });
    assert.equal(reachableOverlay.children[0], instance);
    assert.equal((engine as unknown as typeof internal).boundsDirty, false);
    engine.setOverlay(new Map(), null, null, null);
    assert.equal(reachableOverlay.children.length, 0);
  } finally {
    disposeSceneObject(overlay);
    disposeSceneObject(reachableOverlay);
  }
});
