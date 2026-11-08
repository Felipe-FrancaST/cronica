import { expect, type Route } from '@playwright/test';
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
    let directSaves = 0;
    await page.route('**/rest/v1/rpc/save_arkanis_character', (route) => {
      directSaves++;
      return route.abort();
    });
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
    const imageData = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#49aa91';
      ctx.fillRect(0, 0, 128, 128);
      return c.toDataURL('image/png').split(',')[1];
    });
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Trocar retrato do personagem', exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'retrato.png',
      mimeType: 'image/png',
      buffer: Buffer.from(imageData, 'base64'),
    });
    const crop = page.getByRole('dialog', { name: 'Ajustar imagem', exact: true });
    await expect(crop.getByAltText('Imagem original para recorte')).toBeVisible();
    await crop.getByRole('button', { name: 'Usar este recorte', exact: true }).click();
    await expect(crop).toHaveCount(0);
    await expect(page.locator('.arkanis-portrait-frame > img')).toBeVisible();
    await page.screenshot({ path: `../arkanis-050-ficha-${width}.png`, fullPage: true });
    await page.getByLabel('Raça de Arkanis', { exact: true }).selectOption('harpy');
    await dialog.evaluate((el) => {
      el.scrollTop = 160;
    });
    const scrollBefore = await dialog.evaluate((el) => el.scrollTop);
    await page.getByRole('tab', { name: 'Aptidões', exact: true }).click();
    await expect.poll(() => dialog.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(Math.abs((await dialog.evaluate((el) => el.scrollTop)) - scrollBefore)).toBeLessThan(50);

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
    await page.locator('.ark-lab-grid').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../arkanis-050-lab-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Preparar poção', exact: true }).click();
    await expect(page.locator('.ark-lab-result')).toContainText('PREPARADA · ADICIONADA À BOLSA');
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
    const gift = page.getByRole('dialog', { name: 'Dar itens a Ayla das Marés' });
    await expect(gift).toBeVisible();
    await expect(
      gift.getByRole('button', { name: 'Selecionar Pérola Branca', exact: true }),
    ).toBeVisible();
    await gift.getByLabel('Localidade dos ingredientes', { exact: true }).selectOption('mares');
    await gift.getByLabel('Buscar item', { exact: true }).fill('perola branca');
    await expect(gift.locator('.gift-grid button')).toHaveCount(1);
    await gift.getByRole('button', { name: 'Selecionar Pérola Branca', exact: true }).click();
    await gift.getByLabel('Quantidade entregue').fill('3');
    await page.screenshot({ path: `../arkanis-050-entrega-${width}.png`, fullPage: true });
    expect(await gift.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await gift.getByRole('button', { name: 'Entregar itens', exact: true }).click();
    await expect(gift).toHaveCount(0);
    await page.getByRole('button', { name: 'Dar itens', exact: true }).click();
    await gift.getByRole('button', { name: 'Poções 75', exact: true }).click();
    await gift.getByLabel('Nível da poção', { exact: true }).selectOption('3');
    await gift.getByLabel('Buscar item', { exact: true }).fill('restauracao');
    await gift
      .getByRole('button', { name: 'Selecionar Elixir da Restauração Total', exact: true })
      .click();
    await gift.getByLabel('Quantidade entregue').fill('2');
    await gift.getByRole('button', { name: 'Entregar itens', exact: true }).click();
    await expect(gift).toHaveCount(0);
    await page.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
    await expect(page.locator('.arkanis-portrait-frame img')).toBeVisible();
    await page.getByRole('tab', { name: 'Bolsa', exact: true }).click();
    const pearl = page
      .locator('.arkanis-bag-item')
      .filter({ has: page.getByRole('heading', { name: 'Pérola Branca', exact: true }) });
    const potion = page.locator('.arkanis-bag-item').filter({
      has: page.getByRole('heading', { name: 'Elixir da Restauração Total', exact: true }),
    });
    await expect(pearl.getByLabel('Quantidade de Pérola Branca', { exact: true })).toHaveValue('3');
    await expect(
      potion.getByLabel('Quantidade de Elixir da Restauração Total', { exact: true }),
    ).toHaveValue('2');
    await page.getByRole('tab', { name: 'Identidade', exact: true }).click();
    if (width === 1440) await page.clock.install();
    await page.getByLabel('Nome do personagem', { exact: true }).fill('Ayla salva sem travar');
    const held: Route[] = [];
    if (width === 1440) {
      await page.route('**/api/characters/save', (route) => {
        held.push(route);
      });
      await page.getByRole('button', { name: 'Salvar ficha de Arkanis', exact: true }).click();
      await expect.poll(() => held.length).toBe(1);
      await page.clock.fastForward(36_000);
      await expect(
        page.getByRole('alert').filter({ hasText: /O servidor do site não respondeu/ }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Salvar ficha de Arkanis', exact: true }),
      ).toBeEnabled();
      await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
        'Ayla salva sem travar',
      );
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage).some(
            (key) =>
              key.startsWith('cronica:editor-draft:') &&
              localStorage.getItem(key)?.includes('Ayla salva sem travar'),
          ),
        ),
      ).toBe(true);
      await Promise.all(held.splice(0).map((route) => route.abort().catch(() => {})));
      await page.unroute('**/api/characters/save');
      await page.clock.resume();
    }
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().method() === 'GET') held.push(route);
      else return route.continue();
    });
    await page.getByRole('button', { name: 'Salvar ficha de Arkanis', exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 8000 });
    expect(held.length).toBeGreaterThan(0);
    await expect(
      page.getByRole('heading', { name: 'Ayla salva sem travar', exact: true }),
    ).toBeVisible();
    const finalState = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
    expect(
      finalState.characters.some((c: { name: string }) => c.name === 'Ayla salva sem travar'),
    ).toBe(true);
    await Promise.all(held.map((route) => route.abort().catch(() => {})));
    await page.unroute('**/rest/v1/**');
    expect(directSaves).toBe(0);
    expect(errors).toEqual([]);
  });
