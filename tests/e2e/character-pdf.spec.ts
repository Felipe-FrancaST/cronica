import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFTextField, PDFStream } from 'pdf-lib';
import { test } from '../helpers/browser-test';
import { openFixturePage, fixturePlayer, fixtureUrl } from '../helpers/fixture-page';
import { textField } from '../../src/systems/dnd5e/pdf/template';

async function openSheet(page: Page, name = 'Lyra Ventolume') {
  await page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .getByRole('button', { name: 'Abrir ficha', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});

test('player saves the PDF details and downloads the current editable sheet without saving an unfinished edit', async ({
  page,
  request,
}, testInfo) => {
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exportar PDF', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByLabel('Nome do personagem').fill('Érica dos Rios');
  await page.getByRole('tab', { name: 'História', exact: true }).click();
  await page.getByLabel('Idade', { exact: true }).fill('31 anos');
  await page.getByLabel('Altura', { exact: true }).fill('1,68 m');
  await page.getByLabel('Cor dos olhos').fill('Castanhos');
  await page.getByLabel('Aliados e organizações').fill('Guardiões da ponte');
  await page.getByLabel('História / background').fill('História salva no site.');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await openSheet(page, 'Érica dos Rios');
  await page.getByRole('tab', { name: 'História', exact: true }).click();
  await expect(page.getByLabel('Idade', { exact: true })).toHaveValue('31 anos');
  await page.getByLabel('História / background').fill('História atual no PDF, ainda sem salvar.');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click();
  // The worker keeps the editor interactive while rendering the export.
  await page.getByRole('tab', { name: 'Identidade', exact: true }).click();
  await expect(page.getByLabel('Nome do personagem')).toHaveValue('Érica dos Rios');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Erica-dos-Rios-ficha-dnd5e.pdf');
  const path = testInfo.outputPath('ficha-jogadora.pdf');
  await download.saveAs(path);
  const pdf = await PDFDocument.load(await readFile(path)),
    form = pdf.getForm();
  expect(form.getTextField(textField(0)).getText()).toBe('Érica dos Rios');
  expect(form.getTextField(textField(85)).getText()).toBe('31 anos');
  expect(form.getTextField(textField(86)).getText()).toBe('1,68 m');
  expect(form.getTextField(textField(17)).getText()).toBe(
    'História atual no PDF, ainda sem salvar.',
  );
  expect(form.getTextField(textField(209)).getText()).toBe('Guardiões da ponte');
  expect(form.getTextField(textField(0)).isReadOnly()).toBe(false);
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(state.characters.find((c: any) => c.name === 'Érica dos Rios').biography).toBe(
    'História salva no site.',
  );
  await expect(page.getByRole('status').filter({ hasText: /PDF gerado com/ })).toBeVisible();
});

test('player exports a read-only character on mobile and cannot see other players sheets', async ({
  page,
  request,
}, testInfo) => {
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { rules: { players_can_edit_sheets: false } },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page, fixturePlayer, 'personagens');
  await expect(page.locator('.character-card')).toHaveCount(1);
  await openSheet(page);
  await expect(page.getByLabel('Nome do personagem')).toBeDisabled();
  const button = page.getByRole('button', { name: 'Exportar PDF', exact: true });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true');
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise,
    path = testInfo.outputPath('ficha-consulta.pdf');
  await download.saveAs(path);
  const pdf = await PDFDocument.load(await readFile(path));
  const values = pdf
    .getForm()
    .getFields()
    .filter((f) => f instanceof PDFTextField)
    .map((f) => (f as PDFTextField).getText())
    .join('\n');
  expect(values).toContain('Lyra Ventolume');
  expect(values).not.toContain('Thorin Barba de Ferro');
  const box = await button.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('ficha-mobile.png'), fullPage: true });
});

test('export recovers from an asset error and embeds a selected portrait without uploading it', async ({
  page,
}, testInfo) => {
  await openFixturePage(page, fixturePlayer, 'personagens');
  await openSheet(page);
  await page.route('**/character-sheet/dnd5e-editable-v1.pdf', (route) =>
    route.fulfill({ status: 503, body: '' }),
  );
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click();
  await expect(
    page.getByText('Não foi possível carregar o modelo da ficha PDF.', { exact: false }),
  ).toBeVisible();
  await page.unroute('**/character-sheet/dnd5e-editable-v1.pdf');
  const png = await readFile('public/images/fortress.webp');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'retrato.webp', mimeType: 'image/webp', buffer: png });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click();
  const download = await downloadPromise,
    path = testInfo.outputPath('ficha-com-retrato.pdf');
  await download.saveAs(path);
  const pdf = await PDFDocument.load(await readFile(path));
  const normal = pdf
    .getForm()
    .getButton('Image78_af_image')
    .acroField.getWidgets()[0]
    .getAppearances()?.normal;
  expect(normal).toBeInstanceOf(PDFStream);
  await expect(page.getByRole('status').filter({ hasText: /PDF gerado com/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /retrato não pôde/ })).toHaveCount(0);
});
