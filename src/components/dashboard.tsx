'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, Users, ScrollText, BookOpen, Flame, Shield } from 'lucide-react';
import { Shell, PageHeading } from './shell';
import { Button, Badge, Empty, Modal, Input } from './ui';
import { Cover, Avatar } from './media';
import { CampaignForm } from './campaign-form';
import { useWorkspace } from '@/hooks/use-workspace';
import { cx, dateLabel } from '@/lib/utils';
import type { Campaign } from '@/types';
export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace();
  const members = w.data.members.filter((m) => m.campaign_id === campaign.id);
  const characters = w.data.characters.filter((c) => c.campaign_id === campaign.id);
  const system = w.data.systems.find((s) => s.id === campaign.rpg_system_id);
  const owner = w.data.profiles.find((p) => p.id === campaign.owner_id);
  return (
    <article className="campaign-card">
      <Link
        href={`/campanhas/${campaign.id}`}
        className="card-image-link"
        aria-label={`Entrar na campanha ${campaign.name}`}
      >
        <Cover
          path={campaign.cover_path}
          name={campaign.name}
          className={campaign.theme.includes('arcano') ? 'cover-blue' : ''}
        />
        <div className="cover-shade" />
        <Badge tone={campaign.status === 'active' ? 'green' : 'muted'}>
          {campaign.status === 'active' ? 'Ativa' : 'Arquivada'}
        </Badge>
        <span className="cover-system">{system?.name || 'D&D 5e'}</span>
      </Link>
      <div className="campaign-card-body">
        <div className="card-theme">{campaign.theme || 'Uma nova aventura'}</div>
        <h3>
          <Link href={`/campanhas/${campaign.id}`}>{campaign.name}</Link>
        </h3>
        {!w.user?.preferences.compact_cards && (
          <p className="card-description">
            {campaign.description || 'O primeiro capítulo desta história está prestes a começar.'}
          </p>
        )}
        <div className="card-counts">
          <span>
            <Users size={15} />
            {members.length} jogadores
          </span>
          <span>
            <ScrollText size={15} />
            {characters.length} {w.mode === 'player' ? 'seu personagem' : 'personagens'}
          </span>
        </div>
        {w.mode === 'player' && (
          <p className="card-master">Mestre: {owner?.name || 'Mestre da campanha'}</p>
        )}
        <div className="card-bottom">
          <div className="avatar-group">
            {members.slice(0, 3).map((m) => {
              const p = w.data.profiles.find((p) => p.id === m.user_id);
              return (
                <Avatar key={m.id} name={p?.name || 'Jogador'} path={p?.avatar_path} size="small" />
              );
            })}
            {members.length > 3 && (
              <span className="avatar avatar-small">+{members.length - 3}</span>
            )}
            {members.length === 0 && (
              <span className="card-date">{dateLabel(campaign.created_at)}</span>
            )}
          </div>
          <Link className="card-enter" href={`/campanhas/${campaign.id}`}>
            Entrar na campanha
          </Link>
        </div>
      </div>
    </article>
  );
}
export function Dashboard() {
  const w = useWorkspace(),
    router = useRouter(),
    params = useSearchParams();
  const [creating, setCreating] = useState(false),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all');
  useEffect(() => {
    if (params.get('criar') === '1' && w.mode === 'master') setCreating(true);
  }, [params, w.mode]);
  const campaigns = w.data.campaigns.filter((c) =>
    w.mode === 'master'
      ? c.owner_id === w.user?.id
      : w.data.members.some((m) => m.campaign_id === c.id && m.user_id === w.user?.id),
  );
  const visible = campaigns.filter(
    (c) =>
      (filter === 'all' || c.status === filter) &&
      `${c.name} ${c.description} ${c.theme}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR')),
  );
  const active = campaigns.filter((c) => c.status === 'active'),
    featured = active[0];
  const campaignIds = new Set(campaigns.map((c) => c.id)),
    playerIds = new Set(
      w.data.members.filter((m) => campaignIds.has(m.campaign_id)).map((m) => m.user_id),
    );
  const characters = w.data.characters.filter((c) => campaignIds.has(c.campaign_id));
  function close() {
    setCreating(false);
    if (params.get('criar')) router.replace('/campanhas');
  }
  return (
    <Shell>
      <PageHeading
        eyebrow={w.mode === 'master' ? 'O LIVRO DAS SUAS HISTÓRIAS' : 'O SEU PRÓXIMO CAPÍTULO'}
        title={w.mode === 'master' ? 'Minhas campanhas' : 'Minhas aventuras'}
        description={
          w.mode === 'master'
            ? 'Construa mundos. Reúna aventureiros. Crie histórias memoráveis.'
            : 'As histórias das quais você faz parte.'
        }
        action={
          w.mode === 'master' ? (
            <Button onClick={() => setCreating(true)}>
              <Plus size={18} />
              Nova campanha
            </Button>
          ) : (
            <Link className="button button-gold" href="/personagens?criar=1">
              <Plus size={18} />
              Criar personagem
            </Link>
          )
        }
      />
      {featured && (
        <section className="journey-banner" aria-label="Continuar campanha">
          <Cover path={featured.cover_path || '/images/fortress.webp'} name={featured.name} eager />
          <div className="journey-overlay" />
          <div className="journey-content">
            <span className="eyebrow">
              <Flame size={14} />
              CONTINUE SUA JORNADA
            </span>
            <h2>{featured.name}</h2>
            <p>{featured.description}</p>
            <Link href={`/campanhas/${featured.id}`} className="button button-secondary">
              Abrir campanha
            </Link>
          </div>
          <span className="journey-stamp">
            <Shield size={16} />
            D&D 5e
          </span>
        </section>
      )}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-icon">
            <BookOpen size={22} strokeWidth={1.5} />
          </span>
          <div>
            <strong>{active.length.toString().padStart(2, '0')}</strong>
            <span>Campanhas ativas</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue">
            <Users size={22} strokeWidth={1.5} />
          </span>
          <div>
            <strong>{playerIds.size.toString().padStart(2, '0')}</strong>
            <span>{w.mode === 'master' ? 'Aventureiros reunidos' : 'Companheiros de jornada'}</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-red">
            <ScrollText size={22} strokeWidth={1.5} />
          </span>
          <div>
            <strong>{characters.length.toString().padStart(2, '0')}</strong>
            <span>{w.mode === 'master' ? 'Personagens na história' : 'Meus personagens'}</span>
          </div>
        </div>
      </div>
      <div className="collection-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filtrar campanhas">
          {[
            { id: 'all', label: 'Todas', count: campaigns.length },
            { id: 'active', label: 'Ativas', count: active.length },
            { id: 'archived', label: 'Arquivadas', count: campaigns.length - active.length },
          ].map((f) => (
            <button
              key={f.id}
              className={cx('filter-tab', filter === f.id && 'selected')}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span>{f.count}</span>
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <Input
            aria-label="Buscar campanhas"
            placeholder="Buscar uma campanha..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {visible.length ? (
        <div className="campaign-grid">
          {visible.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
          {w.mode === 'master' && filter === 'all' && !query && (
            <button className="new-campaign-card" onClick={() => setCreating(true)}>
              <span className="new-campaign-symbol">
                <Plus size={27} strokeWidth={1} />
              </span>
              <h3>Um novo capítulo</h3>
              <p>
                Todo grande mundo começa
                <br />
                com uma ideia.
              </p>
              <span>Criar nova campanha</span>
            </button>
          )}
        </div>
      ) : (
        <Empty
          title={
            query
              ? 'Nenhuma campanha encontrada.'
              : w.mode === 'player'
                ? 'Sua próxima aventura está chegando.'
                : undefined
          }
          description={
            query
              ? 'Tente outro nome ou remova os filtros.'
              : w.mode === 'player'
                ? 'Peça ao mestre para adicionar o email da sua conta à campanha.'
                : 'Dê vida à sua primeira história e convide seus aventureiros.'
          }
          action={
            w.mode === 'master' && !query ? (
              <Button onClick={() => setCreating(true)}>
                <Plus size={18} />
                Criar sua primeira campanha
              </Button>
            ) : undefined
          }
        />
      )}
      <div className="collection-end">
        <span>◇</span>
        <p>As melhores histórias são aquelas que criamos juntos.</p>
        <span>◇</span>
      </div>
      <Modal
        open={creating}
        onClose={close}
        title="Um novo capítulo"
        description="Dê um nome ao mundo que seus aventureiros vão descobrir."
      >
        {creating && (
          <CampaignForm onSaved={(c) => router.push(`/campanhas/${c.id}`)} onCancel={close} />
        )}
      </Modal>
    </Shell>
  );
}
