export function drawAdventureScenery2D(
  ctx: CanvasRenderingContext2D,
  kind: string,
  variant: string,
  paint: (color: string) => string,
  lit = true,
) {
  if (
    ![
      'lanternpost',
      'candelabra',
      'fireplace',
      'beacon',
      'gong',
      'pressureplate',
      'secretwall',
      'supplycrate',
    ].includes(kind)
  )
    return false;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = paint(color);
    ctx.fillRect(x, y, w, h);
  };
  const circle = (x: number, y: number, r: number, color: string) => {
    ctx.fillStyle = paint(color);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  if (['lanternpost', 'candelabra', 'beacon'].includes(kind)) {
    rect(-0.06, -0.32, 0.12, 0.64, '#71604b');
    const xs = kind === 'candelabra' ? [-0.24, 0, 0.24] : [0];
    if (kind === 'candelabra') rect(-0.28, -0.04, 0.56, 0.08, '#ac883d');
    for (const x of xs) {
      circle(x, 0, 0.1, '#a48851');
      circle(x, 0, 0.065, lit ? (kind === 'beacon' ? '#92dfff' : '#ffe2a2') : '#665b4b');
    }
  } else if (kind === 'fireplace') {
    rect(-0.45, -0.35, 0.9, 0.7, '#8e8b80');
    rect(-0.29, -0.2, 0.58, 0.4, '#333536');
    rect(-0.24, -0.03, 0.48, 0.07, '#6f4c31');
    if (lit) {
      circle(-0.12, 0, 0.1, '#e88639');
      circle(0.13, 0, 0.085, '#ffc466');
    }
  } else if (kind === 'gong') {
    rect(-0.45, -0.3, 0.9, 0.09, '#76523a');
    circle(0, 0, 0.28, variant === 'activated' ? '#e4c068' : '#b48a43');
    circle(0, 0, 0.07, '#8e6d34');
  } else if (kind === 'pressureplate') {
    rect(-0.44, -0.44, 0.88, 0.88, '#8d9086');
    rect(-0.33, -0.33, 0.66, 0.66, variant === 'activated' ? '#bd9857' : '#51585b');
  } else if (kind === 'secretwall') {
    rect(-0.45, -0.12, 0.9, 0.24, '#8b968b');
    if (variant === 'open') rect(-0.28, -0.15, 0.56, 0.3, '#252d2b');
    else for (const x of [-0.3, 0, 0.3]) rect(x, -0.12, 0.014, 0.24, '#495952');
  } else {
    rect(-0.42, -0.34, 0.84, 0.68, '#765136');
    for (const x of [-0.28, 0.24]) rect(x, -0.34, 0.05, 0.68, '#424a4c');
    if (variant === 'open') {
      rect(-0.33, -0.25, 0.66, 0.5, '#32251d');
      circle(-0.14, 0, 0.1, '#bea274');
      circle(0.15, 0, 0.09, '#d4bd86');
    }
  }
  return true;
}
