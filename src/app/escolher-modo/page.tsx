'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Swords } from 'lucide-react';
import { Brand } from '@/components/brand';
import { useBilling } from '@/features/billing/provider';
import { billingDate, money, intervalLabel } from '@/features/billing/model';
import { Loading, ErrorBox, Button } from '@/components/ui';
import { useWorkspace } from '@/hooks/use-workspace';
export default function Page() {
  const w = useWorkspace(),
    router = useRouter();
  const billing = useBilling();
  useEffect(() => {
    if (w.ready && !w.user) router.replace('/entrar');
  }, [w.ready, w.user, router]);
  if (!w.user || billing.loading) return <Loading />;
  if (!billing.data)
    return (
      <main className="mode-page">
        <ErrorBox message={billing.error} />
        <Button onClick={() => void billing.refresh()}>Verificar acesso novamente</Button>
      </main>
    );
  if (billing.data.is_admin)
    return (
      <main className="mode-page">
        <Brand />
        <div className="mode-heading">
          <h1>Administração do site</h1>
          <p>Gerencie os planos, assinantes e a operação da Crônica.</p>
        </div>
        <button className="mode-card" onClick={() => router.push('/administracao')}>
          <Shield size={57} strokeWidth={1} />
          <h2>Administrador</h2>
          <p>Controle financeiro e configurações do site.</p>
          <span>Abrir administração</span>
        </button>
        <Button variant="ghost" onClick={() => void w.logout().then(() => router.push('/entrar'))}>
          Sair
        </Button>
      </main>
    );
  const price = (scope: 'master' | 'player') => {
    const access = billing.data!.access[scope];
    if (access.reason === 'free') return 'Acesso gratuito';
    if (access.allowed) return `Acesso liberado até ${billingDate(access.paid_until)}`;
    const plans = billing.data!.plans.filter((p) => p.scopes.includes(scope));
    const plan = plans.sort(
      (a, b) => a.amount_cents / a.interval_months - b.amount_cents / b.interval_months,
    )[0];
    return plan
      ? `${money(plan.amount_cents)} / ${intervalLabel(plan.interval_months)} · assinatura recorrente`
      : 'Consulte os planos disponíveis';
  };
  const enter = (scope: 'master' | 'player') => {
    w.chooseMode(scope);
    router.push(billing.data!.access[scope].allowed ? '/' : `/assinatura?modo=${scope}`);
  };
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
            enter('master');
          }}
        >
          <Shield size={57} strokeWidth={1} />
          <h2>Mestre</h2>
          <p>
            Crie e conduza suas próprias aventuras.
            <br />
            Construa o mundo que seus jogadores vão descobrir.
          </p>
          <small className="mode-price">{price('master')}</small>
          <span>Entrar como Mestre</span>
        </button>
        <button
          className="mode-card"
          onClick={() => {
            enter('player');
          }}
        >
          <Swords size={57} strokeWidth={1} />
          <h2>Jogador</h2>
          <p>
            Entre em suas campanhas e viva suas aventuras.
            <br />
            Dê vida ao personagem da sua próxima história.
          </p>
          <small className="mode-price">{price('player')}</small>
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
