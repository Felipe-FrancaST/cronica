'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Swords } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Loading, Badge } from '@/components/ui';
import { useWorkspace } from '@/hooks/use-workspace';
export default function Page() {
  const w = useWorkspace(),
    router = useRouter();
  useEffect(() => {
    if (w.ready && !w.user) router.replace('/entrar');
  }, [w.ready, w.user, router]);
  if (!w.user) return <Loading />;
  return (
    <main className="mode-page">
      <Brand />
      <div className="mode-heading">
        <div className="eyebrow" style={{ justifyContent: 'center' }}>
          BEM-VINDO, {w.user.name.split(' ')[0].toUpperCase()}
        </div>
        <h1>Como deseja entrar?</h1>
        <p>
          A mesma conta, dois caminhos para a sua aventura.
          <br />
          Você pode trocar de modo quando quiser.
        </p>
      </div>
      <div className="mode-cards">
        <button
          className="mode-card"
          onClick={() => {
            w.chooseMode('master');
            router.push('/');
          }}
        >
          <Shield size={57} strokeWidth={1} />
          <h2>Mestre</h2>
          <p>
            Crie e conduza suas próprias aventuras.
            <br />
            Construa o mundo que seus jogadores vão descobrir.
          </p>
          <span>Entrar como Mestre</span>
        </button>
        <button
          className="mode-card"
          onClick={() => {
            w.chooseMode('player');
            router.push('/');
          }}
        >
          <Swords size={57} strokeWidth={1} />
          <h2>Jogador</h2>
          <p>
            Entre em suas campanhas e viva suas aventuras.
            <br />
            Dê vida ao personagem da sua próxima história.
          </p>
          <span>Entrar como Jogador</span>
        </button>
      </div>
      {w.demo && (
        <p className="auth-caption" style={{ marginTop: 30 }}>
          Demonstração · a mesma conta tem campanhas como mestre e como jogador.
        </p>
      )}
    </main>
  );
}
