import { test, expect } from '@playwright/test';
test('create a campaign, require an existing player, edit a sheet, world and NPC, then delete', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minhas campanhas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nova campanha', exact: true }).click();
  await page.getByLabel('Nome da campanha').fill('O Reino de Teste');
  await page.getByLabel('Descrição', { exact: true }).fill('Uma aventura de teste.');
  await page.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'O Reino de Teste', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Jogadores', exact: true }).click();
  await page.getByLabel('Email do jogador').fill('inexistente@example.test');
  await page.getByRole('button', { name: 'Adicionar jogador', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'ainda não possui' })).toContainText(
    'ainda não possui uma conta',
  );
  await page.getByLabel('Email do jogador').fill('marina@cronica.demo');
  await page.getByRole('button', { name: 'Adicionar jogador', exact: true }).click();
  await expect(page.getByRole('cell').filter({ hasText: 'Marina Costa' })).toBeVisible();
  await page.getByRole('link', { name: 'Personagens', exact: true }).click();
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).first().click();
  await page.getByLabel('Nome do personagem').fill('Herói de Teste');
  await page.getByLabel('Classe', { exact: true }).selectOption('wizard');
  await page.getByLabel('Nível', { exact: true }).fill('5');
  await page.getByRole('tab', { name: 'Atributos e perícias' }).click();
  await page.getByLabel('Inteligência', { exact: true }).fill('18');
  await page.getByRole('tab', { name: 'Equipamentos' }).click();
  await page.getByLabel('Ouro', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar magia' }).click();
  await page.getByLabel('Nome da magia').fill('Luz');
  await page.getByLabel('Descrição', { exact: true }).fill('Ilumina um objeto.');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Herói de Teste', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
  await page.getByRole('tab', { name: 'Equipamentos' }).click();
  await expect(page.getByLabel('Ouro', { exact: true })).toHaveValue('50');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('link', { name: 'Mundo', exact: true }).click();
  await page.getByRole('button', { name: 'Novo registro' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Bosque de Teste');
  await page.getByLabel('Segredos').fill('Uma nota privada.');
  await page.getByLabel('Visível para jogadores').check();
  await page.getByRole('button', { name: 'Salvar lugar' }).click();
  await expect(page.getByRole('heading', { name: 'Bosque de Teste' })).toBeVisible();
  await page.getByRole('link', { name: 'NPCs', exact: true }).click();
  await page.getByRole('button', { name: 'Criar NPC', exact: true }).first().click();
  await page.getByLabel('Nome', { exact: true }).fill('Guardião de Teste');
  await page.getByRole('tab', { name: 'Atributos e combate' }).click();
  await page.getByLabel('PV máximos').fill('25');
  await page.getByRole('button', { name: 'Salvar NPC' }).click();
  await expect(page.getByRole('heading', { name: 'Guardião de Teste' })).toBeVisible();
  await page.getByRole('link', { name: 'Configurações', exact: true }).first().click();
  await page.getByRole('button', { name: 'Excluir campanha', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page.getByRole('heading', { name: 'Minhas campanhas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'O Reino de Teste' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('the same account switches to player mode and refuses inaccessible campaign IDs', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /VOCÊ ESTÁ COMO/ }).click();
  await page.getByRole('button', { name: /Entrar como Jogador/ }).click();
  await expect(page.getByRole('heading', { name: 'Minhas aventuras' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'O Juramento do Norte' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'As Cinzas de Eldrath' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Entrar na campanha', exact: true }).click();
  await page.getByRole('link', { name: 'Personagens', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cael, o Andarilho' })).toBeVisible();
  await page.goto('/campanhas/99999999-0000-4000-8000-000000000001');
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar esta aventura.' }),
  ).toBeVisible();
});
test('mobile navigation and dashboard fit without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minhas campanhas', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('link', { name: 'Meu perfil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meu perfil', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
