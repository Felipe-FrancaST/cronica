import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { fixtureUrl, openFixturePage, fixturePlayer } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { createHmac } from 'node:crypto';
const admin = '10000000-0000-4000-8000-000000000003';
test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
});
async function billingPage(page: Parameters<typeof openFixturePage>[0], id = DEMO_USER_ID) {
  await openFixturePage(page, id);
  await page.goto('/escolher-modo');
  await expect(page.getByRole('heading', { name: 'Como deseja entrar?' })).toBeVisible();
}
async function createContract(page: Parameters<typeof openFixturePage>[0]) {
  await billingPage(page);
  await page.getByRole('button', { name: /Mestre.*Entrar como Mestre/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Sua próxima aventura começa aqui' }),
  ).toBeVisible();
  const button = page.getByRole('button', { name: 'Assinar por R$ 20,00', exact: true });
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await page.getByLabel(/Autorizo uma assinatura recorrente/).check();
  // Keep the test on the site while still exercising the real checkout route and PostgreSQL.
  await page.route('https://www.mercadopago.com.br/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Checkout local de testes</h1>' }),
  );
  await button.click();
  await expect(page.getByRole('heading', { name: 'Checkout local de testes' })).toBeVisible();
  await page.goto('/assinatura?modo=master');
  await expect(page.getByRole('heading', { name: 'Mestre mensal' })).toBeVisible();
}
test('master is offered twenty reais monthly, player enters free, local mode changes do not bypass the gate', async ({
  page,
}) => {
  await billingPage(page);
  await expect(page.getByText('R$ 20,00 / mês · assinatura recorrente')).toBeVisible();
  await page.getByRole('button', { name: /Jogador.*Entrar como Jogador/ }).click();
  await expect(page).toHaveURL(/localhost:3100\/$/);
  await page.evaluate((id) => localStorage.setItem(`cronica:mode:${id}`, 'master'), DEMO_USER_ID);
  await page.reload();
  await expect(page).toHaveURL(/\/assinatura\?modo=master/);
  await expect(
    page.getByRole('button', { name: 'Assinar por R$ 20,00', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('billing-desktop.png'), fullPage: true });
  const picker = page.locator('.billing-mode-picker');
  await picker.getByRole('button', { name: 'Jogador', exact: true }).click();
  await expect(page.getByText('Este acesso está gratuito.', { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Mestre', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Assinar por R$ 20,00', exact: true }),
  ).toBeVisible();
});
test('checkout is idempotent; authorization alone does not unlock; payment, cancellation and refund reconcile', async ({
  page,
  request,
}) => {
  await createContract(page);
  let state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(
    state.calls.filter(
      (c: { provider: string; method: string }) =>
        c.provider === '/preapproval' && c.method === 'POST',
    ),
  ).toHaveLength(1);
  await request.post(`${fixtureUrl}/__fixture/authorize`);
  await page.getByRole('button', { name: 'Conferir pagamento', exact: true }).click();
  await expect(page.getByText('Renovação autorizada', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar na aventura', exact: true })).toHaveCount(
    0,
  );
  await request.post(`${fixtureUrl}/__fixture/approve`);
  // Admin reconciliation bypasses the user's deliberate 15s refresh cooldown via a signed webhook.
  state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  const paymentId = String(state.payments[0].id),
    ts = String(Date.now()),
    requestId = 'billing-browser-payment';
  const signature = createHmac('sha256', 'local-billing-signature-secret')
    .update(`id:${paymentId};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  const notified = await request.post(`/api/billing/webhook?data.id=${paymentId}`, {
    headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` },
    data: { type: 'payment', data: { id: paymentId } },
  });
  expect(notified.status()).toBe(200);
  await expect
    .poll(async () => {
      const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
      return state.ledger[0]?.status;
    })
    .toBe('approved');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar na aventura', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar renovação', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancelar renovação', exact: true })
    .click();
  await expect(
    page.getByText(
      'Renovação cancelada. O período já pago continua disponível até a data indicada.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar na aventura', exact: true })).toBeVisible();
  await request.post(`${fixtureUrl}/__fixture/refund`);
  const cron = await request.get('/api/billing/cron', {
    headers: { authorization: 'Bearer billing-local-cron-secret-at-least-32-characters' },
  });
  expect(cron.status()).toBe(200);
  // A direct signed payment update handles a refund even after the contract was cancelled.
  const refundId = 'billing-browser-refund',
    refundTs = String(Date.now()),
    refundSignature = createHmac('sha256', 'local-billing-signature-secret')
      .update(`id:${paymentId};request-id:${refundId};ts:${refundTs};`)
      .digest('hex');
  await request.post(`/api/billing/webhook?data.id=${paymentId}`, {
    headers: { 'x-request-id': refundId, 'x-signature': `ts=${refundTs},v1=${refundSignature}` },
    data: { type: 'payment', data: { id: paymentId } },
  });
  await expect
    .poll(async () => {
      const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
      return state.ledger[0]?.status;
    })
    .toBe('refunded');
  await page.reload();
  await expect(page.getByText('Reembolsado', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar na aventura', exact: true })).toHaveCount(
    0,
  );
  await openFixturePage(page, admin);
  await page.goto('/administracao');
  await page.getByRole('tab', { name: 'Financeiro', exact: true }).click();
  await expect(
    page
      .locator('.admin-metric')
      .filter({ hasText: 'Pagamentos aprovados · bruto' })
      .getByText('R$ 20,00', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('.admin-metric')
      .filter({ hasText: 'Reembolsos e contestações' })
      .getByText('R$ 20,00', { exact: true }),
  ).toBeVisible();
  const exportUrl = await page
    .getByRole('link', { name: 'Exportar CSV', exact: true })
    .getAttribute('href');
  const csv = await page.request.get(exportUrl!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(await csv.text()).toContain('"refunded";"2000";"2000";"99";"1901"');
});
test('administrator can create plans, change charging rules and grant courtesy without access to adventures', async ({
  page,
  request,
}) => {
  await openFixturePage(page, admin);
  await page.goto('/escolher-modo');
  await expect(page.getByRole('heading', { name: 'Administração do site' })).toBeVisible();
  await page.getByRole('button', { name: /Abrir administração/ }).click();
  await expect(page.getByRole('tab', { name: 'Visão geral', exact: true })).toBeVisible();
  await expect(page.getByText('Contas cadastradas', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('admin-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Planos', exact: true }).click();
  await page.getByRole('button', { name: 'Criar plano', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do plano').fill('Mestre anual');
  await dialog.getByLabel('Valor por cobrança (R$)').fill('200,00');
  await dialog.getByLabel('Renovação', { exact: true }).selectOption('12');
  await dialog.getByLabel('Limite de campanhas ativas').fill('10');
  await dialog.getByLabel('Motivo da alteração').fill('Novo plano anual');
  await dialog.getByRole('button', { name: 'Salvar plano', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Mestre anual' })).toBeVisible();
  await page.getByRole('tab', { name: 'Assinantes e contas', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'arthur@cronica.demo' });
  await row.getByRole('button', { name: 'Gerenciar', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Conceder cortesia', exact: true })
    .click();
  const grant = page.getByRole('dialog', { name: 'Conceder acesso de cortesia' });
  await grant.getByLabel('Duração em dias').fill('7');
  await grant.getByLabel('Motivo da alteração').fill('Acesso de teste do lançamento');
  await grant.getByRole('button', { name: 'Confirmar operação' }).click();
  await expect(grant).toBeHidden();
  await expect(page.getByText(/Mestre: Cortesia até/)).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Gerenciar conta' })
    .getByRole('button', { name: 'Fechar', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Configurações', exact: true }).click();
  await page.getByLabel('Jogadores precisam de assinatura').check();
  await page.getByLabel('Motivo da alteração').fill('Ativar planos para jogadores');
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
  await expect(page.getByText('Configurações salvas.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(page.getByText('Novo plano anual', { exact: true })).toBeVisible();
  await expect(page.getByText('Acesso de teste do lançamento', { exact: true })).toBeVisible();
  const other = await page.context().newPage();
  await openFixturePage(other, fixturePlayer);
  await other.goto('/assinatura?modo=player');
  await expect(
    other.getByRole('button', { name: 'Assinar por R$ 20,00', exact: true }),
  ).toBeVisible();
  await other.close();
  expect((await request.get('/api/admin/billing')).status()).toBe(401);
});
test('server rejects other-account actions, forged administration, CSRF, unsigned notifications and public cron', async ({
  page,
  request,
}) => {
  await billingPage(page);
  const calls = await page.evaluate(async () => {
    const post = async (path: string, body: unknown) => {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response.status;
    };
    return {
      admin: await post('/api/admin/billing/mutate', {
        action: 'block',
        data: { user_id: '10000000-0000-4000-8000-000000000003', blocked: true },
        reason: 'forged',
      }),
      cancel: await post('/api/billing/cancel', {
        contractId: '00000000-0000-4000-8000-000000000001',
      }),
      spoof: await post('/api/billing/checkout', {
        planId: 'b1000000-0000-4000-8000-000000000001',
        scope: 'master',
        requestId: crypto.randomUUID(),
        planVersion: 1,
        payerEmail: 'arthur@cronica.demo',
        consent: true,
        amount_cents: 1,
      }),
    };
  });
  expect(calls.admin).toBe(403);
  expect(calls.cancel).toBe(404);
  expect(calls.spoof).toBe(400);
  expect(
    (
      await request.post('/api/billing/checkout', {
        data: {},
        headers: { origin: 'https://evil.test' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/billing/webhook?data.id=123', {
        data: { type: 'payment', data: { id: 123 } },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get('/api/billing/cron')).status()).toBe(401);
});
test('subscription and administration remain usable on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await billingPage(page);
  await page.getByRole('button', { name: /Mestre.*Entrar como Mestre/ }).click();
  await expect(
    page.getByRole('button', { name: 'Assinar por R$ 20,00', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('billing-mobile.png'), fullPage: true });
  await openFixturePage(page, admin);
  await page.goto('/administracao');
  await expect(page.getByRole('tab', { name: 'Visão geral', exact: true })).toBeVisible();
  await expect(page.getByText('Contas cadastradas', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('admin-mobile.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Financeiro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recebimentos' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
