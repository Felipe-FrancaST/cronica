import type { BattleMapObject } from './types';

export const CONTAINER_KINDS = ['chest', 'supplycrate', 'sarcophagus'];
export const PASSAGE_KINDS = ['door', 'portcullis', 'cage', 'secretwall'];
export const LIGHT_KINDS = [
  'torch',
  'campfire',
  'forge',
  'lanternpost',
  'candelabra',
  'fireplace',
  'beacon',
];
export const MECHANISM_KINDS = ['lever', 'pressureplate', 'gong'];
export const REWARD_KINDS = [
  ...CONTAINER_KINDS,
  'treasure',
  'barrel',
  'cart',
  'table',
  'bookshelf',
  'weaponrack',
  'altar',
  'flowers',
  'bush',
  'crops',
];
export const READING_KINDS = ['signpost', 'gravestone', 'cross', 'statue', 'well', 'fountain'];
export const configurableScenery = (kind: string) =>
  [
    ...REWARD_KINDS,
    ...PASSAGE_KINDS,
    ...LIGHT_KINDS,
    ...MECHANISM_KINDS,
    ...READING_KINDS,
  ].includes(kind);
// Only these pieces interrupt painting with a setup dialog. Other pieces can
// be configured later, without adding a modal to every torch or flower placed.
export const configureOnPlacement = (kind: string) =>
  [...CONTAINER_KINDS, ...PASSAGE_KINDS, 'treasure'].includes(kind);
export type SceneryIntent =
  'open' | 'close' | 'take' | 'inspect' | 'activate' | 'deactivate' | 'light-on' | 'light-off';
export function playerSceneryAction(object: Pick<BattleMapObject, 'object_type' | 'metadata'>): {
  label: string;
  intent: SceneryIntent;
} {
  const kind = object.object_type;
  if ([...CONTAINER_KINDS, ...PASSAGE_KINDS].includes(kind)) {
    const open = ['open', 'iron-open'].includes(String(object.metadata.variant));
    return {
      label: open
        ? 'Fechar elemento'
        : object.metadata.interaction_locked
          ? 'Usar chave e abrir'
          : 'Abrir elemento',
      intent: open ? 'close' : 'open',
    };
  }
  if (LIGHT_KINDS.includes(kind))
    return object.metadata.light_enabled === false
      ? { label: 'Acender', intent: 'light-on' }
      : { label: 'Apagar', intent: 'light-off' };
  if (MECHANISM_KINDS.includes(kind))
    return object.metadata.variant === 'activated'
      ? { label: 'Repor mecanismo', intent: 'deactivate' }
      : {
          label:
            kind === 'gong'
              ? 'Tocar gongo'
              : kind === 'pressureplate'
                ? 'Pressionar placa'
                : 'Acionar alavanca',
          intent: 'activate',
        };
  return {
    label: ['signpost', 'gravestone', 'bookshelf'].includes(kind)
      ? 'Ler e investigar'
      : ['flowers', 'bush', 'crops'].includes(kind)
        ? 'Procurar recursos'
        : 'Examinar elemento',
    intent: 'inspect',
  };
}
