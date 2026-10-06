'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Grid3X3, PanelsTopLeft } from 'lucide-react';
import type { Campaign } from '@/types';
import { PageHeading } from '@/components/shell';
import { Loading } from '@/components/ui';
import { Select, Field, Empty, ErrorBox, Badge } from '@/components/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWorkspace } from '@/hooks/use-workspace';
import { useCampaignSessions } from '@/features/sessions/use-sessions';
import { defaultSession, SESSION_STATUS } from '@/features/sessions/types';
import { SessionReuse } from '@/features/sessions/sessions-page';
const Grid = dynamic(() => import('@/features/vtt/tactical-table').then((m) => m.TacticalTable), {
  loading: () => <Loading />,
});
const Mural = dynamic(() => import('@/features/mural/mural').then((m) => m.Mural), {
  loading: () => <Loading />,
});
export function MesaPage({ campaign, view }: { campaign: Campaign; view: 'grid' | 'mural' }) {
  const w = useWorkspace(),
    master = campaign.owner_id === w.user?.id,
    router = useRouter(),
    params = useSearchParams();
  const list = useCampaignSessions(campaign.id, master),
    requested = params.get('sessao');
  const selected = requested
    ? list.items.find((s) => s.id === requested)
    : defaultSession(list.items, master);
  const suffix = selected ? `?sessao=${selected.id}` : '';
  return (
    <>
      <PageHeading
        eyebrow={campaign.name}
        title="Mesa"
        description="O campo de batalha e as histórias que seus aventureiros vão descobrir."
      />
      <nav className="mesa-sections" aria-label="Áreas da Mesa">
        <Link
          href={`/campanhas/${campaign.id}/mesa/grid${suffix}`}
          aria-current={view === 'grid' ? 'page' : undefined}
          className={view === 'grid' ? 'selected' : ''}
        >
          <Grid3X3 size={20} />
          <span>
            <strong>Grid</strong>
            <small>Combate e cenário</small>
          </span>
        </Link>
        <Link
          href={`/campanhas/${campaign.id}/mesa/mural${suffix}`}
          aria-current={view === 'mural' ? 'page' : undefined}
          className={view === 'mural' ? 'selected' : ''}
        >
          <PanelsTopLeft size={20} />
          <span>
            <strong>Mural</strong>
            <small>Lugares, imagens e personagens</small>
          </span>
        </Link>
      </nav>
      <ErrorBox message={list.error} />
      {list.loading ? (
        <Loading />
      ) : selected ? (
        <>
          <div className={`mesa-session-bar ${selected.status === 'ended' ? 'archived' : ''}`}>
            <Field label="Sessão da Mesa">
              <Select
                aria-label="Sessão da Mesa"
                value={selected.id}
                onChange={(e) =>
                  router.push(`/campanhas/${campaign.id}/mesa/${view}?sessao=${e.target.value}`)
                }
              >
                {list.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    Sessão {s.number} — {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <Badge tone={selected.status === 'active' ? 'green' : 'muted'}>
                {SESSION_STATUS[selected.status]}
              </Badge>
              <small>
                {selected.status === 'ended'
                  ? 'Arquivo para consulta. O cenário original permanece salvo.'
                  : selected.status === 'planned'
                    ? 'Prepare o cenário e inicie a sessão na aba Sessões.'
                    : 'Os acontecimentos desta Mesa são registrados nesta sessão.'}
              </small>
            </div>
            <Link className="button button-ghost" href={`/campanhas/${campaign.id}/sessoes`}>
              Ver sessões
            </Link>
          </div>
          {view === 'grid' ? (
            <Grid
              key={`${campaign.id}:${selected.id}`}
              campaign={campaign}
              adventure={selected}
              adventures={list.items}
            />
          ) : (
            <Mural key={`${campaign.id}:${selected.id}`} campaign={campaign} adventure={selected} />
          )}
          {master && selected.status === 'ended' && view === 'mural' && (
            <div className="session-actions">
              <SessionReuse source={selected} sessions={list.items} />
            </div>
          )}
        </>
      ) : !list.error ? (
        <Empty
          title={
            requested
              ? 'Sessão não disponível.'
              : master
                ? 'Crie uma sessão para preparar a Mesa.'
                : 'O mestre ainda não iniciou uma sessão.'
          }
          description={
            requested
              ? 'Ela não existe ou você não tem acesso a este capítulo.'
              : 'Cada Grid e Mural fica vinculado a uma sessão da aventura.'
          }
          action={
            <Link className="button button-secondary" href={`/campanhas/${campaign.id}/sessoes`}>
              Abrir Sessões
            </Link>
          }
        />
      ) : null}
    </>
  );
}
