export function drawExtraScenery2D(
  ctx: CanvasRenderingContext2D,
  kind: string,
  variant: string,
  color: (base: string) => string,
) {
  const rect = (x: number, y: number, w: number, h: number, base: string) => {
    ctx.fillStyle = color(base);
    ctx.fillRect(x, y, w, h);
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, base: string) => {
    ctx.fillStyle = color(base);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (kind === 'barrel') {
    if (variant === 'crate') {
      rect(-0.35, -0.35, 0.7, 0.7, '#b78c5c');
      ctx.strokeStyle = color('#725338');
      ctx.lineWidth = 0.06;
      ctx.strokeRect(-0.34, -0.34, 0.68, 0.68);
      ctx.beginPath();
      ctx.moveTo(-0.28, -0.28);
      ctx.lineTo(0.28, 0.28);
      ctx.moveTo(0.28, -0.28);
      ctx.lineTo(-0.28, 0.28);
      ctx.stroke();
    } else {
      ellipse(0, 0, 0.33, 0.4, '#b28553');
      ctx.strokeStyle = '#515957';
      ctx.lineWidth = 0.045;
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.32, 0.39, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (const x of [-0.14, 0, 0.14]) {
        ctx.strokeStyle = color('#795331');
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.moveTo(x, -0.32);
        ctx.lineTo(x, 0.32);
        ctx.stroke();
      }
    }
  } else if (kind === 'boat') {
    ctx.fillStyle = color('#996e45');
    ctx.beginPath();
    ctx.moveTo(0, -0.46);
    ctx.bezierCurveTo(-0.44, -0.2, -0.36, 0.28, 0, 0.46);
    ctx.bezierCurveTo(0.36, 0.28, 0.44, -0.2, 0, -0.46);
    ctx.fill();
    ellipse(0, 0.04, 0.22, 0.3, '#ceae77');
    for (const y of [-0.17, 0.02, 0.2]) rect(-0.26, y, 0.52, 0.035, '#62442e');
    if (variant === 'ship') {
      rect(-0.2, 0.2, 0.4, 0.17, '#805f40');
      for (const y of [-0.23, 0.04]) {
        rect(-0.018, y - 0.12, 0.036, 0.24, '#5b422e');
        ctx.fillStyle = color('#efe1bd');
        ctx.beginPath();
        ctx.moveTo(-0.31, y - 0.04);
        ctx.quadraticCurveTo(0, y + 0.16, 0.31, y - 0.04);
        ctx.lineTo(0.31, y - 0.13);
        ctx.lineTo(-0.31, y - 0.13);
        ctx.fill();
      }
    }
  } else if (kind === 'bush') {
    for (const [x, y, c] of [
      [-0.19, 0.08, '#3d6b3c'],
      [0.2, 0.06, '#628a4b'],
      [0, -0.14, '#7ba465'],
    ] as const)
      ellipse(x, y, 0.24, 0.23, c);
    if (variant === 'thorn') {
      ctx.strokeStyle = '#d9caae';
      ctx.lineWidth = 0.035;
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 0.18, Math.sin(a) * 0.18);
        ctx.lineTo(Math.cos(a) * 0.41, Math.sin(a) * 0.41);
        ctx.stroke();
      }
    }
  } else if (kind === 'flowers') {
    for (const [x, y, c] of [
      [-0.21, -0.13, '#de9ebe'],
      [0.21, -0.16, '#e8c96c'],
      [0.03, 0.21, '#aba0d6'],
    ] as const) {
      if (variant === 'mushrooms') {
        ellipse(x, y, 0.14, 0.13, '#c5685f');
        ctx.fillStyle = '#f1dfc8';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(x + Math.cos(i * 2) * 0.07, y + Math.sin(i * 2) * 0.05, 0.018, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (let i = 0; i < 5; i++)
          ellipse(
            x + Math.cos((i * Math.PI * 2) / 5) * 0.075,
            y + Math.sin((i * Math.PI * 2) / 5) * 0.075,
            0.065,
            0.065,
            c,
          );
        ellipse(x, y, 0.035, 0.035, '#f3d985');
      }
    }
  } else if (kind === 'statue') {
    rect(-0.35, -0.35, 0.7, 0.7, '#7b8980');
    rect(-0.26, -0.27, 0.52, 0.54, '#b7bfb0');
    if (variant === 'obelisk') {
      ctx.fillStyle = color('#d5d9c9');
      ctx.beginPath();
      ctx.moveTo(0, -0.18);
      ctx.lineTo(0.18, 0);
      ctx.lineTo(0, 0.18);
      ctx.lineTo(-0.18, 0);
      ctx.fill();
      ctx.strokeStyle = color('#526962');
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-0.17, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 0.17);
      ctx.stroke();
    } else {
      ellipse(0, 0, 0.15, 0.2, '#c1c7b7');
      ellipse(0, -0.12, 0.09, 0.09, '#e1e2d1');
      rect(-0.22, -0.02, 0.44, 0.065, '#9da99c');
    }
  } else if (kind === 'chest') {
    rect(-0.37, -0.3, 0.74, 0.6, '#895d3c');
    rect(
      -0.35,
      variant === 'open' ? -0.4 : -0.28,
      0.7,
      variant === 'open' ? 0.16 : 0.56,
      '#ba935d',
    );
    if (variant === 'open') {
      ctx.fillStyle = '#292522';
      ctx.fillRect(-0.3, -0.15, 0.6, 0.38);
      ellipse(0.08, 0.04, 0.04, 0.04, '#e7bf61');
    }
    ctx.fillStyle = '#d9bd75';
    ctx.fillRect(-0.26, -0.31, 0.055, 0.62);
    ctx.fillRect(0.205, -0.31, 0.055, 0.62);
    ctx.fillRect(-0.065, 0.23, 0.13, 0.1);
  } else if (kind === 'campfire') {
    ellipse(0, 0, 0.38, 0.38, variant === 'brazier' ? '#656b69' : '#77766b');
    ellipse(0, 0, 0.29, 0.29, '#302824');
    ctx.strokeStyle = '#62412d';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(-0.22, -0.15);
    ctx.lineTo(0.21, 0.16);
    ctx.moveTo(0.21, -0.16);
    ctx.lineTo(-0.21, 0.16);
    ctx.stroke();
    for (const x of [-0.13, 0.11]) {
      ctx.fillStyle = color('#f19a39');
      ctx.beginPath();
      ctx.moveTo(x - 0.09, 0.2);
      ctx.quadraticCurveTo(x - 0.17, -0.03, x + 0.04, -0.3);
      ctx.quadraticCurveTo(x - 0.02, 0, x + 0.1, 0.12);
      ctx.fill();
      ellipse(x, 0.11, 0.04, 0.08, '#ffe6a3');
    }
  } else if (kind === 'portal' && variant === 'door') {
    rect(-0.4, -0.46, 0.8, 0.9, '#b6af99');
    ctx.fillStyle = '#141d20';
    ctx.fillRect(-0.29, -0.35, 0.58, 0.72);
    rect(-0.27, -0.34, 0.44, 0.71, '#a1794d');
    ctx.strokeStyle = '#d7bd7c';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(-0.23, -0.16);
    ctx.lineTo(0.14, -0.16);
    ctx.moveTo(-0.23, 0.16);
    ctx.lineTo(0.14, 0.16);
    ctx.stroke();
    ctx.fillStyle = '#efd68b';
    ctx.beginPath();
    ctx.arc(0.09, 0.01, 0.025, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'portal' && variant === 'cave') {
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI) / 6;
      ellipse(
        Math.cos(a) * 0.3,
        -Math.sin(a) * 0.22 + 0.05,
        0.16,
        0.19,
        i % 2 ? '#93988e' : '#65716a',
      );
    }
    ctx.fillStyle = '#090e12';
    ctx.beginPath();
    ctx.ellipse(0, 0.08, 0.25, 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'rock' && variant === 'crystal') {
    for (const [x, y] of [
      [-0.19, 0.12],
      [0, -0.14],
      [0.2, 0.1],
    ]) {
      ctx.fillStyle = color('#b0a0dd');
      ctx.beginPath();
      ctx.moveTo(x, y - 0.27);
      ctx.lineTo(x + 0.12, y);
      ctx.lineTo(x, y + 0.16);
      ctx.lineTo(x - 0.12, y);
      ctx.fill();
      ctx.strokeStyle = color('#f4eaff');
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.moveTo(x, y - 0.27);
      ctx.lineTo(x, y + 0.16);
      ctx.stroke();
    }
  } else return false;
  return true;
}
