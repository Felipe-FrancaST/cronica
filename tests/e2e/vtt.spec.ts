import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { PerspectiveCamera, Vector3 } from 'three';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';

const fixture = 'http://127.0.0.1:54329';
const seed = createDemoWorkspace();
const campaign = seed.campaigns[0].id;
const master = DEMO_USER_ID;
const player = seed.profiles[1].id;
test.use({ hasTouch: true });

async function openTable(page: Page, id = master) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: 'authenticated',
      role: 'authenticated',
    }),
  ).toString('base64url');
  const user = {
    id,
    email: seed.profiles.find((p) => p.id === id)!.email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: `${header}.${payload}.test-signature`,
    refresh_token: 'local-test-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
      domain: 'localhost',
      path: '/',
    },
  ]);
  await page.addInitScript(({ id, mode }) => localStorage.setItem(`cronica:mode:${id}`, mode), {
    id,
    mode: id === master ? 'master' : 'player',
  });
  await page.goto(`/campanhas/${campaign}/mesa`);
  await expect(
    page.getByRole('heading', { name: 'Mesa tática', exact: true, includeHidden: true }),
  ).toBeVisible();
}
async function topView(page: Page) {
  await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Superior', exact: true }).click();
}
// Project target cells through an independent camera to exercise real pointer
// events and raycasting, instead of calling a movement handler directly.
async function cellPosition(
  page: Page,
  x: number,
  y: number,
  width = 16,
  height = 12,
  focus?: { x: number; y: number },
) {
  const canvas = page.getByLabel('Mapa tático 3D interativo');
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  const aspect = rect.width / rect.height;
  const radius = Math.hypot(width, height) / 2 + 1.2;
  const vertical = (21 * Math.PI) / 180;
  const distance = focus
    ? 12
    : (radius / Math.sin(Math.min(vertical, Math.atan(Math.tan(vertical) * aspect)))) * 1.02;
  const camera = new PerspectiveCamera(42, aspect, 0.05, 5000);
  const target = focus
    ? new Vector3(focus.x + 0.5, 0, focus.y + 0.5)
    : new Vector3(width / 2, 0, height / 2);
  camera.position
    .copy(target)
    .add(new Vector3(0, distance * Math.cos(0.015), distance * Math.sin(0.015)));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const point = new Vector3(x + 0.5, 0.025, y + 0.5).project(camera);
  return {
    x: rect.x + ((point.x + 1) / 2) * rect.width,
    y: rect.y + ((1 - point.y) / 2) * rect.height,
  };
}
async function state(request: APIRequestContext) {
  return (await request.get(`${fixture}/__fixture/state`)).json();
}
async function hero(page: Page) {
  await page.getByRole('button', { name: /Elara, guardiã.*Iniciativa/ }).click();
}
async function dismissDice(page: Page) {
  const button = page.getByRole('button', { name: 'Fechar resultado dos dados', exact: true });
  // The short-lived result can expire while a full-page screenshot is captured.
  if (!(await button.isVisible())) return;
  try {
    await button.click({ timeout: 1000 });
  } catch (error) {
    if (await button.isVisible()) throw error;
  }
}

test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/__fixture/reset`);
});

test('map image survives refresh and an upload error, then appears after saving', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await topView(page);
  await page.getByRole('button', { name: 'Configurar mapa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Configurar mapa' });
  await dialog.getByLabel('Imagem do mapa').setInputFiles({
    name: 'mapa-teste.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOMKPRgwAaYsIoOWgkA2j4BIfv4ZIMAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(dialog).toContainText('mapa-teste.png');
  const refresh = page.waitForResponse((r) => r.url().includes('/rest/v1/battle_maps?'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refresh;
  await expect(dialog).toContainText('mapa-teste.png');
  await request.post(`${fixture}/__fixture/scenario`, { data: { uploadError: true } });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toContainText('Falha simulada no upload');
  await expect(dialog).toContainText('mapa-teste.png');
  await request.post(`${fixture}/__fixture/scenario`, { data: { uploadError: false } });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await state(request)).map.background_image).toMatch(/^battle_maps\/.+\.png$/);
  await page.getByRole('button', { name: 'Configurar mapa', exact: true }).click();
  await expect(page.getByAltText('Prévia da imagem do mapa')).toBeVisible();
});

test('player previews spell area, GM approves once, HP and spell slot update on the sheet', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { combatActions: true } });
  await openTable(page, player);
  await topView(page);
  await page.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Conjurar magia', exact: true }).click();
  await page.getByRole('button', { name: /Bola de Fogo.*Círculo/ }).click();
  const point = await cellPosition(page, 5, 4);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.vtt-area-caption')).toContainText('Área de efeito');
  expect((await state(request)).calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Enviar ao mestre', exact: true }).click();
  await expect(page.getByText('Aguardando o mestre', { exact: true })).toBeVisible();
  let s = await state(request);
  expect(s.actions).toHaveLength(1);
  expect(
    s.characters.find((c: { id: string }) => c.id === s.tokens[0].character_id).sheet.hp_current,
  ).toBe(40);
  await openTable(page, master);
  const card = page.getByRole('region', { name: 'Tentativa Bola de Fogo' });
  await expect(card.getByRole('button', { name: 'Sucesso', exact: true })).toBeVisible();
  await card.getByText('Ajustar efeito e resistências', { exact: true }).click();
  await card.getByRole('button', { name: 'Mostrar área no grid' }).click();
  await expect(page.locator('.vtt-area-caption')).toBeVisible();
  await page.screenshot({ path: 'docs/vtt-acoes-mestre.png', fullPage: true });
  await card.getByRole('button', { name: 'Sucesso', exact: true }).click();
  await expect(card).not.toBeVisible();
  s = await state(request);
  const ch = s.characters.find((c: { id: string }) => c.id === s.tokens[0].character_id);
  expect(ch.sheet.hp_current).toBe(40);
  expect(s.actions[0].status).toBe('approved');
  expect(ch.sheet.slots_used['3']).toBe(1);
  expect(
    s.calls.filter((call: { rpc: string }) => call.rpc === 'approve_battle_action'),
  ).toHaveLength(1);
  await openTable(page, player);
  const success = page.getByRole('dialog', { name: 'Sucesso' });
  await expect(success).toContainText('8d6');
  await success.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(success).toContainText('Você deu 24 de dano');
  await page.screenshot({ path: 'docs/vtt-v11-resultado-jogador.png', fullPage: true });
  s = await state(request);
  expect(
    s.characters.find((c: { id: string }) => c.id === s.tokens[0].character_id).sheet.hp_current,
  ).toBe(16);
  expect(s.rolls).toHaveLength(1);
  await success.getByRole('button', { name: 'Voltar ao grid' }).click();
  await expect(page.locator('.vtt-turn-budget')).toContainText('usada');
  await expect(page.getByRole('button', { name: 'Abrir ficha', exact: true })).toBeEnabled();
});

test('weapon choice targets an enemy without moving the actor and failure has no damage', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { combatActions: true } });
  await openTable(page, player);
  await topView(page);
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Atacar com arma', exact: true }).click();
  await page.getByRole('button', { name: /Adaga.*1d4/ }).click();
  const target = await cellPosition(page, 3, 4);
  await page.mouse.click(target.x, target.y);
  await expect(page.getByRole('button', { name: 'Enviar ao mestre', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Enviar ao mestre', exact: true }).click();
  const before = await state(request);
  expect(before.tokens[0].x).toBe(2);
  expect(before.actions[0].target_ids).toEqual(['enemy']);
  await openTable(page, master);
  await page
    .getByRole('region', { name: 'Tentativa Adaga' })
    .getByRole('button', { name: 'Falha', exact: true })
    .click();
  const after = await state(request);
  expect(after.actions[0].status).toBe('failure');
  expect(after.characters[0].sheet.hp_current).toBe(before.characters[0].sheet.hp_current);
  expect(after.tokens[0].action_used).toBe(true);
});

test('mobile cone aiming and 2D area preview preserve selection and movement', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await request.post(`${fixture}/__fixture/scenario`, { data: { combatActions: true } });
  await openTable(page, player);
  await topView(page);
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Conjurar magia', exact: true }).click();
  await page.getByRole('button', { name: /Mãos Flamejantes.*Círculo/ }).click();
  const direction = await cellPosition(page, 5, 4);
  await page.touchscreen.tap(direction.x, direction.y);
  await expect(page.locator('.vtt-area-caption')).toContainText('Área de efeito');
  await expect(page.locator('.vtt-target-card')).toContainText('Cone: 4.5 m');
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  await expect(page.locator('.vtt-area-caption')).toContainText('Área de efeito');
  expect((await state(request)).calls).toHaveLength(0);
  const layout = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= innerWidth,
    overflow: [...document.querySelectorAll('body *')]
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
        width: el.getBoundingClientRect().width,
      }))
      .filter((el) => el.width > 0 && (el.right > innerWidth + 1 || el.left < -1))
      .slice(0, 20),
  }));
  expect(layout.fits, JSON.stringify(layout.overflow)).toBe(true);
  await page.screenshot({ path: 'docs/vtt-acoes-jogador-mobile.png', fullPage: true });
});

test('3D renders, hover previews do not move pieces, click commits a logical path', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openTable(page);
  await topView(page);
  await hero(page);
  const destination = await cellPosition(page, 4, 4);
  await page.mouse.move(destination.x, destination.y);
  await expect(page.locator('.vtt-preview')).toContainText('Custo 3.0 m');
  expect((await state(request)).calls).toHaveLength(0);
  await page.mouse.click(destination.x, destination.y);
  await expect(page.locator('.vtt-statusbar')).toContainText('Posição 4,4');
  const updated = await state(request);
  expect(updated.tokens[0].movement_remaining).toBe(6);
  expect(updated.calls[0]).toMatchObject({
    rpc: 'move_battle_token',
    p_to_x: 4,
    p_to_y: 4,
    p_expected_version: 0,
    p_force: false,
  });
  expect(updated.calls[0].p_path).toHaveLength(2);
  expect(updated.calls[0].p_path.at(-1)).toEqual({ x: 4, y: 4 });
  expect(errors).toEqual([]);
});

test('blocked and over-budget destinations never submit movement', async ({ page, request }) => {
  await openTable(page);
  await topView(page);
  await hero(page);
  const blocked = await cellPosition(page, 7, 4);
  await page.mouse.move(blocked.x, blocked.y);
  await expect(page.locator('.vtt-preview')).toContainText('bloqueada');
  await page.mouse.click(blocked.x, blocked.y);
  const far = await cellPosition(page, 14, 10);
  await page.mouse.move(far.x, far.y);
  await expect(page.locator('.vtt-preview')).toContainText('acima do limite');
  await page.mouse.click(far.x, far.y);
  expect((await state(request)).calls).toHaveLength(0);
});

test('dragging a piece moves it while camera rotation and ground panning do not', async ({
  page,
  request,
}) => {
  await openTable(page);
  await topView(page);
  const from = await cellPosition(page, 2, 4),
    to = await cellPosition(page, 4, 4);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.vtt-statusbar')).toContainText('Posição 4,4');
  await page.getByRole('button', { name: 'Girar câmera', exact: true }).click();
  const canvas = (await page.getByLabel('Mapa tático 3D interativo').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 80, canvas.y + canvas.height / 2 + 20, {
    steps: 8,
  });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Jogar e mover peças', exact: true }).click();
  await page.mouse.move(canvas.x + 20, canvas.y + canvas.height - 75);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 80, canvas.y + canvas.height - 100, { steps: 8 });
  await page.mouse.up();
  expect(
    (await state(request)).calls.filter(
      (call: { rpc?: string }) => call.rpc === 'move_battle_token',
    ),
  ).toHaveLength(1);
});

test('mobile pinch is cancelled as movement and a destination requires two taps', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTable(page);
  await topView(page);
  await hero(page);
  await page.getByLabel('Mapa tático 3D interativo').scrollIntoViewIfNeeded();
  const from = await cellPosition(page, 2, 4);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: from.x, y: from.y, id: 1 },
      { x: from.x + 55, y: from.y + 30, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: from.x - 15, y: from.y, id: 1 },
      { x: from.x + 75, y: from.y + 30, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await state(request)).calls).toHaveLength(0);
  await topView(page);
  const destination = await cellPosition(page, 4, 4);
  await page.touchscreen.tap(destination.x, destination.y);
  await expect(page.locator('.vtt-preview')).toContainText('Toque novamente para confirmar');
  expect((await state(request)).calls).toHaveLength(0);
  await page.touchscreen.tap(destination.x, destination.y);
  await expect(page.locator('.vtt-statusbar')).toContainText('Posição 4,4');
  const layout = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= innerWidth,
    overflow: [...document.querySelectorAll('body *')]
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
        width: el.getBoundingClientRect().width,
      }))
      .filter((el) => el.width > 0 && (el.right > innerWidth + 1 || el.left < -1))
      .slice(0, 20),
  }));
  expect(layout.fits, JSON.stringify(layout.overflow)).toBe(true);
  await page.screenshot({ path: 'docs/vtt-3d-mobile.png', fullPage: true });
});

test('master terrain tools persist blocked cells through the existing repository', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
  const point = await cellPosition(page, 6, 4);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(async () =>
      (await state(request)).cells.some(
        (c: { x: number; y: number; blocked: boolean }) => c.x === 6 && c.y === 4 && c.blocked,
      ),
    )
    .toBe(true);
  expect(
    (await state(request)).calls.some((call: { rpc?: string }) => call.rpc === 'move_battle_token'),
  ).toBe(false);
});

test('player cannot move out of turn and cannot see hidden pieces', async ({ page, request }) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { active: 'rogue' } });
  await openTable(page, player);
  await topView(page);
  await hero(page);
  await expect(page.getByRole('button', { name: /Guardião oculto/ })).toHaveCount(0);
  await expect(page.getByText('Ferramentas do mestre', { exact: true })).toHaveCount(0);
  const destination = await cellPosition(page, 4, 4);
  await page.mouse.click(destination.x, destination.y);
  expect((await state(request)).calls).toHaveLength(0);
});

test('WebGL failure falls back to 2D and renderer switches cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(type: string, ...args: unknown[]) {
        return /webgl/i.test(type) ? null : Reflect.apply(original, this, [type, ...args]);
      },
    });
  });
  await openTable(page);
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  await expect(page.locator('.vtt-view-notice')).toContainText('aberta em 2D');
  await page.getByRole('button', { name: 'Aproximar', exact: true }).click();
  expect(errors).toEqual([]);
});

test('map views, shadows and camera presets work without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openTable(page);
  await topView(page);
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click();
  await page.screenshot({ path: 'docs/vtt-3d-desktop.png', fullPage: true });
  await page.getByLabel('Qualidade do 3D').selectOption('low');
  await page.getByRole('button', { name: 'Girar câmera à direita', exact: true }).click();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  await page.getByRole('button', { name: 'Superior', exact: true }).click();
  const layout = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= innerWidth,
    overflow: [...document.querySelectorAll('body *')]
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
        width: el.getBoundingClientRect().width,
      }))
      .filter((el) => el.width > 0 && (el.right > innerWidth + 1 || el.left < -1))
      .slice(0, 20),
  }));
  expect(layout.fits, JSON.stringify(layout.overflow)).toBe(true);
  expect(errors).toEqual([]);
});

test('large painted maps load all terrain pages', async ({ page, request }) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { largeTerrain: true } });
  const offsets: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.endsWith('/battle_map_cells'))
      offsets.push(url.searchParams.get('offset') ?? '0');
  });
  await openTable(page);
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  expect(offsets).toContain('500');
  expect(offsets).toContain('1000');
});

test('focusing a piece zooms to a playable position without changing its coordinates', async ({
  page,
  request,
}) => {
  await openTable(page);
  await topView(page);
  await hero(page);
  await page.getByRole('button', { name: 'Focar personagem selecionado', exact: true }).click();
  expect((await state(request)).calls).toHaveLength(0);
  const destination = await cellPosition(page, 4, 4, 16, 12, { x: 2, y: 4 });
  await page.mouse.move(destination.x, destination.y);
  await expect(page.locator('.vtt-preview')).toContainText('Custo 3.0 m');
  await page.mouse.click(destination.x, destination.y);
  await expect(page.locator('.vtt-statusbar')).toContainText('Posição 4,4');
});

test('selecting an NPC on the grid lets the GM edit its complete sheet and synchronizes the piece', async ({
  page,
  request,
}) => {
  await openTable(page);
  await topView(page);
  const point = await cellPosition(page, 11, 4);
  await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: 'Editar ficha do NPC', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab', { name: 'Atributos e combate' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await dialog.getByLabel('PV atuais', { exact: true }).fill('12');
  await dialog.getByLabel('PV temporários', { exact: true }).fill('4');
  await dialog.getByLabel('Classe de armadura', { exact: true }).fill('16');
  await dialog.getByRole('tab', { name: 'Identidade', exact: true }).click();
  await dialog.getByLabel('Nome', { exact: true }).fill('Sentinela aliada');
  await dialog.getByLabel('Relação com jogadores').selectOption('Aliada');
  await dialog.getByRole('button', { name: 'Salvar NPC', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const s = await state(request),
    npc = s.npcs.find((n: { id: string }) => n.id === s.tokens[2].npc_id);
  expect(npc).toMatchObject({ name: 'Sentinela aliada', hp_current: 12, hp_temp: 4, ac: 16 });
  expect(s.tokens[2]).toMatchObject({ name: 'Sentinela aliada', faction: 'ally' });
  await expect(page.locator('.vtt-actor-vitals')).toContainText('12/');
  await openTable(page, player);
  await expect(page.getByRole('button', { name: 'Editar ficha do NPC', exact: true })).toHaveCount(
    0,
  );
});

test('all die sizes, mixed formulas, advantage, animation and history work inside the table', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const state = window as unknown as Window & { diceAnimationFrames: number };
    state.diceAnimationFrames = 0;
    const original = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('dice-animation')) state.diceAnimationFrames++;
      return Reflect.apply(original, this, args);
    };
  });
  await openTable(page);
  await page.getByRole('tab', { name: 'Dados', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Rolagem de dados', exact: true });
  for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
    await panel.getByRole('button', { name: `Escolher d${sides}`, exact: true }).click();
    await expect(panel.getByLabel('Fórmula', { exact: true })).toHaveValue(`1d${sides}`);
  }
  await panel.getByLabel('Fórmula', { exact: true }).fill('1d4+1d6+1d8+1d10+1d12+1d20+1d100+3');
  await panel.getByLabel('Motivo da rolagem').fill('Todos os dados');
  await panel.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  const toast = page.getByRole('status', { name: 'Resultado da rolagem', exact: true });
  await expect(toast).toContainText('83');
  const canvas = toast.getByRole('img', { name: /^Animação dos dados:/ });
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as Window & { diceAnimationFrames: number }).diceAnimationFrames,
      ),
    )
    .toBeGreaterThan(1);
  await expect(panel.locator('.dice-history-row').first()).toContainText('Todos os dados');
  await page.screenshot({ path: 'docs/vtt-v12-mestre-dados.png', fullPage: true });
  await dismissDice(page);
  await panel.getByLabel('Fórmula', { exact: true }).fill('1d20+3');
  await panel.getByLabel('Modo do d20').selectOption('advantage');
  await panel.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(toast).toContainText('vantagem');
  await expect(toast.locator('.dice-total > b')).toHaveText('20');
  let s = await state(request);
  expect(s.rolls[1].terms[0]).toMatchObject({ values: [17, 5], kept: 0 });
  await dismissDice(page);
  await panel.getByLabel('Fórmula', { exact: true }).fill('alert(1)');
  await panel.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  s = await state(request);
  expect(s.rolls).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('public and private dice keep the correct audience after changing participants', async ({
  page,
  request,
}) => {
  await openTable(page);
  await page.getByRole('tab', { name: 'Dados', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Rolagem de dados', exact: true });
  await panel.getByLabel('Motivo da rolagem').fill('Rolagem pública');
  await panel.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(panel.locator('.dice-history')).toContainText('Rolagem pública');
  await dismissDice(page);
  await panel.getByLabel('Quem vê a rolagem').selectOption('gm');
  await panel.getByLabel('Motivo da rolagem').fill('Segredo do mestre');
  await panel.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(panel.locator('.dice-history')).toContainText('Segredo do mestre');
  await openTable(page, player);
  await expect(panel).toBeVisible();
  await expect(panel.locator('.dice-history')).toContainText('Rolagem pública');
  await expect(panel.locator('.dice-history')).not.toContainText('Segredo do mestre');
  await panel.getByLabel('Quem vê a rolagem').selectOption('self');
  await panel.getByLabel('Motivo da rolagem').fill('Teste reservado do jogador');
  await panel.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(panel.locator('.dice-history')).toContainText('Teste reservado do jogador');
  await openTable(page, master);
  await page.getByRole('tab', { name: 'Dados', exact: true }).click();
  await expect(panel.locator('.dice-history')).toContainText('Segredo do mestre');
  await expect(panel.locator('.dice-history')).not.toContainText('Teste reservado do jogador');
  expect((await state(request)).rolls).toHaveLength(3);
});

test('player rolls only after success; delayed replies disable repeat clicks and the same dice apply once', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { combatActions: true } });
  await openTable(page, player);
  await topView(page);
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Conjurar magia', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Escolher magia' });
  await expect(picker).toBeVisible();
  const bounds = await picker.boundingBox();
  expect(bounds!.x + bounds!.width / 2).toBeGreaterThan(500);
  expect(bounds!.x + bounds!.width / 2).toBeLessThan(1000);
  await picker.getByRole('button', { name: /Bola de Fogo.*Círculo/ }).click();
  await expect(picker).not.toBeVisible();
  const point = await cellPosition(page, 5, 4);
  await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: 'Enviar ao mestre', exact: true }).click();
  await expect(page.getByText('Aguardando o mestre', { exact: true })).toBeVisible();
  await expect(
    page.locator('.vtt-action-panel').getByRole('button', { name: 'Rolar dados', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.vtt-target-card')).not.toBeVisible();
  await openTable(page, master);
  const card = page.getByRole('region', { name: 'Tentativa Bola de Fogo' });
  await expect(card.getByRole('button', { name: 'Rolar dano', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Sucesso', exact: true }).click();
  await expect(card).not.toBeVisible();
  let s = await state(request);
  const id = s.tokens[0].character_id;
  expect(s.characters.find((c: { id: string }) => c.id === id).sheet.hp_current).toBe(40);
  expect(s.rolls).toHaveLength(0);
  await openTable(page, player);
  const result = page.getByRole('dialog', { name: 'Sucesso' });
  let release!: () => void;
  const delivery = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/rest/v1/rpc/roll_approved_battle_action', async (route) => {
    const response = await route.fetch();
    await delivery;
    await route.fulfill({ response });
  });
  await result.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(result.getByRole('button', { name: 'Rolando dados…', exact: true })).toBeDisabled();
  release();
  await expect(result.getByRole('img', { name: /Animação dos dados/ })).toBeVisible();
  await expect(result).toContainText('Você deu 24 de dano');
  s = await state(request);
  expect(s.rolls).toHaveLength(1);
  expect(s.actions[0].resolution.dice_roll_id).toBe(s.rolls[0].id);
  expect(s.rolls[0].consumed_at).not.toBeNull();
  expect(s.characters.find((c: { id: string }) => c.id === id).sheet.hp_current).toBe(16);
  expect(s.characters.find((c: { id: string }) => c.id === id).sheet.slots_used['3']).toBe(1);
  expect(
    s.calls.filter((c: { rpc: string }) => c.rpc === 'roll_approved_battle_action'),
  ).toHaveLength(1);
  await result.getByRole('button', { name: 'Voltar ao grid' }).click();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Sucesso' })).not.toBeVisible();
  expect((await state(request)).rolls).toHaveLength(1);
});
test('higher-slot healing opens the correct formula after approval and displays the healed HP', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, {
    data: { combatActions: true, heroHP: 10 },
  });
  await openTable(page, player);
  await topView(page);
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Conjurar magia', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Escolher magia' })
    .getByRole('button', { name: /Curar Ferimentos.*Círculo/ })
    .click();
  await page.getByLabel('Espaço de magia', { exact: true }).selectOption('slot:3');
  const point = await cellPosition(page, 2, 4);
  await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: 'Enviar ao mestre', exact: true }).click();
  await expect(page.getByText('Aguardando o mestre', { exact: true })).toBeVisible();
  await openTable(page, master);
  await page
    .getByRole('region', { name: 'Tentativa Curar Ferimentos' })
    .getByRole('button', { name: 'Sucesso', exact: true })
    .click();
  expect((await state(request)).rolls).toHaveLength(0);
  await openTable(page, player);
  const result = page.getByRole('dialog', { name: 'Sucesso' });
  await expect(result).toContainText('1d8+1d8+1d8+3');
  await result.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(result).toContainText('Você curou 15 PV');
  let s = await state(request);
  const id = s.tokens[0].character_id;
  expect(s.characters.find((c: { id: string }) => c.id === id).sheet.hp_current).toBe(25);
  expect(s.rolls[0].expression).toBe('1d8+1d8+1d8+3');
  expect(s.rolls).toHaveLength(1);
});

test('mobile dice navigation, percentile dice and reduced motion fit a phone screen', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTable(page, player);
  await page
    .getByRole('navigation', { name: 'Acesso rápido à batalha' })
    .getByRole('button', { name: 'Dados', exact: true })
    .click();
  const panel = page.getByRole('region', { name: 'Rolagem de dados', exact: true });
  await panel.getByRole('button', { name: 'Escolher d100', exact: true }).click();
  await panel.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  const toast = page.getByRole('status', { name: 'Resultado da rolagem' });
  await expect(toast.getByRole('img', { name: /^Animação dos dados:/ })).toBeVisible();
  const first = await toast
    .locator('canvas')
    .evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(150);
  expect(
    await toast.locator('canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL()),
  ).toBe(first);
  const layout = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= innerWidth,
    overflow: [...document.querySelectorAll('body *')]
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
        width: el.getBoundingClientRect().width,
      }))
      .filter((el) => el.width > 0 && (el.right > innerWidth + 1 || el.left < -1))
      .slice(0, 20),
  }));
  expect(layout.fits, JSON.stringify(layout.overflow)).toBe(true);
  await page.screenshot({ path: 'docs/vtt-v10-dados-mobile.png', fullPage: true });
  await dismissDice(page);
  await panel.getByLabel('Animar os dados', { exact: true }).uncheck();
  await expect(panel.getByLabel('Animar os dados', { exact: true })).not.toBeChecked();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Acesso rápido à batalha' })
    .getByRole('button', { name: 'Dados', exact: true })
    .click();
  await expect(panel.getByLabel('Animar os dados', { exact: true })).not.toBeChecked();
  expect((await state(request)).rolls).toHaveLength(1);
});

test('moving and advancing a turn reuse terrain while painting invalidates it', async ({
  page,
  request,
}) => {
  await openTable(page);
  await topView(page);
  await hero(page);
  const before = (await state(request)).reads.filter(
    (r: { table: string }) => r.table === 'battle_map_cells',
  ).length;
  const point = await cellPosition(page, 4, 4);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.vtt-statusbar')).toContainText('Posição 4,4');
  let s = await state(request);
  expect(s.reads.filter((r: { table: string }) => r.table === 'battle_map_cells')).toHaveLength(
    before,
  );
  await page.getByRole('button', { name: 'Próximo turno', exact: true }).click();
  await expect(page.locator('.vtt-turn-row.is-active')).toContainText('Kael');
  s = await state(request);
  expect(s.reads.filter((r: { table: string }) => r.table === 'battle_map_cells')).toHaveLength(
    before,
  );
  await page.getByRole('button', { name: 'Encerrar combate', exact: true }).click();
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
  const paint = await cellPosition(page, 6, 4);
  await page.mouse.click(paint.x, paint.y);
  await expect
    .poll(
      async () =>
        (await state(request)).reads.filter(
          (r: { table: string }) => r.table === 'battle_map_cells',
        ).length,
    )
    .toBeGreaterThan(before);
  expect(
    (await state(request)).cells.some((c: { x: number; y: number }) => c.x === 6 && c.y === 4),
  ).toBe(true);
});

test('GM decorates the 3D grid, edits and removes objects; textured objects persist and also appear in 2D', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page, master);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Decoração do cenário' });
  // <section> is an accessible named region.
  await editor.getByRole('button', { name: 'Árvore', exact: true }).click();
  let point = await cellPosition(page, 7, 5);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await state(request)).objects.length).toBe(1);
  await editor.getByRole('button', { name: 'Montanha', exact: true }).click();
  await editor.getByLabel('Largura (células)', { exact: true }).fill('2');
  await editor.getByLabel('Altura (células)', { exact: true }).fill('2');
  point = await cellPosition(page, 9, 7);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await state(request)).objects.length).toBe(2);
  for (const [name, x, y] of [
    ['Água', 5, 7],
    ['Fogo', 7, 8],
    ['Lava', 6, 9],
  ] as const) {
    await editor.getByRole('button', { name, exact: true }).click();
    await editor.getByLabel('Largura (células)', { exact: true }).fill('1');
    await editor.getByLabel('Altura (células)', { exact: true }).fill('1');
    point = await cellPosition(page, x, y);
    await page.mouse.click(point.x, point.y);
    await expect
      .poll(async () => (await state(request)).objects.length)
      .toBe(name === 'Água' ? 3 : name === 'Fogo' ? 4 : 5);
  }
  await page.getByRole('button', { name: 'Parar de decorar' }).click();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click();
  await page.screenshot({ path: 'docs/vtt-v12-cenario-3d.png', fullPage: true });
  await page.reload();
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await expect(editor).toContainText('Objetos no mapa (5)');
  await editor.getByRole('button', { name: /Árvore.*7,5/ }).click();
  await editor.getByLabel('Posição X', { exact: true }).fill('8');
  await editor.getByRole('button', { name: 'Aplicar alterações' }).click();
  await expect
    .poll(
      async () =>
        (await state(request)).objects.find(
          (o: { object_type: string }) => o.object_type === 'tree',
        ).geometry.x,
    )
    .toBe(8);
  await editor.getByRole('button', { name: 'Remover objeto' }).click();
  await expect.poll(async () => (await state(request)).objects.length).toBe(4);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo')).toBeVisible();
  await page.screenshot({ path: 'docs/vtt-v12-cenario-2d.png', fullPage: true });
});

test('mobile central spell picker and approved result fit the screen; GM failure cannot enable rolling', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await request.post(`${fixture}/__fixture/scenario`, { data: { combatActions: true } });
  await openTable(page, player);
  await page
    .getByRole('navigation', { name: 'Acesso rápido à batalha' })
    .getByRole('button', { name: 'Ficha / ações', exact: true })
    .click();
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Atacar com arma', exact: true }).click();
  let picker = page.getByRole('dialog', { name: 'Escolher arma' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button', { name: /Adaga/ })).toBeVisible();
  const box = await picker.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  await picker.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Conjurar magia', exact: true }).click();
  picker = page.getByRole('dialog', { name: 'Escolher magia' });
  await expect(picker).toBeVisible();
  await page.screenshot({ path: 'docs/vtt-v11-seletor-mobile.png', fullPage: true });
  await picker.getByRole('button', { name: 'Fechar', exact: true }).click();
  // A failed request is visible after reconnecting, and offers no damage roll.
  await request.post(`${fixture}/rest/v1/rpc/request_battle_action`, {
    headers: {
      Authorization: `Bearer test.${Buffer.from(JSON.stringify({ sub: player })).toString('base64url')}.test`,
    },
    data: { p_token_id: 'hero', p_client_id: 'mobile-failure', p_payload: { kind: 'dash' } },
  });
  const s = await state(request);
  await request.post(`${fixture}/rest/v1/rpc/approve_battle_action`, {
    data: { p_request_id: s.actions[0].id, p_success: false, p_resolution: {} },
  });
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Acesso rápido à batalha' })
    .getByRole('button', { name: 'Ficha / ações', exact: true })
    .click();
  await expect(page.locator('.vtt-last-result')).toContainText('Falha');
  await expect(
    page.locator('.vtt-action-panel').getByRole('button', { name: 'Rolar dados', exact: true }),
  ).toHaveCount(0);
  expect((await state(request)).rolls).toHaveLength(0);
});

test('approved player action and its dice animation remain accessible while the grid is fullscreen', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { combatActions: true } });
  const payload = {
    p_token_id: 'hero',
    p_client_id: 'fullscreen-action',
    p_payload: {
      kind: 'weapon',
      source_id: '81000000-0000-4000-8000-000000000004',
      target: { x: 3, y: 4 },
      target_ids: ['enemy'],
    },
  };
  await request.post(`${fixture}/rest/v1/rpc/request_battle_action`, {
    headers: {
      Authorization: `Bearer test.${Buffer.from(JSON.stringify({ sub: player })).toString('base64url')}.test`,
    },
    data: payload,
  });
  await openTable(page, player);
  await expect(page.getByText('Aguardando o mestre', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expandir mesa', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  const s = await state(request);
  await request.post(`${fixture}/rest/v1/rpc/approve_battle_action`, {
    data: { p_request_id: s.actions[0].id, p_success: true, p_resolution: {} },
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const result = page.getByRole('dialog', { name: 'Sucesso' });
  await expect(result).toBeVisible();
  expect(await result.evaluate((el) => document.fullscreenElement?.contains(el))).toBe(true);
  await result.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(result.getByRole('img', { name: /Animação dos dados/ })).toBeVisible();
  await expect(result).toContainText('Você deu');
  await result.getByRole('button', { name: 'Voltar ao grid' }).click();
  await page.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
  expect((await state(request)).rolls).toHaveLength(1);
});

test('grid editing is explicit, unavailable in combat and closes when a new battle starts', async ({
  page,
  request,
}) => {
  await openTable(page);
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tenda', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Encerrar combate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Tenda', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: 'Tenda', exact: true }).click();
  const p = await cellPosition(page, 9, 8);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await state(request)).objects.length).toBe(1);
  await page.getByRole('button', { name: 'Iniciar combate', exact: true }).click();
  const initiative = page.getByRole('dialog', { name: 'Definir iniciativa' });
  await initiative.getByRole('button', { name: 'Começar combate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tenda', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ocultar área', exact: true })).toHaveCount(0);
});

test('a large 3D lake picks the exact water cell and spends the correct movement budget', async ({
  page,
  request,
}) => {
  const initial = await state(request);
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      objects: [
        {
          id: 'lake',
          map_id: initial.map.id,
          object_type: 'water',
          geometry: { x: 1, y: 3, width: 5, height: 3, rotation: 0 },
          z: 0,
          blocks_movement: false,
          blocks_vision: false,
          visible: true,
          metadata: { movement_cost: 2 },
          created_at: initial.map.created_at,
          updated_at: initial.map.updated_at,
        },
      ],
    },
  });
  await openTable(page, player);
  await topView(page);
  await hero(page);
  const p = await cellPosition(page, 4, 4);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(async () => (await state(request)).tokens.find((t: { id: string }) => t.id === 'hero').x)
    .toBe(4);
  const after = await state(request);
  const moved = after.tokens.find((t: { id: string }) => t.id === 'hero');
  expect(moved.y).toBe(4);
  expect(moved.movement_remaining).toBe(3);
  expect(moved.action_used).toBe(false);
  const call = after.calls.find((c: { rpc?: string }) => c.rpc === 'move_battle_token');
  expect(call.p_to_x).toBe(4);
  expect(call.p_to_y).toBe(4);
});

test('GM conceals an area before combat, players see black cells and GM reveals it during combat', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page);
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByLabel('Tamanho do pincel de visibilidade').selectOption('3');
  await page.getByRole('button', { name: 'Ocultar área', exact: true }).click();
  let p = await cellPosition(page, 10, 3);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await state(request)).fog.length).toBe(9);
  await page.getByRole('button', { name: 'Concluir edição', exact: true }).click();
  const pc = await page.context().newPage();
  await openTable(pc, player);
  await pc.getByRole('button', { name: '2D', exact: true }).click();
  await expect(pc.getByRole('button', { name: /Sentinela das ruínas.*Iniciativa/ })).toHaveCount(0);
  const pixel = await pc.getByLabel('Mapa tático interativo').evaluate((node) => {
    const c = node as HTMLCanvasElement;
    const width = c.clientWidth,
      height = c.clientHeight;
    const zoom = Math.min((width - 72) / (16 * 64), (height - 72) / (12 * 64), 2.5);
    const panX = (width - 16 * 64 * zoom) / 2,
      panY = (height - 12 * 64 * zoom) / 2;
    const dpr = c.width / width;
    return [
      ...c
        .getContext('2d')!
        .getImageData(
          Math.floor((panX + 11.5 * 64 * zoom) * dpr),
          Math.floor((panY + 4.5 * 64 * zoom) * dpr),
          1,
          1,
        ).data,
    ];
  });
  expect(pixel.slice(0, 3)).toEqual([0, 0, 0]);
  await pc.screenshot({ path: 'docs/vtt-v12-area-oculta-jogador.png', fullPage: true });
  await request.post(`${fixture}/__fixture/scenario`, {
    data: { status: 'active', waitingHero: true },
  });
  await openTable(page, master);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await hero(page);
  await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeDisabled();
  await page.getByLabel('Tamanho do pincel de visibilidade').selectOption('3');
  await page.getByRole('button', { name: 'Revelar área', exact: true }).click();
  p = await cellPosition(page, 10, 3);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await state(request)).fog.length).toBe(0);
  await openTable(pc, player);
  await expect(pc.getByRole('button', { name: /Sentinela das ruínas.*Iniciativa/ })).toBeVisible();
  await pc.close();
});

test('portal traversal changes maps, preserves combat state and lets the GM follow the active character', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { portalMaps: true } });
  await openTable(page, player);
  await expect(page.locator('.vtt-portal-prompt')).toContainText('ECOS-01');
  const before = await state(request);
  await page.getByRole('button', { name: 'Atravessar portal', exact: true }).click();
  await expect(page.getByLabel('Mapa ativo')).toHaveValue('90000000-0000-4000-8000-000000000003');
  await expect(page.locator('.vtt-statusbar')).toContainText('Posição 4,4');
  const after = await state(request);
  expect(after.tokens[0].movement_remaining).toBe(before.tokens[0].movement_remaining);
  expect(after.session.active_token_id).toBe('hero');
  expect(after.tokens[0].action_used).toBe(false);
  const gm = await page.context().newPage();
  await openTable(gm, master);
  await hero(gm);
  await expect(gm.getByLabel('Mapa ativo')).toHaveValue(after.extraMaps[0].id);
  await gm.screenshot({ path: 'docs/vtt-v12-portal-entre-mapas.png', fullPage: true });
  await gm.close();
  await openTable(page, player);
  await expect(page.getByLabel('Mapa ativo')).toHaveValue(after.extraMaps[0].id);
  await page.getByRole('button', { name: 'Atravessar portal', exact: true }).click();
  await expect(page.getByLabel('Mapa ativo')).toHaveValue(before.map.id);
  await expect(page.locator('.vtt-statusbar')).toContainText('Posição 2,4');
});

test('new scenery and curved fire render in 3D and 2D without shader or browser errors', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|Shader|WebGL/.test(m.text())) errors.push(m.text());
  });
  const s = await state(request);
  const pieces = [
    ['tree', 9, 2, 1, 1],
    ['mountain', 13, 6, 2, 2],
    ['tent', 9, 7, 2, 2],
    ['road', 1, 9, 7, 1],
    ['cart', 4, 9, 2, 1],
    ['ice', 1, 1, 3, 2],
    ['rock', 12, 10, 1, 1],
    ['pit', 6, 7, 1, 1],
    ['portal', 9, 10, 2, 2],
    ['fire', 5, 6, 2, 2],
    ['water', 1, 5, 2, 3],
    ['lava', 14, 1, 2, 2],
  ] as const;
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      status: 'preparing',
      objects: pieces.map(([object_type, x, y, width, height], i) => ({
        id: `scenery-${i}`,
        map_id: s.map.id,
        object_type,
        geometry: { x, y, width, height, rotation: object_type === 'cart' ? 45 : 0 },
        z: 0,
        blocks_movement: ['tree', 'mountain', 'tent', 'cart', 'rock', 'pit'].includes(object_type),
        blocks_vision: false,
        visible: true,
        metadata: {
          movement_cost: object_type === 'water' || object_type === 'ice' ? 2 : 1,
          portal_code: object_type === 'portal' ? 'ARCANO-01' : undefined,
        },
        created_at: s.map.created_at,
        updated_at: s.map.updated_at,
      })),
    },
  });
  await openTable(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Carroça', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page.screenshot({ path: 'docs/vtt-v12-novos-elementos-3d.png', fullPage: true });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo')).toBeVisible();
  await page.screenshot({ path: 'docs/vtt-v12-novos-elementos-2d.png', fullPage: true });
  expect(errors).toEqual([]);
});
