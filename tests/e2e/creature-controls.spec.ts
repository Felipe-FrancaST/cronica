import { expect } from '@playwright/test';
import { test } from '../helpers/browser-test';
import {
  openFixturePage,
  fixturePlayer,
  fixtureUrl,
  fixtureTopView,
  fixtureCell,
} from '../helpers/fixture-page';
import { DEMO_USER_ID } from '../../src/lib/demo-data';
import { spellEffect } from '../../src/features/vtt/effects';
import { randomUUID } from 'node:crypto';
test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});
test('NPC creation has a character-like header, practical stat block and persistent senses', async ({
  page,
  request,
}, info) => {
  await openFixturePage(page, DEMO_USER_ID, 'npcs');
  await page.getByRole('button', { name: 'Criar NPC', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Criar NPC', exact: true });
  await dialog.getByLabel('Nome do NPC', { exact: true }).fill('Sentinela da noite');
  await expect(
    dialog.getByRole('button', { name: 'Escolher retrato do NPC', exact: true }),
  ).toBeVisible();
  await dialog.getByLabel('Tipo de criatura', { exact: true }).selectOption('Constructo');
  await dialog.getByLabel('Tamanho', { exact: true }).selectOption('Grande');
  const level = dialog.getByLabel('Nível', { exact: true });
  await level.fill('');
  await expect(level).toHaveValue('');
  await level.fill('8');
  await dialog.getByRole('button', { name: 'Próxima: Atributos e combate', exact: true }).click();
  await expect(dialog.getByRole('tab', { name: 'Atributos e combate' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await dialog.getByRole('tab', { name: 'Movimento e sentidos' }).click();
  await dialog.getByLabel('Caminhada (m)', { exact: true }).fill('12');
  await dialog.getByLabel('Percepção às cegas (m)', { exact: true }).fill('9');
  await dialog.getByLabel('Visão verdadeira (m)', { exact: true }).fill('36');
  await dialog.getByLabel('Idiomas', { exact: true }).fill('Comum, Dracônico');
  await dialog.screenshot({ path: info.outputPath('npc-movimento-e-sentidos.png') });
  await dialog.getByRole('button', { name: 'Salvar NPC', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json(),
    saved = state.npcs.find((n: any) => n.name === 'Sentinela da noite');
  expect(saved.stat_block.movement.walk).toBe(12);
  expect(saved.stat_block.senses.trueSight).toBe(36);
});
test('out of turn the player sees HP and AC on mobile and in fullscreen without overlap', async ({
  page,
  request,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: { status: 'active', active: state.tokens.find((t: any) => t.npc_id).id },
  });
  await openFixturePage(page, fixturePlayer);
  const summary = page.getByLabel('Minha vida e defesa', { exact: true });
  await expect(summary).toContainText('PV');
  await expect(summary).toContainText('CA');
  await expect(summary).not.toContainText('—');
  await expect(page.locator('.vtt-action-panel')).toHaveCount(0);
  await expect(summary.getByRole('button', { name: 'Minha ficha', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expandir mesa', exact: true }).click();
  await expect(summary).toBeVisible();
  const vitals = await summary.boundingBox(),
    toolbar = await page.locator('.vtt-scene-toolbar').boundingBox();
  expect(vitals!.y + vitals!.height).toBeLessThanOrEqual(toolbar!.y + 1);
  await page.screenshot({ path: info.outputPath('vida-ca-fora-do-turno-mobile.png') });
});
test('a short creature tap opens GM damage and conditions while a drag remains movement', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json(),
    npc = state.tokens.find((t: any) => t.npc_id);
  await openFixturePage(page, DEMO_USER_ID);
  await fixtureTopView(page);
  await page.waitForTimeout(250);
  let point = await fixtureCell(page, npc.x, npc.y);
  await page.mouse.click(point.x, point.y);
  const dialog = page.getByRole('dialog', { name: npc.name, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Alteração de vida', { exact: true }).selectOption('damage');
  await dialog.getByLabel('Quantidade', { exact: true }).fill('7');
  await dialog.getByRole('button', { name: 'Aplicar dano', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Vida atualizada');
  await dialog.getByRole('tab', { name: 'Condições', exact: true }).click();
  await dialog.getByLabel('Aplicar condição', { exact: true }).selectOption('Paralisado');
  await expect(dialog.getByText(/Falha em salvaguardas de Força e Destreza/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Aplicar condição', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Remover Paralisado', exact: true }),
  ).toBeVisible();
  await dialog.screenshot({ path: info.outputPath('controle-do-mestre-criatura.png') });
  await dialog.getByRole('button', { name: 'Remover Paralisado', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Remover Paralisado', exact: true })).toHaveCount(
    0,
  );
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const target = await fixtureCell(page, npc.x, npc.y + 1);
  point = await fixtureCell(page, npc.x, npc.y);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('the GM reads narrative spells and keeps their areas on the grid', async ({
  page,
  request,
}) => {
  const state = await (await request.get(fixtureUrl + '/__fixture/state')).json(),
    q = {
      id: randomUUID(),
      campaign_id: state.map.campaign_id,
      session_id: state.session.id,
      map_id: state.map.id,
      token_id: state.tokens[0].id,
      requested_by: fixturePlayer,
      client_id: randomUUID(),
      kind: 'spell',
      name: 'Ilusão Menor',
      cost: 'action',
      resource_kind: 'cantrip',
      resource_level: 0,
      spell_level: 0,
      source_id: null,
      target: { x: 5, y: 5 },
      target_ids: [],
      definition: {
        ...spellEffect({ catalog_id: 'ilusao-menor' }),
        entry: { catalog_id: 'ilusao-menor' },
      },
      round: 1,
      turn_index: 0,
      status: 'success',
      resolution: {},
      created_at: new Date().toISOString(),
    };
  await request.post(fixtureUrl + '/__fixture/scenario', { data: { battleActions: [q] } });
  await openFixturePage(page, DEMO_USER_ID);
  await page.getByRole('tab', { name: 'Combate', exact: true }).click();
  await page.getByText('Magias narrativas utilizadas', { exact: true }).click();
  await page.getByRole('button', { name: 'Ler descrição / manter efeito', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ilusão Menor', exact: true });
  await expect(dialog.locator('.spell-description')).toBeVisible();
  await dialog.getByLabel('Formato do marcador', { exact: true }).selectOption('sphere');
  await dialog.getByLabel('Raio (m)', { exact: true }).fill('3');
  await dialog
    .getByRole('button', { name: 'Manter na posição da conjuração', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const after = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(after.spellEffects).toHaveLength(1);
  expect(after.spellEffects[0].definition.scene.persistent).toBe(true);
});
test('personal darkvision renders in 3D and 2D without WebGL errors', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /WebGL|shader|framebuffer/i.test(m.text())) errors.push(m.text());
  });
  await request.post(fixtureUrl + '/__fixture/scenario', {
    data: {
      status: 'preparing',
      actorSheet: { race: 'Anão', race_id: 'anao' },
      vision: { vision_enabled: true, lighting: 'night', darkness_level: 'dark' },
    },
  });
  await openFixturePage(page, fixturePlayer);
  await expect(page.getByLabel('Mapa tático 3D interativo', { exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await page
    .getByLabel('Mapa tático 3D interativo', { exact: true })
    .screenshot({ path: info.outputPath('visao-no-escuro-3d.png') });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByLabel('Mapa tático interativo', { exact: true })).toBeVisible();
  await page
    .getByLabel('Mapa tático interativo', { exact: true })
    .screenshot({ path: info.outputPath('visao-no-escuro-2d.png') });
  const detail = await page
    .getByLabel('Mapa tático interativo', { exact: true })
    .evaluate((node) => {
      const canvas = node as HTMLCanvasElement,
        ctx = canvas.getContext('2d')!,
        image = ctx.getImageData(0, 0, canvas.width, canvas.height),
        w = canvas.width,
        h = canvas.height;
      let edges = 0;
      for (let y = Math.floor(h * 0.24); y < Math.floor(h * 0.32); y++)
        for (let x = Math.floor(w * 0.11); x < Math.floor(w * 0.25) - 1; x++) {
          const i = (y * w + x) * 4,
            j = i + 4;
          if (
            Math.abs(image.data[i] - image.data[j]) +
              Math.abs(image.data[i + 1] - image.data[j + 1]) +
              Math.abs(image.data[i + 2] - image.data[j + 2]) >
            25
          )
            edges++;
        }
      return edges;
    });
  expect(detail).toBeGreaterThan(40); // An empty floor still retains visible grid lines in darkvision.
  expect(errors).toEqual([]);
});
