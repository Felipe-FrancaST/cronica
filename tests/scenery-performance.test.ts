import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SceneryMeshLayer } from '../src/features/vtt/scenery-mesh-layer';
import { ScenerySync, replaceSceneryRow } from '../src/features/vtt/scenery-sync';
import { previewSceneryState } from '../src/features/vtt/scenery-interactions';
import { createSceneryMovementCache } from '../src/features/vtt/scenery-movement-cache';
import { calculateMovementCost } from '../src/features/vtt/movement';
import type { BattleMapCell, BattleMapObject, BattleToken } from '../src/features/vtt/types';

const maps = new Set(['map']);
function object(id = 'torch', patch: Partial<BattleMapObject> = {}): BattleMapObject {
  return {
    id,
    map_id: 'map',
    object_type: 'torch',
    geometry: { x: 2, y: 2, width: 1, height: 1 },
    z: 0,
    visible: true,
    blocks_movement: false,
    blocks_vision: false,
    metadata: { light_enabled: true, name: 'Tocha' },
    created_at: '2026-10-14T12:00:00Z',
    updated_at: '2026-10-14T12:00:00.000001Z',
    ...patch,
  };
}
const off = (row: BattleMapObject) => previewSceneryState(row, 'light-off', []);

test('an optimistic interaction preserves unrelated objects and rejects only a duplicate of the same element', () => {
  const sync = new ScenerySync(),
    torch = object(),
    other = object('other');
  assert.equal(sync.begin(torch, off(torch)), true);
  assert.equal(sync.begin(torch, off(torch)), false);
  assert.equal(sync.begin(other, off(other)), true);
  assert.deepEqual(sync.pendingIds, new Set([torch.id, other.id]));
  const next = replaceSceneryRow([torch, other], torch.id, sync.row(torch.id)!);
  assert.equal(next[1], other);
  assert.equal(next[0].metadata.light_enabled, false);
  assert.equal(torch.metadata.light_enabled, true);
});

test('a poll that began before an interaction cannot overwrite its pending preview or acknowledged result', () => {
  const sync = new ScenerySync(),
    torch = object(),
    other = object('other');
  const before = sync.revision;
  sync.begin(torch, off(torch));
  assert.equal(sync.reconcile([torch, other], before, maps)[0].metadata.light_enabled, false);
  const confirmed = { ...off(torch), updated_at: '2026-10-14T12:00:01Z' };
  sync.commit(torch.id, confirmed);
  const result = sync.reconcile([torch, other], before, maps);
  assert.equal(result[0], confirmed);
  assert.equal(result[1], other);
  assert.equal(sync.pendingIds.size, 0);
});

test('an acknowledged deletion cannot be resurrected by an earlier poll', () => {
  const sync = new ScenerySync(),
    torch = object();
  const before = sync.revision;
  sync.begin(torch, null);
  sync.commit(torch.id, null);
  assert.deepEqual(sync.reconcile([torch], before, maps), []);
});

test('a fresh authorized read can remove an acknowledged object hidden by RLS', () => {
  const sync = new ScenerySync(),
    torch = object();
  sync.receive(torch.id, off(torch));
  assert.deepEqual(sync.reconcile([], sync.revision, maps), []);
  assert.equal(sync.row(torch.id), undefined);
});

test('a failed write restores the latest concurrent remote change, including PostgreSQL microseconds', () => {
  const sync = new ScenerySync(),
    torch = object();
  sync.begin(torch, off(torch));
  const remote = {
    ...torch,
    geometry: { ...torch.geometry, x: 6 },
    updated_at: '2026-10-14T12:00:00.000002Z',
  };
  assert.equal(sync.receive(torch.id, remote)?.metadata.light_enabled, false);
  assert.equal(sync.rollback(torch.id), remote);
});

test('a poll can update the rollback value without discarding the pending visual response', () => {
  const sync = new ScenerySync(),
    torch = object();
  sync.begin(torch, off(torch));
  const newer = { ...torch, visible: false, updated_at: '2026-10-14T12:00:01Z' };
  assert.equal(sync.reconcile([newer], sync.revision, maps)[0].metadata.light_enabled, false);
  assert.equal(sync.rollback(torch.id), newer);
});

test('an older RPC acknowledgement cannot undo a newer realtime row', () => {
  const sync = new ScenerySync(),
    torch = object();
  sync.begin(torch, off(torch));
  const latest = {
    ...off(torch),
    geometry: { ...torch.geometry, x: 7 },
    updated_at: '2026-10-14T12:00:02Z',
  };
  sync.receive(torch.id, latest);
  assert.equal(
    sync.commit(torch.id, { ...off(torch), updated_at: '2026-10-14T12:00:01Z' }),
    latest,
  );
  assert.equal(sync.receive(torch.id, torch), latest);
});

test('a remote deletion during a pending operation wins over its acknowledgement and rollback', () => {
  for (const success of [true, false]) {
    const sync = new ScenerySync(),
      torch = object();
    sync.begin(torch, off(torch));
    sync.receive(torch.id, null);
    assert.equal(success ? sync.commit(torch.id, off(torch)) : sync.rollback(torch.id), null);
    assert.deepEqual(sync.reconcile([torch], 0, maps), []);
  }
});

test('patches from a different map are never introduced into an authorized snapshot', () => {
  const sync = new ScenerySync(),
    torch = object();
  sync.receive(torch.id, torch);
  assert.deepEqual(sync.reconcile([], 0, new Set(['other-map'])), []);
});

test('an event older than an already loaded snapshot never regresses the element', () => {
  const sync = new ScenerySync(),
    torch = object();
  const loaded = { ...off(torch), updated_at: '2026-10-14T12:00:02Z' };
  assert.equal(sync.receive(torch.id, torch, loaded), loaded);
});

test('a read started before the local action may still contain a newer concurrent server change', () => {
  const sync = new ScenerySync(),
    torch = object();
  const started = sync.revision;
  sync.begin(torch, off(torch));
  sync.commit(torch.id, { ...off(torch), updated_at: '2026-10-14T12:00:01Z' });
  const remote = {
    ...torch,
    geometry: { ...torch.geometry, x: 7 },
    updated_at: '2026-10-14T12:00:02Z',
  };
  assert.equal(sync.reconcile([remote], started, maps)[0], remote);
});

test('master previews preserve contents metadata and correctly lock and unlock passages', () => {
  const door = object('door', {
    object_type: 'door',
    metadata: { variant: 'iron-open', has_key: true, interaction_locked: false, has_loot: true },
  });
  const locked = previewSceneryState(door, 'lock', []);
  assert.equal(locked.blocks_movement, true);
  assert.equal(locked.blocks_vision, true);
  assert.deepEqual(locked.metadata, {
    variant: 'iron',
    has_key: true,
    interaction_locked: true,
    has_loot: true,
  });
  const opened = previewSceneryState(locked, 'iron-open', []);
  assert.equal(opened.blocks_movement, false);
  assert.equal(opened.metadata.interaction_locked, false);
  assert.equal(opened.metadata.has_loot, true);
  assert.equal(door.metadata.variant, 'iron-open');
});

test('a passage occupied by a token does not flash closed while validation is pending', () => {
  const door = object('door', { object_type: 'door', metadata: { variant: 'open' } });
  const occupant = { map_id: 'map', x: 2, y: 2, size: 1 } as BattleToken;
  assert.equal(previewSceneryState(door, 'default', [occupant]), door);
  assert.equal(previewSceneryState(door, 'default', [{ ...occupant, x: 4 }]).blocks_movement, true);
});

test('changing light, labels, visibility and timestamps reuses the obstacle grid and path context inputs', () => {
  const cache = createSceneryMovementCache();
  const cells: BattleMapCell[] = [];
  const torch = object(),
    wall = object('wall', { object_type: 'wall', blocks_movement: true });
  const first = cache(cells, [torch, wall]);
  assert.equal(cache(cells, [off(torch), wall]), first);
  assert.equal(
    cache(cells, [
      { ...torch, visible: false },
      { ...wall, updated_at: '2026-10-14T13:00:00Z', metadata: { name: 'Muralha' } },
    ]),
    first,
  );
  assert.notEqual(cache([...cells], [torch, wall]), first);
});

test('opening a door, moving an obstacle and changing a cost invalidate cached paths', () => {
  const cache = createSceneryMovementCache(),
    cells: BattleMapCell[] = [];
  const door = object('door', {
    object_type: 'door',
    blocks_movement: true,
    metadata: { variant: 'default' },
  });
  const closed = cache(cells, [door]);
  const route = (terrain: BattleMapCell[]) =>
    calculateMovementCost({
      from: { x: 1, y: 2 },
      to: { x: 2, y: 2 },
      width: 8,
      height: 8,
      cells: terrain,
      tokens: [],
      rules: { diagonalRule: 'one' },
    });
  assert.equal(route(closed).allowed, false);
  const open = cache(cells, [previewSceneryState(door, 'open', [])]);
  assert.notEqual(open, closed);
  assert.equal(route(open).allowed, true);
  const moved = cache(cells, [{ ...door, geometry: { ...door.geometry, x: 5 } }]);
  assert.notEqual(moved, open);
  assert.equal(route(moved).allowed, true);
  const slow = cache(cells, [
    object('rug', { object_type: 'rug', metadata: { movement_cost: 3 } }),
  ]);
  assert.equal(route(slow).cost, 3);
  const faster = cache(cells, [
    object('rug', { object_type: 'rug', metadata: { movement_cost: 2 } }),
  ]);
  assert.notEqual(faster, slow);
  assert.equal(route(faster).cost, 2);
});

test('opening one door retains meshes for other doors in distant regions and frees the replaced buffers', () => {
  const root = new THREE.Group(),
    layer = new SceneryMeshLayer(root, { value: 0 });
  const near = object('near', { object_type: 'door', metadata: { variant: 'default' } });
  const far = { ...near, id: 'far', geometry: { x: 18, y: 2, width: 1, height: 1 } };
  const opened = previewSceneryState(near, 'open', []);
  try {
    layer.update([near, far], 1.5);
    const untouched = root.children.find((g) => g.name.endsWith(':region:2:0'))!;
    const changed = root.children.find((g) => g.name.endsWith(':region:0:0'))!;
    assert.ok(untouched);
    let disposed = 0;
    changed.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) node.addEventListener('dispose', () => disposed++);
    });
    layer.update([opened, far], 1.5);
    assert.equal(root.children.includes(untouched), true);
    assert.equal(root.children.includes(changed), false);
    assert.ok(disposed > 0);
    assert.equal(layer.update([far, opened], 1.5), false);
  } finally {
    layer.dispose();
  }
  assert.equal(root.children.length, 0);
});
