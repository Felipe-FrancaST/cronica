import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { openFixturePage, fixtureUrl, expandSceneryInteractions } from '../helpers/fixture-page';
import type { BattleMapObject } from '../../src/features/vtt/types';

test('a delayed scenery response keeps the grid responsive without reloading terrain', async ({
  page,
  request,
}, info) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
  const initial = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const objects: BattleMapObject[] = Array.from({ length: 360 }, (_, i) => ({
    id: 'perf-' + i,
    map_id: initial.map.id,
    object_type: (['torch', 'pillar', 'door'] as const)[i % 3],
    geometry: { x: i % 24, y: 2 + Math.floor(i / 24), width: 1, height: 1, rotation: 0 },
    z: 0,
    visible: true,
    blocks_movement: false,
    blocks_vision: false,
    metadata: { name: 'Elemento ' + i, variant: 'default' },
    created_at: '2026-10-14T12:00:00Z',
    updated_at: '2026-10-14T12:00:00Z',
  }));
  await request.post(`${fixtureUrl}/__fixture/scenario`, {
    data: { status: 'preparing', mapSize: { width: 32, height: 24 }, objects },
  });
  await openFixturePage(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  const panel = await expandSceneryInteractions(page);
  const before = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const stateButton = panel.getByRole('button', { name: 'Apagar: Elemento 0 em 0,2', exact: true });
  // Measure inside the browser from the click event to the next rendered frame.
  // Playwright's scrolling/actionability checks and request interception are excluded.
  await panel.evaluate((section) => {
    const timing = { started: 0, visualMs: -1 };
    (window as unknown as { sceneryTiming: typeof timing }).sceneryTiming = timing;
    section.addEventListener(
      'click',
      () => {
        timing.started = performance.now();
      },
      { capture: true, once: true },
    );
    const observer = new MutationObserver(() => {
      if (!timing.started || !section.querySelector('[aria-label="Acender: Elemento 0 em 0,2"]'))
        return;
      observer.disconnect();
      requestAnimationFrame(() => {
        timing.visualMs = performance.now() - timing.started;
      });
    });
    observer.observe(section, { attributes: true, childList: true, subtree: true });
  });
  let release: () => void = () => {};
  const confirmation = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/rpc/set_battle_scenery_state', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (!process.env.SCENERY_BENCHMARK_BASELINE) await confirmation;
    await route.continue();
  });
  await stateButton.click();
  const nextButton = panel.getByRole('button', { name: 'Acender: Elemento 0 em 0,2', exact: true });
  await expect(nextButton).toBeVisible({
    timeout: process.env.SCENERY_BENCHMARK_BASELINE ? 15000 : 1500,
  });
  await expect
    .poll(() =>
      panel.evaluate(
        () => (window as unknown as { sceneryTiming: { visualMs: number } }).sceneryTiming.visualMs,
      ),
    )
    .toBeGreaterThanOrEqual(0);
  const visualMs = await panel.evaluate(
    () => (window as unknown as { sceneryTiming: { visualMs: number } }).sceneryTiming.visualMs,
  );
  if (!process.env.SCENERY_BENCHMARK_BASELINE) {
    // The preview must exist while the write is still held, regardless of CI/GPU speed.
    await expect(nextButton).toHaveAttribute('aria-disabled', 'true');
  }
  release();
  await expect
    .poll(
      async () =>
        (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).objects[0].metadata
          .light_enabled,
    )
    .toBe(false);
  await expect(nextButton).not.toHaveAttribute('aria-disabled', 'true');
  const after = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const reads = (after.reads.slice(before.reads.length) as { table: string }[]).filter(
    (r) => r.table !== 'websocket',
  );
  const result = {
    scope: 'Local browser test with simulated 900 ms RPC delay; not a production FPS measurement',
    elements: objects.length,
    visualResponseMs: visualMs,
    restReadsAfterInteraction: reads.length,
    terrainReads: reads.filter((r) =>
      ['battle_map_cells', 'battle_map_objects', 'battle_map_fog'].includes(r.table),
    ).length,
  };
  console.log('SCENERY_PERFORMANCE ' + JSON.stringify(result));
  await info.attach('scenery-performance.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  if (!process.env.SCENERY_BENCHMARK_BASELINE) {
    expect(reads).toEqual([]);
    expect(visualMs).toBeLessThan(2000);
  }
});

test('a delayed rejected interaction rolls back only its element and leaves other controls usable', async ({
  page,
  request,
}) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
  const initial = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const objects = ['Primeira tocha', 'Segunda tocha'].map((name, index) => ({
    id: 'responsive-' + index,
    map_id: initial.map.id,
    object_type: 'torch',
    geometry: { x: 4 + index, y: 5, width: 1, height: 1 },
    z: 0,
    visible: true,
    blocks_movement: false,
    blocks_vision: false,
    metadata: { name, light_enabled: true },
    created_at: '2026-10-14T12:00:00Z',
    updated_at: '2026-10-14T12:00:00Z',
  }));
  await request.post(`${fixtureUrl}/__fixture/scenario`, {
    data: { status: 'preparing', objects },
  });
  await openFixturePage(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  const panel = await expandSceneryInteractions(page);
  let firstRequests = 0;
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/rpc/set_battle_scenery_state', async (route) => {
    if (route.request().postDataJSON().p_object_id !== objects[0].id) return route.continue();
    firstRequests++;
    await blocked;
    await route.fulfill({
      status: 409,
      json: { message: 'O elemento mudou em outra janela. Tente novamente.' },
    });
  });
  try {
    await panel.getByRole('button', { name: 'Apagar: Primeira tocha em 4,5', exact: true }).click();
    const waiting = panel.getByRole('button', {
      name: 'Acender: Primeira tocha em 4,5',
      exact: true,
    });
    await expect(waiting).toHaveAttribute('aria-disabled', 'true');
    // Even a synthetic double click must not issue a second write.
    await waiting.dispatchEvent('click');
    await panel.getByRole('button', { name: 'Apagar: Segunda tocha em 5,5', exact: true }).click();
    const second = panel.getByRole('button', {
      name: 'Acender: Segunda tocha em 5,5',
      exact: true,
    });
    await expect(second).toBeVisible();
    await expect
      .poll(
        async () =>
          (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).objects[1].metadata
            .light_enabled,
      )
      .toBe(false);
    release();
    const restored = panel.getByRole('button', {
      name: 'Apagar: Primeira tocha em 4,5',
      exact: true,
    });
    await expect(restored).toBeVisible();
    await expect(restored).not.toHaveAttribute('aria-disabled', 'true');
    await expect(second).toBeVisible();
    expect(firstRequests).toBe(1);
    const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
    expect(state.objects[0].metadata.light_enabled).toBe(true);
    expect(state.objects[1].metadata.light_enabled).toBe(false);
  } finally {
    release();
  }
});
