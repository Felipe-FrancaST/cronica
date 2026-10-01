'use client';
import { Button } from '@/components/ui';
export default function Error({ reset }: { reset(): void }) {
  return (
    <main className="error-page">
      <h1>Não foi possível carregar esta aventura.</h1>
      <p>Seu próximo capítulo ainda está à sua espera.</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </main>
  );
}
