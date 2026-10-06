import type { Ability, DndSheet, Spell } from './types';
import { CLASSES } from './catalog';
import { classLevels, recoverFeatures } from './progression';
import { pathSpells } from './path-spells';
export const FULL_SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const THIRD_SLOTS: number[][] = [
  [],
  [],
  [],
  [2],
  [3],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
];
const KNOWN: Record<string, number[]> = {
  bard: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  sorcerer: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  warlock: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  ranger: [0, 0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  third: [0, 0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
};
export const CASTING_SUBCLASSES = {
  fighter: { id: 'eldritch-knight', name: 'Cavaleiro Arcano', schools: 'Abjuração e Evocação' },
  rogue: { id: 'arcane-trickster', name: 'Trapaceiro Arcano', schools: 'Encantamento e Ilusão' },
};
export function isThirdCaster(classId: string, subclassId = '') {
  return (
    (classId === 'fighter' && subclassId === 'eldritch-knight') ||
    (classId === 'rogue' && subclassId === 'arcane-trickster')
  );
}
export function spellSlots(classId: string, level: number, subclassId = ''): number[] {
  if (!Number.isInteger(level) || level < 1 || level > 20) return [];
  if (isThirdCaster(classId, subclassId)) return [...THIRD_SLOTS[level]];
  const caster = CLASSES[classId]?.caster;
  if (caster === 'full') return [...FULL_SLOTS[level]];
  if (caster === 'half') return level < 2 ? [] : [...FULL_SLOTS[Math.ceil(level / 2)]];
  if (caster === 'artificer') return level === 1 ? [2] : [...FULL_SLOTS[Math.ceil(level / 2)]];
  if (caster === 'pact') {
    const circle = Math.min(5, Math.ceil(level / 2));
    return Array.from({ length: circle }, (_, i) =>
      i === circle - 1 ? (level === 1 ? 1 : level < 11 ? 2 : level < 17 ? 3 : 4) : 0,
    );
  }
  return [];
}
export function spellAbility(classId: string, subclassId = ''): Ability | null {
  return isThirdCaster(classId, subclassId) ? 'int' : (CLASSES[classId]?.spellAbility ?? null);
}
export function castingProfile(
  sheet: Pick<DndSheet, 'class_id' | 'level' | 'subclass_id' | 'abilities' | 'class_levels'>,
  classId = sheet.class_id,
) {
  const selected = classLevels(sheet).find((c) => c.class_id === classId);
  const id = classId,
    l = selected?.level ?? 0,
    subclass = selected?.subclass_id ?? '';
  const third = isThirdCaster(id, subclass);
  const ability = spellAbility(id, subclass),
    slots = spellSlots(id, l, subclass);
  const pact = id === 'warlock',
    spellLimit = slots.length;
  const arcanumLevels = pact ? [6, 7, 8, 9].filter((_, i) => l >= 11 + i * 2) : [];
  let cantrips = 0;
  if (l >= 1 && l <= 20) {
    if (['bard', 'druid', 'warlock'].includes(id)) cantrips = l >= 10 ? 4 : l >= 4 ? 3 : 2;
    else if (['cleric', 'wizard'].includes(id)) cantrips = l >= 10 ? 5 : l >= 4 ? 4 : 3;
    else if (id === 'sorcerer') cantrips = l >= 10 ? 6 : l >= 4 ? 5 : 4;
    else if (id === 'artificer') cantrips = l >= 14 ? 4 : l >= 10 ? 3 : 2;
    else if (third && l >= 3) cantrips = (id === 'rogue' ? 3 : 2) + (l >= 10 ? 1 : 0);
  }
  const learning = third ? 'known' : (CLASSES[id]?.spellLearning ?? 'none');
  const mod = ability ? Math.floor((sheet.abilities[ability] - 10) / 2) : 0;
  const known = learning === 'known' ? (KNOWN[third ? 'third' : id]?.[l] ?? 0) : null;
  const prepared =
    learning === 'prepared' && slots.length
      ? Math.max(1, (['artificer', 'paladin'].includes(id) ? Math.floor(l / 2) : l) + mod)
      : null;
  return {
    classId: id,
    classLevel: l,
    ability,
    slots,
    pact,
    spellLimit,
    arcanumLevels,
    cantrips,
    known,
    prepared,
    learning,
    catalogClass: third ? 'wizard' : id,
  };
}
export function spellPools(
  sheet: Pick<DndSheet, 'class_id' | 'level' | 'subclass_id' | 'class_levels'>,
) {
  const levels = classLevels(sheet),
    warlock = levels.find((c) => c.class_id === 'warlock');
  const casters = levels.filter(
    (c) => c.class_id !== 'warlock' && spellSlots(c.class_id, c.level, c.subclass_id).length > 0,
  );
  const casterLevel = casters.reduce(
    (n, c) =>
      n +
      (isThirdCaster(c.class_id, c.subclass_id)
        ? Math.floor(c.level / 3)
        : CLASSES[c.class_id]?.caster === 'half'
          ? Math.floor(c.level / 2)
          : CLASSES[c.class_id]?.caster === 'artificer'
            ? Math.ceil(c.level / 2)
            : c.level),
    0,
  );
  const slots =
    casters.length === 1
      ? spellSlots(casters[0].class_id, casters[0].level, casters[0].subclass_id)
      : [...(FULL_SLOTS[Math.min(20, casterLevel)] ?? [])];
  const pact = warlock ? spellSlots('warlock', warlock.level) : [];
  return {
    slots,
    casterLevel,
    pactSlots: pact.at(-1) ?? 0,
    pactLevel: pact.length,
    arcanumLevels: warlock ? [6, 7, 8, 9].filter((_, i) => warlock.level >= 11 + i * 2) : [],
  };
}
export const spellProfile = (sheet: DndSheet, spell: Spell) =>
  castingProfile(sheet, spell.class_id || sheet.class_id);
export function spellIsInactive(sheet: DndSheet, spell: Spell): boolean {
  const origin = spellProfile(sheet, spell);
  const c = classLevels(sheet).find((c) => c.class_id === origin.classId);
  if (
    spell.granted_path &&
    (c?.subclass_id !== spell.granted_path ||
      !pathSpells(sheet, origin.classId).includes(spell.english_name ?? ''))
  )
    return true;
  if (spell.casting_mode === 'bonus') return false;
  if (spell.casting_mode === 'arcanum')
    return origin.classId !== 'warlock' || !origin.arcanumLevels.includes(spell.level);
  return (
    !origin.classLevel ||
    !origin.ability ||
    (spell.level === 0 && !origin.cantrips) ||
    spell.level > origin.spellLimit
  );
}
export function normalizeSpellResources(sheet: DndSheet): DndSheet {
  const p = spellPools(sheet);
  const integer = (v: unknown, max: number) =>
    Math.min(max, Math.max(0, Number.isFinite(v) ? Math.floor(Number(v)) : 0));
  const pactUsed =
    sheet.pact_slots_used ??
    (sheet.class_id === 'warlock' ? sheet.slots_used?.[String(p.pactLevel)] : 0);
  return {
    ...sheet,
    spells: sheet.spells.map((sp) => {
      const next =
        !sheet.class_levels?.length &&
        sp.casting_mode === 'arcanum' &&
        !p.arcanumLevels.includes(sp.level)
          ? { ...sp, casting_mode: p.pactSlots ? ('class' as const) : ('bonus' as const) }
          : sp;
      return { ...next, inactive: spellIsInactive(sheet, next) };
    }),
    slots_used: Object.fromEntries(
      p.slots.flatMap((n, i) =>
        n ? [[String(i + 1), integer(sheet.slots_used?.[String(i + 1)] ?? 0, n)]] : [],
      ),
    ),
    pact_slots_used: integer(pactUsed ?? 0, p.pactSlots),
    arcanum_used: Object.fromEntries(
      p.arcanumLevels.map((l) => [String(l), integer(sheet.arcanum_used?.[String(l)] ?? 0, 1)]),
    ),
  };
}
export function recoverSpellResources(sheet: DndSheet, rest: 'short' | 'long'): DndSheet {
  const normalized = recoverFeatures(normalizeSpellResources(sheet), rest);
  return {
    ...normalized,
    pact_slots_used: 0,
    ...(rest === 'long' ? { slots_used: {}, arcanum_used: {} } : {}),
  };
}
export type CastResource = 'cantrip' | 'slot' | 'pact' | 'arcanum' | 'ritual';
export function availableCastResources(
  sheet: DndSheet,
  spell: Spell,
): { kind: CastResource; level: number; remaining: number }[] {
  if (spellIsInactive(sheet, spell)) return [];
  const s = normalizeSpellResources(sheet),
    p = spellPools(s),
    origin = spellProfile(s, spell);
  if (
    spell.casting_mode !== 'bonus' &&
    (!origin.classLevel || (spell.level > origin.spellLimit && spell.casting_mode !== 'arcanum'))
  )
    return [];
  if (spell.level === 0) return [{ kind: 'cantrip', level: 0, remaining: Infinity }];
  if (spell.casting_mode === 'arcanum')
    return p.arcanumLevels.includes(spell.level)
      ? [
          {
            kind: 'arcanum',
            level: spell.level,
            remaining: 1 - (s.arcanum_used?.[String(spell.level)] ?? 0),
          },
        ]
      : [];
  const resources: { kind: CastResource; level: number; remaining: number }[] = p.slots.flatMap(
    (max, i) =>
      max && i + 1 >= spell.level
        ? [
            {
              kind: 'slot' as const,
              level: i + 1,
              remaining: max - (s.slots_used[String(i + 1)] ?? 0),
            },
          ]
        : [],
  );
  if (p.pactSlots && spell.level <= p.pactLevel)
    resources.push({
      kind: 'pact',
      level: p.pactLevel,
      remaining: p.pactSlots - (s.pact_slots_used ?? 0),
    });
  const available = spell.level <= origin.spellLimit;
  // Wizard rituals can be read from the spellbook. Other ritual casters need the spell prepared/known.
  if (
    spell.ritual &&
    available &&
    (origin.classId === 'wizard' ||
      (['bard', 'cleric', 'druid', 'artificer'].includes(origin.classId) &&
        (spell.prepared || spell.always_prepared)))
  )
    resources.push({ kind: 'ritual', level: spell.level, remaining: Infinity });
  return resources;
}
export function castSpell(
  sheet: DndSheet,
  spell: Spell,
  kind: CastResource,
  level: number,
): DndSheet {
  const s = normalizeSpellResources(sheet);
  if (
    spell.level > 0 &&
    kind !== 'ritual' &&
    !spell.prepared &&
    !spell.always_prepared &&
    spell.casting_mode !== 'arcanum'
  )
    throw new Error('Marque a magia como preparada ou conhecida antes de conjurar.');
  const resource = availableCastResources(s, spell).find(
    (r) => r.kind === kind && r.level === level,
  );
  if (!resource || resource.remaining < 1)
    throw new Error('Não há usos disponíveis para esta conjuração.');
  if (kind === 'slot')
    return {
      ...s,
      slots_used: { ...s.slots_used, [String(level)]: (s.slots_used[String(level)] ?? 0) + 1 },
    };
  if (kind === 'pact') return { ...s, pact_slots_used: (s.pact_slots_used ?? 0) + 1 };
  if (kind === 'arcanum') return { ...s, arcanum_used: { ...s.arcanum_used, [String(level)]: 1 } };
  return s;
}
