import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { fixtureUrl, openFixturePage } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import type { Route } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
});
async function settings(page: Parameters<typeof openFixturePage>[0]) {
  await openFixturePage(page, DEMO_USER_ID, '');
  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
}
async function save(page: Parameters<typeof openFixturePage>[0]) {
  await page.getByRole('button', { name: 'Salvar preferências', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('Preferências salvas.');
}

test('an unpaid account saves all real preferences and profile editing preserves them', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await settings(page);
  await page.evaluate((id) => localStorage.setItem(`cronica:table:${id}:view`, '3d'), DEMO_USER_ID);
  await page.getByLabel('Tamanho do texto', { exact: true }).selectOption('large');
  await page.getByLabel('Movimento da interface', { exact: true }).selectOption('reduced');
  await page.getByLabel('Cards de campanha compactos').check();
  await page.getByLabel('Visualização inicial do mapa').selectOption('2d');
  await page.getByLabel('Qualidade do 3D', { exact: true }).selectOption('low');
  await page.getByLabel('Animar rolagens de dados').uncheck();
  await save(page);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
    'auto',
  );
  expect(
    await page.evaluate((id) => localStorage.getItem(`cronica:table:${id}:view`), DEMO_USER_ID),
  ).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Visualização inicial do mapa')).toHaveValue('2d');
  await expect(page.getByLabel('Cards de campanha compactos')).toBeChecked();
  await expect(page.getByLabel('Animar rolagens de dados')).not.toBeChecked();
  await page.getByRole('link', { name: 'Editar perfil', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Aventureiro revisado');
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('Perfil atualizado.');
  await page.goto('/configuracoes');
  await expect(page.getByLabel('Tamanho do texto', { exact: true })).toHaveValue('large');
  await expect(page.getByLabel('Visualização inicial do mapa')).toHaveValue('2d');
  expect(errors).toEqual([]);
});

test('failed settings writes preserve the draft and retry clears the error', async ({ page }) => {
  await settings(page);
  let fail = true;
  await page.route('**/rest/v1/rpc/update_profile_preferences', (route) =>
    fail
      ? route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Falha temporária de teste', code: 'TEST' }),
        })
      : route.continue(),
  );
  await page.getByLabel('Tamanho do texto', { exact: true }).selectOption('large');
  await page.getByRole('button', { name: 'Salvar preferências', exact: true }).click();
  await expect(page.locator('.error-box[role=alert]')).toContainText('Falha temporária');
  await expect(page.getByLabel('Tamanho do texto', { exact: true })).toHaveValue('large');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'standard');
  fail = false;
  await save(page);
  await expect(page.locator('.error-box[role=alert]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
});

test('restoring defaults waits for saving and enlarged settings fit a mobile screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await settings(page);
  await page.getByLabel('Tamanho do texto', { exact: true }).selectOption('large');
  await page.getByLabel('Movimento da interface', { exact: true }).selectOption('reduced');
  await save(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Restaurar padrões', exact: true }).click();
  await expect(page.getByLabel('Tamanho do texto', { exact: true })).toHaveValue('standard');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await save(page);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'standard');
  await page.reload();
  await expect(page.getByLabel('Movimento da interface', { exact: true })).toHaveValue('system');
});

test('focus and reconnect bursts collapse workspace and subscription reads', async ({ page }) => {
  await settings(page);
  await page.waitForTimeout(600);
  let profiles = 0,
    access = 0;
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/profiles?')) profiles++;
    if (request.url().includes('/rest/v1/rpc/get_billing_context')) access++;
  });
  await page.evaluate(() => {
    for (let i = 0; i < 200; i++) {
      dispatchEvent(new Event('focus'));
      dispatchEvent(new Event('online'));
    }
  });
  await expect.poll(() => profiles).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  expect(profiles).toBe(1);
  expect(access).toBe(1);
});

test('optional browser storage being blocked does not prevent changing modes', async ({ page }) => {
  await settings(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    Storage.prototype.removeItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Trocar modo', exact: true }).click();
  await page.getByRole('button', { name: /Entrar como Jogador/ }).click();
  await expect(page.getByRole('heading', { name: 'Minhas aventuras', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a delayed administration response cannot replace the settings tab with an old error', async ({
  page,
}) => {
  await openFixturePage(page, '10000000-0000-4000-8000-000000000003');
  await page.goto('/administracao');
  await expect(page.getByRole('tab', { name: 'Financeiro', exact: true })).toBeVisible();
  let pending: Route | null = null;
  await page.route('**/api/admin/billing?view=finance**', (route) => {
    pending = route;
  });
  await page.getByRole('tab', { name: 'Financeiro', exact: true }).click();
  await expect.poll(() => !!pending).toBe(true);
  await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Assinaturas e acesso', exact: true }),
  ).toBeVisible();
  await pending!.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Resposta antiga de teste' }),
  });
  await page.waitForTimeout(250);
  await expect(page.locator('.error-box[role=alert]')).toHaveCount(0);
  const summary = page.locator('.admin-settings .billing-notice');
  await expect(summary).toContainText('Jogadores: acesso gratuito');
  await page.getByLabel('Jogadores precisam de assinatura').check();
  await expect(summary).toContainText('Jogadores: assinatura obrigatória');
  await page.getByLabel('Exigir assinatura para os acessos selecionados').uncheck();
  await expect(summary).toContainText('Mestres: acesso gratuito');
});
