import * as THREE from 'three';
import { addSceneryMeshes, sceneryMeshGroups } from './scenery-meshes';
import { sceneryRect, sceneryVariant, normalizeSceneryColor } from './scenery';
import { normalizeSceneryStyle } from './scenery-styles';
import { normalizeSceneryHeight } from './scenery-dimensions';
import { isContinuousSurface } from './scenery-surfaces';
import { disposeSceneObject } from './scene-resources';
import type { BattleMapObject } from './types';

function appearanceSignature(objects: BattleMapObject[], cellMetres: number) {
  return JSON.stringify([
    cellMetres,
    objects.map((o) => [
      o.id,
      o.object_type,
      sceneryRect(o),
      o.z,
      o.visible,
      sceneryVariant(o.object_type, o.metadata.variant),
      normalizeSceneryColor(o.metadata.color),
      normalizeSceneryStyle(o.metadata.style),
      normalizeSceneryHeight(o.metadata.height_metres),
      o.metadata.light_enabled !== false,
    ]),
  ]);
}

/** Retain untouched instance batches across edits and realtime refreshes. */
export class SceneryMeshLayer {
  private batches = new Map<string, { signature: string; group: THREE.Group }>();
  constructor(
    private root: THREE.Group,
    private clock: { value: number },
  ) {}

  update(objects: BattleMapObject[], cellMetres: number) {
    // Keep instances together locally: one torch/door change must not rebuild
    // every matching element across the whole map. Spatial batches also cull
    // independently when the camera shows only part of a large scene.
    const groups = new Map<string, BattleMapObject[]>();
    for (const [family, entries] of sceneryMeshGroups(objects))
      for (const object of entries) {
        const rect = sceneryRect(object)!;
        const key = `${family}:region:${Math.floor(rect.x / 8)}:${Math.floor(rect.y / 8)}`;
        const batch = groups.get(key) ?? [];
        batch.push(object);
        groups.set(key, batch);
      }
    const surfaces = objects.filter((o) => isContinuousSurface(o.object_type) && sceneryRect(o));
    if (surfaces.length) groups.set('continuous-surfaces', surfaces);
    let changed = false;
    for (const [key, old] of this.batches) {
      if (groups.has(key)) continue;
      this.root.remove(old.group);
      disposeSceneObject(old.group);
      this.batches.delete(key);
      changed = true;
    }
    for (const [key, objectsInBatch] of groups) {
      // Surface order defines overlapping ownership. Other batches have no
      // painter's order and can be made stable even when a response is reordered.
      const entries =
        key === 'continuous-surfaces'
          ? objectsInBatch
          : [...objectsInBatch].sort((a, b) => a.id.localeCompare(b.id));
      const signature = appearanceSignature(entries, cellMetres);
      const old = this.batches.get(key);
      if (old?.signature === signature) continue;
      const group = new THREE.Group();
      group.name = `scenery:${key}`;
      try {
        addSceneryMeshes(group, entries, this.clock, cellMetres);
      } catch (error) {
        disposeSceneObject(group);
        throw error;
      }
      if (old) {
        this.root.remove(old.group);
        disposeSceneObject(old.group);
      }
      this.root.add(group);
      this.batches.set(key, { signature, group });
      changed = true;
    }
    return changed;
  }

  dispose() {
    for (const { group } of this.batches.values()) {
      this.root.remove(group);
      disposeSceneObject(group);
    }
    this.batches.clear();
  }
}
