export const SCENERY_STYLES = [
  {
    id: 'original',
    name: 'Materiais originais',
    wall: '#dec7a0',
    roof: '#954b3e',
    wood: '#795136',
    stone: '#999a8f',
    cloth: '#963e49',
    metal: '#454c4c',
    foliage: '#56834e',
  },
  {
    id: 'village',
    name: 'Vila acolhedora',
    wall: '#eee0b9',
    roof: '#b96545',
    wood: '#916240',
    stone: '#acaa96',
    cloth: '#b95449',
    metal: '#535450',
    foliage: '#7f9e58',
  },
  {
    id: 'forest',
    name: 'Refúgio da floresta',
    wall: '#c6c7a0',
    roof: '#506a52',
    wood: '#68513b',
    stone: '#899084',
    cloth: '#71825d',
    metal: '#414b43',
    foliage: '#45805a',
  },
  {
    id: 'coastal',
    name: 'Vila do porto',
    wall: '#e5e0cd',
    roof: '#537f91',
    wood: '#927455',
    stone: '#a7b5b6',
    cloth: '#4e7fa2',
    metal: '#5d6970',
    foliage: '#6a956f',
  },
  {
    id: 'desert',
    name: 'Oásis do deserto',
    wall: '#d7b77f',
    roof: '#b76e44',
    wood: '#886247',
    stone: '#c8ac7f',
    cloth: '#3e8c8a',
    metal: '#796849',
    foliage: '#92934c',
  },
  {
    id: 'winter',
    name: 'Aldeia de inverno',
    wall: '#dfe1d7',
    roof: '#71878d',
    wood: '#71665b',
    stone: '#b1bdc1',
    cloth: '#6e80a0',
    metal: '#566776',
    foliage: '#6c9389',
  },
  {
    id: 'gothic',
    name: 'Fortaleza sombria',
    wall: '#9f9d9d',
    roof: '#514358',
    wood: '#514449',
    stone: '#727881',
    cloth: '#7c3e57',
    metal: '#353a48',
    foliage: '#5a6b60',
  },
] as const;
export type SceneryStyle = (typeof SCENERY_STYLES)[number]['id'];
export function normalizeSceneryStyle(value: unknown): SceneryStyle {
  return SCENERY_STYLES.some((s) => s.id === value) ? (value as SceneryStyle) : 'original';
}
export function sceneryPalette(value: unknown) {
  return SCENERY_STYLES.find((s) => s.id === normalizeSceneryStyle(value))!;
}
// Existing objects keep their recognizable accents while wood, masonry and vegetation
// follow the selected palette. Detailed workshop models use explicit material roles.
export function sceneryStyleColor(base: string, style: unknown) {
  const palette = sceneryPalette(style);
  if (palette.id === 'original' || !/^#[\da-f]{6}$/i.test(base)) return base;
  const channels = [1, 3, 5].map((start) => parseInt(base.slice(start, start + 2), 16));
  const [r, g, b] = channels;
  const range = Math.max(...channels) - Math.min(...channels);
  const target =
    range < 34
      ? palette.stone
      : g > r * 1.08 && g > b * 1.08
        ? palette.foliage
        : r > g && g > b * 1.1
          ? palette.wood
          : undefined;
  if (!target) return base;
  const lightness = (r + g + b) / 3;
  const ratio = Math.max(0.55, Math.min(1.35, lightness / 125));
  return (
    '#' +
    [1, 3, 5]
      .map((start) =>
        Math.min(255, Math.round(parseInt(target.slice(start, start + 2), 16) * ratio))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
