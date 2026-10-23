import type { BattleActionRequest } from './types';

export function actionOutcome(r: BattleActionRequest) {
  if (r.status === 'failure' && r.resolution.guided)
    return r.resolution.message || 'O ataque não acertou. A ação foi utilizada.';
  if (r.status === 'failure') return 'O mestre decidiu pela falha. A ação não foi executada.';
  if (r.status === 'expired') return 'O turno terminou antes da conclusão desta ação.';
  if (r.status === 'cancelled')
    return r.resolution.manual_resource_review
      ? r.resolution.message || 'Tentativa cancelada. O mestre precisa conferir os recursos.'
      : 'Esta tentativa foi cancelada.';
  if (r.status === 'approved') return 'Sucesso! Role os dados para concluir a ação.';
  if (r.resolution.guided && r.status === 'success') {
    const affected = r.resolution.affected ?? [];
    const total = (kind: string) =>
      affected.filter((a) => a.kind === kind).reduce((sum, a) => sum + a.amount, 0);
    if (r.definition.kind === 'damage')
      return `Você causou ${total('damage')} de dano${affected.filter((a) => a.kind === 'damage' && a.amount > 0).length > 1 ? ' no total' : ''}${r.definition.damageType ? ` (${r.definition.damageType})` : ''}.`;
    if (r.definition.kind === 'healing') return `Você curou ${total('healing')} PV.`;
    if (r.definition.kind === 'temporary')
      return `Você concedeu ${total('temporary')} PV temporários.`;
  }
  const kind = r.resolution.roll_kind ?? r.definition.kind;
  if (r.resolution.dice_roll) {
    const amount = Math.max(0, r.resolution.dice_roll.total);
    if (kind === 'healing')
      return `Você curou ${(r.resolution.affected ?? []).filter((a) => a.kind === 'healing').reduce((sum, a) => sum + a.amount, 0)} PV.`;
    if (kind === 'temporary') return `Você concedeu ${amount} PV temporários.`;
    if (kind === 'damage')
      return `Você deu ${amount} de dano${r.definition.damageType ? ` (${r.definition.damageType})` : ''}.`;
  }
  return 'Sua ação foi executada.';
}
