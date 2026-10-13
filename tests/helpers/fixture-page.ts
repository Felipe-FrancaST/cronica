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
  await page.getByRole('button', { name: 'Superior', exact: true }).click();
}
