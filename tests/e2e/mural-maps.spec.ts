import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from '../helpers/browser-test';
import {
  fixtureCampaign,
  fixturePlayer,
  fixtureUrl,
  openFixturePage,
} from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { generateAtlas } from '../../src/features/atlas/generator';
import { featureBase, mapRecord } from '../../src/features/atlas/model';
import type { MuralItem } from '../../src/features/mural/types';
import type { MuralAnnotation } from '../../src/features/mural/annotation-model';

const state = async (request: APIRequestContext) =>
  (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()) as {
    muralItems: MuralItem[];
    muralAnnotations: MuralAnnotation[];
    calls: { rpc?: string; upload?: string }[];
  };
test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
});
async function openEditor(page: Page, request: APIRequestContext) {
  const doc = generateAtlas('blank', 960, 640, 'mural', 'Mapa dos aventureiros');
  doc.notes = 'SEGREDO PRIVADO DO MESTRE';
  doc.objects.push({
    ...featureBase({ x: 480, y: 320 }, 'TOKEN PRIVADO'),
    kind: 'token',
    icon: 'party',
    size: 100,
    color: '#ff0000',
    faction: 'enemy',
    number: 0,
  });
  const map = { ...mapRecord(fixtureCampaign, doc), revision: 1 };
  await request.post(`${fixtureUrl}/__fixture/scenario`, {
    data: { atlasMaps: [map], status: 'preparing' },
  });
  await openFixturePage(page, DEMO_USER_ID, `mapas/${map.id}`);
  await expect(page.getByLabel('Editor de mapa interativo', { exact: true })).toBeVisible();
}
async function publish(page: Page, expectedChapter?: string) {
  await page.getByRole('button', { name: 'Enviar ao mural', exact: true }).click();
  if (expectedChapter)
    await expect(page.getByLabel('Capítulo do mural', { exact: true })).toHaveValue(
      expectedChapter,
    );
  await expect(page.getByLabel('Incluir tokens de planejamento na imagem')).not.toBeChecked();
  await page.getByRole('button', { name: 'Publicar no mural', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Mapa enviado ao mural', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fechar aviso', exact: true }).click();
  await page.getByRole('link', { name: 'Abrir mural', exact: true }).click();
}
async function openMap(page: Page) {
  await page.getByRole('button', { name: 'Abrir Mapa dos aventureiros', exact: true }).click();
  await expect(page.locator('.mural-map-sheet > img')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.mural-map-sheet > img')
        .evaluate(
          (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
        ),
    )
    .toBe(true);
  await expect(page.getByText('Marcações sincronizadas', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const image = (await page.locator('.mural-map-sheet').boundingBox())!;
      const view = (await page.getByLabel('Visualização do mapa', { exact: true }).boundingBox())!;
      return image.width <= view.width + 2 && image.height <= view.height + 2;
    })
    .toBe(true);
}
async function at(page: Page, x: number, y: number) {
  const box = (await page
    .getByRole('group', { name: 'Marcações do mapa', exact: true })
    .boundingBox())!;
  return { x: box.x + x * box.width, y: box.y + y * box.height };
}
async function stroke(page: Page, start = { x: 0.2, y: 0.25 }, end = { x: 0.55, y: 0.35 }) {
  await page.getByRole('button', { name: 'Desenhar', exact: true }).click();
  const p = await at(page, start.x, start.y),
    q = await at(page, end.x, end.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 25 });
  await page.mouse.up();
}
async function text(page: Page, value: string, x = 0.2, y = 0.15) {
  await page.getByRole('button', { name: 'Adicionar texto', exact: true }).click();
  await page.getByLabel('Texto da marcação', { exact: true }).fill(value);
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByText('Marcações sincronizadas', { exact: true })).toBeVisible();
}

test('a lost publication response creates one visible mural image without sharing private map notes or planning tokens', async ({
  page,
  request,
}) => {
  await openEditor(page, request);
  const chapters = (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).adventures;
  await request.post(`${fixtureUrl}/__fixture/scenario`, {
    data: {
      adventures: [
        {
          ...chapters[0],
          id: crypto.randomUUID(),
          number: 2,
          name: 'Próximo capítulo',
          status: 'planned',
        },
        ...chapters,
      ],
    },
  });
  await page.route('**/rpc/save_campaign_mural_item', async (route) => {
    await route.fetch();
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Resposta perdida' }),
    });
  });
  await publish(page, chapters[0].id);
  const data = await state(request);
  expect(data.muralItems).toHaveLength(1);
  expect(data.muralItems[0].visible_to_players).toBe(true);
  expect(data.muralItems[0].image_path).toMatch(/^campaign_mural\//);
  expect(JSON.stringify(data.muralItems)).not.toContain('SEGREDO PRIVADO');
  expect(data.calls.filter((c) => c.upload?.startsWith('campaign_mural/'))).toHaveLength(1);
  await openMap(page);
  const pixel = await page.locator('.mural-map-sheet > img').evaluate(async (el) => {
    const image = el as HTMLImageElement,
      bitmap = await createImageBitmap(await (await fetch(image.src)).blob()),
      canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const c = canvas.getContext('2d')!;
    c.drawImage(bitmap, 0, 0);
    return [
      ...c.getImageData(Math.round(bitmap.width * 0.5), Math.round(bitmap.height * 0.5), 1, 1).data,
    ];
  });
  expect(pixel[2]).toBeGreaterThan(pixel[0]);
  await page.screenshot({ path: test.info().outputPath('published-map.png'), fullPage: true });
});

test('the GM enables player markup, players erase only their own work and GM moderation synchronizes both readers', async ({
  page,
  request,
  playwright,
  launchOptions,
  baseURL,
}) => {
  await openEditor(page, request);
  await publish(page);
  await openMap(page);
  await text(page, 'Ponto do mestre');
  const masterMark = (await state(request)).muralAnnotations[0];
  const playerBrowser = await playwright.chromium.launch(launchOptions);
  try {
    const context = await playerBrowser.newContext({
        baseURL,
        viewport: { width: 1280, height: 900 },
      }),
      playerPage = await context.newPage();
    await openFixturePage(playerPage, fixturePlayer, 'mesa/mural');
    await openMap(playerPage);
    await expect(playerPage.getByRole('button', { name: 'Desenhar', exact: true })).toHaveCount(0);
    await expect(playerPage.getByText(/O mestre não liberou marcações/)).toBeVisible();
    await page.goto(`/campanhas/${fixtureCampaign}/regras`);
    await page.getByLabel('Permitir marcações nos mapas do mural', { exact: true }).check();
    await page.getByRole('button', { name: 'Salvar regras', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()).rules[0]
            .players_can_annotate_mural,
      )
      .toBe(true);
    await playerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(playerPage.getByRole('button', { name: 'Desenhar', exact: true })).toBeVisible({
      timeout: 12000,
    });
    await stroke(playerPage);
    await expect
      .poll(
        async () =>
          (await state(request)).muralAnnotations.filter(
            (a) => a.author_id === fixturePlayer && !a.deleted,
          ).length,
      )
      .toBe(1);
    await playerPage.getByRole('button', { name: 'Borracha', exact: true }).click();
    await playerPage.locator(`[data-annotation-id="${masterMark.id}"]`).click();
    await expect(
      playerPage.getByText('Você só pode apagar suas próprias marcações.', { exact: true }),
    ).toBeVisible();
    await playerPage.getByRole('button', { name: 'Fechar aviso', exact: true }).click();
    await playerPage
      .getByRole('button', { name: 'Desfazer minha última marcação', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await state(request)).muralAnnotations.filter(
            (a) => a.author_id === fixturePlayer && !a.deleted,
          ).length,
      )
      .toBe(0);
    expect(
      (await state(request)).muralAnnotations.find((a) => a.id === masterMark.id)!.deleted,
    ).toBe(false);
    await text(playerPage, 'Entrada da caverna', 0.55, 0.25);
    await page.goto(`/campanhas/${fixtureCampaign}/mesa/mural`);
    await openMap(page);
    await expect(
      page.locator('.mural-map-sheet tspan').filter({ hasText: 'Entrada da caverna' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Limpar marcações', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Limpar marcações', exact: true })
      .click();
    await expect
      .poll(async () => (await state(request)).muralAnnotations.filter((a) => !a.deleted).length)
      .toBe(0);
    await playerPage.getByRole('button', { name: 'Atualizar mapa', exact: true }).click();
    await expect(playerPage.locator('[data-annotation-id]')).toHaveCount(0);
    await page.goto(`/campanhas/${fixtureCampaign}/regras`);
    await page.getByLabel('Permitir marcações nos mapas do mural', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Salvar regras', exact: true }).click();
    await playerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(playerPage.getByRole('button', { name: 'Desenhar', exact: true })).toHaveCount(0, {
      timeout: 12000,
    });
  } finally {
    await playerBrowser.close();
  }
});

test('drawing stays immediate during slow requests and retries preserve both gestures without duplicates', async ({
  page,
  request,
}) => {
  await openEditor(page, request);
  await publish(page);
  await openMap(page);
  let release!: () => void,
    first = true;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/rpc/add_mural_annotation', async (route) => {
    if (first) {
      first = false;
      await hold;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Conexão interrompida' }),
      });
    } else await route.continue();
  });
  await stroke(page);
  await expect(page.locator('[data-annotation-id]')).toHaveCount(1);
  expect((await state(request)).muralAnnotations).toHaveLength(0);
  await stroke(page, { x: 0.3, y: 0.4 }, { x: 0.6, y: 0.45 });
  await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
  expect((await state(request)).calls.filter((c) => c.rpc === 'add_mural_annotation')).toHaveLength(
    0,
  );
  release();
  await expect(page.getByText('Conexão interrompida', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar aviso', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Mapa dos aventureiros', exact: true })
    .getByRole('button', { name: 'Fechar', exact: true })
    .click();
  await expect(
    page.getByRole('alertdialog', { name: 'Fechar com marcações pendentes?' }),
  ).toBeVisible();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Tentar salvar novamente', exact: true }).click();
  await expect(page.getByText('Marcações sincronizadas', { exact: true })).toBeVisible();
  const rows = (await state(request)).muralAnnotations;
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((a) => a.id)).size).toBe(2);
  expect(rows.every((a) => a.payload.kind === 'stroke' && a.payload.points.length <= 512)).toBe(
    true,
  );
  await page.reload();
  await openMap(page);
  await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
});

test('the mobile viewer fits the screen, places points and text and preserves coordinates when zooming', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page, request);
  await publish(page);
  await openMap(page);
  await page.getByRole('button', { name: 'Marcar ponto', exact: true }).click();
  await page.getByLabel('Legenda do ponto (opcional)', { exact: true }).fill('Passagem');
  let p = await at(page, 0.3, 0.3);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByText('Marcações sincronizadas', { exact: true })).toBeVisible();
  await text(page, 'Rumo ao norte', 0.15, 0.6);
  const before = (await state(request)).muralAnnotations.map((a) => a.payload);
  await page.getByRole('button', { name: 'Ampliar imagem', exact: true }).click();
  await page.getByRole('button', { name: 'Ampliar imagem', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Marcações sincronizadas' }),
  ).toBeVisible();
  expect((await state(request)).muralAnnotations.map((a) => a.payload)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = (await page
    .getByRole('dialog', { name: 'Mapa dos aventureiros', exact: true })
    .boundingBox())!;
  expect(dialog.x).toBeGreaterThanOrEqual(0);
  expect(dialog.y).toBeGreaterThanOrEqual(0);
  expect(dialog.x + dialog.width).toBeLessThanOrEqual(391);
  expect(dialog.y + dialog.height).toBeLessThanOrEqual(845);
  await page.screenshot({ path: test.info().outputPath('mural-map-mobile.png'), fullPage: false });
});
