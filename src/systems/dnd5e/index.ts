import type { Ability, DndSheet, Character, InventoryItem, Spell } from '@/types';
import type { RpgSystemModule } from '../types';
import { CLASSES, SKILLS } from './catalog';
export const abilityModifier = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) =>
  2 + Math.floor((Math.min(20, Math.max(1, level)) - 1) / 4);
const FULL_SLOTS = [
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
export function spellSlots(classId: string, level: number): number[] {
  const caster = CLASSES[classId]?.caster;
  if (caster === 'full') return [...(FULL_SLOTS[level] || [])];
  if (caster === 'half') return level < 2 ? [] : [...(FULL_SLOTS[Math.ceil(level / 2)] || [])];
  if (caster === 'pact') {
    const spellLevel = Math.min(5, Math.ceil(level / 2));
    return Array.from({ length: spellLevel }, (_, i) =>
      i === spellLevel - 1 ? (level === 1 ? 1 : level < 11 ? 2 : level < 17 ? 3 : 4) : 0,
    );
  }
  return [];
}
export function defaultSheet(): DndSheet {
  return {
    race: 'Humano',
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
  const armor = sheet.inventory.find(
    (i) => i.equipped && i.category === 'armor' && i.armor_type !== 'shield',
  );
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
  armorClass += shield + sheet.ac_bonus;
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
      (sheet.level - 1) * Math.max(1, Math.floor(cls.hitDie / 2) + 1 + modifiers.con);
  return {
    modifiers,
    proficiency,
    armorClass,
    initiative: modifiers.dex + sheet.initiative_bonus,
    speed: sheet.speed_override ?? (['Anão', 'Halfling', 'Gnomo'].includes(sheet.race) ? 7.5 : 9),
    hpMax,
    hitDie: cls.hitDie,
    spellAbility: cls.spellAbility,
    spellDc: cls.spellAbility ? 8 + proficiency + modifiers[cls.spellAbility] : null,
    spellAttack: cls.spellAbility ? proficiency + modifiers[cls.spellAbility] : null,
    spellSlots: spellSlots(sheet.class_id, sheet.level),
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
  if (s.spells.some((spell) => !spell.name.trim() || spell.level < 0 || spell.level > 9))
    errors.push('Confira os nomes e níveis das magias.');
  return errors;
}
export const dnd5e: RpgSystemModule = {
  slug: 'dnd5e',
  name: 'D&D 5e',
  version: 'SRD 5.1',
  defaultSheet,
  hydrateSheet: (stored) => ({
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
  }),
  calculate,
  validate,
  describeSheet: (sheet) => ({
    ancestry: sheet.race,
    profession: CLASSES[sheet.class_id]?.name ?? sheet.class_id,
    level: sheet.level,
  }),
};
