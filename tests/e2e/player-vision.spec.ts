import { expect, type Page } from '@playwright/test';
import { test } from '../helpers/browser-test';
import {
  fixturePlayer,
  fixtureUrl,
  openFixturePage,
  openMasterTool,
} from '../helpers/fixture-page';

test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});
const view = { vision_enabled: true, lighting: 'night', darkness_level: 'dark' };
async function sample(page: Page, x: number, y: number, width = 40, height = 16) {
  return page.getByLabel('Mapa tático interativo', { exact: true }).evaluate(
    (node, point) => {
      const overlay = node as HTMLCanvasElement,
        base = node.parentElement!.querySelector('.vtt-canvas-base') as HTMLCanvasElement;
      const rect = overlay.getBoundingClientRect(),
        dpr = overlay.width / rect.width;
      const cell = Math.min((rect.width - 72) / point.width, (rect.height - 72) / point.height);
      const px = Math.floor(((rect.width - cell * point.width) / 2 + (point.x + 0.5) * cell) * dpr);
      const py = Math.floor(
        ((rect.height - cell * point.height) / 2 + (point.y + 0.5) * cell) * dpr,
      );
      const canvas = document.createElement('canvas');
      canvas.width = overlay.width;
      canvas.height = overlay.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(overlay, 0, 0);
      return [...ctx.getImageData(px, py, 1, 1).data];
    },
    { x, y, width, height },
  );
}
async function twoD(page: Page) {
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
}

test('the GM configures and persists night vision in one request without reloading terrain', async ({
  page,
  request,
}, info) => {
  await openFixturePage(page);
  const panel = await openMasterTool(page, 'visibility');
  await expect(panel.getByLabel('Modo de visão dos jogadores', { exact: true })).toHaveValue(
    'free',
  );
  const before = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const saved = page.waitForResponse((r) => r.url().includes('/rpc/configure_battle_map_vision'));
  await panel.getByRole('button', { name: 'Noite escura', exact: true }).click();
  await saved;
  await expect(panel.getByLabel('Modo de visão dos jogadores', { exact: true })).toHaveValue(
    'individual',
  );
  await expect(panel.getByLabel('Período do grid')).toHaveValue('night');
  await expect(panel.getByLabel('Escuridão geral do mapa')).toHaveValue('dark');
  const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(after.map.vision_enabled).toBe(true);
  expect(
    after.reads
      .slice(before.reads.length)
      .filter((r: { table: string }) =>
        ['battle_map_cells', 'battle_map_objects', 'battle_map_fog'].includes(r.table),
      ),
  ).toEqual([]);
  await panel.screenshot({ path: info.outputPath('controles-de-visao.png') });
  await page.reload();
  const reopened = await openMasterTool(page, 'visibility');
  await expect(reopened.getByRole('button', { name: 'Noite escura', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await reopened.getByRole('button', { name: 'Noite com penumbra', exact: true }).click();
  await expect(reopened.getByLabel('Escuridão geral do mapa')).toHaveValue('dim');
  await reopened.getByLabel('Modo de visão dos jogadores', { exact: true }).selectOption('free');
  await expect(reopened.getByLabel('Modo de visão dos jogadores', { exact: true })).toHaveValue(
    'free',
  );
  await openFixturePage(page, fixturePlayer);
  await expect(page.getByLabel('Modo de visão dos jogadores', { exact: true })).toHaveCount(0);
});

test('a human in total darkness sees only their own piece in 3D and 2D', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: {
      status: 'preparing',
      cells: [],
      objects: [],
      fog: [],
      mapSize: { width: 40, height: 16 },
      actorSheet: { race: 'Humano', race_id: 'humano', features: '' },
      vision: view,
    },
  });
  await openFixturePage(page, fixturePlayer);
  const three = page.getByLabel('Mapa tático 3D interativo', { exact: true });
  await expect(three).toBeVisible();
  await page.waitForTimeout(300);
  await three.screenshot({ path: info.outputPath('humano-escuridao-3d.png') });
  await twoD(page);
  await expect.poll(() => sample(page, 3, 4)).toEqual([2, 5, 12, 255]);
  expect(await sample(page, 30, 4)).toEqual([2, 5, 12, 255]);
  expect(await sample(page, 2, 4)).not.toEqual([2, 5, 12, 255]);
  await page
    .getByLabel('Mapa tático interativo', { exact: true })
    .screenshot({ path: info.outputPath('humano-escuridao-2d.png') });
  expect(errors).toEqual([]);
});

test('racial darkvision reveals only its radius, while a distant torch opens additional visible cells', async ({
  page,
  request,
}, info) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const torch = {
    id: 'vision-torch',
    map_id: state.map.id,
    object_type: 'torch',
    geometry: { x: 24, y: 4, width: 1, height: 1 },
    visible: true,
    z: 0,
    blocks_movement: false,
    blocks_vision: false,
    metadata: { name: 'Tocha de teste', light_enabled: true },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: {
      status: 'preparing',
      cells: [],
      objects: [torch],
      fog: [],
      mapSize: { width: 40, height: 16 },
      actorSheet: { race: 'Anão', race_id: 'anao', features: '' },
      vision: view,
    },
  });
  await openFixturePage(page, fixturePlayer);
  await expect(page.getByLabel('Mapa tático 3D interativo', { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await page
    .getByLabel('Mapa tático 3D interativo', { exact: true })
    .screenshot({ path: info.outputPath('alcance-racial-e-tocha-3d.png') });
  await twoD(page);
  await expect.poll(async () => (await sample(page, 14, 4))[0]).toBeGreaterThan(15);
  const grey = await sample(page, 14, 4);
  expect(Math.max(...grey.slice(0, 3)) - Math.min(...grey.slice(0, 3))).toBeLessThanOrEqual(2);
  expect(await sample(page, 15, 4)).toEqual([2, 5, 12, 255]);
  expect(await sample(page, 26, 4)).not.toEqual([2, 5, 12, 255]);
  expect(await sample(page, 30, 4)).not.toEqual([2, 5, 12, 255]);
  expect(await sample(page, 34, 4)).toEqual([2, 5, 12, 255]);
  await page
    .getByLabel('Mapa tático interativo', { exact: true })
    .screenshot({ path: info.outputPath('alcance-racial-e-tocha.png') });
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { objects: [{ ...torch, metadata: { ...torch.metadata, light_enabled: false } }] },
  });
  await page.reload();
  await twoD(page);
  await expect.poll(() => sample(page, 26, 4)).toEqual([2, 5, 12, 255]);
  expect((await sample(page, 14, 4))[0]).toBeGreaterThan(15);
});

test('dim light stays visible and darker than daylight for a human', async ({
  page,
  request,
}, info) => {
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: {
      status: 'preparing',
      cells: [],
      objects: [],
      fog: [],
      mapSize: { width: 40, height: 16 },
      actorSheet: { race: 'Humano', race_id: 'humano', features: '' },
      vision: { ...view, lighting: 'day', day_darkness_level: 'none' },
    },
  });
  await openFixturePage(page, fixturePlayer);
  await twoD(page);
  const bright = await sample(page, 14, 4);
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { vision: { ...view, darkness_level: 'dim' } },
  });
  await page.reload();
  await twoD(page);
  const dim = await sample(page, 14, 4);
  expect(dim).not.toEqual([2, 5, 12, 255]);
  expect(dim[0]).toBeLessThan(bright[0] * 0.8);
  await page
    .getByLabel('Mapa tático interativo', { exact: true })
    .screenshot({ path: info.outputPath('penumbra-humano.png') });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático 3D interativo', { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await page
    .getByLabel('Mapa tático 3D interativo', { exact: true })
    .screenshot({ path: info.outputPath('penumbra-humano-3d.png') });
});
