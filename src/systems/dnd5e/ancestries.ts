import races from './data/races.json';
import type { Ability } from './types';
export interface RaceDefinition {
  natural_armor?: { base: number; ability: Ability | null; when: 'unarmored' | 'better' | 'shell' };
  armor_bonus?: number;
  hp_per_level?: number;
  id: string;
  name: string;
  source: string;
  edition: string;
  speed: number;
  size: string;
  darkvision: number;
  parent: string | null;
  traits: string[];
  optional: boolean;
}
export const RACE_CATALOG: RaceDefinition[] = races as RaceDefinition[];
export const getRace = (value: string | null | undefined) =>
  RACE_CATALOG.find((r) => r.id === value || r.name === value);
export const RACE_GROUPS = [...new Set(RACE_CATALOG.map((r) => r.source))].sort((a, b) =>
  a.localeCompare(b, 'pt-BR'),
);
