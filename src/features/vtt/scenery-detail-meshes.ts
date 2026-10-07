import * as THREE from 'three';
import type { Part } from './scenery-meshes';
type Material = (
  color: string,
  options?: THREE.MeshStandardMaterialParameters,
) => THREE.MeshStandardMaterial;

// Small, purposeful details for each prop family. They are baked into the
// existing model and instanced together; no independent scene objects.
export function sceneryDetailParts(kind: string, variant: string, material: Material): Part[] {
  const p: Part[] = [],
    materials = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string) => {
    let m = materials.get(color);
    if (!m) {
      m = material(color);
      materials.set(color, m);
    }
    return m;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    c: string,
    x: number,
    y: number,
    z: number,
    r: [number, number, number] = [0, 0, 0],
    accent = false,
  ) =>
    p.push({
      geometry: new THREE.BoxGeometry(w, h, d),
      material: mat(c),
      position: [x, y, z],
      rotation: r,
      tint: !accent,
    });
  const orb = (r: number, c: string, x: number, y: number, z: number, sy = 1, accent = false) =>
    p.push({
      geometry: new THREE.IcosahedronGeometry(r, 0),
      material: mat(c),
      position: [x, y, z],
      scale: [1, sy, 1],
      tint: !accent,
    });
  const ring = (
    r: number,
    t: number,
    c: string,
    x: number,
    y: number,
    z: number,
    rotation: [number, number, number] = [Math.PI / 2, 0, 0],
  ) =>
    p.push({
      geometry: new THREE.TorusGeometry(r, t, 4, 16),
      material: mat(c),
      position: [x, y, z],
      rotation,
      tint: false,
    });
  if (kind === 'ruin') {
    box(0.92, 0.035, 0.83, '#888c7d', 0, 0.014, 0);
    for (let n = 0; n < 7; n++)
      orb(
        0.033 + (n % 3) * 0.018,
        '#b2af98',
        Math.cos(n * 2.4) * 0.37,
        0.065,
        Math.sin(n * 2.4) * 0.31,
        0.7,
      );
    for (let n = 0; n < 5; n++)
      orb(0.026, '#79935e', -0.34, 0.12 + n * 0.085, -0.25 + Math.sin(n) * 0.04, 0.7);
  } else if (kind === 'tent') {
    for (const x of [-0.4, 0.4])
      for (const z of [-0.4, 0.4]) {
        box(0.018, 0.16, 0.018, '#8d7450', x, 0.08, z);
        box(0.012, 0.42, 0.012, '#dfcda4', x * 0.8, 0.23, z * 0.8, [
          z > 0 ? 0.36 : -0.36,
          0,
          x > 0 ? -0.4 : 0.4,
        ]);
      }
    for (let n = 0; n < 5; n++) box(0.045, 0.06, 0.017, '#d8bd90', -0.24 + n * 0.12, 0.08, 0.407);
  } else if (kind === 'cart') {
    for (const x of [-0.42, 0.42])
      for (const z of [-0.25, 0.25]) {
        if (variant === 'broken' && x > 0 && z > 0) continue;
        for (let n = 0; n < 6; n++)
          box(0.017, 0.28, 0.018, '#be9d6c', x, 0.21, z, [(n * Math.PI) / 3, 0, 0]);
        ring(0.037, 0.014, '#a7a38a', x, 0.21, z, [0, Math.PI / 2, 0]);
      }
    for (let n = 0; n < 6; n++) box(0.6, 0.008, 0.009, '#57452f', 0, 0.39, -0.28 + n * 0.11);
  } else if (kind === 'portal') {
    if (variant === 'default')
      for (let n = 0; n < 9; n++) {
        const a = (n * Math.PI * 2) / 9;
        box(
          0.022,
          0.035,
          0.009,
          '#e4d4a1',
          Math.cos(a) * 0.34,
          0.63 + Math.sin(a) * 0.5,
          0.06,
          [0, 0, a],
          true,
        );
      }
    else if (variant === 'door')
      for (const y of [0.18, 0.36, 0.56, 0.78, 0.96]) {
        box(0.086, 0.018, 0.017, '#c4bca0', -0.37, y, 0.106);
        box(0.086, 0.018, 0.017, '#c4bca0', 0.37, y, 0.106);
      }
    else for (let n = 0; n < 5; n++) orb(0.045, '#819367', -0.28 + n * 0.13, 0.025, 0.17, 0.35);
  } else if (kind === 'barrel') {
    if (variant === 'crate')
      for (let n = 0; n < 6; n++) box(0.011, 0.56, 0.013, '#725435', -0.26 + n * 0.1, 0.35, 0.351);
    else {
      for (let n = 0; n < 12; n++) {
        const a = (n * Math.PI * 2) / 12;
        box(0.008, 0.61, 0.009, '#725435', Math.cos(a) * 0.266, 0.36, Math.sin(a) * 0.266, [
          0,
          -a,
          0,
        ]);
      }
      ring(0.21, 0.014, '#d0b584', 0, 0.721, 0);
      orb(0.025, '#6b5738', 0.08, 0.73, 0.05, 0.4);
    }
  } else if (kind === 'campfire' || kind === 'fire') {
    for (let n = 0; n < 9; n++)
      orb(
        0.022,
        n % 2 ? '#9d6032' : '#352d28',
        Math.cos(n * 2.4) * 0.22,
        variant === 'brazier' ? 0.38 : 0.065,
        Math.sin(n * 2.4) * 0.21,
        0.65,
        true,
      );
    if (variant === 'brazier') ring(0.29, 0.027, '#9f9c83', 0, 0.45, 0);
  } else if (kind === 'boat') {
    for (let n = 0; n < 7; n++) box(0.008, 0.011, 0.5, '#795c3c', -0.19 + n * 0.063, 0.259, 0);
    ring(0.04, 0.012, '#d6c9a5', 0.2, 0.27, 0.23);
    if (variant === 'ship') {
      for (const x of [-0.26, 0.26])
        for (const z of [-0.22, 0, 0.22]) box(0.027, 0.17, 0.027, '#bb9d6c', x, 0.33, z);
      box(0.03, 0.025, 0.67, '#bb9d6c', -0.26, 0.42, 0);
      box(0.03, 0.025, 0.67, '#bb9d6c', 0.26, 0.42, 0);
      for (const z of [-0.19, 0.1])
        for (const x of [-0.19, 0.19])
          box(0.008, 1.04, 0.008, '#d6c9a5', x / 2, 0.75, z, [0, 0, x * 0.19]);
    } else
      for (const x of [-0.3, 0.3])
        box(0.018, 0.022, 0.5, '#d7bc8c', x, 0.29, 0.02, [0, x * 0.7, 0]);
  } else if (kind === 'statue') {
    box(0.31, 0.07, 0.035, '#ded6b5', 0, 0.22, 0.216);
    for (let n = 0; n < 4; n++)
      box(0.04, 0.01, 0.009, '#716f5a', -0.09 + n * 0.06, 0.22, 0.238, [0, 0, 0], true);
  } else if (kind === 'chest') {
    for (let n = 0; n < 4; n++) box(0.64, 0.009, 0.007, '#b59661', 0, 0.1 + n * 0.074, 0.256);
    for (const x of [-0.24, 0.24])
      for (const y of [0.11, 0.3]) orb(0.01, '#e0c788', x, y, 0.272, 1, true);
    if (variant === 'open')
      for (let n = 0; n < 7; n++)
        orb(
          0.023,
          '#dfc275',
          Math.cos(n * 2.4) * 0.16,
          0.4 + (n % 2) * 0.012,
          Math.sin(n * 2.4) * 0.1,
          0.25,
          true,
        );
  } else if (kind === 'counter' || kind === 'market') {
    for (let n = 0; n < 7; n++)
      box(
        0.011,
        0.41,
        0.008,
        variant === 'stone' ? '#827e68' : '#a98c5e',
        -0.31 + n * 0.103,
        0.25,
        0.21,
      );
    if (kind === 'market')
      for (let n = 0; n < 7; n++)
        box(0.047, 0.011, 0.54, n % 2 ? '#d0bf93' : '#718b83', -0.32 + n * 0.1, 0.93, 0);
    if (variant === 'merchant' || variant === 'produce')
      for (const x of [-0.23, 0.2]) {
        box(0.19, 0.024, 0.16, '#896e4b', x, 0.57, 0);
        orb(0.035, '#bfa365', x, 0.63, 0, 0.9, true);
      }
    if (variant === 'weapons')
      for (const x of [-0.2, 0, 0.2]) {
        box(0.016, 0.28, 0.012, '#adb3a6', x, 0.76, -0.16, [0, 0, 0.15], true);
        box(0.1, 0.022, 0.022, '#ada275', x, 0.63, -0.16, [0, 0, 0], true);
      }
  } else if (kind === 'gravestone' || kind === 'cross') {
    for (let n = 0; n < 4; n++)
      orb(0.026, '#7c9361', -0.16 + n * 0.1, 0.03, 0.09 + (n % 2) * 0.04, 0.3);
    if (variant !== 'broken')
      ring(
        kind === 'cross' ? 0.085 : 0.057,
        0.01,
        '#c4c2a7',
        0,
        kind === 'cross' ? 0.58 : 0.48,
        0.079,
        [0, 0, 0],
      );
  } else if (kind === 'fence') {
    if (variant === 'iron')
      for (let n = 0; n < 7; n++)
        p.push({
          geometry: new THREE.ConeGeometry(0.027, 0.085, 4),
          material: mat('#acb2a2'),
          position: [(n - 3) * 0.12, 0.68, 0],
          tint: false,
        });
    else if (variant !== 'palisade')
      for (let n = 0; n < 6; n++)
        box(0.019, 0.016, 0.013, '#64583e', -0.4 + n * 0.16, 0.24, 0.058, [0, 0, 0], true);
  } else if (kind === 'well') {
    for (let row = 0; row < 3; row++)
      for (let n = 0; n < 10; n++) {
        const a = ((n + (row % 2) * 0.5) * Math.PI) / 5;
        box(
          0.035,
          0.012,
          0.028,
          '#777c68',
          Math.cos(a) * 0.341,
          0.08 + row * 0.11,
          Math.sin(a) * 0.341,
          [0, -a, 0],
        );
      }
    ring(0.34, 0.034, '#c3c0a6', 0, 0.42, 0);
    if (variant !== 'ruined') {
      box(0.11, 0.13, 0.12, '#a68b60', 0.14, 0.16, 0.35);
      ring(0.05, 0.011, '#b5aa85', 0.14, 0.27, 0.35, [0, 0, 0]);
    }
  } else if (kind === 'bridge') {
    for (let n = 0; n < 12; n++)
      box(
        0.67,
        0.015,
        0.011,
        variant === 'stone' ? '#c4c7b0' : '#b7a17a',
        0,
        0.178,
        -0.44 + n * 0.08,
      );
    for (const x of [-0.35, 0.35])
      for (const z of [-0.3, -0.1, 0.1, 0.3])
        box(0.016, 0.25, 0.016, variant === 'rope' ? '#d3c29a' : '#b7a17a', x, 0.31, z);
  } else if (kind === 'table') {
    if (variant !== 'round')
      for (let n = 0; n < 5; n++) box(0.72, 0.005, 0.008, '#977b4e', 0, 0.54, -0.25 + n * 0.12);
    for (const x of [-0.19, 0.19]) {
      ring(0.025, 0.007, '#dfc9a1', x, 0.6, 0.12, [0, Math.PI / 2, 0]);
      box(0.04, 0.055, 0.04, '#b9a07a', x + 0.025, 0.585, 0.12);
    }
    box(0.15, 0.016, 0.1, '#e3d5b4', 0, 0.55, -0.1);
  } else if (kind === 'chair') {
    if (variant !== 'stool') {
      box(0.025, 0.24, 0.025, '#c2a676', -0.12, 0.55, -0.13);
      box(0.025, 0.24, 0.025, '#c2a676', 0.12, 0.55, -0.13);
    }
    if (variant === 'throne') {
      box(0.28, 0.05, 0.27, '#9b607a', 0, 0.38, 0);
      for (const x of [-0.21, 0.21]) orb(0.03, '#d9bc78', x, 1, -0.17, 1, true);
    } else for (const x of [-0.15, 0.15]) box(0.03, 0.03, 0.28, '#ae8f60', x, 0.15, 0);
  } else if (kind === 'bookshelf') {
    box(0.79, 0.055, 0.36, '#d0b588', 0, 1.01, 0);
    for (const y of [0.1, 0.38, 0.66, 0.96]) box(0.68, 0.012, 0.015, '#e2c694', 0, y, 0.17);
    if (variant === 'default')
      for (const x of [-0.23, 0, 0.23])
        for (const y of [0.18, 0.46, 0.74])
          box(0.035, 0.013, 0.013, '#dcc590', x, y, 0.1, [0, 0, 0], true);
    else if (variant === 'potions')
      for (const x of [-0.23, 0, 0.23])
        for (const y of [0.27, 0.55, 0.83]) orb(0.016, '#b6a17e', x, y, 0, 0.65, true);
  } else if (kind === 'torch') {
    ring(0.047, 0.014, '#9c9984', 0, 0.68, 0);
    if (variant === 'lantern') ring(0.05, 0.012, '#adab8d', 0, 1.08, 0, [0, 0, 0]);
    if (variant === 'arcane')
      for (let n = 0; n < 6; n++)
        orb(
          0.013,
          '#d2e5d9',
          Math.cos(n) * 0.14,
          0.85 + Math.sin(n) * 0.09,
          Math.sin(n) * 0.1,
          1,
          true,
        );
  } else if (kind === 'signpost') {
    if (variant === 'banner') {
      box(0.2, 0.04, 0.011, '#dec58a', 0.18, 0.83, 0.035);
      box(0.04, 0.34, 0.011, '#dec58a', 0.18, 0.66, 0.035);
    } else for (const x of [-0.14, 0.27]) orb(0.012, '#c4be96', x, 0.81, 0.045, 1, true);
  }
  return p;
}
