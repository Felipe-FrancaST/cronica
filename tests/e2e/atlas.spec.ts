import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { test } from '../helpers/browser-test';
import {
  openFixturePage,
  fixtureCampaign,
  fixturePlayer,
  fixtureUrl,
} from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { generateAtlas } from '../../src/features/atlas/generator';
import { mapRecord } from '../../src/features/atlas/model';
import type { AtlasMap } from '../../src/features/atlas/types';
test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
});
const state = async (request: APIRequestContext) =>
  (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()) as {
    atlasMaps: AtlasMap[];
    extraMaps: { id: string; background_image: string | null; name: string }[];
    calls: { rpc?: string; upload?: string }[];
  };
async function setup(request: APIRequestContext) {
  const map = {
    ...mapRecord(fixtureCampaign, generateAtlas('blank', 960, 640, 'test', 'Mapa de teste')),
    revision: 1,
  };
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { atlasMaps: [map] } });
  return map;
}
async function open(page: Page, map: AtlasMap) {
  await openFixturePage(page, DEMO_USER_ID, `mapas/${map.id}`);
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator('.atlas-save-state')).toHaveText('Salvo');
}
async function at(page: Page, x: number, y: number) {
  const box = (await page.getByLabel('Editor de mapa interativo', { exact: true }).boundingBox())!,
    zoom = Number((await page.getByLabel('Zoom do mapa').textContent())!.replace('%', '')) / 100;
  return {
    x: box.x + (box.width - 960 * zoom) / 2 + x * zoom,
    y: box.y + (box.height - 640 * zoom) / 2 + y * zoom,
  };
}
async function clickPoint(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.atlas-save-state')).toHaveText('Salvo');
}
test('master creates a procedural map from the library, with a live preview and real persistence', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openFixturePage(page, DEMO_USER_ID, 'mapas');
  await expect(page.getByRole('heading', { name: 'Oficina de mapas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Criar mapa', exact: true }).click();
  await page.getByLabel('Nome do novo mapa').fill('Arquipélago dos dragões');
  await page.getByRole('button', { name: /^Arquipélago/ }).click();
  await page.getByRole('button', { name: 'Criar e abrir editor' }).click();
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  const maps = (await state(request)).atlasMaps;
  expect(maps).toHaveLength(1);
  expect(maps[0].document.template).toBe('archipelago');
  expect(maps[0].thumbnail).toMatch(/^data:image\/webp/);
  await page.screenshot({
    path: test.info().outputPath('atlas-editor-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
});
test('painting is immediate, undo and redo preserve strokes, and autosave survives reload', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await open(page, map);
  await page.getByRole('button', { name: 'Pintar terreno', exact: true }).click();
  await page.getByRole('button', { name: 'Floresta', exact: true }).click();
  const p = await at(page, 320, 300),
    q = await at(page, 520, 300);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await page.getByRole('button', { name: 'Refazer', exact: true }).click();
  await expect.poll(async () => (await state(request)).atlasMaps[0].revision).toBeGreaterThan(1);
  const saved = (await state(request)).atlasMaps[0];
  expect(saved.document.terrain.some((t) => t === 4)).toBe(true);
  await page.reload();
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator('.atlas-save-state')).toHaveText('Salvo');
});
test('tokens can be named, moved, duplicated and removed without touching combat tokens', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await open(page, map);
  await page.getByRole('button', { name: 'Tokens', exact: true }).click();
  await page.getByLabel('Nome do token').fill('Guardião do Norte');
  await clickPoint(page, 300, 300);
  await page.getByRole('button', { name: 'Selecionar', exact: true }).click();
  await clickPoint(page, 300, 300);
  await expect(page.getByLabel('Nome do elemento')).toHaveValue('Guardião do Norte');
  await page.getByLabel('Posição X', { exact: true }).fill('420');
  await page.getByLabel('Posição X', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await save(page);
  expect((await state(request)).atlasMaps[0].document.objects).toHaveLength(2);
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await save(page);
  const objects = (await state(request)).atlasMaps[0].document.objects;
  expect(objects).toHaveLength(1);
  expect(objects[0].x).toBe(420);
});
test('routes, polygon regions and text are editable, while hidden and locked layers stay protected', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await open(page, map);
  await page.getByRole('button', { name: 'Rotas', exact: true }).click();
  for (const p of [
    [200, 300],
    [400, 250],
    [600, 350],
  ])
    await clickPoint(page, p[0], p[1]);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Regiões', exact: true }).click();
  for (const p of [
    [220, 150],
    [420, 140],
    [350, 260],
  ])
    await clickPoint(page, p[0], p[1]);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Textos', exact: true }).click();
  await page.getByLabel('Texto a colocar').fill('Reino de Eldoria');
  await clickPoint(page, 480, 180);
  await page.getByRole('tab', { name: 'Camadas', exact: true }).click();
  await page.getByRole('button', { name: 'Ocultar Textos', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear Terreno e relevo', exact: true }).click();
  await page.getByRole('button', { name: 'Pintar terreno', exact: true }).click();
  await clickPoint(page, 600, 400);
  await expect(page.locator('.atlas-editor-footer p')).toContainText('desbloqueie');
  await save(page);
  const doc = (await state(request)).atlasMaps[0].document;
  expect(doc.objects.map((o) => o.kind)).toEqual(['route', 'region', 'label']);
  expect(doc.layers.find((l) => l.id === 'labels')!.visible).toBe(false);
  expect(doc.terrain.every((t) => t === 0)).toBe(true);
});
test('PNG and editable backup downloads are valid, and importing creates a new map', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  map.document.notes = 'SEGREDO DO MESTRE';
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { atlasMaps: [map] } });
  await open(page, map);
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  const pngPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar PNG', exact: true }).click();
  const png = await pngPromise;
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  const pngPath = await png.path();
  const fs = await import('node:fs/promises');
  expect((await fs.readFile(pngPath!)).subarray(1, 4).toString()).toBe('PNG');
  const backupPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Backup editável (.json)', exact: true }).click();
  const backup = await backupPromise;
  const json = JSON.parse(await fs.readFile((await backup.path())!, 'utf8'));
  expect(json.document.notes).toBe('SEGREDO DO MESTRE');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('link', { name: 'Voltar à biblioteca de mapas' }).click();
  await page.getByLabel('Importar backup de mapa').setInputFiles({
    name: 'mapa.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await page.getByRole('button', { name: 'Importar e abrir editor' }).click();
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  expect((await state(request)).atlasMaps).toHaveLength(2);
});
test('a failed save preserves a recoverable draft and retries on explicit save', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await open(page, map);
  await page.route('**/rest/v1/rpc/save_campaign_atlas', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Falha temporária de conexão' }),
    }),
  );
  await page.getByRole('button', { name: 'Tokens', exact: true }).click();
  await clickPoint(page, 400, 300);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Falha temporária de conexão', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Recuperar rascunho' })).toBeVisible();
  await page.getByRole('button', { name: 'Recuperar rascunho' }).click();
  await page.unroute('**/rest/v1/rpc/save_campaign_atlas');
  await save(page);
  expect((await state(request)).atlasMaps[0].document.objects).toHaveLength(1);
});
test('a stale editor preserves remote edits and can save a separate copy', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await open(page, map);
  await page.getByLabel('Salvar automaticamente').uncheck();
  await page.getByRole('button', { name: 'Tokens', exact: true }).click();
  await clickPoint(page, 400, 300);
  const remote = {
    ...map,
    revision: 2,
    document: { ...map.document, title: 'Versão de outra janela' },
    name: 'Versão de outra janela',
  };
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { atlasMaps: [remote] } });
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Salvar minhas alterações como cópia' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Salvar minhas alterações como cópia' }).click();
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect.poll(async () => (await state(request)).atlasMaps.length).toBe(2);
  expect((await state(request)).atlasMaps.find((m) => m.id === map.id)!.document.title).toBe(
    'Versão de outra janela',
  );
});
test('sending resumes after upload failure and reuses the same Mesa scene', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await open(page, map);
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { uploadError: true } });
  await page.getByRole('button', { name: 'Usar na Mesa', exact: true }).click();
  await expect(page.getByLabel('Capítulo de destino')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Criar cenário na Mesa', exact: true }).click();
  await expect(
    page.getByText('A imagem ainda não foi enviada. Tente novamente.', { exact: true }),
  ).toBeVisible();
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { uploadError: false } });
  await page.getByRole('button', { name: 'Criar cenário na Mesa', exact: true }).click();
  await expect(
    page.getByText('Cenário criado com a imagem confirmada.', { exact: true }),
  ).toBeVisible();
  const s = await state(request);
  expect(s.extraMaps).toHaveLength(1);
  expect(s.extraMaps[0].background_image).toMatch(/^battle_maps\//);
  expect(s.calls.filter((c) => c.rpc === 'prepare_atlas_scene')).toHaveLength(2);
});
test('mobile editor and library fit the viewport, and the inspector can be collapsed', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, map);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Recolher painel', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Propriedades do mapa' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pintar terreno', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Propriedades do mapa' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('atlas-editor-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'Voltar à biblioteca de mapas' }).click();
  await expect(page.getByRole('heading', { name: 'Oficina de mapas', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('atlas-library-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
});
test('players do not see the workshop entry and direct routes reveal no map document', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await openFixturePage(page, fixturePlayer, `mapas/${map.id}`);
  await expect(page.getByRole('heading', { name: 'Oficina reservada ao mestre' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Oficina de mapas', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await state(request)).calls.filter((c) => c.rpc === 'save_campaign_atlas').length,
    )
    .toBe(0);
});
test('edits made during an in-flight save remain in the editor and reach the next revision', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await open(page, map);
  await page.getByRole('button', { name: 'Tokens', exact: true }).click();
  await clickPoint(page, 300, 300);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let blocked = false;
  await page.route('**/rest/v1/rpc/save_campaign_atlas', async (route) => {
    if (!blocked) {
      blocked = true;
      await gate;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => blocked).toBe(true);
  await clickPoint(page, 600, 300);
  release();
  await expect
    .poll(async () => (await state(request)).atlasMaps[0].document.objects.length, {
      timeout: 15000,
    })
    .toBe(2);
  await expect(page.locator('.atlas-save-state')).toHaveText('Salvo');
});
test('the map can be resized and undo restores its original dimensions', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await open(page, map);
  await page.getByRole('tab', { name: 'Mapa', exact: true }).click();
  await page.getByText('Dimensões e paleta', { exact: true }).click();
  await page.getByRole('button', { name: 'Redimensionar mapa' }).click();
  await page.getByLabel('Largura', { exact: true }).fill('1280');
  await page.getByLabel('Altura', { exact: true }).fill('960');
  await page.getByRole('button', { name: 'Aplicar dimensões' }).click();
  await save(page);
  expect((await state(request)).atlasMaps[0].width).toBe(1280);
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await save(page);
  expect((await state(request)).atlasMaps[0].width).toBe(960);
});
test('blocked local drafts show a warning while server saving remains available', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await open(page, map);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('cronica:atlas:draft:'))
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Tokens', exact: true }).click();
  await clickPoint(page, 400, 300);
  await expect(page.locator('.atlas-local-warning')).toBeVisible();
  await save(page);
  expect((await state(request)).atlasMaps[0].document.objects).toHaveLength(1);
});
test('the library searches metadata, duplicates maps and deletes only the selected document', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await openFixturePage(page, DEMO_USER_ID, 'mapas');
  await expect(page.getByRole('heading', { name: 'Mapa de teste', exact: true })).toBeVisible();
  await page.getByLabel('Buscar mapas').fill('inexistente');
  await expect(page.getByText('Nenhum mapa corresponde à busca.', { exact: true })).toBeVisible();
  await page.getByLabel('Buscar mapas').fill('Mapa de teste');
  await page.getByRole('button', { name: 'Duplicar mapa Mapa de teste', exact: true }).click();
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('link', { name: 'Voltar à biblioteca de mapas' }).click();
  await page
    .getByRole('button', { name: 'Excluir mapa Mapa de teste · cópia', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await expect.poll(async () => (await state(request)).atlasMaps.length).toBe(1);
  expect((await state(request)).atlasMaps[0].id).toBe(map.id);
});
test('the global workshop lists the master campaign maps', async ({ page, request }) => {
  await setup(request);
  await openFixturePage(page, DEMO_USER_ID, 'mapas');
  await page.goto('/mapas');
  await expect(page.getByRole('heading', { name: 'Oficina de mapas', exact: true })).toBeVisible();
  await expect(page.getByLabel('Filtrar mapas por campanha')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mapa de teste', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.screenshot({
    path: test.info().outputPath('atlas-library-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
});
test('a map at the size limit paints locally and saves only when requested', async ({
  page,
  request,
}) => {
  const document = generateAtlas('island', 4096, 4096, 'large', 'Mundo extenso');
  document.objects = Array.from({ length: 1500 }, (_, i) => ({
    id: `stress-${i}`,
    name: '',
    kind: 'symbol' as const,
    symbol: 'pine' as const,
    x: 80 + (i % 50) * 78,
    y: 120 + Math.floor(i / 50) * 120,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    size: 38,
    color: '#5a6d49',
  }));
  const map = { ...mapRecord(fixtureCampaign, document), revision: 1 };
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { atlasMaps: [map] } });
  await open(page, map);
  await page.getByLabel('Salvar automaticamente').uncheck();
  await page.getByRole('button', { name: 'Pintar terreno', exact: true }).click();
  await page.getByRole('button', { name: 'Deserto', exact: true }).click();
  const box = (await page.getByLabel('Editor de mapa interativo', { exact: true }).boundingBox())!;
  const start = Date.now();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 25 });
  await page.mouse.up();
  test.info().annotations.push({
    type: 'performance',
    description: `Traço em 4096 × 4096 com 1500 símbolos: ${Date.now() - start} ms, incluindo 25 eventos de mouse.`,
  });
  expect((await state(request)).calls.filter((c) => c.rpc === 'save_campaign_atlas')).toHaveLength(
    0,
  );
  await save(page);
  expect((await state(request)).atlasMaps[0].revision).toBe(2);
  expect((await state(request)).atlasMaps[0].document.terrain.some((t) => t === 9)).toBe(true);
});
test('two-finger zoom cancels the temporary brush gesture without painting the map', async ({
  page,
  request,
}) => {
  const map = await setup(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, map);
  await page.getByRole('button', { name: 'Pintar terreno', exact: true }).click();
  await page.getByRole('button', { name: 'Recolher painel', exact: true }).click();
  const box = (await page.getByLabel('Editor de mapa interativo', { exact: true }).boundingBox())!,
    x = box.x + box.width / 2,
    y = box.y + box.height / 2,
    cdp = await page.context().newCDPSession(page);
  const old = await page.getByLabel('Zoom do mapa').textContent();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, x: x - 25, y },
      { id: 2, x: x + 25, y },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { id: 1, x: x - 65, y },
      { id: 2, x: x + 65, y },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByLabel('Zoom do mapa')).not.toHaveText(old!);
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeDisabled();
  expect((await state(request)).atlasMaps[0].revision).toBe(1);
});
test('retrying creation after a lost response opens the single map that was already saved', async ({
  page,
  request,
}) => {
  await openFixturePage(page, DEMO_USER_ID, 'mapas');
  await page.getByRole('button', { name: 'Criar mapa', exact: true }).click();
  let lost = false;
  await page.route('**/rest/v1/rpc/save_campaign_atlas', async (route) => {
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Criar e abrir editor' }).click();
  await expect.poll(async () => (await state(request)).atlasMaps.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Criar e abrir editor' })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('button', { name: 'Criar e abrir editor' }).click();
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  const maps = (await state(request)).atlasMaps;
  expect(maps).toHaveLength(1);
  expect(maps[0].revision).toBe(1);
});
