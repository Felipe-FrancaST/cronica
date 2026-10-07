import type { Ability, CharacterCreation, DndSheet, InventoryItem } from './types';
import { ABILITIES, EQUIPMENT, SKILLS } from './catalog';
import { CLASS_TRAINING } from './progression-catalog';
import { classLevels, withClassLevels } from './progression';
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
export const pointCost = (base: Record<Ability, number>) =>
  Object.values(base).reduce((n, v) => n + (POINT_COST[v] ?? 100), 0);
export const LANGUAGES = [
  'Comum',
  'Anão',
  'Élfico',
  'Gigante',
  'Gnômico',
  'Goblin',
  'Halfling',
  'Orc',
  'Abissal',
  'Celestial',
  'Dracônico',
  'Infernal',
  'Primordial',
  'Silvestre',
  'Subcomum',
];
export const TOOLS = [
  'Ferramentas de ladrão',
  'Ferramentas de ferreiro',
  'Ferramentas de carpinteiro',
  'Ferramentas de cozinheiro',
  'Ferramentas de tecelão',
  'Ferramentas de pedreiro',
  'Ferramentas de cartógrafo',
  'Kit de herbalismo',
  'Dados de jogo',
  'Baralho',
  'Alaúde',
  'Flauta',
  'Tambor',
  'Veículos terrestres',
  'Veículos aquáticos',
];
export interface BackgroundDefinition {
  id: string;
  name: string;
  skills: string[];
  tools: string[];
  languages: number;
  toolChoices: number;
  gp: number;
  items: string[];
  feature: string;
  description: string;
  source: string;
}
export const BACKGROUNDS: BackgroundDefinition[] = [
  {
    id: 'acolyte',
    name: 'Acólito',
    skills: ['insight', 'religion'],
    tools: [],
    languages: 2,
    toolChoices: 0,
    gp: 15,
    items: [
      'Símbolo sagrado',
      'Livro de orações',
      'Incenso (5 varetas)',
      'Vestes religiosas',
      'Roupas comuns',
      'Bolsa',
    ],
    feature: 'Abrigo dos fiéis',
    description:
      'Templos e pessoas da mesma fé podem oferecer cuidado e sustento. Componentes com custo continuam necessários; ajuda perigosa depende do mestre.',
    source: 'SRD 5.1',
  },
  {
    id: 'criminal',
    name: 'Criminoso',
    skills: ['deception', 'stealth'],
    tools: ['Ferramentas de ladrão'],
    languages: 0,
    toolChoices: 1,
    gp: 15,
    items: ['Pé de cabra', 'Roupas escuras com capuz', 'Bolsa'],
    feature: 'Contato criminoso',
    description:
      'Você mantém um contato confiável para trocar informações e mensagens na rede criminosa.',
    source: 'Regras Básicas 2014',
  },
  {
    id: 'folk-hero',
    name: 'Herói do Povo',
    skills: ['animal_handling', 'survival'],
    tools: ['Veículos terrestres'],
    languages: 0,
    toolChoices: 1,
    gp: 10,
    items: ['Ferramentas de artesão escolhidas', 'Pá', 'Panela de ferro', 'Roupas comuns', 'Bolsa'],
    feature: 'Hospitalidade rústica',
    description:
      'Pessoas comuns podem oferecer esconderijo e descanso, desde que você não as coloque em perigo.',
    source: 'Regras Básicas 2014',
  },
  {
    id: 'noble',
    name: 'Nobre',
    skills: ['history', 'persuasion'],
    tools: [],
    languages: 1,
    toolChoices: 1,
    gp: 25,
    items: ['Roupas finas', 'Anel de sinete', 'Documento de linhagem', 'Bolsa'],
    feature: 'Posição de privilégio',
    description:
      'Sua posição facilita contato com a nobreza e acesso a círculos sociais; o mestre determina a influência na campanha.',
    source: 'Regras Básicas 2014',
  },
  {
    id: 'sage',
    name: 'Sábio',
    skills: ['arcana', 'history'],
    tools: [],
    languages: 2,
    toolChoices: 0,
    gp: 10,
    items: ['Tinta preta', 'Pena', 'Faca pequena', 'Carta de um colega', 'Roupas comuns', 'Bolsa'],
    feature: 'Pesquisador',
    description:
      'Quando não conhece uma informação, costuma saber onde ou com quem pesquisá-la. Encontrar segredos pode exigir uma aventura.',
    source: 'Regras Básicas 2014',
  },
  {
    id: 'soldier',
    name: 'Soldado',
    skills: ['athletics', 'intimidation'],
    tools: ['Veículos terrestres'],
    languages: 0,
    toolChoices: 1,
    gp: 10,
    items: [
      'Insígnia de patente',
      'Troféu de guerra',
      'Conjunto de jogo escolhido',
      'Roupas comuns',
      'Bolsa',
    ],
    feature: 'Patente militar',
    description:
      'Membros da sua antiga organização podem reconhecer sua patente e facilitar acesso a instalações e recursos, conforme o mestre.',
    source: 'Regras Básicas 2014',
  },
  {
    id: 'custom',
    name: 'Antecedente personalizado',
    skills: [],
    tools: [],
    languages: 0,
    toolChoices: 2,
    gp: 0,
    items: [],
    feature: 'Habilidade acordada com o mestre',
    description:
      'Escolha duas perícias e um total de dois idiomas ou ferramentas. Equipamento, moedas e habilidade narrativa são definidos com o mestre.',
    source: 'SRD 5.1 · personalização',
  },
];
export const RACE_BONUSES: Record<string, Partial<Record<Ability, number>>> = {
  Humano: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  'Anão da colina': { con: 2, wis: 1 },
  'Anão da montanha': { con: 2, str: 2 },
  'Alto elfo': { dex: 2, int: 1 },
  'Elfo da floresta': { dex: 2, wis: 1 },
  'Halfling pés-leves': { dex: 2, cha: 1 },
  'Halfling robusto': { dex: 2, con: 1 },
  Draconato: { str: 2, cha: 1 },
  'Gnomo da floresta': { int: 2, dex: 1 },
  'Gnomo das rochas': { int: 2, con: 1 },
  'Meio-orc': { str: 2, con: 1 },
  Tiefling: { int: 1, cha: 2 },
};
export function newCreation(): CharacterCreation {
  return {
    method: 'standard',
    base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    bonuses: {},
    class_skills: [],
    background_skills: [],
    background_languages: [],
    background_tools: [],
  };
}
export function rollAbilities(
  d6 = () => {
    const bytes = new Uint32Array(1);
    let n: number;
    do {
      crypto.getRandomValues(bytes);
      n = bytes[0];
    } while (n >= 4294967292);
    return (n % 6) + 1;
  },
) {
  const rolls = Array.from({ length: 6 }, () => Array.from({ length: 4 }, d6));
  return { rolls, scores: rolls.map((r) => r.reduce((n, v) => n + v, 0) - Math.min(...r)) };
}
export function withCreation(sheet: DndSheet, creation: CharacterCreation): DndSheet {
  if (creation.method === 'manual') return { ...sheet, creation, abilities: { ...creation.base } };
  return withClassLevels({ ...sheet, creation }, classLevels(sheet));
}
export function selectBackground(sheet: DndSheet, id: string): DndSheet {
  const bg = BACKGROUNDS.find((b) => b.id === id);
  if (!bg || sheet.creation?.equipment_applied) return sheet;
  const c = sheet.creation ?? newCreation();
  return withCreation(sheet, {
    ...c,
    background_id: id,
    background_skills: [...bg.skills],
    background_languages: [],
    background_tools: [],
  });
}
// These are concrete starting-package choices. Secondary classes never grant
// starting equipment; the player may replace these choices before applying.
export const STARTER_PACKS: Record<string, string[][]> = {
  fighter: [
    [
      'Cota de malha',
      'Espada longa',
      'Escudo',
      'Besta leve',
      'Virotes (20)',
      'Pacote de explorador',
    ],
    [
      'Armadura de couro',
      'Arco longo',
      'Flechas (20)',
      'Espada longa',
      'Escudo',
      'Pacote de explorador',
    ],
  ],
  barbarian: [['Machado grande', 'Machadinha (2)', 'Azagaia (4)', 'Pacote de explorador']],
  bard: [['Rapieira', 'Armadura de couro', 'Adaga', 'Alaúde', 'Pacote de artista']],
  cleric: [
    [
      'Maça',
      'Cota de escamas',
      'Besta leve',
      'Virotes (20)',
      'Escudo',
      'Símbolo sagrado',
      'Pacote de sacerdote',
    ],
    ['Maça', 'Armadura de couro', 'Clava', 'Escudo', 'Símbolo sagrado', 'Pacote de sacerdote'],
  ],
  druid: [
    [
      'Escudo de madeira',
      'Cimitarra',
      'Armadura de couro',
      'Foco druídico',
      'Pacote de explorador',
    ],
  ],
  monk: [['Espada curta', 'Dardo (10)', 'Pacote de explorador']],
  paladin: [
    [
      'Espada longa',
      'Escudo',
      'Azagaia (5)',
      'Cota de malha',
      'Símbolo sagrado',
      'Pacote de sacerdote',
    ],
  ],
  ranger: [
    ['Cota de escamas', 'Espada curta (2)', 'Arco longo', 'Flechas (20)', 'Pacote de explorador'],
    ['Armadura de couro', 'Espada curta (2)', 'Arco longo', 'Flechas (20)', 'Pacote de explorador'],
  ],
  rogue: [
    [
      'Rapieira',
      'Arco curto',
      'Flechas (20)',
      'Armadura de couro',
      'Adaga (2)',
      'Ferramentas de ladrão',
      'Pacote de assaltante',
    ],
  ],
  sorcerer: [['Besta leve', 'Virotes (20)', 'Foco arcano', 'Adaga (2)', 'Pacote de explorador']],
  warlock: [
    [
      'Besta leve',
      'Virotes (20)',
      'Foco arcano',
      'Armadura de couro',
      'Adaga (2)',
      'Clava',
      'Pacote de estudioso',
    ],
  ],
  wizard: [['Bordão', 'Foco arcano', 'Grimório', 'Pacote de estudioso']],
  artificer: [],
};
const gear: Record<string, Partial<InventoryItem>> = {
  Rapieira: { category: 'weapon', damage: '1d8 perfurante', notes: 'Acuidade', weight: 1 },
  'Espada curta': {
    category: 'weapon',
    damage: '1d6 perfurante',
    notes: 'Acuidade, leve',
    weight: 1,
  },
  'Besta leve': {
    category: 'weapon',
    damage: '1d8 perfurante',
    weapon_mode: 'ranged',
    weapon_range: 24,
    weight: 2.5,
  },
  'Arco longo': {
    category: 'weapon',
    damage: '1d8 perfurante',
    weapon_mode: 'ranged',
    weapon_range: 45,
    weight: 1,
  },
  Maça: { category: 'weapon', damage: '1d6 concussão', weight: 2 },
  Cimitarra: { category: 'weapon', damage: '1d6 cortante', notes: 'Acuidade, leve', weight: 1.5 },
  Bordão: { category: 'weapon', damage: '1d6 concussão', notes: 'Versátil 1d8', weight: 2 },
  Clava: { category: 'weapon', damage: '1d4 concussão', weight: 1 },
  Azagaia: { category: 'weapon', damage: '1d6 perfurante', notes: 'Arremesso 9/36 m', weight: 1 },
  Machadinha: {
    category: 'weapon',
    damage: '1d6 cortante',
    notes: 'Leve, arremesso 6/18 m',
    weight: 1,
  },
  Dardo: {
    category: 'weapon',
    damage: '1d4 perfurante',
    notes: 'Acuidade, arremesso',
    weight: 0.1,
  },
  'Cota de escamas': {
    category: 'armor',
    armor_base: 14,
    armor_type: 'medium',
    notes: 'Desvantagem em Furtividade',
    weight: 22.5,
  },
  'Escudo de madeira': { category: 'armor', armor_type: 'shield', weight: 3 },
};
export function applyStartingEquipment(
  sheet: DndSheet,
  packIndex: number,
  idFactory: () => string,
): DndSheet {
  const c = sheet.creation;
  if (!c || c.equipment_applied) throw new Error('O equipamento inicial já foi aplicado.');
  const bg = BACKGROUNDS.find((b) => b.id === c.background_id);
  if (!bg) throw new Error('Escolha um antecedente.');
  const names = [...(STARTER_PACKS[sheet.class_id]?.[packIndex] ?? []), ...bg.items];
  const items = names.map((text) => {
    const name = text.replace(/ \(\d+\)$/, '');
    const amount = Number(text.match(/\((\d+)\)$/)?.[1] ?? 1);
    const base = EQUIPMENT.find((i) => i.name === name) ?? gear[name] ?? {};
    return {
      name,
      category: 'gear',
      weight: 0,
      equipped: false,
      notes: 'Equipamento inicial',
      ...base,
      quantity: amount,
      id: idFactory(),
    } as InventoryItem;
  });
  return {
    ...sheet,
    creation: { ...c, equipment_applied: true },
    inventory: [...sheet.inventory, ...items],
    currency: { ...sheet.currency, gp: sheet.currency.gp + bg.gp },
  };
}
export function creationErrors(sheet: DndSheet): string[] {
  const c = sheet.creation;
  if (!c) return [];
  const errors: string[] = [];
  if (!['standard', 'point-buy', 'rolled', 'manual'].includes(c.method))
    errors.push('Escolha um método válido de atributos.');
  const values = Object.values(c.base ?? {}),
    sort = (v: number[]) => [...v].sort((a, b) => a - b).join(',');
  if (
    ABILITIES.some(
      (a) => !Number.isInteger(c.base?.[a.id]) || c.base[a.id] < 1 || c.base[a.id] > 30,
    )
  )
    errors.push('Confira os atributos iniciais.');
  if (c.method === 'standard' && sort(values) !== sort(STANDARD_ARRAY))
    errors.push('Distribua cada valor do conjunto padrão exatamente uma vez.');
  if (
    c.method === 'point-buy' &&
    (values.some((v) => !(v in POINT_COST)) || pointCost(c.base) > 27)
  )
    errors.push('Compra de pontos: valores de 8 a 15 e orçamento de 27 pontos.');
  if (c.method === 'rolled') {
    if (
      c.rolls?.length !== 6 ||
      c.rolls.some(
        (r) => r.length !== 4 || r.some((v) => !Number.isInteger(v) || v < 1 || v > 6),
      ) ||
      sort(values) !==
        sort((c.rolls ?? []).map((r) => r.reduce((n, v) => n + v, 0) - Math.min(...r)))
    )
      errors.push('Distribua os seis resultados de 4d6, descartando o menor dado.');
  }
  if (
    Object.entries(c.bonuses ?? {}).some(
      ([a, n]) =>
        !ABILITIES.some((x) => x.id === a) ||
        !Number.isInteger(n) ||
        Number(n) < 0 ||
        Number(n) > 2,
    )
  )
    errors.push('Confira os bônus de origem.');
  if (
    c.method !== 'manual' &&
    ABILITIES.some((a) => withCreation(sheet, c).abilities[a.id] !== sheet.abilities[a.id])
  )
    errors.push(
      'Os atributos finais devem corresponder à base, aos bônus e às melhorias da classe.',
    );
  const bg = BACKGROUNDS.find((b) => b.id === c.background_id);
  if (c.background_id && !bg) errors.push('Escolha um antecedente válido.');
  if (bg) {
    const skills = c.background_skills ?? [];
    if (
      skills.length > 2 ||
      new Set(skills).size !== skills.length ||
      skills.some((id) => !SKILLS.some((s) => s.id === id))
    )
      errors.push('Escolha até duas perícias distintas de antecedente.');
    const langs = c.background_languages ?? [],
      tools = c.background_tools ?? [];
    if (
      new Set(langs).size !== langs.length ||
      new Set(tools).size !== tools.length ||
      langs.some((l) => !LANGUAGES.includes(l)) ||
      tools.some((t) => !TOOLS.includes(t)) ||
      langs.length > (bg.id === 'custom' ? 2 : bg.languages) ||
      tools.length > (bg.id === 'custom' ? 2 : bg.toolChoices) ||
      (bg.id === 'custom' && langs.length + tools.length > 2)
    )
      errors.push('Confira os idiomas e ferramentas do antecedente.');
  }
  const trained = c.class_skills ?? [];
  if (
    new Set(trained).size !== trained.length ||
    trained.length > (CLASS_TRAINING[sheet.class_id]?.count ?? 0) ||
    trained.some((id) => !CLASS_TRAINING[sheet.class_id]?.skills.includes(id))
  )
    errors.push('Confira as perícias da classe inicial.');
  return errors;
}
