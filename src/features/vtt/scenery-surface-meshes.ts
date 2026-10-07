import * as THREE from 'three';
import { scenerySurfaces, type SurfacePlan } from './scenery-surfaces';
import { surfacePatternCanvas } from './scenery-art';
import { sceneryRect, sceneryVariant } from './scenery';
import { sceneryHeightMetres } from './scenery-dimensions';
import type { BattleMapObject } from './types';

export function addSurfaceMeshes(
  layer: THREE.Group,
  objects: BattleMapObject[],
  cellMetres: number,
) {
  const plan = scenerySurfaces(objects);
  for (const group of plan.groups.values()) {
    if (!group.rectangles.length) continue;
    const object = group.object;
    const r = sceneryRect(object)!;
    const y =
      object.z +
      (object.object_type === 'road' ? 0.001 : object.object_type === 'floor' ? 0.007 : 0.035) +
      sceneryHeightMetres(
        object.object_type,
        sceneryVariant(object.object_type, object.metadata.variant),
        r.width,
        r.height,
        object.metadata.height_metres,
      ) /
        cellMetres;
    const positions: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    for (const rect of group.rectangles) {
      const { x, y: z, width: w, height: h } = rect;
      const start = positions.length / 3;
      positions.push(x, y, z, x, y, z + h, x + w, y, z + h, x + w, y, z);
      // UVs are world coordinates: adjacent pieces always share the same phase.
      uvs.push(x, -z, x, -z - h, x + w, -z - h, x + w, -z);
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const texture = new THREE.CanvasTexture(surfacePatternCanvas(object));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: ['water', 'ice'].includes(object.object_type) ? 0.35 : 0.94,
      metalness: object.object_type === 'water' ? 0.12 : 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
      transparent: !object.visible,
      opacity: object.visible ? 1 : 0.38,
      depthWrite: object.visible,
      ...(object.object_type === 'lava' && object.metadata.light_enabled !== false
        ? { emissive: '#ff6028', emissiveMap: texture, emissiveIntensity: 0.65 }
        : {}),
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.userData.surfacePlan = plan satisfies SurfacePlan;
    mesh.userData.surfaceKey = group.key;
    mesh.name = 'continuous-' + object.object_type;
    layer.add(mesh);
  }
}
