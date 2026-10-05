'use client';
import { useEffect, useRef } from 'react';
import meshes from './dice-meshes.json';
import { diceForAnimation, type DiceRoll } from './dice';
type Point = [number, number, number];
type Mesh = { vertices: number[][]; faces: number[][] };
function rotation(x: number, y: number, z: number) {
  const sx = Math.sin(x),
    cx = Math.cos(x),
    sy = Math.sin(y),
    cy = Math.cos(y),
    sz = Math.sin(z),
    cz = Math.cos(z);
  return (v: number[]): Point => {
    const ay = v[1] * cx - v[2] * sx,
      az = v[1] * sx + v[2] * cx;
    const bx = v[0] * cy + az * sy,
      bz = -v[0] * sy + az * cy;
    return [bx * cz - ay * sz, bx * sz + ay * cz, bz];
  };
}
/** Polygon projection, not another WebGL context. Animation cannot change server outcomes. */
export function DiceAnimation({
  roll,
  animated,
  onComplete,
}: {
  roll: DiceRoll;
  animated: boolean;
  onComplete?(): void;
}) {
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dice = diceForAnimation(roll, 10)
      .flatMap((d) =>
        d.sides === 100
          ? [
              {
                ...d,
                sides: 10,
                tens: true,
                value: d.value === 100 ? 0 : Math.floor(d.value / 10),
              },
              { ...d, sides: 10, tens: false, value: d.value % 10 },
            ]
          : [{ ...d, tens: false }],
      )
      .slice(0, 12);
    if (!dice.length) {
      complete.current?.();
      return;
    }
    const finalRotation = rotation(0.25, 0.4, 0.13);
    const prepared = dice.map((die) => {
      const mesh = (meshes as Record<string, Mesh>)[String(die.sides)];
      const verts = mesh.vertices.map(finalRotation);
      const winner = mesh.faces
        .map((f, id) => ({ id, z: f.reduce((n, j) => n + verts[j][2], 0) / f.length }))
        .sort((a, b) => b.z - a.z)[0].id;
      return { die, mesh, winner };
    });
    const width = Math.max(240, canvas.clientWidth),
      height = dice.length > 6 ? 184 : 116,
      dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches,
      duration = animated && !reduce ? 1250 : 0,
      start = performance.now();
    let frame = 0;
    const columns = Math.min(6, dice.length),
      rows = Math.ceil(dice.length / columns),
      radius = Math.min(34, ((width - 16) / columns) * 0.36);
    const draw = (time: number) => {
      const p = duration ? Math.min(1, Math.max(0, (time - start) / duration)) : 1,
        eased = 1 - Math.pow(1 - p, 3);
      ctx.clearRect(0, 0, width, height);
      prepared.forEach(({ die, mesh, winner }, index) => {
        const col = index % columns,
          row = Math.floor(index / columns),
          cx = ((col + 0.5) * width) / columns,
          baseY = ((row + 0.7) * height) / rows;
        const bounce = Math.abs(Math.sin(p * Math.PI * 5 + index * 0.2)) * (1 - p) * radius * 0.72;
        ctx.save();
        ctx.globalAlpha = die.discarded ? 0.55 : 1;
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath();
        ctx.ellipse(
          cx,
          baseY + radius * 0.74,
          radius * 0.78 * (1 - bounce / (radius * 3)),
          radius * 0.16,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        const yaw = 0.4 + (1 - eased) * (Math.PI * 7 + index * 0.5),
          pitch = 0.25 + (1 - eased) * Math.PI * 6,
          spin = 0.13 + (1 - eased) * Math.PI * 5;
        const verts = mesh.vertices.map(rotation(pitch, yaw, spin));
        const sorted = mesh.faces
          .map((face, id) => ({
            face,
            id,
            z: face.reduce((n, j) => n + verts[j][2], 0) / face.length,
          }))
          .sort((a, b) => a.z - b.z);
        const front = sorted[sorted.length - 1].id;
        for (const { face, id, z } of sorted) {
          const points = face.map((i) => {
            const v = verts[i],
              perspective = 1 / (1 - v[2] * 0.13);
            return [cx + v[0] * radius * perspective, baseY - bounce - v[1] * radius * perspective];
          });
          const light = Math.max(22, Math.min(57, 38 + z * 19));
          ctx.fillStyle = die.discarded ? `hsl(90 7% ${light}%)` : `hsl(39 49% ${light}%)`;
          ctx.strokeStyle = 'rgba(242,222,176,.55)';
          ctx.lineWidth = 0.85;
          ctx.beginPath();
          points.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          if (id === front) {
            const x = points.reduce((n, v) => n + v[0], 0) / points.length,
              y = points.reduce((n, v) => n + v[1], 0) / points.length;
            const n = ((die.value - 1 + id - winner + die.sides * 3) % die.sides) + 1;
            const label = die.tens
              ? String(id === winner ? die.value * 10 : (n % 10) * 10).padStart(2, '0')
              : String(id === winner ? die.value : n);
            ctx.fillStyle = '#fff5d9';
            ctx.font = `700 ${Math.max(10, radius * 0.52)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x, y);
          }
        }
        ctx.restore();
      });
      if (p < 1) frame = requestAnimationFrame(draw);
      else complete.current?.();
    };
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [roll.id, animated]);
  return (
    <canvas
      ref={ref}
      className="dice-animation"
      aria-label={`Animação dos dados: total ${roll.total}`}
      role="img"
    />
  );
}
