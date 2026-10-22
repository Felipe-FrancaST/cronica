export const ARTISAN_TOOLS = [
  'Suprimentos de alquimista',
  'Suprimentos de cervejeiro',
  'Suprimentos de calígrafo',
  'Ferramentas de carpinteiro',
  'Ferramentas de cartógrafo',
  'Ferramentas de sapateiro',
  'Utensílios de cozinheiro',
  'Ferramentas de vidreiro',
  'Ferramentas de joalheiro',
  'Ferramentas de coureiro',
  'Ferramentas de pedreiro',
  'Suprimentos de pintor',
  'Ferramentas de oleiro',
  'Ferramentas de ferreiro',
  'Ferramentas de funileiro',
  'Ferramentas de tecelão',
  'Ferramentas de entalhador',
];
export const GAMING_SETS = [
  'Dados de jogo',
  'Baralho',
  'Xadrez de dragão',
  'Jogo dos três dragões',
];
export const MUSICAL_INSTRUMENTS = [
  'Gaita de foles',
  'Tambor',
  'Dulcimer',
  'Flauta',
  'Alaúde',
  'Lira',
  'Trompa',
  'Flauta de pã',
  'Oboé',
  'Violino',
];
export const TOOLS = [
  ...ARTISAN_TOOLS,
  ...GAMING_SETS,
  ...MUSICAL_INSTRUMENTS,
  'Ferramentas de ladrão',
  'Kit de disfarce',
  'Kit de falsificação',
  'Kit de herbalismo',
  'Ferramentas de navegador',
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
  toolKind?: 'artisan' | 'gaming' | 'instrument' | 'artisan-or-navigator' | 'any';
  variantOf?: string;
}
const BASIC_BACKGROUNDS: BackgroundDefinition[] = [
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

const phb = (
  id: string,
  name: string,
  skills: string[],
  tools: string[],
  languages: number,
  toolChoices: number,
  gp: number,
  items: string[],
  feature: string,
  description: string,
  toolKind?: BackgroundDefinition['toolKind'],
): BackgroundDefinition => ({
  id,
  name,
  skills,
  tools,
  languages,
  toolChoices,
  gp,
  items,
  feature,
  description,
  source: 'Livro do Jogador (2014)',
  toolKind,
});
const MORE_BACKGROUNDS: BackgroundDefinition[] = [
  phb(
    'charlatan',
    'Charlatão',
    ['deception', 'sleight_of_hand'],
    ['Kit de disfarce', 'Kit de falsificação'],
    0,
    0,
    15,
    ['Roupas finas', 'Kit de disfarce', 'Instrumentos de trapaça escolhidos', 'Bolsa'],
    'Identidade falsa',
    'Possui uma segunda identidade e sabe falsificar documentos ligados à sua especialidade.',
  ),
  phb(
    'entertainer',
    'Artista',
    ['acrobatics', 'performance'],
    ['Kit de disfarce'],
    0,
    1,
    15,
    ['Instrumento musical escolhido', 'Presente de admirador', 'Traje de apresentação', 'Bolsa'],
    'Pela demanda popular',
    'Pode conseguir hospedagem e comida ao se apresentar em estabelecimentos que recebam artistas.',
    'instrument',
  ),
  phb(
    'guild-artisan',
    'Artesão de Guilda',
    ['insight', 'persuasion'],
    [],
    1,
    1,
    15,
    ['Ferramentas de artesão escolhidas', 'Carta da guilda', 'Roupas de viajante', 'Bolsa'],
    'Membro de guilda',
    'A guilda oferece contatos e apoio profissional; compromissos e contribuições continuam dependendo da organização.',
    'artisan',
  ),
  phb(
    'hermit',
    'Eremita',
    ['medicine', 'religion'],
    ['Kit de herbalismo'],
    1,
    0,
    5,
    [
      'Estojo de pergaminhos com anotações',
      'Cobertor de inverno',
      'Roupas comuns',
      'Kit de herbalismo',
    ],
    'Descoberta',
    'Guarda uma descoberta importante, definida com o mestre e ligada à história da campanha.',
  ),
  phb(
    'outlander',
    'Forasteiro',
    ['athletics', 'survival'],
    [],
    1,
    1,
    10,
    ['Bordão', 'Armadilha de caça', 'Troféu de caça', 'Roupas de viajante', 'Bolsa'],
    'Andarilho',
    'Tem boa memória de mapas e pode buscar alimento e água para o grupo quando o terreno oferece esses recursos.',
    'instrument',
  ),
  phb(
    'sailor',
    'Marinheiro',
    ['athletics', 'perception'],
    ['Ferramentas de navegador', 'Veículos aquáticos'],
    0,
    0,
    10,
    ['Clava', 'Corda de seda (15 m)', 'Amuleto da sorte', 'Roupas comuns', 'Bolsa'],
    'Passagem de navio',
    'Pode negociar passagem para si e seus companheiros, normalmente ajudando a tripulação durante a viagem.',
  ),
  phb(
    'urchin',
    'Órfão',
    ['sleight_of_hand', 'stealth'],
    ['Kit de disfarce', 'Ferramentas de ladrão'],
    0,
    0,
    10,
    [
      'Faca pequena',
      'Mapa da cidade natal',
      'Rato de estimação',
      'Lembrança dos pais',
      'Roupas comuns',
      'Bolsa',
    ],
    'Segredos da cidade',
    'Conhece atalhos urbanos e caminhos que facilitam deslocamentos fora de combate.',
  ),
];
const origins = [...BASIC_BACKGROUNDS.filter((b) => b.id !== 'custom'), ...MORE_BACKGROUNDS].map(
  (b) => ({
    ...b,
    toolKind:
      b.toolKind ??
      ((['criminal', 'soldier', 'noble'].includes(b.id)
        ? 'gaming'
        : b.id === 'folk-hero'
          ? 'artisan'
          : 'any') as BackgroundDefinition['toolKind']),
  }),
);
const variant = (
  base: string,
  id: string,
  name: string,
  feature?: string,
  description?: string,
): BackgroundDefinition => {
  const b = origins.find((b) => b.id === base)!;
  return {
    ...b,
    id,
    name,
    variantOf: base,
    source: 'Livro do Jogador (2014) · variante',
    feature: feature ?? b.feature,
    description: description ?? b.description,
  };
};
export const BACKGROUNDS: BackgroundDefinition[] = [
  ...origins,
  variant('criminal', 'spy', 'Espião'),
  variant('entertainer', 'gladiator', 'Gladiador'),
  {
    ...variant('guild-artisan', 'guild-merchant', 'Mercador de Guilda'),
    toolKind: 'artisan-or-navigator',
    items: ['Equipamento de mercador escolhido', 'Carta da guilda', 'Roupas de viajante', 'Bolsa'],
  },
  variant(
    'noble',
    'knight',
    'Cavaleiro',
    'Serviçais',
    'Pode ter três serviçais que ajudam fora de combate. Combine os nomes e os limites de atuação com o mestre.',
  ),
  variant(
    'sailor',
    'pirate',
    'Pirata',
    'Má reputação',
    'Sua reputação intimida pessoas comuns; a reação das autoridades e das vítimas continua a cargo do mestre.',
  ),
  { ...BASIC_BACKGROUNDS.find((b) => b.id === 'custom')!, toolKind: 'any' },
];
export function backgroundTools(bg: BackgroundDefinition): string[] {
  return bg.toolKind === 'artisan'
    ? ARTISAN_TOOLS
    : bg.toolKind === 'gaming'
      ? GAMING_SETS
      : bg.toolKind === 'instrument'
        ? MUSICAL_INSTRUMENTS
        : bg.toolKind === 'artisan-or-navigator'
          ? [...ARTISAN_TOOLS, 'Ferramentas de navegador']
          : TOOLS;
}
export function backgroundFor(sheet: {
  background: string;
  creation?: { background_id?: string };
}) {
  return (
    BACKGROUNDS.find((b) => b.id === sheet.creation?.background_id) ??
    BACKGROUNDS.find(
      (b) =>
        b.name.toLocaleLowerCase('pt-BR') === sheet.background.trim().toLocaleLowerCase('pt-BR'),
    )
  );
}
