import entries from './data/ingredients.json';
import type { Ingredient } from './types';
import type { InventoryItem } from '@/systems/dnd5e/types';

export const INGREDIENTS: readonly Ingredient[] = entries;
export const HABITATS = [
  ...new Map(
    INGREDIENTS.map((i) => [i.habitat_id, { id: i.habitat_id, name: i.habitat }]),
  ).values(),
];
const byId = new Map(INGREDIENTS.map((i) => [i.id, i]));
export const ingredientById = (id?: string) => (id ? byId.get(id) : undefined);
export const normalizeSearch = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
export function isIngredient(item: Pick<InventoryItem, 'tags'>) {
  return (item.tags ?? []).some((t) =>
    ['ingredientes', 'ingrediente'].includes(normalizeSearch(t).trim()),
  );
}
export const availableIngredients = (items: InventoryItem[]) =>
  items.filter((i) => i.quantity > 0 && isIngredient(i));
export function ingredientItem(ingredient: Ingredient, id: string, quantity = 1): InventoryItem {
  return {
    id,
    name: ingredient.name,
    ingredient_id: ingredient.id,
    category: 'consumable',
    quantity,
    weight: 0,
    equipped: false,
    tags: ['ingredientes'],
    image_path: ingredient.icon,
    notes: ingredient.affinities,
  };
}
export function addIngredient(
  items: InventoryItem[],
  ingredient: Ingredient,
  id: string,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999)
    throw new Error('Adicione de 1 a 9.999 unidades.');
  const existing = items.find((i) => i.ingredient_id === ingredient.id && isIngredient(i));
  if (existing && existing.quantity + quantity > 9999)
    throw new Error('O limite é 9.999 unidades por registro.');
  return existing
    ? items.map((i) => (i.id === existing.id ? { ...i, quantity: i.quantity + quantity } : i))
    : [...items, ingredientItem(ingredient, id, quantity)];
}
