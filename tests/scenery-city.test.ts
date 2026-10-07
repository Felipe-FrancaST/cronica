import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SCENERY,
  SCENERY_VARIANTS,
  scenerySize,
  sceneryRect,
  sceneryPreview,
  sceneryMovementCells,
  makeScenery,
} from '../src/features/vtt/scenery';
import {
  MAX_SCENERY_SIZE,
  sceneryHeightMetres,
  mapCellMetres,
} from '../src/features/vtt/scenery-dimensions';
import {
  MEDIEVAL_CITY,
  medievalCityPreview,
  medievalCityObjects,
} from '../src/features/vtt/medieval-city';
import { sceneryModelParts, addSceneryMeshes } from '../src/features/vtt/scenery-meshes';
import { partBounds } from '../src/features/vtt/scenery-model-utils';
import type { BattleMapObject } from '../src/features/vtt/types';

test('all scenery defaults fit the 1.5m grid; large variants have distinct useful footprints', () => {
  for (const def of SCENERY)
    for (const variant of ['default', ...(SCENERY_VARIANTS[def.id] ?? []).map((v) => v.id)]) {
      const size = scenerySize(def.id, variant);
      assert.ok(
        [size.width, size.height].every(
          (n) => Number.isInteger(n) && n >= 1 && n <= MAX_SCENERY_SIZE,
        ),
      );
      assert.ok(sceneryHeightMetres(def.id, variant, size.width, size.height) > 0);
    }
  assert.deepEqual(scenerySize('mountain'), { width: 32, height: 28 });
  assert.deepEqual(scenerySize('house'), { width: 6, height: 5 });
  assert.ok(scenerySize('boat', 'ship').height > scenerySize('boat').height);
  assert.ok(scenerySize('house', 'manor').width > scenerySize('house', 'cottage').width);
  assert.equal(mapCellMetres({ scale_per_cell: 5, scale_unit: 'ft' }), 1.5);
});

test('128-cell elements stay valid, oversized or fractional footprints are rejected and large hover previews remain bounded', () => {
  const brush = {
    kind: 'mountain' as const,
    width: 128,
    height: 128,
    rotation: 0,
    blocks: true,
    cost: 1,
  };
  const object = {
    ...makeScenery('map', { x: 0, y: 0 }, brush),
    id: 'mountain',
    created_at: '',
    updated_at: '',
  };
  assert.ok(sceneryRect(object));
  for (const width of [0, 129, 1.5, Infinity])
    assert.equal(sceneryRect({ ...object, geometry: { ...object.geometry, width } }), null);
  const preview = sceneryPreview({ width: 128, height: 128 }, { x: 0, y: 0 }, brush)!;
  assert.equal(preview.valid, true);
  assert.ok(preview.cells.length <= 512);
  assert.equal(sceneryPreview({ width: 128, height: 128 }, { x: 1, y: 0 }, brush)?.valid, false);
  assert.equal(sceneryPreview({ width: 128, height: 128 }, { x: -1, y: 0 }, brush)?.valid, false);
  assert.equal(
    sceneryPreview({ width: 128, height: 128 }, { x: 0, y: 0 }, { ...brush, width: 129 })?.valid,
    false,
  );
  assert.equal(sceneryHeightMetres('mountain', 'default', 64, 56), 76);
  assert.equal(sceneryHeightMetres('mountain', 'default', 64, 56, 95), 95);
  assert.equal(sceneryHeightMetres('crops', 'corn', 32, 32), 2.2);
});

test('Valedouro is deterministic, entirely inside the board and contains the city districts and rural belt', () => {
  const objects = medievalCityPreview();
  assert.deepEqual(medievalCityObjects(), medievalCityObjects());
  assert.ok(objects.length > 150 && objects.length < 600);
  for (const object of objects) {
    const r = sceneryRect(object);
    assert.ok(r, object.metadata.name as string);
    assert.ok(r.x + r.width <= MEDIEVAL_CITY.width && r.y + r.height <= MEDIEVAL_CITY.height);
  }
  assert.equal(objects.filter((o) => o.object_type === 'doorway').length, 4);
  assert.ok(
    objects.filter((o) => o.object_type === 'house' && o.metadata.variant !== 'tower').length >= 20,
  );
  for (const kind of [
    'tavern',
    'market',
    'forge',
    'stable',
    'well',
    'fountain',
    'crops',
    'bridge',
    'water',
  ])
    assert.ok(objects.some((o) => o.object_type === kind));
});

test('city streets connect every house and shop entrance without blocking the bridge or gates', () => {
  const objects = medievalCityPreview(),
    blocked = new Set(
      sceneryMovementCells([], objects)
        .filter((c) => c.blocked)
        .map((c) => `${c.x}:${c.y}`),
    );
  const walkways = new Set<string>();
  for (const object of objects.filter((o) =>
    ['road', 'floor', 'bridge', 'doorway'].includes(o.object_type),
  )) {
    const r = sceneryRect(object)!;
    for (let x = r.x; x < r.x + r.width; x++)
      for (let y = r.y; y < r.y + r.height; y++)
        if (!blocked.has(`${x}:${y}`)) walkways.add(`${x}:${y}`);
  }
  const connected = new Set(['0:51']),
    queue: [number, number][] = [[0, 51]];
  for (let n = 0; n < queue.length; n++) {
    const [x, y] = queue[n];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const key = `${x + dx}:${y + dy}`;
      if (walkways.has(key) && !connected.has(key)) {
        connected.add(key);
        queue.push([x + dx, y + dy]);
      }
    }
  }
  for (const object of objects.filter(
    (o) =>
      ['house', 'tavern', 'forge', 'stable'].includes(o.object_type) &&
      o.metadata.variant !== 'tower',
  )) {
    const r = sceneryRect(object)!,
      angle = r.rotation;
    const x =
      angle === 90 ? r.x + r.width : angle === 270 ? r.x - 1 : r.x + Math.floor(r.width / 2);
    const y =
      angle === 180
        ? r.y - 1
        : angle === 90 || angle === 270
          ? r.y + Math.floor(r.height / 2)
          : r.y + r.height;
    assert.ok(
      connected.has(`${x}:${y}`),
      `Entrada inacessível: ${object.metadata.name}, ${x}:${y}`,
    );
  }
  for (const point of ['9:51', '20:51', '97:51', '58:16', '58:87'])
    assert.ok(connected.has(point), point);
  const bridgeCells = sceneryMovementCells([], objects).filter(
    (c) => c.x >= 8 && c.x < 12 && c.y >= 49 && c.y < 55,
  );
  assert.ok(bridgeCells.every((c) => !c.blocked && c.movement_cost === 1));
  const buildings = objects.filter(
    (o) =>
      ['house', 'tavern', 'forge', 'stable'].includes(o.object_type) &&
      o.metadata.variant !== 'tower',
  );
  for (const building of buildings)
    for (const tree of objects.filter((o) => ['tree', 'pine'].includes(o.object_type))) {
      const a = sceneryRect(building)!,
        b = sceneryRect(tree)!;
      assert.ok(
        !(
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y
        ),
        `Árvore atravessa ${building.metadata.name}`,
      );
    }
});

// Geometry tests need a canvas-shaped surface for procedural textures; pixels
// and the actual browser render are checked separately in Playwright.
function canvasStub() {
  const gradient = { addColorStop() {} };
  const context = new Proxy(
    { createLinearGradient: () => gradient, createRadialGradient: () => gradient },
    { get: (obj, key) => Reflect.get(obj, key) ?? (() => {}) },
  );
  return { width: 128, height: 128, getContext: () => context };
}
function dispose(parts: ReturnType<typeof sceneryModelParts>) {
  for (const p of parts) {
    p.geometry.dispose();
    p.material.map?.dispose();
    p.material.dispose();
  }
}

test('all 46 models and 95 variants have finite detailed geometry contained in their movement footprint', () => {
  const prior = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: canvasStub },
  });
  try {
    for (const def of SCENERY)
      for (const variant of ['default', ...(SCENERY_VARIANTS[def.id] ?? []).map((v) => v.id)]) {
        const parts = sceneryModelParts(def.id, variant);
        assert.ok(
          parts.length > 0 && parts.length <= 20,
          `${def.id}/${variant}: ${parts.length} materiais`,
        );
        const bounds = partBounds(parts);
        assert.ok(
          bounds.min.x >= -0.491 &&
            bounds.max.x <= 0.491 &&
            bounds.min.z >= -0.491 &&
            bounds.max.z <= 0.491,
          `${def.id}/${variant}`,
        );
        for (const p of parts)
          assert.ok(
            Array.from(p.geometry.attributes.position.array).every(Number.isFinite),
            `${def.id}/${variant}`,
          );
        if (def.id === 'mountain')
          assert.ok(
            parts.some((p) => p.geometry.attributes.color && p.material.vertexColors),
            'O relevo deve manter seus tons e faixas de neve.',
          );
        dispose(parts);
      }
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: prior });
  }
});

test('large mountains have their physical height and arbitrary rotations keep the model inside its footprint', () => {
  const object = {
    ...makeScenery(
      'map',
      { x: 4, y: 5 },
      {
        kind: 'mountain',
        width: 64,
        height: 56,
        rotation: 45,
        heightMetres: 95,
        blocks: true,
        cost: 1,
      },
    ),
    id: 'm',
    created_at: '',
    updated_at: '',
  } as BattleMapObject;
  const layer = new THREE.Group();
  addSceneryMeshes(layer, [object]);
  const bounds = new THREE.Box3().setFromObject(layer);
  assert.ok(
    bounds.max.x <= 68.01 && bounds.min.x >= 3.99 && bounds.max.z <= 61.01 && bounds.min.z >= 4.99,
  );
  assert.ok(Math.abs(bounds.max.y - (95 / 1.5 + 0.035)) < 0.01);
  for (const child of layer.children) {
    const mesh = child as THREE.InstancedMesh;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.dispose();
  }
});
