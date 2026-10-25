import { exhaustionLevel } from './conditions';
import type { DndSheet } from './types';
import { recoverSpellResources } from './spellcasting';
import { hitDicePools } from './progression';
import { calculate } from './index';
export type RestKind = 'short' | 'long';
export interface RestResult {
  kind: RestKind;
  hp_before: number;
  hp_after: number;
  hit_dice_spent: number;
  hit_dice_recovered: number;
  healing_rolls: {
    class_id: string;
    die: number;
    face: number;
    modifier: number;
    healing: number;
  }[];
}
export function characterRest(
  sheet: DndSheet,
  kind: RestKind,
  choices: Record<string, number> = {},
  roll = (sides: number) => Math.floor(Math.random() * sides) + 1,
): { sheet: DndSheet; result: RestResult } {
  if (
    sheet.hp_current <= 0 ||
    sheet.conditions.some((c) => ['Morto', 'Dead', 'Inconsciente'].includes(c))
  )
    throw new Error('O personagem precisa estar consciente e com pelo menos 1 PV para descansar.');
  const pools = hitDicePools(sheet),
    used = Object.fromEntries(Object.entries(pools).map(([id, p]) => [id, p.used]));
  for (const [id, n] of Object.entries(choices))
    if (
      !pools[id] ||
      !Number.isInteger(n) ||
      n < 0 ||
      n > (kind === 'short' ? pools[id].total - pools[id].used : pools[id].used)
    )
      throw new Error('Quantidade de dados de vida inválida. Atualize a ficha e tente novamente.');
  let next = recoverSpellResources(sheet, kind);
  if (kind === 'long')
    next = {
      ...next,
      exhaustion: Math.max(0, exhaustionLevel(sheet.exhaustion, sheet.conditions) - 1),
      conditions: sheet.conditions.filter((c) => c !== 'Exaustão'),
    };
  const maximum = calculate(next).hpMax;
  const result: RestResult = {
    kind,
    hp_before: sheet.hp_current,
    hp_after: sheet.hp_current,
    hit_dice_spent: 0,
    hit_dice_recovered: 0,
    healing_rolls: [],
  };
  if (kind === 'short') {
    const modifier = Math.floor((sheet.abilities.con - 10) / 2);
    for (const [id, n] of Object.entries(choices)) {
      for (let i = 0; i < n; i++) {
        const face = roll(pools[id].die);
        if (!Number.isInteger(face) || face < 1 || face > pools[id].die)
          throw new Error('Face inválida no dado de vida.');
        const healing = sheet.conditions.includes('Cura bloqueada')
          ? 0
          : Math.max(0, face + modifier);
        result.healing_rolls.push({ class_id: id, die: pools[id].die, face, modifier, healing });
        result.hp_after = Math.min(maximum, result.hp_after + healing);
      }
      used[id] += n;
      result.hit_dice_spent += n;
    }
  } else {
    result.hp_after = maximum;
    const budget = Math.max(1, Math.floor(sheet.level / 2));
    let remaining = budget;
    const selected = Object.values(choices).reduce((a, b) => a + b, 0);
    if (selected > budget)
      throw new Error(`O descanso longo recupera até ${budget} dados de vida.`);
    for (const id of Object.keys(pools)) {
      const n = selected ? (choices[id] ?? 0) : Math.min(remaining, used[id]);
      used[id] -= n;
      remaining -= n;
      result.hit_dice_recovered += n;
    }
  }
  next = {
    ...next,
    hp_current: result.hp_after,
    hit_dice_by_class: used,
    hit_dice_used: Object.values(used).reduce((a, b) => a + b, 0),
  };
  return { sheet: next, result };
}
export function inspirationCount(s: DndSheet) {
  return Math.max(0, Math.min(99, s.inspiration_count ?? (s.details?.inspiration ? 1 : 0)));
}
