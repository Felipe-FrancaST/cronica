import type { DndSheet, InventoryItem } from './types';
import { ITEM_CATALOG } from './items';
import {
  ARTISAN_TOOLS,
  BACKGROUNDS,
  GAMING_SETS,
  MUSICAL_INSTRUMENTS,
  backgroundFor,
} from './backgrounds';

export interface StartingItem {
  name: string;
  quantity: number;
  data: Partial<InventoryItem>;
}
export interface EquipmentOption {
  id: string;
  name: string;
  items: StartingItem[];
  picks?: { id: string; label: string; count: number; options: StartingItem[] }[];
}
export interface EquipmentChoice {
  id: string;
  label: string;
  options: EquipmentOption[];
}
export interface StartingEquipment {
  fixed: StartingItem[];
  choices: EquipmentChoice[];
}
const item = (id: string, quantity = 1): StartingItem => {
  const data = ITEM_CATALOG.find((i) => i.catalog_id === id);
  if (!data) throw new Error(`Item inicial ausente: ${id}`);
  return { name: data.name, quantity, data };
};
const gear = (
  name: string,
  quantity = 1,
  weight = 0,
  category: InventoryItem['category'] = 'gear',
): StartingItem => ({
  name,
  quantity,
  data: { name, weight, category, notes: 'Equipamento inicial · Livro do Jogador (2014)' },
});
const option = (
  id: string,
  name: string,
  items: StartingItem[],
  picks?: EquipmentOption['picks'],
): EquipmentOption => ({ id, name, items, picks });
const choice = (id: string, label: string, options: EquipmentOption[]): EquipmentChoice => ({
  id,
  label,
  options,
});
const simple = (melee = false) =>
  ITEM_CATALOG.filter(
    (i) =>
      i.category === 'weapon' &&
      i.weapon_type === 'simple' &&
      (!melee || i.weapon_mode === 'melee'),
  ).map((i) => item(i.catalog_id));
const martial = (melee = false) =>
  ITEM_CATALOG.filter(
    (i) =>
      i.category === 'weapon' &&
      i.weapon_type === 'martial' &&
      (!melee || i.weapon_mode === 'melee'),
  ).map((i) => item(i.catalog_id));
const pick = (id: string, label: string, options: StartingItem[], count = 1): EquipmentOption =>
  option(id, label, [], [{ id, label, count, options }]);
const instrument = MUSICAL_INSTRUMENTS.map((n) => gear(n, 1, 1, 'tool'));
const packs: Record<string, StartingItem[]> = {
  explorer: [
    item('backpack'),
    item('bedroll'),
    gear('Kit de refeição', 1, 0.5),
    item('tinderbox'),
    item('torch', 10),
    item('rations', 10),
    item('waterskin'),
    item('rope'),
  ],
  dungeoneer: [
    item('backpack'),
    gear('Pé de cabra', 1, 2.5),
    gear('Martelo', 1, 1.5),
    gear('Píton', 10, 0.125),
    item('torch', 10),
    item('tinderbox'),
    item('rations', 10),
    item('waterskin'),
    item('rope'),
  ],
  burglar: [
    item('backpack'),
    gear('Bolsa com 1.000 esferas de metal', 1, 1),
    gear('Barbante (3 m)'),
    gear('Sino'),
    gear('Vela', 5),
    gear('Pé de cabra', 1, 2.5),
    gear('Martelo', 1, 1.5),
    gear('Píton', 10, 0.125),
    item('lantern'),
    item('oil', 2),
    item('rations', 5),
    item('tinderbox'),
    item('waterskin'),
    item('rope'),
  ],
  entertainer: [
    item('backpack'),
    item('bedroll'),
    gear('Traje de apresentação', 2, 2),
    gear('Vela', 5),
    item('rations', 5),
    item('waterskin'),
    item('disguise-kit'),
  ],
  diplomat: [
    item('chest'),
    gear('Estojo de mapas ou pergaminhos', 2, 0.5, 'container'),
    gear('Roupas finas', 1, 3),
    gear('Tinta (frasco)'),
    gear('Caneta tinteiro'),
    gear('Lâmpada', 1, 0.5),
    item('oil', 2),
    gear('Folha de papel', 5),
    gear('Perfume (frasco)'),
    gear('Cera de lacre'),
    gear('Sabão'),
  ],
  priest: [
    item('backpack'),
    gear('Cobertor', 1, 1.5),
    gear('Vela', 10),
    item('tinderbox'),
    gear('Caixa de esmolas'),
    gear('Bloco de incenso', 2),
    gear('Incensário'),
    gear('Vestes religiosas', 1, 2),
    item('rations', 2),
    item('waterskin'),
  ],
  scholar: [
    item('backpack'),
    item('book'),
    gear('Tinta (frasco)'),
    gear('Caneta tinteiro'),
    gear('Folha de pergaminho', 10),
    gear('Saquinho de areia'),
    gear('Faca pequena'),
  ],
};
export const PACK_NAMES: Record<string, string> = {
  explorer: 'Pacote de explorador',
  dungeoneer: 'Pacote de aventureiro',
  burglar: 'Pacote de assaltante',
  entertainer: 'Pacote de artista',
  diplomat: 'Pacote de diplomata',
  priest: 'Pacote de sacerdote',
  scholar: 'Pacote de estudioso',
};
const pack = (id: string) => option(id, PACK_NAMES[id], packs[id]);
const packChoice = (...ids: string[]) => choice('pack', 'Pacote de aventura', ids.map(pack));
const arcane = () =>
  choice('focus', 'Componentes ou foco arcano', [
    option('pouch', 'Bolsa de componentes', [item('component-pouch')]),
    option('focus', 'Foco arcano', [item('arcane-focus')]),
  ]);
const crossbow = () =>
  option('crossbow', 'Besta leve e 20 virotes', [item('light-crossbow'), item('bolt', 20)]);
export const CLASS_STARTING_EQUIPMENT: Record<string, StartingEquipment> = {
  barbarian: {
    fixed: [...packs.explorer, item('javelin', 4)],
    choices: [
      choice('weapon', 'Arma principal', [
        option('greataxe', 'Machado grande', [item('greataxe')]),
        pick('martial', 'Qualquer arma marcial corpo a corpo', martial(true)),
      ]),
      choice('secondary', 'Arma secundária', [
        option('handaxes', 'Duas machadinhas', [item('handaxe', 2)]),
        pick('simple', 'Qualquer arma simples', simple()),
      ]),
    ],
  },
  bard: {
    fixed: [item('leather'), item('dagger')],
    choices: [
      choice('weapon', 'Arma principal', [
        option('rapier', 'Rapieira', [item('rapier')]),
        option('longsword', 'Espada longa', [item('longsword')]),
        pick('simple', 'Qualquer arma simples', simple()),
      ]),
      packChoice('diplomat', 'entertainer'),
      choice('instrument', 'Instrumento musical', [
        option('lute', 'Alaúde', [item('lute')]),
        pick('other', 'Outro instrumento musical', instrument),
      ]),
    ],
  },
  cleric: {
    fixed: [item('shield'), item('holy-symbol')],
    choices: [
      choice('weapon', 'Arma principal', [
        option('mace', 'Maça', [item('mace')]),
        option('warhammer', 'Martelo de guerra (se proficiente)', [item('warhammer')]),
      ]),
      choice('armor', 'Armadura', [
        option('scale', 'Cota de escamas (brunea)', [item('scale-mail')]),
        option('leather', 'Armadura de couro', [item('leather')]),
        option('chain', 'Cota de malha (se proficiente)', [item('chain-mail')]),
      ]),
      choice('secondary', 'Arma adicional', [
        crossbow(),
        pick('simple', 'Qualquer arma simples', simple()),
      ]),
      packChoice('priest', 'explorer'),
    ],
  },
  druid: {
    fixed: [item('leather'), item('druidic-focus'), ...packs.explorer],
    choices: [
      choice('shield', 'Escudo ou arma', [
        option('wood-shield', 'Escudo de madeira', [
          {
            ...item('shield'),
            name: 'Escudo de madeira',
            data: { ...item('shield').data, name: 'Escudo de madeira', notes: 'Escudo de madeira' },
          },
        ]),
        pick('simple', 'Qualquer arma simples', simple()),
      ]),
      choice('weapon', 'Arma principal', [
        option('scimitar', 'Cimitarra', [item('scimitar')]),
        pick('simple-melee', 'Qualquer arma simples corpo a corpo', simple(true)),
      ]),
    ],
  },
  fighter: {
    fixed: [],
    choices: [
      choice('armor', 'Armadura e equipamento de proteção', [
        option('chain', 'Cota de malha', [item('chain-mail')]),
        option('leather-bow', 'Couro, arco longo e 20 flechas', [
          item('leather'),
          item('longbow'),
          item('arrow', 20),
        ]),
      ]),
      choice('weapon', 'Armamento marcial', [
        option(
          'shield',
          'Uma arma marcial e escudo',
          [item('shield')],
          [{ id: 'martial', label: 'Arma marcial', count: 1, options: martial() }],
        ),
        pick('two-martial', 'Duas armas marciais', martial(), 2),
      ]),
      choice('secondary', 'Arma adicional', [
        crossbow(),
        option('handaxes', 'Duas machadinhas', [item('handaxe', 2)]),
      ]),
      packChoice('dungeoneer', 'explorer'),
    ],
  },
  monk: {
    fixed: [item('dart', 10)],
    choices: [
      choice('weapon', 'Arma principal', [
        option('shortsword', 'Espada curta', [item('shortsword')]),
        pick('simple', 'Qualquer arma simples', simple()),
      ]),
      packChoice('dungeoneer', 'explorer'),
    ],
  },
  paladin: {
    fixed: [item('chain-mail'), item('holy-symbol')],
    choices: [
      choice('weapon', 'Armamento marcial', [
        option(
          'shield',
          'Uma arma marcial e escudo',
          [item('shield')],
          [{ id: 'martial', label: 'Arma marcial', count: 1, options: martial() }],
        ),
        pick('two-martial', 'Duas armas marciais', martial(), 2),
      ]),
      choice('secondary', 'Arma adicional', [
        option('javelins', 'Cinco azagaias', [item('javelin', 5)]),
        pick('simple', 'Qualquer arma simples corpo a corpo', simple(true)),
      ]),
      packChoice('priest', 'explorer'),
    ],
  },
  ranger: {
    fixed: [item('longbow'), item('arrow', 20), item('quiver')],
    choices: [
      choice('armor', 'Armadura', [
        option('scale', 'Cota de escamas (brunea)', [item('scale-mail')]),
        option('leather', 'Armadura de couro', [item('leather')]),
      ]),
      choice('weapon', 'Armas corpo a corpo', [
        option('shortswords', 'Duas espadas curtas', [item('shortsword', 2)]),
        pick('two-simple', 'Duas armas simples corpo a corpo', simple(true), 2),
      ]),
      packChoice('dungeoneer', 'explorer'),
    ],
  },
  rogue: {
    fixed: [item('leather'), item('dagger', 2), item('thieves-tools')],
    choices: [
      choice('weapon', 'Arma principal', [
        option('rapier', 'Rapieira', [item('rapier')]),
        option('shortsword', 'Espada curta', [item('shortsword')]),
      ]),
      choice('secondary', 'Arma adicional', [
        option('shortbow', 'Arco curto, aljava e 20 flechas', [
          item('shortbow'),
          item('arrow', 20),
          item('quiver'),
        ]),
        option('shortsword', 'Espada curta', [item('shortsword')]),
      ]),
      packChoice('burglar', 'dungeoneer', 'explorer'),
    ],
  },
  sorcerer: {
    fixed: [item('dagger', 2)],
    choices: [
      choice('weapon', 'Arma principal', [
        crossbow(),
        pick('simple', 'Qualquer arma simples', simple()),
      ]),
      arcane(),
      packChoice('dungeoneer', 'explorer'),
    ],
  },
  warlock: {
    fixed: [item('leather'), item('dagger', 2)],
    choices: [
      choice('weapon', 'Arma principal', [
        crossbow(),
        pick('simple', 'Qualquer arma simples', simple()),
      ]),
      arcane(),
      packChoice('scholar', 'dungeoneer'),
      choice('secondary', 'Arma simples adicional', [
        pick('simple', 'Escolher arma simples', simple()),
      ]),
    ],
  },
  wizard: {
    fixed: [item('spellbook')],
    choices: [
      choice('weapon', 'Arma principal', [
        option('staff', 'Bordão', [item('quarterstaff')]),
        option('dagger', 'Adaga', [item('dagger')]),
      ]),
      arcane(),
      packChoice('scholar', 'explorer'),
    ],
  },
  artificer: {
    fixed: [item('thieves-tools'), item('light-crossbow'), item('bolt', 20), ...packs.dungeoneer],
    choices: [
      choice('weapons', 'Armas simples', [pick('two-simple', 'Duas armas simples', simple(), 2)]),
      choice('armor', 'Armadura', [
        option('studded', 'Couro batido', [item('studded-leather')]),
        option('scale', 'Cota de escamas (brunea)', [item('scale-mail')]),
      ]),
    ],
  },
};
const extras: Record<string, Partial<InventoryItem>> = {
  'Símbolo sagrado': item('holy-symbol').data,
  'Roupas comuns': item('clothes').data,
  Bolsa: item('pouch').data,
  'Kit de disfarce': item('disguise-kit').data,
  'Kit de herbalismo': item('herbalism-kit').data,
  'Ferramentas de ladrão': item('thieves-tools').data,
  Clava: item('club').data,
  Bordão: item('quarterstaff').data,
  'Corda de seda (15 m)': item('silk-rope').data,
};
export function backgroundStartingEquipment(s: DndSheet): StartingEquipment {
  const bg = backgroundFor(s);
  if (!bg || bg.id === 'custom') return { fixed: [], choices: [] };
  const tools = s.creation?.background_tools ?? [],
    base = bg.variantOf ?? bg.id;
  const choices: EquipmentChoice[] = [];
  const fixed = bg.items.flatMap((text) => {
    if (text === 'Livro de orações') {
      choices.push(
        choice('background-faith', 'Objeto de devoção', [
          option('book', 'Livro de orações', [gear('Livro de orações')]),
          option('wheel', 'Roda de orações', [gear('Roda de orações')]),
        ]),
      );
      return [];
    }
    if (text === 'Conjunto de jogo escolhido') {
      choices.push(
        choice('background-game', 'Conjunto de jogo do soldado', [
          option('dice', 'Dados de jogo', [gear('Dados de jogo', 1, 0, 'tool')]),
          option('cards', 'Baralho', [gear('Baralho', 1, 0, 'tool')]),
        ]),
      );
      return [];
    }
    if (
      [
        'Instrumento musical escolhido',
        'Ferramentas de artesão escolhidas',
        'Equipamento de mercador escolhido',
      ].includes(text)
    )
      return [];
    if (text === 'Instrumentos de trapaça escolhidos') {
      choices.push(
        choice('background-props', 'Instrumentos de trapaça', [
          option('dice', 'Dados viciados', [gear('Dados viciados')]),
          option('cards', 'Baralho marcado', [gear('Baralho marcado')]),
          option('ring', 'Anel de sinete de identidade falsa', [gear('Anel de sinete falso')]),
        ]),
      );
      return [];
    }
    const name = text.replace(/ \(\d+\)$/, ''),
      quantity = Number(text.match(/\((\d+)\)$/)?.[1] ?? 1);
    return [
      {
        name,
        quantity,
        data: {
          ...extras[text],
          name,
          category: extras[text]?.category ?? 'gear',
          weight: extras[text]?.weight ?? 0,
          notes: extras[text]?.notes ?? 'Equipamento do antecedente',
        },
      },
    ];
  });
  if (base === 'entertainer')
    choices.push(
      choice(
        'background-instrument',
        bg.id === 'gladiator' ? 'Instrumento ou arma de gladiador' : 'Instrumento do antecedente',
        [
          pick('instrument', 'Instrumento musical', instrument),
          ...(bg.id === 'gladiator'
            ? [
                option('trident', 'Tridente', [item('trident')]),
                option('net', 'Rede', [item('net')]),
              ]
            : []),
        ],
      ),
    );
  if (['folk-hero', 'guild-artisan'].includes(base)) {
    const available = (
      tools.filter((t) => ARTISAN_TOOLS.includes(t)).length
        ? tools.filter((t) => ARTISAN_TOOLS.includes(t))
        : ARTISAN_TOOLS
    ).map((n) => gear(n, 1, 2, 'tool'));
    choices.push(
      choice('background-tools', 'Ferramentas do antecedente', [
        pick('tools', 'Ferramentas de artesão', available),
        ...(bg.id === 'guild-merchant'
          ? [
              option('mule-cart', 'Mula e carroça', [
                gear('Mula', 1, 0, 'item'),
                gear('Carroça', 1, 0, 'item'),
              ]),
            ]
          : []),
      ]),
    );
  }
  return { fixed, choices };
}
export function equipmentSelection(s: DndSheet) {
  return s.creation?.equipment_choices ?? {};
}
export function resolvedEquipmentOption(
  group: EquipmentChoice,
  selected: Record<string, string[]>,
) {
  return group.options.find((o) => o.id === selected[group.id]?.[0]) ?? group.options[0];
}
export function resolveStartingEquipment(s: DndSheet): StartingItem[] {
  const cls = CLASS_STARTING_EQUIPMENT[s.class_id];
  if (!cls) throw new Error('Classe sem equipamento inicial cadastrado.');
  const bg = backgroundStartingEquipment(s),
    selected = equipmentSelection(s),
    result = [...cls.fixed, ...bg.fixed];
  for (const group of [...cls.choices, ...bg.choices]) {
    const chosen = resolvedEquipmentOption(group, selected);
    if (selected[group.id]?.length && !group.options.some((o) => o.id === selected[group.id][0]))
      throw new Error(`Escolha inválida: ${group.label}.`);
    result.push(...chosen.items);
    for (const p of chosen.picks ?? [])
      for (let index = 0; index < p.count; index++) {
        const key = `${group.id}:${chosen.id}:${p.id}`,
          name = selected[key]?.[index] ?? p.options[0].name;
        const entry = p.options.find((i) => i.name === name);
        if (!entry) throw new Error(`Escolha inválida: ${p.label}.`);
        result.push(entry);
      }
  }
  const combined = new Map<string, StartingItem>();
  for (const entry of result) {
    const old = combined.get(entry.name);
    combined.set(entry.name, { ...entry, quantity: entry.quantity + (old?.quantity ?? 0) });
  }
  return [...combined.values()];
}
export function applyBookStartingEquipment(s: DndSheet, uid: () => string): DndSheet {
  const bg = backgroundFor(s),
    c = s.creation;
  if (!c || c.equipment_applied) throw new Error('O equipamento inicial já foi aplicado.');
  if (!bg) throw new Error('Escolha um antecedente.');
  const hasArmor = s.inventory.some((i) => i.equipped && i.armor_type && i.armor_type !== 'shield'),
    hasShield = s.inventory.some((i) => i.equipped && i.armor_type === 'shield');
  const entries = resolveStartingEquipment(s).map((i) => ({
    category: 'gear' as const,
    weight: 0,
    equipped: false,
    notes: 'Equipamento inicial',
    ...i.data,
    name: i.name,
    quantity: i.quantity,
    id: uid(),
  }));
  for (const i of entries)
    if (i.category === 'armor') i.equipped = i.armor_type === 'shield' ? !hasShield : !hasArmor;
  return {
    ...s,
    creation: {
      ...c,
      background_id: bg.id,
      equipment_applied: true,
      equipment_version: 'phb-2014',
    },
    inventory: [...s.inventory, ...entries],
    currency: { ...s.currency, gp: s.currency.gp + bg.gp },
  };
}
/** Server seed: upper bounds across book alternatives; grants remain one-time. */
export function bookEquipmentLimits(classId: string, backgroundId: string) {
  const base = CLASS_STARTING_EQUIPMENT[classId];
  if (!base) return new Map<string, number>();
  const bg = backgroundStartingEquipment({
    class_id: classId,
    background: BACKGROUNDS.find((b) => b.id === backgroundId)?.name ?? '',
    creation: { background_id: backgroundId },
  } as DndSheet);
  const limits = new Map<string, number>();
  for (const i of [...base.fixed, ...bg.fixed])
    limits.set(i.name, (limits.get(i.name) ?? 0) + i.quantity);
  for (const group of [...base.choices, ...bg.choices]) {
    const max = new Map<string, number>();
    for (const opt of group.options) {
      const count = new Map<string, number>();
      for (const i of opt.items) count.set(i.name, (count.get(i.name) ?? 0) + i.quantity);
      for (const p of opt.picks ?? [])
        for (const i of p.options)
          count.set(i.name, (count.get(i.name) ?? 0) + i.quantity * p.count);
      for (const [n, q] of count) max.set(n, Math.max(q, max.get(n) ?? 0));
    }
    for (const [n, q] of max) limits.set(n, q + (limits.get(n) ?? 0));
  }
  return limits;
}
export const STARTING_TOOL_OPTIONS = {
  artisan: ARTISAN_TOOLS,
  gaming: GAMING_SETS,
  instrument: MUSICAL_INSTRUMENTS,
};
