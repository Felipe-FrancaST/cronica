import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test } from '../helpers/browser-test';
import { openFixturePage, fixturePlayer, fixtureUrl } from '../helpers/fixture-page';
import { EMPTY_EFFECT } from '../../src/features/vtt/effects';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import type { BattleActionRequest, BattleDecision } from '../../src/features/vtt/types';
test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});

test('sheet footer moves to adjacent tabs, returns to the top and keeps keyboard focus on mobile', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).click();
  await page.getByLabel('Nome do personagem').fill('Mira das Estrelas');
  await page.getByLabel('Classe', { exact: true }).selectOption('wizard');
  const dialog = page.getByRole('dialog');
  await dialog.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await page.getByRole('button', { name: 'Próxima: Criação assistida', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Criação assistida', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect.poll(() => dialog.evaluate((node) => node.scrollTop)).toBeLessThan(5);
  await expect(page.getByRole('tab', { name: 'Criação assistida', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Próxima: Classes e habilidades', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Classes e habilidades', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Criação assistida', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Criação assistida', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'Atributos e perícias', exact: true }).click();
  await expect(page.getByLabel('Arcanismo (INT)', { exact: false })).toBeDisabled();
  await expect(page.getByLabel('Especialista', { exact: true })).toHaveCount(0);
  await expect(dialog).toContainText('Proficiência soma o bônus uma vez');
  const overflow = await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 2);
  expect(overflow).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath('ficha-navegacao-mobile.png'),
    fullPage: true,
  });
});

function prompt(
  state: any,
  kind: BattleDecision['kind'],
  overrides: Partial<BattleDecision> = {},
): BattleDecision {
  return {
    id: randomUUID(),
    campaign_id: state.map.campaign_id,
    session_id: state.session.id,
    request_id: randomUUID(),
    token_id: state.tokens[0].id,
    kind,
    sequence: 0,
    label: kind === 'concentration' ? 'Manter concentração' : 'Bola de Fogo · salvaguarda',
    ability: kind === 'concentration' ? 'con' : 'dex',
    dc: 15,
    modifier: 3,
    mode: 'normal',
    status: 'pending',
    options: { half_on_save: true },
    result: {},
    answered_by: null,
    client_id: null,
    created_at: new Date().toISOString(),
    answered_at: null,
    ...overrides,
  };
}

test('saving throw opens for its player even on another turn and without selecting their token', async ({
  page,
  request,
}, testInfo) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const d = prompt(state, 'save');
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: {
      status: 'active',
      active: state.tokens.find((token: any) => token.npc_id)?.id,
      decisions: [d],
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page, fixturePlayer);
  const dialog = page.getByRole('dialog', {
    name: 'Você precisa fazer uma salvaguarda',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Destreza · CD 15');
  await expect(dialog).toContainText('metade do dano');
  await expect(page.locator('.battle-turn-banner')).toContainText('Vez de');
  await expect(page.locator('.battle-turn-banner')).not.toContainText('Sua vez');
  await page.screenshot({ path: testInfo.outputPath('salvaguarda-mobile.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  const result = page.getByRole('dialog', { name: 'Resultado da rolagem', exact: true });
  await expect(result).toContainText('Falha na salvaguarda');
  await result.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(after.calls.filter((call: any) => call.rpc === 'answer_battle_decision')).toHaveLength(1);
  expect(after.decisions[0].answered_by).toBe(fixturePlayer);
  expect(after.calls.find((call: any) => call.rpc === 'answer_battle_decision').p_answer).toEqual(
    {},
  );
});

test('automatic combat lets the player complete attack then damage with participant prompts', async ({
  page,
  request,
}, testInfo) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json(),
    actor = state.tokens[0],
    enemy = state.tokens.find((token: any) => token.npc_id);
  const q: BattleActionRequest = {
    id: randomUUID(),
    campaign_id: state.map.campaign_id,
    session_id: state.session.id,
    map_id: state.map.id,
    token_id: actor.id,
    requested_by: fixturePlayer,
    client_id: randomUUID(),
    kind: 'weapon',
    source_id: randomUUID(),
    name: 'Adaga',
    cost: 'action',
    resource_kind: 'none',
    resource_level: 0,
    spell_level: 0,
    target: { x: enemy.x, y: enemy.y },
    target_ids: [enemy.id],
    definition: {
      ...EMPTY_EFFECT,
      kind: 'damage',
      dice: '1d4+3',
      damageType: 'perfurante',
      attackBonus: 6,
      review: false,
    },
    round: 1,
    turn_index: 0,
    turn_started_at: state.session.turn_started_at,
    status: 'pending',
    resolution: {},
    resolved_at: null,
    created_at: new Date().toISOString(),
  };
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { status: 'active', active: actor.id, battleActions: [q] },
  });
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: {
      battleActions: [{ ...q, resolution: { guided: true } }],
      decisions: [
        prompt(state, 'attack', {
          request_id: q.id,
          token_id: actor.id,
          ability: null,
          dc: null,
          modifier: 6,
          label: 'Adaga',
          options: { dice: '1d4+3', target_id: enemy.id },
        }),
      ],
    },
  });
  await openFixturePage(page, fixturePlayer);
  const attack = page.getByRole('dialog', { name: 'Faça seu ataque', exact: true });
  await expect(attack).toBeVisible();
  await expect(attack).toContainText('1d20+6');
  await attack.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Resultado da rolagem', exact: true }),
  ).toContainText('Ataque acertou!');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const damage = page.getByRole('dialog', { name: 'Role e aplique o efeito', exact: true });
  await expect(damage).toBeVisible();
  await expect(damage).toContainText('1d4+3');
  await damage.getByRole('button', { name: 'Rolar e aplicar efeito', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Resultado da rolagem', exact: true }),
  ).toContainText('Efeito aplicado');
  await page.screenshot({
    path: testInfo.outputPath('ataque-guiado-resultado.png'),
    fullPage: true,
  });
  const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(after.calls.filter((call: any) => call.rpc === 'answer_battle_decision')).toHaveLength(2);
  expect(after.actions[0].status).toBe('success');
});

test('concentration choice can be postponed and reopened without another roll or leaking other players prompts', async ({
  page,
  request,
}) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const d = prompt(state, 'choice', {
    label: 'Trocar a concentração?',
    ability: null,
    dc: null,
    modifier: 0,
    options: {
      choices: [
        { id: 'continue', label: 'Conjurar e encerrar a concentração anterior' },
        { id: 'cancel', label: 'Cancelar e manter a concentração atual' },
      ],
    },
  });
  const hidden = prompt(state, 'concentration', {
    token_id: state.tokens.find((t: any) => t.npc_id).id,
  });
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { status: 'active', decisions: [d, hidden] },
  });
  await openFixturePage(page, fixturePlayer);
  const choice = page.getByRole('dialog', { name: 'Uma escolha para você', exact: true });
  await expect(choice).toBeVisible();
  await choice.getByRole('button', { name: 'Ver depois', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.battle-decision-notice')).toContainText('Há uma decisão');
  await page.getByRole('button', { name: 'Abrir pendência', exact: true }).click();
  await choice
    .getByRole('button', { name: 'Cancelar e manter a concentração atual', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Resultado da rolagem', exact: true }),
  ).toContainText('Conjuração cancelada');
  const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(after.rolls).toHaveLength(0);
  expect(after.decisions.find((entry: any) => entry.id === hidden.id).status).toBe('pending');
});

test('master sets an NPC saving throw bonus before rolling and the prompt uses the saved value', async ({
  page,
  request,
}) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const npc = state.tokens.find((token: any) => token.npc_id);
  const d = prompt(state, 'save', { token_id: npc.id, modifier: 0 });
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: {
      status: 'active',
      decisions: [d],
      battleActions: [
        {
          id: d.request_id,
          campaign_id: state.map.campaign_id,
          session_id: state.session.id,
          map_id: state.map.id,
          token_id: state.tokens[0].id,
          requested_by: DEMO_USER_ID,
          client_id: randomUUID(),
          kind: 'spell',
          source_id: null,
          name: 'Bola de Fogo',
          cost: 'action',
          resource_kind: 'slot',
          resource_level: 3,
          spell_level: 3,
          target: { x: npc.x, y: npc.y },
          target_ids: [npc.id],
          definition: { ...EMPTY_EFFECT, kind: 'damage', dice: '8d6', save: 'dex' },
          round: state.session.round,
          turn_index: state.session.turn_index,
          turn_started_at: state.session.turn_started_at,
          status: 'success',
          resolution: { guided: true },
          resolved_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    },
  });
  await openFixturePage(page, DEMO_USER_ID);
  await page
    .getByRole('dialog', { name: 'Você precisa fazer uma salvaguarda', exact: true })
    .getByRole('button', { name: 'Ver depois', exact: true })
    .click();
  await page.getByRole('tab', { name: /^Combate/ }).click();
  await page.getByLabel('Bônus total do NPC', { exact: true }).fill('7');
  await page.locator('.battle-pending-decisions > strong').click();
  await expect
    .poll(async () => {
      const data = await (await request.get(fixtureUrl + '/__fixture/state')).json();
      return data.decisions[0].modifier;
    })
    .toBe(7);
  await page.getByRole('button', { name: 'Realizar teste do NPC', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Você precisa fazer uma salvaguarda',
    exact: true,
  });
  await expect(dialog).toContainText('1d20+7');
  await dialog.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Resultado da rolagem', exact: true }),
  ).toContainText('Salvaguarda bem-sucedida');
});
