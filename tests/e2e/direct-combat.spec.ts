import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { openFixturePage, fixturePlayer, fixtureUrl } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { EMPTY_EFFECT } from '../../src/features/vtt/effects';
import { randomUUID } from 'node:crypto';
test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});
test('only the active player sees their own action dock and a centered weapon picker', async ({
  page,
  request,
}) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { status: 'active', active: state.tokens[0].id },
  });
  await openFixturePage(page, fixturePlayer);
  await expect(page.locator('.vtt-action-panel')).toHaveCount(1);
  await expect(page.locator('.vtt-turn-list')).toBeHidden();
  await expect(page.locator('#vtt-tools')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir ficha', exact: true })).toBeVisible();
  await expect(page.locator('.vtt-actor-vitals')).toContainText('CA');
  await page.getByRole('button', { name: 'Atacar com arma', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Escolher arma' });
  await expect(picker).toBeVisible();
  const rect = await picker.boundingBox();
  expect(rect!.x).toBeGreaterThan(150);
  await picker.locator('.vtt-source-list > button').first().click();
  await expect(
    picker.getByRole('button', { name: 'Atacar · escolher alvo no grid' }),
  ).toBeVisible();
  await picker.getByRole('button', { name: 'Atacar · escolher alvo no grid' }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar alvo e executar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar ao mestre' })).toHaveCount(0);
});
test('ending a turn removes every combat button and keeps the own sheet available', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { status: 'active', active: state.tokens[0].id },
  });
  await openFixturePage(page, fixturePlayer);
  await page.getByRole('button', { name: 'Fim do turno', exact: true }).click();
  await expect(page.locator('.vtt-action-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Atacar com arma', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Minha ficha', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
test('a player rolls while full battle reloads are delayed; GM cannot receive that prompt', async ({
  page,
  request,
}) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const q = {
    id: randomUUID(),
    campaign_id: state.map.campaign_id,
    session_id: state.session.id,
    map_id: state.map.id,
    token_id: state.tokens[0].id,
    requested_by: fixturePlayer,
    client_id: randomUUID(),
    kind: 'weapon',
    source_id: null,
    name: 'Adaga',
    cost: 'action',
    resource_kind: 'none',
    resource_level: 0,
    spell_level: 0,
    target: { x: 3, y: 2 },
    target_ids: [state.tokens.find((t: any) => t.npc_id).id],
    definition: { ...EMPTY_EFFECT, kind: 'damage', dice: '1d4+3' },
    round: 1,
    turn_index: 0,
    turn_started_at: state.session.turn_started_at,
    status: 'pending',
    resolution: { guided: true },
    resolved_at: null,
    created_at: new Date().toISOString(),
  };
  const d = {
    id: randomUUID(),
    campaign_id: state.map.campaign_id,
    session_id: state.session.id,
    request_id: q.id,
    token_id: q.token_id,
    kind: 'attack',
    sequence: 0,
    label: 'Adaga',
    ability: null,
    dc: null,
    modifier: 5,
    mode: 'normal',
    status: 'pending',
    options: { dice: '1d4+3', target_id: q.target_ids[0] },
    result: {},
    answered_by: null,
    client_id: null,
    created_at: new Date().toISOString(),
    answered_at: null,
  };
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { status: 'active', active: q.token_id, battleActions: [q], decisions: [d] },
  });
  await openFixturePage(page, DEMO_USER_ID);
  await expect(page.getByRole('dialog', { name: 'Faça seu ataque' })).toHaveCount(0);
  await expect(page.locator('.vtt-action-panel')).toHaveCount(0);
  await openFixturePage(page, fixturePlayer);
  const dialog = page.getByRole('dialog', { name: 'Faça seu ataque' });
  await expect(dialog).toBeVisible();
  // A roll must not await unrelated terrain/workspace fetches.
  await page.route('**/rest/v1/battle_maps?**', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  const before = Date.now();
  await dialog.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Resultado da rolagem' })).toContainText(
    'Ataque acertou!',
  );
  expect(Date.now() - before).toBeLessThan(2000);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Role e aplique o efeito' })).toBeVisible();
});

test('a general action runs immediately without any master approval RPC', async ({
  page,
  request,
}) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { status: 'active', active: state.tokens[0].id },
  });
  await openFixturePage(page, fixturePlayer);
  await page.getByRole('button', { name: 'Esquivar', exact: true }).click();
  await expect(page.locator('.vtt-turn-budget')).toContainText('usada');
  const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(after.actions[0].status).toBe('success');
  expect(after.actions[0].resolution.guided).toBe(true);
  expect(
    after.calls.some((call: any) =>
      ['guide_battle_action', 'approve_battle_action', 'resolve_battle_action'].includes(call.rpc),
    ),
  ).toBe(false);
  await expect(page.getByRole('button', { name: 'Enviar ao mestre' })).toHaveCount(0);
});
