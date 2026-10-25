import test from 'node:test';
import assert from 'node:assert/strict';
import { shareWorkspace } from '../src/lib/workspace-snapshot';
import { ResourceCache } from '../src/lib/resource-cache';
import { createDemoWorkspace } from '../src/lib/demo-data';
import { createSightTest, traceSightRay } from '../src/features/vtt/vision-rays';
import { createVisionComputer } from '../src/features/vtt/vision-cache';
import type {
  BattleMap,
  BattleMapCell,
  BattleMapObject,
  BattleToken,
} from '../src/features/vtt/types';

test('unchanged workspace results reuse the data, sheets and profiles even when object keys are reordered', () => {
  const previous = createDemoWorkspace(),
    next = structuredClone(previous);
  next.characters[0].sheet.abilities = Object.fromEntries(
    Object.entries(next.characters[0].sheet.abilities).reverse(),
  ) as (typeof next.characters)[0]['sheet']['abilities'];
  assert.equal(shareWorkspace(previous, next), previous);
});

test('a changed nested sheet is published without recreating unrelated sheets or relying on updated_at', () => {
  const previous = createDemoWorkspace(),
    next = structuredClone(previous);
  next.characters[0].sheet.hp_current--;
  const shared = shareWorkspace(previous, next);
  assert.notEqual(shared, previous);
  assert.equal(shared.characters[0].sheet.hp_current, next.characters[0].sheet.hp_current);
  assert.notEqual(shared.characters[0], previous.characters[0]);
  assert.equal(shared.characters[1], previous.characters[1]);
  assert.equal(shared.npcs, previous.npcs);
  assert.equal(shared.world, previous.world);
});

test('workspace reconciliation removes records no longer returned by RLS and preserves the new order', () => {
  const previous = createDemoWorkspace(),
    next = structuredClone(previous);
  next.world = [];
  next.characters = next.characters.slice(1).reverse();
  const result = shareWorkspace(previous, next);
  assert.deepEqual(result.world, []);
  assert.deepEqual(
    result.characters.map((c) => c.id),
    next.characters.map((c) => c.id),
  );
  assert.ok(!result.characters.some((c) => c.id === previous.characters[0].id));
});

test('indexed visibility preserves exact wall and corner rays for every pair on sparse and dense grids', () => {
  const width = 9,
    height = 7;
  let seed = 9371;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (const density of [0, 0.02, 0.1, 0.45, 1]) {
    const blocks = Uint8Array.from({ length: width * height }, () => (random() < density ? 1 : 0));
    const visible = createSightTest(blocks, width, height);
    for (let from = 0; from < blocks.length; from++)
      for (let to = 0; to < blocks.length; to++) {
        const sx = from % width,
          sy = Math.floor(from / width),
          tx = to % width,
          ty = Math.floor(to / width);
        assert.equal(
          visible(sx, sy, tx, ty),
          traceSightRay(blocks, width, height, sx, sy, tx, ty),
          `density ${density}: ${sx},${sy} to ${tx},${ty}`,
        );
      }
  }
});

test('nonvisual combat updates reuse sight while movement, lights and walls invalidate it', () => {
  const computer = createVisionComputer();
  const map = {
    id: 'map',
    width: 40,
    height: 20,
    vision_enabled: true,
    lighting: 'night',
    darkness_level: 'dark',
    scale_unit: 'm',
    scale_per_cell: 1.5,
  } as BattleMap;
  const cells: BattleMapCell[] = [],
    objects: BattleMapObject[] = [],
    fog: [] = [];
  const eyes = [{ x: 5.5, y: 5.5, darkvision: 18, devilSight: 0, trueSight: 0 }];
  const initial = computer.compute(map, cells, objects, fog, [], eyes);
  assert.equal(
    computer.compute(
      { ...map, updated_at: 'new', grid_opacity: 0.8 },
      cells,
      objects,
      fog,
      [],
      structuredClone(eyes),
    ),
    initial,
  );
  assert.notEqual(
    computer.compute(map, cells, objects, fog, [], [{ ...eyes[0], x: 6.5 }]),
    initial,
  );
  const bright = computer.compute(
    map,
    cells,
    objects,
    fog,
    [
      {
        id: 'torch',
        x: 30.5,
        y: 5.5,
        height: 1,
        radius: 4,
        brightRadius: 2,
        color: '#fff',
        strength: 1,
      },
    ],
    eyes,
  );
  assert.equal(bright.visible[5 * map.width + 30], 1);
  const dark = computer.compute(map, cells, objects, fog, [], eyes);
  assert.equal(dark.visible[5 * map.width + 30], 0);
  const walls = Array.from({ length: 20 }, (_, y) => ({
    x: 7,
    y,
    blocked: true,
  })) as BattleMapCell[];
  const blocked = computer.compute(map, walls, objects, fog, [], eyes);
  assert.equal(blocked.visible[5 * map.width + 9], 0);
});

test('an invisible creature updates independently of cached terrain and each map user has a private cache', () => {
  const computer = createVisionComputer(),
    other = createVisionComputer();
  const map = {
    id: 'map',
    width: 10,
    height: 10,
    vision_enabled: true,
    lighting: 'day',
    scale_unit: 'm',
    scale_per_cell: 1.5,
  } as BattleMap;
  const eyes = [{ x: 2.5, y: 2.5, darkvision: 0, devilSight: 0, trueSight: 0 }];
  const base = computer.compute(map, [], [], [], [], eyes);
  const tokens = [{ id: 'enemy', x: 4, y: 2, size: 1 }] as BattleToken[];
  const initial = computer.creatures(base, tokens, {}, []);
  assert.equal(computer.creatures(base, structuredClone(tokens), {}, []), initial);
  const invisible = computer.creatures(base, tokens, { enemy: ['Invisível'] }, []);
  assert.deepEqual(invisible.hiddenTokenIds, ['enemy']);
  assert.equal(invisible.visible, initial.visible);
  assert.notEqual(invisible, initial);
  assert.deepEqual(computer.creatures(base, tokens, {}, []).hiddenTokenIds, []);
  assert.notEqual(other.compute(map, [], [], [], [], eyes).visible, base.visible);
});

test('concurrent image consumers share one request and expired entries are refreshed', async () => {
  let time = 0,
    requests = 0;
  const cache = new ResourceCache<string>(100, 3, Boolean, () => time);
  const load = async () => `image-${++requests}`;
  assert.deepEqual(
    await Promise.all(Array.from({ length: 100 }, () => cache.get('image', load))),
    Array(100).fill('image-1'),
  );
  time = 99;
  assert.equal(await cache.get('image', load), 'image-1');
  time = 100;
  assert.equal(await cache.get('image', load), 'image-2');
  assert.equal(requests, 2);
});

test('failed image requests can retry and LRU eviction keeps memory bounded', async () => {
  let requests = 0;
  const cache = new ResourceCache<string | null>(100, 2, Boolean);
  await assert.rejects(
    cache.get('a', async () => {
      throw new Error('offline');
    }),
    /offline/,
  );
  assert.equal(await cache.get('a', async () => null), null);
  const load = async () => String(++requests);
  await cache.get('a', load);
  await cache.get('b', load);
  await cache.get('a', load); // a is recently used; b must be evicted next.
  await cache.get('c', load);
  await cache.get('b', load);
  assert.equal(requests, 4);
});

test('clearing an image cache fences a pending result from the next session', async () => {
  let finish!: (value: string) => void;
  const cache = new ResourceCache<string>(100, 2);
  const old = cache.get(
    'image',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  cache.clear();
  assert.equal(await cache.get('image', async () => 'new session'), 'new session');
  finish('old session');
  await old;
  assert.equal(await cache.get('image', async () => 'unexpected request'), 'new session');
});

test('signed URLs are coalesced and a user change cannot reveal the previous user response', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54329';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'runtime-test-key';
  const { getSupabase } = await import('../src/lib/supabase/client');
  const { resolveImage, setMediaIdentity } = await import('../src/services/storage');
  const storage = getSupabase().storage;
  const original = storage.from;
  let finish!: (value: { data: { signedUrl: string }; error: null }) => void;
  let requests = 0;
  const response = new Promise<{ data: { signedUrl: string }; error: null }>((resolve) => {
    finish = resolve;
  });
  storage.from = (() => ({
    createSignedUrl: () => {
      requests++;
      return requests === 1
        ? response
        : Promise.resolve({ data: { signedUrl: 'new-session-url' }, error: null });
    },
  })) as unknown as typeof storage.from;
  try {
    setMediaIdentity('first-user');
    const old = Array.from({ length: 20 }, () =>
      resolveImage('characters/hero/portrait.webp', false),
    );
    await Promise.resolve();
    assert.equal(requests, 1);
    setMediaIdentity('second-user');
    assert.equal(await resolveImage('characters/hero/portrait.webp', false), 'new-session-url');
    finish({ data: { signedUrl: 'private-old-url' }, error: null });
    assert.deepEqual(await Promise.all(old), Array(20).fill(null));
    assert.equal(await resolveImage('characters/hero/portrait.webp', false), 'new-session-url');
    assert.equal(requests, 2);
  } finally {
    storage.from = original;
    setMediaIdentity(null);
  }
});
