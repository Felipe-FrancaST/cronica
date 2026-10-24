import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { fixtureUrl, fixturePlayer, openFixturePage } from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { randomUUID } from 'node:crypto';
import { EMPTY_EFFECT } from '../../src/features/vtt/effects';
test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});
function scenario(state: any, physical: boolean) {
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
    created_at: new Date().toISOString(),
    resolved_at: null,
  };
  const d = {
    id: randomUUID(),
    campaign_id: q.campaign_id,
    session_id: q.session_id,
    request_id: q.id,
    token_id: q.token_id,
    kind: 'attack',
    sequence: 0,
    label: 'Adaga',
    ability: null,
    dc: null,
    modifier: 6,
    mode: 'normal',
    status: 'pending',
    options: {
      dice_mode: physical ? 'physical' : 'program',
      animate: true,
      roll_plan: [{ expression: '1d20+6', mode: 'normal', label: 'Ataque' }],
      target_id: q.target_ids[0],
    },
    result: {},
    answered_by: null,
    client_id: null,
    created_at: new Date().toISOString(),
    answered_at: null,
  };
  return { status: 'active', active: q.token_id, battleActions: [q], decisions: [d] };
}
test('physical dice open a face field on mobile, validate it and record an identified result', async ({
  page,
  request,
}) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  await request.post(fixtureUrl + '/__fixture/scenario', { data: scenario(state, true) });
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page, fixturePlayer);
  const dialog = page.getByRole('dialog', { name: 'Faça seu ataque' });
  await expect(dialog.getByText('Dados físicos', { exact: true })).toBeVisible();
  await dialog.getByLabel('Faces da rolagem 1').fill('26');
  await dialog.getByRole('button', { name: 'Registrar dados e aplicar' }).click();
  await expect(dialog).toContainText('inteiro de 1 a 20');
  await dialog.getByLabel('Faces da rolagem 1').fill('17');
  await dialog.getByRole('button', { name: 'Registrar dados e aplicar' }).click();
  const result = page.getByRole('dialog', { name: 'Resultado da rolagem' });
  await expect(result).toContainText('Dados físicos · faces informadas');
  await expect(result).toContainText('23');
  const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const call = after.calls.find((c: any) => c.rpc === 'answer_battle_decision');
  expect(call.p_answer.rolls).toEqual([[17]]);
});
test('virtual hit and damage results use the existing animation without blocking Continue', async ({
  page,
  request,
}) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  await request.post(fixtureUrl + '/__fixture/scenario', { data: scenario(state, false) });
  await openFixturePage(page, fixturePlayer);
  await page.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  const result = page.getByRole('dialog', { name: 'Resultado da rolagem' });
  await expect(result.getByLabel('Animação dos dados: 1d20+6')).toBeVisible();
  await expect(result.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible();
  await result.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Rolar e aplicar efeito', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Resultado da rolagem' })
      .getByLabel('Animação dos dados: 1d4+3'),
  ).toBeVisible();
});
test('only the GM can configure physical dice, NPC overrides and presentation rules', async ({
  page,
  request,
}) => {
  await openFixturePage(page, DEMO_USER_ID, 'regras');
  await expect(page.getByRole('heading', { name: 'Regras da campanha' })).toBeVisible();
  await page.getByLabel('Dados dos jogadores no combate', { exact: true }).selectOption('physical');
  await page.getByLabel('Dados dos NPCs', { exact: true }).selectOption('program');
  await page.getByLabel('Efeitos visuais leves no grid', { exact: true }).uncheck();
  await page.getByLabel('Mostrar a CD no aviso de salvaguarda', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Salvar regras', exact: true }).click();
  await expect(page.getByText('Regras da campanha atualizadas.', { exact: true })).toBeVisible();
  const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(after.rules[0].combat_dice_mode).toBe('physical');
  expect(after.rules[0].npc_dice_mode).toBe('program');
  expect(after.rules[0].combat_effects).toBe(false);
  await openFixturePage(page, fixturePlayer, 'regras');
  await expect(
    page.getByRole('heading', { name: 'Regras reservadas ao mestre', exact: true }),
  ).toBeVisible();
});
