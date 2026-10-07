import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Part } from './scenery-meshes';
import { sceneryPalette } from './scenery-styles';

type Role = 'wall' | 'roof' | 'wood' | 'stone' | 'cloth' | 'metal' | 'water' | 'light' | 'dark';
const workshopKinds = new Set([
  'house',
  'tavern',
  'forge',
  'stable',
  'wall',
  'floor',
  'stairs',
  'bed',
  'rug',
  'doorway',
  'fountain',
]);

export function workshopSceneryParts(kind: string, variant: string, style: unknown): Part[] | null {
  if (!workshopKinds.has(kind)) return null;
  const chosen = sceneryPalette(style);
  const palette = {
    ...chosen,
    ...(chosen.id === 'original'
      ? {
          ...(kind === 'house' && variant === 'cottage' ? { roof: '#b2a165' } : {}),
          ...(kind === 'house' && variant === 'desert'
            ? { wall: '#d7b77f', cloth: '#3e8c8a' }
            : {}),
          ...(kind === 'tavern' && variant === 'port' ? { roof: '#537f91', cloth: '#4e7fa2' } : {}),
        }
      : {}),
  };
  const materials = new Map<Role, THREE.MeshStandardMaterial>();
  const pieces: Part[] = [];
  const material = (role: Role) => {
    let value = materials.get(role);
    if (!value) {
      const accent = { water: '#599eaf', light: '#ffd17b', dark: '#253138' };
      value = new THREE.MeshStandardMaterial({
        color:
          role in accent
            ? accent[role as keyof typeof accent]
            : palette[role as keyof Omit<typeof palette, 'id' | 'name'>],
        roughness: role === 'water' ? 0.24 : role === 'metal' ? 0.5 : 0.88,
        metalness: role === 'metal' ? 0.45 : 0,
        flatShading: true,
        ...(role === 'light' ? { emissive: '#e38b35', emissiveIntensity: 0.3 } : {}),
      });
      materials.set(role, value);
    }
    return value;
  };
  const add = (
    geometry: THREE.BufferGeometry,
    role: Role,
    position: [number, number, number],
    rotation?: [number, number, number],
  ) => {
    pieces.push({
      geometry,
      material: material(role),
      position,
      rotation,
      tint: !['light', 'dark', 'water', 'metal'].includes(role),
    });
  };
  const box = (w: number, h: number, d: number, role: Role, x = 0, y = h / 2, z = 0, rz = 0) =>
    add(new THREE.BoxGeometry(w, h, d), role, [x, y, z], [0, 0, rz]);
  const cylinder = (
    radius: number,
    height: number,
    role: Role,
    x = 0,
    y = height / 2,
    z = 0,
    topRadius = radius,
    segments = 12,
  ) => add(new THREE.CylinderGeometry(topRadius, radius, height, segments), role, [x, y, z]);
  const ring = (radius: number, thickness: number, role: Role, y: number) =>
    add(new THREE.TorusGeometry(radius, thickness, 5, 20), role, [0, y, 0], [Math.PI / 2, 0, 0]);
  const foundation = () => box(0.94, 0.07, 0.92, 'stone', 0, 0.045);
  const window = (x: number, y: number, z = 0.407) => {
    box(0.16, 0.21, 0.026, 'wood', x, y, z);
    box(0.117, 0.16, 0.03, 'light', x, y, z + 0.008);
    box(0.018, 0.17, 0.035, 'wood', x, y, z + 0.03);
    box(0.13, 0.015, 0.035, 'wood', x, y, z + 0.03);
    box(0.2, 0.035, 0.07, 'stone', x, y - 0.115, z + 0.02);
  };
  const door = (x = 0, y = 0.23, z = 0.412) => {
    box(0.21, 0.34, 0.03, 'dark', x, y, z);
    box(0.175, 0.31, 0.02, 'wood', x, y, z + 0.015);
    for (const dx of [-0.13, 0.13]) box(0.042, 0.38, 0.05, 'wood', x + dx, y + 0.005, z);
    box(0.29, 0.043, 0.05, 'wood', x, y + 0.2, z);
    box(0.027, 0.025, 0.038, 'metal', x + 0.052, y, z + 0.04);
    box(0.3, 0.035, 0.11, 'stone', x, 0.075, z + 0.015);
  };
  const roof = (bottom: number, width = 0.96, depth = 0.96, rise = 0.3) => {
    const angle = Math.atan2(rise, width / 2);
    const slope = Math.hypot(width / 2, rise);
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(0, rise);
    shape.lineTo(width / 2, 0);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth - 0.04,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -(depth - 0.04) / 2);
    add(geometry, 'wall', [0, bottom, 0]);
    for (const side of [-1, 1]) {
      box(
        slope + 0.035,
        0.045,
        depth,
        'roof',
        (side * width) / 4,
        bottom + rise / 2,
        0,
        -side * angle,
      );
      box(
        slope + 0.065,
        0.04,
        0.055,
        'wood',
        (side * width) / 4,
        bottom + rise / 2 + 0.026,
        depth / 2,
        -side * angle,
      );
      for (let n = 1; n <= 4; n++) {
        const fraction = n / 5;
        box(
          0.022,
          0.02,
          depth - 0.045,
          'wood',
          ((side * width) / 2) * fraction,
          bottom + rise * (1 - fraction) + 0.032,
          0,
          -side * angle,
        );
      }
    }
    box(0.065, 0.06, depth + 0.015, 'roof', 0, bottom + rise + 0.027);
  };
  const table = (x: number, z: number) => {
    cylinder(0.14, 0.045, 'wood', x, 0.26, z);
    cylinder(0.035, 0.22, 'wood', x, 0.13, z);
    for (const dx of [-0.19, 0.19]) {
      cylinder(0.055, 0.035, 'wood', x + dx, 0.15, z);
      cylinder(0.022, 0.13, 'wood', x + dx, 0.065, z);
    }
    cylinder(0.021, 0.035, 'light', x + 0.045, 0.3, z + 0.01);
  };

  if (kind === 'house' || kind === 'tavern' || kind === 'stable') {
    foundation();
    const open = variant === 'open';
    const tower = kind === 'house' && variant === 'tower';
    const flat = kind === 'house' && variant === 'desert';
    const ruined = kind === 'house' && variant === 'ruined';
    const tall = variant === 'inn' || variant === 'manor' || kind === 'tavern';
    const height = tower ? 1.13 : tall ? 0.86 : 0.58;
    const masonry = variant === 'stone' || tower || ruined;
    const walls: Role = masonry ? 'stone' : 'wall';
    if (open || kind === 'stable') {
      box(0.85, 0.035, 0.8, 'wood', 0, 0.1);
      box(0.84, 0.35, 0.055, walls, 0, 0.245, -0.38);
      for (const x of [-0.39, 0.39]) {
        box(0.055, height, 0.055, 'wood', x, height / 2 + 0.06, -0.36);
        box(0.055, height, 0.055, 'wood', x, height / 2 + 0.06, 0.36);
      }
    } else {
      box(0.82, ruined ? 0.37 : height, 0.78, walls, 0, (ruined ? 0.37 : height) / 2 + 0.07);
      box(0.85, 0.048, 0.81, 'wood', 0, 0.14);
      for (const x of [-0.39, 0.39]) box(0.05, height + 0.035, 0.81, 'wood', x, height / 2 + 0.07);
      if (tall) {
        box(0.87, 0.055, 0.83, 'wood', 0, height * 0.57);
        window(-0.24, height * 0.81);
        window(0.24, height * 0.81);
        for (const x of [-0.21, 0.21])
          box(0.028, 0.27, 0.027, 'wood', x, height * 0.81, 0.415, x < 0 ? -0.52 : 0.52);
      }
      door();
      window(-0.26, 0.34);
      window(0.26, 0.34);
      if (variant === 'timber' || variant === 'inn') {
        for (const x of [-0.2, 0.2])
          box(0.025, 0.28, 0.023, 'wood', x, 0.34, 0.43, x < 0 ? -0.57 : 0.57);
        box(0.028, height - 0.1, 0.025, 'wood', 0, height / 2 + 0.14, 0.428);
      }
      if (variant === 'manor') {
        box(0.47, 0.055, 0.18, 'wood', 0, 0.5, 0.4);
        for (const x of [-0.22, -0.1, 0, 0.1, 0.22])
          box(0.015, 0.17, 0.015, 'metal', x, 0.59, 0.48);
        box(0.48, 0.02, 0.022, 'wood', 0, 0.68, 0.48);
      }
    }
    if (tower) {
      box(0.94, 0.08, 0.92, 'stone', 0, height + 0.11);
      for (const x of [-0.36, 0, 0.36])
        for (const z of [-0.37, 0.37]) box(0.14, 0.17, 0.12, 'stone', x, height + 0.22, z);
      for (const x of [-0.4, 0.4]) box(0.12, 0.17, 0.15, 'stone', x, height + 0.22);
      window(0, 0.93);
    } else if (flat) {
      box(0.9, 0.06, 0.87, 'stone', 0, height + 0.11);
      for (const z of [-0.4, 0.4]) box(0.87, 0.12, 0.04, 'wall', 0, height + 0.2, z);
      box(0.08, 0.24, 0.08, 'wood', 0.29, height + 0.22, 0.24);
      box(0.45, 0.03, 0.42, 'cloth', 0.09, height + 0.35, 0.11);
    } else if (ruined) {
      box(0.16, 0.58, 0.22, 'stone', -0.32, 0.36, -0.25);
      for (let n = 0; n < 5; n++)
        add(new THREE.DodecahedronGeometry(0.06), 'stone', [-0.28 + n * 0.12, 0.14, 0.28]);
      box(0.52, 0.04, 0.42, 'roof', 0.03, 0.44, -0.18, -0.2);
    } else if (!(kind === 'tavern' && open) && !(kind === 'stable' && open)) {
      roof(height + 0.08, 0.96, 0.96, variant === 'cottage' ? 0.36 : 0.28);
      if (kind !== 'stable') {
        box(0.11, 0.32, 0.12, 'stone', 0.27, height + 0.32, -0.17);
        box(0.15, 0.04, 0.16, 'stone', 0.27, height + 0.49, -0.17);
      }
    }
    if (kind === 'tavern') {
      if (open) {
        box(0.6, 0.2, 0.15, 'wood', 0, 0.2, -0.26);
        box(0.65, 0.035, 0.2, 'wood', 0, 0.315, -0.26);
        table(-0.19, 0.17);
        table(0.19, 0.17);
        for (const x of [-0.16, 0, 0.16]) cylinder(0.05, 0.14, 'wood', x, 0.19, -0.26);
      } else {
        box(0.095, 0.18, 0.38, 'wood', -0.34, 0.18, 0.34);
        box(0.27, 0.055, 0.34, 'cloth', 0.15, 0.46, 0.32, -0.14);
        box(0.03, 0.34, 0.03, 'wood', -0.32, 0.47, 0.47);
        box(0.24, 0.19, 0.033, 'wood', -0.23, 0.54, 0.485);
        box(0.08, 0.09, 0.04, 'light', -0.24, 0.54, 0.508);
      }
      if (variant === 'port') {
        cylinder(0.07, 0.16, 'wood', 0.34, 0.16, 0.36);
        add(new THREE.TorusGeometry(0.06, 0.012, 4, 10), 'metal', [0.31, 0.4, 0.433]);
      }
    }
    if (kind === 'stable') {
      for (const x of [-0.22, 0.22]) {
        box(0.025, 0.25, 0.71, 'wood', x, 0.24);
        box(0.18, 0.09, 0.22, 'roof', x, 0.16, -0.22);
      }
      box(0.68, 0.075, 0.09, 'wood', 0, 0.25, 0.37);
    }
  } else if (kind === 'forge') {
    foundation();
    box(0.37, 0.48, 0.31, 'stone', -0.22, 0.31, -0.18);
    box(0.21, 0.16, 0.035, 'dark', -0.22, 0.29, -0.007);
    box(0.14, 0.05, 0.04, 'light', -0.22, 0.245, 0.015);
    box(0.17, 0.46, 0.2, 'stone', -0.22, 0.74, -0.18);
    cylinder(0.07, 0.18, 'wood', 0.18, 0.16, 0.19);
    box(0.18, 0.09, 0.13, 'metal', 0.18, 0.3, 0.19);
    box(0.28, 0.03, 0.11, 'metal', 0.2, 0.345, 0.19);
    box(0.07, 0.13, 0.04, 'wood', 0.34, 0.36, 0.15, 0.55);
    box(0.13, 0.055, 0.05, 'metal', 0.31, 0.43, 0.15, 0.55);
    box(0.27, 0.18, 0.19, 'wood', 0.2, 0.18, -0.22);
    if (variant === 'covered') {
      for (const x of [-0.39, 0.39]) box(0.035, 0.65, 0.035, 'wood', x, 0.37, 0.32);
      roof(0.7, 0.96, 0.83, 0.16);
    }
  } else if (kind === 'wall') {
    const height = variant === 'low' ? 0.31 : 0.77;
    const role: Role = variant === 'timber' ? 'wood' : variant === 'brick' ? 'roof' : 'stone';
    box(0.98, height, 0.15, role, 0, height / 2 + 0.025);
    box(0.99, 0.05, 0.2, role, 0, height + 0.04);
    if (variant === 'timber') {
      for (const x of [-0.4, 0, 0.4])
        box(0.035, height, 0.018, 'wood', x, height / 2 + 0.025, 0.087);
    } else
      for (let row = 0; row < (variant === 'low' ? 2 : 5); row++) {
        box(0.94, 0.012, 0.012, 'dark', 0, 0.095 + row * 0.14, 0.079);
        for (const x of [-0.3, 0, 0.3])
          box(0.01, 0.12, 0.012, 'dark', x + (row % 2 ? 0.12 : 0), 0.15 + row * 0.14, 0.079);
      }
  } else if (kind === 'floor') {
    box(0.995, 0.018, 0.995, variant === 'wood' ? 'wood' : 'stone', 0, 0.003);
    const count = variant === 'wood' ? 7 : 4;
    for (let n = 1; n < count; n++) {
      const offset = -0.5 + n / count;
      box(0.009, 0.005, 0.98, 'dark', offset, 0.014);
      if (variant !== 'wood') box(0.98, 0.005, 0.009, 'dark', 0, 0.014, offset);
    }
    if (variant === 'tile')
      for (const x of [-0.25, 0.25])
        for (const z of [-0.25, 0.25]) box(0.19, 0.006, 0.19, 'cloth', x, 0.016, z);
  } else if (kind === 'stairs') {
    for (let n = 0; n < 7; n++)
      box(
        0.8,
        (n + 1) * 0.055,
        0.12,
        variant === 'stone' ? 'stone' : 'wood',
        0,
        (n + 1) * 0.0275,
        0.36 - n * 0.12,
      );
    for (const x of [-0.4, 0.4]) {
      box(0.025, 0.33, 0.025, 'wood', x, 0.22, 0.32);
      box(0.025, 0.33, 0.025, 'wood', x, 0.54, -0.37);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.8), 'wood', [x, 0.54, -0.025], [-0.42, 0, 0]);
    }
  } else if (kind === 'bed') {
    const levels = variant === 'bunk' ? [0.2, 0.59] : [0.2];
    for (const y of levels) {
      box(0.61, 0.075, 0.82, 'wood', 0, y);
      box(0.56, 0.055, 0.77, 'wall', 0, y + 0.06);
      box(0.54, 0.025, 0.49, 'cloth', 0, y + 0.103, 0.13);
      box(0.36, 0.055, 0.17, 'wall', 0, y + 0.115, -0.24);
    }
    for (const x of [-0.27, 0.27])
      for (const z of [-0.36, 0.36])
        box(
          0.045,
          variant === 'royal' ? 0.85 : variant === 'bunk' ? 0.72 : 0.29,
          0.045,
          'wood',
          x,
          variant === 'royal' ? 0.43 : variant === 'bunk' ? 0.37 : 0.155,
          z,
        );
    if (variant === 'royal') {
      box(0.67, 0.055, 0.89, 'cloth', 0, 0.88);
      for (const x of [-0.28, 0.28]) box(0.035, 0.58, 0.28, 'cloth', x, 0.57, -0.26);
    }
  } else if (kind === 'rug') {
    if (variant === 'round') {
      cylinder(0.43, 0.011, 'cloth', 0, 0.012, 0, 0.43, 24);
      ring(0.34, 0.012, 'wall', 0.019);
      ring(0.16, 0.012, 'wall', 0.019);
    } else {
      box(0.82, 0.012, 0.88, 'cloth', 0, 0.013);
      for (const x of [-0.36, 0.36]) box(0.019, 0.008, 0.79, 'wall', x, 0.023);
      for (const z of [-0.39, 0.39]) box(0.72, 0.008, 0.018, 'wall', 0, 0.023, z);
      if (variant === 'royal')
        for (const z of [-0.2, 0, 0.2])
          add(new THREE.BoxGeometry(0.14, 0.009, 0.14), 'wall', [0, 0.024, z], [0, Math.PI / 4, 0]);
      for (let n = 0; n < 9; n++)
        for (const z of [-0.46, 0.46]) box(0.025, 0.012, 0.04, 'wall', -0.34 + n * 0.085, 0.013, z);
    }
  } else if (kind === 'doorway') {
    const role: Role = variant === 'arch' ? 'stone' : variant === 'iron' ? 'metal' : 'wood';
    for (const x of [-0.39, 0.39]) box(0.12, 0.71, 0.21, role, x, 0.37);
    if (variant === 'arch') {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 0.45, 0, Math.PI, false);
      shape.absarc(0, 0, 0.32, Math.PI, 0, true);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.21,
        bevelEnabled: false,
        curveSegments: 12,
      });
      geometry.translate(0, 0, -0.105);
      add(geometry, role, [0, 0.71, 0]);
    } else {
      box(0.88, 0.13, 0.21, role, 0, 0.79);
      if (variant === 'iron')
        for (let n = 0; n < 6; n++) box(0.017, 0.2, 0.025, 'metal', -0.26 + n * 0.105, 0.62);
    }
    // Decorative doorway stays passable; closed doors use the blocking option.
    box(0.78, 0.025, 0.25, 'stone', 0, 0.018);
  } else if (kind === 'fountain') {
    cylinder(0.44, 0.085, 'stone', 0, 0.055);
    ring(0.37, 0.055, 'stone', 0.13);
    if (variant !== 'dry') cylinder(0.31, 0.016, 'water', 0, 0.1);
    cylinder(0.065, 0.49, 'stone', 0, 0.29);
    cylinder(0.23, 0.045, 'stone', 0, 0.43);
    ring(0.2, 0.023, 'stone', 0.47);
    if (variant !== 'dry') cylinder(0.176, 0.012, 'water', 0, 0.46);
    if (variant === 'ornate') {
      cylinder(0.1, 0.07, 'stone', 0, 0.67);
      add(new THREE.IcosahedronGeometry(0.09, 0), 'stone', [0, 0.74, 0]);
      for (const x of [-0.26, 0.26]) cylinder(0.035, 0.21, 'stone', x, 0.18, 0);
    }
  }
  // Bake static detail into one geometry per material. Repeated buildings use
  // a handful of instanced draws instead of one draw for every beam and roof tile.
  const result: Part[] = [];
  for (const mat of materials.values()) {
    const group = pieces.filter((p) => p.material === mat);
    const matrix = new THREE.Matrix4();
    const geometries = group.map((part) => {
      matrix.compose(
        new THREE.Vector3(...part.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1),
      );
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      geometry.applyMatrix4(matrix);
      return geometry;
    });
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error(`Não foi possível montar o modelo ${kind}.`);
    result.push({ geometry: merged, material: mat, position: [0, 0, 0], tint: group[0].tint });
    for (const geometry of geometries) geometry.dispose();
    for (const part of group) part.geometry.dispose();
  }
  return result;
}
