export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export type DieSides = (typeof DIE_SIDES)[number];
export type RollMode = 'normal' | 'advantage' | 'disadvantage';
export type RollVisibility = 'public' | 'gm' | 'self';
export interface DiceTerm {
  sign: number;
  count: number;
  sides: number | null;
  values: number[];
  subtotal: number;
  kept?: number;
}
export interface DiceRoll {
  id: string;
  campaign_id: string;
  map_id: string;
  rolled_by: string;
  client_id: string;
  expression: string;
  label: string;
  visibility: RollVisibility;
  mode: RollMode;
  terms: DiceTerm[];
  total: number;
  request_id: string | null;
  effect_id: string | null;
  effect_pulse: number | null;
  consumed_at: string | null;
  created_at: string;
}
export interface RollOptions {
  expression: string;
  label?: string;
  visibility?: RollVisibility;
  mode?: RollMode;
  requestId?: string;
  effectId?: string;
}
export function parseDiceExpression(source: string) {
  const expression = source
    .toLowerCase()
    .replace(/\s/g, '')
    .replace(/(^|[+-])d/g, '$11d');
  if (
    !expression ||
    expression.length > 200 ||
    !/^[+-]?\d+(d\d+)?([+-]\d+(d\d+)?)*$/.test(expression)
  )
    throw new Error('Use uma fórmula como 2d6+3, d20 ou 1d8+1d4.');
  let budget = 0;
  const terms = [...expression.matchAll(/([+-]?)(\d+)(?:d(\d+))?/g)].map((m) => {
    const count = Number(m[2]),
      sides = m[3] ? Number(m[3]) : null;
    if (sides !== null) {
      budget += count;
      if (!DIE_SIDES.includes(sides as DieSides) || count < 1 || budget > 100)
        throw new Error('Use até 100 dados: d4, d6, d8, d10, d12, d20 ou d100.');
    } else if (!Number.isSafeInteger(count) || count > 100000)
      throw new Error('O modificador deve ser um inteiro de até 100.000.');
    return { sign: m[1] === '-' ? -1 : 1, count, sides };
  });
  return { expression, terms };
}
export function canUseAdvantage(expression: string) {
  try {
    const terms = parseDiceExpression(expression).terms.filter((t) => t.sides !== null);
    return (
      terms.length === 1 && terms[0].sides === 20 && terms[0].count === 1 && terms[0].sign === 1
    );
  } catch {
    return false;
  }
}
export function rollBreakdown(roll: Pick<DiceRoll, 'terms' | 'mode'>) {
  return roll.terms
    .map((t) =>
      t.sides
        ? `${t.sign < 0 ? '−' : ''}[${t.values.join(', ')}]${t.kept !== undefined ? ` → ${t.values[t.kept]}` : ''}`
        : `${t.sign < 0 ? '−' : '+'}${t.count}`,
    )
    .join(' ');
}
export function diceForAnimation(roll: Pick<DiceRoll, 'terms'>, limit = 12) {
  const dice: { sides: DieSides; value: number; discarded: boolean }[] = [];
  for (const t of roll.terms)
    if (t.sides)
      for (let i = 0; i < t.values.length; i++) {
        if (dice.length >= limit) return dice;
        dice.push({
          sides: t.sides as DieSides,
          value: t.values[i],
          discarded: t.kept !== undefined && t.kept !== i,
        });
      }
  return dice;
}
