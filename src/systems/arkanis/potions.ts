import entries from './data/potions.json';
import type { InventoryItem } from '../dnd5e/types';
import { ingredientById, normalizeSearch, isIngredient } from './ingredients';
export const POTIONS = entries;
export const potionByName = (name: string) =>
  POTIONS.find((p) => normalizeSearch(p.name) === normalizeSearch(name));
export function materialName(item: InventoryItem) {
  return ingredientById(item.ingredient_id)?.name ?? item.name;
}
export function potionFor(items: InventoryItem[]) {
  if (items.length !== 2) return undefined;
  const names = items
    .map((i) => normalizeSearch(materialName(i)))
    .sort()
    .join('|');
  return POTIONS.find((p) => p.ingredients.map(normalizeSearch).sort().join('|') === names);
}
export function brewPotion(
  inventory: InventoryItem[],
  slots: string[],
  id: string,
): InventoryItem[] {
  if (slots.length !== 2) throw new Error('Escolha dois ingredientes.');
  const selected = slots.map((id) => inventory.find((i) => i.id === id));
  if (selected.some((i) => !i || (!isIngredient(i) && !potionByName(i.name))))
    throw new Error('Material inválido.');
  const recipe = potionFor(selected as InventoryItem[]);
  if (!recipe)
    throw new Error(
      'Essa combinação não corresponde a uma receita. Nenhum material foi consumido.',
    );
  const counts = new Map<string, number>();
  slots.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  for (const [id, n] of counts)
    if ((inventory.find((i) => i.id === id)?.quantity ?? 0) < n)
      throw new Error('Ingredientes insuficientes.');
  const result = inventory.map((i) => ({ ...i, quantity: i.quantity - (counts.get(i.id) ?? 0) }));
  const existing = result.find(
    (i) => i.name === recipe.name && i.image_path === recipe.icon && !i.campaign_item_id,
  );
  if (existing) {
    if (existing.quantity >= 9999) throw new Error('Limite de poções na pilha atingido.');
    existing.quantity++;
  } else {
    if (result.length >= 1000) throw new Error('A bolsa está cheia. Remova registros vazios.');
    result.push({
      id,
      name: recipe.name,
      category: 'consumable',
      quantity: 1,
      weight: 0,
      equipped: false,
      tags: ['poções'],
      image_path: recipe.icon,
      notes: `${recipe.effect}\nDuração: ${recipe.duration}\nUso: ${recipe.use}`,
    });
  }
  return result;
}
