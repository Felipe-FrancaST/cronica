import * as THREE from 'three';
import type { Part } from './scenery-meshes';

type Material = (
  color: string,
  extra?: THREE.MeshStandardMaterialParameters,
) => THREE.MeshStandardMaterial;
type Point = [number, number, number];

/** Small procedural models; repeated details are merged by sceneryModelParts. */
export function dungeonSceneryParts(
  kind: string,
  variant: string,
  material: Material,
): Part[] | null {
  if (
    ![
      'door',
      'portcullis',
      'pillar',
      'altar',
      'sarcophagus',
      'cage',
      'weaponrack',
      'lever',
      'trap',
      'treasure',
      'rubble',
      'web',
      'stalagmite',
      'ladder',
      'magiccircle',
      'barricade',
    ].includes(kind)
  )
    return null;
  const wood = material('#89603e'),
    stone = material('#868579'),
    iron = material('#555f68', { metalness: 0.7, roughness: 0.4 });
  const gold = material('#d7aa45', { metalness: 0.72, roughness: 0.3 });
  const glow = material('#9476c8', {
    emissive: '#7951d6',
    emissiveIntensity: variant === 'spent' ? 0 : 0.85,
  });
  const result: Part[] = [];
  const box = (size: Point, position: Point, m = stone, rotation?: Point) =>
    result.push({ geometry: new THREE.BoxGeometry(...size), material: m, position, rotation });
  const cylinder = (
    radius: number,
    height: number,
    position: Point,
    m = stone,
    top = radius,
    sides = 10,
  ) =>
    result.push({
      geometry: new THREE.CylinderGeometry(top, radius, height, sides),
      material: m,
      position,
    });
  const ring = (radius: number, position: Point, m = glow, tube = 0.008) =>
    result.push({
      geometry: new THREE.TorusGeometry(radius, tube, 5, 32),
      material: m,
      position,
      rotation: [Math.PI / 2, 0, 0],
    });
  const beam = (
    a: [number, number],
    b: [number, number],
    y: number,
    m: THREE.MeshStandardMaterial,
    thickness = 0.012,
  ) =>
    box(
      [Math.hypot(b[0] - a[0], b[1] - a[1]), thickness, thickness],
      [(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2],
      m,
      [0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0],
    );

  if (kind === 'door' || kind === 'portcullis') {
    box([0.1, 1, 0.16], [-0.42, 0.5, 0]);
    box([0.1, 1, 0.16], [0.42, 0.5, 0]);
    box([0.92, 0.1, 0.18], [0, 0.95, 0]);
    if (kind === 'portcullis') {
      const raised = variant === 'open',
        h = raised ? 0.22 : 0.86,
        y = raised ? 0.8 : 0.44;
      for (let i = 0; i < 7; i++) {
        const x = -0.3 + i * 0.1;
        box([0.022, h, 0.035], [x, y, 0], iron);
        cylinder(0.025, 0.07, [x, y - h / 2 - 0.035, 0], iron, 0, 5);
      }
      for (const offset of [-0.25, 0, 0.25])
        box(
          [0.74, 0.035, 0.04],
          [0, raised ? 0.73 + (offset + 0.25) * 0.24 : 0.44 + offset, 0],
          iron,
        );
    } else {
      const open = variant.endsWith('open'),
        metal = variant.startsWith('iron');
      const leaf = new THREE.Matrix4().makeRotationY(open ? -Math.PI / 2 : 0);
      leaf.setPosition(open ? -0.34 : 0, 0, open ? 0.32 : 0);
      const detail = (size: Point, p: Point, m: THREE.MeshStandardMaterial) => {
        const v = new THREE.Vector3(...p).applyMatrix4(leaf);
        box(size, [v.x, v.y, v.z], m, [0, open ? -Math.PI / 2 : 0, 0]);
      };
      detail([0.72, 0.82, 0.05], [0, 0.46, 0], metal ? iron : wood);
      for (let i = 0; i < 6; i++)
        detail(
          [0.01, 0.79, 0.007],
          [-0.3 + i * 0.12, 0.46, 0.028],
          metal ? gold : material('#4e392b'),
        );
      for (const y of [0.22, 0.69]) detail([0.72, 0.035, 0.07], [0, y, 0], iron);
      detail([0.045, 0.07, 0.075], [0.24, 0.44, 0.025], gold);
    }
  } else if (kind === 'pillar') {
    box([0.78, 0.12, 0.78], [0, 0.06, 0]);
    cylinder(
      0.27,
      variant === 'broken' ? 0.38 : 0.82,
      [0, variant === 'broken' ? 0.31 : 0.55, 0],
      stone,
    );
    if (variant !== 'broken') {
      box([0.72, 0.11, 0.72], [0, 1.01, 0]);
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        cylinder(
          0.025,
          0.69,
          [Math.cos(angle) * 0.27, 0.56, Math.sin(angle) * 0.27],
          material('#b0ada0'),
          0.025,
          5,
        );
      }
    } else {
      for (let i = 0; i < 5; i++)
        result.push({
          geometry: new THREE.DodecahedronGeometry(0.065),
          material: stone,
          position: [Math.sin(i * 2) * 0.32, 0.13, Math.cos(i * 2) * 0.31],
        });
    }
  } else if (kind === 'altar') {
    box([0.78, 0.09, 0.62], [0, 0.045, 0]);
    box([0.62, 0.48, 0.42], [0, 0.33, 0]);
    box([0.9, 0.12, 0.64], [0, 0.63, 0]);
    box([0.35, 0.015, 0.5], [0, 0.7, 0], material(variant === 'arcane' ? '#604575' : '#944b49'));
    for (const x of [-0.3, 0.3]) {
      cylinder(0.04, 0.08, [x, 0.72, 0], gold);
      cylinder(0.02, 0.13, [x, 0.82, 0], material('#e4d9b6'));
      result.push({
        geometry: new THREE.SphereGeometry(0.027, 6, 4),
        material: material('#ffd789', { emissive: '#ffa44c', emissiveIntensity: 1 }),
        position: [x, 0.91, 0],
      });
    }
    if (variant === 'arcane') {
      ring(0.14, [0, 0.72, 0]);
      result.push({
        geometry: new THREE.OctahedronGeometry(0.11),
        material: glow,
        position: [0, 0.92, 0],
      });
    }
  } else if (kind === 'sarcophagus') {
    box([0.68, 0.1, 0.9], [0, 0.05, 0]);
    for (const x of [-0.29, 0.29]) box([0.08, 0.32, 0.82], [x, 0.25, 0]);
    for (const z of [-0.37, 0.37]) box([0.58, 0.32, 0.08], [0, 0.25, z]);
    box([0.59, 0.02, 0.72], [0, 0.115, 0], material('#3b4140'));
    if (variant === 'open') {
      box([0.65, 0.07, 0.82], [0.07, 0.46, -0.27], stone, [-0.85, 0, 0]);
      result.push({
        geometry: new THREE.SphereGeometry(0.07, 8, 6),
        material: material('#d2c8a5'),
        position: [0, 0.19, -0.2],
      });
      box([0.035, 0.035, 0.35], [0, 0.17, 0.04], material('#d2c8a5'));
    } else {
      box([0.72, 0.08, 0.88], [0, 0.44, 0]);
      box([0.05, 0.025, 0.48], [0, 0.495, 0], gold);
      box([0.28, 0.025, 0.05], [0, 0.495, -0.08], gold);
    }
  } else if (kind === 'cage') {
    box([0.9, 0.05, 0.9], [0, 0.025, 0]);
    box([0.9, 0.05, 0.9], [0, 0.97, 0], iron);
    for (let i = 0; i < 6; i++)
      for (const side of [-1, 1]) {
        cylinder(0.012, 0.91, [side * 0.42, 0.51, -0.4 + i * 0.16], iron, 0.012, 5);
        if (side === 1) cylinder(0.012, 0.91, [-0.4 + i * 0.16, 0.51, -0.42], iron, 0.012, 5);
        if (side === 1 && (variant !== 'open' || i === 0 || i === 5))
          cylinder(0.012, 0.91, [-0.4 + i * 0.16, 0.51, 0.42], iron, 0.012, 5);
      }
    box([0.9, 0.035, 0.035], [0, 0.5, -0.42], iron);
  } else if (kind === 'weaponrack') {
    for (const x of [-0.35, 0.35]) {
      box([0.07, 0.86, 0.07], [x, 0.43, 0], wood);
      box([0.14, 0.05, 0.36], [x, 0.025, 0], wood);
    }
    for (const y of [0.22, 0.69]) box([0.78, 0.065, 0.08], [0, y, 0], wood);
    if (variant === 'armor') {
      result.push({
        geometry: new THREE.SphereGeometry(0.13, 10, 6),
        material: iron,
        position: [0, 0.88, 0],
      });
      box([0.38, 0.31, 0.15], [0, 0.62, 0.04], iron);
      box([0.23, 0.2, 0.12], [0, 0.37, 0.04], iron);
    } else
      for (const x of [-0.24, 0, 0.24]) {
        box([0.03, 0.49, 0.025], [x, 0.61, 0.09], iron, [0, 0, -0.08]);
        box([0.16, 0.025, 0.04], [x, 0.34, 0.09], gold);
        cylinder(0.018, 0.17, [x, 0.24, 0.09], wood);
      }
  } else if (kind === 'lever') {
    box([0.54, 0.14, 0.46], [0, 0.07, 0]);
    cylinder(0.1, 0.09, [0, 0.18, 0], iron);
    const angle = variant === 'activated' ? -0.6 : 0.6;
    box([0.045, 0.5, 0.045], [Math.sin(angle) * 0.25, 0.2 + Math.cos(angle) * 0.25, 0], iron, [
      0,
      0,
      -angle,
    ]);
    result.push({
      geometry: new THREE.SphereGeometry(0.07, 8, 6),
      material: material('#b2473a'),
      position: [Math.sin(angle) * 0.5, 0.2 + Math.cos(angle) * 0.5, 0],
    });
  } else if (kind === 'trap') {
    box([0.9, 0.035, 0.9], [0, 0.0175, 0], material('#353e42'));
    if (variant === 'runes') {
      ring(0.32, [0, 0.055, 0], glow, 0.017);
      for (let i = 0; i < 6; i++)
        box(
          [0.035, 0.02, 0.11],
          [Math.cos((i * Math.PI) / 3) * 0.23, 0.055, Math.sin((i * Math.PI) / 3) * 0.23],
          glow,
          [0, (-i * Math.PI) / 3, 0],
        );
    } else
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++) {
          cylinder(
            0.055,
            variant === 'disarmed' ? 0.02 : 0.31,
            [x * 0.25, variant === 'disarmed' ? 0.04 : 0.19, z * 0.25],
            iron,
            0,
            5,
          );
        }
  } else if (kind === 'treasure') {
    cylinder(0.34, 0.12, [0, 0.06, 0], gold, 0.19, 12);
    for (let i = 0; i < 32; i++) {
      const angle = i * 2.4,
        radius = 0.09 + (i % 6) * 0.055;
      cylinder(
        0.038,
        0.02,
        [Math.cos(angle) * radius, 0.035 + (0.42 - radius) * 0.34, Math.sin(angle) * radius],
        gold,
        0.038,
        8,
      );
    }
    for (let i = 0; i < (variant === 'gems' ? 7 : 2); i++)
      result.push({
        geometry: new THREE.OctahedronGeometry(0.065),
        material: material(i % 2 ? '#c55369' : '#59a4b0', { metalness: 0.4, roughness: 0.2 }),
        position: [Math.sin(i * 3) * 0.22, 0.19, Math.cos(i * 3) * 0.2],
      });
  } else if (kind === 'rubble' || kind === 'stalagmite') {
    for (let i = 0; i < (kind === 'rubble' ? 14 : 5); i++) {
      const radius = kind === 'rubble' ? 0.05 + (i % 4) * 0.025 : 0.11;
      const x = Math.sin(i * 2.4) * 0.31,
        z = Math.cos(i * 2.4) * 0.3;
      if (kind === 'rubble')
        result.push({
          geometry: new THREE.DodecahedronGeometry(radius, 0),
          material: stone,
          position: [x, radius * 0.6, z],
          rotation: [i * 0.3, i, 0],
        });
      else
        cylinder(
          radius,
          0.4 + (i % 3) * 0.29,
          [x, (0.4 + (i % 3) * 0.29) / 2, z],
          variant === 'crystal' ? glow : stone,
          0.008,
          5,
        );
    }
  } else if (kind === 'web') {
    const silk = material('#c8d6d2', { transparent: true, opacity: 0.75, roughness: 1 });
    for (const radius of [0.12, 0.24, 0.36, 0.46]) ring(radius, [0, 0.025, 0], silk, 0.003);
    for (let i = 0; i < 10; i++)
      beam(
        [0, 0],
        [Math.cos((i * Math.PI) / 5) * 0.46, Math.sin((i * Math.PI) / 5) * 0.46],
        0.025,
        silk,
        0.004,
      );
  } else if (kind === 'ladder') {
    const rails = variant === 'rope' ? material('#d0bc86') : wood;
    for (const x of [-0.28, 0.28]) box([0.035, 0.04, 0.9], [x, 0.03, 0], rails);
    for (let i = 0; i < 7; i++) box([0.6, 0.035, 0.035], [0, 0.05, -0.38 + i * 0.125], wood);
  } else if (kind === 'magiccircle') {
    for (const radius of [0.29, 0.41, 0.46]) ring(radius, [0, 0.015, 0], glow, 0.006);
    const n = variant === 'summoning' ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n,
        b = ((i + (n === 5 ? 2 : 1)) * Math.PI * 2) / n;
      beam(
        [Math.cos(a) * 0.29, Math.sin(a) * 0.29],
        [Math.cos(b) * 0.29, Math.sin(b) * 0.29],
        0.015,
        glow,
        0.008,
      );
    }
    for (let i = 0; i < 12; i++)
      box(
        [0.012, 0.012, 0.035],
        [Math.cos((i * Math.PI) / 6) * 0.365, 0.02, Math.sin((i * Math.PI) / 6) * 0.365],
        glow,
        [0, (-i * Math.PI) / 6, 0],
      );
  } else if (kind === 'barricade') {
    for (const x of [-0.34, 0.34]) {
      box([0.09, 0.7, 0.09], [x, 0.35, 0], wood, [0.4, 0, 0]);
      box([0.09, 0.7, 0.09], [x, 0.35, 0], wood, [-0.4, 0, 0]);
    }
    for (const y of [0.22, 0.46])
      box([0.92, 0.085, 0.08], [0, y, 0.13], wood, [0, 0, y === 0.22 ? 0.1 : -0.1]);
    if (variant === 'spikes')
      for (let i = 0; i < 6; i++)
        result.push({
          geometry: new THREE.ConeGeometry(0.045, 0.4, 5),
          material: wood,
          position: [-0.35 + i * 0.14, 0.38, 0.22],
          rotation: [0.8, 0, 0],
        });
  } else {
    [wood, stone, iron, gold, glow].forEach((m) => m.dispose());
    return null;
  }
  // Only materials retained by parts are owned by the model.
  const used = new Set(result.map((p) => p.material));
  [wood, stone, iron, gold, glow].forEach((m) => {
    if (!used.has(m)) m.dispose();
  });
  return result;
}
