import type { DndSheet } from '@/systems/dnd5e/types';
import { classLevels } from '@/systems/dnd5e/progression';
import { pendingHitPointRolls } from '@/systems/dnd5e/hit-points';
import { startingEquipmentLimits } from '@/systems/dnd5e/creation';
import { ITEM_CATALOG } from '@/systems/dnd5e/items';
import type { CampaignRules } from './types';

export function characterRuleErrors(
  sheet: DndSheet,
  rules: CampaignRules,
  previous?: DndSheet,
  master = false,
) {
  const errors: string[] = [];
  const oldClasses = previous ? classLevels(previous).map((entry) => entry.class_id) : [];
  if (
    !rules.allow_multiclass &&
    classLevels(sheet).length > 1 &&
    classLevels(sheet).some((entry) => !oldClasses.includes(entry.class_id))
  )
    errors.push(
      'O mestre desativou a multiclasse nesta campanha. Fichas existentes mantêm suas classes.',
    );
  if (rules.lock_player_level && sheet.level !== rules.party_level)
    errors.push(`O nível ${rules.party_level} do grupo é definido pelo mestre.`);
  if ((sheet.hit_point_method ?? 'average') !== rules.hit_point_method)
    errors.push('O método de pontos de vida deve seguir a regra da campanha. Reabra a ficha.');
  if (pendingHitPointRolls(sheet).length)
    errors.push(
      'Role os dados de vida pendentes na seção Combate antes de salvar. Cada nível é rolado uma única vez.',
    );
  if (!master) {
    if (
      rules.hit_point_method !== 'average' &&
      sheet.hp_max_override !== (previous?.hp_max_override ?? null)
    )
      errors.push(
        'Os PV máximos seguem a regra da campanha. Somente o mestre pode definir uma exceção.',
      );
    if (
      rules.attribute_method !== 'choice' &&
      sheet.creation?.method !== rules.attribute_method &&
      (!previous || sheet.creation?.method !== previous.creation?.method)
    )
      errors.push('Use o método de atributos escolhido pelo mestre para os novos personagens.');
    if (!rules.players_can_create_custom_items) {
      const starters = startingEquipmentLimits(sheet, previous);
      const forbidden = sheet.inventory.some((item) => {
        if (
          item.catalog_id ||
          ITEM_CATALOG.some((entry) => entry.name === item.name) ||
          previous?.inventory.some((old) => old.id === item.id)
        )
          return false;
        const available = starters.get(item.name) ?? 0;
        if (available > 0) {
          starters.set(item.name, available - 1);
          return false;
        }
        return true;
      });
      if (forbidden)
        errors.push(
          'Somente o mestre pode criar itens personalizados nesta campanha. Escolha um item do catálogo.',
        );
    }
    if (!rules.players_can_rest && previous) {
      const reduced = (next: Record<string, number> = {}, old: Record<string, number> = {}) =>
        Object.entries(old).some(([key, count]) => (next[key] ?? 0) < count);
      if (
        reduced(sheet.feature_uses, previous.feature_uses) ||
        reduced(sheet.slots_used, previous.slots_used) ||
        reduced(sheet.arcanum_used, previous.arcanum_used) ||
        reduced(sheet.hit_dice_by_class, previous.hit_dice_by_class) ||
        (sheet.pact_slots_used ?? 0) < (previous.pact_slots_used ?? 0) ||
        sheet.hit_dice_used < previous.hit_dice_used
      )
        errors.push(
          'A recuperação de recursos por descanso é controlada pelo mestre. Peça a ele para registrar o descanso.',
        );
    }
  }
  return errors;
}
