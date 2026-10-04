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
  await expect(page.getByRole('heading', { name: 'Mesa tática', exact: true })).toBeVisible();
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

test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/__fixture/reset`);
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/vtt-3d-mobile.png', fullPage: true });
});

test('master terrain tools persist blocked cells through the existing repository', async ({
  page,
  request,
}) => {
  await openTable(page);
  await topView(page);
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
