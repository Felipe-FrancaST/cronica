import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test } from '../helpers/browser-test';
import {
  openFixturePage,
  fixtureUrl,
  fixturePlayer,
  fixtureTopView,
  fixtureCell,
  chooseScenery,
  expandSceneryInteractions,
} from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { makeScenery, sceneryDefaults } from '../../src/features/vtt/scenery';
import { COIN_TYPES } from '../../src/systems/dnd5e/currency';
import type { BattleMapObject } from '../../src/features/vtt/types';

test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { status: 'preparing' } });
});
async function place(page: Page, name: string, label: string) {
  await fixtureTopView(page);
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  const tools = await chooseScenery(page, name);
  await tools.getByLabel('Nome do elemento', { exact: true }).fill(label);
  const p = await fixtureCell(page, 3, 4);
  await page.mouse.click(p.x, p.y);
  return page.getByRole('dialog', { name: `Configurar ${label}`, exact: true });
}
async function configure(page: Page, label: string) {
  const tools = await expandSceneryInteractions(page);
  await tools.getByLabel('Buscar interação').fill(label);
  await tools.getByRole('button', { name: `Configurar ${label}`, exact: true }).click();
  return page.getByRole('dialog', { name: `Configurar ${label}`, exact: true });
}
function object(map: string, kind: string, label: string, x = 3, y = 4): BattleMapObject {
  return {
    ...makeScenery(
      map,
      { x, y },
      { kind: kind as 'lever', width: 1, height: 1, rotation: 0, ...sceneryDefaults(kind) },
    ),
    id: randomUUID(),
    metadata: { name: label, variant: 'default' },
    created_at: '2026-10-14T12:00:00Z',
    updated_at: '2026-10-14T12:00:00Z',
  };
}

test('master defines all five coins on a treasure pile and the player collects them into the sheet exactly once', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const initial = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const hero = initial.characters.find(
    (c: { id: string }) => c.id === initial.tokens[0].character_id,
  );
  const amounts = { cp: 31, sp: 12, ep: 4, gp: 125, pp: 2 };
  await openFixturePage(page);
  let dialog = await place(page, 'Pilha de tesouro', 'Ouro dos bandidos');
  for (const coin of COIN_TYPES)
    await dialog
      .getByLabel(`${coin.name} (${coin.short})`, { exact: true })
      .fill(String(amounts[coin.id]));
  await dialog.getByLabel('Texto ao interagir').fill('Uma moeda traz o brasão da torre.');
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const configured = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(configured.scenerySettings[0][1].coins).toEqual(amounts);
  expect(JSON.stringify(configured.objects[0].metadata)).not.toContain('125');
  await openFixturePage(page, fixturePlayer);
  await page.getByRole('button', { name: 'Interagir com Ouro dos bandidos', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Interagir com Ouro dos bandidos', exact: true });
  await expect(dialog.getByText('Moedas encontradas', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Examinar elemento', exact: true }).click();
  await expect(dialog).toContainText('31 PC · 12 PP · 4 PE · 125 PO · 2 PL');
  await expect(dialog.getByRole('region', { name: 'Pista revelada' })).toContainText(
    'brasão da torre',
  );
  await dialog.screenshot({ path: info.outputPath('tesouro-revelado.png') });
  await dialog.getByRole('button', { name: 'Recolher moedas', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('somadas à sua ficha');
  await expect(dialog.getByRole('button', { name: 'Recolher moedas', exact: true })).toHaveCount(0);
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const after = state.characters.find((c: { id: string }) => c.id === hero.id);
  for (const { id } of COIN_TYPES)
    expect(after.sheet.currency[id]).toBe(hero.sheet.currency[id] + amounts[id]);
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await page.getByRole('button', { name: 'Interagir com Ouro dos bandidos', exact: true }).click();
  await expect(dialog).toContainText('já foi recolhido');
  await expect(dialog.getByRole('button', { name: 'Recolher moedas', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a chest reveals an item and coins together and the master must explicitly refill a collected reward', async ({
  page,
  request,
}) => {
  await openFixturePage(page, DEMO_USER_ID, 'itens');
  await page.getByRole('button', { name: 'Criar item', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Criar item', exact: true });
  await dialog.getByLabel('Começar de um modelo').selectOption('healing');
  await dialog.getByLabel('Nome do item', { exact: true }).fill('Poção do explorador');
  await dialog.getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await openFixturePage(page);
  dialog = await place(page, 'Baú', 'Baú da recompensa');
  await dialog
    .getByLabel('Item dentro do recipiente')
    .selectOption({ label: 'Poção do explorador' });
  await dialog.getByLabel('Ouro (PO)', { exact: true }).fill('40');
  await dialog.getByLabel('Prata (PP)', { exact: true }).fill('8');
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await openFixturePage(page, fixturePlayer);
  await page.getByRole('button', { name: 'Interagir com Baú da recompensa', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Interagir com Baú da recompensa', exact: true });
  await expect(
    dialog.getByRole('heading', { name: 'Poção do explorador', exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Abrir elemento', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Poção do explorador', exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText('8 PP · 40 PO');
  await dialog.getByRole('button', { name: 'Recolher item e moedas', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Recolher item e moedas', exact: true }),
  ).toHaveCount(0);
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(
    state.itemDeliveries.filter(
      (delivery: { item_name: string }) => delivery.item_name === 'Poção do explorador',
    ),
  ).toHaveLength(1);
  await openFixturePage(page);
  dialog = await configure(page, 'Baú da recompensa');
  await expect(dialog).toContainText('Conteúdo recolhido');
  await dialog.getByLabel('Ouro (PO)', { exact: true }).fill('75');
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).scenerySettings[0][1].taken,
  ).toBe(true);
  dialog = await configure(page, 'Baú da recompensa');
  await dialog.getByLabel('Repor o conteúdo já recolhido').check();
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).scenerySettings[0][1].taken,
  ).toBe(false);
});

test('players operate a configured lever and see its linked doorway change in the same response', async ({
  page,
  request,
}) => {
  const initial = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const door = object(initial.map.id, 'door', 'Portão da cripta', 8, 8),
    lever = object(initial.map.id, 'lever', 'Alavanca da cripta');
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { objects: [door, lever] } });
  await openFixturePage(page);
  let dialog = await configure(page, 'Alavanca da cripta');
  await dialog.getByLabel('Controlar elemento').selectOption(door.id);
  await dialog.getByLabel('Texto ao interagir').fill('A grade range e sobe.');
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await openFixturePage(page, fixturePlayer);
  await page.getByRole('button', { name: 'Interagir com Alavanca da cripta', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Interagir com Alavanca da cripta', exact: true });
  const response = page.waitForResponse((r) => r.url().endsWith('/rpc/interact_scenery'));
  await dialog.getByRole('button', { name: 'Acionar alavanca', exact: true }).click();
  const result = await (await response).json();
  expect(result.changed_objects[0].id).toBe(door.id);
  expect(result.changed_objects[0].blocks_movement).toBe(false);
  await expect(dialog.getByRole('region', { name: 'Pista revelada' })).toContainText(
    'A grade range e sobe.',
  );
  await dialog.getByRole('button', { name: 'Repor mecanismo', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Mecanismo reposto');
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.objects.find((o: BattleMapObject) => o.id === door.id).blocks_movement).toBe(true);
});

test('master mechanisms update linked lights without reloading the map', async ({
  page,
  request,
}) => {
  const initial = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const light = object(initial.map.id, 'beacon', 'Cristal do salão', 8, 8),
    plate = object(initial.map.id, 'pressureplate', 'Placa da luz');
  light.metadata.light_enabled = false;
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { objects: [light, plate] } });
  await openFixturePage(page);
  const dialog = await configure(page, 'Placa da luz');
  await dialog.getByLabel('Controlar elemento').selectOption(light.id);
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const tools = await expandSceneryInteractions(page);
  await tools.getByLabel('Buscar interação').fill('Placa da luz');
  const reads: string[] = [];
  const listener = (r: import('@playwright/test').Request) => {
    if (r.method() === 'GET' && r.url().includes('/rest/v1/')) reads.push(r.url());
  };
  page.on('request', listener);
  await tools
    .getByRole('button', { name: 'Pressionar placa: Placa da luz em 3,4', exact: true })
    .click();
  await expect(
    tools.getByRole('button', { name: 'Repor mecanismo: Placa da luz em 3,4', exact: true }),
  ).toBeVisible();
  await tools.getByLabel('Buscar interação').fill('Cristal do salão');
  await expect(
    tools.getByRole('button', { name: 'Apagar: Cristal do salão em 8,8', exact: true }),
  ).toBeVisible();
  page.off('request', listener);
  expect(reads).toEqual([]);
});

test.describe('mobile scenery rewards', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('clues, harvesting and player permissions fit a phone and stay inside the dialog', async ({
    page,
    request,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const initial = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
    const flowers = object(initial.map.id, 'flowers', 'Jardim de ervas'),
      sign = object(initial.map.id, 'signpost', 'Inscrição antiga', 3, 5);
    await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { objects: [flowers, sign] } });
    await openFixturePage(page);
    let dialog = await configure(page, 'Jardim de ervas');
    await dialog.getByLabel('Cobre (PC)', { exact: true }).fill('17');
    await dialog.getByLabel('Texto ao interagir').fill('Entre as raízes há uma bolsa de moedas.');
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    await dialog.screenshot({ path: info.outputPath('recompensa-celular.png') });
    await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    dialog = await configure(page, 'Inscrição antiga');
    await dialog.getByLabel('Texto ao interagir').fill('A porta exige um juramento.');
    await dialog.getByLabel('Permitir interação dos jogadores').uncheck();
    await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await openFixturePage(page, fixturePlayer);
    await page.getByRole('button', { name: 'Interagir com Jardim de ervas', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Interagir com Jardim de ervas', exact: true });
    await dialog.getByRole('button', { name: 'Procurar recursos', exact: true }).click();
    await expect(dialog).toContainText('Entre as raízes há uma bolsa de moedas.');
    await dialog.getByRole('button', { name: 'Recolher moedas', exact: true }).click();
    await expect(dialog).toContainText('O conteúdo já foi recolhido');
    await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
    await page.getByRole('button', { name: 'Interagir com Inscrição antiga', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Interagir com Inscrição antiga', exact: true });
    await expect(dialog.getByRole('status')).toContainText('controlado pelo mestre');
    await expect(
      dialog.getByRole('button', { name: 'Ler e investigar', exact: true }),
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(dialog.getByText('A porta exige um juramento.', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
