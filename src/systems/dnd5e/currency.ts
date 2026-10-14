import type { DndSheet } from './types';

export type Currency = DndSheet['currency'];
export const COIN_TYPES = [
  { id: 'cp', name: 'Cobre', short: 'PC' },
  { id: 'sp', name: 'Prata', short: 'PP' },
  { id: 'ep', name: 'Electro', short: 'PE' },
  { id: 'gp', name: 'Ouro', short: 'PO' },
  { id: 'pp', name: 'Platina', short: 'PL' },
] as const;
export const MAX_REWARD_COINS = 1_000_000;
export const emptyCurrency = (): Currency => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
export const hasCoins = (coins?: Currency | null) =>
  COIN_TYPES.some(({ id }) => (coins?.[id] ?? 0) > 0);
export function formatCoins(coins?: Currency | null) {
  return COIN_TYPES.filter(({ id }) => (coins?.[id] ?? 0) > 0)
    .map(({ id, short }) => `${coins![id].toLocaleString('pt-BR')} ${short}`)
    .join(' · ');
}
