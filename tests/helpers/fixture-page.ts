import { expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';
const seed = createDemoWorkspace();
export const fixtureUrl = 'http://127.0.0.1:54329';
export const fixtureCampaign = seed.campaigns[0].id;
export const fixturePlayer = seed.profiles[1].id;
export async function openFixturePage(page: Page, id = DEMO_USER_ID, section = 'mesa/grid') {
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
  await page.goto(`/campanhas/${fixtureCampaign}/${section}`);
}
export async function fixtureCell(page: Page, x: number, y: number) {
  const canvas = page.getByLabel('Mapa tático 3D interativo');
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!,
    aspect = rect.width / rect.height,
    radius = Math.hypot(16, 12) / 2 + 1.2,
    vertical = (21 * Math.PI) / 180,
    distance =
      (radius / Math.sin(Math.min(vertical, Math.atan(Math.tan(vertical) * aspect)))) * 1.02;
  const camera = new PerspectiveCamera(42, aspect, 0.05, 5000),
    target = new Vector3(8, 0, 6);
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
export async function fixtureTopView(page: Page) {
  await expect(page.getByLabel('Mapa tático 3D interativo')).toBeVisible();
  await page.getByRole('button', { name: 'Ajustar mapa', exact: true }).click();
  await openCamera(page);
  await page.getByRole('button', { name: 'Superior', exact: true }).click();
  await page.locator('.vtt-camera-controls > summary').click();
}

export async function openCamera(page: Page) {
  const menu = page.locator('.vtt-camera-controls');
  if (!(await menu.evaluate((element) => (element as HTMLDetailsElement).open)))
    await menu.locator('summary').click();
  return menu;
}

export async function openMasterTool(
  page: Page,
  tool: 'objects' | 'interactions' | 'terrain' | 'visibility' | 'participants' | 'rules',
) {
  const titles = {
    objects: 'Objetos',
    interactions: 'Interações',
    terrain: 'Terreno',
    visibility: 'Luz e visão',
    participants: 'Participantes',
    rules: 'Regras da mesa',
  };
  await page.getByRole('tab', { name: 'Cenário', exact: true }).click();
  const panel = page.getByRole('region', { name: `Ferramenta: ${titles[tool]}`, exact: true });
  if (await panel.isVisible()) return panel;
  const back = page.getByRole('button', { name: 'Voltar às ferramentas do mestre', exact: true });
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: `Abrir ${titles[tool]}`, exact: true }).click();
  await expect(panel).toBeVisible();
  return panel;
}

export async function chooseScenery(page: Page, name: string) {
  const tool = await openMasterTool(page, 'objects');
  await tool.getByRole('tab', { name: 'Biblioteca', exact: true }).click();
  await tool.getByRole('button', { name: 'Todos', exact: true }).click();
  const favorites = tool.getByRole('button', { name: /^Favoritos \(/ });
  if ((await favorites.getAttribute('aria-pressed')) === 'true') await favorites.click();
  await tool.getByLabel('Buscar elemento ou variante').fill(name);
  await tool.getByRole('button', { name, exact: true }).click();
  await tool.getByRole('tab', { name: 'Ajustes', exact: true }).click();
  return tool;
}

export async function openSceneryLibrary(page: Page) {
  const tool = await openMasterTool(page, 'objects');
  await tool.getByRole('tab', { name: 'Biblioteca', exact: true }).click();
  return tool;
}

export async function openScenerySettings(
  page: Page,
  section?: 'appearance' | 'size' | 'light' | 'behavior',
) {
  const tool = await openMasterTool(page, 'objects');
  await tool.getByRole('tab', { name: 'Ajustes', exact: true }).click();
  if (section) {
    const titles = {
      appearance: 'Aparência e materiais',
      size: 'Tamanho e movimento',
      light: 'Iluminação do elemento',
      behavior: 'Bloqueios e comportamento',
    };
    const disclosure = tool
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: titles[section] }) });
    if (!(await disclosure.evaluate((element) => (element as HTMLDetailsElement).open)))
      await disclosure.locator('summary').click();
  }
  return tool;
}

export async function openSceneryList(page: Page) {
  const tool = await openMasterTool(page, 'objects');
  await tool.getByRole('tab', { name: 'No mapa', exact: true }).click();
  return tool;
}

export async function expandSceneryInteractions(page: Page) {
  await openMasterTool(page, 'interactions');
  const section = page.getByRole('region', { name: 'Interações do cenário', exact: true });
  return section;
}

export async function fixtureCanvasCell(page: Page, x: number, y: number) {
  const canvas = page.getByLabel('Mapa tático interativo', { exact: true });
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  const width = rect.width;
  const height = Math.max(420, rect.height);
  const cell = Math.min(
    64 * 2.5,
    Math.max(64 * 0.08, Math.min((width - 72) / 16, (height - 72) / 12)),
  );
  return {
    x: rect.x + (width - 16 * cell) / 2 + (x + 0.5) * cell,
    y: rect.y + (height - 12 * cell) / 2 + (y + 0.5) * cell,
  };
}
