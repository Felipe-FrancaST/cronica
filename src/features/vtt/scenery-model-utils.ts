import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Part } from './scenery-meshes';

export function partBounds(parts: Part[]) {
  const bounds = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    matrix.compose(
      new THREE.Vector3(...part.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
      new THREE.Vector3(...(part.scale ?? [1, 1, 1])),
    );
    bounds.union(part.geometry.boundingBox!.clone().applyMatrix4(matrix));
  }
  return bounds;
}

// Static detail shares a draw per material. Flame geometry stays separate so
// its existing vertex animation still runs without moving logs or furniture.
export function consolidateParts(parts: Part[]): Part[] {
  const groups = new Map<string, Part[]>();
  const result: Part[] = [];
  for (const part of parts) {
    if (part.geometry.type === 'LatheGeometry' && part.material.emissiveIntensity > 0) {
      result.push(part);
      continue;
    }
    const m = part.material;
    const key = [
      m.color.getHexString(),
      m.emissive.getHexString(),
      m.emissiveIntensity,
      m.roughness,
      m.metalness,
      m.side,
      m.transparent,
      m.opacity,
      m.vertexColors,
      m.map?.uuid ?? '',
      part.tint !== false,
    ].join(':');
    const group = groups.get(key) ?? [];
    group.push(part);
    groups.set(key, group);
  }
  const matrix = new THREE.Matrix4();
  for (const group of groups.values()) {
    const geometries = group.map((part) => {
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      matrix.compose(
        new THREE.Vector3(...part.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(...(part.scale ?? [1, 1, 1])),
      );
      geometry.applyMatrix4(matrix);
      // Geometry types have different auxiliary attributes; these three are
      // the complete attributes used by these static standard materials.
      for (const name of Object.keys(geometry.attributes))
        if (!['position', 'normal', 'uv', 'color'].includes(name)) geometry.deleteAttribute(name);
      if (!geometry.attributes.uv)
        geometry.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(
            new Float32Array(geometry.attributes.position.count * 2),
            2,
          ),
        );
      return geometry;
    });
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error('Não foi possível combinar os detalhes do cenário.');
    result.push({
      geometry: merged,
      material: group[0].material,
      position: [0, 0, 0],
      tint: group[0].tint,
    });
    geometries.forEach((g) => g.dispose());
  }
  const retainedGeometry = new Set(result.map((p) => p.geometry));
  const retainedMaterial = new Set(result.map((p) => p.material));
  new Set(parts.map((p) => p.geometry)).forEach((g) => {
    if (!retainedGeometry.has(g)) g.dispose();
  });
  new Set(parts.map((p) => p.material)).forEach((m) => {
    if (!retainedMaterial.has(m)) m.dispose();
  });
  const bounds = partBounds(result);
  const radius = Math.max(
    Math.abs(bounds.min.x),
    Math.abs(bounds.max.x),
    Math.abs(bounds.min.z),
    Math.abs(bounds.max.z),
  );
  const fit = Math.min(1, 0.49 / Math.max(radius, 0.001));
  for (const part of result) {
    part.position[0] *= fit;
    part.position[2] *= fit;
    part.scale = [(part.scale?.[0] ?? 1) * fit, part.scale?.[1] ?? 1, (part.scale?.[2] ?? 1) * fit];
  }
  return result;
}
