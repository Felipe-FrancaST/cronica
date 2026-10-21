import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { fixtureCampaign, fixtureUrl, openFixturePage, openCamera } from '../helpers/fixture-page';

test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
});
const table = `/campanhas/${fixtureCampaign}/mesa/grid`;
async function save(page: Parameters<typeof openFixturePage>[0]) {
  await page.getByRole('button', { name: 'Salvar preferências', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('Preferências salvas.');
}

test('account defaults reach the real grid and quick view choices remain available', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openFixturePage(page);
  await page.goto('/configuracoes');
  await page.getByLabel('Visualização inicial do mapa').selectOption('2d');
  await page.getByLabel('Qualidade do 3D', { exact: true }).selectOption('low');
  await page.getByLabel('Animar rolagens de dados').uncheck();
  await save(page);
  await page.screenshot({ path: test.info().outputPath('settings-desktop.png'), fullPage: true });
  await page.goto(table);
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Dados', exact: true }).click();
  await expect(page.getByLabel('Animar os dados', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático 3D interativo', { exact: true })).toBeVisible();
  await openCamera(page);
  await expect(page.getByLabel('Qualidade do 3D', { exact: true })).toHaveValue('low');
  await page.reload();
  await expect(page.getByLabel('Mapa tático 3D interativo', { exact: true })).toBeVisible();
  await page.goto('/configuracoes');
  // Saving a different account preference clears local table overrides.
  await page.getByLabel('Cards de campanha compactos').check();
  await save(page);
  await page.goto(table);
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('account reduced motion stops animated lights even when the device allows animation', async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const initial = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  await request.post(`${fixtureUrl}/__fixture/scenario`, {
    data: {
      status: 'preparing',
      map: { lighting: 'night' },
      objects: [
        {
          id: 'reduced-light',
          map_id: initial.map.id,
          object_type: 'torch',
          geometry: { x: 5, y: 4, width: 1, height: 1, rotation: 0 },
          z: 0,
          color: '#d0a261',
          material: 'wood',
          opacity: 1,
          visible: true,
          blocks_movement: false,
          blocks_vision: false,
          metadata: { variant: 'default', light_enabled: true, light_radius: 6 },
          created_at: '2026-10-04T12:00:00Z',
          updated_at: '2026-10-04T12:00:00Z',
        },
      ],
    },
  });
  await openFixturePage(page);
  await page.goto('/configuracoes');
  await page.getByLabel('Movimento da interface', { exact: true }).selectOption('reduced');
  await page.getByLabel('Tamanho do texto', { exact: true }).selectOption('large');
  await save(page);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('settings-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(table);
  const canvas = page.getByLabel('Mapa tático 3D interativo', { exact: true });
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(700);
  const before = await canvas.screenshot();
  await page.waitForTimeout(250);
  expect(await canvas.screenshot()).toEqual(before);
  await page.getByRole('tab', { name: 'Dados', exact: true }).click();
  await expect(page.getByLabel(/Animar os dados/)).toBeDisabled();
  await expect(page.getByLabel(/Animar os dados/)).not.toBeChecked();
});
