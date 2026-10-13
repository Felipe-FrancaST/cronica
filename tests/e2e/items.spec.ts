import { expect, type Page } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';
import { ITEM_STARTERS, grantedInventoryItem } from '../../src/features/items/model';
import type { CampaignItem } from '../../src/features/items/types';
const seed = createDemoWorkspace(),
  campaign = seed.campaigns[0].id,
  fixture = 'http://127.0.0.1:54329';
async function openItems(page: Page, id = DEMO_USER_ID, path = 'itens') {
  const token =
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') +
    '.' +
    Buffer.from(
      JSON.stringify({
        sub: id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'authenticated',
        role: 'authenticated',
      }),
    ).toString('base64url') +
    '.test-signature';
  const session = {
    access_token: token,
    refresh_token: 'local-test-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id,
      email: seed.profiles.find((p) => p.id === id)!.email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
  };
  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
      domain: 'localhost',
      path: '/',
    },
  ]);
  await page.addInitScript(({ id, mode }) => localStorage.setItem(`cronica:mode:${id}`, mode), {
    id,
    mode: id === DEMO_USER_ID ? 'master' : 'player',
  });
  await page.goto(`/campanhas/${campaign}/${path}`);
}
test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/__fixture/reset`);
});

test('master creates a multifunction item, publishes it, delivers a snapshot and duplicates the model', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openItems(page);
  await page.getByRole('button', { name: 'Criar item', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Criar item', exact: true });
  await dialog.getByLabel('Começar de um modelo').selectOption('wand');
  await dialog.getByLabel('Nome do item', { exact: true }).fill('Varinha do sol');
  await dialog.getByLabel('Etiquetas', { exact: true }).fill('magia, recompensa');
  await dialog.getByRole('tab', { name: 'Funções e bônus', exact: true }).click();
  await expect(dialog.getByLabel('Nome da função 2')).toHaveValue('Cone de chamas');
  await dialog.getByLabel('Bônus de CA', { exact: true }).fill('1');
  await dialog.getByRole('tab', { name: 'Visibilidade e segredos', exact: true }).click();
  await dialog.getByLabel('Publicar no catálogo dos jogadores').check();
  await dialog.getByLabel('Notas secretas do mestre').fill('Maldição secreta de teste');
  await dialog.getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Varinha do sol', exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.getByText('2 funções', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Entregar', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Entregar Varinha do sol', exact: true });
  const hero = seed.characters.find((c) => c.campaign_id === campaign)!;
  await dialog.getByLabel('Personagem que receberá').selectOption(hero.id);
  await dialog.getByRole('button', { name: 'Confirmar entrega', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(`${hero.name} · 1 un.`, { exact: false })).toBeVisible();
  await card.getByRole('button', { name: 'Ver item', exact: true }).click();
  await expect(page.getByText('Maldição secreta de teste', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await card.getByRole('button', { name: 'Duplicar Varinha do sol', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Criar item', exact: true });
  await expect(dialog.getByLabel('Nome do item', { exact: true })).toHaveValue(
    'Varinha do sol (cópia)',
  );
  await dialog.getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Varinha do sol (cópia)', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('itens-oficina.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Varinha do sol', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  const state = await (await request.get(`${fixture}/__fixture/state`)).json();
  expect(
    state.characters
      .find((c: { id: string }) => c.id === hero.id)
      .sheet.inventory.some(
        (i: { name: string; campaign_item_id?: string }) =>
          i.name === 'Varinha do sol' && i.campaign_item_id,
      ),
  ).toBe(true);
});

test('player reads a published item without master secrets or creation controls', async ({
  page,
  request,
}) => {
  await openItems(page);
  await page.getByRole('button', { name: 'Criar item', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar item', exact: true });
  await dialog.getByLabel('Começar de um modelo').selectOption('key');
  await dialog.getByLabel('Nome do item', { exact: true }).fill('Chave da torre');
  await dialog.getByRole('tab', { name: 'Visibilidade e segredos', exact: true }).click();
  await dialog.getByLabel('Publicar no catálogo dos jogadores').check();
  await dialog.getByLabel('Notas secretas do mestre').fill('A chave também abre o cofre secreto.');
  await dialog.getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await openItems(page, seed.profiles[1].id);
  await expect(page.getByRole('heading', { name: 'Chave da torre', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar item', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver item', exact: true }).click();
  await expect(page.getByText('Abrir o selo', { exact: true })).toBeVisible();
  await expect(page.getByText('A chave também abre o cofre secreto.', { exact: true })).toHaveCount(
    0,
  );
  expect((await request.get(`${fixture}/health`)).ok()).toBe(true);
});

test('item creation validates resource costs and fits a phone viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openItems(page);
  await page.getByRole('button', { name: 'Criar item', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar item', exact: true });
  await dialog.getByLabel('Começar de um modelo').selectOption('charm');
  await dialog.getByRole('tab', { name: 'Funções e bônus', exact: true }).click();
  await dialog.getByLabel('Cargas por uso 1', { exact: true }).fill('4');
  await dialog.getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect(dialog.getByText(/custo em cargas ultrapassa/)).toBeVisible();
  await dialog.getByLabel('Cargas por uso 1', { exact: true }).fill('1');
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 2)).toBe(true);
  await dialog.screenshot({ path: info.outputPath('itens-celular.png') });
  await dialog.getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('a delivered item offers distinct functions, sends the selected function and spends only its configured resources', async ({
  page,
  request,
}) => {
  const initial = await (await request.get(`${fixture}/__fixture/state`)).json();
  const actor = initial.characters.find(
    (c: { id: string }) => c.id === initial.tokens[0].character_id,
  );
  const data = ITEM_STARTERS.find((s) => s.id === 'charm')!.create();
  data.name = 'Amuleto da aurora';
  data.attunement = false;
  data.functions[0].kind = 'healing';
  data.functions[0].name = 'Restaurar vigor';
  data.functions[0].charge_cost = 2;
  data.functions.push({
    ...data.functions[0],
    id: crypto.randomUUID(),
    name: 'Acender o selo',
    kind: 'utility',
    dice: '',
    cost: 'free',
    charge_cost: 1,
  });
  const item: CampaignItem = {
    id: crypto.randomUUID(),
    campaign_id: campaign,
    name: data.name,
    data,
    visible_to_players: false,
    archived: false,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      actorSheet: {
        ...actor.sheet,
        hp_current: 5,
        hp_max_override: 40,
        inventory: [grantedInventoryItem(item, 1)],
      },
    },
  });
  await openItems(page, seed.profiles[1].id, 'mesa/grid');
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Usar item', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Usar item', exact: true });
  await expect(picker.getByRole('button', { name: /Restaurar vigor/ })).toBeVisible();
  await expect(picker.getByRole('button', { name: /Acender o selo/ })).toBeVisible();
  await picker.getByRole('button', { name: /Restaurar vigor/ }).click();
  await expect(page.locator('.vtt-target-card')).toContainText('Restaurar vigor');
  await page.getByRole('button', { name: 'Enviar ao mestre', exact: true }).click();
  await expect(page.getByText('Aguardando o mestre', { exact: true })).toBeVisible();
  let current = await (await request.get(`${fixture}/__fixture/state`)).json();
  expect(current.actions[0].definition.item_function_id).toBe(data.functions[0].id);
  expect(current.actions[0].cost).toBe('bonus');
  await openItems(page, DEMO_USER_ID, 'mesa/grid');
  await page
    .getByRole('region', { name: 'Tentativa Amuleto da aurora · Restaurar vigor', exact: true })
    .getByRole('button', { name: 'Sucesso', exact: true })
    .click();
  await openItems(page, seed.profiles[1].id, 'mesa/grid');
  const result = page.getByRole('dialog', { name: 'Sucesso', exact: true });
  await result.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(result).toContainText(/Você curou \d+ PV/);
  current = await (await request.get(`${fixture}/__fixture/state`)).json();
  const inventory = current.characters.find((c: { id: string }) => c.id === actor.id).sheet
    .inventory;
  expect(inventory[0].charges_used).toBe(2);
  expect(inventory[0].quantity).toBe(1);
  expect(current.tokens[0].bonus_used).toBe(true);
  expect(current.tokens[0].action_used).toBe(false);
  expect(current.tokens[0].movement_remaining).toBe(initial.tokens[0].movement_remaining);
  await page.reload();
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Usar item', exact: true }).click();
  await expect(picker.getByRole('button', { name: /Restaurar vigor/ })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: /Acender o selo/ })).toBeEnabled();
});
