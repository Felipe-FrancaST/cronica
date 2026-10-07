'use client';
import { useEffect, useRef } from 'react';
import { medievalCityPreview } from './medieval-city';
import { drawScenery2D } from './scenery-art';

export function MedievalCityPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 768, 672);
    drawScenery2D(ctx, medievalCityPreview(), 6, new Map());
  }, []);
  return (
    <figure className="vtt-city-preview">
      <canvas
        ref={ref}
        width={768}
        height={672}
        aria-label="Prévia de Valedouro, cidade medieval com praça, ruas, moradias e plantações"
      />
      <figcaption>
        192 × 168 m · praça e mercado · quatro portões · rio e ponte · bairros e lavouras
      </figcaption>
      <small>
        O mestre pode selecionar, reposicionar, redimensionar ou remover cada elemento depois de
        criar a cidade.
      </small>
    </figure>
  );
}
