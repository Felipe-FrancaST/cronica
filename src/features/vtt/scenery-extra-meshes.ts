import * as THREE from 'three';
import type { Part } from './scenery-meshes';
import { worldSceneryParts } from './scenery-world-meshes';
type MakeMaterial = (
  color: string,
  extra?: THREE.MeshStandardMaterialParameters,
) => THREE.MeshStandardMaterial;

export function extraSceneryParts(
  kind: string,
  variant: string,
  material: MakeMaterial,
  terrain: (kind: string) => THREE.MeshStandardMaterial,
  fire: () => Part[],
): Part[] | null {
  const world = worldSceneryParts(kind, variant, material, terrain, fire);
  if (world) return world;
  const box = (
    w: number,
    h: number,
    d: number,
    color: string,
    position: [number, number, number],
  ): Part => ({ geometry: new THREE.BoxGeometry(w, h, d), material: material(color), position });
  const stone = (x: number, y: number, z: number, r: number): Part => ({
    geometry: new THREE.DodecahedronGeometry(r),
    material: material('#99978b'),
    position: [x, y, z],
  });
  if (kind === 'ice' && variant === 'snow')
    return [
      {
        geometry: new THREE.BoxGeometry(0.98, 0.055, 0.98),
        material: terrain('snow'),
        position: [0, 0.05, 0],
      },
      ...[-0.25, 0.24].map((x, i): Part => ({
        geometry: new THREE.SphereGeometry(0.22, 10, 6),
        material: material('#f2f6f1'),
        position: [x, 0.06, i ? 0.18 : -0.15],
        scale: [1.2, 0.24, 1],
      })),
    ];
  if (kind === 'road' && variant === 'cobblestone')
    return [
      {
        geometry: new THREE.BoxGeometry(0.98, 0.035, 0.98),
        material: terrain('stone'),
        position: [0, 0.05, 0],
      },
    ];
  if (kind === 'portal' && variant === 'door')
    return [
      box(0.12, 1.04, 0.2, '#9e9581', [-0.37, 0.52, 0]),
      box(0.12, 1.04, 0.2, '#9e9581', [0.37, 0.52, 0]),
      box(0.86, 0.14, 0.2, '#beb59b', [0, 1.05, 0]),
      { ...box(0.62, 0.96, 0.07, '#0d1214', [0, 0.48, -0.02]), tint: false },
      { ...box(0.49, 0.91, 0.05, '#956744', [-0.14, 0.49, 0.16]), rotation: [0, -0.62, 0] },
      ...[0.27, 0.72].map((y): Part => ({
        ...box(0.48, 0.025, 0.07, '#ccae6a', [-0.14, y, 0.18]),
        rotation: [0, -0.62, 0],
        tint: false,
      })),
      {
        geometry: new THREE.SphereGeometry(0.028, 8, 6),
        material: material('#e6c879', { metalness: 0.7 }),
        position: [0.03, 0.47, 0.32],
        tint: false,
      },
    ];
  if (kind === 'portal' && variant === 'cave')
    return [
      {
        geometry: new THREE.CircleGeometry(0.35, 24),
        material: material('#080c10', { side: THREE.DoubleSide }),
        position: [0, 0.43, 0],
        scale: [1, 1.1, 1],
        tint: false,
      },
      ...Array.from({ length: 7 }, (_, i): Part => {
        const a = (i * Math.PI) / 6;
        return {
          ...stone(Math.cos(a) * 0.36, 0.18 + Math.sin(a) * 0.62, 0.035, 0.19),
          scale: [1, 1.25, 0.8],
        };
      }),
      stone(-0.3, 0.12, 0.12, 0.19),
      stone(0.3, 0.12, 0.12, 0.19),
    ];
  if (kind === 'barrel') {
    if (variant === 'crate')
      return [
        box(0.68, 0.65, 0.68, '#aa7e50', [0, 0.35, 0]),
        ...[-0.25, 0.25].flatMap((x): Part[] => [
          box(0.07, 0.7, 0.73, '#614730', [x, 0.35, 0]),
          box(0.73, 0.07, 0.73, '#614730', [0, x + 0.36, 0]),
        ]),
        { ...box(0.73, 0.065, 0.05, '#d1a56e', [0, 0.35, 0.375]), rotation: [0, 0, Math.PI / 4] },
      ];
    return [
      {
        geometry: new THREE.CylinderGeometry(0.27, 0.25, 0.69, 14),
        material: material('#a57b4d'),
        position: [0, 0.37, 0],
      },
      ...[0.12, 0.57].map((y): Part => ({
        geometry: new THREE.TorusGeometry(0.275, 0.025, 6, 20),
        material: material('#5f6462', { metalness: 0.7 }),
        position: [0, y, 0],
        rotation: [Math.PI / 2, 0, 0],
        tint: false,
      })),
      ...[-0.13, 0, 0.13].map((z) => box(0.45, 0.014, 0.009, '#6f4b30', [0, 0.722, z])),
    ];
  }
  if (kind === 'campfire') {
    const flames = fire().map((p): Part => ({
      ...p,
      position: [
        p.position[0] * 0.72,
        p.position[1] * 0.72 + (variant === 'brazier' ? 0.33 : 0),
        p.position[2] * 0.72,
      ],
      scale: [(p.scale?.[0] ?? 1) * 0.72, (p.scale?.[1] ?? 1) * 0.72, (p.scale?.[2] ?? 1) * 0.72],
    }));
    return variant === 'brazier'
      ? [
          ...flames,
          {
            geometry: new THREE.CylinderGeometry(0.32, 0.18, 0.19, 12, 1, true),
            material: material('#777a71', { side: THREE.DoubleSide, metalness: 0.5 }),
            position: [0, 0.37, 0],
            tint: false,
          },
          ...[0, 1, 2].map((i): Part => ({
            geometry: new THREE.CylinderGeometry(0.025, 0.04, 0.34, 6),
            material: material('#545c58'),
            position: [
              Math.cos((i * Math.PI * 2) / 3) * 0.16,
              0.17,
              Math.sin((i * Math.PI * 2) / 3) * 0.16,
            ],
            tint: false,
          })),
        ]
      : [
          ...flames,
          ...Array.from({ length: 8 }, (_, i) =>
            stone(
              Math.cos((i * Math.PI) / 4) * 0.34,
              0.07,
              Math.sin((i * Math.PI) / 4) * 0.34,
              0.075,
            ),
          ),
        ];
  }
  if (kind === 'boat') {
    const hull = new THREE.Shape();
    hull.moveTo(0, -0.47);
    hull.quadraticCurveTo(-0.36, -0.26, -0.33, 0.26);
    hull.quadraticCurveTo(-0.25, 0.44, 0, 0.47);
    hull.quadraticCurveTo(0.25, 0.44, 0.33, 0.26);
    hull.quadraticCurveTo(0.36, -0.26, 0, -0.47);
    const geometry = new THREE.ExtrudeGeometry(hull, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.035,
      bevelThickness: 0.04,
    });
    geometry.rotateX(-Math.PI / 2);
    const result: Part[] = [
      { geometry, material: material('#83583b'), position: [0, 0.06, 0] },
      box(0.48, 0.025, 0.57, '#c09b68', [0, 0.24, 0]),
    ];
    for (const z of [-0.18, 0, 0.18]) result.push(box(0.52, 0.045, 0.05, '#533b2c', [0, 0.29, z]));
    if (variant === 'ship') {
      result.push(box(0.38, 0.28, 0.27, '#a1764a', [0, 0.41, 0.26]));
      for (const z of [-0.19, 0.1]) {
        result.push({
          geometry: new THREE.CylinderGeometry(0.016, 0.025, 1.1, 6),
          material: material('#765334'),
          position: [0, 0.77, z],
          tint: false,
        });
        result.push({
          geometry: new THREE.PlaneGeometry(0.57, 0.42),
          material: material('#e4d9bc', { side: THREE.DoubleSide, roughness: 1 }),
          position: [0, 0.91, z + 0.025],
          rotation: [0.1, 0.12, 0],
        });
        result.push(box(0.63, 0.024, 0.025, '#705238', [0, 1.13, z + 0.025]));
      }
    }
    return result;
  }
  if (kind === 'statue') {
    const result: Part[] = [
      box(0.61, 0.13, 0.59, '#848b83', [0, 0.09, 0]),
      box(0.4, 0.15, 0.4, '#bec0b0', [0, 0.22, 0]),
    ];
    return [
      ...result,
      box(0.22, 0.83, 0.22, '#a7b1a7', [0, 0.7, 0]),
      {
        geometry: new THREE.ConeGeometry(0.155, 0.24, 4),
        material: material('#d4d5c4'),
        position: [0, 1.235, 0],
        rotation: [0, Math.PI / 4, 0],
      },
      ...[0.55, 0.75, 0.95].map((y): Part => ({
        ...box(0.06, 0.035, 0.013, '#596b68', [0, y, 0.12]),
        tint: false,
      })),
    ];
  }
  if (kind === 'chest')
    return [
      box(0.72, 0.32, 0.5, '#8f6240', [0, 0.2, 0]),
      {
        ...box(0.74, 0.16, 0.53, '#b08752', [
          0,
          variant === 'open' ? 0.52 : 0.43,
          variant === 'open' ? -0.16 : 0,
        ]),
        rotation: variant === 'open' ? [-1.1, 0, 0] : [0, 0, 0],
      },
      ...[-0.24, 0.24].map((x): Part => ({
        ...box(0.045, 0.36, 0.53, '#d2b66f', [x, 0.23, 0]),
        tint: false,
      })),
      { ...box(0.1, 0.1, 0.035, '#e3c77c', [0, 0.3, 0.276]), tint: false },
      ...(variant === 'open'
        ? [
            { ...box(0.58, 0.012, 0.37, '#292423', [0, 0.37, 0]), tint: false },
            {
              geometry: new THREE.DodecahedronGeometry(0.055),
              material: material('#e7be5c', { metalness: 0.7 }),
              position: [0, 0.41, 0.08] as [number, number, number],
              tint: false,
            },
          ]
        : []),
    ];
  return null;
}
