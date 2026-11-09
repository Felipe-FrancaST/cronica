/**
 * Equipment travels inside the existing NPC inventory text column. This keeps
 * older Supabase projects compatible without an additional SQL migration.
 * Plain-text legacy inventories are preserved verbatim until items are added.
 */
import type { InventoryItem } from '@/systems/dnd5e/types';

const EQUIPMENT_HEADER = 'CRONICA_NPC_EQUIPMENT_V1\n';

export function serializeNpcInventory(notes: string, equipment: InventoryItem[] = []): string {
  if (equipment.length === 0) return notes;
  return EQUIPMENT_HEADER + JSON.stringify({ notes, equipment });
}

export function parseNpcInventory(source: string | null | undefined): {
  inventory: string;
  equipment: InventoryItem[];
} {
  const raw = typeof source === 'string' ? source : '';
  if (!raw.startsWith(EQUIPMENT_HEADER)) return { inventory: raw, equipment: [] };
  try {
    const decoded: unknown = JSON.parse(raw.slice(EQUIPMENT_HEADER.length));
    if (!decoded || typeof decoded !== 'object') throw new Error('Formato inválido');
    const value = decoded as { notes?: unknown; equipment?: unknown };
    if (
      typeof value.notes !== 'string' ||
      !Array.isArray(value.equipment) ||
      !value.equipment.every(
        (item) =>
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.category === 'string' &&
          Number.isInteger(item.quantity) &&
          item.quantity >= 0 &&
          typeof item.weight === 'number' &&
          Number.isFinite(item.weight) &&
          item.weight >= 0 &&
          typeof item.equipped === 'boolean' &&
          typeof item.notes === 'string',
      )
    )
      throw new Error('Equipamento inválido');
    return { inventory: value.notes, equipment: value.equipment as InventoryItem[] };
  } catch {
    // Never discard unrecognized/invalid saved content.
    return { inventory: raw, equipment: [] };
  }
}

/** Optional suggestion only; the GM always controls the NPC's actual AC. */
export function suggestedNpcArmorClass(
  equipment: InventoryItem[],
  dexterity: number,
): number | null {
  const armored = equipment.filter(
    (item) => item.category === 'armor' && item.equipped && item.quantity > 0,
  );
  if (!armored.length) return null;
  const modifier = Math.floor((dexterity - 10) / 2);
  const armor = armored.find((item) => item.armor_type !== 'shield');
  const shield = armored.find((item) => item.armor_type === 'shield');
  const base = armor?.armor_base ?? 10;
  const result = !armor
    ? base + modifier
    : armor.armor_type === 'heavy'
      ? base
      : armor.armor_type === 'medium'
        ? base + Math.min(2, modifier)
        : base + modifier;
  return result + (shield?.armor_base ?? (shield ? 2 : 0));
}
