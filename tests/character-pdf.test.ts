import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFTextField, PDFDict, PDFName, PDFCheckBox, PDFStream } from 'pdf-lib';
import { generateCharacterPdf } from '../src/systems/dnd5e/pdf/generate';
import { buildCharacterPdfModel } from '../src/systems/dnd5e/pdf/model';
import {
  textField,
  checkField,
  SPELL_FIELDS,
  SKILL_ORDER,
} from '../src/systems/dnd5e/pdf/template';
import { pdfCharacter, spell } from './helpers/character-pdf-fixture';
import { defaultSheet, dnd5e } from '../src/systems/dnd5e';

const assets = Promise.all([
  readFile('public/character-sheet/dnd5e-editable-v1.pdf'),
  readFile('public/character-sheet/DejaVuSans.ttf'),
]).then(([template, font]) => ({ template, font }));
const context = { playerName: 'João da Conceição', campaignName: 'A Crônica dos Rios' };
const rich = pdfCharacter();
const generated = assets.then((a) => generateCharacterPdf(rich, context, a));

test('PDF maps identity, six abilities, ordered skills, saves, coins and death saves to the supplied template', async () => {
  const result = await generated;
  const pdf = await PDFDocument.load(result.bytes),
    form = pdf.getForm(),
    d = buildCharacterPdfModel(rich).derived;
  const get = (id: number) => form.getTextField(textField(id)).getText();
  assert.equal(get(0), rich.name);
  assert.equal(get(84), rich.name);
  assert.equal(get(10), context.playerName);
  assert.equal(get(9), 'Sábia');
  assert.equal(get(13), 'Humano');
  assert.equal(get(11), '100500');
  assert.equal(get(27), '12');
  assert.equal(get(29), '+1');
  assert.equal(get(30), '16');
  assert.equal(get(33), '+3');
  assert.equal(get(32), '14');
  assert.equal(get(31), '+2');
  assert.equal(get(35), '18');
  assert.equal(get(34), '+4');
  assert.equal(get(36), '16');
  assert.equal(get(39), '+3');
  assert.equal(get(38), '20');
  assert.equal(get(37), '+5');
  for (let i = 0; i < SKILL_ORDER.length; i++)
    assert.equal(
      get(66 + i),
      `${d.skills[SKILL_ORDER[i]] >= 0 ? '+' : ''}${d.skills[SKILL_ORDER[i]]}`,
    );
  assert.equal(get(55), '11');
  assert.equal(get(57), '22');
  assert.equal(get(58), '33');
  assert.equal(get(59), '444');
  assert.equal(get(56), '5');
  assert.equal(get(40), '37');
  assert.equal(get(41), '6');
  assert.equal(get(42), '80');
  assert.equal(get(25), String(d.armorClass));
  assert.equal(get(54), String(d.passivePerception));
  assert.equal(get(85), '127 anos');
  assert.equal(get(86), '1,72 m');
  assert.equal(get(87), '58 kg');
  assert.equal(get(90), 'Verde-esmeralda');
  assert.equal(get(89), 'Morena');
  assert.equal(get(88), 'Prateado');
  for (const id of [24, 25, 27]) assert.equal(form.getCheckBox(checkField(id)).isChecked(), true);
  for (const id of [26, 28, 29]) assert.equal(form.getCheckBox(checkField(id)).isChecked(), false);
  assert.equal(form.getTextField('cronica.appearance').getText(), rich.appearance);
});

test('PDF includes full item functions, spells and separate spellcasting statistics for every class', async () => {
  const model = buildCharacterPdfModel(rich, context);
  assert.deepEqual(model.casters, [
    { name: 'Mago', ability: 'INT', dc: 16, attack: '+8' },
    { name: 'Clérigo', ability: 'SAB', dc: 15, attack: '+7' },
    { name: 'Bruxo', ability: 'CAR', dc: 17, attack: '+9' },
  ]);
  assert.equal(model.attacks[0].bonus, '+7');
  assert.match(model.attacks[0].damage, /1d8\+3 perfurante/);
  const pdf = await PDFDocument.load((await generated).bytes),
    form = pdf.getForm();
  const extra = form
    .getFields()
    .filter((f) => f.getName().startsWith('cronica.continuation'))
    .map((f) => (f as PDFTextField).getText())
    .join('\n');
  for (const value of [
    'Anel de névoa',
    'Véu de névoa',
    'Oculta a área por um minuto.',
    'Anotação da jogadora.',
    'Descrição completa de Luz',
    'Magia de Pacto',
    'Especializações',
    'Envenenado',
  ])
    assert.match(extra.toLowerCase(), new RegExp(value.toLowerCase()));
  assert.equal(form.getCheckBox(checkField(SPELL_FIELDS[1].checks[0])).isChecked(), true);
  assert.equal(form.getCheckBox(checkField(SPELL_FIELDS[1].checks[1])).isChecked(), true);
  assert.equal(form.getCheckBox(checkField(SPELL_FIELDS[1].checks[2])).isChecked(), false);
  assert.equal(form.getTextField(textField(SPELL_FIELDS[1].used!)).getText(), '2');
});

test('PDF remains editable with canonical widget values and appearance streams, and fitted content', async () => {
  const result = await generated,
    pdf = await PDFDocument.load(result.bytes),
    form = pdf.getForm();
  const names = form.getFields().map((f) => f.getName());
  const canonical = new Set(form.getFields().map((f) => f.acroField.dict));
  assert.equal(new Set(names).size, names.length);
  assert.ok(pdf.getPageCount() > 3);
  for (const field of form.getFields()) {
    for (const widget of field.acroField.getWidgets()) {
      const normal = widget.getAppearances()?.normal;
      assert.ok(normal instanceof PDFStream || normal instanceof PDFDict, field.getName());
    }
    if (field instanceof PDFTextField || field instanceof PDFCheckBox) {
      assert.equal(field.isReadOnly(), false, field.getName());
      for (const widget of field.acroField.getWidgets()) {
        const normal = widget.getAppearances()?.normal;
        assert.ok(normal instanceof PDFStream || normal instanceof PDFDict, field.getName());
        assert.equal(widget.dict.has(PDFName.of('A')), false);
        assert.equal(widget.dict.has(PDFName.of('AA')), false);
      }
    }
  }
  for (const page of pdf.getPages())
    for (const ref of page.node.Annots()?.asArray() ?? []) {
      const widget = pdf.context.lookup(ref, PDFDict);
      if (widget.lookupMaybe(PDFName.of('Subtype'), PDFName)?.toString() !== '/Widget') continue;
      const effective = widget.lookupMaybe(PDFName.of('Parent'), PDFDict) ?? widget;
      assert.ok(canonical.has(effective), `Orphan widget: ${effective.get(PDFName.of('T'))}`);
    }
  for (const group of SPELL_FIELDS.slice(1))
    for (let i = 0; i < group.names.length; i++) {
      const name = group.names[i];
      const text = form
        .getTextField(typeof name === 'number' ? textField(name) : name)
        .acroField.getWidgets()[0]
        .getRectangle();
      const check = form
        .getCheckBox(checkField(group.checks[i]))
        .acroField.getWidgets()[0]
        .getRectangle();
      assert.ok(
        Math.abs(text.y + text.height / 2 - 3 - (check.y + check.height / 2)) < 2,
        `Preparation marker misaligned with ${name}`,
      );
    }
  for (const p of result.placements) {
    assert.ok(
      p.lineWidths.every((width) => width <= p.width + 0.001),
      p.name,
    );
    assert.ok(p.lineWidths.length * p.lineHeight <= p.height + 0.001, p.name);
  }
  assert.ok(
    form.acroForm.dict.lookup(PDFName.of('DR'), PDFDict).lookup(PDFName.of('Font'), PDFDict).keys()
      .length > 0,
  );
  const field = form.getTextField(textField(0));
  field.setText('Nome editado depois da exportação');
  const reopened = await PDFDocument.load(await pdf.save({ updateFieldAppearances: false }));
  assert.equal(
    reopened.getForm().getTextField(textField(0)).getText(),
    'Nome editado depois da exportação',
  );
});

test('large biographies, unbroken text, spell overflow and Unicode retain every original value', async () => {
  const c = pdfCharacter();
  c.biography =
    'Início da história. ' + 'Crônicas do rio e das montanhas. '.repeat(180) + 'FINAL-DA-BIOGRAFIA';
  c.appearance = 'X'.repeat(600) + ' APARÊNCIA-FINAL';
  c.sheet.spells = Array.from({ length: 27 }, (_, i) => spell(`Magia ${i + 1} — memória`, 1));
  c.sheet.spells.push(spell('Magia inativa de nono círculo', 9));
  c.sheet.details!.treasures = 'Símbolo raro: 🐉; manuscrito: 漢字.';
  const result = await generateCharacterPdf(c, context, await assets),
    pdf = await PDFDocument.load(result.bytes);
  const text = pdf
    .getForm()
    .getFields()
    .filter((f) => f instanceof PDFTextField)
    .map((f) => (f as PDFTextField).getText())
    .join('\n');
  for (const value of [
    'FINAL-DA-BIOGRAFIA',
    'APARÊNCIA-FINAL',
    'Magia 27 — memória',
    'Magia inativa de nono círculo',
    '🐉',
    '漢字',
  ])
    assert.ok(text.includes(value), value);
  assert.ok(result.warnings.length);
  assert.ok(result.pageCount < 30, `Unexpected page count: ${result.pageCount}`);
  for (const p of result.placements)
    assert.ok(
      p.lineWidths.every((width) => width <= p.width + 0.001),
      p.name,
    );
});

test('old saved sheets hydrate new details, and noncasters have empty spell headers', async () => {
  const c = pdfCharacter();
  c.sheet = defaultSheet();
  assert.equal(
    dnd5e.hydrateSheet({
      data: { details: { age: '25' } },
      attributes: [],
      skills: [],
      inventory: [],
      spells: [],
    }).details?.age,
    '25',
  );
  const pdf = await PDFDocument.load((await generateCharacterPdf(c, context, await assets)).bytes),
    form = pdf.getForm();
  assert.equal(form.getTextField(textField(19)).getText() ?? '', '');
  for (const id of [20, 21, 22]) assert.equal(form.getTextField(textField(id)).getText() ?? '', '');
  assert.equal(form.getCheckBox(checkField(24)).isChecked(), false);
});

test('pure pact slots are exported at their own circle and extra save proficiencies follow class rules', () => {
  const c = pdfCharacter();
  c.sheet = { ...defaultSheet(), class_id: 'warlock', level: 5, pact_slots_used: 1 };
  const model = buildCharacterPdfModel(c);
  assert.deepEqual(model.slotTotals, [0, 0, 2]);
  assert.equal(model.slotUsed['3'], 1);
  c.sheet = { ...defaultSheet(), class_id: 'monk', level: 14, saves: [] };
  assert.equal(buildCharacterPdfModel(c).saveProficiencies.length, 6);
});
