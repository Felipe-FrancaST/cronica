export function drawNatureScenery2D(
  ctx: CanvasRenderingContext2D,
  kind: string,
  variant: string,
  color: (c: string) => string,
  width: number,
  depth: number,
) {
  if (
    !['tree', 'pine', 'rock', 'mountain', 'bush', 'flowers', 'grass', 'crops', 'pit'].includes(kind)
  )
    return false;
  const ellipse = (x: number, y: number, rx: number, ry: number, c: string) => {
    ctx.fillStyle = color(c);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = (x: number, y: number, ex: number, ey: number, c: string, w = 0.015) => {
    ctx.strokeStyle = color(c);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = color(c);
    ctx.fillRect(x, y, w, h);
  };
  const polygon = (points: [number, number][], c: string) => {
    ctx.fillStyle = color(c);
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  ctx.shadowBlur = 0;
  if (kind === 'mountain') {
    const snowy = variant === 'snowy',
      desert = variant === 'desert',
      volcano = variant === 'volcano';
    const perimeter = Array.from({ length: 20 }, (_, n): [number, number] => {
      const a = (n * Math.PI) / 10,
        r = 0.43 * (1 + Math.sin(a * 5 + 0.7) * 0.13 + Math.cos(a * 9) * 0.05);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    for (let n = 0; n < perimeter.length; n++) {
      const p = perimeter[n],
        next = perimeter[(n + 1) % perimeter.length];
      polygon(
        [[0.02, -0.04], p, next],
        (desert
          ? ['#9f7e57', '#b39369', '#ceb089', '#ac8b62']
          : volcano
            ? ['#626155', '#767668', '#4f554b', '#838577']
            : ['#677564', '#879482', '#acb5a1', '#7b8775'])[n % 4],
      );
      if (n % 3 === 0)
        line(0.02, -0.04, p[0] * 0.82, p[1] * 0.82, desert ? '#dbc4a0' : '#c6cdbb', 0.008);
    }
    if (snowy)
      polygon(
        [
          [0.02, -0.23],
          [0.12, -0.15],
          [0.18, -0.04],
          [0.1, 0.025],
          [0.12, 0.11],
          [0.02, 0.09],
          [-0.11, 0.14],
          [-0.08, 0.035],
          [-0.17, -0.015],
          [-0.075, -0.13],
        ],
        '#e8eee8',
      );
    if (volcano) {
      ellipse(0.02, -0.05, 0.12, 0.1, '#302d29');
      ellipse(0.02, -0.05, 0.085, 0.064, '#e39a49');
      line(0.05, 0.02, 0.23, 0.3, '#eaa65c', 0.025);
    } else ellipse(0.02, -0.04, 0.027, 0.022, snowy ? '#fafdf8' : '#c6cbbb');
  } else if (kind === 'tree' || kind === 'pine' || kind === 'bush') {
    const autumn = variant === 'autumn',
      frost = variant === 'frost';
    if (kind === 'bush' && variant === 'desert') {
      rect(-0.055, -0.28, 0.11, 0.56, '#7a9561');
      rect(-0.27, -0.08, 0.25, 0.085, '#728d59');
      rect(0.02, 0.11, 0.21, 0.085, '#728d59');
      ellipse(-0.23, -0.13, 0.06, 0.13, '#91a875');
      ellipse(0.21, 0.06, 0.048, 0.11, '#91a875');
      ellipse(0, -0.26, 0.045, 0.027, '#cf8c9c');
    } else if (kind === 'pine') {
      for (let row = 0; row < 3; row++) {
        const r = 0.43 - row * 0.1;
        const points = Array.from({ length: 20 }, (_, n): [number, number] => {
          const a = (n * Math.PI) / 10 + row * 0.33,
            radius = n % 2 ? r * 0.56 : r;
          return [Math.cos(a) * radius, Math.sin(a) * radius];
        });
        polygon(points, ['#2e5640', '#487553', '#779762'][row]);
        for (let n = 0; n < 5; n++) {
          const a = (n * Math.PI * 2) / 5 + row * 0.33;
          line(0, 0, Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75, '#9baa77', 0.008);
        }
      }
    } else {
      for (let n = 0; n < 9; n++) {
        const a = n * 2.4,
          x = Math.cos(a) * 0.22,
          y = Math.sin(a) * 0.22;
        ellipse(
          x,
          y,
          0.2,
          0.19,
          (autumn
            ? ['#a06939', '#c5944e', '#dbb363']
            : frost
              ? ['#76988d', '#a4b9ac', '#c9d9cc']
              : ['#3e6441', '#5e844d', '#7da05c'])[n % 3],
        );
        ellipse(
          x - 0.035,
          y - 0.05,
          0.077,
          0.048,
          autumn ? '#e7c581' : frost ? '#e7eee6' : '#90ac70',
        );
      }
      if (variant === 'thorn')
        for (let n = 0; n < 7; n++) {
          const a = n * 2.4;
          line(
            Math.cos(a) * 0.25,
            Math.sin(a) * 0.25,
            Math.cos(a) * 0.43,
            Math.sin(a) * 0.43,
            '#bbad85',
            0.017,
          );
        }
    }
  } else if (kind === 'rock') {
    const crystal = variant === 'crystal',
      count = variant === 'boulder' ? 1 : variant === 'pile' ? 9 : crystal ? 5 : 3;
    for (let n = 0; n < count; n++) {
      const x = count === 1 ? 0 : Math.cos(n * 2.4) * 0.23,
        y = count === 1 ? 0 : Math.sin(n * 2.4) * 0.2,
        r = count === 1 ? 0.42 : count > 5 ? 0.12 : 0.21;
      const points = Array.from({ length: 6 }, (_, k): [number, number] => [
        x + Math.cos((k * Math.PI) / 3 + n) * r,
        y + Math.sin((k * Math.PI) / 3 + n) * r * 0.82,
      ]);
      const c = crystal
        ? ['#8f80b0', '#b1a6cf', '#d2c8e4'][n % 3]
        : variant === 'desert'
          ? '#b79975'
          : variant === 'ice'
            ? '#a0c4ca'
            : n % 2
              ? '#929d8a'
              : '#7c8879';
      polygon(points, c);
      polygon(
        [points[0], points[1], [x - r * 0.1, y]],
        crystal ? '#e6deed' : variant === 'ice' ? '#d4e7e6' : '#bac2ac',
      );
      line(
        points[3][0],
        points[3][1],
        x + r * 0.1,
        y - r * 0.07,
        crystal ? '#8d79a5' : '#61715e',
        0.009,
      );
      if (variant === 'moss') ellipse(x - r * 0.23, y - r * 0.12, r * 0.48, r * 0.24, '#7c985a');
    }
  } else if (kind === 'pit') {
    ellipse(0, 0, 0.43, 0.43, '#6d705e');
    ellipse(0, 0, 0.36, 0.36, '#3c4537');
    ellipse(0.025, 0.025, 0.28, 0.28, '#171e18');
    for (let n = 0; n < 15; n++) {
      const a = (n * Math.PI * 2) / 15;
      ellipse(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.038, 0.03, n % 2 ? '#96967d' : '#777e65');
    }
  } else {
    const nx = Math.min(16, Math.max(3, Math.round(width * (kind === 'grass' ? 1 : 1.4)))),
      nz = Math.min(16, Math.max(3, Math.round(depth * (kind === 'grass' ? 1 : 1.4))));
    const r = Math.min(1 / nx, 1 / nz, 1 / width, 1 / depth) * 0.28;
    if (kind === 'crops') {
      rect(-0.49, -0.49, 0.98, 0.98, '#6b573d');
      for (let row = 0; row < nz; row++)
        rect(-0.47, -0.47 + (row / nz) * 0.94, 0.94, 0.7 / nz, '#92774d');
    } else if (kind === 'grass')
      rect(-0.495, -0.495, 0.99, 0.99, variant === 'dry' ? '#a9a273' : '#64874e');
    for (let row = 0; row < nz; row++)
      for (let col = 0; col < nx; col++) {
        const n = row * nx + col,
          x = -0.43 + (col * 0.86) / (nx - 1),
          y = -0.43 + (row * 0.86) / (nz - 1);
        if (kind === 'crops' && ['pumpkins', 'vegetables', 'vineyard'].includes(variant)) {
          ellipse(x, y, r * 1.6, r * 1.05, '#73944d');
          if (variant === 'pumpkins') {
            ellipse(x, y, r, r * 0.9, '#d2a05e');
            line(x, y - r * 0.85, x, y + r * 0.85, '#b58140', r * 0.17);
          }
          if (variant === 'vineyard') {
            if (col === 0) line(-0.47, y, 0.47, y, '#ad9870', r * 0.18);
            ellipse(x + r * 0.4, y + r * 0.4, r * 0.32, r * 0.26, '#a487a7');
          }
        } else if (kind === 'flowers') {
          if (variant === 'mushrooms') {
            ellipse(x, y, r * 1.1, r, '#bd7963');
            ellipse(x - r * 0.3, y - r * 0.3, r * 0.18, r * 0.18, '#eee1c4');
          } else {
            const c =
              variant === 'roses'
                ? '#d18e9a'
                : variant === 'lavender'
                  ? '#b0a0d0'
                  : variant === 'sunflowers'
                    ? '#ddc373'
                    : variant === 'dead'
                      ? '#b9ac89'
                      : ['#cda4b5', '#d7c889', '#b8becf'][n % 3];
            for (let k = 0; k < 5; k++)
              ellipse(
                x + Math.cos((k * Math.PI * 2) / 5) * r * 0.44,
                y + Math.sin((k * Math.PI * 2) / 5) * r * 0.44,
                r * 0.5,
                r * 0.42,
                c,
              );
            ellipse(x, y, r * 0.28, r * 0.28, variant === 'sunflowers' ? '#796147' : '#ecdb9c');
          }
        } else {
          const c =
            kind === 'grass'
              ? variant === 'dry'
                ? '#d3c794'
                : '#98b276'
              : variant === 'corn'
                ? '#8aaa5d'
                : '#d2b878';
          line(x, y + r, x + r * 0.15, y - r, c, r * 0.28);
          line(x - r * 0.6, y + r * 0.4, x + r * 0.4, y - r * 0.65, c, r * 0.25);
        }
      }
  }
  return true;
}
