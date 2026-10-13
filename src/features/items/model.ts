import { parseDiceExpression } from '../vtt/dice';
import { ITEM_CATALOG, ITEM_TYPES, type CatalogItem } from '@/systems/dnd5e/items';
import type { InventoryItem } from '@/systems/dnd5e/types';
import type { CampaignItem, ItemBonuses, ItemDefinition, ItemFunction } from './types';

export const ITEM_RARITIES = [
  'Comum',
  'Incomum',
  'Raro',
  'Muito raro',
  'Lendário',
  'Artefato',
  'Variável',
];
export const ACTION_LABELS = {
  action: 'Ação',
  bonus: 'Ação bônus',
  reaction: 'Reação',
  free: 'Sem ação',
};
export const FUNCTION_LABELS = {
  healing: 'Cura',
  damage: 'Dano',
  temporary: 'PV temporários',
  utility: 'Efeito narrativo / utilidade',
};
export const AREA_LABELS = {
  single: 'Uma criatura',
  self: 'Próprio usuário',
  sphere: 'Esfera',
  cone: 'Cone',
  line: 'Linha',
  cube: 'Cubo',
};
export const RECHARGE_LABELS = {
  none: 'Não recarrega',
  manual: 'Decisão do mestre',
  short: 'Após descanso curto',
  long: 'Após descanso longo',
  dawn: 'Ao amanhecer',
};
export const EMPTY_BONUSES: ItemBonuses = { ac: 0, speed: 0, attack: 0, damage: 0 };
export function newItemFunction(): ItemFunction {
  return {
    id: crypto.randomUUID(),
    name: 'Nova função',
    kind: 'utility',
    dice: '',
    cost: 'action',
    range: 1.5,
    shape: 'single',
    origin: 'point',
    size: 3,
    width: 1.5,
    damageType: '',
    save: '',
    halfOnSave: false,
    charge_cost: 0,
    quantity_cost: 0,
    requires_equipped: false,
    note: '',
  };
}
export function newItemDefinition(): ItemDefinition {
  return {
    name: '',
    category: 'magic',
    weight: 0,
    cost_gp: 0,
    notes: '',
    rarity: 'Comum',
    attunement: false,
    charges: 0,
    functions: [],
    bonuses: { ...EMPTY_BONUSES },
    tags: [],
    recharge: 'manual',
    passive_requires_equipped: true,
    image_path: null,
  };
}
export function definitionFromCatalog(entry: CatalogItem): ItemDefinition {
  const { catalog_id: _id, quantity: _q, equipped: _eq, use, ...base } = entry;
  const data = { ...newItemDefinition(), ...base, bonuses: { ...EMPTY_BONUSES } };
  if (entry.catalog_id === 'net') {
    // Campaign snapshots have no catalog-specific operation. Keep the net's
    // restraint under GM review instead of treating its blank damage as a hit.
    data.category = 'gear';
    delete data.damage;
    data.functions = [
      {
        ...newItemFunction(),
        name: 'Arremessar rede',
        range: entry.weapon_range ?? 1.5,
        note: 'O mestre confere o acerto e aplica a restrição. Este uso não causa dano.',
      },
    ];
    return data;
  }
  if (use)
    data.functions = [
      {
        ...newItemFunction(),
        name: 'Usar ' + entry.name,
        kind: use.kind,
        dice: use.dice,
        range: use.range,
        quantity_cost: use.consumed && !entry.charges ? 1 : 0,
        charge_cost: entry.charges ? 1 : 0,
        note: use.note,
      },
    ];
  return data;
}
export function duplicateDefinition(data: ItemDefinition) {
  return {
    ...structuredClone(data),
    name: data.name + ' (cópia)',
    functions: data.functions.map((f) => ({ ...f, id: crypto.randomUUID() })),
  };
}
export function itemDefinitionErrors(data: ItemDefinition) {
  const errors: string[] = [];
  if (!data.name.trim() || data.name.trim().length > 100)
    errors.push('Informe um nome de até 100 caracteres.');
  if (!(data.category in ITEM_TYPES)) errors.push('Escolha uma categoria válida.');
  if (data.notes.length > 12000) errors.push('A descrição deve ter até 12.000 caracteres.');
  for (const [value, label, max] of [
    [data.weight, 'Peso', 100000],
    [data.cost_gp ?? 0, 'Preço', 1000000000],
    [data.weapon_range ?? 1.5, 'Alcance da arma', 600],
  ] as const)
    if (!Number.isFinite(value) || value < 0 || value > max)
      errors.push(`${label} deve ficar entre 0 e ${max}.`);
  if (!Number.isInteger(data.charges ?? 0) || (data.charges ?? 0) < 0 || (data.charges ?? 0) > 999)
    errors.push('Use de 0 a 999 cargas.');
  if (data.category === 'weapon') {
    try {
      parseDiceExpression(data.damage?.match(/^[\d+d\s-]+/i)?.[0] ?? '');
    } catch {
      errors.push('Informe um dano válido para a arma, como 1d8+1 cortante.');
    }
  }
  if (
    data.category === 'armor' &&
    (!Number.isInteger(data.armor_base) || data.armor_base! < 0 || data.armor_base! > 50)
  )
    errors.push('Informe a CA base da armadura ou o bônus do escudo (0 a 50).');
  if (data.tags.length > 12 || data.tags.some((t) => t.length > 40))
    errors.push('Use até 12 etiquetas de até 40 caracteres.');
  for (const key of ['ac', 'attack', 'damage'] as const)
    if (!Number.isInteger(data.bonuses[key]) || Math.abs(data.bonuses[key]) > 20)
      errors.push('Bônus de CA, ataque e dano devem ser inteiros de -20 a 20.');
  if (!Number.isFinite(data.bonuses.speed) || Math.abs(data.bonuses.speed) > 120)
    errors.push('O ajuste de deslocamento deve ficar entre -120 e 120 metros.');
  if (data.functions.length > 12) errors.push('Cada item pode ter até 12 funções.');
  if (new Set(data.functions.map((f) => f.id)).size !== data.functions.length)
    errors.push('As funções precisam de identificadores distintos.');
  for (const f of data.functions) {
    const label = f.name.trim() || 'Função sem nome';
    if (!f.id || !f.name.trim() || f.name.length > 80)
      errors.push('Dê um nome de até 80 caracteres a cada função.');
    if (!Object.hasOwn(FUNCTION_LABELS, f.kind) || !Object.hasOwn(ACTION_LABELS, f.cost))
      errors.push(`${label}: tipo ou ação inválidos.`);
    if (f.kind !== 'utility') {
      try {
        parseDiceExpression(f.dice);
      } catch {
        errors.push(`${label}: confira a fórmula dos dados.`);
      }
    }
    if (
      !Number.isFinite(f.range) ||
      f.range < 0 ||
      f.range > 600 ||
      !Number.isFinite(f.size) ||
      f.size < 0 ||
      f.size > 600 ||
      !Number.isFinite(f.width) ||
      f.width <= 0 ||
      f.width > 600
    )
      errors.push(`${label}: alcance e área inválidos (até 600 metros).`);
    if (
      !Number.isInteger(f.charge_cost) ||
      f.charge_cost < 0 ||
      f.charge_cost > (data.charges ?? 0)
    )
      errors.push(`${label}: o custo em cargas ultrapassa a capacidade do item.`);
    if (!Number.isInteger(f.quantity_cost) || f.quantity_cost < 0 || f.quantity_cost > 999)
      errors.push(`${label}: use de 0 a 999 unidades por ativação.`);
    if (f.note.length > 4000) errors.push(`${label}: a descrição deve ter até 4.000 caracteres.`);
  }
  return errors;
}
export function grantedInventoryItem(
  item: CampaignItem,
  quantity: number,
  id = crypto.randomUUID(),
): InventoryItem {
  return {
    ...structuredClone(item.data),
    id,
    campaign_item_id: item.id,
    definition_version: item.version,
    quantity,
    equipped: false,
    attuned: false,
    charges_used: 0,
  };
}
export { itemFunctionAvailable, passiveBonuses } from './item-rules';
export function itemMatches(item: CampaignItem, query: string) {
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  return normalize(
    [item.name, item.data.notes, ...item.data.tags, ...item.data.functions.map((f) => f.name)].join(
      ' ',
    ),
  ).includes(normalize(query.trim()));
}
export const ITEM_STARTERS = [
  { id: 'blank', name: 'Item livre', create: newItemDefinition },
  {
    id: 'healing',
    name: 'Poção de cura',
    create: () =>
      definitionFromCatalog(
        ITEM_CATALOG.find((i) => i.catalog_id === 'healing') ??
          ITEM_CATALOG.find((i) => i.use?.kind === 'healing')!,
      ),
  },
  {
    id: 'wand',
    name: 'Varinha com duas funções',
    create: () => ({
      ...newItemDefinition(),
      name: 'Varinha das brasas',
      charges: 7,
      rarity: 'Raro',
      recharge: 'dawn' as const,
      functions: [
        {
          ...newItemFunction(),
          name: 'Raio de brasas',
          kind: 'damage' as const,
          dice: '2d6',
          range: 18,
          charge_cost: 1,
          damageType: 'fogo',
        },
        {
          ...newItemFunction(),
          name: 'Cone de chamas',
          kind: 'damage' as const,
          dice: '3d6',
          range: 0,
          shape: 'cone' as const,
          origin: 'self' as const,
          size: 4.5,
          charge_cost: 2,
          damageType: 'fogo',
          save: 'DES',
          halfOnSave: true,
        },
      ],
    }),
  },
  {
    id: 'cloak',
    name: 'Manto de proteção',
    create: () => ({
      ...newItemDefinition(),
      name: 'Manto de proteção',
      rarity: 'Incomum',
      attunement: true,
      bonuses: { ...EMPTY_BONUSES, ac: 1 },
    }),
  },
  {
    id: 'boots',
    name: 'Botas do viajante',
    create: () => ({
      ...newItemDefinition(),
      name: 'Botas do viajante',
      rarity: 'Incomum',
      bonuses: { ...EMPTY_BONUSES, speed: 3 },
    }),
  },
  {
    id: 'charm',
    name: 'Amuleto de vigor',
    create: () => ({
      ...newItemDefinition(),
      name: 'Amuleto de vigor',
      attunement: true,
      charges: 3,
      recharge: 'long' as const,
      functions: [
        {
          ...newItemFunction(),
          name: 'Vigor',
          kind: 'temporary' as const,
          dice: '1d8+2',
          shape: 'self' as const,
          origin: 'self' as const,
          range: 0,
          cost: 'bonus' as const,
          charge_cost: 1,
        },
      ],
    }),
  },
  {
    id: 'key',
    name: 'Chave / item de missão',
    create: () => ({
      ...newItemDefinition(),
      name: 'Chave da cripta',
      category: 'gear' as const,
      tags: ['missão'],
      functions: [
        {
          ...newItemFunction(),
          name: 'Abrir o selo',
          kind: 'utility' as const,
          note: 'O mestre decide qual passagem ou evento esta chave libera.',
        },
      ],
    }),
  },
];
