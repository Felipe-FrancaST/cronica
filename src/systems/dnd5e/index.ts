import type { Ability, DndSheet, Character, InventoryItem, Spell } from '@/types';
import type { RpgSystemModule } from '../types';
import { CLASSES, SKILLS } from './catalog';
import spellReferences from './data/spell-index.json';
import { getRace } from './ancestries';
import {
  spellSlots,
  spellAbility,
  normalizeSpellResources,
  castingProfile,
  spellPools,
} from './spellcasting';
import {
  classLevels,
  classLevel,
  effectiveSkills,
  progressionErrors,
  profession,
  hitDicePools,
  extraAttacks,
} from './progression';
import { creationErrors } from './creation';
export const abilityModifier = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) =>
  2 + Math.floor((Math.min(20, Math.max(1, level)) - 1) / 4);
export { spellSlots } from './spellcasting';
export function defaultSheet(): DndSheet {
  return {
    race: 'Humano',
    race_id: null,
    subclass_id: '',
    pact_slots_used: 0,
    arcanum_used: {},
    class_id: 'fighter',
    level: 1,
    background: '',
    alignment: 'Neutro',
    xp: 0,
    hp_current: 10,
    hp_max_override: null,
    hp_temp: 0,
    speed_override: null,
    ac_bonus: 0,
    initiative_bonus: 0,
    hit_dice_used: 0,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    skills: {},
    saves: ['str', 'con'],
    inventory: [],
    spells: [],
    slots_used: {},
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    conditions: [],
    features: '',
    languages: 'Comum',
    death_successes: 0,
    death_failures: 0,
  };
}
export function calculate(sheet: DndSheet) {
  const modifiers = Object.fromEntries(
    Object.entries(sheet.abilities).map(([k, v]) => [k, abilityModifier(v)]),
  ) as Record<Ability, number>;
  const levels = classLevels(sheet),
    monk = classLevel(sheet, 'monk'),
    barbarian = classLevel(sheet, 'barbarian'),
    bard = classLevel(sheet, 'bard');
  const cls = CLASSES[sheet.class_id] ?? CLASSES.fighter;
  const proficiency = proficiencyBonus(sheet.level);
  const castingAbility = spellAbility(sheet.class_id, sheet.subclass_id);
  const race = getRace(sheet.race);
  const equippedArmor = sheet.inventory.find(
    (i) => i.equipped && i.category === 'armor' && i.armor_type !== 'shield',
  );
  const armor = race?.natural_armor?.when === 'shell' ? undefined : equippedArmor;
  const shield = sheet.inventory.some((i) => i.equipped && i.armor_type === 'shield') ? 2 : 0;
  let armorClass = 10 + modifiers.dex;
  if (armor)
    armorClass =
      (armor.armor_base ?? 10) +
      (armor.armor_type === 'heavy'
        ? 0
        : armor.armor_type === 'medium'
          ? Math.min(2, modifiers.dex)
          : modifiers.dex);
  else {
    const defense = levels.find((c) => ['barbarian', 'monk'].includes(c.class_id));
    if (defense?.class_id === 'barbarian') armorClass += modifiers.con;
    else if (defense?.class_id === 'monk' && !shield) armorClass += modifiers.wis;
    if (levels.some((c) => c.class_id === 'sorcerer' && c.subclass_id === 'draconic'))
      armorClass = Math.max(armorClass, 13 + modifiers.dex);
  }
  if (
    armor &&
    levels.some((c) =>
      [...(c.choices?.style ?? []), ...(c.choices?.['second-style'] ?? [])].includes('defense'),
    )
  )
    armorClass++;
  if (race?.natural_armor && (!armor || race.natural_armor.when !== 'unarmored'))
    armorClass = Math.max(
      armorClass,
      race.natural_armor.base +
        (race.natural_armor.ability ? modifiers[race.natural_armor.ability] : 0),
    );
  armorClass += shield + sheet.ac_bonus + (race?.armor_bonus ?? 0);
  const training = effectiveSkills(sheet),
    jack = bard >= 2 ? Math.floor(proficiency / 2) : 0;
  const skills = Object.fromEntries(
    SKILLS.map((s) => [
      s.id,
      modifiers[s.ability] + (training[s.id] ?? 0) * proficiency + (!training[s.id] ? jack : 0),
    ]),
  );
  const saves = Object.fromEntries(
    Object.keys(modifiers).map((k) => [
      k,
      modifiers[k as Ability] +
        (sheet.saves.includes(k as Ability) ||
        (k === 'wis' && classLevel(sheet, 'rogue') >= 15) ||
        monk >= 14
          ? proficiency
          : 0),
    ]),
  ) as Record<Ability, number>;
  const hpMax =
    sheet.hp_max_override ??
    Math.max(1, cls.hitDie + modifiers.con) +
      levels.reduce(
        (n, c, i) =>
          n +
          (c.level - (i === 0 ? 1 : 0)) *
            Math.max(1, Math.floor((CLASSES[c.class_id]?.hitDie ?? 10) / 2) + 1 + modifiers.con),
        0,
      ) +
      (levels.find((c) => c.class_id === 'sorcerer' && c.subclass_id === 'draconic')?.level ?? 0) +
      sheet.level * (race?.hp_per_level ?? 0);
  let speed = race?.speed ?? 9;
  if (barbarian >= 5 && armor?.armor_type !== 'heavy') speed += 3;
  if (monk >= 2 && !armor && !shield)
    speed += monk >= 18 ? 9 : monk >= 14 ? 7.5 : monk >= 10 ? 6 : monk >= 6 ? 4.5 : 3;
  return {
    modifiers,
    proficiency,
    armorClass,
    initiative: modifiers.dex + sheet.initiative_bonus + jack,
    speed: sheet.speed_override ?? speed,
    hpMax,
    hitDie: cls.hitDie,
    spellAbility: castingAbility,
    spellDc: castingAbility ? 8 + proficiency + modifiers[castingAbility] : null,
    spellAttack: castingAbility ? proficiency + modifiers[castingAbility] : null,
    spellSlots: spellPools(sheet).slots,
    hitDicePools: hitDicePools(sheet),
    attacks: extraAttacks(sheet),
    skills,
    saves,
    passivePerception: 10 + skills.perception,
  };
}
export function validate(character: Character): string[] {
  const s = character.sheet;
  const errors: string[] = [];
  if (!character.name.trim()) errors.push('Dê um nome ao personagem.');
  if (!(s.class_id in CLASSES)) errors.push('Escolha uma classe válida.');
  if (!Number.isInteger(s.level) || s.level < 1 || s.level > 20)
    errors.push('O nível deve estar entre 1 e 20.');
  if (Object.values(s.abilities).some((v) => !Number.isInteger(v) || v < 1 || v > 30))
    errors.push('Os atributos devem estar entre 1 e 30.');
  if (s.hp_current < 0 || s.hp_temp < 0 || s.xp < 0)
    errors.push('PV e experiência não podem ser negativos.');
  if (s.hp_max_override !== null && s.hp_max_override < 1)
    errors.push('O máximo de PV deve ser positivo.');
  if (Object.values(s.currency).some((v) => !Number.isInteger(v) || v < 0))
    errors.push('As moedas devem ser inteiras e não negativas.');
  if (s.inventory.some((i) => i.quantity < 0 || !Number.isFinite(i.weight) || i.weight < 0))
    errors.push('Confira a quantidade e o peso dos itens.');
  if (
    s.spells.some(
      (spell) =>
        !spell.name.trim() || !Number.isInteger(spell.level) || spell.level < 0 || spell.level > 9,
    )
  )
    errors.push('Confira os nomes e níveis das magias.');
  const catalogSpells = s.spells.filter((sp) => sp.catalog_id);
  if (
    catalogSpells.some((sp) => {
      const ref = spellReferences.find((ref) => ref.id === sp.catalog_id);
      return ref ? ref.level !== sp.level : !sp.catalog_classes?.length;
    })
  )
    errors.push('Confira as referências de magia do catálogo.');
  if (new Set(catalogSpells.map((sp) => sp.catalog_id)).size !== catalogSpells.length)
    errors.push('Uma magia do catálogo só pode aparecer uma vez no grimório.');
  if (
    s.class_levels?.length ||
    (Number.isInteger(s.level) && s.level >= 1 && s.level <= 20 && s.class_id in CLASSES)
  )
    errors.push(...progressionErrors(s));
  errors.push(...creationErrors(s));
  const profile = spellPools(s);
  if (s.race_id && getRace(s.race_id)?.name !== s.race)
    errors.push('Confira a raça do personagem.');
  if (
    Object.entries(s.slots_used ?? {}).some(
      ([k, v]) =>
        !Number.isInteger(v) ||
        v < 0 ||
        v > (profile.slots[Number(k) - 1] ?? 0) ||
        !/^[1-9]$/.test(k),
    )
  )
    errors.push('Confira os espaços de magia usados.');
  if (
    !Number.isInteger(s.pact_slots_used ?? 0) ||
    (s.pact_slots_used ?? 0) < 0 ||
    (s.pact_slots_used ?? 0) > profile.pactSlots
  )
    errors.push('Confira os espaços de pacto usados.');
  if (
    Object.entries(s.arcanum_used ?? {}).some(
      ([k, v]) =>
        !profile.arcanumLevels.includes(Number(k)) || !Number.isInteger(v) || v < 0 || v > 1,
    )
  )
    errors.push('Confira os usos de Arcanos Místicos.');
  const arcana = s.spells.filter((sp) => sp.casting_mode === 'arcanum');
  if (
    arcana.some(
      (sp) =>
        !profile.arcanumLevels.includes(sp.level) ||
        (sp.catalog_id &&
          !(
            sp.catalog_classes ??
            spellReferences.find((ref) => ref.id === sp.catalog_id)?.classes ??
            []
          ).includes('warlock')),
    ) ||
    new Set(arcana.map((sp) => sp.level)).size !== arcana.length
  )
    errors.push('Escolha apenas um Arcano Místico por círculo disponível.');
  return [...new Set(errors)];
}
export const dnd5e: RpgSystemModule = {
  slug: 'dnd5e',
  name: 'D&D 5e',
  version: 'SRD 5.1',
  defaultSheet,
  hydrateSheet: (stored) =>
    normalizeSpellResources({
      ...defaultSheet(),
      ...stored.data,
      abilities: {
        ...defaultSheet().abilities,
        ...Object.fromEntries(stored.attributes.map((a) => [a.ability, a.score])),
      },
      skills: Object.fromEntries(
        stored.skills.map((s) => [s.skill, s.proficiency]),
      ) as DndSheet['skills'],
      inventory: stored.inventory as InventoryItem[],
      spells: stored.spells as Spell[],
      race_id: getRace(stored.data.race as string)?.id ?? null,
      pact_slots_used: stored.data.pact_slots_used as number | undefined,
    }),
  calculate,
  validate,
  describeSheet: (sheet) => ({
    ancestry: sheet.race,
    profession: profession(sheet),
    level: sheet.level,
  }),
};
