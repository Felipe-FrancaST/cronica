import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TacticalSceneEngine } from '../src/features/vtt/scene-engine';
import { SceneryLightLayer } from '../src/features/vtt/scenery-light-layer';
import { disposeSceneObject } from '../src/features/vtt/scene-resources';
import type { SceneryLight } from '../src/features/vtt/scenery-lighting';
import type { BattleMap, BattleToken } from '../src/features/vtt/types';

function token(id = 'hero', size = 1): BattleToken {
  return {
    id,
    name: 'Guardião',
    size,
    x: 3,
    y: 4,
    z: 0,
    visible: true,
    faction: 'ally',
  } as BattleToken;
}

function sceneFixture(t: TestContext) {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const images: object[] = [];
  const gradient = { addColorStop() {} };
  const context = new Proxy(
    {
      measureText: () => ({ width: 100 }),
      createRadialGradient: () => gradient,
    },
    { get: (obj, key) => Reflect.get(obj, key) ?? (() => {}) },
  );
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({ width: 256, height: 256, getContext: () => context }),
    },
  });
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    value: class {
      constructor() {
        images.push(this);
      }
    },
  });
  t.after(() => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: previousImage });
  });
  // Exercise real meshes, materials and update methods without a GPU renderer.
  const engine = Object.create(TacticalSceneEngine.prototype) as TacticalSceneEngine;
  const animations = new Map<string, { to: THREE.Vector3; started: number }>();
  const layer = new THREE.Group();
  Object.assign(engine, {
    renderer: { shadowMap: {}, capabilities: { getMaxAnisotropy: () => 4 } },
    tokens: new Map(),
    animations,
    tokenLayer: layer,
    pendingImages: new Set(),
    motionQuery: { matches: false },
    invalidate() {},
  });
  t.after(() => disposeSceneObject(layer));
  return { engine, images, animations, layer };
}

test('selection and turn changes preserve the miniature and loaded portrait', (t) => {
  const { engine, images } = sceneFixture(t);
  const hero = { ...token(), image: 'characters/hero.png' };
  engine.setTokens([hero], { hero: 'portrait.png' }, null, null);
  const miniature = engine.getTokenGroup(hero.id)!;
  for (let i = 0; i < 8; i++)
    engine.setTokens([hero], { hero: 'portrait.png' }, i % 2 ? hero.id : null, hero.id);
  assert.equal(engine.getTokenGroup(hero.id), miniature);
  assert.equal(images.length, 1, 'Selecting a token must not reload its image');
  engine.setTokens([hero], { hero: 'portrait-renewed.png' }, null, hero.id);
  assert.equal(engine.getTokenGroup(hero.id), miniature);
  assert.equal(images.length, 1, 'Renewing the signed URL must preserve the bitmap');
  assert.equal(miniature.getObjectByName('token-selection')?.visible, true);
  engine.setTokens([hero], { hero: 'portrait.png' }, null, null);
  assert.equal(miniature.getObjectByName('token-selection')?.visible, false);
});

test('a renewed map image URL preserves the loaded floor but real settings rebuild it', (t) => {
  const { engine, images } = sceneFixture(t);
  const map = {
    id: 'map',
    width: 16,
    height: 12,
    cell_size: 64,
    scale_per_cell: 1.5,
    scale_unit: 'm',
    grid_visible: true,
    grid_opacity: 0.3,
    background_scale: 1,
    background_offset_x: 0,
    background_offset_y: 0,
    background_image: 'battle_maps/map.png',
  } as BattleMap;
  const board = new THREE.Group();
  Object.assign(engine, {
    map,
    board,
    lighting: 'day',
    light: new THREE.DirectionalLight(),
    controls: {},
    boardRevision: 0,
  });
  t.after(() => disposeSceneObject(board));
  engine.setBoard(map, 'map-signed.png');
  const image = images[0] as HTMLImageElement;
  image.onload?.call(image, new Event('load'));
  const floor = board.children[1];
  engine.setBoard(map, 'map-renewed.png');
  assert.equal(board.children[1], floor);
  assert.equal(images.length, 1);
  engine.setBoard({ ...map, grid_opacity: 0.6 }, 'map-renewed.png');
  assert.notEqual(board.children[1], floor);
  assert.equal(images.length, 2);
});

test('large token selection fits its footprint and polling does not restart a move', (t) => {
  const { engine, animations } = sceneFixture(t);
  const hero = token('hero', 2);
  engine.setTokens([hero], {}, hero.id, null);
  const ring = engine.getTokenGroup(hero.id)!.getObjectByName('token-selection') as THREE.Mesh;
  ring.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(ring);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).x - hero.size) < 0.01);
  const moving = { ...hero, x: 5 };
  engine.setTokens([moving], {}, hero.id, null);
  const animation = animations.get(hero.id)!;
  engine.setTokens([moving], {}, null, hero.id);
  assert.equal(animations.get(hero.id), animation);
  engine.setTokens([], {}, null, null);
  assert.equal(animations.size, 0);
});

test('removing a layer releases instance buffers and shared GPU resources once', () => {
  const layer = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const counts = { geometry: 0, texture: 0, material: 0, instances: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  texture.addEventListener('dispose', () => counts.texture++);
  material.addEventListener('dispose', () => counts.material++);
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.InstancedMesh(geometry, material, 50);
    mesh.addEventListener('dispose', () => counts.instances++);
    layer.add(mesh);
  }
  disposeSceneObject(layer);
  assert.deepEqual(counts, { geometry: 1, texture: 1, material: 1, instances: 2 });
  assert.equal(layer.children.length, 0);
});

function light(id: string, x: number): SceneryLight {
  return { id, x, y: 0, height: 1, radius: 100, strength: 1, color: '#ffd197' };
}
function camera(x = 0) {
  const camera = new THREE.PerspectiveCamera(42, 1.5, 0.05, 5000);
  camera.position.set(x, 10, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

test('small camera movements retain the same lights at the pool boundary', () => {
  const scene = new THREE.Scene();
  const layer = new SceneryLightLayer(scene);
  const sources = Array.from({ length: 17 }, (_, i) => light(String(i), i - 8));
  layer.rebuild(20, 20, 'day', sources);
  layer.update(camera(-0.01), 1000, true);
  const pool = layer.group.children.filter(
    (o): o is THREE.PointLight => o instanceof THREE.PointLight,
  );
  const positions = pool.map((light) => light.position.x);
  for (let i = 1; i <= 8; i++) layer.update(camera(i % 2 ? 0.01 : -0.01), 1000 + i * 16, true);
  assert.deepEqual(
    pool.map((light) => light.position.x),
    positions,
  );
  layer.rebuild(20, 20, 'day', []);
  layer.update(camera(), 1200, true);
  assert.ok(pool.every((light) => light.visible && light.intensity === 0));
  layer.setQuality(true);
  layer.rebuild(20, 20, 'day', sources);
  layer.update(camera(), 1400, true);
  assert.equal(pool.filter((light) => light.intensity > 0).length, 8);
  disposeSceneObject(layer.group);
});

test('a light fades before changing position and settles without an endless render loop', () => {
  const layer = new SceneryLightLayer(new THREE.Scene());
  const view = camera();
  layer.rebuild(20, 20, 'day', [light('old', 2)]);
  layer.update(view, 1000, true);
  const lamp = layer.group.children[0] as THREE.PointLight;
  const peakIntensity = lamp.intensity;
  layer.rebuild(20, 20, 'day', [light('new', 9)]);
  assert.equal(layer.update(view, 1016), true);
  assert.equal(lamp.position.x, 2);
  assert.ok(lamp.intensity > 0 && lamp.intensity < peakIntensity);
  let changing = true;
  for (let i = 2; i < 150 && changing; i++) changing = layer.update(view, 1000 + i * 16);
  assert.equal(changing, false);
  assert.equal(lamp.position.x, 9);
  assert.equal(lamp.intensity, peakIntensity);
  disposeSceneObject(layer.group);
});
