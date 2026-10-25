import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test } from '../helpers/browser-test';
import { fixtureCampaign, fixtureUrl, openFixturePage } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { generateAtlas } from '../../src/features/atlas/generator';
import { mapRecord } from '../../src/features/atlas/model';
import type { AtlasMap } from '../../src/features/atlas/types';
import type { MapAsset } from '../../src/features/map-assets/types';

const state = async (request: APIRequestContext) =>
  (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()) as {
    mapAssets: MapAsset[];
    atlasMaps: AtlasMap[];
    map: { background_image: string | null };
    extraMaps: { name: string; background_image: string | null }[];
    calls: { upload?: string; rpc?: string }[];
  };
test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
});
async function image(page: Page, color = '#f02020') {
  const base64 = await page.evaluate((fill) => {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(8, 8, 80, 80);
    return c.toDataURL('image/png').split(',')[1];
  }, color);
  return { name: 'recurso.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}
async function upload(page: Page, name: string, admin = false, color?: string) {
  await page
    .getByRole('button', {
      name: admin ? 'Adicionar ao sistema' : 'Enviar para minha biblioteca',
      exact: true,
    })
    .click();
  await page.getByLabel('Nome do recurso', { exact: true }).fill(name);
  await page.getByLabel('Etiquetas', { exact: true }).fill('teste, floresta');
  await page
    .getByLabel('Imagem do recurso', { exact: true })
    .setInputFiles(await image(page, color));
  const crop = page.getByRole('dialog', { name: 'Ajustar imagem', exact: true });
  await expect(crop).toBeVisible();
  await crop.getByRole('button', { name: 'Usar este recorte', exact: true }).click();
  await expect(crop).toBeHidden();
  await page.getByRole('button', { name: 'Salvar recurso', exact: true }).click();
  await expect(page.getByText('Recurso salvo na biblioteca.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar aviso', exact: true }).click();
  await expect(page.getByRole('button', { name: `Usar ${name}`, exact: true })).toBeVisible();
}
async function at(page: Page, x: number, y: number) {
  const box = (await page.getByLabel('Editor de mapa interativo', { exact: true }).boundingBox())!;
  const zoom =
    Number((await page.getByLabel('Zoom do mapa').textContent())!.replace('%', '')) / 100;
  await page.mouse.click(
    box.x + (box.width - 960 * zoom) / 2 + x * zoom,
    box.y + (box.height - 640 * zoom) / 2 + y * zoom,
  );
}
async function exportedPixels(page: Page) {
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.getByLabel('Largura da imagem', { exact: true }).selectOption('960');
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar PNG', exact: true }).click();
  const download = await promise;
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  const pixels = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${base64}`)).blob(),
    );
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    return {
      width: bitmap.width,
      symbol: [...ctx.getImageData(400, 300, 1, 1).data],
      token: [...ctx.getImageData(600, 300, 1, 1).data],
    };
  }, bytes.toString('base64'));
  await page.getByRole('button', { name: 'Fechar aviso', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Exportar mapa', exact: true })
    .getByRole('button', { name: 'Fechar', exact: true })
    .click();
  return pixels;
}

test('administrator publishes the three kinds and a master applies a catalog background to a campaign grid', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post(`${fixtureUrl}/__fixture/scenario`, {
    data: { assetAdmin: true, status: 'preparing' },
  });
  await openFixturePage(page);
  await page.goto('/administracao/recursos');
  await expect(
    page.getByRole('heading', { name: 'Recursos para mapas', exact: true }),
  ).toBeVisible();
  for (const [tab, name] of [
    ['Símbolos', 'Árvore do sistema'],
    ['Tokens', 'Guardião do sistema'],
    ['Terrenos', 'Bosque do sistema'],
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await upload(page, name, true);
  }
  const catalog = (await state(request)).mapAssets;
  expect(catalog.map((a) => a.kind).sort()).toEqual(['background', 'symbol', 'token']);
  expect(catalog.every((a) => a.ready && a.scope === 'system' && a.owner_id === null)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('admin-catalog.png'), fullPage: true });
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { assetAdmin: false } });
  await openFixturePage(page);
  await page.getByRole('button', { name: 'Configurar mapa', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Configurar mapa', exact: true });
  await settings.locator('summary', { hasText: 'Terrenos' }).click();
  await settings.getByRole('button', { name: 'Usar Bosque do sistema', exact: true }).click();
  await expect(settings.getByAltText('Prévia da imagem do mapa')).toBeVisible();
  await settings.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(settings).toBeHidden();
  const final = await state(request);
  expect(final.calls.some((c) => c.upload?.startsWith('battle_maps/'))).toBe(true);
  expect(final.map.background_image).toMatch(/^battle_maps\//);
  await page.getByRole('button', { name: 'Novo mapa', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Criar mapa tático', exact: true });
  await create.getByLabel('Nome', { exact: true }).fill('Bosque com fundo');
  await create.locator('summary', { hasText: 'Terrenos' }).click();
  const background = catalog.find((a) => a.kind === 'background')!;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/object/sign/map-assets/' + background.image_path + '?*', async (route) => {
    await hold;
    await route.continue();
  });
  await create.getByRole('button', { name: 'Usar Bosque do sistema', exact: true }).click();
  await expect(create.getByRole('button', { name: 'Criar mesa', exact: true })).toBeDisabled();
  release();
  await expect(
    create.getByText('Fundo escolhido: Bosque do sistema.webp', { exact: true }),
  ).toBeVisible();
  await create.getByRole('button', { name: 'Criar mesa', exact: true }).click();
  await expect(create).toBeHidden();
  await expect
    .poll(
      async () =>
        (await state(request)).extraMaps.find((m) => m.name === 'Bosque com fundo')
          ?.background_image,
    )
    .toMatch(/^battle_maps\//);
  expect(errors).toEqual([]);
});

test('personal symbols and tokens survive save, reload, archive and PNG export with their actual pixels', async ({
  page,
  request,
}) => {
  const map = {
    ...mapRecord(fixtureCampaign, generateAtlas('blank', 960, 640, 'assets', 'Mapa da biblioteca')),
    revision: 1,
  };
  await request.post(`${fixtureUrl}/__fixture/scenario`, { data: { atlasMaps: [map] } });
  await openFixturePage(page, DEMO_USER_ID, `mapas/${map.id}`);
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Símbolos', exact: true }).click();
  await page.locator('summary', { hasText: 'Criar símbolo' }).click();
  await upload(page, 'Minha árvore rubra');
  await at(page, 400, 300);
  await page.getByRole('button', { name: 'Tokens', exact: true }).click();
  const library = page.locator('.map-asset-disclosure');
  if (!(await library.evaluate((e) => (e as HTMLDetailsElement).open)))
    await library.locator('summary').click();
  await upload(page, 'Meu guardião azul', false, '#2030f0');
  await at(page, 600, 300);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.atlas-save-state')).toHaveText('Salvo');
  const saved = await state(request);
  expect(saved.mapAssets.every((a) => a.scope === 'personal' && a.owner_id === DEMO_USER_ID)).toBe(
    true,
  );
  expect(
    saved.atlasMaps[0].document.objects.map((o) => ('asset_id' in o ? o.asset_id : null)),
  ).toEqual(saved.mapAssets.map((a) => a.id));
  await page.reload();
  await expect(page.locator('.atlas-save-state')).toHaveText('Salvo');
  let pixels = await exportedPixels(page);
  expect(pixels.width).toBe(960);
  expect(pixels.symbol[0]).toBeGreaterThan(180);
  expect(pixels.symbol[1]).toBeLessThan(80);
  expect(pixels.token[2]).toBeGreaterThan(180);
  expect(pixels.token[0]).toBeLessThan(80);
  await page.getByRole('button', { name: 'Símbolos', exact: true }).click();
  await page.locator('summary', { hasText: 'Criar símbolo' }).click();
  await page
    .getByRole('button', { name: 'Editar recurso Minha árvore rubra', exact: true })
    .click();
  await page.getByLabel('Disponível para novas escolhas', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Salvar recurso', exact: true }).click();
  await page.getByRole('button', { name: 'Fechar aviso', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Usar Minha árvore rubra', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.atlas-save-state')).toHaveText('Salvo');
  pixels = await exportedPixels(page);
  expect(pixels.symbol[0]).toBeGreaterThan(180);
  expect(pixels.symbol[1]).toBeLessThan(80);
  await page.screenshot({ path: test.info().outputPath('custom-map.png'), fullPage: true });
});

test('the system-upload endpoint rejects a non-administrator and a foreign origin', async ({
  page,
}) => {
  await openFixturePage(page);
  const statuses = await page.evaluate(async () => {
    const form = new FormData();
    form.set('id', crypto.randomUUID());
    const denied = await fetch('/api/admin/map-assets/upload', { method: 'POST', body: form });
    return denied.status;
  });
  expect(statuses).toBe(403);
  const foreign = await page.request.post('/api/admin/map-assets/upload', {
    headers: { Origin: 'https://foreign.invalid' },
    multipart: { id: crypto.randomUUID() },
  });
  expect(foreign.status()).toBe(403);
  await page.goto('/administracao/recursos');
  await expect(page).toHaveURL(/\/escolher-modo/);
});
