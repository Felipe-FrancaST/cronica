import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { test } from '../helpers/browser-test';
import { fixtureUrl, openFixturePage, fixturePlayer } from '../helpers/fixture-page';
import { PIX_CODE } from '../helpers/pix-fixture';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/__fixture/reset`);
});
async function choosePix(page: Page) {
  await openFixturePage(page);
  await page.goto('/escolher-modo');
  await page.getByRole('button', { name: /Mestre.*Entrar como Mestre/ }).click();
  await expect(page.getByRole('heading', { name: 'Mestre mensal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Pix QR Code/ }).click();
}
async function generate(page: Page) {
  await choosePix(page);
  const button = page.getByRole('button', { name: 'Gerar Pix de R$ 20,00', exact: true });
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await page.getByLabel('CPF do pagador', { exact: true }).fill('52998224725');
  await page.getByLabel(/Confirmo o pagamento único/).check();
  await button.click();
  await expect(page.getByLabel('Pix copia e cola', { exact: true })).toHaveValue(PIX_CODE);
  await expect(page.getByAltText('QR Code do pagamento Pix')).toBeVisible();
}
test('Pix restores its code on reload, copies it and confirms a single paid period without redirecting to recurring checkout', async ({
  page,
  request,
}) => {
  await generate(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar código Pix', exact: true }).click();
  await expect(page.getByText(/Código Pix copiado/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(PIX_CODE);
  await expect(
    page.getByRole('button', { name: 'Entrar na aventura', exact: true }),
  ).not.toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Pix copia e cola', { exact: true })).toHaveValue(PIX_CODE);
  await request.post(`${fixtureUrl}/__fixture/approve-pix`);
  await page.getByRole('button', { name: 'Já paguei, conferir Pix', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar na aventura', exact: true })).toBeVisible();
  await expect(page.getByText('Seu Pix foi confirmado.', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancelar renovação', exact: true }),
  ).not.toBeVisible();
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.ledger).toHaveLength(1);
  expect(state.ledger[0].status).toBe('approved');
  expect(state.ledger[0].payment_method).toBe('pix');
  expect(
    state.calls.filter(
      (c: { provider?: string; method?: string }) =>
        c.provider === '/v1/payments' && c.method === 'POST',
    ),
  ).toHaveLength(1);
  expect(state.subscriptions).toHaveLength(0);
  await page.screenshot({
    path: test.info().outputPath('pix-approved-desktop.png'),
    fullPage: true,
  });
});
test('Pix fits a narrow screen and a pending code can be cancelled before another payment is created', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await generate(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('pix-pending-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cancelar Pix', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Cancelar este Pix?' });
  await dialog.getByRole('button', { name: 'Cancelar Pix', exact: true }).click();
  await expect(page.getByLabel('Pix copia e cola', { exact: true })).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Gerar Pix de R$ 20,00', exact: true }),
  ).toBeVisible();
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.payments[0].status).toBe('cancelled');
  expect(
    state.calls.filter(
      (c: { provider?: string; method?: string }) =>
        c.provider?.startsWith('/v1/payments/') && c.method === 'PUT',
    ),
  ).toHaveLength(1);
});
test('Pix rejects invalid CPF, foreign origins and client-supplied prices before creating a charge', async ({
  page,
  request,
}) => {
  await choosePix(page);
  await page.getByLabel('CPF do pagador', { exact: true }).fill('11111111111');
  await page.getByLabel(/Confirmo o pagamento único/).check();
  await page.getByRole('button', { name: 'Gerar Pix de R$ 20,00', exact: true }).click();
  await expect(page.getByText('Informe um CPF válido para o Pix.')).toBeVisible();
  const input = {
    planId: 'b1000000-0000-4000-8000-000000000001',
    scope: 'master',
    requestId: randomUUID(),
    planVersion: 1,
    payerEmail: 'payer@test.local',
    cpf: '52998224725',
    consent: true,
  };
  const badOrigin = await page.request.post('/api/billing/pix', {
    headers: { origin: 'https://other.test' },
    data: input,
  });
  expect(badOrigin.status()).toBe(403);
  const forged = await page.evaluate(async (input) => {
    const r = await fetch('/api/billing/pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, amount_cents: 1 }),
    });
    return r.status;
  }, input);
  expect(forged).toBe(400);
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.payments).toHaveLength(0);
});
test('Pix webhook approval uses the canonical payment and another player cannot retrieve the code', async ({
  page,
  request,
}) => {
  await generate(page);
  const approved = await (await request.post(`${fixtureUrl}/__fixture/approve-pix`)).json();
  const ts = String(Math.floor(Date.now() / 1000)),
    requestId = randomUUID();
  const signature = createHmac('sha256', 'local-billing-signature-secret')
    .update(`id:${approved.paymentId};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  const hook = await request.post(
    `http://localhost:3100/api/billing/webhook?data.id=${approved.paymentId}`,
    {
      headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` },
      data: { type: 'payment', data: { id: approved.paymentId } },
    },
  );
  expect(hook.ok()).toBe(true);
  await expect
    .poll(async () => {
      const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
      return state.ledger[0]?.status;
    })
    .toBe('approved');
  await page.getByRole('button', { name: 'Conferir pagamento', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar na aventura', exact: true })).toBeVisible();
  await openFixturePage(page, fixturePlayer);
  const response = await page.evaluate(async (contractId) => {
    const r = await fetch('/api/billing/pix/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId, force: true }),
    });
    return { status: r.status, body: await r.json() };
  }, approved.contractId);
  expect(response.status).toBe(404);
  expect(JSON.stringify(response.body)).not.toContain(PIX_CODE);
});
test('deleting an account closes its pending Pix before deleting identity', async ({
  page,
  request,
}) => {
  await generate(page);
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Excluir minha conta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Excluir sua conta?' });
  await dialog.getByLabel('Senha atual', { exact: true }).fill('SenhaForte123!');
  await dialog
    .getByLabel('Digite EXCLUIR MINHA CONTA', { exact: true })
    .fill('EXCLUIR MINHA CONTA');
  await dialog.getByLabel(/Entendo que meus dados/).check();
  await dialog.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar\?conta=excluida/);
  const state = await (await request.get(`${fixtureUrl}/__fixture/state`)).json();
  expect(state.accounts.some((a: { id: string }) => a.id === DEMO_USER_ID)).toBe(false);
  expect(state.payments[0].status).toBe('cancelled');
});
