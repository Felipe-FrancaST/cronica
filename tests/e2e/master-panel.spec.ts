import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import {
  openFixturePage,
  fixtureUrl,
  fixtureTopView,
  fixtureCell,
  openMasterTool,
  chooseScenery,
  openCamera,
  fixturePlayer,
} from '../helpers/fixture-page';

test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { status: 'preparing' } });
});

test('the master starts with six compact tools and opens camera controls only on request', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openFixturePage(page);
  const panel = page.getByRole('complementary', { name: 'Painel da batalha' });
  await expect(panel.getByRole('tab', { name: 'Cenário', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(panel.getByRole('button', { name: /^Abrir / })).toHaveCount(6);
  await expect(page.getByLabel('Nome do elemento', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Período do grid')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Superior', exact: true })).toBeHidden();
  expect((await panel.boundingBox())!.height).toBeLessThan(800);
  await openCamera(page);
  await expect(page.getByRole('button', { name: 'Superior', exact: true })).toBeVisible();
  await page.locator('.vtt-camera-controls > summary').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Superior', exact: true })).toBeHidden();
  const scene = panel.getByRole('tab', { name: 'Cenário', exact: true });
  await scene.focus();
  await scene.press('ArrowRight');
  await expect(panel.getByRole('tab', { name: 'Dados', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(scene).toHaveAttribute('aria-selected', 'true');
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('master-menu-desktop.png') });
  expect(errors).toEqual([]);
});

test('closing a tool stops the brush and reopening preserves its settings', async ({
  page,
  request,
}) => {
  await openFixturePage(page);
  await fixtureTopView(page);
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  const objects = await chooseScenery(page, 'Tocha');
  await objects.getByLabel('Nome do elemento', { exact: true }).fill('Luz da passagem');
  await objects.locator('summary').filter({ hasText: 'Aparência e materiais' }).click();
  await expect(objects.getByLabel('Código da cor', { exact: true })).toBeVisible();
  await objects.locator('summary').filter({ hasText: 'Tamanho e movimento' }).click();
  await expect(objects.getByLabel('Código da cor', { exact: true })).toBeHidden();
  await expect(objects.getByLabel('Largura (células)', { exact: true })).toBeVisible();
  const before = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  await page.getByRole('button', { name: 'Voltar às ferramentas do mestre' }).click();
  await expect(page.getByRole('button', { name: 'Parar ferramenta', exact: true })).toHaveCount(0);
  const p = await fixtureCell(page, 10, 8);
  await page.mouse.click(p.x, p.y);
  const after = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(after.objects.length).toBe(before.objects.length);
  const reopened = await openMasterTool(page, 'objects');
  await expect(reopened.getByLabel('Nome do elemento', { exact: true })).toHaveValue(
    'Luz da passagem',
  );
  await reopened.getByLabel('Nome do elemento', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir Objetos', exact: true })).toBeFocused();
});

test('large interaction lists are searchable, paged and can be used during combat', async ({
  page,
  request,
}) => {
  const initial = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const objects = Array.from({ length: 25 }, (_, i) => ({
    id: 'menu-' + i,
    map_id: initial.map.id,
    object_type: 'torch',
    geometry: { x: i % 12, y: 5 + Math.floor(i / 12), width: 1, height: 1 },
    z: 0,
    visible: true,
    blocks_movement: false,
    blocks_vision: false,
    metadata: { name: 'Luz ' + i, light_enabled: true },
    created_at: '2026-10-14T12:00:00Z',
    updated_at: '2026-10-14T12:00:00Z',
  }));
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { status: 'active', objects } });
  await openFixturePage(page);
  const interactions = await openMasterTool(page, 'interactions');
  await expect(interactions.getByRole('listitem')).toHaveCount(8);
  await interactions.getByRole('button', { name: 'Próxima página de interações' }).click();
  await expect(
    interactions.getByRole('button', { name: 'Página anterior de interações' }),
  ).toBeEnabled();
  await interactions.getByLabel('Buscar interação').fill('Luz 18');
  await expect(interactions.getByRole('listitem')).toHaveCount(1);
  await interactions.getByRole('button', { name: 'Apagar: Luz 18 em 6,6', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).objects[18].metadata
          .light_enabled,
    )
    .toBe(false);
  await page.getByRole('button', { name: 'Voltar às ferramentas do mestre' }).click();
  const visibility = await openMasterTool(page, 'visibility');
  await visibility.getByLabel('Período do grid').selectOption('night');
  await expect
    .poll(
      async () => (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).map.lighting,
    )
    .toBe('night');
  await page.getByRole('button', { name: 'Voltar às ferramentas do mestre' }).click();
  await expect(page.getByLabel('Iluminação atual')).toContainText('Noite');
  await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('the tools fit desktop, tablet and mobile without nested scrolling', async ({
  page,
}, info) => {
  await openFixturePage(page);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const panel = page.getByRole('complementary', { name: 'Painel da batalha' });
    await panel.scrollIntoViewIfNeeded();
    expect(
      await panel.evaluate((element) => ({
        horizontal: element.scrollWidth > element.clientWidth + 2,
        nestedScroll: ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
        fits: element.getBoundingClientRect().right <= innerWidth + 2,
      })),
    ).toEqual({ horizontal: false, nestedScroll: false, fits: true });
    await page.screenshot({ path: info.outputPath(`master-menu-${width}.png`) });
    const tool = await openMasterTool(page, 'participants');
    await expect(tool.getByLabel('Personagem para adicionar')).toBeVisible();
    expect(await tool.evaluate((element) => element.scrollWidth <= element.clientWidth + 2)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Voltar às ferramentas do mestre' }).click();
  }
});

test('terrain, fog, rules and participant controls still save from their own tools', async ({
  page,
  request,
}) => {
  await openFixturePage(page);
  await fixtureTopView(page);
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  const terrain = await openMasterTool(page, 'terrain');
  await terrain.getByRole('button', { name: 'Bloquear', exact: true }).click();
  let point = await fixtureCell(page, 12, 9);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(async () =>
      (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).cells.some(
        (c: { x: number; y: number; blocked: boolean }) => c.x === 12 && c.y === 9 && c.blocked,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole('button', { name: 'Concluir edição', exact: true }),
  ).not.toHaveAttribute('aria-disabled', 'true');
  const visibility = await openMasterTool(page, 'visibility');
  await visibility.getByLabel('Tamanho do pincel de visibilidade').selectOption('1');
  await visibility.getByRole('button', { name: 'Ocultar área', exact: true }).click();
  point = await fixtureCell(page, 11, 9);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(async () =>
      (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).fog.some(
        (f: { x: number; y: number }) => f.x === 11 && f.y === 9,
      ),
    )
    .toBe(true);
  const rules = await openMasterTool(page, 'rules');
  await rules.getByLabel('Falha consome a ação e o espaço utilizado').click();
  await expect
    .poll(
      async () =>
        (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).session
          .failed_actions_consume,
    )
    .toBe(false);
  await expect(rules.getByLabel('Falha consome a ação e o espaço utilizado')).not.toBeChecked();
  const participants = await openMasterTool(page, 'participants');
  const snapshot = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const token = snapshot.tokens[0];
  await participants.getByLabel(`Aliança de ${token.name}`, { exact: true }).selectOption('enemy');
  await expect
    .poll(
      async () =>
        (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).tokens[0].faction,
    )
    .toBe('enemy');
  await participants.getByRole('button', { name: `Ocultar ${token.name}`, exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).tokens[0].visible,
    )
    .toBe(false);
});

test('the object library is paged and changing panels stops painting without losing a draft', async ({
  page,
}) => {
  await openFixturePage(page);
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  const objects = await openMasterTool(page, 'objects');
  await expect(objects.locator('.vtt-scenery-palette > button')).toHaveCount(12);
  const first = await objects
    .locator('.vtt-scenery-palette > button')
    .first()
    .getAttribute('aria-label');
  await objects.getByRole('button', { name: 'Próxima página de elementos' }).click();
  expect(
    await objects.locator('.vtt-scenery-palette > button').first().getAttribute('aria-label'),
  ).not.toBe(first);
  await objects.getByLabel('Buscar elemento ou variante').fill('Tocha');
  await expect(objects.locator('.vtt-scenery-palette > button')).toHaveCount(1);
  await objects.getByRole('button', { name: 'Tocha', exact: true }).click();
  await objects.getByRole('tab', { name: 'Ajustes', exact: true }).click();
  await objects.getByLabel('Nome do elemento', { exact: true }).fill('Rascunho da luz');
  await expect(page.getByRole('button', { name: 'Parar ferramenta', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Combate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Parar ferramenta', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await expect(objects.getByLabel('Nome do elemento', { exact: true })).toHaveValue(
    'Rascunho da luz',
  );
});

test('players keep their tools without receiving the master menu or lighting editors', async ({
  page,
}) => {
  await openFixturePage(page, fixturePlayer);
  await expect(page.getByText('Ferramentas da mesa', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /^Abrir (Objetos|Interações|Terreno|Luz e visão|Participantes|Regras da mesa)$/,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Período do grid')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Cenário', exact: true })).toHaveCount(0);
});
