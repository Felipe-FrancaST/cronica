import type { Ability, ClassLevel, DndSheet } from './types';
import { ABILITIES, CLASSES } from './catalog';
import {
  CLASS_FEATURES,
  CLASS_PATHS,
  MULTICLASS_REQUIREMENTS,
  SUBCLASS_LEVELS,
  featureChoices,
} from './progression-catalog';

export function classLevels(
  sheet: Pick<DndSheet, 'class_id' | 'level' | 'subclass_id' | 'class_levels'>,
): ClassLevel[] {
  return sheet.class_levels?.length
    ? sheet.class_levels
    : [{ class_id: sheet.class_id, level: sheet.level, subclass_id: sheet.subclass_id ?? '' }];
}
export const classLevel = (
  sheet: Pick<DndSheet, 'class_id' | 'level' | 'subclass_id' | 'class_levels'>,
  id: string,
) => classLevels(sheet).find((c) => c.class_id === id)?.level ?? 0;
export const profession = (sheet: DndSheet) =>
  classLevels(sheet)
    .map(
      (c) =>
        `${CLASSES[c.class_id]?.name ?? c.class_id}${classLevels(sheet).length > 1 ? ` ${c.level}` : ''}`,
    )
    .join(' / ');
export const meetsPrerequisite = (id: string, abilities: Record<Ability, number>) =>
  (MULTICLASS_REQUIREMENTS[id] ?? []).every((group) => group.some((a) => abilities[a] >= 13));
export function improvementTotals(levels: ClassLevel[]): Record<Ability, number> {
  const result = Object.fromEntries(ABILITIES.map((a) => [a.id, 0])) as Record<Ability, number>;
  for (const c of levels)
    for (const [level, points] of Object.entries(c.improvements ?? {}))
      if (
        Number(level) <= c.level &&
        CLASS_FEATURES[c.class_id]?.some(
          (f) => f.level === Number(level) && f.name === 'Melhoria de atributos',
        )
      )
        for (const a of ABILITIES) result[a.id] += Number(points[a.id] ?? 0);
  return result;
}
export function withClassLevels(sheet: DndSheet, levels: ClassLevel[]): DndSheet {
  const old = improvementTotals(classLevels(sheet)),
    next = improvementTotals(levels);
  const oldChampion = classLevel(sheet, 'barbarian') === 20 ? 4 : 0,
    newChampion = levels.some((c) => c.class_id === 'barbarian' && c.level === 20) ? 4 : 0;
  const abilities = Object.fromEntries(
    ABILITIES.map((a) => [
      a.id,
      sheet.creation && sheet.creation.method !== 'manual'
        ? Math.min(
            20,
            sheet.creation.base[a.id] + (sheet.creation.bonuses[a.id] ?? 0) + next[a.id],
          ) + (['str', 'con'].includes(a.id) ? newChampion : 0)
        : sheet.abilities[a.id] -
          old[a.id] +
          next[a.id] +
          (['str', 'con'].includes(a.id) ? newChampion - oldChampion : 0),
    ]),
  ) as Record<Ability, number>;
  return {
    ...sheet,
    creation:
      sheet.creation?.method === 'manual' ? { ...sheet.creation, base: abilities } : sheet.creation,
    class_levels: levels,
    class_id: levels[0]?.class_id ?? sheet.class_id,
    subclass_id: levels[0]?.subclass_id ?? '',
    level: levels.reduce((n, c) => n + c.level, 0),
    abilities,
  };
}
// A campaign level change adds levels to the original class, or removes the
// original class's excess first, then the most recently added classes.
export function withCharacterLevel(sheet: DndSheet, level: number): DndSheet {
  if (!sheet.class_levels?.length) return { ...sheet, level };
  const levels = structuredClone(sheet.class_levels);
  let delta = level - levels.reduce((n, c) => n + c.level, 0);
  if (delta >= 0) levels[0].level += delta;
  else {
    const take = Math.min(levels[0].level - 1, -delta);
    levels[0].level -= take;
    delta += take;
    for (let i = levels.length - 1; i > 0 && delta < 0; i--) {
      const n = Math.min(levels[i].level, -delta);
      levels[i].level -= n;
      delta += n;
    }
  }
  const result = withClassLevels(sheet, cleanClassLevels(levels.filter((c) => c.level > 0)));
  return {
    ...result,
    feature_uses: {},
    hit_dice_by_class: {},
    hit_dice_used: Math.min(sheet.hit_dice_used, level),
  };
}
export function cleanClassLevels(levels: ClassLevel[]): ClassLevel[] {
  return levels.map((c, i) => {
    const next = { ...c, subclass_id: c.level < SUBCLASS_LEVELS[c.class_id] ? '' : c.subclass_id };
    const choices = featureChoices(c.class_id, c.level, next.subclass_id, i === 0);
    return {
      ...next,
      choices: Object.fromEntries(
        Object.entries(c.choices ?? {})
          .filter(([key]) => choices.some((ch) => ch.id === key))
          .map(([key, ids]) => [
            key,
            ids
              .filter((id) =>
                choices
                  .find((ch) => ch.id === key)!
                  .options.some(
                    (o) =>
                      o.id === id &&
                      (o.level ?? 0) <= c.level &&
                      (!o.pact || c.choices?.pact?.includes(o.pact)),
                  ),
              )
              .slice(0, choices.find((ch) => ch.id === key)!.count),
          ]),
      ),
      improvements: Object.fromEntries(
        Object.entries(c.improvements ?? {}).filter(([l]) => Number(l) <= c.level),
      ),
    };
  });
}
export function effectiveSkills(sheet: DndSheet) {
  const skills = { ...sheet.skills };
  for (const id of [
    ...(sheet.creation?.class_skills ?? []),
    ...(sheet.creation?.background_skills ?? []),
  ])
    skills[id] = Math.max(1, skills[id] ?? 0) as 1 | 2;
  classLevels(sheet).forEach((c, i) => {
    for (const choice of featureChoices(c.class_id, c.level, c.subclass_id, i === 0))
      for (const id of c.choices?.[choice.id] ?? [])
        if (choice.skills || choice.expertise)
          skills[id] = Math.max(choice.expertise ? 2 : 1, skills[id] ?? 0) as 1 | 2;
    if (c.class_id === 'warlock' && c.level >= 2 && c.choices?.invocations?.includes('beguiling')) {
      skills.deception = Math.max(1, skills.deception ?? 0) as 1 | 2;
      skills.persuasion = Math.max(1, skills.persuasion ?? 0) as 1 | 2;
    }
  });
  return skills;
}
export const hitDicePools = (sheet: DndSheet) =>
  Object.fromEntries(
    classLevels(sheet).map((c) => [
      c.class_id,
      {
        die: CLASSES[c.class_id]?.hitDie ?? 10,
        total: c.level,
        used:
          sheet.hit_dice_by_class?.[c.class_id] ??
          (classLevels(sheet).length === 1 ? sheet.hit_dice_used : 0),
      },
    ]),
  );
export function extraAttacks(sheet: DndSheet) {
  const fighter = classLevel(sheet, 'fighter');
  if (fighter >= 20) return 4;
  if (fighter >= 11) return 3;
  return classLevels(sheet).some(
    (c) =>
      (['fighter', 'barbarian', 'monk', 'paladin', 'ranger'].includes(c.class_id) &&
        c.level >= 5) ||
      (c.class_id === 'warlock' &&
        c.level >= 5 &&
        c.choices?.pact?.includes('blade') &&
        c.choices?.invocations?.includes('thirsting-blade')),
  )
    ? 2
    : 1;
}
export interface FeatureResource {
  id: string;
  name: string;
  max: number;
  rest: 'short' | 'long';
  description: string;
}
export function featureResources(sheet: DndSheet): FeatureResource[] {
  const result: FeatureResource[] = [];
  const mod = (a: Ability) => Math.floor((sheet.abilities[a] - 10) / 2);
  const add = (id: string, name: string, max: number, rest: 'short' | 'long', description = '') =>
    result.push({ id, name, max, rest, description });
  for (const c of classLevels(sheet)) {
    const l = c.level;
    if (c.class_id === 'barbarian')
      add(
        'barbarian:rage',
        'Fúrias',
        l >= 20 ? 999 : l >= 17 ? 6 : l >= 12 ? 5 : l >= 6 ? 4 : l >= 3 ? 3 : 2,
        'long',
        l >= 20 ? 'Ilimitadas' : 'Ação bônus.',
      );
    if (c.class_id === 'bard')
      add(
        'bard:inspiration',
        'Inspirações',
        Math.max(1, mod('cha')),
        l >= 5 ? 'short' : 'long',
        `Dado d${l >= 15 ? 12 : l >= 10 ? 10 : l >= 5 ? 8 : 6}.`,
      );
    if (c.class_id === 'druid' && l >= 2)
      add(
        'druid:wild-shape',
        'Forma Selvagem',
        l >= 20 ? 999 : 2,
        'short',
        l >= 20 ? 'Ilimitada' : 'Ação.',
      );
    if (c.class_id === 'fighter') {
      add('fighter:second-wind', 'Retomar o Fôlego', 1, 'short', `Cura 1d10+${l}.`);
      if (l >= 2) add('fighter:action-surge', 'Surto de Ação', l >= 17 ? 2 : 1, 'short');
      if (l >= 9) add('fighter:indomitable', 'Indomável', l >= 17 ? 3 : l >= 13 ? 2 : 1, 'long');
    }
    if (c.class_id === 'monk' && l >= 2)
      add(
        'monk:ki',
        'Pontos de ki',
        l,
        'short',
        `CD ${8 + 2 + Math.floor((sheet.level - 1) / 4) + mod('wis')}.`,
      );
    if (c.class_id === 'sorcerer' && l >= 2)
      add('sorcerer:points', 'Pontos de feitiçaria', l, 'long');
    if (c.class_id === 'paladin') {
      add('paladin:lay-hands', 'Impor as Mãos · PV', 5 * l, 'long');
      add('paladin:divine-sense', 'Sentido Divino', Math.max(0, 1 + mod('cha')), 'long');
      if (l >= 14) add('paladin:cleansing', 'Toque Purificador', Math.max(1, mod('cha')), 'long');
    }
    if (c.class_id === 'rogue' && l >= 20) add('rogue:luck', 'Golpe de Sorte', 1, 'short');
    if (c.class_id === 'wizard')
      add(
        'wizard:arcane-recovery',
        'Recuperação Arcana',
        1,
        'long',
        `Até ${Math.ceil(l / 2)} círculos de espaços após descanso curto; nenhum de 6º ou maior.`,
      );
    if (c.class_id === 'druid' && c.subclass_id === 'land' && l >= 2)
      add('druid:natural-recovery', 'Recuperação Natural', 1, 'long');
    if (c.class_id === 'monk' && c.subclass_id === 'open-hand' && l >= 6)
      add('monk:wholeness', 'Integridade Corporal', 1, 'long', `Cura ${3 * l} PV.`);
    if (c.class_id === 'warlock' && c.subclass_id === 'fiend' && l >= 6)
      add('warlock:luck', 'Sorte do Próprio Obscuro', 1, 'short');
    if (c.class_id === 'warlock' && c.subclass_id === 'fiend' && l >= 14)
      add('warlock:hell', 'Lançar no Inferno', 1, 'long');
    if (c.class_id === 'paladin' && c.subclass_id === 'devotion' && l >= 20)
      add('paladin:holy-nimbus', 'Aura Sagrada', 1, 'long');
  }
  const cleric = classLevel(sheet, 'cleric'),
    paladin = classLevel(sheet, 'paladin');
  if (cleric >= 2 || paladin >= 3)
    add(
      'shared:channel-divinity',
      'Canalizar Divindade',
      cleric >= 18 ? 3 : cleric >= 6 ? 2 : 1,
      'short',
      'Reserva compartilhada entre clérigo e paladino.',
    );
  return result;
}
export function recoverFeatures(sheet: DndSheet, rest: 'short' | 'long'): DndSheet {
  const used = { ...sheet.feature_uses };
  for (const r of featureResources(sheet))
    if (rest === 'long' || r.rest === 'short') used[r.id] = 0;
  if (rest === 'short' && classLevel(sheet, 'sorcerer') >= 20)
    used['sorcerer:points'] = Math.max(0, (used['sorcerer:points'] ?? 0) - 4);
  return { ...sheet, feature_uses: used };
}
export function progressionErrors(sheet: DndSheet): string[] {
  const errors: string[] = [];
  const levels = classLevels(sheet),
    ids = levels.map((c) => c.class_id);
  if (
    !levels.length ||
    levels.length > 13 ||
    new Set(ids).size !== ids.length ||
    levels.some(
      (c) => !CLASSES[c.class_id] || !Number.isInteger(c.level) || c.level < 1 || c.level > 20,
    )
  )
    errors.push('Cada classe deve aparecer uma vez, com nível inteiro de 1 a 20.');
  if (
    levels.reduce((n, c) => n + c.level, 0) !== sheet.level ||
    levels[0]?.class_id !== sheet.class_id ||
    (levels[0]?.subclass_id ?? '') !== (sheet.subclass_id ?? '')
  )
    errors.push('O nível total e a classe inicial devem corresponder à distribuição de classes.');
  if (levels.length > 1 && levels.some((c) => !meetsPrerequisite(c.class_id, sheet.abilities)))
    errors.push('Multiclasse exige os atributos mínimos (13) de todas as classes escolhidas.');
  levels.forEach((c, i) => {
    if (
      c.subclass_id &&
      (!CLASS_PATHS.some((p) => p.id === c.subclass_id && p.class_id === c.class_id) ||
        c.level < SUBCLASS_LEVELS[c.class_id])
    )
      errors.push(
        `O caminho de ${CLASSES[c.class_id]?.name ?? c.class_id} não está disponível nesse nível.`,
      );
    const valid = featureChoices(c.class_id, c.level, c.subclass_id, i === 0);
    for (const [key, selected] of Object.entries(c.choices ?? {})) {
      const choice = valid.find((x) => x.id === key);
      if (!choice) {
        if (selected.length) errors.push('Há uma escolha de habilidade indisponível neste nível.');
        continue;
      }
      if (
        !Array.isArray(selected) ||
        new Set(selected).size !== selected.length ||
        selected.length > choice.count ||
        selected.some(
          (id) =>
            !choice.options.some(
              (o) =>
                o.id === id &&
                (o.level ?? 0) <= c.level &&
                (!o.pact || c.choices?.pact?.includes(o.pact)),
            ),
        )
      )
        errors.push(`Confira a escolha: ${choice.name}.`);
      if (
        choice.expertise &&
        selected.some(
          (id) =>
            id !== 'thieves-tools' &&
            !Math.max(
              sheet.skills[id] ?? 0,
              (sheet.creation?.class_skills ?? []).includes(id) ? 1 : 0,
              (sheet.creation?.background_skills ?? []).includes(id) ? 1 : 0,
              ...valid
                .filter((x) => x.skills)
                .map((x) => (c.choices?.[x.id]?.includes(id) ? 1 : 0)),
            ),
        )
      )
        errors.push('Especialização exige proficiência prévia na perícia.');
    }
    const styles = [...(c.choices?.style ?? []), ...(c.choices?.['second-style'] ?? [])];
    if (new Set(styles).size !== styles.length) errors.push('Escolha estilos de luta diferentes.');
    for (const [l, points] of Object.entries(c.improvements ?? {})) {
      if (
        !CLASS_FEATURES[c.class_id]?.some(
          (f) => f.name === 'Melhoria de atributos' && f.level === Number(l),
        ) ||
        Number(l) > c.level ||
        Object.entries(points).some(
          ([a, n]) =>
            !ABILITIES.some((x) => x.id === a) ||
            !Number.isInteger(n) ||
            Number(n) < 0 ||
            Number(n) > 2,
        ) ||
        Object.values(points).reduce((n, v) => n + Number(v), 0) > 2
      )
        errors.push('Distribua no máximo 2 pontos em cada melhoria de atributos disponível.');
    }
  });
  const resources = featureResources(sheet);
  for (const [id, n] of Object.entries(sheet.feature_uses ?? {}))
    if (!Number.isInteger(n) || n < 0 || n > (resources.find((r) => r.id === id)?.max ?? 0))
      errors.push('Confira os usos de habilidades da classe.');
  for (const [id, n] of Object.entries(sheet.hit_dice_by_class ?? {}))
    if (!Number.isInteger(n) || n < 0 || n > (levels.find((c) => c.class_id === id)?.level ?? 0))
      errors.push('Confira os Dados de Vida gastos por classe.');
  return [...new Set(errors)];
}
