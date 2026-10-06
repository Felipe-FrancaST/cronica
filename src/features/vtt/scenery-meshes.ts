import * as THREE from 'three';
import { sceneryRect, sceneryVariant, normalizeSceneryColor } from './scenery';
import { surfaceCanvas } from './scenery-art';
import { extraSceneryParts } from './scenery-extra-meshes';
import type { BattleMapObject } from './types';
export interface Part {
  tint?: boolean;
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
    roughness: ['water', 'ice', 'portal'].includes(kind) ? 0.22 : 0.86,
    side: THREE.DoubleSide,
    metalness: kind === 'water' ? 0.25 : 0,
    ...(kind === 'portal'
      ? { emissive: '#bb72ff', emissiveMap: texture, emissiveIntensity: 1.2 }
      : {}),
    ...(kind === 'ice' ? { metalness: 0.28 } : {}),
    ...(kind === 'lava'
      ? { emissive: '#f16932', emissiveMap: texture, emissiveIntensity: 0.75 }
      : {}),
  });
}
function parts(kind: string, variant = 'default'): Part[] {
  const extra = extraSceneryParts(kind, variant, material, terrainMaterial, () => parts('fire'));
  if (extra) return extra;
  if (kind === 'tree')
    return [
      {
        geometry: new THREE.CylinderGeometry(0.075, 0.115, 1.15, 7),
        material: material('#73563b'),
        position: [0, 0.59, 0],
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.37, 1),
        material: material(variant === 'autumn' ? '#ba7544' : '#426c42'),
        position: [-0.16, 1.15, 0.08],
        scale: [1, 1.17, 1],
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.39, 1),
        material: material(variant === 'autumn' ? '#ddb563' : '#68915a'),
        position: [0.16, 1.32, -0.07],
        scale: [1, 1.12, 1],
      },
      {
        geometry: new THREE.IcosahedronGeometry(0.31, 1),
        material: material(variant === 'autumn' ? '#875338' : '#2b5639'),
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
  if (kind === 'tent') {
    const roof = new THREE.Shape();
    roof.moveTo(-0.43, 0);
    roof.lineTo(0, 0.68);
    roof.lineTo(0.43, 0);
    roof.closePath();
    const g = new THREE.ExtrudeGeometry(roof, { depth: 0.8, bevelEnabled: false });
    g.translate(0, 0, -0.4);
    const doorway = new THREE.Shape();
    doorway.moveTo(-0.18, 0);
    doorway.lineTo(0, 0.44);
    doorway.lineTo(0.18, 0);
    doorway.closePath();
    return [
      { geometry: g, material: material('#b58467'), position: [0, 0.045, 0] },
      {
        geometry: new THREE.ShapeGeometry(doorway),
        material: material('#302a29', { side: THREE.DoubleSide }),
        position: [0, 0.045, 0.405],
      },
      ...[-0.38, 0.38].map((z) => ({
        geometry: new THREE.CylinderGeometry(0.018, 0.022, 0.72, 6),
        material: material('#dcc8a0'),
        position: [0, 0.39, z] as [number, number, number],
      })),
      {
        geometry: new THREE.BoxGeometry(0.025, 0.025, 0.93),
        material: material('#f0dbb7'),
        position: [0, 0.72, 0],
      },
    ];
  }
  if (kind === 'cart')
    return [
      {
        geometry: new THREE.BoxGeometry(0.72, 0.12, 0.76),
        material: material('#795138'),
        position: [0, 0.32, 0],
      },
      ...[-0.36, 0.36].map((x) => ({
        geometry: new THREE.BoxGeometry(0.055, 0.28, 0.78),
        material: material('#ad8055'),
        position: [x, 0.5, 0] as [number, number, number],
      })),
      ...[-0.38, 0.38].map((z) => ({
        geometry: new THREE.BoxGeometry(0.7, 0.28, 0.06),
        material: material('#996e47'),
        position: [0, 0.5, z] as [number, number, number],
      })),
      ...[-0.44, 0.44].flatMap((x) =>
        [-0.26, 0.26].map((z) => ({
          geometry: new THREE.TorusGeometry(0.19, 0.038, 7, 18),
          material: material('#3c362f'),
          position: [x, 0.22, z] as [number, number, number],
          rotation: [0, Math.PI / 2, 0] as [number, number, number],
        })),
      ),
      ...[-0.22, 0.22].map((x) => ({
        geometry: new THREE.BoxGeometry(0.04, 0.04, 0.46),
        material: material('#bc9061'),
        position: [x, 0.29, 0.54] as [number, number, number],
      })),
    ];
  if (kind === 'pit')
    return [
      {
        geometry: new THREE.CircleGeometry(0.4, 32),
        material: material('#080c0b'),
        position: [0, 0.03, 0],
        rotation: [-Math.PI / 2, 0, 0],
      },
      {
        geometry: new THREE.TorusGeometry(0.42, 0.065, 6, 24),
        material: terrainMaterial('stone'),
        position: [0, 0.04, 0],
        rotation: [-Math.PI / 2, 0, 0],
        scale: [1, 0.82, 1],
      },
    ];
  if (kind === 'portal')
    return [
      {
        geometry: new THREE.TorusGeometry(0.34, 0.055, 8, 40),
        material: material('#d7bd91', { emissive: '#b174e9', emissiveIntensity: 0.6 }),
        position: [0, 0.63, 0],
        scale: [1, 1.48, 1],
      },
      {
        geometry: new THREE.CircleGeometry(0.32, 40),
        material: terrainMaterial('portal'),
        position: [0, 0.63, 0.005],
        scale: [1, 1.48, 1],
      },
      ...[-0.3, 0.3].map((x) => ({
        geometry: new THREE.DodecahedronGeometry(0.13),
        material: material('#58586f'),
        position: [x, 0.1, 0] as [number, number, number],
      })),
      {
        geometry: new THREE.CylinderGeometry(0.37, 0.42, 0.08, 24),
        material: material('#4b4260'),
        position: [0, 0.055, 0],
        scale: [1, 1, 0.75],
      },
    ];
  if (kind === 'fire') {
    const flame = () => {
      const g = new THREE.LatheGeometry(
        [
          [0, 0],
          [0.11, 0.04],
          [0.17, 0.18],
          [0.12, 0.34],
          [0.08, 0.53],
          [0.026, 0.71],
          [0, 0.84],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        10,
      );
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const h = p.getY(i);
        p.setX(i, p.getX(i) + Math.sin(h * 6.5) * h * 0.095);
      }
      g.computeVertexNormals();
      return g;
    };
    return [
      {
        geometry: new THREE.BoxGeometry(0.96, 0.035, 0.96),
        material: terrainMaterial('fire'),
        position: [0, 0.04, 0],
      },
      ...[-0.15, 0.15].map((z, i) => ({
        geometry: new THREE.CylinderGeometry(0.065, 0.055, 0.6, 7),
        material: material('#382922'),
        position: [0, 0.1, z] as [number, number, number],
        rotation: [Math.PI / 2, 0.3 * (i ? 1 : -1), Math.PI / 2] as [number, number, number],
      })),
      ...[-0.23, 0, 0.23].flatMap((x, i) => [
        {
          geometry: flame(),
          material: material('#ed6525', {
            emissive: '#ef511b',
            emissiveIntensity: 1.5,
            flatShading: false,
          }),
          position: [x, 0.08, Math.sin(i * 3) * 0.12] as [number, number, number],
          scale: [1, i === 1 ? 1 : 0.73, 1] as [number, number, number],
        },
        {
          geometry: flame(),
          material: material('#ffe8a1', {
            emissive: '#ffcb56',
            emissiveIntensity: 2,
            flatShading: false,
          }),
          position: [x, 0.1, Math.sin(i * 3) * 0.12 + 0.045] as [number, number, number],
          scale: [0.55, i === 1 ? 0.62 : 0.44, 0.55] as [number, number, number],
        },
      ]),
    ];
  }

  return [
    {
      geometry: new THREE.BoxGeometry(0.98, 0.035, 0.98),
      material: terrainMaterial(kind),
      position: [0, 0.05, 0],
    },
  ];
}
export function addSceneryMeshes(
  layer: THREE.Group,
  objects: BattleMapObject[],
  clock?: { value: number },
) {
  const groups = new Map<string, BattleMapObject[]>();
  for (const object of objects) {
    if (!sceneryRect(object)) continue;
    const key = `${object.object_type}:${sceneryVariant(object.object_type, object.metadata.variant)}:${object.visible}:${Boolean(normalizeSceneryColor(object.metadata.color))}`;
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
    const variant = sceneryVariant(kind, entries[0].metadata.variant);
    const colored = Boolean(normalizeSceneryColor(entries[0].metadata.color));
    for (const part of parts(kind, variant)) {
      const tint = colored && part.tint !== false;
      const flame =
        clock && ['fire', 'campfire'].includes(kind) && part.geometry.type === 'LatheGeometry';
      if (tint) {
        const shade = part.material.color.getHSL({ h: 0, s: 0, l: 0 }).l;
        part.material.color.setRGB(0.5 + shade * 0.7, 0.5 + shade * 0.7, 0.5 + shade * 0.7);
        if (part.material.map) {
          const source = part.material.map.image as HTMLCanvasElement;
          const canvas = document.createElement('canvas');
          canvas.width = source.width;
          canvas.height = source.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(source, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (let n = 0; n < pixels.data.length; n += 4) {
            const grey =
              pixels.data[n] * 0.25 + pixels.data[n + 1] * 0.6 + pixels.data[n + 2] * 0.15;
            pixels.data[n] = pixels.data[n + 1] = pixels.data[n + 2] = grey;
          }
          ctx.putImageData(pixels, 0, 0);
          part.material.map.dispose();
          part.material.map = new THREE.CanvasTexture(canvas);
          part.material.map.colorSpace = THREE.SRGBColorSpace;
          if (part.material.emissiveMap) part.material.emissiveMap = part.material.map;
        }
        if (
          part.material.emissiveIntensity > 0 &&
          !part.material.emissive.equals(new THREE.Color('#000'))
        )
          part.material.emissive.set('#dddddd');
      }
      if (flame || tint) {
        part.material.onBeforeCompile = (shader) => {
          if (tint)
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\n #ifdef USE_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n #endif',
            );
          if (!flame) return;
          shader.uniforms.sceneryTime = clock;
          shader.vertexShader = 'uniform float sceneryTime;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n float phase=sceneryTime*2.5;\n #ifdef USE_INSTANCING\n phase+=instanceMatrix[3].x*1.7+instanceMatrix[3].z*2.3;\n #endif\n transformed.x+=sin(phase+position.y*4.0)*position.y*position.y*.045; transformed.y*=1.0+sin(phase*1.7)*.035;',
          );
        };
        part.material.customProgramCacheKey = () => `cronica-scenery-v13-${Boolean(flame)}-${tint}`;
      }
      if (!visible) {
        part.material.transparent = true;
        part.material.opacity = 0.38;
        part.material.depthWrite = false;
      }
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, entries.length);
      entries.forEach((object, i) => {
        const r = sceneryRect(object)!;
        const height = [
          'water',
          'lava',
          'fire',
          'road',
          'ice',
          'pit',
          'campfire',
          'flowers',
        ].includes(kind)
          ? 1
          : Math.min(3.8, Math.sqrt(r.width * r.height));
        // Rotation happens inside a fixed rectangular footprint, matching the movement rules.
        base.makeScale(r.width, height, r.height);
        base.setPosition(r.x + r.width / 2, object.z + 0.035, r.y + r.height / 2);
        orientation.makeRotationY(
          ['water', 'lava', 'road', 'ice'].includes(kind) ? 0 : (r.rotation * Math.PI) / 180,
        );
        local.compose(
          new THREE.Vector3(...part.position),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
          new THREE.Vector3(...(part.scale ?? [1, 1, 1])),
        );
        matrix.copy(base).multiply(orientation).multiply(local);
        mesh.setMatrixAt(i, matrix);
        // Slight deterministic variation keeps repeated pieces from looking stamped.
        if (tint)
          mesh.setColorAt(i, new THREE.Color(normalizeSceneryColor(object.metadata.color)!));
        else if (kind === 'tree' || kind === 'rock')
          mesh.setColorAt(
            i,
            new THREE.Color().setHSL(0.29, 0.08, 0.82 + ((r.x * 7 + r.y * 3) % 5) * 0.025),
          );
      });
      mesh.userData.sceneryCells = entries.map((object) => {
        const r = sceneryRect(object)!;
        return { x: r.x, y: r.y };
      });
      mesh.userData.sceneryIds = entries.map((object) => object.id);
      mesh.castShadow = !['water', 'lava', 'fire', 'road', 'ice', 'pit'].includes(kind);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      layer.add(mesh);
    }
  }
}
