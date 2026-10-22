import type { Ability, Character, DndSheet, InventoryItem, Spell } from '@/types';
import { calculate } from '..';
import { ABILITIES, CLASSES, SKILLS } from '../catalog';
import { getRace } from '../ancestries';
import { BACKGROUNDS } from '../creation';
import { classLevels, effectiveSkills, featureResources, hitDicePools } from '../progression';
import { CLASS_TRAINING, classFeatures, featureChoices, pathsFor } from '../progression-catalog';
import { castingClasses, castingProfile, spellIsInactive, spellPools } from '../spellcasting';
import { weaponEffect } from '@/features/vtt/effects';
import { signed } from '@/lib/utils';

export interface PdfSection {
  title: string;
  text: string;
}
export interface CharacterPdfContext {
  playerName?: string;
  campaignName?: string;
}
const label = (id: string) => CLASSES[id]?.name ?? id;
const abilityLabel = (id: string) => ABILITIES.find((a) => a.id === id)?.short ?? id;
const unique = (values: (string | undefined)[]) => [...new Set(values.filter(Boolean))].join('; ');
const paragraphs = (values: (string | undefined)[]) => values.filter(Boolean).join('\n\n');
const yes = (value: unknown) => (value ? 'Sim' : 'Não');
const number = (value: number) => String(value).replace('.', ',');
const methodLabel = (method?: string) =>
  ({
    standard: 'Conjunto padrão',
    'point-buy': 'Compra de pontos',
    rolled: 'Rolagem',
    manual: 'Manual',
    average: 'Média',
    maximum: 'Máximo',
  })[method ?? ''] ??
  method ??
  'Padrão';

export function pdfAttack(item: InventoryItem, sheet: DndSheet) {
  const effect = weaponEffect(item, sheet);
  const damage = effect.damageParts?.length
    ? effect.damageParts.map((p) => `${p.dice} ${p.damageType}`.trim()).join(' + ')
    : effect.kind === 'utility'
      ? 'Sem dano'
      : `${effect.dice} ${effect.damageType}`.trim();
  return {
    name: item.name,
    bonus: signed(effect.attackBonus ?? 0),
    damage,
    compactDamage: damage.replace(
      /perfurante|cortante|concussão|elétrico|trovejante|necrótico|radiante|psíquico|energia|veneno/gi,
      (type) =>
        ({
          perfurante: 'perf.',
          cortante: 'cort.',
          concussão: 'conc.',
          elétrico: 'elétr.',
          trovejante: 'trov.',
          necrótico: 'necr.',
          radiante: 'rad.',
          psíquico: 'psíq.',
          energia: 'energ.',
          veneno: 'ven.',
        })[type.toLowerCase()] ?? type,
    ),
    range: `${number(effect.range)} m`,
  };
}

function inventoryDetail(item: InventoryItem, sheet: DndSheet): string {
  const attack = item.category === 'weapon' ? pdfAttack(item, sheet) : null;
  return paragraphs([
    `${item.name} — quantidade ${item.quantity}; peso unitário ${number(item.weight)} kg; equipado: ${yes(item.equipped)}.`,
    attack ? `Ataque ${attack.bonus}; dano ${attack.damage}; alcance ${attack.range}.` : undefined,
    unique([
      item.armor_base !== undefined ? `CA base ${item.armor_base}` : undefined,
      item.damage ? `Dano do item: ${item.damage}` : undefined,
      item.versatile_damage ? `Dano versátil: ${item.versatile_damage}` : undefined,
      item.properties?.length ? `Propriedades: ${item.properties.join(', ')}` : undefined,
      item.ammunition ? `Munição: ${item.ammunition}` : undefined,
      item.weapon_proficiency
        ? `Treino com a arma: ${{ auto: 'automático', proficient: 'proficiente', untrained: 'sem proficiência' }[item.weapon_proficiency]}`
        : undefined,
      item.weapon_attack_bonus
        ? `Bônus próprio de ataque: ${signed(item.weapon_attack_bonus)}`
        : undefined,
      item.rarity ? `Raridade: ${item.rarity}` : undefined,
      item.cost_gp !== undefined ? `Valor: ${number(item.cost_gp)} PO` : undefined,
      item.attunement
        ? `Sintonização: ${item.attuned ? 'sintonizado' : 'necessária, não sintonizado'}`
        : undefined,
      item.charges !== undefined
        ? `Cargas: ${item.charges_used ?? 0} usadas de ${item.charges}; recarga: ${{ manual: 'manual', short: 'descanso curto', long: 'descanso longo', dawn: 'amanhecer', none: 'sem recarga' }[item.recharge ?? 'manual']}`
        : undefined,
      item.tags?.length ? `Marcadores: ${item.tags.join(', ')}` : undefined,
    ]),
    item.bonuses
      ? `Bônus passivos: CA ${signed(item.bonuses.ac)}, deslocamento ${signed(item.bonuses.speed)} m, ataque ${signed(item.bonuses.attack)}, dano ${signed(item.bonuses.damage)}. Exige equipado: ${yes(item.passive_requires_equipped)}.`
      : undefined,
    item.notes,
    ...(item.functions ?? []).map(
      (f) =>
        `${f.name}: ${{ healing: 'cura', damage: 'dano', temporary: 'PV temporários', utility: 'utilidade' }[f.kind]}; ${f.dice || 'sem rolagem'}${f.damageType ? ` (${f.damageType})` : ''}; custo: ${{ action: 'ação', bonus: 'ação bônus', reaction: 'reação', free: 'livre' }[f.cost]}; alcance ${f.range} m; área ${{ single: 'alvo único', self: 'pessoal', sphere: 'esfera', cone: 'cone', line: 'linha', cube: 'cubo' }[f.shape]}, origem ${f.origin === 'self' ? 'pessoal' : 'ponto'}, tamanho ${f.size} m, largura ${f.width} m. Salvaguarda: ${f.save || 'nenhuma'}; metade no sucesso: ${yes(f.halfOnSave)}; custo de cargas ${f.charge_cost}; consome ${f.quantity_cost} unidade(s); exige equipado: ${yes(f.requires_equipped)}. ${f.note}`,
    ),
  ]);
}

function spellDetail(spell: Spell, sheet: DndSheet): string {
  const inactive = spellIsInactive(sheet, spell);
  return paragraphs([
    `${spell.name}${spell.english_name ? ` (${spell.english_name})` : ''} — ${spell.level ? `${spell.level}º círculo` : 'Truque'}; ${label(spell.class_id || sheet.class_id)}; ${inactive ? 'inativa' : spell.always_prepared ? 'sempre preparada' : spell.prepared ? 'preparada' : 'não preparada'}.`,
    unique([
      spell.school,
      spell.casting_time ? `Conjuração: ${spell.casting_time}` : undefined,
      spell.range ? `Alcance: ${spell.range}` : undefined,
      spell.duration ? `Duração: ${spell.duration}` : undefined,
      spell.components ? `Componentes: ${spell.components}` : undefined,
      spell.ritual ? 'Ritual' : undefined,
      spell.concentration ? 'Concentração' : undefined,
      spell.casting_mode === 'arcanum'
        ? 'Arcano Místico'
        : spell.casting_mode === 'bonus'
          ? 'Magia adicional'
          : undefined,
      spell.source
        ? `Fonte: ${spell.source}${spell.source_pages?.length ? `, pp. ${spell.source_pages.join(', ')}` : spell.source_page ? `, p. ${spell.source_page}` : ''}`
        : undefined,
    ]),
    spell.description,
    spell.notes,
  ]);
}

export function buildCharacterPdfModel(character: Character, context: CharacterPdfContext = {}) {
  const s = character.sheet,
    d = calculate(s),
    creation = s.creation,
    details = s.details ?? {};
  const levels = classLevels(s),
    race = getRace(s.race),
    pools = spellPools(s);
  const skills = effectiveSkills(s);
  const proficiencies = unique([
    s.languages ? `Idiomas: ${s.languages}` : undefined,
    creation?.background_languages?.length
      ? `Idiomas escolhidos: ${creation.background_languages.join(', ')}`
      : undefined,
    ...levels.flatMap((c, i) => CLASS_TRAINING[c.class_id]?.[i ? 'multi' : 'initial'] ?? []),
    creation?.background_tools?.length
      ? `Ferramentas: ${creation.background_tools.join(', ')}`
      : undefined,
    details.proficiencies,
  ]);
  const background = BACKGROUNDS.find((b) => b.id === creation?.background_id);
  const features = paragraphs([
    s.features,
    creation?.custom_background_feature ||
      (background ? `${background.feature}: ${background.description}` : undefined),
    race
      ? `${race.name}: ${race.traits.join('; ')}. Tamanho ${race.size}${race.darkvision ? `; visão no escuro ${race.darkvision} m` : ''}.`
      : undefined,
    ...levels.map((c, i) => {
      const path = pathsFor(c.class_id).find((p) => p.id === c.subclass_id);
      const choices = featureChoices(c.class_id, c.level, c.subclass_id, i === 0);
      return paragraphs([
        `${label(c.class_id)} ${c.level}${c.custom_subclass_name || path?.name ? ` — ${c.custom_subclass_name || path?.name}` : ''}`,
        ...[...classFeatures(c.class_id), ...(path?.features ?? [])]
          .filter((f) => f.level <= c.level)
          .map((f) => `${f.name} (nível ${f.level}): ${f.description}`),
        ...Object.entries(c.choices ?? {}).map(([key, ids]) => {
          const choice = choices.find((ch) => ch.id === key);
          return `${choice?.name ?? key}: ${ids
            .map((id) => {
              const option = choice?.options.find((o) => o.id === id);
              return option
                ? `${option.name}${option.description ? ` — ${option.description}` : ''}`
                : id;
            })
            .join('; ')}`;
        }),
      ]);
    }),
  ]);
  const casters = castingClasses(s).map((c) => {
    const p = castingProfile(s, c.class_id),
      ability = p.ability!;
    return {
      name: label(c.class_id),
      ability: abilityLabel(ability),
      dc: 8 + d.proficiency + d.modifiers[ability],
      attack: signed(d.proficiency + d.modifiers[ability]),
    };
  });
  const attacks = s.inventory
    .filter((i) => i.category === 'weapon' && i.quantity > 0)
    .sort((a, b) => Number(b.equipped) - Number(a.equipped))
    .map((i) => pdfAttack(i, s));
  const hitDice = Object.entries(hitDicePools(s));
  const combat = paragraphs([
    `Ataques por ação Atacar: ${d.attacks}. Condições: ${s.conditions.join(', ') || 'nenhuma'}.`,
    ...hitDice.map(
      ([id, p]) =>
        `${label(id)}: ${p.total}d${p.die}; usados ${p.used}, disponíveis ${Math.max(0, p.total - p.used)}.`,
    ),
    ...featureResources(s).map(
      (r) =>
        `${r.name}: ${s.feature_uses?.[r.id] ?? 0} usados de ${r.max >= 999 ? 'ilimitados' : r.max}; recupera em descanso ${r.rest === 'short' ? 'curto' : 'longo'}. ${r.description}`,
    ),
    pools.pactSlots
      ? `Magia de Pacto: ${pools.pactSlots} espaços do ${pools.pactLevel}º círculo; ${s.pact_slots_used ?? 0} usados. Reserva separada dos espaços de conjuração.`
      : undefined,
    ...pools.arcanumLevels.map(
      (level) =>
        `Arcano Místico ${level}º: ${s.arcanum_used?.[String(level)] ? 'usado' : 'disponível'} (1 por descanso longo).`,
    ),
    ...attacks
      .slice(3)
      .map((a) => `${a.name}: ataque ${a.bonus}, dano ${a.damage}, alcance ${a.range}.`),
  ]);
  const sections: PdfSection[] = [];
  sections.push({ title: 'Estado e recursos de combate', text: combat });
  if (context.campaignName) sections.push({ title: 'Campanha', text: context.campaignName });
  const expertise = SKILLS.filter((skill) => skills[skill.id] === 2).map(
    (skill) => `${skill.label} ${signed(d.skills[skill.id])}`,
  );
  if (expertise.length)
    sections.push({ title: 'Especializações em perícias', text: expertise.join('; ') });
  if (s.inventory.length)
    sections.push({
      title: 'Inventário completo e funções dos itens',
      text: paragraphs([
        `Peso total dos itens: ${number(s.inventory.reduce((n, i) => n + i.quantity * i.weight, 0))} kg. Moedas: ${s.currency.cp} PC; ${s.currency.sp} PP; ${s.currency.ep} PE; ${s.currency.gp} PO; ${s.currency.pp} PL.`,
        ...s.inventory.map((i) => inventoryDetail(i, s)),
      ]),
    });
  if (casters.length || s.spells.length)
    sections.push({
      title: 'Conjuração e grimório completo',
      text: paragraphs([
        ...casters.map(
          (c) => `${c.name}: atributo ${c.ability}; CD ${c.dc}; ataque mágico ${c.attack}.`,
        ),
        ...pools.slots.map(
          (total, i) =>
            `${i + 1}º círculo: ${total} espaços; ${s.slots_used[String(i + 1)] ?? 0} usados.`,
        ),
        pools.pactSlots
          ? `Pacto: ${pools.pactSlots} espaços do ${pools.pactLevel}º círculo; ${s.pact_slots_used ?? 0} usados.`
          : undefined,
        ...s.spells.map((sp) => spellDetail(sp, s)),
      ]),
    });
  const breakdown = paragraphs([
    `Pontos de vida: método ${methodLabel(s.hit_point_method)}; máximo personalizado ${s.hp_max_override ?? 'não definido'}. Bônus de CA ${signed(s.ac_bonus)}; iniciativa ${signed(s.initiative_bonus)}; deslocamento personalizado ${s.speed_override === null ? 'não definido' : `${s.speed_override} m`}.`,
    ...Object.entries(s.hit_point_rolls ?? {}).map(
      ([id, rolls]) => `PV rolados de ${label(id)}: ${rolls.join(', ')}.`,
    ),
    ...levels.flatMap((c) =>
      Object.entries(c.improvements ?? {}).map(
        ([level, improvements]) =>
          `${label(c.class_id)} ${level} — melhoria: ${Object.entries(improvements)
            .map(([a, n]) => `${abilityLabel(a)} ${signed(n ?? 0)}`)
            .join(', ')}.`,
      ),
    ),
    creation
      ? `Criação de atributos: ${methodLabel(creation.method)}. ${ABILITIES.map((a) => `${a.short}: base ${creation.base[a.id]}, bônus ${signed(creation.bonuses[a.id] ?? 0)}`).join('; ')}.`
      : undefined,
    creation?.rolls?.length
      ? `Rolagens de criação: ${creation.rolls.map((rolls) => rolls.join(' + ')).join('; ')}.`
      : undefined,
  ]);
  sections.push({ title: 'Detalhamento dos cálculos e da criação', text: breakdown });
  return {
    character,
    context,
    derived: d,
    skills,
    proficiencies,
    treasures: paragraphs([
      details.treasures,
      ...s.inventory
        .filter((i) => i.category === 'treasure')
        .map((i) => `${i.quantity} × ${i.name}${i.notes ? `: ${i.notes}` : ''}`),
    ]),
    features,
    attacks,
    casters,
    sections,
    className: levels.map((c) => `${label(c.class_id)} ${c.level}`).join(' / '),
    hitDiceTotal: hitDice.map(([, p]) => `${p.total}d${p.die}`).join(' + '),
    hitDiceRemaining: hitDice
      .map(([, p]) => `${Math.max(0, p.total - p.used)}d${p.die}`)
      .join(' + '),
    spellGroups: Array.from({ length: 10 }, (_, level) =>
      s.spells.filter((sp) => sp.level === level),
    ),
    slotTotals: pools.slots.length
      ? pools.slots
      : Array.from({ length: pools.pactLevel }, (_, i) =>
          i + 1 === pools.pactLevel ? pools.pactSlots : 0,
        ),
    slotUsed: pools.slots.length
      ? s.slots_used
      : { [String(pools.pactLevel)]: s.pact_slots_used ?? 0 },
    saveProficiencies: ABILITIES.filter(
      (a) =>
        s.saves.includes(a.id) ||
        (a.id === 'wis' && levels.some((c) => c.class_id === 'rogue' && c.level >= 15)) ||
        levels.some((c) => c.class_id === 'monk' && c.level >= 14),
    ).map((a) => a.id) as Ability[],
  };
}
