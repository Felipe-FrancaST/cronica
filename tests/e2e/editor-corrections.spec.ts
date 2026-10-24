import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from '../helpers/browser-test';
import {
  openFixturePage,
  fixturePlayer,
  fixtureCampaign,
  fixtureUrl,
} from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { generateAtlas } from '../../src/features/atlas/generator';
import { featureBase, mapRecord } from '../../src/features/atlas/model';
import { defaultSheet } from '../../src/systems/dnd5e';
import { withClassLevels } from '../../src/systems/dnd5e/progression';
import { SPELL_CATALOG, spellFromCatalog } from '../../src/systems/dnd5e/spell-catalog';
import { randomUUID } from 'node:crypto';

test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});
async function openMap(page: Page, request: APIRequestContext, route = false) {
  const doc = generateAtlas('blank', 960, 640, 'corrections', 'Mapa de correções');
  if (route)
    doc.objects.push({
      ...featureBase({ x: 200, y: 200 }, 'Estrada'),
      kind: 'route',
      style: 'road',
      color: '#98754b',
      width: 5,
      curved: false,
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 100 },
        { x: 400, y: 0 },
      ],
    });
  const map = { ...mapRecord(fixtureCampaign, doc), revision: 1 };
  await request.post(fixtureUrl + '/__fixture/scenario', { data: { atlasMaps: [map] } });
  await openFixturePage(page, DEMO_USER_ID, `mapas/${map.id}`);
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible();
  return map;
}
async function point(page: Page, x: number, y: number) {
  const b = (await page.getByLabel('Editor de mapa interativo', { exact: true }).boundingBox())!;
  const z = Number((await page.getByLabel('Zoom do mapa').textContent())!.replace('%', '')) / 100;
  return { x: b.x + (b.width - 960 * z) / 2 + x * z, y: b.y + (b.height - 640 * z) / 2 + y * z };
}
test('dismissing info and errors preserves the character editor and level can be cleared and replaced', async ({
  page,
}, info) => {
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Escolhas preservadas');
  await page.getByLabel('Classe', { exact: true }).selectOption('wizard');
  const level = page.getByLabel('Nível', { exact: true });
  await level.fill('');
  await expect(level).toHaveValue('');
  await level.pressSequentially('12');
  await level.blur();
  await expect(level).toHaveValue('12');
  await level.fill('');
  await level.blur();
  await expect(level).toHaveValue('12');
  await page.getByRole('tab', { name: 'Criação assistida', exact: true }).click();
  await page
    .getByRole('button', { name: 'Aplicar equipamento e moedas iniciais', exact: true })
    .click({ force: true });
  const notice = page.locator('[data-action-notice]');
  await expect(notice).toContainText('Escolha um antecedente');
  await notice.getByRole('button', { name: 'Fechar aviso' }).click();
  await expect(page.getByRole('dialog', { name: 'Criar personagem', exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
    'Escolhas preservadas',
  );
  await page.getByRole('tab', { name: 'Identidade', exact: true }).click();
  await expect(page.getByLabel('Classe', { exact: true })).toHaveValue('wizard');
  await expect(level).toHaveValue('12');
  await page.getByRole('tab', { name: 'Classes e habilidades', exact: true }).click();
  const classLevel = page.getByLabel('Nível de Mago', { exact: true });
  await classLevel.fill('');
  await expect(classLevel).toHaveValue('');
  await classLevel.fill('11');
  await classLevel.blur();
  await expect(classLevel).toHaveValue('11');
  await page.getByLabel('Nome do personagem', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(notice).toHaveClass(/is-error/);
  await notice.getByRole('button', { name: 'Fechar aviso' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(classLevel).toHaveValue('11');
  await page.screenshot({ path: info.outputPath('ficha-preservada.png') });
});
test('spell cards stay compact and fit a mobile sheet when expanded', async ({
  page,
  request,
}, info) => {
  const spells = ['Magic Missile', 'Detect Magic'].map((name) =>
    spellFromCatalog(
      SPELL_CATALOG.find((s) => s.english_name === name)!,
      randomUUID(),
      'wizard',
    ),
  );
  const sheet = withClassLevels(
    { ...defaultSheet(), abilities: { str: 16, dex: 16, con: 16, int: 16, wis: 16, cha: 16 } },
    [{ class_id: 'wizard', level: 5 }],
  );
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { actorSheet: { ...sheet, spells } },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Abrir ficha', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  const card = page.getByLabel(`Magia ${spells[0].name}`, { exact: true });
  await expect(card).not.toHaveAttribute('open', '');
  expect((await card.boundingBox())!.height).toBeLessThan(150);
  await expect(card.locator('.spell-description')).not.toBeVisible();
  await card.locator('summary').first().click();
  await expect(card.locator('.spell-description')).toBeVisible();
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('magias-celular.png') });
});
test('eraser hides terrain choices, symbol sizing stays in reach and select opens its panel', async ({
  page,
  request,
}) => {
  await openMap(page, request);
  await page.getByRole('button', { name: 'Pintar terreno', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tipos de terreno' })).toBeVisible();
  await page.getByRole('button', { name: 'Apagar terreno', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tipos de terreno' })).toHaveCount(0);
  await expect(page.getByLabel('Altura do relevo', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Tamanho do pincel', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Símbolos', exact: true }).click();
  const size = page.getByRole('slider', { name: 'Tamanho do símbolo', exact: true });
  await size.fill('128');
  await page.locator('.atlas-panel-content').evaluate((e) => (e.scrollTop = 350));
  const b = (await size.boundingBox())!,
    p = (await page.locator('.atlas-panel-content').boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(p.y);
  expect(b.y + b.height).toBeLessThan(p.y + p.height);
  const at = await point(page, 400, 300);
  await page.mouse.click(at.x, at.y);
  await page.getByRole('button', { name: 'Selecionar', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Seleção', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.mouse.click(at.x, at.y);
  await expect(page.getByLabel('Tamanho do elemento', { exact: true })).toHaveValue('128');
  const sizeBox = (await page.getByLabel('Tamanho do elemento', { exact: true }).boundingBox())!;
  expect(sizeBox.y).toBeLessThan(p.y + 170);
});
test('route points can be hidden and restored without changing the saved route', async ({
  page,
  request,
}) => {
  await openMap(page, request, true);
  const p = await point(page, 400, 300);
  await page.mouse.click(p.x, p.y);
  const c = page.getByLabel('Editor de mapa interativo', { exact: true });
  const before = await c.evaluate((e) => (e as HTMLCanvasElement).toDataURL());
  await page.getByRole('button', { name: 'Ocultar pontos das rotas', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Mostrar pontos das rotas', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => c.evaluate((e) => (e as HTMLCanvasElement).toDataURL())).not.toBe(before);
  await page.getByRole('button', { name: 'Mostrar pontos das rotas', exact: true }).click();
  await expect.poll(() => c.evaluate((e) => (e as HTMLCanvasElement).toDataURL())).toBe(before);
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(state.atlasMaps[0].document.objects[0].points).toEqual([
    { x: 0, y: 0 },
    { x: 200, y: 100 },
    { x: 400, y: 0 },
  ]);
});
for (const full of [false, true])
  test(`download confirmation appears in ${full ? 'full screen' : 'normal view'} and closes without dismissing export`, async ({
    page,
    request,
  }) => {
    await openMap(page, request);
    if (full) {
      await page.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    }
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    const exportDialog = page.getByRole('dialog', { name: 'Exportar mapa', exact: true });
    const download = page.waitForEvent('download');
    await exportDialog.getByRole('button', { name: 'Baixar PNG', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    const notice = page.locator('[data-action-notice]');
    await expect(notice).toContainText('Download concluído');
    if (full)
      expect(await notice.evaluate((e) => document.fullscreenElement?.contains(e))).toBe(true);
    await notice.getByRole('button', { name: 'Fechar aviso' }).click();
    await expect(exportDialog).toBeVisible();
    const backup = page.waitForEvent('download');
    await exportDialog
      .getByRole('button', { name: 'Backup editável (.json)', exact: true })
      .click();
    expect((await backup).suggestedFilename()).toMatch(/\.json$/);
    await expect(notice).toContainText('backup editável');
  });

test('a failed PNG export shows an error without reporting success or closing the dialog', async ({
  page,
  request,
}) => {
  await openMap(page, request);
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(null);
    };
  });
  const dialog = page.getByRole('dialog', { name: 'Exportar mapa', exact: true });
  for (let i = 0; i < 2; i++) {
    await dialog.getByRole('button', { name: 'Baixar PNG', exact: true }).click();
    const notice = page.locator('[data-action-notice]');
    await expect(notice).toContainText('Não foi possível exportar a imagem');
    await expect(notice).not.toContainText('Download concluído');
    await notice.getByRole('button', { name: 'Fechar aviso' }).click();
    await expect(dialog).toBeVisible();
  }
});
