// Field IDs belong to the three-page editable PDF supplied for this project.
// Keep the original template and these IDs together when replacing the artwork.
export const textField = (id: number) => `Campo de Texto${id}`;
export const checkField = (id: number) => `Caixa de Seleção${id}`;
export const ABILITY_FIELDS = {
  str: [27, 29],
  dex: [30, 33],
  con: [32, 31],
  int: [35, 34],
  wis: [36, 39],
  cha: [38, 37],
} as const;
export const SKILL_ORDER = [
  'acrobatics',
  'arcana',
  'athletics',
  'performance',
  'deception',
  'stealth',
  'history',
  'intimidation',
  'insight',
  'investigation',
  'animal_handling',
  'medicine',
  'nature',
  'perception',
  'persuasion',
  'sleight_of_hand',
  'religion',
  'survival',
] as const;
export const SPELL_FIELDS = [
  { names: [134, 135, 136, 137, 138, 139, 140, 141], checks: [], total: null, used: null },
  {
    // Checkbox 55 illustrates the preparation legend above the first spell row.
    names: Array.from({ length: 12 }, (_, i) => 109 + i),
    checks: [53, 54, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
    total: 104,
    used: 103,
  },
  {
    names: Array.from({ length: 13 }, (_, i) => 121 + i),
    checks: [49, 48, 47, 46, 45, 44, 43, 32, 31, 30, 50, 51, 52],
    total: 105,
    used: 102,
  },
  {
    names: Array.from({ length: 13 }, (_, i) => 208 - i),
    checks: Array.from({ length: 13 }, (_, i) => 110 + i),
    total: 92,
    used: 91,
  },
  {
    names: Array.from({ length: 13 }, (_, i) => 195 - i),
    checks: Array.from({ length: 13 }, (_, i) => 97 + i),
    total: 97,
    used: 98,
  },
  {
    names: Array.from({ length: 9 }, (_, i) => 182 - i),
    checks: [74, 73, 61, 60, 59, 72, 71, 70, 69],
    total: 106,
    used: 99,
  },
  {
    names: Array.from({ length: 9 }, (_, i) => 173 - i),
    checks: Array.from({ length: 9 }, (_, i) => 88 + i),
    total: 93,
    used: 94,
  },
  {
    names: Array.from({ length: 9 }, (_, i) => 164 - i),
    checks: Array.from({ length: 9 }, (_, i) => 79 + i),
    total: 95,
    used: 96,
  },
  {
    names: Array.from({ length: 7 }, (_, i) => 155 - i),
    checks: [56, 57, 58, 75, 76, 77, 78],
    total: 108,
    used: 101,
  },
  {
    names: Array.from({ length: 7 }, (_, i) => 148 - i),
    checks: Array.from({ length: 7 }, (_, i) => 62 + i),
    total: 107,
    used: 100,
  },
] as const;
