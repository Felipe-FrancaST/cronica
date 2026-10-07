import * as THREE from 'three';
import type { Part } from './scenery-meshes';
type Material = (
  color: string,
  options?: THREE.MeshStandardMaterialParameters,
) => THREE.MeshStandardMaterial;

export function natureSceneryParts(
  kind: string,
  variant: string,
  material: Material,
  width: number,
  depth: number,
): Part[] | null {
  if (
    !['tree', 'pine', 'rock', 'mountain', 'bush', 'flowers', 'grass', 'crops', 'pit'].includes(kind)
  )
    return null;
  const pieces: Part[] = [];
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string, options?: THREE.MeshStandardMaterialParameters) => {
    const key = color + JSON.stringify(options ?? {});
    let m = cache.get(key);
    if (!m) {
      m = material(color, options);
      cache.set(key, m);
    }
    return m;
  };
  const add = (
    geometry: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0],
    accent = false,
    options?: THREE.MeshStandardMaterialParameters,
  ) =>
    pieces.push({
      geometry,
      material: mat(color, options),
      position: [x, y, z],
      scale,
      rotation,
      tint: !accent,
    });
  const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) =>
    add(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  const orb = (
    radius: number,
    color: string,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number] = [1, 1, 1],
    accent = false,
  ) => add(new THREE.IcosahedronGeometry(radius, 1), color, x, y, z, scale, [0, 0, 0], accent);
  const branch = (
    from: [number, number, number],
    to: [number, number, number],
    radius: number,
    color: string,
  ) => {
    const a = new THREE.Vector3(...from),
      b = new THREE.Vector3(...to),
      delta = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius * 0.55, radius, delta.length(), 7);
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
    );
    add(geometry, color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  };
  if (kind === 'tree' || kind === 'pine') {
    const autumn = variant === 'autumn';
    branch([0, 0.02, 0], [0.015, 1.3, -0.025], 0.074, '#735438');
    for (let n = 0; n < 5; n++) {
      const angle = (n * Math.PI * 2) / 5;
      branch(
        [0, 0.09, 0],
        [Math.cos(angle) * 0.18, 0.016, Math.sin(angle) * 0.18],
        0.036,
        '#594731',
      );
    }
    if (kind === 'tree') {
      for (let n = 0; n < 8; n++) {
        const angle = n * 2.4,
          y = 0.86 + (n % 3) * 0.16,
          x = Math.cos(angle) * 0.23,
          z = Math.sin(angle) * 0.22;
        branch([0, 0.59, 0], [x, y, z], 0.029, '#735438');
        orb(
          0.235 + (n % 2) * 0.025,
          (autumn ? ['#b87535', '#d5a34e', '#976139'] : ['#416b43', '#6e9459', '#315a3d'])[n % 3],
          x,
          y + 0.13,
          z,
          [1, 1.1, 1],
        );
      }
      orb(0.27, autumn ? '#e4b968' : '#84a967', -0.04, 1.3, -0.07);
    } else {
      for (let row = 0; row < 5; row++) {
        const r = 0.41 - row * 0.069,
          y = 0.54 + row * 0.24;
        add(
          new THREE.ConeGeometry(r, 0.68, 10),
          ['#254f3a', '#356949', '#507b53'][row % 3],
          0,
          y,
          0,
          [1, 1, 1],
          [0, row * 0.45, 0],
        );
        for (let n = 0; n < 5; n++) {
          const a = (n * Math.PI * 2) / 5 + row * 0.45;
          add(
            new THREE.ConeGeometry(r * 0.22, 0.25, 5),
            '#356949',
            Math.cos(a) * r * 0.72,
            y - 0.1,
            Math.sin(a) * r * 0.72,
            [1, 1, 1],
            [0.12, a, 0.22],
          );
        }
      }
    }
  } else if (kind === 'mountain') {
    // An irregular radial terrain mesh replaces stacked cones. Shared ring
    // vertices keep snow bands watertight and produce actual ridgelines.
    const volcano = variant === 'volcano',
      snowy = variant === 'snowy',
      desert = variant === 'desert';
    const rings = 8,
      sides = 20,
      positions: number[] = [],
      colors: number[] = [],
      uv: number[] = [];
    const rockMaterial = material(desert ? '#b39471' : volcano ? '#625c55' : '#879185');
    const rock = rockMaterial.color.clone();
    rockMaterial.dispose();
    const snow = new THREE.Color('#e6eee9');
    const point = (ring: number, side: number) => {
      const t = ring / rings,
        a = (side / sides) * Math.PI * 2;
      const ridge = 1 + Math.sin(a * 5 + 0.7) * 0.15 + Math.cos(a * 9) * 0.07;
      const r = (volcano ? 0.49 - t * 0.32 : 0.49 * Math.pow(1 - t, 0.92)) * ridge;
      const x = Math.cos(a) * r + Math.sin(t * 2) * 0.035,
        z = Math.sin(a) * r;
      const y =
        0.035 +
        t * (volcano ? 0.92 : 1.36) +
        Math.sin(a * 7 + t * 3) * 0.065 * Math.sin(t * Math.PI);
      return [x, y, z, t] as const;
    };
    const vertex = (p: readonly number[], shade: number) => {
      positions.push(p[0], p[1], p[2]);
      uv.push(p[0] + 0.5, p[2] + 0.5);
      const c = (snowy && p[3] > 0.57 + Math.sin(p[0] * 30) * 0.08 ? snow : rock)
        .clone()
        .multiplyScalar(shade);
      colors.push(c.r, c.g, c.b);
    };
    for (let row = 0; row < rings; row++)
      for (let n = 0; n < sides; n++) {
        const a = point(row, n),
          b = point(row, n + 1),
          c = point(row + 1, n),
          d = point(row + 1, n + 1);
        const shade = 0.84 + ((n * 7 + row * 3) % 7) * 0.036;
        for (const p of [a, c, b, b, c, d]) vertex(p, shade);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    pieces.push({
      geometry: g,
      material: mat('#ffffff', { vertexColors: true }),
      position: [0, 0, 0],
    });
    // The material-coloured terrain remains one draw and retains snow accents.
    if (volcano) {
      add(
        new THREE.CylinderGeometry(0.15, 0.17, 0.035, 20),
        '#e78334',
        0.033,
        0.927,
        0,
        [1, 1, 1],
        [0, 0, 0],
        true,
        { emissive: '#e54e22', emissiveIntensity: 0.7 },
      );
      for (let n = 0; n < 7; n++)
        box(0.018, 0.015, 0.095, '#e78334', 0.08 + n * 0.035, 0.84 - n * 0.12, 0.08 + n * 0.034);
    }
    for (let n = 0; n < 6; n++)
      orb(
        0.065,
        desert ? '#c0a078' : '#6c7568',
        Math.cos(n * 2.4) * 0.39,
        0.07,
        Math.sin(n * 2.4) * 0.38,
        [1.3, 0.7, 1],
      );
  } else if (kind === 'rock') {
    if (variant === 'crystal') {
      for (let n = 0; n < 5; n++) {
        const x = Math.cos(n * 2.4) * 0.2,
          z = Math.sin(n * 2.4) * 0.2,
          h = n === 0 ? 0.85 : 0.4 + (n % 3) * 0.13;
        add(
          new THREE.CylinderGeometry(0.065, 0.1, h * 0.7, 5),
          ['#8e82b0', '#b4acd5', '#746a94'][n % 3],
          x,
          h * 0.36,
          z,
          [1, 1, 1],
          [z * 0.6, 0, -x * 0.6],
          false,
          { roughness: 0.28, metalness: 0.14 },
        );
        add(new THREE.ConeGeometry(0.068, h * 0.3, 5), '#d3c9e7', x, h * 0.85, z);
      }
    } else {
      const count = variant === 'boulder' ? 1 : variant === 'pile' ? 9 : 3;
      for (let n = 0; n < count; n++) {
        const radius = count === 1 ? 0.4 : count > 3 ? 0.1 + (n % 3) * 0.027 : 0.22;
        const x = count === 1 ? 0 : Math.cos(n * 2.4) * 0.22,
          z = count === 1 ? 0 : Math.sin(n * 2.4) * 0.2;
        const geometry = new THREE.IcosahedronGeometry(radius, 1),
          p = geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const factor = 1 + Math.sin(p.getX(i) * 21 + p.getZ(i) * 13) * 0.085;
          p.setXYZ(i, p.getX(i) * factor, p.getY(i) * factor, p.getZ(i) * factor);
        }
        geometry.computeVertexNormals();
        add(
          geometry,
          variant === 'desert'
            ? '#bf9b72'
            : variant === 'ice'
              ? '#96bcc8'
              : n % 2
                ? '#91998a'
                : '#727d73',
          x,
          radius * 0.71,
          z,
          [1, variant === 'boulder' ? 1.2 : 0.8, 1.15],
          [0.1, n * 0.7, 0],
          false,
          variant === 'ice' ? { roughness: 0.25 } : undefined,
        );
        if (variant === 'moss' || variant === 'ice')
          orb(
            radius * 0.75,
            variant === 'moss' ? '#73945b' : '#e0eef0',
            x - 0.03,
            radius * 1.36,
            z,
            [1, 0.2, 1],
          );
      }
    }
  } else if (kind === 'bush') {
    if (variant === 'desert') {
      branch([0, 0.01, 0], [0, 0.64, 0], 0.07, '#738b58');
      branch([0, 0.23, 0], [-0.22, 0.3, 0], 0.055, '#738b58');
      branch([-0.22, 0.28, 0], [-0.22, 0.52, 0], 0.05, '#738b58');
      branch([0, 0.19, 0], [0.21, 0.21, 0], 0.05, '#738b58');
      branch([0.21, 0.21, 0], [0.21, 0.4, 0], 0.04, '#738b58');
      for (let n = 0; n < 5; n++) box(0.008, 0.48, 0.008, '#c5bb89', (n - 2) * 0.025, 0.3, 0.064);
      orb(0.04, '#d78b95', 0, 0.66, 0, [1, 0.55, 1], true);
    } else
      for (let n = 0; n < 7; n++) {
        const x = Math.cos(n * 2.4) * 0.23,
          z = Math.sin(n * 2.4) * 0.23;
        orb(
          0.18 + (n % 2) * 0.035,
          variant === 'frost' ? '#7b9b95' : ['#527846', '#6c9154', '#345c3c'][n % 3],
          x,
          0.23 + (n % 2) * 0.09,
          z,
        );
        if (variant === 'frost') orb(0.16, '#dce9e7', x, 0.35, z, [1.1, 0.23, 1]);
        if (variant === 'thorn') branch([x, 0.26, z], [x + 0.05, 0.52, z - 0.02], 0.012, '#c5b28c');
        else if (variant !== 'frost')
          orb(0.019, '#b37974', x + 0.05, 0.35, z + 0.08, [1, 1, 1], true);
      }
  } else if (kind === 'crops' || kind === 'flowers' || kind === 'grass') {
    const nx = Math.min(16, Math.max(3, Math.round(width * (kind === 'grass' ? 1 : 1.4))));
    const nz = Math.min(16, Math.max(3, Math.round(depth * (kind === 'grass' ? 1 : 1.4))));
    const sx = Math.min(1 / nx, 1 / Math.max(1, width * 1.4)),
      sz = Math.min(1 / nz, 1 / Math.max(1, depth * 1.4));
    if (kind === 'crops') {
      box(0.98, 0.012, 0.98, '#65513b', 0, 0.007, 0);
      for (let row = 0; row < nz; row++)
        box(0.94, 0.017, sz * 0.6, '#92714b', 0, 0.024, -0.46 + ((row + 0.5) * 0.92) / nz);
    } else if (kind === 'grass')
      box(0.99, 0.009, 0.99, variant === 'dry' ? '#b1a275' : '#60844a', 0, 0.005, 0);
    for (let row = 0; row < nz; row++)
      for (let col = 0; col < nx; col++) {
        const n = row * nx + col,
          x = -0.43 + (col * 0.86) / Math.max(1, nx - 1),
          z = -0.43 + (row * 0.86) / Math.max(1, nz - 1),
          r = Math.min(sx, sz) * 0.27;
        if (kind === 'crops' && ['pumpkins', 'vegetables'].includes(variant)) {
          orb(r, variant === 'pumpkins' ? '#d59a4e' : '#8aa45b', x, 0.06, z, [
            1,
            0.8 / Math.max(r, 0.01),
            1,
          ]);
          // Vertical size is normalized later; all rows keep the same plant height.
          branch([x, 0.1, z], [x + sx * 0.07, 0.96, z], sx * 0.028, '#60834c');
          if (variant === 'pumpkins')
            for (let k = 0; k < 5; k++)
              add(
                new THREE.TorusGeometry(r * 0.94, r * 0.035, 3, 10),
                '#b47636',
                x,
                0.06,
                z,
                [1, 0.8 / r, 1],
                [0, (k * Math.PI) / 5, 0],
              );
        } else if (kind === 'crops' && variant === 'vineyard') {
          if (col === 0 || col === nx - 1)
            branch([x, 0.02, z], [x, 0.98, z], sx * 0.026, '#8f7550');
          orb(r * 1.6, '#668a46', x, 0.76, z, [1, 0.13 / r, 1]);
          orb(r * 0.38, '#8d6c96', x, 0.47, z + sz * 0.09, [1, 2.7, 1], true);
          if (col === 0) box(0.92, 0.015, sz * 0.017, '#9f9265', 0, 0.72, z);
        } else if (kind === 'flowers' && variant === 'mushrooms') {
          branch([x, 0.02, z], [x, 0.45, z], r * 0.18, '#dcd0ac');
          add(
            new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
            '#bb6e5d',
            x,
            0.45,
            z,
            [1, 0.28 / r, 1],
          );
          orb(r * 0.16, '#ece2c3', x + r * 0.23, 0.67, z + r * 0.2, [1, 1, 1], true);
        } else {
          const corn = kind === 'crops' && variant === 'corn';
          const h = 0.68 + (n % 3) * 0.1;
          const green =
            (kind === 'grass' && variant === 'dry') || variant === 'dead'
              ? '#baab7b'
              : kind === 'crops' && !corn
                ? '#baa369'
                : '#5e8a4c';
          branch(
            [x, 0.01, z],
            [x + sx * 0.1, h, z],
            sx * (kind === 'grass' ? 0.004 : 0.018),
            green,
          );
          for (const side of [-1, 1])
            branch(
              [x, h * 0.4, z],
              [x + sx * 0.22 * side, h * 0.65, z + sz * 0.1],
              sx * (corn ? 0.045 : 0.016),
              green,
            );
          if (kind === 'crops')
            add(
              new THREE.ConeGeometry(r * (corn ? 0.16 : 0.08), corn ? 0.09 : 0.11, 5),
              '#debd69',
              x + sx * 0.1,
              h + 0.07,
              z,
              [1, 1, 1],
            );
          else if (kind === 'flowers') {
            const color =
              variant === 'roses'
                ? '#ce7685'
                : variant === 'lavender'
                  ? '#a894c4'
                  : variant === 'sunflowers'
                    ? '#dfb75b'
                    : variant === 'dead'
                      ? '#bca886'
                      : ['#cda0b1', '#ddc883', '#a5b0ce'][n % 3];
            if (variant === 'lavender')
              for (let k = 0; k < 3; k++) orb(r * 0.35, color, x, h + k * 0.08, z, [1, 2, 1]);
            else {
              for (let k = 0; k < (variant === 'sunflowers' ? 8 : 5); k++)
                orb(
                  r * 0.39,
                  color,
                  x + Math.cos((k * 2 * Math.PI) / 5) * r * 0.48,
                  h,
                  z + Math.sin((k * 2 * Math.PI) / 5) * r * 0.48,
                  [1, 0.035 / r, 1],
                );
              orb(
                r * 0.25,
                variant === 'sunflowers' ? '#69523c' : '#e1cb83',
                x,
                h + 0.025,
                z,
                [1, 0.04 / r, 1],
                true,
              );
            }
          }
        }
      }
  } else if (kind === 'pit') {
    add(
      new THREE.CircleGeometry(0.4, 24),
      '#171d1b',
      0,
      0.012,
      0,
      [1, 1, 1],
      [-Math.PI / 2, 0, 0],
      true,
    );
    for (let n = 0; n < 16; n++) {
      const a = (n * Math.PI * 2) / 16;
      orb(
        0.061,
        n % 2 ? '#8b8975' : '#696e60',
        Math.cos(a) * 0.41,
        0.07,
        Math.sin(a) * 0.41,
        [1.2, 0.65, 1],
      );
    }
    add(
      new THREE.RingGeometry(0.16, 0.38, 24),
      '#343e33',
      0,
      0.019,
      0,
      [1, 1, 1],
      [-Math.PI / 2, 0, 0],
      true,
    );
  }
  return pieces;
}
