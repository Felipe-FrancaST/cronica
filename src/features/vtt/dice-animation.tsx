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
    let width = 1,
      height = 1,
      dpr = 1,
      frame = 0,
      done = false;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const duration = animated && !reduce.matches ? 1650 : 0;
    const start = performance.now();
    const columns = Math.min(6, dice.length),
      rows = Math.ceil(dice.length / columns);
    const resize = () => {
      width = Math.max(1, canvas.clientWidth);
      height = rows > 1 ? 204 : 148;
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const colors: Record<number, number> = { 4: 150, 6: 205, 8: 37, 10: 273, 12: 183, 20: 350 };
    const draw = (time: number) => {
      const p =
        duration && !reduce.matches ? Math.min(1, Math.max(0, (time - start) / duration)) : 1;
      ctx.clearRect(0, 0, width, height);
      // Every die follows its own short ballistic arc and settles smoothly into its final face.
      const radius = Math.min(36, ((width - 12) / columns) * 0.34);
      prepared.forEach(({ die, mesh, winner }, index) => {
        const q = p === 1 ? 1 : Math.min(1, p * (1.08 - index * 0.006)),
          rest = 1 - q,
          ease = rest ** 3;
        const col = index % columns,
          row = Math.floor(index / columns),
          rowCount = Math.min(columns, dice.length - row * columns);
        const targetX = ((col + 0.5) * width) / rowCount;
        const baseY = ((row + 0.55) * height) / rows;
        const cx = targetX + Math.sin(index * 2.1 + 0.8) * radius * 1.25 * ease;
        const bounce = Math.abs(Math.sin(q * Math.PI * 3.2)) * rest * rest * radius * 0.85;
        const cy = baseY - bounce;
        const hue = die.discarded ? 210 : (colors[die.sides] ?? 37);
        ctx.save();
        ctx.globalAlpha = die.discarded ? 0.4 : 1;
        const shadow = ctx.createRadialGradient(
          cx,
          baseY + radius * 0.8,
          1,
          cx,
          baseY + radius * 0.8,
          radius * 1.1,
        );
        shadow.addColorStop(0, 'rgba(0,0,0,.65)');
        shadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.ellipse(
          cx,
          baseY + radius * 0.8,
          radius * (0.95 - (bounce / radius) * 0.25),
          radius * 0.24,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        // A soft landing ring and brief sparks add depth without extra DOM nodes or a second GPU context.
        if (q > 0.72 && q < 1 && animated && !reduce.matches) {
          const land = (q - 0.72) / 0.28;
          ctx.strokeStyle = `hsla(${hue},65%,75%,${Math.sin(land * Math.PI) * 0.3})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(
            targetX,
            baseY + radius * 0.82,
            radius * (0.6 + land),
            radius * (0.12 + land * 0.12),
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          ctx.fillStyle = `hsla(${hue},70%,82%,${(1 - land) * 0.6})`;
          for (let j = 0; j < 5; j++) {
            const angle = j * 1.26 + index;
            ctx.beginPath();
            ctx.arc(
              targetX + Math.cos(angle) * radius * (0.7 + land * 0.55),
              baseY + radius * 0.4 + Math.sin(angle) * radius * 0.4 - land * radius * 0.45,
              1.1,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }
        const verts = mesh.vertices.map(
          rotation(
            0.25 + ease * Math.PI * (5.4 + index * 0.13),
            0.4 + ease * Math.PI * (6.8 + index * 0.19),
            0.13 + ease * Math.PI * (3.7 + index * 0.17),
          ),
        );
        const faces = mesh.faces
          .map((face, id) => ({
            face,
            id,
            z: face.reduce((n, j) => n + verts[j][2], 0) / face.length,
          }))
          .sort((a, b) => a.z - b.z);
        const front = faces[faces.length - 1].id;
        for (const { face, id, z } of faces) {
          const points = face.map((i) => {
            const v = verts[i],
              perspective = 1 / (1 - v[2] * 0.13);
            return [cx + v[0] * radius * perspective, cy - v[1] * radius * perspective];
          });
          const light = Math.max(18, Math.min(62, 34 + z * 22));
          const gloss = ctx.createLinearGradient(
            cx - radius,
            cy - radius,
            cx + radius,
            cy + radius,
          );
          gloss.addColorStop(0, `hsl(${hue} ${die.discarded ? 8 : 46}% ${light + 15}%)`);
          gloss.addColorStop(0.38, `hsl(${hue} ${die.discarded ? 8 : 48}% ${light}%)`);
          gloss.addColorStop(
            1,
            `hsl(${hue} ${die.discarded ? 8 : 45}% ${Math.max(12, light - 13)}%)`,
          );
          ctx.fillStyle = gloss;
          ctx.strokeStyle = `hsla(${hue},45%,85%,.65)`;
          ctx.lineWidth = 0.9;
          ctx.lineJoin = 'round';
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
            ctx.font = `700 ${Math.max(9, radius * 0.53)}px Inter,sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#0008';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 1;
            ctx.fillStyle = '#fff9e7';
            ctx.fillText(label, x, y);
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
          }
        }
        ctx.font = `600 ${Math.max(9, Math.min(10, width / columns / 6))}px Inter,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = die.discarded ? '#7a827d' : '#aab4ba';
        ctx.fillText(
          die.tens ? 'd100 · dezenas' : `d${die.sides}${die.discarded ? ' · descartado' : ''}`,
          targetX,
          baseY + radius + 16,
        );
        ctx.restore();
      });
      if (p < 1) frame = requestAnimationFrame(draw);
      else if (!done) {
        done = true;
        complete.current?.();
      }
    };
    const observer = new ResizeObserver(() => {
      resize();
      if (done) draw(start + duration);
    });
    observer.observe(canvas);
    const motionChanged = () => {
      if (reduce.matches && !done) {
        cancelAnimationFrame(frame);
        draw(start + duration);
      }
    };
    reduce.addEventListener('change', motionChanged);
    draw(start);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reduce.removeEventListener('change', motionChanged);
    };
  }, [roll.id, animated]);
  return (
    <canvas
      ref={ref}
      className="dice-animation"
      aria-label={`Animação dos dados: ${roll.expression}`}
      role="img"
    />
  );
}
