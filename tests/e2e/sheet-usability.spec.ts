import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { openFixturePage, fixturePlayer, fixtureUrl } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { defaultSheet } from '../../src/systems/dnd5e';
import { withClassLevels } from '../../src/systems/dnd5e/progression';
import { ITEM_CATALOG } from '../../src/systems/dnd5e/items';
import { SPELL_CATALOG, spellFromCatalog } from '../../src/systems/dnd5e/spell-catalog';
import { randomUUID } from 'node:crypto';
const abilities = { str: 16, dex: 16, con: 16, int: 16, wis: 16, cha: 16 };
test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});
async function characterState(request: any, patch: any = {}) {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const sheet = withClassLevels(
    {
      ...defaultSheet(),
      abilities,
      hp_current: 8,
      hp_max_override: 100,
      inspiration_count: 0,
      details: { inspiration: false },
    },
    [{ class_id: 'wizard', level: 5 }],
  );
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { status: 'preparing', actorSheet: { ...sheet, ...patch } },
  });
  return state.characters.find((c: any) => c.id === state.tokens[0].character_id);
}
test('new character has an editable header name, clickable portrait, racial box and no experience or player field', async ({
  page,
}) => {
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Nara');
  await expect(page.getByText('Um novo aventureiro', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Experiência', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Jogador', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Características da raça' })).toBeVisible();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Escolher retrato do personagem', exact: true }).click(),
  ]);
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 180;
    const x = c.getContext('2d')!;
    x.fillStyle = '#478966';
    x.fillRect(0, 0, 240, 180);
    return c.toDataURL('image/png').split(',')[1];
  });
  await chooser.setFiles({
    name: 'retrato.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  });
  await expect(page.getByRole('dialog', { name: 'Ajustar imagem', exact: true })).toBeVisible();
});
test('errors stay centered even when the sheet is scrolled to the bottom', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  const notice = page.locator('.action-notice.is-error');
  await expect(notice).toBeVisible();
  const b = (await notice.boundingBox())!;
  expect(Math.abs(b.y + b.height / 2 - 422)).toBeLessThan(12);
  await notice.getByRole('button', { name: 'Fechar aviso' }).click();
  await expect(notice).toHaveCount(0);
});
test('fixed-level multiclass redistributes, saves and reopens coherently', async ({
  page,
  request,
}) => {
  await characterState(request);
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { rules: { party_level: 5, lock_player_level: true, allow_multiclass: true } },
  });
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Abrir ficha', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Classes e habilidades', exact: true }).click();
  await expect(page.getByLabel('Como funcionam as classes e habilidades')).not.toHaveAttribute(
    'open',
    '',
  );
  await page.getByLabel('Nova classe de multiclasse', { exact: true }).selectOption('fighter');
  await page.getByRole('button', { name: 'Adicionar nível de multiclasse', exact: true }).click();
  await expect(page.getByLabel('Nível de Mago', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('Nível de Guerreiro', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Elara/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir ficha', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Classes e habilidades', exact: true }).click();
  await expect(page.getByLabel('Nível de Mago', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('Nível de Guerreiro', { exact: true })).toHaveValue('1');
});
test('GM grants inspiration from the character list; player can consume but cannot grant it', async ({
  page,
  request,
}) => {
  const c = await characterState(request);
  await openFixturePage(page, DEMO_USER_ID, 'personagens');
  const card = page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: c.name, exact: true }) });
  await expect(card.locator('.record-card-footer small')).toHaveCount(0);
  await card.getByRole('button', { name: `Dar inspiração a ${c.name}`, exact: true }).click();
  await expect(card).toContainText('Inspirações: 1');
  await openFixturePage(page, fixturePlayer, 'personagens');
  await expect(page.getByRole('button', { name: /Dar inspiração/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Usar inspiração', exact: true }).first().click();
  await expect(page.locator('.character-card').first()).toContainText('Inspirações: 0');
});
test('rest opens directly from the list, follows the permission rule, and heals on a long rest', async ({
  page,
  request,
}) => {
  const c = await characterState(request);
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { rules: { players_can_rest: false } },
  });
  await openFixturePage(page, fixturePlayer, 'personagens');
  const blocked = page.getByRole('button', { name: 'Descansar', exact: true }).first();
  await expect(blocked).toBeDisabled();
  await blocked.click({ force: true });
  await expect(page.locator('.action-notice')).toContainText('O mestre controla os descansos');
  await openFixturePage(page, DEMO_USER_ID, 'personagens');
  await page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: c.name, exact: true }) })
    .getByRole('button', { name: 'Descansar', exact: true })
    .click();
  await page.getByLabel('Tipo de descanso', { exact: true }).selectOption('long');
  await page.getByRole('checkbox', { name: /O tempo necessário passou/ }).check();
  await page.getByRole('button', { name: 'Executar descanso', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Descanso concluído', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('→ 100');
});
test('equipment and spell preparation icons toggle without opening their descriptions', async ({
  page,
  request,
}) => {
  const item = {
    ...ITEM_CATALOG.find((i) => i.name === 'Espada longa')!,
    id: randomUUID(),
    quantity: 1,
    weight: 1.5,
    equipped: false,
    notes: '',
  };
  const spell = spellFromCatalog(
    SPELL_CATALOG.find((s) => s.english_name === 'Magic Missile')!,
    randomUUID(),
    'wizard',
  );
  await characterState(request, {
    inventory: [{ ...item, equipped: false }],
    spells: [{ ...spell, prepared: false }],
  });
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Abrir ficha', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Equipamentos', exact: true }).click();
  const inv = page.locator('details.inventory-entry').first();
  await expect(inv).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Equipar Espada longa', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Desequipar Espada longa', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(inv).not.toHaveAttribute('open', '');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  const card = page.getByLabel(`Magia ${spell.name}`, { exact: true });
  await expect(card).not.toHaveAttribute('open', '');
  await card.getByRole('button', { name: `Preparar ${spell.name}`, exact: true }).click();
  await expect(
    card.getByRole('button', { name: `Despreparar ${spell.name}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(card).not.toHaveAttribute('open', '');
  await card.locator('summary').first().click();
  await expect(card.locator('.spell-description')).toBeVisible();
});
