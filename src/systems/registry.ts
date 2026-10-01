import { dnd5e } from './dnd5e';
import type { RpgSystemModule, DerivedSheet } from './types';
import type { DndSheet } from './dnd5e/types';
const modules = new Map<string, RpgSystemModule<unknown, unknown>>();
export function registerSystem<TSheet, TDerived>(module: RpgSystemModule<TSheet, TDerived>) {
  if (modules.has(module.slug)) throw new Error(`O sistema ${module.slug} já está registrado.`);
  modules.set(module.slug, module as unknown as RpgSystemModule<unknown, unknown>);
}
registerSystem(dnd5e);
export function getSystem<TSheet = DndSheet, TDerived = DerivedSheet>(
  slug: string,
): RpgSystemModule<TSheet, TDerived> {
  const module = modules.get(slug);
  if (!module) throw new Error('Este sistema de RPG ainda não está disponível.');
  return module as RpgSystemModule<TSheet, TDerived>;
}
export const availableModules = () => [...modules.values()];
