import type { Character } from '@/types';
import type { ArkanisAttribute, ArkanisSheet } from './types';

export const ARKANIS_SYSTEM_ID = '00000000-0000-4000-8000-000000000002';
export const ATTRIBUTES: { id: ArkanisAttribute; name: string }[] = [
  { id: 'for', name: 'Força' },
  { id: 'agi', name: 'Agilidade' },
  { id: 'res', name: 'Resistência' },
  { id: 'int', name: 'Inteligência' },
  { id: 'sen', name: 'Sensibilidade' },
  { id: 'pre', name: 'Presença' },
];
export const APTITUDE_GROUPS = [
  {
    name: 'Conhecimentos',
    entries: [
      ['magico', 'Mágico'],
      ['historico', 'Histórico'],
      ['religioso', 'Religioso'],
      ['logico', 'Lógico'],
      ['medico', 'Médico'],
      ['biologico', 'Biológico'],
      ['mecanico', 'Mecânico (traço anão)'],
    ],
  },
  {
    name: 'Capacidades',
    entries: [
      ['furtiva', 'Furtiva'],
      ['atletica', 'Atlética'],
      ['acrobatica', 'Acrobática'],
      ['investigativa', 'Investigativa'],
    ],
  },
  {
    name: 'Habilidades sociais',
    entries: [
      ['atuacao', 'Atuação'],
      ['persuasao', 'Persuasão'],
      ['intimidacao', 'Intimidação'],
      ['controle', 'Controle'],
    ],
  },
  {
    name: 'Sentidos',
    entries: [
      ['percepcao', 'Percepção'],
      ['intuicao', 'Intuição'],
    ],
  },
];
export const MAGIC_ORDERS = [
  { id: 'primaria', name: 'Primária' },
  { id: 'desperta', name: 'Desperta' },
  { id: 'elevada', name: 'Elevada' },
  { id: 'arcana', name: 'Arcana' },
  { id: 'suprema', name: 'Suprema' },
  { id: 'divina', name: 'Divina' },
] as const;
export const ANCESTRIES: {
  id: string;
  name: string;
  hitDie: number;
  speed: number | null;
  bonuses: Partial<Record<ArkanisAttribute, number>>;
  ark: number;
  notes: string;
}[] = [
  {
    id: 'human',
    name: 'Humano',
    hitDie: 8,
    speed: 9,
    bonuses: { int: 1 },
    ark: 0,
    notes:
      '+1 em um atributo à escolha e +1 em Inteligência. Aptidão 1 em Lógico. Determinação humana: ao cair a 0 PV, volta com 1 PV, uma vez ao dia. Vontade inquebrável: uma nova rolagem por descanso longo.',
  },
  {
    id: 'elf',
    name: 'Elfo',
    hitDie: 8,
    speed: 12,
    bonuses: { agi: 1, int: 1 },
    ark: 7,
    notes:
      'Graça estelar: +1 Agilidade, +1 Inteligência e +7 Arkano. Visão no escuro de 18 m. +2 em testes para detectar Mana, ilusões, criaturas camufladas ou efeitos ocultos.',
  },
  {
    id: 'dwarf',
    name: 'Anão',
    hitDie: 10,
    speed: 6,
    bonuses: { res: 2, for: 1 },
    ark: 0,
    notes:
      'Pele de pedra: +2 Resistência e +1 Força. Aptidão 1 em Mecânico. +1 em Mineração, Runas, Metalurgia e Geologia. Vantagem contra derrubada e para empurrar.',
  },
  {
    id: 'orc',
    name: 'Orc',
    hitDie: 12,
    speed: 9,
    bonuses: { for: 2, pre: 1 },
    ark: 0,
    notes:
      'Fúria inicial: +2 de dano físico em combate. Corpo forjado: +8 PV máximos, incluídos automaticamente uma única vez. Vantagem contra medo, paralisia e recuo forçado. Golpe brutal: +1d4 de dano corpo a corpo, uma vez por turno.',
  },
  {
    id: 'triton',
    name: 'Tritão',
    hitDie: 10,
    speed: 9,
    bonuses: { res: 1, sen: 2 },
    ark: 0,
    notes:
      'Respira na água e no ar. Visão em água turva e escuridão subaquática. Sob a água: deslocamento dobrado, vantagem nos testes físicos e voz audível até 500 m.',
  },
  {
    id: 'harpy',
    name: 'Harpia',
    hitDie: 8,
    speed: 9,
    bonuses: { agi: 2, sen: 1 },
    ark: 0,
    notes:
      'Deslocamento aéreo de 16 m. Aptidão 2 em Percepção. Visão através de neblina, poeira, tempestades e fumaça. Reduz 10 pontos de dano por queda. Confira as condições de voo no livro.',
  },
  {
    id: 'demon',
    name: 'Demônio',
    hitDie: 8,
    speed: null,
    bonuses: { res: 1, pre: 2 },
    ark: 0,
    notes:
      '+1 Reflexos. Aptidão 2 em Intimidação e vantagem em Persuasão. Resistência a fogo e necrótico. Consulte os demais traços no livro. O deslocamento é definido com o mestre.',
  },
];
const zeros = () => ({ for: 0, agi: 0, res: 0, int: 0, sen: 0, pre: 0 });
export function isArkanisSheet(value: unknown): value is ArkanisSheet {
  return Boolean(
    value && typeof value === 'object' && (value as { system?: unknown }).system === 'arkanis',
  );
}
/** The shared workspace retains its pre-existing D&D generic. Conversion is confined to this boundary. */
export function storedCharacter(character: Character<ArkanisSheet>): Character {
  return character as unknown as Character;
}
export function defaultArkanisSheet(): ArkanisSheet {
  return {
    system: 'arkanis',
    schema_version: 1,
    race: 'Humano',
    race_id: 'human',
    human_attribute: 'for',
    level: 1,
    xp: 0,
    attributes: { for: 20, agi: 19, res: 18, int: 15, sen: 14, pre: 12 },
    attribute_adjustments: zeros(),
    attribute_method: 'standard',
    attribute_rolls: [],
    arkano: { body: 0, mind: 0, spirit: 0, bonus: 0, modifier_override: null },
    hp_current: 0,
    hp_max: 0,
    hit_point_notes: '',
    mana_current: 0,
    mana_max_override: null,
    sanity_current: 10,
    sanity_max: 10,
    reflex_bonus: 0,
    speed_override: null,
    armor: { name: '', value: 0, durability_current: 0, durability_max: 0 },
    aptitudes: { logico: 1 },
    aptitude_training: {},
    inventory: [],
    weapons: [],
    grimoire: [],
    techniques: [],
    identity: { age: '', height: '', weight: '', eyes: '', hair: '', languages: '' },
    background: { origin: '', motivation: '', defining_trait: '', notes: '' },
    racial_notes: '',
    wealth: '',
    notes: '',
  };
}
export function attributeModifier(score: number) {
  const bounds = [2, 5, 8, 11, 14, 16, 19, 22, 25, 28, 30];
  const index = bounds.findIndex((bound) => score <= bound);
  return index < 0 ? 5 : index - 5;
}
/** Page 4 overlaps 75 in two bands: require an explicit ruling instead of choosing silently. */
export function arkanoModifier(value: number): number | null {
  if (value === 75) return null;
  if (value <= 20) return 0;
  if (value <= 30) return 1;
  if (value <= 50) return 2;
  if (value <= 70) return 3;
  if (value < 75) return 4;
  if (value <= 80) return 5;
  if (value <= 85) return 6;
  if (value <= 90) return 7;
  if (value <= 95) return 8;
  if (value <= 99) return 9;
  return 10;
}
export function calculateArkanis(sheet: ArkanisSheet) {
  const ancestry = ANCESTRIES.find((r) => r.id === sheet.race_id);
  const scores = Object.fromEntries(
    ATTRIBUTES.map(({ id }) => [
      id,
      sheet.attributes[id] +
        sheet.attribute_adjustments[id] +
        (ancestry?.bonuses[id] ?? 0) +
        (sheet.race_id === 'human' && sheet.human_attribute === id ? 1 : 0) +
        ((id === 'res' && sheet.arkano.body === 10) ||
        (id === 'int' && sheet.arkano.mind === 10) ||
        (id === 'pre' && sheet.arkano.spirit === 10)
          ? 1
          : 0),
    ]),
  ) as Record<ArkanisAttribute, number>;
  const arkano =
    sheet.arkano.body +
    sheet.arkano.mind +
    sheet.arkano.spirit +
    sheet.arkano.bonus +
    (ancestry?.ark ?? 0);
  const arkModifier = sheet.arkano.modifier_override ?? arkanoModifier(arkano);
  const mana =
    arkModifier === null ? null : (sheet.level * 5 + scores.int) * Math.max(1, arkModifier);
  const reflex =
    Math.floor((scores.agi + scores.sen) / 2) +
    sheet.reflex_bonus +
    (sheet.race_id === 'demon' ? 1 : 0);
  return {
    attributes: scores,
    modifiers: Object.fromEntries(
      ATTRIBUTES.map(({ id }) => [id, attributeModifier(scores[id])]),
    ) as Record<ArkanisAttribute, number>,
    arkano,
    arkModifier,
    manaMax: sheet.mana_max_override ?? mana,
    hpMax: sheet.hp_max,
    reflex,
    armorClass: reflex,
    speed: sheet.speed_override ?? ancestry?.speed ?? 0,
    hitDie: ancestry?.hitDie ?? 8,
  };
}
export function validateArkanis(character: Character<ArkanisSheet>) {
  const s = character.sheet,
    d = calculateArkanis(s),
    errors: string[] = [];
  if (!character.name.trim() || character.name.length > 120)
    errors.push('Informe um nome com até 120 caracteres.');
  if (!ANCESTRIES.some((r) => r.id === s.race_id)) errors.push('Escolha uma raça de Arkanis.');
  if (!Number.isInteger(s.level) || s.level < 1 || s.level > 100)
    errors.push('Informe um nível de 1 a 100.');
  if (
    ATTRIBUTES.some(
      ({ id }) =>
        !Number.isInteger(d.attributes[id]) || d.attributes[id] < 1 || d.attributes[id] > 30,
    )
  )
    errors.push('Os atributos finais devem estar entre 1 e 30.');
  if (
    [s.arkano.body, s.arkano.mind, s.arkano.spirit].some(
      (v) => !Number.isInteger(v) || v < 1 || v > 10,
    ) ||
    d.arkano < 1 ||
    d.arkano > 100
  )
    errors.push('Preencha Corpo, Mente e Espírito de 1 a 10 e confira o Arkano total (até 100).');
  if (d.arkModifier === null)
    errors.push('Defina com o mestre o modificador de Arkano para o valor 75.');
  if (s.hit_point_method === 'rolled' && (s.pv_rolls?.[s.race_id]?.length ?? 0) < s.level)
    errors.push('Role os PV dos níveis pendentes.');
  if (!Number.isInteger(s.hp_max) || s.hp_max < 1)
    errors.push('Defina os PV máximos com o mestre.');
  for (const [name, current, max] of [
    ['PV', s.hp_current, s.hp_max],
    ['Mana', s.mana_current, d.manaMax ?? -1],
    ['Sanidade', s.sanity_current, s.sanity_max],
    ['Durabilidade', s.armor.durability_current, s.armor.durability_max],
  ] as const)
    if (
      !Number.isInteger(current) ||
      !Number.isInteger(max) ||
      current < 0 ||
      current > max ||
      max < 0
    )
      errors.push(`Confira ${name}: o valor atual deve estar entre zero e o máximo.`);
  if (Object.values(s.aptitudes).some((v) => ![0, 1, 2, 3].includes(v)))
    errors.push('As aptidões vão de 0 a 3.');
  if (
    s.inventory.some(
      (i) =>
        !i.name.trim() ||
        !Number.isInteger(i.quantity) ||
        i.quantity < 0 ||
        i.quantity > 9999 ||
        !Number.isFinite(i.weight) ||
        i.weight < 0,
    )
  )
    errors.push('Confira os nomes, as quantidades e os pesos do inventário.');
  if (
    s.weapons.some(
      (w) =>
        !w.name.trim() ||
        ![4, 6, 8, 10, 12, 20].includes(w.die) ||
        ![1, 2, 3, 4, 5].includes(w.mastery) ||
        (w.mastery === 3 && w.dice_at_third === null),
    )
  )
    errors.push(
      'Confira as armas e escolha 3 ou 4 dados para a maestria 3, conforme a decisão do mestre.',
    );
  if (
    s.grimoire.some(
      (m) =>
        !m.name.trim() ||
        !Number.isInteger(m.learning_level) ||
        m.learning_level < 0 ||
        !MAGIC_ORDERS.some((o) => o.id === m.highest_order) ||
        Object.values(m.orders).some((o) => !Number.isInteger(o.mana) || o.mana < 0),
    )
  )
    errors.push('Confira o nome, o NA e os custos do grimório.');
  if (
    s.techniques.some(
      (t) => !t.name.trim() || !Number.isInteger(t.learning_level) || t.learning_level < 0,
    )
  )
    errors.push('Confira o nome e o NA das técnicas.');
  return errors;
}

export const RACIAL_APTITUDES: Record<string, Record<string, import('./types').AptitudeRank>> = {
  human: { logico: 1 },
  dwarf: { mecanico: 1 },
  harpy: { percepcao: 2 },
  demon: { intimidacao: 2 },
};
export function applyRacialAptitudes(sheet: ArkanisSheet): ArkanisSheet {
  const training = { ...(sheet.aptitude_training ?? sheet.aptitudes) };
  if (!sheet.aptitude_training)
    for (const [id, rank] of Object.entries(RACIAL_APTITUDES[sheet.race_id] ?? {})) {
      if (training[id] === rank) delete training[id];
    }
  const aptitudes = { ...training };
  for (const [id, rank] of Object.entries(RACIAL_APTITUDES[sheet.race_id] ?? {}))
    aptitudes[id] = Math.max(aptitudes[id] ?? 0, rank) as import('./types').AptitudeRank;
  return { ...sheet, aptitude_training: training, aptitudes };
}
export function arkanisPv(sheet: ArkanisSheet) {
  const stats = calculateArkanis(sheet);
  const bonus = sheet.race_id === 'orc' ? stats.attributes.res : stats.modifiers.res;
  const rolls = sheet.pv_rolls?.[sheet.race_id] ?? [];
  const dice =
    sheet.hit_point_method === 'rolled'
      ? rolls.slice(0, sheet.level).reduce((a, b) => a + b, 0)
      : stats.hitDie * sheet.level;
  return Math.max(1, dice + bonus * sheet.level + (sheet.race_id === 'orc' ? 8 : 0));
}
export function syncArkanis(sheet: ArkanisSheet, method: 'maximum' | 'rolled'): ArkanisSheet {
  const next = applyRacialAptitudes({ ...sheet, hit_point_method: method });
  next.hp_max = arkanisPv(next);
  next.hp_current = Math.min(next.hp_current, next.hp_max);
  return next;
}
