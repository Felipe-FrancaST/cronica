export function drawSceneryDetails2D(
  ctx: CanvasRenderingContext2D,
  kind: string,
  variant: string,
  color: (c: string) => string,
) {
  const line = (x: number, y: number, ex: number, ey: number, c: string, w = 0.01) => {
    ctx.strokeStyle = color(c);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  };
  const dot = (x: number, y: number, r: number, c: string) => {
    ctx.fillStyle = color(c);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.shadowBlur = 0;
  if (
    ['house', 'tavern', 'stable'].includes(kind) &&
    !['open', 'tower', 'desert', 'ruined'].includes(variant)
  ) {
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 8; col++) {
        const x = -0.43 + col * 0.11,
          y = -0.39 + row * 0.12;
        line(x, y, x + 0.097, y, '#392f292f', 0.007);
        line(x + (row % 2) * 0.04, y, x + (row % 2) * 0.04, y + 0.08, '#fff5d522', 0.006);
      }
    if (variant === 'inn' || variant === 'manor' || kind === 'tavern') {
      ctx.fillStyle = color('#ddc9a4');
      ctx.fillRect(-0.32, 0.07, 0.18, 0.14);
      ctx.fillStyle = color('#9b7b5a');
      ctx.fillRect(-0.34, 0.065, 0.22, 0.05);
    }
  } else if (kind === 'floor' || kind === 'rug') {
    if (kind === 'rug')
      for (let n = 0; n < 12; n++)
        for (const y of [-0.43, 0.43])
          line(-0.36 + n * 0.065, y, -0.36 + n * 0.065, y + Math.sign(y) * 0.026, '#e3d2a9', 0.008);
    else if (variant === 'wood')
      for (let n = 0; n < 7; n++) {
        const x = -0.42 + n * 0.14;
        line(x, -0.33, x + 0.028, 0.29, '#ead4a343', 0.006);
        dot(x, -0.41, 0.005, '#74654f');
      }
  } else if (
    [
      'barrel',
      'chest',
      'cart',
      'counter',
      'table',
      'chair',
      'bookshelf',
      'signpost',
      'boat',
    ].includes(kind)
  ) {
    const r = kind === 'chair' ? 0.16 : kind === 'barrel' ? 0.2 : 0.26;
    if (kind === 'barrel')
      for (let n = 0; n < 6; n++)
        line(-r + n * r * 0.4, -r * 0.65, -r + n * r * 0.4, r * 0.65, '#debe835a', 0.008);
    else
      for (let n = 0; n < 5; n++)
        line(-r, -r + n * r * 0.45, r, -r + n * r * 0.45, '#eed6a343', 0.006);
    if (kind === 'table') {
      dot(-0.18, 0.13, 0.026, '#ceaf83');
      dot(0.18, 0.13, 0.026, '#ceaf83');
    }
    if (kind === 'chest')
      for (const x of [-0.23, 0.23]) for (const y of [-0.15, 0.17]) dot(x, y, 0.012, '#e8d394');
    if (kind === 'boat') for (const y of [-0.3, 0.3]) dot(0.21, y, 0.019, '#d4c89e');
  } else if (kind === 'market') {
    for (let n = 0; n < 7; n++)
      line(
        -0.35 + n * 0.115,
        -0.35,
        -0.35 + n * 0.115,
        0.24,
        n % 2 ? '#d6c7a477' : '#78968566',
        0.037,
      );
  } else if (['wall', 'doorway', 'fence', 'bridge'].includes(kind)) {
    for (let n = 0; n < 7; n++)
      line(-0.44 + n * 0.14, -0.05, -0.44 + n * 0.14, 0.05, '#dfd3ac68', 0.008);
    if (kind === 'bridge')
      for (let n = 0; n < 12; n++)
        line(-0.31, -0.43 + n * 0.08, 0.31, -0.43 + n * 0.08, '#d5c29a55', 0.007);
  } else if (['ruin', 'well', 'statue', 'gravestone', 'cross', 'fountain'].includes(kind)) {
    if (kind === 'fountain' && variant !== 'dry')
      for (let n = 0; n < 4; n++) {
        const a = (n * Math.PI) / 2;
        line(
          Math.cos(a) * 0.2,
          Math.sin(a) * 0.2,
          Math.cos(a) * 0.29,
          Math.sin(a) * 0.29,
          '#d1e5de',
          0.011,
        );
      }
    else for (let n = 0; n < 4; n++) dot(-0.2 + n * 0.115, 0.29 + (n % 2) * 0.03, 0.025, '#8d9e6a');
  } else if (kind === 'tent') {
    for (const x of [-0.41, 0.41])
      for (const y of [-0.41, 0.41]) {
        line(x * 0.7, y * 0.7, x, y, '#d5c19b', 0.01);
        dot(x, y, 0.012, '#775f42');
      }
    for (let n = 0; n < 5; n++)
      line(-0.3 + n * 0.15, -0.28, -0.3 + n * 0.15, 0.26, '#f5e1b638', 0.008);
  } else if (kind === 'bed') {
    for (const x of [-0.16, 0.16]) line(x, -0.03, x, 0.33, '#e1cbb081', 0.02);
    line(-0.24, 0.3, 0.24, 0.3, '#e1cbb081', 0.02);
  } else if (kind === 'stairs') {
    for (let n = 0; n < 7; n++)
      line(-0.37, -0.37 + n * 0.12, 0.37, -0.37 + n * 0.12, '#efdfb670', 0.016);
  } else if (kind === 'portal') {
    for (let n = 0; n < 8; n++) {
      const a = (n * Math.PI) / 4;
      dot(Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0.012, '#c9c1de');
    }
  } else if (kind === 'torch' || kind === 'campfire' || kind === 'forge') {
    dot(0, 0, kind === 'torch' ? 0.045 : 0.022, '#f0dca4');
  }
}
