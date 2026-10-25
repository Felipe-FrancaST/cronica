import type { Workspace } from '@/types';
import { equalJson, shareRows } from './structural-sharing';

/** Preserve unchanged sheets/catalogs through polling and realtime bursts. */
export function shareWorkspace(old: Workspace, next: Workspace): Workspace {
  const result: Workspace = {
    ...next,
    profiles: shareRows(old.profiles, next.profiles)!,
    systems: shareRows(old.systems, next.systems)!,
    campaigns: shareRows(old.campaigns, next.campaigns)!,
    members: shareRows(old.members, next.members)!,
    characters: shareRows(old.characters, next.characters)!,
    world: shareRows(old.world, next.world)!,
    npcs: shareRows(old.npcs, next.npcs)!,
    rules: equalJson(old.rules, next.rules) ? old.rules : next.rules,
  };
  return Object.keys(result).every(
    (key) => result[key as keyof Workspace] === old[key as keyof Workspace],
  )
    ? old
    : result;
}
