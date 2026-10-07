import { expect, type Page } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { createDemoWorkspace, DEMO_USER_ID } from '../../src/lib/demo-data';
const fixture = 'http://127.0.0.1:54329',
  seed = createDemoWorkspace(),
  campaign = seed.campaigns[0].id;
async function open(page: Page, path = `/campanhas/${campaign}/personagens`, id = DEMO_USER_ID) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    payload = Buffer.from(
      JSON.stringify({
        sub: id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'authenticated',
        role: 'authenticated',
      }),
    ).toString('base64url');
  const session = {
    access_token: `${header}.${payload}.test-signature`,
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
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
      domain: 'localhost',
      path: '/',
    },
  ]);
  await page.addInitScript(({ id }) => localStorage.setItem(`cronica:mode:${id}`, 'master'), {
    id,
  });
  await page.goto(path);
  await expect(
    page.getByRole('heading', {
      name: path === '/compendio' ? 'Compêndio D&D 5e' : 'Personagens',
      exact: true,
    }),
  ).toBeVisible();
}
async function create(page: Page, name: string, classId = 'fighter', level = 1) {
  await open(page);
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).first().click();
  await page.getByLabel('Nome do personagem').fill(name);
  await page.getByLabel('Classe', { exact: true }).selectOption(classId);
  if (level !== 1) await page.getByLabel('Nível', { exact: true }).fill(String(level));
}
async function reopen(page: Page, name: string) {
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .getByRole('button', { name: 'Abrir ficha', exact: true })
    .click();
}
test.beforeEach(async ({ request }) => {
  await request.post(fixture + '/__fixture/reset');
});

test('only the campaign master sees or accesses campaign rules, including direct URLs', async ({
  page,
}) => {
  await open(page, `/campanhas/${campaign}/personagens`, seed.profiles[1].id);
  await expect(page.getByRole('link', { name: 'Regras', exact: true })).toHaveCount(0);
  await page.goto(`/campanhas/${campaign}/regras`);
  await expect(page.getByRole('heading', { name: 'Regras reservadas ao mestre' })).toBeVisible();
  await expect(page.getByLabel('Pontos de vida ao subir de nível')).toHaveCount(0);
});

test('the master saves new rule controls and maximum HP recalculates without healing existing characters', async ({
  page,
  request,
}) => {
  await open(page);
  await page.getByRole('link', { name: 'Regras', exact: true }).click();
  await page.getByLabel('Permitir multiclasse').uncheck();
  await page.getByLabel('Pontos de vida ao subir de nível').selectOption('maximum');
  await page.getByLabel('Permitir recuperar recursos por descanso').uncheck();
  await page.getByLabel('Permitir criar itens personalizados').uncheck();
  await page.getByLabel('Método de atributos para novos personagens').selectOption('point-buy');
  await page.getByRole('button', { name: 'Salvar regras', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(fixture + '/__fixture/state')).json()).rules[0].hit_point_method,
    )
    .toBe('maximum');
  const state = await (await request.get(fixture + '/__fixture/state')).json();
  expect(state.rules[0].allow_multiclass).toBe(false);
  expect(state.rules[0].players_can_rest).toBe(false);
  expect(state.rules[0].players_can_create_custom_items).toBe(false);
  expect(state.rules[0].attribute_method).toBe('point-buy');
  expect(state.characters[0].sheet.hp_current).toBeLessThanOrEqual(
    seed.characters[0].sheet.hp_current,
  );
});

test('player controls explain forbidden multiclass, custom items and rests, and new attributes follow the campaign method', async ({
  page,
  request,
}) => {
  await request.post(fixture + '/__fixture/scenario', {
    data: {
      rules: {
        allow_multiclass: false,
        players_can_rest: false,
        players_can_create_custom_items: false,
        attribute_method: 'point-buy',
        hit_point_method: 'maximum',
      },
    },
  });
  await open(page, `/campanhas/${campaign}/personagens`, seed.profiles[1].id);
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).first().click();
  await page.getByLabel('Nome do personagem').fill('Personagem com regras');
  await page.getByRole('tab', { name: 'Criação assistida', exact: true }).click();
  await expect(page.getByLabel('Método de atributos')).toHaveValue('point-buy');
  await expect(page.getByLabel('Método de atributos')).toBeDisabled();
  await page.getByRole('tab', { name: 'Classes e habilidades', exact: true }).click();
  const add = page.getByRole('button', { name: 'Adicionar nível de multiclasse', exact: true });
  await expect(add).toBeDisabled();
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'desativou a multiclasse' }),
  ).toBeVisible();
  const rest = page.getByRole('button', { name: 'Recuperar descanso longo', exact: true });
  await expect(rest).toBeDisabled();
  await rest.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'descanso' })).toBeVisible();
  await page.getByRole('tab', { name: 'Equipamentos', exact: true }).click();
  const custom = page.getByRole('button', { name: 'Criar item personalizado', exact: true });
  await expect(custom).toBeDisabled();
  await custom.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Somente o mestre' })).toBeVisible();
});

test('rolled HP blocks saving until each new level has a recorded result, then retains it when reopening the character', async ({
  page,
  request,
}) => {
  await request.post(fixture + '/__fixture/scenario', {
    data: { rules: { hit_point_method: 'rolled' } },
  });
  await create(page, 'PV registrados', 'fighter', 2);
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(
    page.getByText('Role os dados de vida pendentes', { exact: false }).first(),
  ).toBeVisible();
  const roll = page.getByRole('button', { name: 'Rolar dados de vida pendentes', exact: true });
  await roll.click();
  await expect(roll).toBeDisabled();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const current = (await (await request.get(fixture + '/__fixture/state')).json()).characters.find(
    (c: { name: string }) => c.name === 'PV registrados',
  );
  expect(current.sheet.hit_point_rolls.fighter).toEqual([10, 5]);
  await reopen(page, 'PV registrados');
  await page.getByRole('tab', { name: 'Combate', exact: true }).click();
  await expect(page.getByText('Resultado registrado', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Rolar dados de vida pendentes', exact: true }),
  ).toBeDisabled();
});

test('creation assigns standard scores, background benefits and initial equipment only once', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await create(page, 'Aventureira de Origem');
  await page.getByRole('tab', { name: 'Criação assistida' }).click();
  await page.getByLabel('Escolher antecedente').selectOption('acolyte');
  await page.getByLabel('Élfico', { exact: true }).check();
  await page.getByLabel('Dracônico', { exact: true }).check();
  await page.getByLabel('Atletismo', { exact: true }).first().check();
  await page.getByLabel('Percepção', { exact: true }).first().check();
  await page.getByRole('button', { name: 'Aplicar equipamento e moedas iniciais' }).click();
  await expect(page.getByRole('button', { name: 'Equipamento inicial aplicado' })).toBeDisabled();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state = await (await request.get(fixture + '/__fixture/state')).json();
  const c = state.characters.find((c: any) => c.name === 'Aventureira de Origem');
  expect(c.sheet.currency.gp).toBe(15);
  expect(c.sheet.inventory.some((i: any) => i.name === 'Símbolo sagrado')).toBe(true);
  expect(c.sheet.skills.religion).toBe(1);
  await reopen(page, 'Aventureira de Origem');
  await page.getByRole('tab', { name: 'Criação assistida' }).click();
  await expect(page.getByRole('button', { name: 'Equipamento inicial aplicado' })).toBeDisabled();
  await expect(page.getByLabel('Élfico', { exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});

test('multiclass learns by class level and shares only the spell slot pool after saving', async ({
  page,
  request,
}) => {
  await create(page, 'Guardião Arcano', 'paladin', 3);
  await page.getByRole('tab', { name: 'Criação assistida' }).click();
  await page.getByLabel('Base · Inteligência', { exact: true }).selectOption('14');
  await page.getByLabel('Base · Carisma', { exact: true }).selectOption('13');
  await page.getByRole('tab', { name: 'Classes e habilidades' }).click();
  await page.getByLabel('Nova classe de multiclasse').selectOption('wizard');
  await page.getByRole('button', { name: 'Adicionar nível de multiclasse' }).click();
  await page.getByLabel('Nível de Mago').fill('2');
  await expect(page.getByText(/Nível total 5\/20/)).toBeVisible();
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await page.getByLabel('Classe do grimório').selectOption('wizard');
  await expect(page.getByLabel('Usados · magia 2')).toBeVisible();
  await page.getByRole('button', { name: 'Catálogo de magias', exact: true }).click();
  const catalog = page.getByRole('dialog', { name: 'Catálogo de magias e truques', exact: true });
  await catalog.getByLabel('Buscar magia').fill('magic missile');
  await catalog.getByRole('button', { name: 'Adicionar à ficha', exact: true }).click();
  await catalog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const spell = page.getByRole('region', { name: 'Magia Mísseis Mágicos', exact: true });
  await spell.getByLabel('Preparada', { exact: true }).check();
  await spell.getByLabel('Recurso para Mísseis Mágicos').selectOption('slot:2');
  await spell.getByRole('button', { name: 'Conjurar', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state = await (await request.get(fixture + '/__fixture/state')).json();
  const c = state.characters.find((c: any) => c.name === 'Guardião Arcano');
  expect(c.sheet.class_levels.map((c: any) => [c.class_id, c.level])).toEqual([
    ['paladin', 3],
    ['wizard', 2],
  ]);
  expect(c.sheet.slots_used['2']).toBe(1);
  expect(c.sheet.spells[0].class_id).toBe('wizard');
  await reopen(page, 'Guardião Arcano');
  await page.getByRole('tab', { name: 'Classes e habilidades' }).click();
  await expect(page.getByLabel('Nível de Mago')).toHaveValue('2');
});

test('class paths, fighting style, ASI and feature usage persist without repeating attribute bonuses', async ({
  page,
  request,
}) => {
  await create(page, 'Campeã do Caminho', 'fighter', 4);
  await page.getByRole('tab', { name: 'Classes e habilidades' }).click();
  await page.getByLabel('Caminho de Guerreiro', { exact: true }).selectOption('champion');
  await page.getByLabel('Defesa', { exact: true }).check();
  await page.getByLabel('Ponto 1 · Guerreiro 4').selectOption('str');
  await page.getByLabel('Ponto 2 · Guerreiro 4').selectOption('str');
  await page.getByLabel('Retomar o Fôlego · usados').fill('1');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await reopen(page, 'Campeã do Caminho');
  await page.getByRole('tab', { name: 'Atributos e perícias', exact: true }).click();
  await expect(page.getByLabel('Força', { exact: true })).toHaveValue('17');
  await page.getByRole('tab', { name: 'Classes e habilidades' }).click();
  await expect(page.getByLabel('Defesa', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Recuperar descanso curto', exact: true }).click();
  await expect(page.getByLabel('Retomar o Fôlego · usados')).toHaveValue('0');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  const state = await (await request.get(fixture + '/__fixture/state')).json();
  expect(
    state.characters.find((c: any) => c.name === 'Campeã do Caminho').sheet.abilities.str,
  ).toBe(17);
});

test('point buy respects 27 points and rolled scores keep six four-die results on mobile', async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page, 'Aventureira dos Dados');
  await page.getByRole('tab', { name: 'Criação assistida' }).click();
  await page.getByLabel('Método de atributos').selectOption('point-buy');
  for (const a of ['Força', 'Destreza', 'Constituição'])
    await page.getByLabel(`Base · ${a}`, { exact: true }).fill('15');
  await expect(page.getByRole('status').filter({ hasText: '0 pontos restantes' })).toBeVisible();
  await page.getByLabel('Base · Inteligência', { exact: true }).fill('9');
  await expect(page.getByLabel('Base · Inteligência', { exact: true })).toHaveValue('8');
  await page.getByLabel('Método de atributos').selectOption('rolled');
  await page.getByRole('button', { name: 'Rolar 4d6 × 6', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Rolar novamente 4d6 × 6', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.ability-roll')).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('criacao-mobile-v16.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state = await (await request.get(fixture + '/__fixture/state')).json();
  const c = state.characters.find((c: any) => c.name === 'Aventureira dos Dados');
  expect(c.sheet.creation.rolls).toHaveLength(6);
  expect(c.sheet.creation.rolls.every((r: number[]) => r.length === 4)).toBe(true);
});

test('compendium exposes class progression, backgrounds and multiclass rules on desktop and mobile', async ({
  page,
}, testInfo) => {
  await open(page, '/compendio');
  await page.getByRole('tab', { name: 'Habilidades e caminhos' }).click();
  await page.getByLabel('Classe da progressão').selectOption('monk');
  await page.locator('.feature-timeline summary').filter({ hasText: /Ki$/ }).click();
  await expect(page.getByText(/Pontos = nível de monge/)).toBeVisible();
  await page.getByRole('tab', { name: 'Antecedentes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acólito', exact: true })).toBeVisible();
  await expect(page.locator('.reference-card')).toHaveCount(7);
  await page.getByRole('tab', { name: 'Criação e multiclasse' }).click();
  await expect(
    page.getByRole('heading', { name: 'Regras de multiclasse', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('compendio-v16.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('v17 spell selection follows the actual class and path, with no free bonus bypass', async ({
  page,
}) => {
  await create(page, 'Guardiã sem Conjuração', 'fighter', 3);
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Catálogo de magias', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Suas classes e caminhos atuais não possuem conjuração/),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Classes e habilidades' }).click();
  await page.getByLabel('Caminho de Guerreiro', { exact: true }).selectOption('eldritch-knight');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await expect(page.getByLabel('Classe do grimório')).toHaveValue('fighter');
  await page.getByRole('button', { name: 'Catálogo de magias', exact: true }).click();
  const catalog = page.getByRole('dialog', { name: 'Catálogo de magias e truques', exact: true });
  await expect(catalog.getByLabel('Classe da magia')).toBeDisabled();
  await catalog.getByLabel('Buscar magia').fill('cure wounds');
  await expect(catalog.getByRole('button', { name: 'Adicionar à ficha', exact: true })).toHaveCount(
    0,
  );
  await catalog.getByLabel('Buscar magia').fill('magic missile');
  await expect(
    catalog.getByRole('button', { name: 'Adicionar à ficha', exact: true }),
  ).toBeEnabled();
  await catalog.getByRole('button', { name: 'Adicionar à ficha', exact: true }).click();
  await catalog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const spell = page.getByRole('region', { name: 'Magia Mísseis Mágicos', exact: true });
  await spell.locator('summary').click();
  await expect(spell.getByLabel('Classe de conjuração de Mísseis Mágicos')).toHaveValue('fighter');
  await page.getByRole('tab', { name: 'Classes e habilidades' }).click();
  await page.getByLabel('Caminho de Guerreiro', { exact: true }).selectOption('champion');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await expect(spell).toContainText('Indisponível nesta progressão');
  await expect(spell.getByRole('button', { name: 'Conjurar', exact: true })).toBeDisabled();
});

test('v17 inventory groups functional items and preserves quantities after saving', async ({
  page,
  request,
}, testInfo) => {
  await create(page, 'Exploradora dos Itens');
  await page.getByRole('tab', { name: 'Equipamentos', exact: true }).click();
  await page.getByLabel('Tipo de item', { exact: true }).selectOption('potion');
  await page.getByLabel('Item do catálogo', { exact: true }).selectOption('potion-healing');
  await page.getByRole('button', { name: 'Adicionar item', exact: true }).click();
  const potion = page.locator('.inventory-entry').filter({ hasText: 'Poção de cura' });
  await potion.locator('summary').click();
  await potion.getByLabel('Quantidade', { exact: true }).fill('3');
  await expect(potion).toContainText('Usável na Mesa');
  await page.getByLabel('Tipo de item', { exact: true }).selectOption('weapon');
  await page.getByLabel('Item do catálogo', { exact: true }).selectOption('longsword');
  await page.getByRole('button', { name: 'Adicionar item', exact: true }).click();
  const weapon = page.locator('.inventory-entry').filter({ hasText: 'Espada longa' });
  await weapon.locator('summary').click();
  await expect(weapon.getByLabel('Treinamento da arma')).toHaveValue('martial');
  await weapon.getByLabel('Proficiência com esta arma').selectOption('proficient');
  await weapon.getByLabel('Bônus adicional no ataque').fill('1');
  await weapon.getByLabel('Equipado', { exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('inventario-v17-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const s = await (await request.get(fixture + '/__fixture/state')).json();
  const c = s.characters.find((c: any) => c.name === 'Exploradora dos Itens');
  expect(c.sheet.inventory.find((i: any) => i.catalog_id === 'potion-healing').quantity).toBe(3);
  expect(c.sheet.inventory.find((i: any) => i.catalog_id === 'longsword').equipped).toBe(true);
  expect(c.sheet.inventory.find((i: any) => i.catalog_id === 'longsword').weapon_proficiency).toBe(
    'proficient',
  );
  expect(c.sheet.inventory.find((i: any) => i.catalog_id === 'longsword').weapon_attack_bonus).toBe(
    1,
  );
  await reopen(page, 'Exploradora dos Itens');
  await page.getByRole('tab', { name: 'Equipamentos', exact: true }).click();
  await expect(page.locator('.inventory-group')).toHaveCount(2);
  const depleted = page.locator('.inventory-entry').filter({ hasText: 'Poção de cura' });
  await depleted.locator('summary').click();
  await depleted.getByLabel('Quantidade', { exact: true }).fill('0');
  await expect(depleted).toContainText('esgotado');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const updated = await (await request.get(fixture + '/__fixture/state')).json();
  expect(
    updated.characters
      .find((c: any) => c.name === 'Exploradora dos Itens')
      .sheet.inventory.find((i: any) => i.catalog_id === 'potion-healing').quantity,
  ).toBe(0);
});

test('v17 the same catalog spell can be learned through two class origins and survives saving', async ({
  page,
  request,
}) => {
  await create(page, 'Estudiosa de Duas Tradições', 'wizard', 2);
  await page.getByRole('tab', { name: 'Criação assistida' }).click();
  await page.getByLabel('Base · Inteligência', { exact: true }).selectOption('14');
  await page.getByLabel('Base · Sabedoria', { exact: true }).selectOption('13');
  await page.getByRole('tab', { name: 'Classes e habilidades' }).click();
  await page.getByLabel('Nova classe de multiclasse').selectOption('cleric');
  await page.getByRole('button', { name: 'Adicionar nível de multiclasse' }).click();
  await page.getByLabel('Nível de Clérigo').fill('2');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  for (const origin of ['wizard', 'cleric']) {
    await page.getByLabel('Classe do grimório').selectOption(origin);
    await page.getByRole('button', { name: 'Catálogo de magias', exact: true }).click();
    const catalog = page.getByRole('dialog', { name: 'Catálogo de magias e truques', exact: true });
    await catalog.getByLabel('Buscar magia').fill('detect magic');
    await expect(
      catalog.getByRole('button', { name: 'Adicionar à ficha', exact: true }),
    ).toBeEnabled();
    await catalog.getByRole('button', { name: 'Adicionar à ficha', exact: true }).click();
    await catalog.getByRole('button', { name: 'Fechar', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state = await (await request.get(fixture + '/__fixture/state')).json();
  const spells = state.characters.find((c: any) => c.name === 'Estudiosa de Duas Tradições').sheet
    .spells;
  expect(spells).toHaveLength(2);
  expect(spells[0].catalog_id).toBe(spells[1].catalog_id);
  expect(spells.map((s: any) => s.class_id).sort()).toEqual(['cleric', 'wizard']);
  await reopen(page, 'Estudiosa de Duas Tradições');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  expect(await page.getByRole('region', { name: /Magia Detectar Magia/ }).count()).toBeGreaterThan(
    0,
  );
});

test('v17 compendium filters equipment and explains which class effects are automatic', async ({
  page,
}, testInfo) => {
  await open(page, '/compendio');
  await page.getByRole('tab', { name: 'Itens e equipamentos', exact: true }).click();
  await page.getByLabel('Tipo de equipamento').selectOption('potion');
  await expect(page.locator('.reference-card')).toHaveCount(4);
  await expect(page.getByText('2d4+2', { exact: true })).toBeVisible();
  await page.getByLabel('Tipo de equipamento').selectOption('weapon');
  await page.getByLabel('Buscar item').fill('Espada longa');
  await expect(page.locator('.reference-card')).toHaveCount(1);
  await expect(page.locator('.reference-card')).toContainText('duas mãos: 1d10');
  await page.screenshot({ path: testInfo.outputPath('compendio-itens-v17.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Habilidades e caminhos' }).click();
  await page.getByLabel('Classe da progressão').selectOption('barbarian');
  const rage = page
    .locator('.feature-timeline details')
    .filter({ has: page.locator('summary').filter({ hasText: /Fúria/ }) })
    .first();
  await rage.locator('summary').click();
  await expect(rage).toContainText('Mesa');
});
