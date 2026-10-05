import * as THREE from 'three';
import { sceneryRect } from './scenery';
import { surfaceCanvas } from './scenery-art';
import type { BattleMapObject } from './types';
interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  position: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
}
const material = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true, ...extra });
export function terrainMaterial(kind: string) {
  const texture = new THREE.CanvasTexture(surfaceCanvas(kind));
  texture.colorSpace = THREE.SRGBColorSpace;
  return material('#ffffff', {
    map: texture,
    roughness: kind === 'water' ? 0.28 : 0.86,
    metalness: kind === 'water' ? 0.25 : 0,
    ...(kind === 'lava'
      ? { emissive: '#f16932', emissiveMap: texture, emissiveIntensity: 0.75 }
      : {}),
  });
}
function parts(kind: string): Part[] {
  if (kind === 'tree')
    return [
      {
        geometry: new THREE.CylinderGeometry(0.075, 0.115, 1.15, 7),
        material: material('#73563b'),
        position: [0, 0.59, 0],
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.37, 1),
        material: material('#426c42'),
        position: [-0.16, 1.15, 0.08],
        scale: [1, 1.17, 1],
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.39, 1),
        material: material('#68915a'),
        position: [0.16, 1.32, -0.07],
        scale: [1, 1.12, 1],
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.31, 1),
        material: material('#2b5639'),
        position: [0.03, 1.04, -0.19],
      },
    ];
  if (kind === 'pine')
    return [
      {
        geometry: new THREE.CylinderGeometry(0.055, 0.085, 1.6, 6),
        material: material('#73563b'),
        position: [0, 0.8, 0],
      },
      ...[0.4, 0.32, 0.24].map((radius, i) => ({
        geometry: new THREE.ConeGeometry(radius, 0.85, 7),
        material: material(['#285c45', '#377659', '#598768'][i]),
        position: [0, 0.85 + i * 0.38, 0] as [number, number, number],
      })),
    ];
  if (kind === 'rock')
    return [
      {
        geometry: new THREE.DodecahedronGeometry(0.34, 0),
        material: terrainMaterial('stone'),
        position: [-0.12, 0.25, 0.04],
        scale: [1, 1.1, 1],
      },
      {
        geometry: new THREE.DodecahedronGeometry(0.21, 0),
        material: material('#a3a594'),
        position: [0.24, 0.12, -0.17],
        scale: [1, 0.8, 1],
      },
    ];
  if (kind === 'mountain')
    return [
      {
        geometry: new THREE.ConeGeometry(0.47, 1.7, 5),
        material: material('#777e76'),
        position: [-0.03, 0.87, 0.02],
      },
      {
        geometry: new THREE.ConeGeometry(0.21, 0.57, 5),
        material: material('#e3e4d6'),
        position: [-0.03, 1.45, 0.02],
      },
      {
        geometry: new THREE.ConeGeometry(0.26, 0.75, 6),
        material: material('#505f56'),
        position: [0.19, 0.4, 0.16],
      },
    ];
  if (kind === 'ruin')
    return [
      ...[
        [-0.32, -0.3],
        [0.32, -0.3],
        [-0.32, 0.28],
      ].map(([x, z], i) => ({
        geometry: new THREE.CylinderGeometry(0.105, 0.12, i === 2 ? 0.6 : 1, 6),
        material: terrainMaterial('stone'),
        position: [x, i === 2 ? 0.3 : 0.5, z] as [number, number, number],
      })),
      {
        geometry: new THREE.BoxGeometry(0.88, 0.16, 0.24),
        material: material('#b7af96'),
        position: [0, 1.07, -0.3],
      },
      {
        geometry: new THREE.DodecahedronGeometry(0.14),
        material: material('#8d8c7a'),
        position: [0.25, 0.13, 0.27],
      },
    ];
  if (kind === 'fire')
    return [
      {
        geometry: new THREE.BoxGeometry(0.96, 0.04, 0.96),
        material: terrainMaterial('fire'),
        position: [0, 0.045, 0],
      },
      ...[-0.22, 0, 0.22].map((x, i) => ({
        geometry: new THREE.ConeGeometry(0.14, 0.5 + i * 0.14, 5),
        material: material(i === 1 ? '#ffd877' : '#fb8638', {
          emissive: i === 1 ? '#fca34e' : '#f85c25',
          emissiveIntensity: 1,
        }),
        position: [x, 0.28 + i * 0.06, Math.sin(i * 3) * 0.14] as [number, number, number],
        rotation: [0.13, x, 0.07] as [number, number, number],
      })),
    ];
  return [
    {
      geometry: new THREE.BoxGeometry(0.98, 0.035, 0.98),
      material: terrainMaterial(kind),
      position: [0, 0.05, 0],
    },
  ];
}
export function addSceneryMeshes(layer: THREE.Group, objects: BattleMapObject[]) {
  const groups = new Map<string, BattleMapObject[]>();
  for (const object of objects) {
    if (!sceneryRect(object)) continue;
    const key = object.object_type + ':' + object.visible;
    const list = groups.get(key) ?? [];
    list.push(object);
    groups.set(key, list);
  }
  const orientation = new THREE.Matrix4(),
    base = new THREE.Matrix4(),
    local = new THREE.Matrix4(),
    matrix = new THREE.Matrix4();
  for (const entries of groups.values()) {
    const kind = entries[0].object_type,
      visible = entries[0].visible;
    for (const part of parts(kind)) {
      if (!visible) {
        part.material.transparent = true;
        part.material.opacity = 0.38;
        part.material.depthWrite = false;
      }
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, entries.length);
      entries.forEach((object, i) => {
        const r = sceneryRect(object)!;
        const height = ['water', 'lava', 'fire'].includes(kind)
          ? 1
          : Math.min(3.8, Math.sqrt(r.width * r.height));
        // Rotation happens inside a fixed rectangular footprint, matching the movement rules.
        base.makeScale(r.width, height, r.height);
        base.setPosition(r.x + r.width / 2, object.z + 0.035, r.y + r.height / 2);
        orientation.makeRotationY(
          ['water', 'lava'].includes(kind) ? 0 : (r.rotation * Math.PI) / 180,
        );
        local.compose(
          new THREE.Vector3(...part.position),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
          new THREE.Vector3(...(part.scale ?? [1, 1, 1])),
        );
        matrix.copy(base).multiply(orientation).multiply(local);
        mesh.setMatrixAt(i, matrix);
        // Slight deterministic variation keeps repeated pieces from looking stamped.
        if (kind === 'tree' || kind === 'rock')
          mesh.setColorAt(
            i,
            new THREE.Color().setHSL(0.29, 0.08, 0.82 + ((r.x * 7 + r.y * 3) % 5) * 0.025),
          );
      });
      mesh.userData.sceneryCells = entries.map((object) => {
        const r = sceneryRect(object)!;
        return { x: r.x, y: r.y };
      });
      mesh.castShadow = !['water', 'lava', 'fire'].includes(kind);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      layer.add(mesh);
    }
  }
}
