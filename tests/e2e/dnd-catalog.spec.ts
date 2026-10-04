import { expect, type Page } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { createDemoWorkspace } from '../../src/lib/demo-data';
const campaign = createDemoWorkspace().campaigns[0].id;
async function newCharacter(page: Page, name: string, classId: string, level: number) {
  await page.goto(`/campanhas/${campaign}/personagens`);
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).first().click();
  await page.getByLabel('Nome do personagem').fill(name);
  await page.getByLabel('Classe', { exact: true }).selectOption(classId);
  await page.getByLabel('Nível', { exact: true }).fill(String(level));
}
async function addSpell(page: Page, query: string, choose?: RegExp) {
  await page.getByRole('button', { name: 'Catálogo de magias', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Catálogo de magias e truques', exact: true });
  await dialog.getByLabel('Buscar magia').fill(query);
  if (choose) await dialog.getByRole('button', { name: choose }).click();
  await dialog.getByRole('button', { name: 'Adicionar à ficha', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Já está na ficha', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
}
async function reopen(page: Page, name: string) {
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .getByRole('button', { name: 'Abrir ficha', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
}
test('the compendium filters Portuguese/English spells and displays class and race references on desktop and mobile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/compendio');
  await expect(page.getByRole('heading', { name: 'Compêndio D&D 5e' })).toBeVisible();
  await page.getByLabel('Buscar magia').fill('fireball');
  await page.getByLabel('Círculo', { exact: true }).selectOption('3');
  await expect(page.getByRole('status').filter({ hasText: '1 resultado' })).toBeVisible();
  await expect(page.locator('.spell-description')).toContainText('8d6');
  await page.screenshot({ path: 'docs/dnd-compendium-desktop.png', fullPage: true });
  await page.getByLabel('Classe da magia').selectOption('cleric');
  await expect(page.getByText('Nenhuma magia encontrada.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Classes', exact: true }).click();
  await expect(page.locator('.reference-card')).toHaveCount(13);
  await expect(page.getByRole('heading', { name: 'Artífice', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Raças e linhagens' }).click();
  await page.getByLabel('Buscar raça').fill('Centauro');
  await expect(page.locator('.reference-card')).toHaveCount(1);
  await expect(page.locator('.reference-card')).toContainText('12 m');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Magias e truques' }).click();
  await page.getByLabel('Buscar magia').fill('orientacao');
  await page.getByLabel('Círculo', { exact: true }).selectOption('0');
  await expect(page.getByRole('heading', { name: 'Orientação', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/dnd-compendium-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('a Wizard chooses a sourced race, imports spells, casts, saves and recovers slots after reopening', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newCharacter(page, 'Maga do Catálogo', 'wizard', 5);
  await page.getByLabel('Raça', { exact: true }).selectOption('elfo-da-floresta');
  await page.getByRole('tab', { name: 'Combate', exact: true }).click();
  await expect(page.getByText('10.5 m', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await addSpell(page, 'fireball');
  const fire = page.getByRole('region', { name: 'Magia Bola de Fogo', exact: true });
  await fire.getByLabel('Preparada', { exact: true }).check();
  await fire.getByRole('button', { name: 'Conjurar', exact: true }).click();
  await expect(page.getByLabel('Usados · magia 3')).toHaveValue('1');
  await addSpell(page, 'Light', /^Luz\s/);
  const light = page.getByRole('region', { name: 'Magia Luz', exact: true });
  await light.getByRole('button', { name: 'Conjurar', exact: true }).click();
  await expect(page.getByLabel('Usados · magia 3')).toHaveValue('1');
  await page.screenshot({ path: 'docs/dnd-sheet-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Maga do Catálogo', exact: true })).toBeVisible();
  await reopen(page, 'Maga do Catálogo');
  await expect(page.getByLabel('Usados · magia 3')).toHaveValue('1');
  await expect(fire.getByLabel('Preparada', { exact: true })).toBeChecked();
  await fire.getByRole('button', { name: 'Conjurar', exact: true }).click();
  await expect(page.getByLabel('Usados · magia 3')).toHaveValue('2');
  await expect(fire.getByRole('button', { name: 'Conjurar', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Descanso curto', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Descanso longo', exact: true }).click();
  await expect(page.getByLabel('Usados · magia 3')).toHaveValue('0');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await reopen(page, 'Maga do Catálogo');
  await expect(page.getByLabel('Usados · magia 3')).toHaveValue('0');
  await expect(page.getByRole('region', { name: 'Magia Bola de Fogo', exact: true })).toHaveCount(
    1,
  );
  expect(errors).toEqual([]);
});
test('a Warlock tracks pact and Mystic Arcanum separately, with mobile casting and correct rests', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await newCharacter(page, 'Bruxa do Pacto', 'warlock', 11);
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await addSpell(page, 'Hex');
  await addSpell(page, 'True Seeing');
  const hex = page.getByRole('region', { name: 'Magia Praga', exact: true }),
    arc = page.getByRole('region', { name: 'Magia Visão da Verdade', exact: true });
  await hex.getByRole('button', { name: 'Conjurar', exact: true }).click();
  await arc.getByRole('button', { name: 'Conjurar', exact: true }).click();
  await expect(page.getByLabel('Usados · pacto 5')).toHaveValue('1');
  await expect(page.getByLabel('Usados · Arcano Místico 6')).toHaveValue('1');
  await page.getByRole('button', { name: 'Descanso curto', exact: true }).click();
  await expect(page.getByLabel('Usados · pacto 5')).toHaveValue('0');
  await expect(page.getByLabel('Usados · Arcano Místico 6')).toHaveValue('1');
  await expect(arc.getByRole('button', { name: 'Conjurar', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('dialog')
    .last()
    .evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: 'docs/dnd-sheet-mobile.png', fullPage: false });
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await reopen(page, 'Bruxa do Pacto');
  await expect(page.getByLabel('Usados · Arcano Místico 6')).toHaveValue('1');
  await page.getByRole('button', { name: 'Descanso longo', exact: true }).click();
  await expect(page.getByLabel('Usados · Arcano Místico 6')).toHaveValue('0');
});
for (const mobile of [false, true])
  test(`NPCs import canonical spells and use the complete race selector on ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/campanhas/${campaign}/npcs`);
    await page.getByRole('button', { name: 'Criar NPC', exact: true }).first().click();
    await page.getByLabel('Nome', { exact: true }).fill('Guardiã Arcana');
    await page.getByLabel('Raça', { exact: true }).selectOption('aasimar');
    await page.getByLabel('Classe / tipo', { exact: true }).fill('Mago');
    await page.getByRole('tab', { name: 'Ataques e magias' }).click();
    await page.getByRole('button', { name: 'Catálogo de magias', exact: true }).click();
    const dialog = page.getByRole('region', { name: 'Magias do NPC', exact: true });
    await dialog.getByLabel('Buscar magia').fill('fireball');
    await dialog.getByLabel('Círculo', { exact: true }).selectOption('3');
    await dialog.getByRole('button', { name: 'Adicionar à ficha', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Já está na ficha', exact: true }),
    ).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog.getByRole('button', { name: 'Voltar à ficha', exact: true }).click();
    await expect(page.getByLabel('Nome da magia', { exact: true })).toHaveValue('Bola de Fogo');
    await page.getByRole('button', { name: 'Salvar NPC', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Guardiã Arcana', exact: true })).toBeVisible();
  });
