import type { Ability, Npc } from '@/types';
export interface NpcStatBlock {
  size?: 'Miúdo' | 'Pequeno' | 'Médio' | 'Grande' | 'Enorme' | 'Imenso';
  creature_type?: string;
  alignment?: string;
  challenge?: string;
  proficiency?: number;
  movement?: { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number };
  senses?: {
    darkvision?: number;
    blindsight?: number;
    devilSight?: number;
    trueSight?: number;
    seeInvisible?: boolean;
    blindBeyond?: boolean;
  };
  saving_throws?: Partial<Record<Ability, number>>;
  skills?: Record<string, number>;
  languages?: string;
  damage_immunities?: string;
  condition_immunities?: string[];
  conditions?: string[];
  exhaustion?: number;
}
export const npcBlock = (npc: Pick<Npc, 'stat_block'>): NpcStatBlock => npc.stat_block ?? {};

export const npcGridSize = (npc: Pick<Npc, 'stat_block'> | undefined) =>
  (
    ({ Miúdo: 0.5, Pequeno: 1, Médio: 1, Grande: 2, Enorme: 3, Imenso: 4 }) as Record<
      string,
      number
    >
  )[npc?.stat_block?.size ?? 'Médio'] ?? 1;
