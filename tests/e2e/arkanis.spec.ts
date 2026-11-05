import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { fixtureUrl, openFixturePage } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { ARKANIS_SYSTEM_ID } from '../../src/systems/arkanis/rules';

test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
  await request.post(`${fixtureUrl}/__fixture/campaign-access`, { data: { mode: 'free' } });
});
for (const width of [1440, 375])
  test(`Arkanis ${width}px: own sheet, 180 icons, tagged stock and PostgreSQL save survive reload`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openFixturePage(page, DEMO_USER_ID, '');
    await page.goto('/campanhas?criar=1');
    await page.getByLabel('Nome da campanha', { exact: true }).fill('Os ecos de Arkanis');
    await page.getByLabel('Sistema de RPG', { exact: true }).selectOption(ARKANIS_SYSTEM_ID);
    await page.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Os ecos de Arkanis', exact: true }),
    ).toBeVisible();
    const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
    const campaign = state.campaigns.find(
      (c: { rpg_system_id: string }) => c.rpg_system_id === ARKANIS_SYSTEM_ID,
    );
    await page.goto(`/campanhas/${campaign.id}/personagens?criar=1`);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('ARKANIS · DOSSIÊ DA ALMA', { exact: true })).toBeVisible();
    await page.getByLabel('Nome do personagem', { exact: true }).fill('Ayla das Marés');
    await expect(page.getByLabel('Classe', { exact: true })).toHaveCount(0);
    await page.getByLabel('Raça de Arkanis', { exact: true }).selectOption('harpy');
    await page.getByRole('tab', { name: 'Aptidões', exact: true }).click();
    await expect(page.getByLabel('Percepção', { exact: true })).toHaveValue('2');
    await page.getByRole('tab', { name: 'Identidade', exact: true }).click();
    await page.getByLabel('Raça de Arkanis', { exact: true }).selectOption('human');
    await page.getByRole('tab', { name: 'Corpo, mente e espírito', exact: true }).click();
    for (const label of ['Corpo (d10)', 'Mente (d10)', 'Espírito (d10)'])
      await page.getByLabel(label, { exact: true }).fill('8');
    await expect(page.getByLabel('PV máximo', { exact: true })).toHaveValue('9');
    await page.getByLabel('PV atual', { exact: true }).fill('8');
    await page.getByLabel('Mana atual', { exact: true }).fill('10');
    await page.getByRole('tab', { name: 'Aptidões', exact: true }).click();
    await page.getByLabel('Mágico', { exact: true }).selectOption('3');
    await page.getByRole('tab', { name: 'Alquimia', exact: true }).click();
    await page.getByRole('tab', { name: 'Catálogo completo (180)', exact: true }).click();
    await page.getByLabel('Buscar ingrediente ou afinidade', { exact: true }).fill('Perola Negra');
    await page.getByLabel('Unidades a adicionar', { exact: true }).fill('2');
    const icon = page.locator(
      '.arkanis-ingredient-grid img[src="/icons/arkanis/ingredients/arkanis-001.svg"]',
    );
    await expect(icon).toBeVisible();
    await expect
      .poll(() => icon.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Adicionar Pérola Negra', exact: true }).click();
    await page
      .getByLabel('Buscar ingrediente ou afinidade', { exact: true })
      .fill('Tinta de Kraken');
    await page.getByRole('button', { name: 'Adicionar Tinta de Kraken', exact: true }).click();
    await page
      .getByLabel('Ingrediente 1', { exact: true })
      .selectOption({ label: 'Pérola Negra (2)' });
    await page
      .getByLabel('Ingrediente 2', { exact: true })
      .selectOption({ label: 'Tinta de Kraken (2)' });
    await expect(
      page.getByRole('heading', { name: 'Poção da Sombra Velada', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Preparar poção', exact: true }).click();
    await page.getByLabel('Buscar ingrediente ou afinidade', { exact: true }).fill('Perola Negra');
    await page.getByRole('tab', { name: /^Meus ingredientes/ }).click();
    await expect(page.getByText('1 unidade', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Bolsa', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Poção da Sombra Velada', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Novo item', exact: true }).click();
    const custom = page.locator('.arkanis-bag-item').last();
    await custom.getByLabel('Nome', { exact: true }).fill('Raiz de teste');
    await custom.getByLabel('Usar como ingrediente', { exact: true }).check();
    await page.getByRole('tab', { name: 'Alquimia', exact: true }).click();
    await page.getByLabel('Buscar ingrediente ou afinidade', { exact: true }).fill('');
    await expect(page.getByRole('heading', { name: 'Raiz de teste', exact: true })).toBeVisible();
    await page.screenshot({ path: `../arkanis-048-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Salvar ficha de Arkanis', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Ayla das Marés', exact: true })).toBeVisible();
    await page.goto(`/campanhas/${campaign.id}/personagens`);
    await page.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
    await expect(page.getByLabel('PV atual', { exact: true })).toHaveValue('8');
    await page.getByRole('tab', { name: 'Aptidões', exact: true }).click();
    await expect(page.getByLabel('Mágico', { exact: true })).toHaveValue('3');
    await page.getByRole('tab', { name: 'Alquimia', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pérola Negra', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Raiz de teste', exact: true })).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await page.getByRole('button', { name: 'Dar itens', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Dar itens a Ayla das Marés' })).toBeVisible();
  });
