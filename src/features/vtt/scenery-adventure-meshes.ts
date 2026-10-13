import * as THREE from 'three';
import type { Part } from './scenery-meshes';

export function adventureSceneryParts(
  kind: string,
  variant: string,
  material: (
    color: string,
    extra?: THREE.MeshStandardMaterialParameters,
  ) => THREE.MeshStandardMaterial,
): Part[] | null {
  if (
    ![
      'lanternpost',
      'candelabra',
      'fireplace',
      'beacon',
      'gong',
      'pressureplate',
      'secretwall',
      'supplycrate',
    ].includes(kind)
  )
    return null;
  const p: Part[] = [];
  const wood = material('#65442e'),
    stone = material('#8c8d86'),
    iron = material('#42474d', { metalness: 0.65 }),
    gold = material('#be963e', { metalness: 0.7 });
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m = stone,
    rotation?: [number, number, number],
  ) =>
    p.push({
      geometry: new THREE.BoxGeometry(w, h, d),
      material: m,
      position: [x, y, z],
      rotation,
    });
  const cyl = (r: number, h: number, x: number, y: number, z: number, m = iron) =>
    p.push({ geometry: new THREE.CylinderGeometry(r, r, h, 10), material: m, position: [x, y, z] });
  const flame = (x: number, y: number, z: number, blue = false) =>
    p.push({
      geometry: new THREE.LatheGeometry(
        [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.035, 0.02),
          new THREE.Vector2(0.05, 0.07),
          new THREE.Vector2(0.02, 0.14),
          new THREE.Vector2(0, 0.2),
        ],
        8,
      ),
      material: material(blue ? '#9bccff' : '#ffbc65', {
        emissive: blue ? '#56aaff' : '#ff8038',
        emissiveIntensity: 1.6,
      }),
      position: [x, y, z],
      tint: false,
    });
  if (kind === 'lanternpost') {
    box(0.3, 0.08, 0.3, 0, 0.04, 0);
    cyl(0.035, 1.1, 0, 0.59, 0);
    box(0.3, 0.035, 0.05, 0.1, 1.12, 0, iron);
    box(
      0.25,
      0.28,
      0.22,
      0.2,
      0.92,
      0,
      material('#ffe2a2', { emissive: '#ffa958', emissiveIntensity: 0.8 }),
    );
    for (const x of [0.09, 0.31])
      for (const z of [-0.12, 0.12]) box(0.018, 0.32, 0.018, x, 0.94, z, iron);
    box(0.3, 0.035, 0.27, 0.2, 1.105, 0, iron);
    box(0.3, 0.035, 0.27, 0.2, 0.77, 0, iron);
  } else if (kind === 'candelabra') {
    cyl(0.2, 0.04, 0, 0.02, 0, gold);
    cyl(0.027, 0.62, 0, 0.34, 0, gold);
    box(0.66, 0.035, 0.035, 0, 0.6, 0, gold);
    for (const x of [-0.3, 0, 0.3]) {
      cyl(0.055, 0.035, x, 0.66, 0, gold);
      cyl(0.025, 0.22, x, 0.78, 0, material('#e9ddbf'));
      flame(x, 0.9, 0);
    }
  } else if (kind === 'fireplace') {
    box(0.92, 0.12, 0.72, 0, 0.06, 0);
    box(0.16, 0.76, 0.6, -0.38, 0.5, 0);
    box(0.16, 0.76, 0.6, 0.38, 0.5, 0);
    box(0.64, 0.8, 0.12, 0, 0.54, -0.24);
    box(0.96, 0.15, 0.7, 0, 0.9, 0);
    for (const x of [-0.19, 0.17]) {
      box(0.42, 0.065, 0.08, x, 0.2, 0, wood, [0, x, 0]);
      flame(x, 0.25, 0);
    }
  } else if (kind === 'beacon') {
    cyl(0.3, 0.09, 0, 0.05, 0);
    cyl(0.17, 0.32, 0, 0.25, 0);
    p.push({
      geometry: new THREE.OctahedronGeometry(0.3),
      material: material('#89cff8', {
        emissive: '#3f9feb',
        emissiveIntensity: 1.25,
        metalness: 0.15,
        roughness: 0.22,
      }),
      position: [0, 0.73, 0],
      scale: [0.75, 1.6, 0.75],
      tint: false,
    });
  } else if (kind === 'gong') {
    for (const x of [-0.4, 0.4]) {
      box(0.09, 0.9, 0.1, x, 0.45, 0, wood);
      box(0.23, 0.05, 0.36, x, 0.025, 0, wood);
    }
    box(0.94, 0.08, 0.12, 0, 0.88, 0, wood);
    p.push({
      geometry: new THREE.CylinderGeometry(0.3, 0.3, 0.025, 24),
      material:
        variant === 'activated'
          ? material('#d4b462', { emissive: '#ac682a', emissiveIntensity: 0.25 })
          : gold,
      position: [0, 0.5, 0],
      rotation: [Math.PI / 2, 0, 0],
    });
    cyl(0.06, 0.025, 0, 0.5, 0.04, gold);
    box(0.035, 0.35, 0.035, 0.46, 0.37, 0.02, wood);
  } else if (kind === 'pressureplate') {
    box(0.9, 0.07, 0.9, 0, 0.035, 0, stone);
    box(
      0.72,
      0.035,
      0.72,
      0,
      variant === 'activated' ? 0.075 : 0.12,
      0,
      variant === 'activated' ? material('#bd9857') : iron,
    );
    for (const x of [-0.32, 0.32])
      for (const z of [-0.32, 0.32]) cyl(0.028, 0.015, x, 0.15, z, gold);
  } else if (kind === 'secretwall') {
    if (variant !== 'open')
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 3; col++)
          box(
            0.31,
            0.19,
            0.18,
            -0.32 + col * 0.32,
            0.11 + row * 0.2,
            0,
            (col + row) % 2 ? stone : material('#737d77'),
          );
    else {
      box(0.13, 1.05, 0.26, -0.4, 0.525, 0);
      box(0.13, 1.05, 0.26, 0.4, 0.525, 0);
      box(0.9, 0.12, 0.26, 0, 1.02, 0);
    }
  } else {
    box(0.78, 0.52, 0.65, 0, 0.3, 0, wood);
    box(0.68, 0.025, 0.53, 0, 0.58, 0, material('#34291f'));
    box(
      0.82,
      0.08,
      0.68,
      0,
      variant === 'open' ? 0.86 : 0.6,
      variant === 'open' ? -0.29 : 0,
      wood,
      variant === 'open' ? [-1, 0, 0] : undefined,
    );
    for (const x of [-0.29, 0.29]) box(0.04, 0.57, 0.69, x, 0.3, 0, iron);
    if (variant === 'open')
      for (const x of [-0.2, 0.04, 0.22]) cyl(0.09, 0.14, x, 0.57, 0, material('#bba779'));
  }
  return p;
}
