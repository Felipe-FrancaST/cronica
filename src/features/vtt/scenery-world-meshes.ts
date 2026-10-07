import * as THREE from 'three';
import type { Part } from './scenery-meshes';

type Material = (
  color: string,
  parameters?: THREE.MeshStandardMaterialParameters,
) => THREE.MeshStandardMaterial;
// Every model is built once per kind/variant and shared by all its instances.
export function worldSceneryParts(
  kind: string,
  variant: string,
  material: Material,
  _terrain: (kind: string) => THREE.MeshStandardMaterial,
  fire: () => Part[],
): Part[] | null {
  const box = (w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0): Part => ({
    geometry: new THREE.BoxGeometry(w, h, d),
    material: material(c),
    position: [x, y, z],
  });
  const cylinder = (r: number, h: number, c: string, x = 0, y = 0, z = 0, sides = 10): Part => ({
    geometry: new THREE.CylinderGeometry(r, r, h, sides),
    material: material(c),
    position: [x, y, z],
  });
  const orb = (r: number, c: string, x: number, y: number, z: number): Part => ({
    geometry: new THREE.IcosahedronGeometry(r, 1),
    material: material(c),
    position: [x, y, z],
  });
  const stone = (x: number, y: number, z: number, r: number, c = '#96988a'): Part => ({
    geometry: new THREE.DodecahedronGeometry(r),
    material: material(c),
    position: [x, y, z],
  });
  const cone = (
    r: number,
    h: number,
    c: string,
    x: number,
    y: number,
    z: number,
    sides = 6,
  ): Part => ({
    geometry: new THREE.ConeGeometry(r, h, sides),
    material: material(c),
    position: [x, y, z],
  });
  const roof = (width: number, height: number, depth: number, c: string, y: number): Part => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(0, height);
    shape.lineTo(width / 2, 0);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    return { geometry, material: material(c), position: [0, y, 0] };
  };
  if (kind === 'ruin' && variant !== 'default') {
    const column = (x: number, z: number, h: number): Part[] => [
      cylinder(0.1, h, '#a8aa98', x, h / 2, z, 8),
      box(0.26, 0.09, 0.26, '#c8c2a9', x, h + 0.02, z),
      box(0.28, 0.08, 0.28, '#929686', x, 0.05, z),
    ];
    if (variant === 'wall')
      return Array.from({ length: 9 }, (_, i) =>
        box(
          0.24,
          0.16,
          0.2,
          i % 2 ? '#b0ad99' : '#878c7f',
          ((i % 3) - 1) * 0.25,
          0.1 + Math.floor(i / 3) * 0.17,
          0,
        ),
      );
    if (variant === 'columns')
      return [
        ...column(-0.26, -0.22, 0.9),
        ...column(0.25, -0.18, 0.52),
        ...column(-0.12, 0.24, 0.3),
        stone(0.27, 0.1, 0.25, 0.14),
      ];
    const result = [
      ...column(-0.3, 0, 0.8),
      ...column(0.3, 0, 0.8),
      box(0.8, 0.15, 0.25, '#c4bca4', 0, 0.94, 0),
    ];
    if (variant === 'temple')
      result.push(
        box(0.91, 0.1, 0.9, '#888e81', 0, 0.04, 0),
        ...column(-0.3, 0.31, 0.55),
        ...column(0.3, 0.31, 0.3),
        roof(0.89, 0.32, 0.29, '#c8baa0', 1.02),
        stone(0.18, 0.1, 0.32, 0.14),
      );
    else result.push({ ...box(0.24, 0.12, 0.28, '#aaa58f', 0, 1.04, 0), rotation: [0, 0, 0.12] });
    return result;
  }
  if (kind === 'cart' && variant !== 'default') {
    const result = [
      box(0.64, 0.12, 0.73, '#87603e', 0, 0.32, 0),
      box(0.72, 0.22, 0.06, '#b9915b', 0, 0.46, -0.36),
      box(0.72, 0.22, 0.06, '#b9915b', 0, 0.46, 0.36),
      box(0.07, 0.26, 0.73, '#987145', -0.34, 0.46, 0),
      box(0.07, 0.26, 0.73, '#987145', 0.34, 0.46, 0),
    ];
    for (const x of [-0.41, 0.41])
      for (const z of [-0.25, 0.25]) {
        if (variant === 'broken' && x > 0 && z > 0) continue;
        result.push({
          geometry: new THREE.TorusGeometry(0.18, 0.035, 6, 14),
          material: material('#4e4234'),
          position: [x, 0.22, z],
          rotation: [0, Math.PI / 2, 0],
          tint: false,
        });
      }
    for (const x of [-0.19, 0.19]) result.push(box(0.035, 0.04, 0.38, '#9b784c', x, 0.28, 0.51));
    if (variant === 'covered') {
      const shape = new THREE.Shape();
      shape.moveTo(-0.36, 0);
      shape.quadraticCurveTo(-0.36, 0.48, 0, 0.48);
      shape.quadraticCurveTo(0.36, 0.48, 0.36, 0);
      shape.lineTo(-0.36, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.77, bevelEnabled: false });
      g.translate(0, 0, -0.385);
      result.push(
        { geometry: g, material: material('#e0cc9e'), position: [0, 0.56, 0] },
        box(0.48, 0.35, 0.025, '#46392e', 0, 0.74, 0.4),
      );
    } else if (variant === 'goods')
      result.push(
        box(0.28, 0.27, 0.31, '#caa574', -0.15, 0.64, -0.17),
        cylinder(0.15, 0.28, '#8f6945', 0.16, 0.64, 0.17),
        box(0.29, 0.17, 0.27, '#ae8e5d', 0.17, 0.62, -0.17),
      );
    else
      result.push(
        { ...box(0.05, 0.4, 0.74, '#b49059', 0.15, 0.45, 0.03), rotation: [0, 0, 0.55] },
        stone(0.36, 0.1, 0.3, 0.12),
      );
    return result;
  }
  if (kind === 'tent' && variant !== 'default') {
    const cloth = variant === 'desert' ? '#d2b881' : variant === 'war' ? '#8c5353' : '#759791';
    const result = [
      roof(0.92, variant === 'desert' ? 0.47 : 0.69, 0.8, cloth, 0.04),
      { ...box(0.25, 0.32, 0.021, '#272e28', 0, 0.2, 0.411), tint: false },
    ];
    if (variant === 'pavilion')
      for (const x of [-0.41, 0.41])
        for (const z of [-0.36, 0.36])
          result.push(
            cylinder(0.022, 0.85, '#b4986b', x, 0.43, z),
            box(0.14, 0.2, 0.05, '#dbd0a2', x, 0.58, z),
          );
    if (variant === 'war')
      for (const x of [-0.38, 0.38])
        result.push(
          cylinder(0.016, 1.08, '#b19a72', x, 0.54, 0.35),
          box(0.16, 0.28, 0.018, '#b8644e', x + 0.06, 0.9, 0.35),
        );
    if (variant === 'desert') result.push(box(0.74, 0.018, 0.85, '#8e6550', 0, 0.036, 0));
    return result;
  }
  if (kind === 'counter' || kind === 'market') {
    const stoneCounter = variant === 'stone';
    const result = [
      box(0.77, 0.47, 0.37, stoneCounter ? '#8e948b' : '#916c45', 0, 0.27, 0),
      box(0.86, 0.07, 0.47, stoneCounter ? '#bec1ae' : '#d4b079', 0, 0.54, 0),
    ];
    for (const x of [-0.28, -0.09, 0.1, 0.29])
      result.push(box(0.018, 0.43, 0.023, '#694e34', x, 0.28, 0.195));
    if (kind === 'counter' && variant === 'default')
      for (const x of [-0.23, 0, 0.23])
        result.push({ ...cylinder(0.043, 0.085, '#d3bf89', x, 0.615, 0, 8), tint: false });
    if (kind === 'counter' && variant === 'merchant')
      result.push(
        box(0.54, 0.02, 0.3, '#8f657b', 0, 0.59, 0),
        box(0.14, 0.11, 0.13, '#baa672', 0.21, 0.66, -0.1),
      );
    if (kind === 'market') {
      for (const x of [-0.38, 0.38])
        for (const z of [-0.28, 0.28]) result.push(cylinder(0.02, 0.93, '#7c6242', x, 0.47, z));
      result.push(roof(0.98, 0.24, 0.78, '#bd9273', 0.94));
      for (const x of [-0.31, -0.1, 0.11, 0.32])
        result.push(box(0.1, 0.055, 0.76, '#e1ceb1', x, 1.02, 0));
      for (const x of [-0.24, 0, 0.24])
        result.push(
          variant === 'weapons'
            ? box(0.025, 0.25, 0.04, '#bdc8c3', x, 0.7, 0)
            : orb(0.064, variant === 'produce' ? '#9ba65f' : '#d7a255', x, 0.66, 0),
        );
    }
    return result;
  }
  if (kind === 'gravestone' || kind === 'cross') {
    const result = [box(0.58, 0.08, 0.38, '#7f877c', 0, 0.06, 0)];
    if (kind === 'cross') {
      const c = variant === 'default' ? '#8f7753' : '#a6b3aa';
      result.push(box(0.1, 0.91, 0.1, c, 0, 0.53, 0), box(0.51, 0.105, 0.1, c, 0, 0.76, 0));
      if (variant === 'rune')
        result.push({
          ...box(0.034, 0.28, 0.018, '#b5e7d9', 0, 0.51, 0.06),
          material: material('#b5e7d9', { emissive: '#83c1b4', emissiveIntensity: 0.5 }),
        });
    } else {
      result.push(
        box(
          0.35,
          variant === 'broken' ? 0.34 : 0.55,
          0.115,
          '#b0b5a5',
          0,
          variant === 'broken' ? 0.25 : 0.36,
          0,
        ),
      );
      if (variant !== 'broken')
        result.push({
          ...cylinder(0.174, 0.113, '#c0c2b0', 0, 0.63, 0, 16),
          rotation: [Math.PI / 2, 0, 0],
        });
      for (const y of [0.26, 0.34, 0.42])
        result.push({ ...box(0.2, 0.018, 0.008, '#656e62', 0, y, 0.062), tint: false });
      if (variant === 'ornate')
        result.push(
          box(0.038, 0.19, 0.03, '#d6d3bb', 0, 0.62, 0.076),
          box(0.16, 0.037, 0.03, '#d6d3bb', 0, 0.66, 0.076),
        );
      if (variant === 'broken')
        result.push({ ...stone(0.25, 0.13, 0.18, 0.14, '#a3ad9e'), scale: [1, 0.55, 1] });
    }
    return result;
  }
  if (kind === 'fence') {
    if (variant === 'stone')
      return Array.from({ length: 12 }, (_, i) =>
        box(
          0.22,
          0.15,
          0.19,
          i % 2 ? '#9ca392' : '#b2b39f',
          ((i % 4) - 1.5) * 0.23,
          0.1 + Math.floor(i / 4) * 0.16,
          0,
        ),
      );
    if (variant === 'palisade')
      return Array.from({ length: 6 }, (_, i) => [
        cylinder(0.057, 0.62, '#9d7d54', (i - 2.5) * 0.15, 0.34, 0, 6),
        cone(0.057, 0.16, '#c4a173', (i - 2.5) * 0.15, 0.73, 0, 6),
      ]).flat();
    const iron = variant === 'iron',
      result: Part[] = [];
    for (let i = 0; i < (iron ? 7 : 3); i++)
      result.push(
        box(
          iron ? 0.022 : 0.065,
          iron ? 0.68 : 0.55,
          0.055,
          iron ? '#727e7d' : '#ad8b5e',
          (i - (iron ? 3 : 1)) * (iron ? 0.12 : 0.4),
          0.32,
          0,
        ),
      );
    for (const y of [0.24, 0.52])
      result.push(box(0.9, 0.045, 0.045, iron ? '#9ba5a1' : '#c0a074', 0, y, 0.03));
    return result;
  }
  if (kind === 'well') {
    const result: Part[] = [
      {
        geometry: new THREE.CylinderGeometry(0.33, 0.35, 0.37, 14, 1, true),
        material: material('#a0a28e', { side: THREE.DoubleSide }),
        position: [0, 0.23, 0],
      },
      { ...cylinder(0.28, 0.018, '#15242a', 0, 0.055, 0, 16), tint: false },
    ];
    if (variant !== 'ruined') {
      result.push(
        box(0.05, 0.95, 0.07, '#a6865b', -0.3, 0.49, 0),
        box(0.05, 0.95, 0.07, '#a6865b', 0.3, 0.49, 0),
        box(0.67, 0.07, 0.07, '#c7aa76', 0, 0.85, 0),
        cylinder(0.012, 0.49, '#cebb8d', 0, 0.6, 0, 6),
      );
      if (variant === 'roofed') result.push(roof(0.85, 0.3, 0.68, '#9c654f', 0.98));
    } else result.push(stone(0.32, 0.13, 0.27, 0.14));
    return result;
  }
  if (kind === 'bridge') {
    const stoneBridge = variant === 'stone',
      result = [box(0.72, 0.095, 0.95, stoneBridge ? '#a6ad9c' : '#8d734d', 0, 0.12, 0)];
    for (const z of [-0.4, -0.2, 0, 0.2, 0.4])
      result.push(box(0.77, 0.026, 0.027, stoneBridge ? '#69766a' : '#d2b589', 0, 0.178, z));
    for (const x of [-0.36, 0.36]) {
      for (const z of [-0.4, 0, 0.4])
        result.push(box(0.037, 0.42, 0.045, stoneBridge ? '#b5baa8' : '#96754c', x, 0.29, z));
      if (variant === 'rope')
        result.push({
          geometry: new THREE.TubeGeometry(
            new THREE.QuadraticBezierCurve3(
              new THREE.Vector3(x, 0.5, -0.45),
              new THREE.Vector3(x, 0.22, 0),
              new THREE.Vector3(x, 0.5, 0.45),
            ),
            10,
            0.017,
            5,
            false,
          ),
          material: material('#caba8e'),
          position: [0, 0, 0],
        });
      else result.push(box(0.055, 0.055, 0.96, stoneBridge ? '#c5cab7' : '#b59c70', x, 0.47, 0));
    }
    return result;
  }
  if (kind === 'table' || kind === 'chair') {
    const stool = kind === 'chair' && variant === 'stool',
      round = kind === 'table' && variant === 'round';
    const result: Part[] = [
      round || stool
        ? cylinder(stool ? 0.22 : 0.39, 0.075, '#c5a675', 0, kind === 'chair' ? 0.32 : 0.5, 0, 14)
        : box(
            kind === 'chair' ? 0.39 : 0.79,
            0.07,
            kind === 'chair' ? 0.38 : 0.63,
            '#bb996a',
            0,
            kind === 'chair' ? 0.32 : 0.5,
            0,
          ),
    ];
    for (const x of [-0.16, 0.16])
      for (const z of [-0.14, 0.14])
        result.push(
          box(
            0.04,
            kind === 'chair' ? 0.28 : 0.46,
            0.04,
            '#7f6342',
            x,
            kind === 'chair' ? 0.16 : 0.26,
            z,
          ),
        );
    if (kind === 'chair' && !stool) {
      result.push(
        box(
          0.4,
          variant === 'throne' ? 0.63 : 0.36,
          0.055,
          '#987b51',
          0,
          variant === 'throne' ? 0.68 : 0.54,
          -0.17,
        ),
      );
      if (variant === 'throne')
        result.push(
          box(0.29, 0.47, 0.06, '#795577', 0, 0.68, -0.135),
          box(0.045, 0.94, 0.055, '#d6b36c', -0.18, 0.5, -0.17),
          box(0.045, 0.94, 0.055, '#d6b36c', 0.18, 0.5, -0.17),
        );
    }
    if (kind === 'table' && variant === 'feast')
      for (const x of [-0.25, 0, 0.25])
        result.push(
          { ...cylinder(0.063, 0.022, '#d9d1a5', x, 0.56, 0), tint: false },
          orb(0.038, '#d29b5b', x, 0.595, 0),
        );
    return result;
  }
  if (kind === 'bookshelf') {
    const result = [
      box(0.065, 0.96, 0.31, '#785c3e', -0.35, 0.5, 0),
      box(0.065, 0.96, 0.31, '#785c3e', 0.35, 0.5, 0),
      box(0.73, 0.97, 0.04, '#967249', 0, 0.5, -0.14),
    ];
    for (const y of [0.08, 0.35, 0.62, 0.94])
      result.push(box(0.74, 0.045, 0.33, '#c09b68', 0, y, 0));
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.115,
          y = 0.14 + row * 0.28;
        if (variant === 'scrolls')
          result.push({
            ...cylinder(0.037, 0.17, '#e4d3a6', x, y + 0.05, 0, 7),
            rotation: [Math.PI / 2, 0, 0],
            tint: false,
          });
        else if (variant === 'potions')
          result.push(
            {
              ...orb(0.045, ['#87bfa4', '#b786bf', '#8fafc4'][i % 3], x, y + 0.07, 0),
              tint: false,
            },
            { ...cylinder(0.012, 0.055, '#d8c4a0', x, y + 0.125, 0, 6), tint: false },
          );
        else
          result.push({
            ...box(
              0.058,
              0.15 + (i % 2) * 0.04,
              0.19,
              ['#93768a', '#91a582', '#b99b62', '#809fa3', '#9e6b57'][i],
              x,
              y + 0.08,
              0,
            ),
            tint: false,
          });
      }
    return result;
  }
  if (kind === 'torch') {
    const result: Part[] = [
      cylinder(0.025, 0.74, '#8a6c44', 0, 0.4, 0, 7),
      box(0.21, 0.06, 0.21, '#676e60', 0, 0.055, 0),
    ];
    if (variant === 'default')
      result.push(
        ...fire()
          .filter((p) => p.geometry.type === 'LatheGeometry')
          .map((p): Part => ({
            ...p,
            position: [p.position[0] * 0.25, 0.78 + p.position[1] * 0.26, p.position[2] * 0.25],
            scale: [
              (p.scale?.[0] ?? 1) * 0.25,
              (p.scale?.[1] ?? 1) * 0.26,
              (p.scale?.[2] ?? 1) * 0.25,
            ],
          })),
      );
    else if (variant === 'arcane')
      result.push({
        ...orb(0.14, '#a2cddd', 0, 0.9, 0),
        material: material('#a2cddd', { emissive: '#69abc8', emissiveIntensity: 0.7 }),
      });
    else {
      result.push({
        ...box(0.17, 0.25, 0.16, '#f1cf80', 0, 0.84, 0),
        material: material('#f1cf80', { emissive: '#e5b86f', emissiveIntensity: 0.6 }),
      });
      for (const x of [-0.09, 0.09])
        result.push({ ...box(0.02, 0.27, 0.19, '#46534e', x, 0.84, 0), tint: false });
      result.push(cone(0.14, 0.11, '#6d7a72', 0, 1.02, 0, 4));
    }
    return result;
  }
  if (kind === 'signpost') {
    const result = [cylinder(0.033, 0.95, '#927348', 0, 0.5, 0, 7)];
    if (variant === 'banner')
      result.push(
        box(0.43, 0.035, 0.035, '#b49665', 0.14, 0.97, 0),
        box(0.33, 0.57, 0.018, '#a36060', 0.18, 0.66, 0.02),
      );
    else {
      result.push(box(0.61, 0.17, 0.07, '#c1a574', 0.1, 0.77, 0));
      if (variant === 'forked') result.push(box(0.57, 0.16, 0.07, '#a78e5b', -0.1, 0.53, 0));
      for (const x of [-0.13, 0.04, 0.21])
        result.push({ ...box(0.09, 0.025, 0.012, '#64513b', x, 0.77, 0.041), tint: false });
    }
    return result;
  }
  return null;
}
