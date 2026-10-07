import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { PerspectiveCamera, Vector3 } from 'three';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';
import { SCENERY, SCENERY_VARIANTS } from '../../src/features/vtt/scenery';
import type { MuralItem } from '../../src/features/mural/types';
import { ITEM_CATALOG } from '../../src/systems/dnd5e/items';
import type { BattleMapObject } from '../../src/features/vtt/types';

const fixture = 'http://127.0.0.1:54329';
const seed = createDemoWorkspace();
const campaign = seed.campaigns[0].id;
const master = DEMO_USER_ID;
const player = seed.profiles[1].id;
function sceneryFixture(
  id: string,
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number,
  metadata: Record<string, unknown> = {},
): BattleMapObject {
  return {
    id,
    map_id: '90000000-0000-4000-8000-000000000001',
    object_type: kind,
    geometry: { x, y, width, height, rotation: 0 },
    z: 0,
    visible: true,
    blocks_movement: false,
    blocks_vision: false,
    metadata,
    created_at: '2026-10-07T00:00:00Z',
    updated_at: '2026-10-07T00:00:00Z',
  };
}
test.use({ hasTouch: true });

async function openTable(page: Page, id = master, view?: 'grid' | 'mural') {
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
  await page.goto(`/campanhas/${campaign}/mesa${view ? '/' + view : ''}`);
  await expect(
    page.getByRole('heading', { name: 'Mesa', exact: true, includeHidden: true }),
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

test('workshop categories, building variants and material styles persist and render in both map modes', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page);
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: 'Construções', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tapete', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Taverna', exact: true }).click();
  await expect(page.getByLabel('Largura (células)', { exact: true })).toHaveValue('8');
  await page.getByLabel('Variante do elemento', { exact: true }).selectOption('port');
  await page.getByLabel('Estilo dos materiais').selectOption('coastal');
  await expect(page.getByLabel('Prévia do elemento em 2D')).toBeVisible();
  const p = await cellPosition(page, 7, 6);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await state(request)).objects.length).toBe(1);
  let object = (await state(request)).objects[0];
  expect(object.object_type).toBe('tavern');
  expect(object.metadata.style).toBe('coastal');
  expect(object.metadata.variant).toBe('port');
  await page.getByRole('button', { name: 'Concluir edição', exact: true }).click();
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('oficina-3d.png') });
  await page.reload();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  object = (await state(request)).objects[0];
  expect(object.metadata.style).toBe('coastal');
  await page.screenshot({ path: testInfo.outputPath('oficina-2d.png') });
  expect(errors).toEqual([]);
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
}, testInfo) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { combatActions: true } });
  await openTable(page, player);
  await topView(page);
  await page.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Conjurar magia', exact: true }).click();
  await page.getByRole('button', { name: /Bola de Fogo.*Círculo/ }).click();
  await expect(page.locator('.vtt-area-guide')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar ao mestre', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Visualizar área', exact: true }).click();
  const point = await cellPosition(page, 5, 4);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.vtt-area-caption')).toContainText('Área de efeito');
  await expect(page.locator('.vtt-area-guide')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('magia-area-v17-3d.png'), fullPage: true });
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
  await page.screenshot({ path: testInfo.outputPath('vtt-acoes-mestre.png'), fullPage: true });
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
  await page.screenshot({
    path: testInfo.outputPath('vtt-v11-resultado-jogador.png'),
    fullPage: true,
  });
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
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await request.post(`${fixture}/__fixture/scenario`, { data: { combatActions: true } });
  await openTable(page, player);
  await topView(page);
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Conjurar magia', exact: true }).click();
  await page.getByRole('button', { name: /Mãos Flamejantes.*Círculo/ }).click();
  await page.getByRole('button', { name: 'Visualizar área', exact: true }).click();
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
  await page.screenshot({
    path: testInfo.outputPath('vtt-acoes-jogador-mobile.png'),
    fullPage: true,
  });
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
}, testInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath('vtt-3d-mobile.png'), fullPage: true });
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

test('map views, shadows and camera presets work without browser errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openTable(page);
  await topView(page);
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('vtt-3d-desktop.png'), fullPage: true });
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
}, testInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath('vtt-v12-mestre-dados.png'), fullPage: true });
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
  await page.getByRole('button', { name: 'Visualizar área', exact: true }).click();
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
  await page.getByRole('button', { name: 'Visualizar área', exact: true }).click();
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
}, testInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath('vtt-v10-dados-mobile.png'), fullPage: true });
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
}, testInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath('vtt-v12-cenario-3d.png'), fullPage: true });
  await page.reload();
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await expect(editor).toContainText('Objetos no mapa (5)');
  await editor.getByRole('button', { name: /^Árvore.*7,5/ }).click();
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
  await page.screenshot({ path: testInfo.outputPath('vtt-v12-cenario-2d.png'), fullPage: true });
});

test('mobile central spell picker and approved result fit the screen; GM failure cannot enable rolling', async ({
  page,
  request,
}, testInfo) => {
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
  await page.screenshot({
    path: testInfo.outputPath('vtt-v11-seletor-mobile.png'),
    fullPage: true,
  });
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
  await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tenda', exact: true })).toBeDisabled();
  const blocked = page.getByRole('button', { name: 'Tenda', exact: true });
  await blocked.scrollIntoViewIfNeeded();
  const blockedRect = (await blocked.boundingBox())!;
  await page.mouse.click(
    blockedRect.x + blockedRect.width / 2,
    blockedRect.y + blockedRect.height / 2,
  );
  await expect(page.getByRole('status').filter({ hasText: 'Encerre o combate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toHaveCSS(
    'cursor',
    'pointer',
  );
  expect((await state(request)).objects).toHaveLength(0);
  await page.getByRole('button', { name: 'Encerrar combate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Configurar mapa', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Configurar mapa' })
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
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
  await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tenda', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ocultar área', exact: true })).toHaveCount(0);
});

for (const status of ['preparing', 'ended'] as const) {
  test(`grid controls work for an ${status} map despite independent and orphan active sessions`, async ({
    page,
    request,
  }) => {
    if (status === 'ended') await page.setViewportSize({ width: 390, height: 844 });
    const initial = await state(request);
    const independentSession = {
      ...initial.session,
      id: '90000000-0000-4000-8000-000000000004',
      name: 'Combate independente',
      active_token_id: null,
    };
    const independentMap = {
      ...initial.map,
      id: '90000000-0000-4000-8000-000000000003',
      battle_session_id: independentSession.id,
      name: 'Outro encontro',
    };
    await request.post(`${fixture}/__fixture/scenario`, {
      data: {
        status,
        extraMaps: [independentMap],
        extraSessions: [
          independentSession,
          {
            ...independentSession,
            id: '90000000-0000-4000-8000-000000000005',
            name: 'Sessão sem mapa',
          },
        ],
      },
    });
    await openTable(page);
    await page.getByRole('button', { name: 'Configurar mapa', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Configurar mapa' });
    await dialog.getByLabel('Largura', { exact: true }).fill('17');
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await state(request)).map.width).toBe(17);
    await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Tenda', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tenda', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Concluir edição', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toBeEnabled();
    await page.getByRole('combobox', { name: 'Mapa ativo' }).selectOption(independentMap.id);
    await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toBeDisabled();
    await page.getByRole('combobox', { name: 'Mapa ativo' }).selectOption(initial.map.id);
    await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toBeEnabled();
    await page.reload();
    await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toBeEnabled();
    const after = await state(request);
    expect(after.extraSessions.map((s: { status: string }) => s.status)).toEqual([
      'active',
      'active',
    ]);
  });
}

test('portal-linked maps both keep the grid controls locked during their shared combat', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { portalMaps: true } });
  await openTable(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  const initial = await state(request);
  for (const id of [initial.map.id, initial.extraMaps[0].id]) {
    await page.getByRole('combobox', { name: 'Mapa ativo' }).selectOption(id);
    await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toBeDisabled();
  }
  await page.getByRole('button', { name: 'Encerrar combate', exact: true }).click();
  for (const id of [initial.map.id, initial.extraMaps[0].id]) {
    await page.getByRole('combobox', { name: 'Mapa ativo' }).selectOption(id);
    await expect(page.getByRole('button', { name: 'Editar grid', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toBeEnabled();
  }
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
  playwright,
  launchOptions,
  baseURL,
}, testInfo) => {
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
  // Participants need separate cookie jars and auth locks, like separate users.
  const playerBrowser = await playwright.chromium.launch(launchOptions);
  const pc = await playerBrowser.newPage({ baseURL });
  try {
    await openTable(pc, player);
    await pc.getByRole('button', { name: '2D', exact: true }).click();
    await expect(pc.getByRole('button', { name: /Sentinela das ruínas.*Iniciativa/ })).toHaveCount(
      0,
    );
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
    await pc.screenshot({
      path: testInfo.outputPath('vtt-v12-area-oculta-jogador.png'),
      fullPage: true,
    });
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
    await expect(
      pc.getByRole('button', { name: /Sentinela das ruínas.*Iniciativa/ }),
    ).toBeVisible();
  } finally {
    await playerBrowser.close();
  }
});

test('portal traversal changes maps, preserves combat state and lets the GM follow the active character', async ({
  page,
  request,
  playwright,
  launchOptions,
  baseURL,
}, testInfo) => {
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
  const masterBrowser = await playwright.chromium.launch(launchOptions);
  const gm = await masterBrowser.newPage({ baseURL });
  try {
    await openTable(gm, master);
    await hero(gm);
    await expect(gm.getByLabel('Mapa ativo')).toHaveValue(after.extraMaps[0].id);
    await gm.screenshot({
      path: testInfo.outputPath('vtt-v12-portal-entre-mapas.png'),
      fullPage: true,
    });
  } finally {
    await masterBrowser.close();
  }
  await openTable(page, player);
  await expect(page.getByLabel('Mapa ativo')).toHaveValue(after.extraMaps[0].id);
  await page.getByRole('button', { name: 'Atravessar portal', exact: true }).click();
  await expect(page.getByLabel('Mapa ativo')).toHaveValue(before.map.id);
  await expect(page.locator('.vtt-statusbar')).toContainText('Posição 2,4');
});

test('new scenery and curved fire render in 3D and 2D without shader or browser errors', async ({
  page,
  request,
}, testInfo) => {
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
  await page.screenshot({
    path: testInfo.outputPath('vtt-v12-novos-elementos-3d.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('vtt-v12-novos-elementos-2d.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('scaled terrain brushes apply one rectangle per request and the eraser preserves painted terrain', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page);
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByLabel('Largura do pincel', { exact: true }).fill('3');
  await page.getByLabel('Largura do pincel', { exact: true }).fill('3.9');
  await expect(page.getByLabel('Largura do pincel', { exact: true })).toHaveValue('3');
  await page.getByLabel('Altura do pincel', { exact: true }).fill('2');
  let p = await cellPosition(page, 7, 8);
  for (const [tool, type, cost, blocked] of [
    ['Bloquear', 'blocked', 1, true],
    ['Difícil', 'difficult', 2, false],
    ['Personalizado', 'lama', 3, false],
  ] as const) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    if (tool === 'Personalizado') {
      await page.getByPlaceholder('Tipo: água, gelo, lama…').fill('lama');
      await page.getByLabel('Custo de movimento do terreno', { exact: true }).fill('3');
    }
    p = await cellPosition(page, 7, 8);
    await page.mouse.click(p.x, p.y);
    await expect
      .poll(
        async () =>
          (await state(request)).cells.filter(
            (c: {
              x: number;
              y: number;
              terrain_type: string;
              movement_cost: number;
              blocked: boolean;
            }) =>
              c.x >= 7 &&
              c.x < 10 &&
              c.y >= 8 &&
              c.y < 10 &&
              c.terrain_type === type &&
              c.movement_cost === cost &&
              c.blocked === blocked,
          ).length,
      )
      .toBe(6);
  }
  await page.getByRole('button', { name: 'Barril', exact: true }).click();
  p = await cellPosition(page, 7, 8);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await state(request)).objects.length).toBe(1);
  await page.getByRole('button', { name: 'Apagar objetos', exact: true }).click();
  p = await cellPosition(page, 7, 8);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await state(request)).objects.length).toBe(0);
  expect(
    (await state(request)).cells.filter((c: { terrain_type: string }) => c.terrain_type === 'lama'),
  ).toHaveLength(6);
  await page.getByRole('button', { name: 'Normal', exact: true }).click();
  p = await cellPosition(page, 7, 8);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(
      async () =>
        (await state(request)).cells.filter(
          (c: { x: number; y: number }) => c.x >= 7 && c.x < 10 && c.y >= 8 && c.y < 10,
        ).length,
    )
    .toBe(0);
  const after = await state(request);
  expect(
    after.calls.filter((c: { rpc?: string }) => c.rpc === 'paint_battle_terrain'),
  ).toHaveLength(4);
  expect(
    after.calls.filter((c: { rpc?: string }) => c.rpc === 'erase_battle_scenery'),
  ).toHaveLength(1);
});

test('an object selected on the 3D grid saves its variant and color and can be deleted from its list', async ({
  page,
  request,
}, testInfo) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page);
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: 'Barril', exact: true }).click();
  await page.getByLabel('Código da cor', { exact: true }).fill('#dd4477');
  const p = await cellPosition(page, 9, 8);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await state(request)).objects[0]?.metadata.color).toBe('#dd4477');
  const id = (await state(request)).objects[0].id;
  await page.getByRole('button', { name: 'Selecionar objeto', exact: true }).click();
  await page.mouse.click(p.x, p.y);
  await expect(
    page.getByRole('button', { name: 'Excluir elemento selecionado', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Variante do elemento', { exact: true }).selectOption('crate');
  await page.getByLabel('Código da cor', { exact: true }).fill('#oops');
  await expect(page.getByLabel('Código da cor', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(
    page.getByRole('button', { name: 'Aplicar alterações', exact: true }),
  ).toBeDisabled();
  expect((await state(request)).objects[0].metadata.color).toBe('#dd4477');
  await page.getByLabel('Código da cor', { exact: true }).fill('#33bb88');
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect.poll(async () => (await state(request)).objects[0]?.metadata.variant).toBe('crate');
  expect((await state(request)).objects[0].id).toBe(id);
  expect((await state(request)).objects[0].metadata.color).toBe('#33bb88');
  await page.getByRole('button', { name: 'Parar de decorar', exact: true }).click();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('vtt-v13-cor-e-variante-2d.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Excluir Caixote em 9,8', exact: true }).click();
  await expect.poll(async () => (await state(request)).objects.length).toBe(0);
});

test('all new elements and variants render with individual colors in 3D and 2D without shader errors', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|Shader|WebGL/.test(m.text())) errors.push(m.text());
  });
  const s = await state(request);
  const pieces = [
    ['barrel', 'default'],
    ['barrel', 'crate'],
    ['campfire', 'default'],
    ['campfire', 'brazier'],
    ['boat', 'default'],
    ['boat', 'ship'],
    ['bush', 'default'],
    ['bush', 'thorn'],
    ['flowers', 'default'],
    ['flowers', 'mushrooms'],
    ['statue', 'default'],
    ['statue', 'obelisk'],
    ['chest', 'default'],
    ['chest', 'open'],
    ['portal', 'default'],
    ['portal', 'door'],
    ['portal', 'cave'],
    ['ice', 'default'],
    ['ice', 'snow'],
    ['tree', 'autumn'],
    ['rock', 'crystal'],
    ['road', 'cobblestone'],
    ['fire', 'default'],
    ['water', 'default'],
    ['lava', 'default'],
  ];
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      status: 'preparing',
      objects: pieces.map(([object_type, variant], i) => ({
        id: `v13-${i}`,
        map_id: s.map.id,
        object_type,
        geometry: {
          x: 1 + (i % 6) * 2,
          y: 1 + Math.floor(i / 6) * 2,
          width: 1,
          height: 1,
          rotation: 0,
        },
        z: 0,
        blocks_movement: false,
        blocks_vision: false,
        visible: true,
        metadata: {
          movement_cost: 1,
          variant,
          color: i % 3 === 0 ? '#af80da' : i % 3 === 1 ? '#76b6cf' : undefined,
          portal_code: object_type === 'portal' ? `GATE-${i}` : undefined,
        },
        created_at: s.map.created_at,
        updated_at: s.map.updated_at,
      })),
    },
  });
  await openTable(page);
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: 'Portal', exact: true }).click();
  await page.getByLabel('Variante do elemento', { exact: true }).selectOption('cave');
  await expect(page.getByLabel('Código do portal', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('vtt-v13-elementos-3d.png'), fullPage: true });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('vtt-v13-elementos-2d.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect((await state(request)).objects).toHaveLength(pieces.length);
});

const muralFixture = (i: number, overrides: Partial<MuralItem> = {}): MuralItem => ({
  id: `92000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  campaign_id: campaign,
  kind: 'note',
  title: `Pista ${i}`,
  description: 'Uma descoberta para os aventureiros.',
  image_path: null,
  source_location_id: null,
  source_npc_id: null,
  visible_to_players: true,
  pinned: false,
  sort_order: i,
  created_at: '2026-10-06T12:00:00.000Z',
  updated_at: '2026-10-06T12:00:00.000Z',
  ...overrides,
});

test('v14 Mesa routes open Mural independently and return to the existing Grid combat', async ({
  page,
  request,
}) => {
  const before = await state(request);
  await openTable(page, master, 'mural');
  await expect(page.getByRole('heading', { name: 'Mural', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mesa', exact: true })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Áreas da Mesa' }).getByRole('link', { name: /^Mural/ }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(
    (await state(request)).reads.some((r: { table: string }) => r.table.startsWith('battle_')),
  ).toBe(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mural', exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Áreas da Mesa' })
    .getByRole('link', { name: /^Grid/ })
    .click();
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grid', exact: true })).toBeVisible();
  expect((await state(request)).session).toEqual(before.session);
  expect((await state(request)).tokens).toEqual(before.tokens);
});

test('v14 GM links private locals and NPC presentations while players see only published cards', async ({
  page,
  request,
  playwright,
  launchOptions,
  baseURL,
}) => {
  const privateNpc = seed.npcs.find((n) => !n.visible_to_players)!;
  const location = seed.world.find((w) => w.kind === 'location')!;
  await openTable(page, master, 'mural');
  await page.getByRole('button', { name: 'Mostrar NPC', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Novo cartão', exact: true });
  await editor.getByLabel('NPC vinculado', { exact: true }).selectOption(privateNpc.id);
  await expect(editor.getByLabel('Descrição do cartão', { exact: true })).toHaveValue(
    privateNpc.appearance,
  );
  await expect(editor.getByLabel('Mostrar aos jogadores', { exact: true })).not.toBeChecked();
  await editor.getByLabel('Título do cartão', { exact: true }).fill('Um viajante misterioso');
  await editor.getByRole('button', { name: 'Salvar cartão', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.getByRole('button', { name: 'Vincular local', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Novo cartão', exact: true });
  await editor.getByLabel('Local vinculado', { exact: true }).selectOption(location.id);
  await expect(editor.getByLabel('Descrição do cartão', { exact: true })).toHaveValue(
    location.description,
  );
  await editor.getByLabel('Mostrar aos jogadores', { exact: true }).check();
  await editor.getByRole('button', { name: 'Salvar cartão', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const cards = (await state(request)).muralItems;
  expect(cards[0].source_npc_id).toBe(privateNpc.id);
  expect(cards[1].source_location_id).toBe(location.id);
  expect(JSON.stringify(cards)).not.toContain(privateNpc.biography);
  expect(JSON.stringify(cards)).not.toContain(location.secrets);
  const browser = await playwright.chromium.launch(launchOptions);
  try {
    const playerPage = await browser.newPage({ baseURL });
    await openTable(playerPage, player, 'mural');
    await expect(
      playerPage.getByRole('article', { name: `Cartão ${location.name}`, exact: true }),
    ).toBeVisible();
    await expect(
      playerPage.getByRole('article', { name: 'Cartão Um viajante misterioso', exact: true }),
    ).toHaveCount(0);
    await expect(playerPage.getByRole('button', { name: 'Novo cartão', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Mostrar Um viajante misterioso', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Ocultar Um viajante misterioso', exact: true }),
    ).toBeVisible();
    await playerPage.getByRole('button', { name: 'Atualizar mural', exact: true }).click();
    await playerPage
      .getByRole('button', { name: 'Abrir Um viajante misterioso', exact: true })
      .click();
    const reader = playerPage.getByRole('dialog', { name: 'Um viajante misterioso', exact: true });
    await expect(reader).toContainText(privateNpc.appearance);
    await expect(reader).not.toContainText(privateNpc.biography);
    await expect(reader.getByRole('button', { name: /ficha|Editar/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ocultar Um viajante misterioso', exact: true }).click();
    await playerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(reader).not.toBeVisible();
    await expect(
      playerPage.getByRole('article', { name: 'Cartão Um viajante misterioso', exact: true }),
    ).toHaveCount(0);
  } finally {
    await browser.close();
  }
});

test('v14 Mural image upload preserves the draft after an error and editing or deleting keeps the source', async ({
  page,
  request,
}) => {
  await openTable(page, master, 'mural');
  await page.getByRole('button', { name: 'Imagem', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Novo cartão', exact: true });
  await editor.getByLabel('Título do cartão', { exact: true }).fill('Mapa da expedição');
  await editor.getByLabel('Descrição do cartão', { exact: true }).fill('O caminho até a vila.');
  await editor.getByLabel('Escolher imagem do cartão', { exact: true }).setInputFiles({
    name: 'expedicao.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOMKPRgwAaYsIoOWgkA2j4BIfv4ZIMAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await editor.getByLabel('Mostrar aos jogadores', { exact: true }).check();
  await request.post(`${fixture}/__fixture/scenario`, { data: { uploadError: true } });
  await editor.getByRole('button', { name: 'Salvar cartão', exact: true }).click();
  await expect(editor).toContainText('Falha simulada no upload');
  await expect(editor.getByAltText('Prévia da imagem do cartão', { exact: true })).toBeVisible();
  await request.post(`${fixture}/__fixture/scenario`, { data: { uploadError: false } });
  await editor.getByRole('button', { name: 'Salvar cartão', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect((await state(request)).muralItems[0].image_path).toMatch(
    new RegExp(`^campaign_mural/${campaign}/.*\\.png$`),
  );
  await expect(
    page
      .getByRole('article', { name: 'Cartão Mapa da expedição', exact: true })
      .getByRole('img', { name: 'Mapa da expedição', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Editar Mapa da expedição', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Editar cartão', exact: true });
  await editor.getByLabel('Título do cartão', { exact: true }).fill('Caminho da expedição');
  await editor.getByLabel('Destacar no mural', { exact: true }).check();
  await editor.getByRole('button', { name: 'Salvar cartão', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Cartão Caminho da expedição', exact: true }),
  ).toHaveClass(/mural-card-pinned/);
  const sources = (await state(request)).npcs.map((n: { id: string }) => n.id);
  await page.getByRole('button', { name: 'Excluir Caminho da expedição', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Confirmar exclusão', exact: true })
    .click();
  await expect(page.getByRole('article')).toHaveCount(0);
  expect((await state(request)).npcs.map((n: { id: string }) => n.id)).toEqual(sources);
});

test('v14 Mural orders pinned cards, searches and rejects an edit changed in another window', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, {
    data: { muralItems: [muralFixture(1), muralFixture(2), muralFixture(3, { pinned: true })] },
  });
  await openTable(page, master, 'mural');
  await expect(page.getByRole('article').first()).toHaveAttribute('aria-label', 'Cartão Pista 3');
  await page.getByRole('button', { name: 'Mover Pista 2 para cima', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state(request)).muralItems.find((i: MuralItem) => i.title === 'Pista 2').sort_order,
    )
    .toBe(1);
  await expect(page.getByRole('article').nth(1)).toHaveAttribute('aria-label', 'Cartão Pista 2');
  await page.getByLabel('Buscar no mural', { exact: true }).fill('Pista 2');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar Pista 2', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar cartão', exact: true });
  await editor.getByLabel('Título do cartão', { exact: true }).fill('Mudança atrasada');
  const items = (await state(request)).muralItems.map((i: MuralItem) =>
    i.title === 'Pista 2'
      ? { ...i, title: 'Mudança recente', updated_at: '2027-01-01T00:00:00.000Z' }
      : i,
  );
  await request.post(`${fixture}/__fixture/scenario`, { data: { muralItems: items } });
  await editor.getByRole('button', { name: 'Salvar cartão', exact: true }).click();
  await expect(editor).toContainText('Este cartão mudou em outra janela');
  expect(
    (await state(request)).muralItems.some((i: MuralItem) => i.title === 'Mudança recente'),
  ).toBe(true);
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByLabel('Buscar no mural', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Atualizar mural', exact: true }).click();
  await expect(
    page.getByRole('article', { name: 'Cartão Mudança recente', exact: true }),
  ).toBeVisible();
});

test('v14 Mural master editor and player reader fit a phone without exposing draft cards', async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      muralItems: [
        muralFixture(1, {
          kind: 'location',
          title: 'Fortaleza do Norte',
          description: 'Uma fortaleza medieval no fim da estrada.',
          image_path: '/images/fortress.webp',
          pinned: true,
        }),
        muralFixture(2, {
          kind: 'npc',
          title: 'O vigia da ponte',
          description: 'Um sentinela observa a entrada da vila.',
        }),
        muralFixture(3, { title: 'A pista guardada', visible_to_players: false }),
      ],
    },
  });
  await openTable(page, master, 'mural');
  await page.getByRole('button', { name: 'Editar Fortaleza do Norte', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar cartão', exact: true });
  await expect(editor).toBeVisible();
  expect(await editor.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('mesa-v14-mural-mestre-mobile.png'),
    fullPage: true,
  });
  await openTable(page, player, 'mural');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Editar |^Excluir |Novo cartão/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir Fortaleza do Norte', exact: true }).click();
  const reader = page.getByRole('dialog', { name: 'Fortaleza do Norte', exact: true });
  await expect(reader.getByRole('img', { name: 'Fortaleza do Norte', exact: true })).toBeVisible();
  await expect(reader).toContainText('Uma fortaleza medieval');
  expect(await reader.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('mesa-v14-mural-jogador-mobile.png'),
    fullPage: true,
  });
});

test('all 46 scenery elements and 94 additional variants render in 3D and 2D', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|Shader|WebGL/.test(m.text())) errors.push(m.text());
  });
  const s = await state(request);
  const pieces = SCENERY.flatMap((kind) =>
    ['default', ...(SCENERY_VARIANTS[kind.id] ?? []).map((v) => v.id)].map((variant) => ({
      kind: kind.id,
      variant,
    })),
  );
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      status: 'preparing',
      cells: [],
      tokens: [],
      mapSize: { width: 36, height: Math.ceil(pieces.length / 12) * 3 },
      objects: pieces.map(({ kind: object_type, variant }, i) => ({
        id: `v14-${i}`,
        map_id: s.map.id,
        object_type,
        geometry: { x: (i % 12) * 3, y: Math.floor(i / 12) * 3, width: 2, height: 2, rotation: 0 },
        z: 0,
        blocks_movement: false,
        blocks_vision: false,
        visible: true,
        metadata: {
          movement_cost: 1,
          variant,
          color: i % 5 === 0 ? '#85bdaf' : undefined,
          portal_code: object_type === 'portal' ? `ARC-${i}` : undefined,
        },
        created_at: s.map.created_at,
        updated_at: s.map.updated_at,
      })),
    },
  });
  await openTable(page, master, 'grid');
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('mesa-v14-catalogo-3d.png'), fullPage: true });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mesa-v14-catalogo-2d.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect((await state(request)).objects).toHaveLength(pieces.length);
});

test('v14 variant search places and edits medieval houses and crops with persistent colors', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page);
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByLabel('Buscar elemento ou variante', { exact: true }).fill('nevada');
  await expect(page.getByRole('button', { name: 'Montanha', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Casa medieval', exact: true })).toHaveCount(0);
  await page.getByLabel('Buscar elemento ou variante', { exact: true }).fill('estalagem');
  await page.getByRole('button', { name: 'Casa medieval', exact: true }).click();
  await page.getByLabel('Variante do elemento', { exact: true }).selectOption('inn');
  await expect(page.getByLabel('Largura (células)', { exact: true })).toHaveValue('8');
  await page.getByLabel('Largura (células)', { exact: true }).fill('3');
  await page.getByLabel('Altura (células)', { exact: true }).fill('3');
  await page.getByLabel('Código da cor', { exact: true }).fill('#bd8356');
  const point = await cellPosition(page, 9, 8);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await state(request)).objects[0]?.metadata.variant).toBe('inn');
  expect((await state(request)).objects[0].blocks_movement).toBe(true);
  await page.getByLabel('Buscar elemento ou variante', { exact: true }).fill('aboboras');
  await page.getByRole('button', { name: 'Plantação', exact: true }).click();
  await page.getByLabel('Variante do elemento', { exact: true }).selectOption('pumpkins');
  await expect(page.getByLabel('Largura (células)', { exact: true })).toHaveValue('8');
  await page.getByLabel('Largura (células)', { exact: true }).fill('2');
  await page.getByLabel('Altura (células)', { exact: true }).fill('2');
  const field = await cellPosition(page, 6, 10);
  await page.mouse.click(field.x, field.y);
  await expect.poll(async () => (await state(request)).objects.length).toBe(2);
  const crops = (await state(request)).objects.find(
    (o: { object_type: string }) => o.object_type === 'crops',
  );
  expect(crops.blocks_movement).toBe(false);
  expect(crops.metadata.movement_cost).toBe(2);
  await page.getByRole('button', { name: 'Parar de decorar', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir Estalagem em 9,8', exact: true }).click();
  await expect.poll(async () => (await state(request)).objects.length).toBe(1);
  await page.reload();
  expect((await state(request)).objects[0].metadata.variant).toBe('pumpkins');
});

test('v15 GM creates numbered sessions, archives scenery, reuses a grid and starts the next chapter', async ({
  page,
  request,
}) => {
  const before = await state(request);
  await openTable(page);
  await page.getByRole('link', { name: 'Sessões', exact: true }).click();
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Criar sessão', exact: true });
  await dialog.getByLabel('Nome da sessão', { exact: true }).fill('A estrada');
  await expect(dialog.getByLabel('Número da sessão', { exact: true })).toHaveValue('2');
  await dialog.getByRole('button', { name: 'Salvar sessão', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar sessão', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /O início.*Em andamento/ }).click();
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Encerrar sessão', exact: true });
  await dialog
    .getByLabel('Resumo da sessão (visível aos jogadores)', { exact: true })
    .fill('As ruínas ficaram para trás.');
  await dialog.getByRole('button', { name: 'Encerrar e arquivar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.session-summary')).toContainText('As ruínas ficaram para trás.');
  const ended = await state(request);
  expect(ended.tokens).toHaveLength(0);
  expect(ended.cells).toEqual(before.cells);
  expect(ended.characters).toEqual(before.characters);
  await page.getByRole('link', { name: 'Ver grids salvos', exact: true }).click();
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configurar mapa', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rolar dados', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reaproveitar cenário', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Reaproveitar cenário', exact: true });
  await dialog.getByLabel('Nome do novo grid', { exact: true }).fill('Ruínas revisitadas');
  await dialog.getByRole('button', { name: 'Copiar cenário', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const copied = await state(request);
  expect(copied.extraMaps).toHaveLength(1);
  expect(copied.extraMaps[0].adventure_session_id).not.toBe(copied.map.adventure_session_id);
  expect(copied.tokens).toHaveLength(0);
  await page
    .getByLabel('Sessão da Mesa', { exact: true })
    .selectOption(copied.extraMaps[0].adventure_session_id);
  await expect(page.getByLabel('Mapa ativo', { exact: true })).toHaveValue(copied.extraMaps[0].id);
  await page.getByRole('link', { name: 'Sessões', exact: true }).click();
  await page.getByRole('button', { name: /A estrada.*Em preparação/ }).click();
  await page.getByRole('button', { name: 'Iniciar sessão', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state(request)).adventures.find((s: { number: number }) => s.number === 2).status,
    )
    .toBe('active');
});

test('v15 Mural and manual occurrences belong to their chapter and remain readable after closure', async ({
  page,
  request,
  playwright,
  launchOptions,
  baseURL,
}) => {
  await openTable(page, master, 'mural');
  await page.getByRole('button', { name: 'Novo cartão', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Novo cartão', exact: true });
  await dialog.getByLabel('Tipo de cartão', { exact: true }).selectOption('note');
  await dialog.getByLabel('Título do cartão', { exact: true }).fill('A chave antiga');
  await dialog
    .getByLabel('Descrição do cartão', { exact: true })
    .fill('Uma chave encontrada entre as ruínas.');
  await dialog.getByLabel('Mostrar aos jogadores', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Salvar cartão', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: 'Sessões', exact: true }).click();
  await expect(page.locator('.session-journal')).toContainText('A chave antiga');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Registrar acontecimento', exact: true });
  await dialog.getByLabel('Título', { exact: true }).fill('A ponte foi cruzada');
  await dialog.getByLabel('Descrição', { exact: true }).fill('Todos chegaram à outra margem.');
  await dialog.getByRole('button', { name: 'Salvar acontecimento', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.session-journal')).toContainText('A ponte foi cruzada');
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Encerrar sessão', exact: true });
  await dialog.getByRole('button', { name: 'Encerrar e arquivar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const browser = await playwright.chromium.launch(launchOptions);
  try {
    const other = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 } });
    await openTable(other, player, 'mural');
    await expect(other.getByRole('heading', { name: 'Mural', exact: true })).toBeVisible();
    await expect(other.locator('.mural')).toContainText('A chave antiga');
    await expect(other.getByRole('button', { name: 'Novo cartão', exact: true })).toHaveCount(0);
    await expect(other.getByRole('button', { name: /^Editar |^Excluir / })).toHaveCount(0);
    await other.goto(`/campanhas/${campaign}/sessoes`);
    await expect(other.locator('.session-journal')).toContainText('A ponte foi cruzada');
    await expect(other.getByRole('button', { name: 'Criar sessão', exact: true })).toHaveCount(0);
    expect(
      await other.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    await browser.close();
  }
  expect((await state(request)).muralItems[0].adventure_session_id).toBe(
    (await state(request)).adventures[0].id,
  );
});

test('v15 campaign level is locked on player sheets and sheet permissions preserve reading', async ({
  page,
  request,
  playwright,
  launchOptions,
  baseURL,
}) => {
  await openTable(page);
  await page.getByRole('link', { name: 'Regras', exact: true }).click();
  await page.getByLabel('Nível atual do grupo', { exact: true }).fill('7');
  await page.getByLabel('Mestre controla o nível de todos', { exact: false }).check();
  await page.getByRole('button', { name: 'Salvar regras', exact: true }).click();
  await expect.poll(async () => (await state(request)).rules[0].party_level).toBe(7);
  const browser = await playwright.chromium.launch(launchOptions);
  try {
    const other = await browser.newPage({ baseURL });
    await openTable(other, player);
    await other.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
    let sheet = other.getByRole('dialog');
    await expect(sheet.getByLabel('Nível', { exact: true })).toHaveValue('7');
    await expect(sheet.getByLabel('Nível', { exact: true })).toBeDisabled();
    await expect(sheet).toContainText('Nível definido pelo mestre');
    await sheet.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByLabel('Permitir editar as próprias fichas', { exact: false }).uncheck();
    await page.getByRole('button', { name: 'Salvar regras', exact: true }).click();
    await expect
      .poll(async () => (await state(request)).rules[0].players_can_edit_sheets)
      .toBe(false);
    await other.reload();
    await other.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
    sheet = other.getByRole('dialog');
    await expect(sheet.getByLabel('Nome do personagem', { exact: true })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: /Salvar ficha/ })).toHaveCount(0);
  } finally {
    await browser.close();
  }
});

test('v15 duplicate session errors stay in the editor and a new chapter has an independent Mural', async ({
  page,
  request,
}) => {
  await openTable(page, master, 'mural');
  await page.getByRole('link', { name: 'Sessões', exact: true }).click();
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Criar sessão', exact: true });
  await dialog.getByLabel('Nome da sessão', { exact: true }).fill('Outra história');
  await dialog.getByLabel('Número da sessão', { exact: true }).fill('1');
  await dialog.getByRole('button', { name: 'Salvar sessão', exact: true }).click();
  await expect(dialog).toContainText('Já existe uma sessão');
  await dialog.getByLabel('Número da sessão', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Salvar sessão', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: 'Abrir Mural', exact: true }).click();
  await expect(page.locator('.mural')).toContainText('Novo cartão');
  await page.getByRole('button', { name: 'Novo cartão', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Novo cartão', exact: true });
  await dialog.getByLabel('Tipo de cartão', { exact: true }).selectOption('note');
  await dialog.getByLabel('Título do cartão', { exact: true }).fill('Pista da segunda sessão');
  await dialog.getByRole('button', { name: 'Salvar cartão', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const current = await state(request);
  await page
    .getByLabel('Sessão da Mesa', { exact: true })
    .selectOption(current.adventures.find((s: { number: number }) => s.number === 1).id);
  await expect(page.locator('.mural')).not.toContainText('Pista da segunda sessão');
});

test('v15 dice animation survives a temporarily collapsed panel without invalid canvas radii', async ({
  page,
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
  await page.addStyleTag({ content: '.dice-animation{width:1px!important;min-width:0!important}' });
  const panel = page.getByRole('region', { name: 'Rolagem de dados', exact: true });
  await panel.getByLabel('Fórmula', { exact: true }).fill('2d6+3');
  await panel.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { diceAnimationFrames: number }).diceAnimationFrames,
      ),
    )
    .toBeGreaterThan(10);
  const animation = page.getByRole('img', { name: 'Animação dos dados: 2d6+3' }).first();
  await expect(animation).toBeVisible();
  expect(await animation.evaluate((el) => el.clientWidth)).toBe(1);
  expect(errors).toEqual([]);
});

test('v17 potion picker, GM approval and player dice heal once and consume one item', async ({
  page,
  request,
}, testInfo) => {
  const s = await state(request),
    c = s.characters.find((c: any) => c.id === s.tokens[0].character_id);
  const { use: _use, ...potion } = ITEM_CATALOG.find((i) => i.catalog_id === 'potion-healing')!;
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      actorSheet: {
        ...c.sheet,
        class_id: 'fighter',
        level: 5,
        class_levels: [{ class_id: 'fighter', level: 5 }],
        hp_current: 5,
        hp_max_override: 40,
        spells: [],
        inventory: [{ ...potion, id: '81000000-0000-4000-8000-000000000017', quantity: 2 }],
      },
    },
  });
  await openTable(page, player);
  await topView(page);
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Conjurar magia', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Usar item', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Usar item', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: /Poção de cura/ }).click();
  await expect(picker).not.toBeVisible();
  const point = await cellPosition(page, 2, 4);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.vtt-target-card')).toContainText('2d4+2');
  await page.getByRole('button', { name: 'Enviar ao mestre', exact: true }).click();
  await expect(page.getByText('Aguardando o mestre', { exact: true })).toBeVisible();
  await openTable(page, master);
  await page
    .getByRole('region', { name: 'Tentativa Poção de cura', exact: true })
    .getByRole('button', { name: 'Sucesso', exact: true })
    .click();
  let now = await state(request);
  expect(now.characters.find((v: any) => v.id === c.id).sheet.inventory[0].quantity).toBe(1);
  expect(now.characters.find((v: any) => v.id === c.id).sheet.hp_current).toBe(5);
  expect(now.rolls).toHaveLength(0);
  await openTable(page, player);
  const result = page.getByRole('dialog', { name: 'Sucesso', exact: true });
  await expect(result).toContainText('2d4+2');
  await result.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(result).toContainText(/Você curou \d+ PV/);
  await page.screenshot({ path: testInfo.outputPath('pocao-resultado-v17.png'), fullPage: true });
  now = await state(request);
  expect(now.characters.find((v: any) => v.id === c.id).sheet.hp_current).toBe(
    5 + now.actions[0].resolution.roll,
  );
  expect(now.rolls).toHaveLength(1);
  expect(now.characters.find((v: any) => v.id === c.id).sheet.inventory[0].quantity).toBe(1);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Sucesso', exact: true })).toHaveCount(0);
  expect((await state(request)).rolls).toHaveLength(1);
});

test('v17 class ability picker uses its class level and bonus action without spending movement', async ({
  page,
  request,
}) => {
  const s = await state(request),
    c = s.characters.find((c: any) => c.id === s.tokens[0].character_id);
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      actorSheet: {
        ...c.sheet,
        class_id: 'fighter',
        level: 8,
        class_levels: [
          { class_id: 'fighter', level: 5 },
          { class_id: 'rogue', level: 3 },
        ],
        hp_current: 1,
        hp_max_override: 40,
        spells: [],
        feature_uses: {},
      },
    },
  });
  await openTable(page, player);
  await page.getByRole('button', { name: 'Executar ações', exact: true }).click();
  await page.getByRole('button', { name: 'Habilidades', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Habilidades de classe', exact: true });
  await expect(picker.getByRole('button', { name: /Retomar o Fôlego/ })).toContainText('1d10+5');
  await picker.getByRole('button', { name: /Retomar o Fôlego/ }).click();
  await page.getByRole('button', { name: 'Enviar ao mestre', exact: true }).click();
  await expect(page.getByText('Aguardando o mestre', { exact: true })).toBeVisible();
  await openTable(page, master);
  await page
    .getByRole('region', { name: 'Tentativa Retomar o Fôlego', exact: true })
    .getByRole('button', { name: 'Sucesso', exact: true })
    .click();
  await openTable(page, player);
  const result = page.getByRole('dialog', { name: 'Sucesso', exact: true });
  await expect(result).toContainText('1d10+5');
  await result.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(result).toContainText(/Você curou \d+ PV/);
  const now = await state(request);
  expect(
    now.characters.find((v: any) => v.id === c.id).sheet.feature_uses['fighter:second-wind'],
  ).toBe(1);
  expect(now.tokens[0].bonus_used).toBe(true);
  expect(now.tokens[0].action_used).toBe(false);
  expect(now.tokens[0].movement_remaining).toBe(s.tokens[0].movement_remaining);
});

test('v20 city creation loads a complete editable medieval map in both views', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error' && /THREE|WebGL|shader/i.test(e.text())) errors.push(e.text());
  });
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page);
  await page.getByRole('button', { name: 'Novo mapa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar mapa tático', exact: true });
  await dialog.getByLabel('Cenário inicial', { exact: true }).selectOption('medieval-city');
  await expect(dialog.getByLabel('Largura (células)', { exact: true })).toHaveValue('128');
  await expect(dialog.getByLabel('Altura (células)', { exact: true })).toHaveValue('112');
  await expect(dialog.getByLabel(/Prévia de Valedouro/)).toBeVisible();
  await dialog
    .getByLabel(/Prévia de Valedouro/)
    .screenshot({ path: testInfo.outputPath('valedouro-previa.png') });
  await dialog.getByRole('button', { name: 'Criar cidade', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await state(request)).objects.length).toBe(175);
  const city = (await state(request)).extraMaps[0];
  expect(city.width).toBe(128);
  expect(city.height).toBe(112);
  expect(city.scale_per_cell).toBe(1.5);
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click();
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: testInfo.outputPath('valedouro-3d.png') });
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Aproximar', exact: true }).click();
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: testInfo.outputPath('valedouro-detalhes-3d.png') });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page
    .getByLabel('Mapa tático interativo', { exact: true })
    .screenshot({ path: testInfo.outputPath('valedouro-2d.png') });
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: /^Fonte de Valedouro.*56,50/ }).click();
  await page.getByLabel('Altura visual (metros)', { exact: true }).fill('4.2');
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state(request)).objects.find(
          (o: { metadata: { name?: string } }) => o.metadata.name === 'Fonte de Valedouro',
        )?.metadata.height_metres,
    )
    .toBe(4.2);
  expect(
    (await state(request)).calls.filter((c: { rpc?: string }) => c.rpc === 'create_battle_scene'),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('v20 large mountains retain size, height and material style after editing and refresh', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post(`${fixture}/__fixture/scenario`, {
    data: { status: 'preparing', mapSize: { width: 96, height: 80 } },
  });
  await openTable(page);
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: 'Montanha', exact: true }).click();
  await expect(page.getByLabel('Largura (células)', { exact: true })).toHaveValue('32');
  await page.getByLabel('Variante do elemento', { exact: true }).selectOption('snowy');
  await expect(page.getByLabel('Largura (células)', { exact: true })).toHaveValue('40');
  await expect(page.getByLabel('Altura (células)', { exact: true })).toHaveValue('36');
  await page.getByLabel('Largura (células)', { exact: true }).fill('48');
  await page.getByLabel('Altura (células)', { exact: true }).fill('40');
  await page.getByLabel('Altura visual (metros)', { exact: true }).fill('70');
  await page.getByLabel('Estilo dos materiais', { exact: true }).selectOption('winter');
  const point = await cellPosition(page, 8, 10, 96, 80);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await state(request)).objects.length).toBe(1);
  const saved = (await state(request)).objects[0];
  expect(saved.geometry.width).toBe(48);
  expect(saved.geometry.height).toBe(40);
  expect(saved.metadata.height_metres).toBe(70);
  expect(saved.metadata.style).toBe('winter');
  await page.getByRole('button', { name: 'Concluir edição', exact: true }).click();
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click();
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: testInfo.outputPath('montanha-3d.png') });
  await page.reload();
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: /^Montanha nevada.*8,10/ }).click();
  await expect(page.getByLabel('Largura (células)', { exact: true })).toHaveValue('48');
  await expect(page.getByLabel('Altura visual (metros)', { exact: true })).toHaveValue('70');
  await expect(page.getByLabel('Estilo dos materiais', { exact: true })).toHaveValue('winter');
  await page.getByLabel('Largura (células)', { exact: true }).fill('129');
  const apply = page.getByRole('button', { name: 'Aplicar alterações', exact: true });
  await expect(apply).toBeDisabled();
  await apply.scrollIntoViewIfNeeded();
  const applyBounds = (await apply.boundingBox())!;
  await page.mouse.click(
    applyBounds.x + applyBounds.width / 2,
    applyBounds.y + applyBounds.height / 2,
  );
  await expect(
    page.getByRole('status').filter({ hasText: 'Use dimensões inteiras de 1 a 128 células.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restaurar tamanho padrão', exact: true }).click();
  await expect(page.getByLabel('Largura (células)', { exact: true })).toHaveValue('40');
  await expect(page.getByLabel('Altura visual (metros)', { exact: true })).toHaveValue('');
  expect(errors).toEqual([]);
});

// v21: continuous surfaces, persisted lighting and chapter deletion.
test('v21 GM switches day and night during combat; players see the saved period without editing it', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/THREE.*ERROR|Shader Error/i.test(message.text())) errors.push(message.text());
  });
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      objects: [
        sceneryFixture('road', 'road', 0, 0, 16, 12),
        sceneryFixture('lamp', 'torch', 7, 5, 1, 1, { variant: 'lantern' }),
        sceneryFixture('house', 'house', 8, 2, 4, 4),
      ],
    },
  });
  await openTable(page);
  await topView(page);
  await expect(page.getByLabel('Período do grid')).toHaveValue('day');
  await page.getByLabel('Período do grid').selectOption('night');
  await expect.poll(async () => (await state(request)).map.lighting).toBe('night');
  await expect(page.getByLabel('Período do grid')).toHaveValue('night');
  expect((await state(request)).session.status).toBe('active');
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: testInfo.outputPath('night-3d.png') });
  await page.reload();
  await expect(page.getByLabel('Período do grid')).toHaveValue('night');
  await openTable(page, player);
  await expect(page.getByLabel('Período do grid')).toHaveCount(0);
  await expect(page.locator('.vtt-lighting-control')).toHaveText('Noite');
  expect(errors).toEqual([]);
});

test('v21 2D night darkens the map and local lamps brighten it without revealing fog', async ({
  page,
  request,
}, testInfo) => {
  const objects = [
    sceneryFixture('road', 'road', 0, 0, 16, 12),
    sceneryFixture('lamp', 'torch', 6, 5, 1, 1, { variant: 'lantern', light_radius: 12 }),
  ];
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing', objects } });
  await openTable(page);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  const brightness = () =>
    page.locator('.vtt-canvas-base').evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      for (let i = 0; i < pixels.length; i += 16)
        total += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
      return total / (pixels.length / 16);
    });
  await expect(page.getByLabel('Mapa tático interativo')).toBeVisible();
  await expect.poll(brightness).toBeGreaterThan(25);
  const day = await brightness();
  await page.getByLabel('Período do grid').selectOption('night');
  await expect.poll(brightness).toBeLessThan(day * 0.9);
  const lit = await brightness();
  await page.locator('.vtt-canvas-wrap').screenshot({ path: testInfo.outputPath('night-2d.png') });
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      objects: [
        objects[0],
        { ...objects[1], metadata: { ...objects[1].metadata, light_enabled: false } },
      ],
    },
  });
  await page.reload();
  await expect(page.getByLabel('Mapa tático interativo')).toBeVisible();
  await expect.poll(brightness).toBeLessThan(lit - 1);
  const unlit = await brightness();
  await request.post(`${fixture}/__fixture/scenario`, {
    data: { objects, fog: [{ id: 'fog-lamp', map_id: objects[1].map_id, x: 6, y: 5 }] },
  });
  await page.reload();
  await expect.poll(brightness).toBeLessThan(unlit + 1);
  await page
    .locator('.vtt-canvas-wrap')
    .screenshot({ path: testInfo.outputPath('night-hidden-lamp.png') });
});

test('v21 joined road pieces keep their own selection and deletion in 3D and 2D', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      status: 'preparing',
      objects: [
        sceneryFixture('road-left', 'road', 0, 0, 8, 3, { name: 'Rua oeste' }),
        sceneryFixture('road-right', 'road', 8, 0, 8, 3, { name: 'Rua leste' }),
        sceneryFixture('road-crossing', 'road', 6, 0, 3, 7, { name: 'Cruzamento' }),
        sceneryFixture('water-left', 'water', 0, 8, 8, 4),
        sceneryFixture('water-right', 'water', 8, 8, 8, 4),
      ],
    },
  });
  await openTable(page);
  await topView(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.getByRole('button', { name: 'Selecionar objeto', exact: true }).click();
  let position = await cellPosition(page, 2, 1);
  await page.mouse.click(position.x, position.y);
  await expect(page.locator('.vtt-scenery-selected')).toContainText('Editando Rua oeste');
  position = await cellPosition(page, 12, 1);
  await page.mouse.click(position.x, position.y);
  await expect(page.locator('.vtt-scenery-selected')).toContainText('Editando Rua leste');
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: testInfo.outputPath('continuous-surfaces-3d.png') });
  await page.getByRole('button', { name: 'Remover objeto', exact: true }).click();
  await expect
    .poll(async () =>
      (await state(request)).objects.some((o: BattleMapObject) => o.id === 'road-right'),
    )
    .toBe(false);
  expect((await state(request)).objects.some((o: BattleMapObject) => o.id === 'road-left')).toBe(
    true,
  );
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page
    .locator('.vtt-canvas-wrap')
    .screenshot({ path: testInfo.outputPath('continuous-surfaces-2d.png') });
  expect(errors).toEqual([]);
});

test('v21 only the obelisk appears in the workshop and saved legacy statues use that model', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      status: 'preparing',
      objects: [sceneryFixture('legacy-statue', 'statue', 8, 5, 2, 2, { variant: 'default' })],
    },
  });
  await openTable(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Estátua', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Obelisco', exact: true }).click();
  await expect(page.getByLabel('Variante do elemento')).toHaveValue('obelisk');
  await expect(page.getByLabel('Variante do elemento').locator('option')).toHaveCount(1);
  await page.locator('.vtt-scenery-row > button').filter({ hasText: 'Obelisco' }).click();
  await expect(page.getByLabel('Variante do elemento')).toHaveValue('obelisk');
  await expect(page.locator('.vtt-scenery-selected')).toContainText('Editando Obelisco');
});

test('v21 emission controls persist and validate the physical light radius', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__fixture/scenario`, {
    data: {
      status: 'preparing',
      objects: [sceneryFixture('lamp', 'torch', 8, 5, 1, 1, { variant: 'lantern' })],
    },
  });
  await openTable(page);
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  await page.getByRole('button', { name: 'Editar grid', exact: true }).click();
  await page.locator('.vtt-scenery-row > button').filter({ hasText: 'Lanterna' }).click();
  await page.getByLabel('Emissão de luz', { exact: true }).selectOption('on');
  await page.getByLabel('Alcance da luz (metros)', { exact: true }).fill('61');
  await expect(
    page.getByRole('button', { name: 'Aplicar alterações', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Alcance da luz (metros)', { exact: true }).fill('15');
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect.poll(async () => (await state(request)).objects[0].metadata.light_radius).toBe(15);
  await page.getByLabel('Emissão de luz', { exact: true }).selectOption('off');
  await expect(page.getByLabel('Alcance da luz (metros)', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect
    .poll(async () => (await state(request)).objects[0].metadata.light_enabled)
    .toBe(false);
});

test('v21 GM confirms deleting planned and archived sessions; active sessions explain why deletion is blocked', async ({
  page,
  request,
}) => {
  await openTable(page);
  await page.getByRole('link', { name: 'Sessões', exact: true }).click();
  const blocked = page.getByRole('button', { name: 'Excluir sessão', exact: true });
  await expect(blocked).toBeDisabled();
  const rect = (await blocked.boundingBox())!;
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Encerre a sessão em andamento antes de excluí-la.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Criar sessão', exact: true });
  await dialog.getByLabel('Nome da sessão', { exact: true }).fill('Rascunho');
  await dialog.getByRole('button', { name: 'Salvar sessão', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const before = await state(request);
  await page.getByRole('button', { name: 'Excluir sessão', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Excluir sessão', exact: true });
  await expect(dialog).toContainText(
    'As fichas de personagens, NPCs e locais permanecem na campanha.',
  );
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await state(request)).adventures).toHaveLength(2);
  await page.getByRole('button', { name: 'Excluir sessão', exact: true }).click();
  await dialog.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await state(request)).adventures.length).toBe(1);
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Encerrar sessão', exact: true })
    .getByRole('button', { name: 'Encerrar e arquivar', exact: true })
    .click();
  await page.getByRole('button', { name: 'Excluir sessão', exact: true }).click();
  await dialog.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
  await expect(page.getByText('Escreva o primeiro capítulo.', { exact: true })).toBeVisible();
  const after = await state(request);
  expect(after.adventures).toHaveLength(0);
  expect(after.characters).toEqual(before.characters);
  await openTable(page, player);
  await page.getByRole('link', { name: 'Sessões', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Excluir sessão', exact: true })).toHaveCount(0);
});

test('v21 Valedouro has continuous streets and warm night lights in both renderers', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error' && /THREE|WebGL|shader/i.test(e.text())) errors.push(e.text());
  });
  await request.post(`${fixture}/__fixture/scenario`, { data: { status: 'preparing' } });
  await openTable(page);
  await page.getByRole('button', { name: 'Novo mapa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar mapa tático', exact: true });
  await dialog.getByLabel('Cenário inicial', { exact: true }).selectOption('medieval-city');
  await dialog.getByRole('button', { name: 'Criar cidade', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click();
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: testInfo.outputPath('city-day-3d.png') });
  await page.getByLabel('Período do grid').selectOption('night');
  await expect.poll(async () => (await state(request)).extraMaps[0].lighting).toBe('night');
  await expect(page.getByLabel('Período do grid')).toHaveValue('night');
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: testInfo.outputPath('city-night-3d.png') });
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Aproximar', exact: true }).click();
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: testInfo.outputPath('city-night-detail.png') });
  await page.getByLabel('Qualidade do 3D').selectOption('low');
  await page
    .getByLabel('Mapa tático 3D interativo')
    .screenshot({ path: testInfo.outputPath('city-night-low.png') });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await page
    .getByLabel('Mapa tático interativo', { exact: true })
    .screenshot({ path: testInfo.outputPath('city-night-2d.png') });
  expect(errors).toEqual([]);
});
