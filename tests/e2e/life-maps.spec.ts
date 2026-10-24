import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import {
  openFixturePage,
  fixturePlayer,
  fixtureUrl,
  fixtureCampaign,
} from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { randomUUID } from 'node:crypto';
import { EMPTY_EFFECT } from '../../src/features/vtt/effects';
import { generateAtlas } from '../../src/features/atlas/generator';
import { mapRecord } from '../../src/features/atlas/model';
test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});
function scenario(s: any) {
  const q = {
    id: randomUUID(),
    campaign_id: s.map.campaign_id,
    session_id: s.session.id,
    map_id: s.map.id,
    token_id: s.tokens[0].id,
    requested_by: fixturePlayer,
    client_id: randomUUID(),
    kind: 'feature',
    name: 'Salvaguarda contra a morte',
    cost: 'free',
    resource_kind: 'none',
    resource_level: 0,
    spell_level: 0,
    target: { x: 2, y: 2 },
    target_ids: [s.tokens[0].id],
    definition: { ...EMPTY_EFFECT, death_save: true },
    round: 1,
    turn_index: 0,
    turn_started_at: s.session.turn_started_at,
    status: 'success',
    resolution: {},
    created_at: new Date().toISOString(),
    resolved_at: null,
  };
  const d = {
    id: randomUUID(),
    campaign_id: q.campaign_id,
    session_id: q.session_id,
    request_id: q.id,
    token_id: q.token_id,
    kind: 'death',
    sequence: 0,
    label: q.name,
    ability: null,
    dc: 10,
    modifier: 0,
    mode: 'normal',
    status: 'pending',
    options: {
      dice_mode: 'physical',
      animate: true,
      roll_plan: [{ expression: '1d20', mode: 'normal', label: q.name }],
    },
    result: {},
    answered_by: null,
    client_id: null,
    created_at: new Date().toISOString(),
    answered_at: null,
  };
  return {
    status: 'active',
    active: q.token_id,
    actorSheet: {
      hp_current: 0,
      death_successes: 2,
      death_failures: 0,
      conditions: ['Caído', 'Inconsciente'],
    },
    battleActions: [q],
    decisions: [d],
  };
}
test('mobile death save validates physical faces, stabilizes, and never opens for the GM', async ({
  page,
  request,
}) => {
  const s = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  await request.post(fixtureUrl + '/__fixture/scenario', { data: scenario(s) });
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page, fixturePlayer);
  const dialog = page.getByRole('dialog', { name: 'Salvaguarda contra a morte', exact: true });
  await expect(dialog).toContainText('sem atributo ou proficiência');
  await dialog.getByLabel('Faces da rolagem 1').fill('21');
  await dialog.getByRole('button', { name: 'Registrar dados e aplicar' }).click();
  await expect(dialog).toContainText('inteiro de 1 a 20');
  await dialog.getByLabel('Faces da rolagem 1').fill('10');
  await dialog.getByRole('button', { name: 'Registrar dados e aplicar' }).click();
  await expect(page.getByRole('dialog', { name: 'Resultado da rolagem' })).toContainText(
    'Você está estável',
  );
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByLabel('Estado de vida', { exact: true })).toContainText('Estável');
  await openFixturePage(page, DEMO_USER_ID);
  await expect(
    page.getByRole('dialog', { name: 'Salvaguarda contra a morte', exact: true }),
  ).toHaveCount(0);
});
test('natural twenty updates life immediately and allows standing', async ({ page, request }) => {
  const s = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  await request.post(fixtureUrl + '/__fixture/scenario', { data: scenario(s) });
  await openFixturePage(page, fixturePlayer);
  await page.getByLabel('Faces da rolagem 1').fill('20');
  await page.getByRole('button', { name: 'Registrar dados e aplicar' }).click();
  await expect(page.getByRole('dialog', { name: 'Resultado da rolagem' })).toContainText(
    'Você recuperou 1 PV!',
  );
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Levantar · metade do deslocamento', exact: true })
    .click();
  await expect(page.getByLabel('Estado de vida', { exact: true })).toHaveCount(0);
});
test('expanded map palette supports token search, furnishings and saved rotation', async ({
  page,
  request,
}) => {
  const map = {
    ...mapRecord(fixtureCampaign, generateAtlas('blank', 960, 640, 'test', 'Biblioteca expandida')),
    revision: 1,
  };
  await request.post(fixtureUrl + '/__fixture/scenario', { data: { atlasMaps: [map] } });
  await openFixturePage(page, DEMO_USER_ID, `mapas/${map.id}`);
  const editor = page.getByLabel('Editor de mapa interativo', { exact: true });
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: 'Tokens', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tipos de token' }).getByRole('button')).toHaveCount(
    24,
  );
  await page.getByLabel('Buscar token').fill('bruxo');
  await page.getByRole('button', { name: 'Bruxo', exact: true }).click();
  await page.getByLabel('Rotação das novas peças', { exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const b = (await editor.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.getByRole('button', { name: 'Símbolos', exact: true }).click();
  await page.getByLabel('Buscar símbolo').fill('');
  await page.getByLabel('Categoria de símbolos').selectOption('interior');
  await page.getByRole('button', { name: 'Estante de livros', exact: true }).click();
  await page.mouse.click(b.x + b.width / 2 + 100, b.y + b.height / 2);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.atlas-save-state')).toHaveText('Salvo');
  const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const objects = after.atlasMaps[0].document.objects;
  expect(objects.find((o: any) => o.kind === 'token')).toMatchObject({
    icon: 'warlock',
    rotation: 45,
    name: 'Bruxo',
  });
  expect(objects.find((o: any) => o.kind === 'symbol').symbol).toBe('bookshelf');
});
test('weapon slash waits for the result dialog to close and never blocks the next action', async ({
  page,
  request,
}) => {
  const s = await (await request.get(fixtureUrl + '/__fixture/state')).json(),
    data = scenario(s),
    enemy = s.tokens.find((t: any) => t.npc_id);
  Object.assign(data, {
    actorSheet: { hp_current: 20, conditions: [], death_successes: 0, death_failures: 0 },
  });
  Object.assign(data.battleActions[0], {
    kind: 'weapon',
    status: 'pending',
    name: 'Adaga',
    target: { x: enemy.x, y: enemy.y },
    target_ids: [enemy.id],
    definition: { ...EMPTY_EFFECT, kind: 'damage', dice: '1d4+3', range: 1.5 },
  });
  Object.assign(data.decisions[0], {
    kind: 'attack',
    label: 'Adaga',
    modifier: 6,
    options: {
      dice_mode: 'program',
      animate: true,
      target_id: enemy.id,
      roll_plan: [{ expression: '1d20+6', mode: 'normal', label: 'Ataque' }],
    },
  });
  await request.post(fixtureUrl + '/__fixture/scenario', { data });
  await openFixturePage(page, fixturePlayer);
  await page.getByRole('button', { name: 'Rolar dados', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Rolar e aplicar efeito', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  await expect(page.locator('[data-effect-kind="slash"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.locator('[data-effect-kind="slash"]')).toBeVisible();
  await expect(page.locator('[data-effect-kind="slash"]')).toHaveCount(0, { timeout: 3000 });
});
