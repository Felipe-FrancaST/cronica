'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Users,
  ScrollText,
  Compass,
  Plus,
  UserPlus,
  Trash2,
  LoaderCircle,
  CalendarDays,
  Package,
  MapPin,
} from 'lucide-react';
import type { Campaign, Member } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { Shell, PageHeading } from './shell';
import { Button, Badge, Empty, ErrorBox, Input, Field, Confirm, Loading } from './ui';
import { Avatar, Cover } from './media';
import { CampaignForm } from './campaign-form';
import { errorMessage, dateLabel } from '@/lib/utils';
const CharacterCollection = dynamic(
  () => import('./characters').then((m) => m.CharacterCollection),
  {
    loading: () => <Loading />,
  },
);
const WorldCollection = dynamic(() => import('./world').then((m) => m.WorldCollection), {
  loading: () => <Loading />,
});
const NpcCollection = dynamic(() => import('./npcs').then((m) => m.NpcCollection), {
  loading: () => <Loading />,
});
const MesaPage = dynamic(() => import('@/features/mesa/mesa-page').then((m) => m.MesaPage), {
  loading: () => <Loading />,
});
const SessionsPage = dynamic(
  () => import('@/features/sessions/sessions-page').then((m) => m.SessionsPage),
  {
    loading: () => <Loading />,
  },
);
const RulesPage = dynamic(() => import('@/features/sessions/rules-page').then((m) => m.RulesPage), {
  loading: () => <Loading />,
});
export function CampaignPage({ id, section }: { id: string; section: string }) {
  const w = useWorkspace();
  const campaign = w.data.campaigns.find((c) => c.id === id);
  if (w.loading)
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  if (!campaign)
    return (
      <Shell>
        <Empty
          title="Não foi possível carregar esta aventura."
          description="A campanha não existe ou você não tem acesso a ela."
          action={
            <Link className="button button-secondary" href="/campanhas">
              Voltar às campanhas
            </Link>
          }
        />
      </Shell>
    );
  const owner = campaign.owner_id === w.user?.id;
  return (
    <Shell campaign={campaign}>
      {section === '' ? (
        <Overview campaign={campaign} />
      ) : section === 'jogadores' ? (
        <Players campaign={campaign} />
      ) : section === 'personagens' ? (
        <CharacterCollection campaign={campaign} />
      ) : section === 'mundo' ? (
        <WorldCollection campaign={campaign} />
      ) : section === 'locais' ? (
        <WorldCollection campaign={campaign} locationsOnly />
      ) : section === 'npcs' ? (
        <NpcCollection campaign={campaign} />
      ) : section === 'sessoes' ? (
        <SessionsPage campaign={campaign} />
      ) : section === 'regras' ? (
        <RulesPage campaign={campaign} />
      ) : ['mesa', 'mesa/grid', 'mesa/mural'].includes(section) ? (
        <MesaPage campaign={campaign} view={section === 'mesa/mural' ? 'mural' : 'grid'} />
      ) : section === 'configuracoes' && owner ? (
        <CampaignSettings campaign={campaign} />
      ) : section === 'itens' ? (
        <FutureArea campaign={campaign} section={section} />
      ) : (
        <Empty
          title="Este caminho não está no mapa."
          action={
            <Link className="button button-secondary" href={`/campanhas/${id}`}>
              Voltar à campanha
            </Link>
          }
        />
      )}
    </Shell>
  );
}
function Overview({ campaign: c }: { campaign: Campaign }) {
  const w = useWorkspace();
  const members = w.data.members.filter((m) => m.campaign_id === c.id),
    chars = w.data.characters.filter((x) => x.campaign_id === c.id),
    world = w.data.world.filter((x) => x.campaign_id === c.id),
    npcs = w.data.npcs.filter((x) => x.campaign_id === c.id);
  const owner = c.owner_id === w.user?.id;
  return (
    <>
      <PageHeading
        eyebrow="O CAPÍTULO EM QUE ESTAMOS"
        title={c.name}
        description={`${c.theme} · D&D 5e · Criada em ${dateLabel(c.created_at)}`}
        action={
          <Badge tone={c.status === 'active' ? 'green' : 'muted'}>
            {c.status === 'active' ? 'Campanha ativa' : 'Campanha arquivada'}
          </Badge>
        }
      />
      <section className="journey-banner">
        <Cover path={c.cover_path || '/images/fortress.webp'} name={c.name} eager />
        <div className="journey-overlay" />
        <div className="journey-content">
          <span className="eyebrow">{owner ? 'O MUNDO QUE VOCÊ CRIOU' : 'A SUA AVENTURA'}</span>
          <h2>Uma história compartilhada.</h2>
          <p>{c.description || 'Um novo mundo começa a ganhar vida.'}</p>
          <Link
            href={`/campanhas/${c.id}/${owner ? 'jogadores' : 'personagens'}`}
            className="button button-secondary"
          >
            {owner ? 'Reunir aventureiros' : 'Abrir meus personagens'}
          </Link>
        </div>
      </section>
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-icon">
            <Users size={22} />
          </span>
          <div>
            <strong>{members.length}</strong>
            <span>Jogadores na mesa</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue">
            <ScrollText size={22} />
          </span>
          <div>
            <strong>{chars.length}</strong>
            <span>{owner ? 'Personagens' : 'Meus personagens'}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-red">
            <Compass size={22} />
          </span>
          <div>
            <strong>{world.length}</strong>
            <span>Lugares para descobrir</span>
          </div>
        </div>
      </div>
      <div className="section-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Os aventureiros</h2>
            <Link className="card-enter" href={`/campanhas/${c.id}/jogadores`}>
              Ver jogadores
            </Link>
          </div>
          {members.length ? (
            <div className="record-list">
              {members.map((m) => {
                const p = w.data.profiles.find((p) => p.id === m.user_id),
                  char = chars.find((x) => x.owner_id === m.user_id);
                return (
                  <div key={m.id} className="record-row">
                    <div className="record-main">
                      <Avatar name={p?.name || 'Aventureiro'} path={p?.avatar_path} />
                      <div>
                        <strong>{p?.name || 'Aventureiro'}</strong>
                        <small>{char?.name || 'Aventureiro da campanha'}</small>
                      </div>
                    </div>
                    <Badge tone="green">Na mesa</Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Os aventureiros estão a caminho."
              description={owner ? 'Adicione os jogadores pelo email de suas contas.' : undefined}
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>O mundo da campanha</h2>
            <Link className="card-enter" href={`/campanhas/${c.id}/mundo`}>
              Explorar
            </Link>
          </div>
          {world.length ? (
            <div className="record-list">
              {world.slice(0, 3).map((e) => (
                <Link key={e.id} href={`/campanhas/${c.id}/mundo`} className="record-row">
                  <div className="record-main">
                    <MapPin size={19} color="var(--gold)" />
                    <div>
                      <strong>{e.name}</strong>
                      <small>
                        {{ region: 'Região', city: 'Cidade', location: 'Local' }[e.kind]}
                      </small>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p>
              {owner
                ? 'Dê vida à primeira região do seu mundo.'
                : 'Aguarde os lugares que o mestre vai revelar.'}
            </p>
          )}
          <div className="form-divider">
            <div className="panel-heading">
              <h3>Habitantes da história</h3>
              <Badge tone="muted">{npcs.length} NPCs</Badge>
            </div>
            <Link className="button button-ghost" href={`/campanhas/${c.id}/npcs`}>
              Conhecer NPCs
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
function Players({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace();
  const [email, setEmail] = useState(''),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Member | null>(null);
  const owner = campaign.owner_id === w.user?.id;
  const members = w.data.members.filter((m) => m.campaign_id === campaign.id);
  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await w.perform((r) => r.addMember(campaign.id, email), 'Jogador adicionado à campanha.');
      setEmail('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await w.perform((r) => r.removeMember(pending.id), 'Jogador removido da campanha.');
      setPending(null);
    } catch (e) {
      setError(errorMessage(e));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={campaign.name}
        title="Jogadores"
        description="Toda grande história é construída em boa companhia."
      />
      <ErrorBox message={error} />
      {owner && (
        <section className="panel section-space">
          <div className="panel-heading">
            <h2>
              <UserPlus size={19} style={{ display: 'inline', marginRight: 9 }} />
              Reúna seus aventureiros
            </h2>
          </div>
          <form onSubmit={add} className="inline-form">
            <Field
              label="Email do jogador"
              hint="O jogador deve ter uma conta cadastrada na Crônica."
            >
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite o email do jogador"
              />
            </Field>
            <Button disabled={busy}>
              {busy ? <LoaderCircle size={18} className="spin" /> : <Plus size={18} />}Adicionar
              jogador
            </Button>
          </form>
          {w.demo && (
            <p style={{ marginTop: 15, fontSize: '.75rem' }}>
              Exemplos: marina@cronica.demo, lucas@cronica.demo e sofia@cronica.demo.
            </p>
          )}
        </section>
      )}
      {members.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Aventureiro</th>
                <th>Personagem</th>
                <th>Status</th>
                <th>Entrou em</th>
                {owner && (
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const p = w.data.profiles.find((p) => p.id === m.user_id),
                  chars = w.data.characters.filter(
                    (c) => c.campaign_id === campaign.id && c.owner_id === m.user_id,
                  );
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="record-main">
                        <Avatar name={p?.name || 'Jogador'} path={p?.avatar_path} />
                        <div>
                          <strong>{p?.name || 'Aventureiro'}</strong>
                          <small>{p?.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {chars.length ? (
                        <Link className="card-enter" href={`/campanhas/${campaign.id}/personagens`}>
                          {chars.map((c) => c.name).join(', ')}
                        </Link>
                      ) : (
                        <small>
                          {owner || m.user_id === w.user?.id
                            ? 'Ainda sem personagem'
                            : 'Aventureiro da campanha'}
                        </small>
                      )}
                    </td>
                    <td>
                      <Badge tone="green">Ativo</Badge>
                    </td>
                    <td>
                      <small>{dateLabel(m.created_at)}</small>
                    </td>
                    {owner && (
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Remover ${p?.name || 'jogador'}`}
                          onClick={() => setPending(m)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Sua mesa ainda está esperando os aventureiros."
          description="Adicione um jogador pelo email para começar."
        />
      )}
      <Confirm
        open={Boolean(pending)}
        onCancel={() => setPending(null)}
        onConfirm={() => void remove()}
        title="Remover jogador da campanha?"
        description="O jogador perderá acesso à campanha. Suas fichas serão mantidas para o mestre e voltarão a ficar acessíveis se ele for adicionado novamente."
        busy={busy}
      />
    </>
  );
}
function CampaignSettings({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace(),
    router = useRouter();
  const [pending, setPending] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function remove() {
    setBusy(true);
    try {
      await w.perform((r) => r.deleteCampaign(campaign.id), 'Campanha excluída.');
      router.push('/campanhas');
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={campaign.name}
        title="Configurações da campanha"
        description="Cuide dos detalhes do seu mundo."
      />
      <div className="profile-layout">
        <ErrorBox message={error} />
        <section className="panel">
          <CampaignForm
            campaign={campaign}
            onSaved={() => {}}
            onCancel={() => router.push(`/campanhas/${campaign.id}`)}
          />
        </section>
        <section className="panel danger-zone">
          <h3>Encerrar esta história</h3>
          <p>
            Você pode arquivar a campanha para preservar seus registros. A exclusão remove
            permanentemente jogadores, fichas, NPCs e todos os lugares desta campanha.
          </p>
          <Button variant="danger" onClick={() => setPending(true)}>
            <Trash2 size={17} />
            Excluir campanha
          </Button>
        </section>
        <Confirm
          open={pending}
          onCancel={() => setPending(false)}
          onConfirm={() => void remove()}
          title={`Excluir ${campaign.name}?`}
          description="Todos os registros da campanha serão removidos. Esta ação não pode ser desfeita."
          busy={busy}
        />
      </div>
    </>
  );
}
function FutureArea({ campaign, section }: { campaign: Campaign; section: string }) {
  const sessions = section === 'sessoes';
  return (
    <>
      <PageHeading eyebrow={campaign.name} title={sessions ? 'Sessões' : 'Itens da campanha'} />
      <section className="panel future-panel">
        {sessions ? (
          <CalendarDays size={45} strokeWidth={1} />
        ) : (
          <Package size={45} strokeWidth={1} />
        )}
        <Badge tone="muted">EM PREPARAÇÃO</Badge>
        <h2>Um próximo capítulo.</h2>
        <p>
          {sessions
            ? 'O registro de sessões e o diário da campanha serão adicionados em uma próxima versão.'
            : 'O acervo de itens e o inventário avançado da campanha serão adicionados em uma próxima versão. O inventário individual já está disponível nas fichas.'}
        </p>
        <Link
          className="button button-secondary"
          href={`/campanhas/${campaign.id}/${sessions ? '' : 'personagens'}`}
        >
          {sessions ? 'Voltar à campanha' : 'Abrir personagens'}
        </Link>
      </section>
    </>
  );
}
