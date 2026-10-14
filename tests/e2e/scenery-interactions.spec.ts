import { expect, type Page } from '@playwright/test';
import { test } from '../helpers/browser-test';
import {
  openFixturePage,
  fixtureUrl,
  fixturePlayer,
  fixtureCell,
  fixtureTopView,
} from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';

test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { status: 'preparing' } });
});
async function place(page: Page, name: string, x: number, y: number, label: string) {
  await fixtureTopView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByLabel('Nome do elemento', { exact: true }).fill(label);
  const p = await fixtureCell(page, x, y);
  await page.mouse.click(p.x, p.y);
  return page.getByRole('dialog', { name: `Configurar ${label}`, exact: true });
}

test('GM places a locked chest, creates and delivers its key; the player unlocks, reveals and collects treasure once', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openFixturePage(page, DEMO_USER_ID, 'itens');
  await page.getByRole('button', { name: 'Criar item', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Criar item', exact: true });
  await dialog.getByLabel('Começar de um modelo').selectOption('cloak');
  await dialog.getByLabel('Nome do item', { exact: true }).fill('Manto do guardião');
  await dialog.getByRole('tab', { name: 'Visibilidade e segredos', exact: true }).click();
  await dialog.getByLabel('Notas secretas do mestre').fill('Segredo da recompensa');
  await dialog.getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await openFixturePage(page);
  dialog = await place(page, 'Baú', 3, 4, 'Baú do guardião');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Item dentro do recipiente').selectOption({ label: 'Manto do guardião' });
  await dialog.getByLabel('Exigir chave para abrir').check();
  await dialog.getByLabel('Nome da chave').fill('Chave do guardião');
  const saveRequest = page.waitForRequest(
    (r) => r.url().endsWith('/rpc/save_scenery_element') && r.method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  const payload = (await saveRequest).postDataJSON();
  expect(payload.p_object).not.toHaveProperty('created_at');
  expect(payload.p_object).not.toHaveProperty('updated_at');
  expect(payload.p_expected_updated_at).toBeNull();
  await expect(dialog).toHaveCount(0);
  let state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.objects).toHaveLength(1);
  expect(state.objects[0].metadata.interaction_locked).toBe(true);
  expect(state.campaignItems.some((i: { name: string }) => i.name === 'Chave do guardião')).toBe(
    true,
  );
  const createdChest = state.objects[0];
  await page
    .getByRole('region', { name: 'Interações do cenário', exact: true })
    .getByRole('button', { name: 'Configurar Baú do guardião', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Configurar Baú do guardião', exact: true });
  await expect(dialog.getByLabel('Nome da chave')).toHaveValue('Chave do guardião');
  const editRequest = page.waitForRequest(
    (r) => r.url().endsWith('/rpc/save_scenery_element') && r.method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  const editedPayload = (await editRequest).postDataJSON();
  expect(editedPayload.p_object).not.toHaveProperty('created_at');
  expect(editedPayload.p_object).not.toHaveProperty('updated_at');
  expect(editedPayload.p_expected_updated_at).toBe(createdChest.updated_at);
  await expect(dialog).toHaveCount(0);
  state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.objects[0].created_at).toBe(createdChest.created_at);
  expect(
    state.campaignItems.filter((i: { name: string }) => i.name === 'Chave do guardião'),
  ).toHaveLength(1);
  await openFixturePage(page, DEMO_USER_ID, 'itens');
  const keyCard = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Chave do guardião', exact: true }) });
  await keyCard.getByRole('button', { name: 'Entregar', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Entregar Chave do guardião', exact: true });
  await dialog.getByRole('button', { name: 'Confirmar entrega', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await openFixturePage(page, fixturePlayer);
  await fixtureTopView(page);
  await page.getByRole('button', { name: 'Selecionar elemento no Grid', exact: true }).click();
  const chestPoint = await fixtureCell(page, 3, 4);
  await page.mouse.click(chestPoint.x, chestPoint.y);
  dialog = page.getByRole('dialog', { name: 'Interagir com Baú do guardião', exact: true });
  await expect(dialog.getByRole('status')).toContainText('Baú trancado');
  await expect(dialog.getByRole('heading', { name: 'Manto do guardião', exact: true })).toHaveCount(
    0,
  );
  await dialog.getByRole('button', { name: 'Usar chave e abrir', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Baú trancado');
  await dialog.getByLabel('Chave do inventário').selectOption({ label: 'Chave do guardião' });
  await dialog.getByRole('button', { name: 'Usar chave e abrir', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Manto do guardião', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText('Segredo da recompensa', { exact: true })).toHaveCount(0);
  await dialog.screenshot({ path: info.outputPath('bau-recompensa.png') });
  await dialog.getByRole('button', { name: 'Pegar item', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('inventário');
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const character = state.characters.find(
    (c: { id: string }) => c.id === state.tokens[0].character_id,
  );
  expect(
    character.sheet.inventory.filter((i: { name: string }) => i.name === 'Manto do guardião'),
  ).toHaveLength(1);
  expect(
    character.sheet.inventory.find((i: { name: string }) => i.name === 'Chave do guardião')
      .quantity,
  ).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Interagir com Baú do guardião', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Interagir com Baú do guardião', exact: true });
  await expect(dialog.getByRole('button', { name: 'Pegar item', exact: true })).toHaveCount(0);
  await expect(dialog.getByText('O conteúdo já foi recolhido.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('scenery interactions fit long names and three actions without nested scrolling on desktop, tablet and phone', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const names = [
    'Baú dos tesouros esquecidos do guardião ancestral das profundezas da fortaleza',
    'Porta' + 'Encantada'.repeat(9),
    'Lanterna da entrada',
    'Sarcófago do rei',
    'Caixote de provisões',
    'Tocha do corredor',
    'Grade da masmorra',
    'Fogueira do acampamento',
  ];
  const kinds = [
    'chest',
    'door',
    'lanternpost',
    'sarcophagus',
    'supplycrate',
    'torch',
    'portcullis',
    'campfire',
  ];
  await request.post(`${fixtureUrl}/__fixture/scenario`, {
    data: {
      objects: kinds.map((kind, i) => ({
        id: 'layout-element-' + i,
        map_id: state.map.id,
        object_type: kind,
        geometry: { x: 4 + i, y: 7, width: 1, height: 1, rotation: 0 },
        z: 0,
        visible: true,
        blocks_movement: false,
        blocks_vision: false,
        metadata: {
          name: names[i],
          variant: 'default',
          has_key: !['torch', 'lanternpost', 'campfire'].includes(kind),
          interaction_locked: true,
        },
        created_at: '2026-10-14T12:00:00Z',
        updated_at: '2026-10-14T12:00:00Z',
      })),
    },
  });
  await openFixturePage(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  const section = page.getByRole('region', { name: 'Interações do cenário', exact: true });
  const list = section.getByRole('list');
  await expect(list.getByRole('listitem')).toHaveCount(8);
  await expect(list.getByRole('listitem').first().getByRole('button')).toHaveCount(3);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(section).toBeVisible();
    const layout = await list.evaluate((el) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        fitsViewport: r.left >= -2 && r.right <= window.innerWidth + 2,
        hasNestedScroll: ['auto', 'scroll'].includes(style.overflowY),
        hasClippedHeight: el.scrollHeight > el.clientHeight + 2,
        hasHorizontalOverflow: el.scrollWidth > el.clientWidth + 2,
        cardsFit: [...el.children].every((card) => {
          const box = card.getBoundingClientRect();
          const buttons = [...card.querySelectorAll('button')];
          const info = card.querySelector('.vtt-scenery-interaction-info')!.getBoundingClientRect();
          return (
            box.left >= r.left - 2 &&
            box.right <= r.right + 2 &&
            buttons.every((button, i) => {
              const b = button.getBoundingClientRect();
              return (
                b.left >= box.left - 2 &&
                b.right <= box.right + 2 &&
                b.bottom <= box.bottom + 2 &&
                b.top >= info.bottom - 2 &&
                button.scrollWidth <= button.clientWidth + 2 &&
                buttons.slice(i + 1).every((other) => {
                  const o = other.getBoundingClientRect();
                  return (
                    Math.min(b.right, o.right) - Math.max(b.left, o.left) < 2 ||
                    Math.min(b.bottom, o.bottom) - Math.max(b.top, o.top) < 2
                  );
                })
              );
            })
          );
        }),
      };
    });
    expect(layout, `layout at ${width}px`).toEqual({
      fitsViewport: true,
      hasNestedScroll: false,
      hasClippedHeight: false,
      hasHorizontalOverflow: false,
      cardsFit: true,
    });
    await list.getByRole('listitem').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`interacoes-cenario-${width}.png`) });
  }
  await section
    .getByRole('button', { name: 'Apagar: Lanterna da entrada em 6,7', exact: true })
    .click();
  await expect(
    section.getByRole('button', { name: 'Acender: Lanterna da entrada em 6,7', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('a chest without a key opens freely; a locked door explains the missing key on a phone', async ({
  page,
  request,
}, info) => {
  await openFixturePage(page);
  let dialog = await place(page, 'Baú', 3, 4, 'Baú sem chave');
  await expect(dialog.getByLabel('Exigir chave para abrir')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.getByRole('button', { name: 'Porta de masmorra', exact: true }).click();
  await page.getByLabel('Nome do elemento', { exact: true }).fill('Porta da torre');
  const p = await fixtureCell(page, 1, 4);
  await page.mouse.click(p.x, p.y);
  dialog = page.getByRole('dialog', { name: 'Configurar Porta da torre', exact: true });
  await dialog.getByLabel('Exigir chave para abrir').check();
  await dialog.getByLabel('Nome da chave').fill('Chave da torre');
  await dialog.getByRole('button', { name: 'Salvar elemento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page, fixturePlayer);
  await page.getByRole('button', { name: 'Interagir com Baú sem chave', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Interagir com Baú sem chave', exact: true });
  await expect(dialog.getByRole('status')).toContainText('sem chave');
  await dialog.getByRole('button', { name: 'Abrir elemento', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('aberto');
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await page.getByRole('button', { name: 'Interagir com Porta da torre', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Interagir com Porta da torre', exact: true });
  await expect(dialog.getByRole('status')).toContainText('Porta trancada');
  await dialog.getByRole('button', { name: 'Usar chave e abrir', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Porta trancada');
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 2)).toBe(true);
  await dialog.screenshot({ path: info.outputPath('porta-trancada-celular.png') });
  expect((await request.get(`${fixtureUrl}/health`)).ok()).toBe(true);
});

test('master configures warm light, extinguishes torches and sees all new adventure pieces in both renderers', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|Shader|WebGL/.test(m.text())) errors.push(m.text());
  });
  await openFixturePage(page);
  await fixtureTopView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: 'Aventura', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Poste de lanterna', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Poste de lanterna', exact: true }).click();
  await page.getByLabel('Intensidade da luz').fill('1.8');
  await expect(page.getByLabel('Cor da luz')).toHaveValue('#ffd4a0');
  await page.getByLabel('Nome do elemento', { exact: true }).fill('Lanterna da praça');
  let p = await fixtureCell(page, 5, 6);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(
      async () =>
        (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).objects.length,
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Concluir edição', exact: true }).click();
  await page.getByRole('button', { name: 'Apagar: Lanterna da praça em 5,6', exact: true }).click();
  let state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.objects[0].metadata.light_enabled).toBe(false);
  await page
    .getByRole('button', { name: 'Acender: Lanterna da praça em 5,6', exact: true })
    .click();
  const kinds = [
    'candelabra',
    'fireplace',
    'beacon',
    'gong',
    'pressureplate',
    'secretwall',
    'supplycrate',
  ];
  state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  await request.post(`${fixtureUrl}/__fixture/scenario`, {
    data: {
      objects: [
        ...state.objects,
        ...kinds.map((kind, i) => ({
          id: 'adventure-' + i,
          map_id: state.map.id,
          object_type: kind,
          geometry: { x: 4 + i, y: 7, width: 1, height: 1, rotation: 0 },
          z: 0,
          visible: true,
          blocks_movement: false,
          blocks_vision: false,
          metadata: { variant: 'default' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
      ],
      lighting: 'night',
    },
  });
  await page.reload();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Superior', exact: true }).click();
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: info.outputPath('luzes-aventura-3d.png') });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page
    .getByLabel('Mapa tático interativo', { exact: true })
    .screenshot({ path: info.outputPath('luzes-aventura-2d.png') });
  expect(errors).toEqual([]);
});
