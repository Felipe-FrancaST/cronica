import { INGREDIENTS } from './ingredients';
import { POTIONS } from './potions';
import { newItemDefinition } from '@/features/items/model';
import type { ItemDefinition } from '@/features/items/types';
export function arkanisGiftDefinition(id: string): ItemDefinition {
  const ingredient = INGREDIENTS.find((i) => i.id === id);
  if (ingredient)
    return {
      ...newItemDefinition(),
      name: ingredient.name,
      category: 'consumable',
      ingredient_id: ingredient.id,
      tags: ['ingredientes'],
      notes: ingredient.affinities,
      image_path: ingredient.icon,
      recharge: 'none',
      passive_requires_equipped: false,
    };
  const potion = POTIONS.find((i) => i.id === id);
  if (potion)
    return {
      ...newItemDefinition(),
      name: potion.name,
      category: 'consumable',
      tags: ['poções'],
      notes: `${potion.effect}\nDuração: ${potion.duration}\nUso: ${potion.use}`,
      image_path: potion.icon,
      recharge: 'none',
      passive_requires_equipped: false,
    };
  throw new Error('Escolha um ingrediente ou uma poção do catálogo de Arkanis.');
}
