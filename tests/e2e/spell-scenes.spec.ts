import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { openFixturePage, fixturePlayer, fixtureUrl } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { spellEffect } from '../../src/features/vtt/effects';
import { randomUUID } from 'node:crypto';
test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});
test('search ignores accents and alphabetical choices retain their selected values', async ({
  page,
}) => {
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Personagem pesquisado');
  const race = page.getByLabel('Raça', { exact: true }),
    labels = await race.locator('option').allTextContents();
  expect(labels).toEqual(
    [...labels].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })),
  );
  await page.getByLabel('Pesquisar raça', { exact: true }).fill('anao');
  await page.getByLabel('Pesquisar raça', { exact: true }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Criar personagem', exact: true })).toBeVisible();
  await race.selectOption({ label: 'Anão da colina' });
  const selected = await race.inputValue();
  await page.getByLabel('Pesquisar raça', { exact: true }).fill('zzzinexistente');
  await expect(race).toHaveValue(selected);
  await expect(
    page.getByRole('status').filter({ hasText: '0 raça(s) encontrada(s)' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pesquisar Antecedente', exact: true }).click();
  await page.getByLabel('Filtrar Antecedente', { exact: true }).fill('acolito');
  await page.getByLabel('Antecedente', { exact: true }).selectOption('acolyte');
  await expect(page.getByLabel('Antecedente', { exact: true })).toHaveValue('acolyte');
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
    'Personagem pesquisado',
  );
});
test('persistent fire and light survive 3D/2D switches and disappear when ended', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillRect;
    (window as any).__paintColors = new Set<string>();
    CanvasRenderingContext2D.prototype.fillRect = function (...args: Parameters<typeof original>) {
      (window as any).__paintColors.add(String(this.fillStyle));
      return original.apply(this, args);
    };
  });
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const make = (id: string, x: number, y: number) => ({
    id: randomUUID(),
    request_id: randomUUID(),
    campaign_id: state.map.campaign_id,
    map_id: state.map.id,
    token_id: state.tokens[0].id,
    name: id,
    definition: {
      ...spellEffect({ catalog_id: id }),
      entry: { catalog_id: id },
      scene_origin: { x: state.tokens[0].x, y: state.tokens[0].y },
    },
    target: { x, y },
    concentration: true,
    duration: '1 minuto',
    active: true,
    pulses: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_round: 11,
  });
  const effects = [make('muralha-de-fogo', 8, 5), make('produzir-chama', 2, 2)];
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { spellEffects: effects, status: 'preparing' },
  });
  await openFixturePage(page, DEMO_USER_ID);
  await expect(page.getByLabel('Mapa tático 3D interativo', { exact: true })).toBeVisible();
  await page
    .getByLabel('Mapa tático 3D interativo', { exact: true })
    .screenshot({ path: info.outputPath('magias-persistentes-3d.png') });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...((window as any).__paintColors as Set<string>)].some((c) =>
          c.startsWith('rgba(237, 119, 57'),
        ),
      ),
    )
    .toBe(true);
  await page
    .getByLabel('Mapa tático interativo', { exact: true })
    .screenshot({ path: info.outputPath('magias-persistentes-2d.png') });
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { spellEffects: effects.map((e) => ({ ...e, active: false })) },
  });
  await page.reload();
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...((window as any).__paintColors as Set<string>)].some((c) =>
          c.startsWith('rgba(237, 119, 57'),
        ),
      ),
    )
    .toBe(false);
  expect(errors).toEqual([]);
});
