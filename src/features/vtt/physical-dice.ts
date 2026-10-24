import { parseDiceExpression, type RollMode } from './dice';
export interface PhysicalRollPlan {
  expression: string;
  mode: RollMode;
  label: string;
  rerollWeaponDice?: number;
}
export function physicalDiceSlots(plan: PhysicalRollPlan) {
  return parseDiceExpression(plan.expression).terms.flatMap((t) =>
    t.sides === null
      ? []
      : Array.from(
          { length: plan.mode !== 'normal' && t.sides === 20 ? 2 : t.count },
          () => t.sides!,
        ),
  );
}
export function validatePhysicalRolls(plans: PhysicalRollPlan[], inputs: string[]): number[][] {
  return plans.map((plan, i) => {
    const slots = physicalDiceSlots(plan),
      text = (inputs[i] ?? '').trim();
    const values = text ? text.split(/[,;\s]+/).map(Number) : [];
    const first = parseDiceExpression(plan.expression).terms[0];
    const rerolls =
      first?.sides && plan.rerollWeaponDice
        ? values
            .slice(0, Math.min(first.count, plan.rerollWeaponDice))
            .filter((n) => n === 1 || n === 2)
            .map(() => first.sides!)
        : [];
    const expected = [...slots, ...rerolls];
    if (values.length !== expected.length)
      throw new Error(`${plan.label}: informe ${expected.length} face(s), sem somar os bônus.`);
    values.forEach((v, n) => {
      if (!Number.isInteger(v) || v < 1 || v > expected[n])
        throw new Error(
          `${plan.label}: a face ${n + 1} deve ser um inteiro de 1 a ${expected[n]}.`,
        );
    });
    return values;
  });
}
