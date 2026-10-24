import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { openFixturePage, fixturePlayer, fixtureUrl } from '../helpers/fixture-page';

test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});
for (const viewport of [
  { width: 375, height: 667 },
  { width: 1440, height: 1000 },
]) {
  test(`combat survives 3D/2D switches and minimum zoom with small tokens at ${viewport.width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.arc;
      const radii: number[] = [];
      (window as any).__tokenArcRadii = radii;
      CanvasRenderingContext2D.prototype.arc = function (...args: Parameters<typeof original>) {
        if (radii.length < 10000) radii.push(args[2]);
        return original.apply(this, args);
      };
    });
    const initial = await (await request.get(fixtureUrl + '/__fixture/state')).json();
    const tokens = initial.tokens.map((t: any, i: number) => ({
      ...t,
      size: i === 0 ? 0.25 : 0.5,
    }));
    await request.post(fixtureUrl + '/__fixture/scenario', {
      data: {
        status: 'active',
        active: tokens[0].id,
        tokens,
        mapSize: { width: 100, height: 100 },
      },
    });
    await openFixturePage(page, fixturePlayer);
    await expect(page.getByLabel('Mapa tático 3D interativo', { exact: true })).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: '2D', exact: true }).click();
      await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
      for (let n = 0; n < 3; n++)
        await page.getByRole('button', { name: 'Afastar', exact: true }).click();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page.getByRole('button', { name: 'Abrir ficha', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '3D', exact: true }).click();
      await expect(page.getByLabel('Mapa tático 3D interativo', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const radii = await page.evaluate(() => (window as any).__tokenArcRadii as number[]);
    expect(radii.length).toBeGreaterThan(0);
    expect(radii.every((r) => Number.isFinite(r) && r >= 0)).toBe(true);
    expect(errors).toEqual([]);
    const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
    expect(after.session.active_token_id).toBe(tokens[0].id);
    expect(after.session.status).toBe('active');
    expect(after.tokens.map((t: any) => ({ id: t.id, x: t.x, y: t.y }))).toEqual(
      tokens.map((t: any) => ({ id: t.id, x: t.x, y: t.y })),
    );
  });
}
