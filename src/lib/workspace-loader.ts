import type {
  Workspace,
  WorkspaceLoadOptions,
  WorkspaceRepository,
  WorkspaceResource,
} from '@/types';
import { createRefreshQueue } from './refresh-queue';

export const workspaceResources: WorkspaceResource[] = [
  'profiles',
  'systems',
  'campaigns',
  'members',
  'rules',
  'summaries',
  'characters',
  'world',
  'npcs',
];

export function createWorkspaceLoader(
  repository: Pick<WorkspaceRepository, 'load'>,
  scope: WorkspaceLoadOptions,
  callbacks: Parameters<typeof createRefreshQueue<Workspace>>[1],
) {
  let previous: Workspace | undefined;
  let generation = 0;
  const dirty = new Set(workspaceResources);
  const queue = createRefreshQueue(async () => {
    const epoch = generation;
    const resources = [...dirty];
    dirty.clear();
    try {
      const next = await repository.load({ ...scope, previous, resources });
      if (epoch === generation) previous = next;
      return next;
    } catch (error) {
      resources.forEach((resource) => dirty.add(resource));
      throw error;
    }
  }, callbacks);
  return {
    refresh(resources = workspaceResources) {
      resources.forEach((resource) => dirty.add(resource));
      return queue.refresh();
    },
    cancel() {
      generation++;
      previous = undefined;
      dirty.clear();
      workspaceResources.forEach((resource) => dirty.add(resource));
      queue.cancel();
    },
  };
}
