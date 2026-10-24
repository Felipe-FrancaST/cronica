import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFButton,
  PDFName,
  PDFDict,
  TextAlignment,
  drawText,
  rgb,
  degrees,
  type PDFFont,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Character } from '@/types';
import { ABILITIES, CLASSES } from '../catalog';
import { spellIsInactive } from '../spellcasting';
import { signed } from '@/lib/utils';
import { buildCharacterPdfModel, type CharacterPdfContext, type PdfSection } from './model';
import { ABILITY_FIELDS, SKILL_ORDER, SPELL_FIELDS, textField, checkField } from './template';

export interface CharacterPdfAssets {
  template: Uint8Array;
  font: Uint8Array;
  portrait?: Uint8Array;
}
export interface PdfPlacement {
  name: string;
  size: number;
  width: number;
  height: number;
  lineHeight: number;
  lineWidths: number[];
}
const CONTINUED = '(Conteúdo completo nas páginas adicionais.)';
const widthCaches = new WeakMap<PDFFont, Map<string, number>>();
function measure(font: PDFFont, text: string, size: number) {
  let cache = widthCaches.get(font);
  if (!cache) {
    cache = new Map();
    widthCaches.set(font, cache);
  }
  let width = cache.get(text);
  if (width === undefined) {
    width = font.widthOfTextAtSize(text, 1);
    if (cache.size >= 6000) cache.clear();
    cache.set(text, width);
  }
  return width * size;
}

/** Wraps even long unbroken names/URLs, without removing user characters. */
export function wrapPdfText(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
  maxLines = Infinity,
): string[] {
  const result: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(font, candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        result.push(line);
        if (result.length > maxLines) return result;
        line = '';
      }
      let rest = Array.from(word);
      while (rest.length && measure(font, rest.join(''), size) > width) {
        let low = 1,
          high = rest.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          if (measure(font, rest.slice(0, mid).join(''), size) <= width) low = mid;
          else high = mid - 1;
        }
        result.push(rest.slice(0, low).join(''));
        if (result.length > maxLines) return result;
        rest = rest.slice(low);
      }
      line = rest.join('');
    }
    result.push(line);
    if (result.length > maxLines) return result;
  }
  return result;
}

export async function generateCharacterPdf(
  character: Character,
  context: CharacterPdfContext,
  assets: CharacterPdfAssets,
) {
  const pdf = await PDFDocument.load(assets.template);
  pdf.registerFontkit(fontkit);
  // Embed the complete font, so accented characters remain editable in PDF readers.
  const font = await pdf.embedFont(assets.font, { subset: false });
  const form = pdf.getForm(),
    model = buildCharacterPdfModel(character, context),
    s = character.sheet;
  if (pdf.getPageCount() !== 3 || form.getFields().length !== 335)
    throw new Error('O modelo da ficha PDF foi alterado. Restaure o modelo incluído nesta versão.');
  const sections: PdfSection[] = [],
    placements: PdfPlacement[] = [],
    warnings: string[] = [];
  const glyphs = new Set(font.getCharacterSet());
  const display = (value: string) =>
    Array.from(value)
      .map((c) => {
        if (c === '\n' || c === '\r' || c === '\t' || glyphs.has(c.codePointAt(0)!)) return c;
        if (!warnings.length)
          warnings.push(
            'Alguns símbolos foram representados pelo código Unicode; o texto original foi mantido nos campos editáveis.',
          );
        return `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`;
      })
      .join('');
  const dr = form.acroForm.dict.lookupMaybe(PDFName.of('DR'), PDFDict) ?? pdf.context.obj({});
  const fonts = dr.lookupMaybe(PDFName.of('Font'), PDFDict) ?? pdf.context.obj({});
  fonts.set(PDFName.of(font.name), font.ref);
  dr.set(PDFName.of('Font'), fonts);
  form.acroForm.dict.set(PDFName.of('DR'), dr);
  form.acroForm.dict.delete(PDFName.of('NeedAppearances'));

  // The template contains image picker buttons. The export has no actions/scripts.
  for (const field of form.getFields()) {
    field.acroField.dict.delete(PDFName.of('A'));
    field.acroField.dict.delete(PDFName.of('AA'));
    for (const widget of field.acroField.getWidgets()) {
      widget.dict.delete(PDFName.of('A'));
      widget.dict.delete(PDFName.of('AA'));
      widget.dict.delete(PDFName.of('DA'));
    }
    if (field instanceof PDFTextField) field.setText('');
    if (field instanceof PDFCheckBox) field.uncheck();
    if (field instanceof PDFButton) {
      field.enableReadOnly();
      // Empty image buttons in the source have no appearance stream.
      field.updateAppearances(font);
    }
  }
  const rect = (field: PDFTextField) => field.acroField.getWidgets()[0].getRectangle();
  const padding = (width: number) => (width < 32 ? 0.25 : 2);
  const lineHeight = (size: number) => font.heightAtSize(size) * 1.2;
  function layout(field: PDFTextField, value: string, size: number, multiline: boolean) {
    const box = rect(field),
      width = box.width - padding(box.width) * 2,
      height = box.height - (box.height < 17 ? 1 : 4);
    const lines = !value
      ? []
      : multiline
        ? wrapPdfText(display(value), font, size, width, Math.floor(height / lineHeight(size)))
        : [display(value).replace(/\s*\n\s*/g, ' ')];
    return {
      lines,
      width,
      height,
      fits:
        (multiline
          ? lines.length * lineHeight(size) <= height
          : font.heightAtSize(size) <= height) &&
        lines.every((line) => measure(font, line, size) <= width),
    };
  }
  function paint(
    field: PDFTextField,
    value: string,
    size: number,
    multiline = true,
    centered = false,
  ) {
    field.disableReadOnly();
    if (multiline) field.enableMultiline();
    else field.disableMultiline();
    field.disableScrolling();
    field.setAlignment(centered ? TextAlignment.Center : TextAlignment.Left);
    field.setText(value);
    field.acroField.setDefaultAppearance(`/${font.name} ${size} Tf 0 g`);
    const result = layout(field, value, size, multiline);
    if (!result.fits && value) throw new Error(`O conteúdo não coube no campo ${field.getName()}.`);
    field.updateAppearances(font, (_field, widget) => {
      const box = widget.getRectangle();
      const baseline = multiline
        ? box.height - 2 - font.heightAtSize(size, { descender: false })
        : (box.height - font.heightAtSize(size, { descender: false })) / 2;
      return result.lines.flatMap((line, i) =>
        drawText(font.encodeText(line), {
          color: rgb(0.08, 0.08, 0.09),
          font: font.name,
          size,
          rotate: degrees(0),
          xSkew: degrees(0),
          ySkew: degrees(0),
          x: centered ? (box.width - measure(font, line, size)) / 2 : padding(box.width),
          y: baseline - (multiline ? i * lineHeight(size) : 0),
        }),
      );
    });
    placements.push({
      name: field.getName(),
      size,
      width: result.width,
      height: result.height,
      lineHeight: multiline ? lineHeight(size) : font.heightAtSize(size),
      lineWidths: result.lines.map((line) => measure(font, line, size)),
    });
  }
  function take(field: PDFTextField, text: string, size: number, multiline = true) {
    if (layout(field, text, size, multiline).fits) return [text, ''];
    const chars = Array.from(text);
    let low = 0,
      high = chars.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (layout(field, chars.slice(0, mid).join(''), size, multiline).fits) low = mid;
      else high = mid - 1;
    }
    let cut = chars.slice(0, low).join('');
    const paragraph = cut.lastIndexOf('\n\n');
    const boundary =
      paragraph > cut.length * 0.7
        ? paragraph
        : Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
    if (boundary > cut.length * 0.7) cut = cut.slice(0, boundary);
    return [cut.trimEnd(), text.slice(cut.length).trimStart()];
  }
  function put(
    id: number | string,
    value: string | number | undefined,
    title: string,
    options: { size?: number; min?: number; multiline?: boolean; center?: boolean } = {},
  ) {
    const field = form.getTextField(typeof id === 'number' ? textField(id) : id);
    const text = String(value ?? '').replace(/\r\n?/g, '\n');
    const multiline = options.multiline ?? field.isMultiline();
    let size = options.size ?? (multiline ? 9 : 11),
      min = options.min ?? (multiline ? 8 : 7);
    while (size > min && !layout(field, text, size, multiline).fits)
      size = Math.max(min, size - 0.25);
    if (layout(field, text, size, multiline).fits)
      paint(field, text, size, multiline, options.center);
    else {
      sections.push({ title, text });
      // Small single-line cells refer to the appendix rather than using unreadable type.
      let marker = multiline ? CONTINUED : '(ver anexo)';
      if (!layout(field, marker, size, multiline).fits) marker = '*';
      const [preview] = take(field, `${text}\n${marker}`, size, multiline);
      let prefix = preview;
      while (
        prefix &&
        !layout(field, `${prefix}${multiline ? '\n' : ' '}${marker}`, size, multiline).fits
      )
        prefix = Array.from(prefix).slice(0, -1).join('').trimEnd();
      paint(
        field,
        prefix ? `${prefix}${multiline ? '\n' : ' '}${marker}` : marker,
        size,
        multiline,
        options.center,
      );
    }
  }
  function flow(ids: number[], text: string, title: string) {
    let remaining = text;
    const parts: string[] = [];
    for (const id of ids) {
      const [part, rest] = take(form.getTextField(textField(id)), remaining, 8.5);
      parts.push(part);
      remaining = rest;
    }
    if (remaining) sections.push({ title, text });
    ids.forEach((id, i) => {
      const field = form.getTextField(textField(id));
      let part = parts[i];
      if (remaining && i === ids.length - 1) {
        while (part && !layout(field, `${part}\n${CONTINUED}`, 8.5, true).fits)
          part = Array.from(part).slice(0, -1).join('').trimEnd();
        part += `\n${CONTINUED}`;
      }
      paint(field, part, 8.5);
    });
  }
  const check = (id: number, checked: boolean) => {
    const field = form.getCheckBox(checkField(id));
    if (checked) field.check();
    else field.uncheck();
  };
  // The source save/skill widgets are narrower than a two-digit signed bonus.
  // Use the blank underline around each widget without touching the printed labels.
  for (let id = 60; id <= 83; id++) {
    const widget = form.getTextField(textField(id)).acroField.getWidgets()[0];
    const box = widget.getRectangle();
    widget.setRectangle({ ...box, x: box.x - 1, width: box.width + 2 });
  }
  put(0, character.name, 'Nome do personagem', { size: 18 });
  put(84, character.name, 'Nome do personagem', { size: 18 });
  put(8, model.className, 'Classes e níveis', { size: 10, min: 7, multiline: true });
  put(9, s.background, 'Antecedente');
  put(10, context.playerName, 'Nome do jogador');
  put(11, s.xp, 'Experiência');
  put(12, s.alignment, 'Alinhamento');
  put(13, s.race, 'Raça');
  put(1, s.creation?.traits, 'Traços de personalidade');
  put(2, s.creation?.ideal, 'Ideais');
  put(3, s.creation?.bond, 'Vínculos');
  put(4, s.creation?.flaw, 'Fraquezas');
  put(25, model.derived.armorClass, 'Classe de armadura', { size: 19, center: true });
  put(23, signed(model.derived.initiative), 'Iniciativa', { size: 20, center: true });
  put(24, `${model.derived.speed.toLocaleString('pt-BR')} m`, 'Deslocamento', {
    size: 16,
    center: true,
  });
  put(
    26,
    (s.inspiration_count ?? (s.details?.inspiration ? 1 : 0)) > 0
      ? String(s.inspiration_count ?? 1)
      : '',
    'Inspiração',
    { size: 9, center: true },
  );
  put(28, signed(model.derived.proficiency), 'Proficiência', { size: 16, center: true });
  put(40, s.hp_current, 'PV atuais', { size: 24, center: true });
  put(41, s.hp_temp, 'PV temporários', { size: 24, center: true });
  put(42, model.derived.hpMax, 'PV máximos', { size: 9, multiline: false });
  put(43, model.hitDiceRemaining, 'Dados de vida disponíveis', { size: 12, center: true });
  put(44, s.level, 'Dados de vida totais', { size: 9, multiline: false });
  put(54, model.derived.passivePerception, 'Percepção passiva', { size: 15, center: true });
  ABILITIES.forEach((a, i) => {
    const [score, modifier] = ABILITY_FIELDS[a.id];
    put(score, s.abilities[a.id], a.label, { size: 23, center: true });
    put(modifier, signed(model.derived.modifiers[a.id]), `Modificador de ${a.label}`, {
      size: 9,
      center: true,
    });
    put(60 + i, signed(model.derived.saves[a.id]), `Salvaguarda de ${a.label}`, {
      size: 8,
      multiline: false,
      center: true,
    });
    check(i, model.saveProficiencies.includes(a.id));
  });
  SKILL_ORDER.forEach((id, i) => {
    put(66 + i, signed(model.derived.skills[id]), id, { size: 8, multiline: false, center: true });
    check(6 + i, (model.skills[id] ?? 0) > 0);
  });
  for (let i = 0; i < 3; i++) {
    check(24 + i, s.death_successes > i);
    check(27 + i, s.death_failures > i);
  }
  for (const [key, id] of [
    ['cp', 55],
    ['sp', 57],
    ['ep', 58],
    ['gp', 59],
    ['pp', 56],
  ] as const)
    put(id, s.currency[key], `Moedas ${key}`, { size: 11, center: true });
  put(7, model.proficiencies, 'Outras proficiências e idiomas');
  put(
    6,
    s.inventory
      .map((i) => `${i.quantity} × ${i.name}${i.equipped ? ' (equipado)' : ''}`)
      .join('\n'),
    'Equipamentos',
  );
  model.attacks.slice(0, 3).forEach((a, i) => {
    put(45 + i, a.name, 'Arma', { size: 8, multiline: true });
    put(48 + i, a.bonus, 'Bônus de ataque', { size: 9, center: true, multiline: false });
    put(51 + i, a.compactDamage, `Dano de ${a.name}`, { size: 8, min: 7, multiline: true });
  });
  put(
    5,
    `Condições: ${s.conditions.join(', ') || 'nenhuma'}.\nAtaques por ação: ${model.derived.attacks}.\n${model.casters.map((c) => `${c.name}: CD ${c.dc}, ataque ${c.attack} (${c.ability}).`).join('\n')}\nRecursos e inventário detalhados nas páginas adicionais.`,
    'Ataques e conjuração',
  );
  flow([14, 15], model.features, 'Características e talentos completos');
  put(17, character.biography, 'História do personagem');
  put(209, s.details?.allies, 'Aliados e organizações');
  put(18, s.details?.organization, 'Nome da organização', { size: 10 });
  put(16, model.treasures, 'Tesouros');
  for (const [key, id] of [
    ['age', 85],
    ['height', 86],
    ['weight', 87],
    ['eyes', 90],
    ['skin', 89],
    ['hair', 88],
  ] as const)
    put(id, s.details?.[key], key, { size: 10 });
  const appearance = form.createTextField('cronica.appearance');
  appearance.enableMultiline();
  appearance.addToPage(pdf.getPages()[1], {
    x: 32,
    y: 427,
    width: 163,
    height: assets.portrait ? 103 : 212,
    borderWidth: 0,
    backgroundColor: undefined,
  });
  if (assets.portrait) {
    const image =
      assets.portrait[0] === 0x89
        ? await pdf.embedPng(assets.portrait)
        : await pdf.embedJpg(assets.portrait);
    const button = form.getButton('Image78_af_image');
    button.acroField.getWidgets()[0].setRectangle({ x: 36, y: 535, width: 155, height: 104 });
    button.setImage(image);
  }
  put('cronica.appearance', character.appearance, 'Aparência do personagem');
  put(19, model.casters.map((c) => c.name).join(' / '), 'Classes conjuradoras', {
    size: 16,
    multiline: true,
  });
  for (const [id, key] of [
    [20, 'ability'],
    [21, 'dc'],
    [22, 'attack'],
  ] as const)
    put(id, model.casters.map((c) => c[key]).join(' / '), 'Conjuração por classe', {
      size: 14,
      min: 7,
      multiline: false,
      center: true,
    });
  SPELL_FIELDS.forEach((group, level) => {
    if (group.total !== null)
      put(group.total, model.slotTotals[level - 1] ?? 0, `${level}º círculo: espaços totais`, {
        size: 12,
        center: true,
      });
    if (group.used !== null)
      put(group.used, model.slotUsed[String(level)] ?? 0, `${level}º círculo: espaços usados`, {
        size: 10,
        center: true,
      });
    model.spellGroups[level].slice(0, group.names.length).forEach((spell, i) => {
      const inactive = spellIsInactive(s, spell);
      const origin =
        model.casters.length > 1
          ? ` (${CLASSES[spell.class_id || s.class_id]?.name ?? spell.class_id ?? ''})`
          : '';
      put(
        group.names[i],
        `${spell.name}${origin}${inactive ? ' [inativa]' : ''}`,
        `Magia: ${spell.name}`,
        { size: 8.5, multiline: false },
      );
      if (group.checks[i] !== undefined)
        check(group.checks[i], !inactive && (spell.prepared || !!spell.always_prepared));
    });
  });
  pdf
    .getPages()[2]
    .drawText('Listas completas, descrições de magias e campos com *: páginas adicionais.', {
      x: 34,
      y: 23,
      size: 7,
      font,
      color: rgb(0.32, 0.32, 0.35),
    });
  // Every spell (including overflow/inactive spells) and every item also has its full text here.
  sections.push(...model.sections);
  const [pageWidth, pageHeight] = [pdf.getPages()[0].getWidth(), pdf.getPages()[0].getHeight()];
  const appendixText = sections
    .filter((section) => section.text.trim())
    .map((section) => `${section.title.toUpperCase()}\n\n${section.text}`)
    .join('\n\n\n');
  const width = pageWidth - 76,
    height = pageHeight - 148;
  // Paginate the original text with the same display metrics used in the form.
  // Every continuation is also an editable field, with a unique canonical name.
  let remaining = appendixText,
    index = 0;
  while (remaining) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    const field = form.createTextField(`cronica.continuation.${++index}`);
    field.enableMultiline();
    field.addToPage(page, {
      x: 38,
      y: 56,
      width,
      height,
      borderWidth: 0,
      backgroundColor: undefined,
    });
    const [part, rest] = take(field, remaining, 9.5);
    if (!part) throw new Error('Não foi possível distribuir o texto nas páginas adicionais.');
    paint(field, part, 9.5);
    remaining = rest;
    page.drawText('CRÔNICA RPG · FICHA DO PERSONAGEM', {
      x: 40,
      y: pageHeight - 37,
      size: 9,
      font,
      color: rgb(0.32, 0.32, 0.35),
    });
    const heading = wrapPdfText(display(character.name), font, 17, width)[0];
    page.drawText(heading, { x: 40, y: pageHeight - 62, size: 17, font });
    page.drawText('Informações complementares · campos editáveis', {
      x: 40,
      y: pageHeight - 79,
      size: 8.5,
      font,
      color: rgb(0.32, 0.32, 0.35),
    });
    page.drawLine({
      start: { x: 40, y: pageHeight - 88 },
      end: { x: pageWidth - 40, y: pageHeight - 88 },
      thickness: 0.7,
      color: rgb(0.6, 0.6, 0.62),
    });
  }
  // Keep all untouched fields editable, empty, and with valid appearance streams.
  for (const field of form.getFields()) {
    if (field instanceof PDFTextField && !placements.some((p) => p.name === field.getName()))
      paint(field, '', 9, field.isMultiline());
    // Preserve the template's circular checkbox artwork and its Off/Yes streams.
  }
  for (let i = 3; i < pdf.getPageCount(); i++)
    pdf.getPages()[i].drawText(`Crônica RPG · D&D 5e · Página ${i + 1} de ${pdf.getPageCount()}`, {
      x: 40,
      y: 31,
      size: 8,
      font,
      color: rgb(0.32, 0.32, 0.35),
    });
  pdf.setTitle(`${character.name} — Ficha D&D 5e`);
  pdf.setAuthor(context.playerName || 'Crônica RPG');
  pdf.setCreator('Crônica RPG');
  const bytes = await pdf.save({ updateFieldAppearances: false });
  return { bytes, pageCount: pdf.getPageCount(), warnings, placements };
}
