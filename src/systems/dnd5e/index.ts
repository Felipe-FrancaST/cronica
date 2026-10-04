import type { Ability, DndSheet, Character, InventoryItem, Spell } from '@/types';
import type { RpgSystemModule } from '../types';
import { CLASSES, SKILLS } from './catalog';
import spellReferences from './data/spell-index.json';
import { getRace } from './ancestries';
import { spellSlots, spellAbility, normalizeSpellResources, castingProfile } from './spellcasting';
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
  else if (sheet.class_id === 'barbarian') armorClass += modifiers.con;
  else if (sheet.class_id === 'monk' && !shield) armorClass += modifiers.wis;
  if (race?.natural_armor && (!armor || race.natural_armor.when !== 'unarmored'))
    armorClass = Math.max(
      armorClass,
      race.natural_armor.base +
        (race.natural_armor.ability ? modifiers[race.natural_armor.ability] : 0),
    );
  armorClass += shield + sheet.ac_bonus + (race?.armor_bonus ?? 0);
  const skills = Object.fromEntries(
    SKILLS.map((s) => [s.id, modifiers[s.ability] + (sheet.skills[s.id] ?? 0) * proficiency]),
  );
  const saves = Object.fromEntries(
    Object.keys(modifiers).map((k) => [
      k,
      modifiers[k as Ability] + (sheet.saves.includes(k as Ability) ? proficiency : 0),
    ]),
  ) as Record<Ability, number>;
  const hpMax =
    sheet.hp_max_override ??
    Math.max(1, cls.hitDie + modifiers.con) +
      (sheet.level - 1) * Math.max(1, Math.floor(cls.hitDie / 2) + 1 + modifiers.con) +
      sheet.level * (race?.hp_per_level ?? 0);
  let speed = race?.speed ?? 9;
  if (sheet.class_id === 'barbarian' && sheet.level >= 5 && armor?.armor_type !== 'heavy')
    speed += 3;
  if (sheet.class_id === 'monk' && sheet.level >= 2 && !armor && !shield)
    speed +=
      sheet.level >= 18
        ? 9
        : sheet.level >= 14
          ? 7.5
          : sheet.level >= 10
            ? 6
            : sheet.level >= 6
              ? 4.5
              : 3;
  return {
    modifiers,
    proficiency,
    armorClass,
    initiative: modifiers.dex + sheet.initiative_bonus,
    speed: sheet.speed_override ?? speed,
    hpMax,
    hitDie: cls.hitDie,
    spellAbility: castingAbility,
    spellDc: castingAbility ? 8 + proficiency + modifiers[castingAbility] : null,
    spellAttack: castingAbility ? proficiency + modifiers[castingAbility] : null,
    spellSlots: spellSlots(sheet.class_id, sheet.level, sheet.subclass_id),
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
  const profile = castingProfile(s);
  if (
    s.subclass_id &&
    !(
      (s.class_id === 'fighter' && s.subclass_id === 'eldritch-knight') ||
      (s.class_id === 'rogue' && s.subclass_id === 'arcane-trickster')
    )
  )
    errors.push('Escolha uma opção de conjuração válida para esta classe.');
  if (s.race_id && getRace(s.race_id)?.name !== s.race)
    errors.push('Confira a raça do personagem.');
  if (
    Object.entries(s.slots_used ?? {}).some(
      ([k, v]) =>
        !Number.isInteger(v) ||
        v < 0 ||
        v > (profile.pact ? 0 : (profile.slots[Number(k) - 1] ?? 0)) ||
        !/^[1-9]$/.test(k),
    )
  )
    errors.push('Confira os espaços de magia usados.');
  if (
    !Number.isInteger(s.pact_slots_used ?? 0) ||
    (s.pact_slots_used ?? 0) < 0 ||
    (s.pact_slots_used ?? 0) > (profile.pact ? (profile.slots[profile.spellLimit - 1] ?? 0) : 0)
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
  return errors;
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
    profession: CLASSES[sheet.class_id]?.name ?? sheet.class_id,
    level: sheet.level,
  }),
};
