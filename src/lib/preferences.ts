import type { JsonRecord } from '@/types';

export interface Preferences {
  compact_cards: boolean;
  text_size: 'standard' | 'large';
  motion: 'system' | 'reduced';
  vtt_view: '3d' | '2d';
  vtt_quality: 'balanced' | 'low';
  dice_animation: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  compact_cards: false,
  text_size: 'standard',
  motion: 'system',
  vtt_view: '3d',
  vtt_quality: 'balanced',
  dice_animation: true,
});

/** Old or malformed profile values must never enable an unsupported setting. */
export function readPreferences(value: unknown): Preferences {
  const p =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
  return {
    compact_cards: p.compact_cards === true,
    text_size: p.text_size === 'large' ? 'large' : 'standard',
    motion: p.motion === 'reduced' ? 'reduced' : 'system',
    vtt_view: p.vtt_view === '2d' ? '2d' : '3d',
    vtt_quality: p.vtt_quality === 'low' ? 'low' : 'balanced',
    dice_animation: typeof p.dice_animation === 'boolean' ? p.dice_animation : true,
  };
}

export function preferencesEqual(a: Preferences, b: Preferences) {
  return (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).every(
    (key) => a[key] === b[key],
  );
}

export function tablePreferenceKey(userId: string, key: 'view' | 'quality' | 'dice') {
  return `cronica:table:${userId}:${key}`;
}
