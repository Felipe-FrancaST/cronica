import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="error-page">
      <h1>Este caminho não está no mapa.</h1>
      <p>A página que você procura não foi encontrada.</p>
      <Link className="button button-gold" href="/">
        Voltar às campanhas
      </Link>
    </main>
  );
}
