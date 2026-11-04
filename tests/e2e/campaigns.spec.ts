import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { fixtureUrl, openFixturePage } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import type { Campaign } from '../../src/types';

test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
});
test('the actual campaign form creates, edits and reloads a campaign through PostgreSQL RLS', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post(`${fixtureUrl}/__fixture/campaign-access`);
  await openFixturePage(page, DEMO_USER_ID, '');
  await page.goto('/campanhas?criar=1');
  await expect(page.getByRole('dialog', { name: 'Um novo capítulo' })).toBeVisible();
  await page.getByLabel('Nome da campanha', { exact: true }).fill('O reino dos sete ventos');
  await page
    .getByLabel('Descrição', { exact: true })
    .fill('Uma campanha criada pelo formulário real.');
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === '/rest/v1/rpc/save_campaign_checked',
  );
  await page.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'O reino dos sete ventos', exact: true }),
  ).toBeVisible({ timeout: 15000 });
  let data = (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()) as {
    campaigns: Campaign[];
  };
  expect(data.campaigns).toHaveLength(1);
  const saved = data.campaigns[0];
  expect(saved.owner_id).toBe(DEMO_USER_ID);
  await page.goto(`/campanhas/${saved.id}/configuracoes`);
  await page.getByLabel('Nome da campanha', { exact: true }).fill('Os sete ventos — capítulo II');
  await page
    .getByLabel('Descrição', { exact: true })
    .fill('Descrição atualizada sem perder a campanha.');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('Campanha atualizada.');
  await page.reload();
  await expect(page.getByLabel('Nome da campanha', { exact: true })).toHaveValue(
    'Os sete ventos — capítulo II',
  );
  data = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(data.campaigns).toHaveLength(1);
  expect(data.campaigns[0].id).toBe(saved.id);
  expect(errors).toEqual([]);
});
test('free master access also creates a campaign through the checked save', async ({
  page,
  request,
}) => {
  await request.post(`${fixtureUrl}/__fixture/campaign-access`, { data: { mode: 'free' } });
  await openFixturePage(page, DEMO_USER_ID, '');
  await page.goto('/campanhas?criar=1');
  await page.getByLabel('Nome da campanha', { exact: true }).fill('Aventura gratuita');
  await page.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Aventura gratuita', exact: true })).toBeVisible({
    timeout: 15000,
  });
  const data = (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()) as {
    campaigns: Campaign[];
  };
  expect(data.campaigns).toHaveLength(1);
});

test('an older tab preserves its draft, rejects a conflict and restores its own text after reload', async ({
  page,
  request,
  playwright,
  launchOptions,
}) => {
  await request.post(`${fixtureUrl}/__fixture/campaign-access`, { data: { mode: 'free' } });
  await openFixturePage(page, DEMO_USER_ID, '');
  await page.goto('/campanhas?criar=1');
  await page.getByLabel('Nome da campanha', { exact: true }).fill('Campanha com versões');
  await page.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Campanha com versões', exact: true }),
  ).toBeVisible({ timeout: 15000 });
  const state = (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()) as {
    campaigns: Campaign[];
  };
  const path = `/campanhas/${state.campaigns[0].id}/configuracoes`;
  await page.goto(path);
  // The optional serverless Chromium runtime supports one page per browser process.
  const isolated =
    process.env.PLAYWRIGHT_SINGLE_PROCESS === 'true'
      ? await playwright.chromium.launch(launchOptions)
      : null;
  const second = isolated
    ? await isolated.newPage({ baseURL: new URL(page.url()).origin })
    : await page.context().newPage();
  if (isolated) await openFixturePage(second, DEMO_USER_ID, '');
  try {
    await second.goto(path);
    await page.getByLabel('Descrição', { exact: true }).fill('Texto confirmado da primeira aba.');
    await second
      .getByLabel('Descrição', { exact: true })
      .fill('Rascunho mantido pela segunda aba.');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.locator('.toast')).toHaveText('Campanha atualizada.');
    await second.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(second.getByText(/Esta campanha mudou ou foi removida/)).toBeVisible();
    await expect(second.getByLabel('Descrição', { exact: true })).toHaveValue(
      'Rascunho mantido pela segunda aba.',
    );
    await second.reload();
    await expect(
      second.getByRole('button', { name: 'Recuperar rascunho', exact: true }),
    ).toBeVisible();
    await expect(second.getByLabel('Descrição', { exact: true })).toHaveValue(
      'Texto confirmado da primeira aba.',
    );
    await second.getByRole('button', { name: 'Recuperar rascunho', exact: true }).click();
    await expect(second.getByLabel('Descrição', { exact: true })).toHaveValue(
      'Rascunho mantido pela segunda aba.',
    );
    const actual = (await (await request.get(`${fixtureUrl}/__fixture/state`)).json()) as {
      campaigns: Campaign[];
    };
    expect(actual.campaigns[0].description).toBe('Texto confirmado da primeira aba.');
  } finally {
    if (isolated) await isolated.close();
    else await second.close();
  }
});
