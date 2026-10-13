import type { InventoryItem } from '@/systems/dnd5e/types';
import type { ItemBonuses, ItemFunction } from './types';
export function itemFunctionAvailable(item: InventoryItem, fn: ItemFunction) {
  return (
    item.quantity > 0 &&
    item.quantity >= fn.quantity_cost &&
    (!item.attunement || !!item.attuned) &&
    (!fn.requires_equipped || item.equipped) &&
    (item.charges ?? 0) - (item.charges_used ?? 0) >= fn.charge_cost
  );
}
export function passiveBonuses(inventory: InventoryItem[]): ItemBonuses {
  return inventory.reduce(
    (result, item) => {
      if (
        !item.campaign_item_id ||
        item.quantity < 1 ||
        (item.passive_requires_equipped !== false && !item.equipped) ||
        (item.attunement && !item.attuned)
      )
        return result;
      for (const key of Object.keys(result) as (keyof ItemBonuses)[])
        result[key] += item.bonuses?.[key] ?? 0;
      return result;
    },
    { ac: 0, speed: 0, attack: 0, damage: 0 },
  );
}
