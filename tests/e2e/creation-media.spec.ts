import { expect, type Page } from '@playwright/test';
import { test } from '../helpers/browser-test';
import { openFixturePage, fixturePlayer, fixtureUrl } from '../helpers/fixture-page';

async function twoColorImage(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 600, 600);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(600, 0, 600, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'duas-cores.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
}
async function pixelInfo(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url),
      bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
    return {
      width: bitmap.width,
      height: bitmap.height,
      center: pixel(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2)),
      corner: pixel(10, 10),
    };
  }, `${fixtureUrl}/storage/v1/object/sign/campaign-media/${path}?token=local`);
}
test.beforeEach(async ({ request }) => {
  await request.post(fixtureUrl + '/__fixture/reset');
});

test('master switches class terminology and saves Battle Master maneuvers with independently chosen weapons', async ({
  page,
  request,
}) => {
  await openFixturePage(page, undefined, 'personagens');
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).click();
  await page.getByLabel('Nome do personagem').fill('Tática do Mestre');
  await page.getByLabel('Classe', { exact: true }).selectOption('cleric');
  const domain = page.getByLabel('Domínio Divino · classe inicial', { exact: true });
  await expect(domain.locator('option')).toHaveCount(8);
  await domain.selectOption('knowledge');
  await page.getByRole('tab', { name: 'Classes e habilidades', exact: true }).click();
  await page.getByLabel('Arcanismo', { exact: true }).check();
  await page.getByLabel('História', { exact: true }).check();
  await page.getByRole('tab', { name: 'Identidade', exact: true }).click();
  await page.getByLabel('Classe', { exact: true }).selectOption('fighter');
  await page.getByLabel('Nível', { exact: true }).fill('3');
  await page
    .getByLabel('Arquétipo Marcial · classe inicial', { exact: true })
    .selectOption('battle-master');
  await page.getByLabel('Antecedente', { exact: true }).selectOption('soldier');
  await page.getByRole('tab', { name: 'Classes e habilidades', exact: true }).click();
  const maneuvers = page.getByRole('group', { name: /Manobras de combate/ });
  await expect(maneuvers.getByRole('checkbox')).toHaveCount(16);
  for (const name of ['Ataque de precisão', 'Aparar', 'Contra-ataque'])
    await maneuvers.getByLabel(name, { exact: true }).check();
  await page.getByLabel('Dados de superioridade · usados', { exact: true }).fill('1');
  await page.getByRole('tab', { name: 'Criação assistida', exact: true }).click();
  await page.getByLabel('Armamento marcial', { exact: true }).selectOption('two-martial');
  await page.getByLabel('Duas armas marciais 1', { exact: true }).selectOption('Rapieira');
  await page.getByLabel('Duas armas marciais 2', { exact: true }).selectOption('Rapieira');
  await page.getByLabel('Conjunto de jogo do soldado', { exact: true }).selectOption('cards');
  await page
    .getByRole('button', { name: 'Aplicar equipamento e moedas iniciais', exact: true })
    .click();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const data = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const s = data.characters.find((c: any) => c.name === 'Tática do Mestre').sheet;
  expect(s.class_levels[0].choices.maneuvers).toHaveLength(3);
  expect(s.class_levels[0].choices['knowledge-skills']).toBeUndefined();
  expect(s.feature_uses['fighter:superiority']).toBe(1);
  expect(s.inventory.find((i: any) => i.name === 'Rapieira').quantity).toBe(2);
  expect(s.inventory.some((i: any) => i.name === 'Baralho')).toBe(true);
});

test('player chooses wizard tradition and background from the book and saves the selected equipment on mobile', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Criar personagem', exact: true }).click();
  await page.getByLabel('Nome do personagem').fill('Maga do Recorte');
  await page.getByLabel('Classe', { exact: true }).selectOption('wizard');
  const tradition = page.getByLabel('Tradição Arcana · classe inicial', { exact: true });
  await expect(tradition).toBeDisabled();
  await expect(tradition.locator('option')).toHaveCount(9);
  await page.getByLabel('Nível', { exact: true }).fill('2');
  await tradition.selectOption('divination');
  const background = page.getByLabel('Antecedente', { exact: true });
  await expect(background).toHaveJSProperty('tagName', 'SELECT');
  await expect(background.locator('option')).toHaveCount(20);
  await background.selectOption('hermit');
  await page.getByRole('tab', { name: 'Criação assistida', exact: true }).click();
  await expect(page.getByLabel('Escolher antecedente', { exact: true })).toHaveValue('hermit');
  await page.getByRole('checkbox', { name: 'Anão', exact: true }).check();
  await page.getByRole('tab', { name: 'História', exact: true }).click();
  await expect(page.getByLabel('Idiomas', { exact: true })).toHaveValue(/Anão/);
  await page.getByRole('tab', { name: 'Criação assistida', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Anão', exact: true })).toBeChecked();
  await page.getByLabel('Arma principal', { exact: true }).selectOption('dagger');
  await page.getByLabel('Componentes ou foco arcano', { exact: true }).selectOption('pouch');
  await page.getByLabel('Pacote de aventura', { exact: true }).selectOption('explorer');
  await page
    .getByRole('button', { name: 'Aplicar equipamento e moedas iniciais', exact: true })
    .click();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const data = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const s = data.characters.find((c: any) => c.name === 'Maga do Recorte').sheet;
  expect(s.subclass_id).toBe('divination');
  expect(s.background).toBe('Eremita');
  expect(s.languages.split(',').map((v: string) => v.trim())).toContain('Anão');
  expect(s.currency.gp).toBe(5);
  expect(s.inventory.find((i: any) => i.catalog_id === 'dagger').quantity).toBe(1);
  expect(s.inventory.find((i: any) => i.catalog_id === 'torch').quantity).toBe(10);
  expect(s.inventory.some((i: any) => i.catalog_id === 'component-pouch')).toBe(true);
  expect(s.inventory.some((i: any) => i.name === 'Kit de herbalismo')).toBe(true);
});

test('player crops, cancels and readjusts a portrait, then saved pixels match the selected blue half', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openFixturePage(page, fixturePlayer, 'personagens');
  await page.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
  const input = page.getByLabel('Adicionar retrato', { exact: true }),
    file = await twoColorImage(page);
  await input.setInputFiles(file);
  let crop = page.getByRole('dialog', { name: 'Ajustar imagem', exact: true });
  await expect(crop.getByAltText('Imagem original para recorte')).toBeVisible();
  const stage = crop.getByRole('application'),
    bounds = (await stage.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 - 70, bounds.y + bounds.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  expect(
    Number(await crop.getByLabel('Posição horizontal', { exact: true }).inputValue()),
  ).toBeGreaterThan(0.5);
  await crop.getByLabel('Posição horizontal', { exact: true }).fill('1');
  const imageBox = await crop.getByAltText('Imagem original para recorte').boundingBox(),
    frameBox = await crop.locator('.image-crop-frame').boundingBox();
  expect(imageBox!.x + imageBox!.width).toBeCloseTo(frameBox!.x + frameBox!.width, 0);
  expect(imageBox!.y).toBeCloseTo(frameBox!.y, 0);
  await page.screenshot({ path: testInfo.outputPath('recorte-azul.png'), animations: 'disabled' });
  await crop.getByRole('button', { name: 'Usar este recorte', exact: true }).click();
  await expect(crop).toHaveCount(0);
  expect(
    (await (await request.get(fixtureUrl + '/__fixture/state')).json()).calls.filter(
      (c: any) => c.upload,
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Ajustar recorte', exact: true }).click();
  crop = page.getByRole('dialog', { name: 'Ajustar imagem', exact: true });
  await crop.getByLabel('Posição horizontal', { exact: true }).fill('0');
  await crop.getByRole('button', { name: 'Cancelar ajuste', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let data = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  const character = data.characters.find((c: any) => c.name === 'Lyra Ventolume');
  expect(character.portrait_path).toMatch(/\.webp$/);
  const image = await pixelInfo(page, character.portrait_path);
  expect([image.width, image.height]).toEqual([600, 600]);
  expect(image.center[2]).toBeGreaterThan(240);
  expect(image.center[0]).toBeLessThan(10);
  expect(image.corner[2]).toBeGreaterThan(240);
  await page.getByRole('button', { name: 'Abrir ficha', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar imagem atual', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ajustar imagem', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar ajuste', exact: true }).click();
  data = await (await request.get(fixtureUrl + '/__fixture/state')).json();
  expect(data.calls.filter((c: any) => c.upload)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('master rotates an avatar on mobile with no horizontal overflow and saves the red half', async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixturePage(page);
  await page.goto('/perfil');
  await page
    .getByLabel('Adicionar avatar', { exact: true })
    .setInputFiles(await twoColorImage(page));
  const crop = page.getByRole('dialog', { name: 'Ajustar imagem', exact: true });
  await crop.getByRole('button', { name: 'Girar 90°', exact: true }).click();
  const touchStage = crop.getByRole('application');
  await touchStage.scrollIntoViewIfNeeded();
  const touchBox = (await touchStage.boundingBox())!,
    touchX = touchBox.x + touchBox.width / 2,
    touchY = touchBox.y + touchBox.height / 2;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: touchX, y: touchY, id: 1 }],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: touchX, y: touchY + 50, id: 1 }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(
    Number(await crop.getByLabel('Posição vertical', { exact: true }).inputValue()),
  ).toBeLessThan(0.5);
  await touch.detach();
  await crop.getByLabel('Posição vertical', { exact: true }).fill('0');
  const imageBox = await crop.getByAltText('Imagem original para recorte').boundingBox(),
    frameBox = await crop.locator('.image-crop-frame').boundingBox();
  expect(imageBox!.y).toBeCloseTo(frameBox!.y, 0);
  expect(imageBox!.x).toBeCloseTo(frameBox!.x, 0);
  const stage = crop.getByRole('application');
  await stage.focus();
  await page.keyboard.press('ArrowUp');
  await expect(stage).toBeVisible();
  expect(await crop.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('recorte-celular.png'),
    animations: 'disabled',
  });
  await crop.getByRole('button', { name: 'Usar este recorte', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(fixtureUrl + '/__fixture/state')).json()).calls.filter(
          (c: any) => c.upload,
        ).length,
    )
    .toBe(1);
  const data = await (await request.get(fixtureUrl + '/__fixture/state')).json(),
    path = data.calls.find((c: any) => c.upload).upload;
  const image = await pixelInfo(page, path);
  expect([image.width, image.height]).toEqual([600, 600]);
  expect(image.center[0]).toBeGreaterThan(240);
  expect(image.center[2]).toBeLessThan(10);
});
