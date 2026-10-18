import { expect, type Page } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { fixtureUrl, openFixturePage } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
const admin = '10000000-0000-4000-8000-000000000003';

test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
});
async function settings(page: Page, id = DEMO_USER_ID) {
  await openFixturePage(page, id);
  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir minha conta', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Excluir sua conta?' })).toBeVisible();
}
async function confirm(page: Page, password = 'SenhaForte123!') {
  const dialog = page.getByRole('dialog', { name: 'Excluir sua conta?' });
  await dialog.getByLabel('Senha atual', { exact: true }).fill(password);
  await dialog
    .getByLabel('Digite EXCLUIR MINHA CONTA', { exact: true })
    .fill('EXCLUIR MINHA CONTA');
  await dialog.getByLabel(/Entendo que meus dados/).check();
  await dialog.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
}
test('confirmed account deletion cancels renewal, removes files, deletes Auth and expires the browser session', async ({
  page,
  request,
}) => {
  await request.post(`${fixtureUrl}/__fixture/account`, { data: { renewal: true } });
  await settings(page);
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Excluir definitivamente', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true');
  await expect(dialog.getByText('campanhas criadas')).toBeVisible();
  await confirm(page);
  await expect(page).toHaveURL(/\/entrar\?conta=excluida/);
  await expect(
    page.getByText('Sua conta e seus dados foram excluídos.', { exact: true }),
  ).toBeVisible();
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.accounts.some((a: { id: string }) => a.id === DEMO_USER_ID)).toBe(false);
  expect(state.files).toHaveLength(0);
  expect(state.deletions).toHaveLength(0);
  expect(state.subscriptions[0].status).toBe('cancelled');
  const calls = state.calls as {
    provider?: string;
    method?: string;
    storage?: string;
    identity?: string;
  }[];
  expect(calls.findIndex((c) => c.method === 'PUT')).toBeLessThan(
    calls.findIndex((c) => c.storage === 'remove'),
  );
  expect(calls.findIndex((c) => c.storage === 'remove')).toBeLessThan(
    calls.findIndex((c) => c.identity === 'delete'),
  );
  expect((await page.request.get('/api/account/delete')).status()).toBe(401);
});
test('wrong passwords, foreign origins and forged user IDs leave the account intact', async ({
  page,
  request,
}) => {
  await request.post(`${fixtureUrl}/__fixture/account`, { data: { renewal: true } });
  await settings(page);
  await confirm(page, 'SenhaIncorreta!');
  await expect(page.getByRole('dialog').getByText(/Senha incorreta/)).toBeVisible();
  const response = await page.request.post('/api/account/delete', {
    headers: { origin: 'https://evil.test' },
    data: { password: 'SenhaForte123!', confirmation: 'EXCLUIR MINHA CONTA' },
  });
  expect(response.status()).toBe(403);
  const forged = await page.evaluate(async () => {
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: 'SenhaForte123!',
        confirmation: 'EXCLUIR MINHA CONTA',
        userId: '10000000-0000-4000-8000-000000000003',
      }),
    });
    return response.status;
  });
  expect(forged).toBe(400);
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.files).toHaveLength(3);
  expect(state.deletions).toHaveLength(0);
  expect(state.accounts.some((a: { id: string }) => a.id === DEMO_USER_ID)).toBe(true);
  expect(state.subscriptions[0].status).toBe('authorized');
});
test('storage failure can be resumed without another provider cancellation or password request', async ({
  page,
  request,
}) => {
  await request.post(`${fixtureUrl}/__fixture/account`, { data: { renewal: true } });
  await request.post(`${fixtureUrl}/__fixture/fail-storage`, { data: { times: 1 } });
  await settings(page);
  await confirm(page);
  await expect(
    page.getByRole('dialog').getByText(/Não foi possível remover todos os arquivos/),
  ).toBeVisible();
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.deletions[0].phase).toBe('purging');
  expect(state.accounts.some((a: { id: string }) => a.id === DEMO_USER_ID)).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar exclusão', exact: true }).click();
  await confirm(page);
  await expect(page).toHaveURL(/conta=excluida/);
  const final = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(final.calls.filter((c: { method?: string }) => c.method === 'PUT')).toHaveLength(1);
  expect(final.calls.filter((c: { auth?: string }) => c.auth === 'password')).toHaveLength(1);
});
test('administrator reaches personal settings and cannot delete the last active administrator', async ({
  page,
}) => {
  await openFixturePage(page, admin);
  await page.goto('/administracao');
  await page.getByRole('link', { name: 'Minha conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir minha conta', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/último administrador ativo/)).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Excluir definitivamente', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true');
});
test('deletion dialog fits a narrow screen and keeps confirmation controls reachable', async ({
  page,
  request,
}) => {
  await request.post(`${fixtureUrl}/__fixture/account`, { data: { renewal: false } });
  await page.setViewportSize({ width: 390, height: 844 });
  await settings(page);
  const dialog = page.getByRole('dialog');
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await dialog.getByLabel('Senha atual', { exact: true }).fill('SenhaForte123!');
  await dialog
    .getByLabel('Digite EXCLUIR MINHA CONTA', { exact: true })
    .fill('EXCLUIR MINHA CONTA');
  await dialog.getByLabel(/Entendo que meus dados/).check();
  await expect(
    dialog.getByRole('button', { name: 'Excluir definitivamente', exact: true }),
  ).not.toHaveAttribute('aria-disabled', 'true');
  await page.screenshot({ path: test.info().outputPath('deletion-mobile.png'), fullPage: true });
});
