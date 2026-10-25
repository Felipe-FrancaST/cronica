import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { fixtureUrl, fixturePlayer, openFixturePage } from '../helpers/fixture-page';

test('an unchanged background refresh does not repaint the 2D map or rebuild its vision', async ({
  page,
  request,
}, info) => {
  await request.post(fixtureUrl + '/__fixture/reset');
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: {
      status: 'active',
      active: state.tokens.find((t: { npc_id?: string }) => t.npc_id).id,
      mapSize: { width: 80, height: 60 },
      actorSheet: { race: 'Anão', race_id: 'anao' },
      vision: { vision_enabled: true, lighting: 'day' },
    },
  });
  await openFixturePage(page, fixturePlayer);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const metrics = { repaints: 0 };
    (window as unknown as { runtimeMetrics: typeof metrics }).runtimeMetrics = metrics;
    const original = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.matches('.vtt-canvas-base,.vtt-canvas-overlay')) metrics.repaints++;
      return original.apply(this, args);
    };
  });
  const refreshed = page.waitForResponse((r) => r.url().includes('/rest/v1/characters?'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(
    () => (window as unknown as { runtimeMetrics: { repaints: number } }).runtimeMetrics,
  );
  await info.attach('runtime-performance.json', {
    body: JSON.stringify(metrics),
    contentType: 'application/json',
  });
  console.log('RUNTIME_PERFORMANCE ' + JSON.stringify(metrics));
  if (!process.env.PERF_BASELINE) expect(metrics.repaints).toBe(0);
  // A real server change must still appear immediately after the next refresh.
  await request.post(fixtureUrl + '/__fixture/scenario', { data: { heroHP: 17 } });
  const changed = page.waitForResponse((r) => r.url().includes('/rest/v1/characters?'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await changed;
  await expect(page.getByLabel('Minha vida e defesa', { exact: true })).toContainText('17/');
});
