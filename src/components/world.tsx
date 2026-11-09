'use client';
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Trash2,
  Eye,
  EyeOff,
  MapPin,
  LoaderCircle,
  Save,
  LockKeyhole,
  Globe2,
  Castle,
  Compass,
  BookOpen,
  ChevronDown,
  Pencil,
  PanelsTopLeft,
  ArrowRight,
  Image as ImageIcon,
  Layers3,
} from 'lucide-react';
import type { Campaign, WorldEntry, WorldKind } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { useCampaignSessions } from '@/features/sessions/use-sessions';
import { publishWorldToMural } from '@/features/mural/world-publication';
import {
  WORLD_LABELS,
  worldBreadcrumb,
  worldEntryMatches,
  worldHierarchy,
} from '@/lib/world-hierarchy';
import { PageHeading } from './shell';
import {
  Button,
  Modal,
  Confirm,
  Empty,
  ErrorBox,
  Field,
  Select,
  Input,
  Textarea,
  Badge,
  Loading,
} from './ui';
import { Cover, ImageField } from './media';
import { uid, now, errorMessage, cx } from '@/lib/utils';
import { uploadImage } from '@/services/storage';
import { useEditorDraft } from '@/hooks/use-editor-draft';
import { DraftRecovery } from './draft-recovery';

const TABLES = {
  region: 'world_regions',
  city: 'world_cities',
  location: 'world_locations',
} as const;
const KINDS = { region: Globe2, city: Castle, location: MapPin };
const FILTERS: { key: WorldKind | 'all'; title: string }[] = [
  { key: 'all', title: 'Visão geral' },
  { key: 'region', title: 'Regiões' },
  { key: 'city', title: 'Cidades' },
  { key: 'location', title: 'Locais' },
];

function blankWorld(campaignId: string, kind: WorldKind, regionId?: string | null): WorldEntry {
  return {
    id: uid(),
    campaign_id: campaignId,
    kind,
    name: '',
    description: '',
    image_path: null,
    type: '',
    location: '',
    notes: '',
    region_id: kind === 'region' ? null : (regionId ?? null),
    population: null,
    government: '',
    visible_to_players: false,
    secrets: '',
    private_notes: '',
    created_at: now(),
    updated_at: now(),
  };
}

export function WorldCollection({ campaign }: { campaign?: Campaign }) {
  const w = useWorkspace();
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const owned = w.data.campaigns.filter((c) => c.owner_id === w.user?.id);
  const active =
    campaign ?? w.data.campaigns.find((c) => c.id === (selectedCampaign || owned[0]?.id));
  const canManage = !!active && active.owner_id === w.user?.id;
  const records = w.data.world.filter((entry) => entry.campaign_id === active?.id);
  const [filter, setFilter] = useState<WorldKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [editing, setEditing] = useState<WorldEntry | null>(null);
  const [detail, setDetail] = useState<WorldEntry | null>(null);
  const [publishing, setPublishing] = useState<WorldEntry | null>(null);
  const [pending, setPending] = useState<WorldEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hierarchy = worldHierarchy(records, query);
  const matches = records
    .filter(
      (entry) => (filter === 'all' || entry.kind === filter) && worldEntryMatches(entry, query),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  const counts = {
    region: records.filter((entry) => entry.kind === 'region').length,
    city: records.filter((entry) => entry.kind === 'city').length,
    location: records.filter((entry) => entry.kind === 'location').length,
  };
  const regionName = (entry: WorldEntry) => worldBreadcrumb(entry, records);
  const create = (kind: WorldKind, regionId?: string) => {
    if (!active || !canManage) return;
    setError(null);
    setEditing(blankWorld(active.id, kind, regionId));
  };
  const edit = (entry: WorldEntry) => {
    setDetail(null);
    setEditing(entry);
  };
  async function remove() {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      await w.perform(
        (repo) => repo.deleteWorld(pending),
        `${WORLD_LABELS[pending.kind]} excluído(a).`,
      );
      setDetail(null);
      setPending(null);
    } catch (reason) {
      setError(errorMessage(reason));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }
  const actions = (entry: WorldEntry, compact = false) => (
    <div className="world-entry-actions">
      <Button variant="secondary" onClick={() => setDetail(entry)}>
        {compact ? 'Abrir' : 'Explorar'}
      </Button>
      {canManage && (
        <>
          <button
            className="icon-button"
            aria-label={`Editar ${entry.name}`}
            onClick={() => edit(entry)}
            title="Editar"
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={`Enviar ${entry.name} ao mural`}
            onClick={() => setPublishing(entry)}
            title="Enviar ao mural"
          >
            <PanelsTopLeft size={16} />
          </button>
          <button
            className="icon-button world-action-delete"
            aria-label={`Excluir ${entry.name}`}
            onClick={() => setPending(entry)}
            title="Excluir"
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );
  const childRow = (entry: WorldEntry) => {
    const Icon = KINDS[entry.kind];
    return (
      <div className="world-child" key={entry.id}>
        <div className="world-child-icon">
          <Icon size={18} />
        </div>
        <div className="world-child-copy">
          <span className="world-child-kind">
            {WORLD_LABELS[entry.kind]}
            {entry.type ? ` · ${entry.type}` : ''}
          </span>
          <button type="button" onClick={() => setDetail(entry)}>
            {entry.name}
          </button>
          <small>{entry.description || entry.location || 'Ainda sem descrição'}</small>
        </div>
        {actions(entry, true)}
      </div>
    );
  };
  return (
    <>
      <PageHeading
        eyebrow={active?.name || 'CARTOGRAFIA DAS HISTÓRIAS'}
        title="Mundo da campanha"
        description="Organize regiões, cidades e pontos de interesse em um só lugar. Escolha o que revelar no Mural."
        action={
          active ? (
            <div className="world-heading-actions">
              <Link className="button button-secondary" href={`/campanhas/${active.id}/mesa/mural`}>
                <PanelsTopLeft size={17} /> Abrir mural
              </Link>
              {canManage && (
                <Button onClick={() => create('region')}>
                  <Plus size={17} /> Nova região
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <ErrorBox message={error} />
      {!campaign && owned.length > 1 && (
        <div className="world-campaign-picker">
          <Field label="Mundo de qual campanha?">
            <Select
              value={active?.id ?? ''}
              onChange={(e) => {
                setSelectedCampaign(e.target.value);
                setQuery('');
                setFilter('all');
              }}
            >
              {owned.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {active ? (
        <>
          <div className="world-hero">
            <div className="world-hero-intro">
              <span className="eyebrow">
                <Layers3 size={15} /> ATLAS DO MESTRE
              </span>
              <h3>Seu mundo, capítulo por capítulo.</h3>
              <p>
                Comece por uma região, crie as cidades e reúna seus lugares importantes. Nada é
                revelado aos jogadores sem sua escolha.
              </p>
            </div>
            <div className="world-stats" aria-label="Resumo do mundo">
              <div>
                <Globe2 size={19} />
                <strong>{counts.region}</strong>
                <span>Regiões</span>
              </div>
              <div>
                <Castle size={19} />
                <strong>{counts.city}</strong>
                <span>Cidades</span>
              </div>
              <div>
                <MapPin size={19} />
                <strong>{counts.location}</strong>
                <span>Locais</span>
              </div>
            </div>
          </div>
          {canManage && (
            <div className="world-quick-create" aria-label="Criar conteúdo no mundo">
              <button type="button" onClick={() => create('region')}>
                <Globe2 size={22} />
                <span>
                  <strong>Nova região</strong>
                  <small>Reinos, territórios e continentes</small>
                </span>
                <Plus size={17} />
              </button>
              <button type="button" onClick={() => create('city')}>
                <Castle size={22} />
                <span>
                  <strong>Nova cidade</strong>
                  <small>Vilas, capitais e povoações</small>
                </span>
                <Plus size={17} />
              </button>
              <button type="button" onClick={() => create('location')}>
                <MapPin size={22} />
                <span>
                  <strong>Novo local</strong>
                  <small>Tavernas, templos e pontos de interesse</small>
                </span>
                <Plus size={17} />
              </button>
            </div>
          )}
          <div className="world-toolbar">
            <div className="filter-tabs" role="group" aria-label="Visualizar conteúdo do mundo">
              {FILTERS.map(({ key, title }) => (
                <button
                  key={key}
                  type="button"
                  className={cx('filter-tab', key === filter && 'selected')}
                  aria-pressed={key === filter}
                  onClick={() => setFilter(key)}
                >
                  {title}
                </button>
              ))}
            </div>
            <label className="search-field">
              <Search size={17} />
              <Input
                aria-label="Buscar regiões, cidades e locais"
                placeholder="Buscar neste mundo…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          {filter === 'all' ? (
            hierarchy.regions.length || hierarchy.unassigned.length ? (
              <div className="world-tree" aria-label="Regiões e seus lugares">
                {hierarchy.regions.map(({ region, cities, locations }) => {
                  const expanded = !collapsed.includes(region.id);
                  const children = [...cities, ...locations];
                  return (
                    <section
                      className="world-region"
                      key={region.id}
                      aria-label={`Região ${region.name}`}
                    >
                      <div className="world-region-head">
                        {region.image_path ? (
                          <Cover
                            path={region.image_path}
                            name={region.name}
                            className="world-region-cover"
                          />
                        ) : (
                          <div className="world-region-cover world-region-empty">
                            <Compass size={36} />
                          </div>
                        )}
                        <div className="world-region-main">
                          <div className="world-region-meta">
                            <Badge tone="blue">Região</Badge>
                            <Visibility entry={region} />
                          </div>
                          <h3>{region.name}</h3>
                          <p>{region.description || 'Uma região à espera de histórias.'}</p>
                          <div className="world-region-count">
                            <Castle size={14} /> {cities.length} cidades <MapPin size={14} />{' '}
                            {locations.length} locais
                          </div>
                        </div>
                        <div className="world-region-controls">
                          {actions(region)}
                          <button
                            className="world-collapse"
                            type="button"
                            aria-label={`${expanded ? 'Recolher' : 'Expandir'} ${region.name}`}
                            aria-expanded={expanded}
                            onClick={() =>
                              setCollapsed((prev) =>
                                expanded
                                  ? [...prev, region.id]
                                  : prev.filter((id) => id !== region.id),
                              )
                            }
                          >
                            <ChevronDown
                              size={18}
                              className={expanded ? '' : 'world-chevron-closed'}
                            />
                          </button>
                        </div>
                      </div>
                      {expanded && (
                        <div className="world-region-body">
                          {children.length ? (
                            <div className="world-children">{children.map(childRow)}</div>
                          ) : (
                            <p className="world-no-children">
                              Ainda não há cidades ou locais nesta região.
                            </p>
                          )}
                          {canManage && (
                            <div className="world-region-add">
                              <Button variant="ghost" onClick={() => create('city', region.id)}>
                                <Plus size={15} /> Cidade nesta região
                              </Button>
                              <Button variant="ghost" onClick={() => create('location', region.id)}>
                                <Plus size={15} /> Local nesta região
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
                {hierarchy.unassigned.length > 0 && (
                  <section className="world-unassigned">
                    <div className="world-section-header">
                      <div>
                        <span className="eyebrow">A ORGANIZAR</span>
                        <h3>Sem região definida</h3>
                        <p>
                          Cidades e lugares independentes podem ser associados a uma região a
                          qualquer momento.
                        </p>
                      </div>
                    </div>
                    <div className="world-children">{hierarchy.unassigned.map(childRow)}</div>
                  </section>
                )}
              </div>
            ) : (
              <Empty
                title={
                  query ? 'Nenhum lugar corresponde à busca.' : 'O atlas ainda está em branco.'
                }
                description={
                  query
                    ? 'Experimente outro nome ou categoria.'
                    : 'Crie a primeira região. Depois, acrescente cidades e locais dentro dela.'
                }
                action={
                  canManage && !query ? (
                    <Button onClick={() => create('region')}>
                      <Plus size={17} /> Criar primeira região
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : matches.length ? (
            <div className="world-card-grid">
              {matches.map((entry) => {
                const Icon = KINDS[entry.kind];
                return (
                  <article className="world-entry-card" key={entry.id}>
                    {entry.image_path ? (
                      <Cover
                        path={entry.image_path}
                        name={entry.name}
                        className="world-entry-cover"
                      />
                    ) : (
                      <div className="world-entry-cover world-entry-empty">
                        <Icon size={36} />
                      </div>
                    )}
                    <div className="world-entry-body">
                      <div className="world-region-meta">
                        <Badge tone="blue">{WORLD_LABELS[entry.kind]}</Badge>
                        <Visibility entry={entry} />
                      </div>
                      <h3>{entry.name}</h3>
                      <small className="world-breadcrumb">{regionName(entry)}</small>
                      <p>{entry.description || entry.location || 'Sem descrição.'}</p>
                      {actions(entry)}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Nenhum registro encontrado."
              description="Altere os filtros ou crie um novo lugar."
            />
          )}
        </>
      ) : (
        <Empty
          title="Nenhum mundo disponível."
          description="Crie uma campanha como mestre para construir seu mundo."
          action={
            <Link className="button button-secondary" href="/campanhas">
              Ver campanhas <ArrowRight size={15} />
            </Link>
          }
        />
      )}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        wide
        title={`${w.data.world.some((entry) => entry.id === editing?.id) ? 'Editar' : 'Criar'} ${editing ? WORLD_LABELS[editing.kind].toLocaleLowerCase('pt-BR') : 'lugar'}`}
        description="Organize o lugar no atlas e defina o que poderá ser visto pelos jogadores."
      >
        {editing && (
          <WorldForm
            key={editing.id}
            entry={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name || 'Lugar'}
        wide
        description={detail ? worldBreadcrumb(detail, records) : undefined}
      >
        {detail && (
          <div className="world-detail">
            {detail.image_path && (
              <Cover path={detail.image_path} name={detail.name} className="world-detail-cover" />
            )}
            <div className="world-region-meta">
              <Badge tone="blue">{WORLD_LABELS[detail.kind]}</Badge>
              <Visibility entry={detail} />
            </div>
            <p className="world-detail-description">
              {detail.description || 'A história deste lugar ainda não foi escrita.'}
            </p>
            <div className="world-detail-facts">
              {detail.type && (
                <div>
                  <small>Categoria</small>
                  <strong>{detail.type}</strong>
                </div>
              )}
              {detail.location && (
                <div>
                  <small>Localização</small>
                  <strong>{detail.location}</strong>
                </div>
              )}
              {detail.kind === 'city' && (
                <>
                  {detail.population != null && (
                    <div>
                      <small>População</small>
                      <strong>{detail.population.toLocaleString('pt-BR')}</strong>
                    </div>
                  )}
                  {detail.government && (
                    <div>
                      <small>Governo</small>
                      <strong>{detail.government}</strong>
                    </div>
                  )}
                </>
              )}
            </div>
            {detail.notes && (
              <section className="world-detail-note">
                <h3>
                  <BookOpen size={17} /> História e pontos de interesse
                </h3>
                <p>{detail.notes}</p>
              </section>
            )}
            {canManage && (detail.secrets || detail.private_notes) && (
              <section className="world-detail-secrets">
                <h3>
                  <LockKeyhole size={17} /> Somente para o mestre
                </h3>
                <p>{[detail.secrets, detail.private_notes].filter(Boolean).join('\n\n')}</p>
              </section>
            )}
            {canManage && (
              <div className="world-detail-cta">
                <Button variant="secondary" onClick={() => edit(detail)}>
                  <Pencil size={16} /> Editar
                </Button>
                {detail.kind === 'region' && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const id = detail.id;
                      setDetail(null);
                      create('city', id);
                    }}
                  >
                    <Plus size={16} /> Adicionar cidade
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setPublishing(detail);
                    setDetail(null);
                  }}
                >
                  <PanelsTopLeft size={16} /> Enviar ao mural
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
      {publishing && (
        <WorldMuralDialog
          key={publishing.id}
          entry={publishing}
          onClose={() => setPublishing(null)}
        />
      )}
      <Confirm
        open={Boolean(pending)}
        onCancel={() => setPending(null)}
        onConfirm={() => void remove()}
        title={`Excluir ${pending?.name}?`}
        description={
          pending?.kind === 'region'
            ? 'A região será excluída. Suas cidades e locais continuarão existentes, mas ficarão sem região.'
            : 'Este registro será excluído do mundo. Cartões já publicados no mural são apresentações independentes.'
        }
        busy={busy}
      />
    </>
  );
}

function Visibility({ entry }: { entry: WorldEntry }) {
  return (
    <span className="world-visibility">
      {entry.visible_to_players ? (
        <>
          <Eye size={13} /> No mundo dos jogadores
        </>
      ) : (
        <>
          <EyeOff size={13} /> Privado
        </>
      )}
    </span>
  );
}

function WorldMuralDialog({ entry, onClose }: { entry: WorldEntry; onClose(): void }) {
  const w = useWorkspace();
  const sessions = useCampaignSessions(entry.campaign_id, true);
  const eligible = sessions.items.filter((session) => session.status !== 'ended');
  const [chapter, setChapter] = useState('');
  const [title, setTitle] = useState(entry.name);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedSession, setPublishedSession] = useState<string | null>(null);
  const selected =
    chapter || (eligible.find((session) => session.status === 'active') ?? eligible[0])?.id || '';
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !selected) return;
    setBusy(true);
    setError(null);
    try {
      await publishWorldToMural({ entry, sessionId: selected, title, visible, demo: w.demo });
      setPublishedSession(selected);
      w.notify('Lugar preparado no Mural.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
      title="Enviar lugar ao mural"
      description="Crie um cartão na sessão escolhida, sem compartilhar segredos ou anotações privadas."
    >
      {publishedSession ? (
        <div className="world-publish-success">
          <PanelsTopLeft size={34} />
          <h3>Cartão criado no Mural</h3>
          <p>
            {visible
              ? 'O cartão foi liberado para os jogadores nesta sessão.'
              : 'O cartão está em rascunho e só o mestre pode vê-lo.'}
          </p>
          <div className="form-actions">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Link
              className="button button-primary"
              href={`/campanhas/${entry.campaign_id}/mesa/mural?sessao=${publishedSession}`}
            >
              Abrir mural <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <ErrorBox message={error ?? sessions.error} />
          {sessions.loading ? (
            <Loading />
          ) : !eligible.length ? (
            <div className="world-publish-empty">
              <BookOpen size={26} />
              <p>Crie uma sessão em planejamento ou andamento para receber este cartão.</p>
              <Link
                className="button button-secondary"
                href={`/campanhas/${entry.campaign_id}/sessoes`}
              >
                Gerenciar sessões
              </Link>
            </div>
          ) : (
            <>
              <div className="world-publish-preview">
                {entry.image_path ? (
                  <Cover path={entry.image_path} name={entry.name} />
                ) : (
                  <div className="world-publish-placeholder">
                    <ImageIcon size={30} />
                  </div>
                )}
                <div>
                  <span className="eyebrow">{WORLD_LABELS[entry.kind]}</span>
                  <h3>{entry.name}</h3>
                  <p>{entry.description || 'Sem descrição pública.'}</p>
                </div>
              </div>
              <div className="form-grid">
                <Field label="Sessão de destino">
                  <Select value={selected} onChange={(e) => setChapter(e.target.value)}>
                    {eligible.map((session) => (
                      <option key={session.id} value={session.id}>
                        Sessão {session.number} — {session.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Título no Mural">
                  <Input
                    value={title}
                    maxLength={180}
                    required
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
              </div>
              <label className="world-visibility-choice">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => setVisible(e.target.checked)}
                />
                <span>
                  <strong>Mostrar aos jogadores</strong>
                  <small>Desmarcado: salvar apenas como rascunho do mestre.</small>
                </span>
              </label>
              <p className="world-publish-help">
                O texto e a imagem serão copiados para o cartão. Atualizações posteriores no mundo
                não alteram o que já foi compartilhado.
              </p>
              <div className="form-actions">
                <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>
                  Cancelar
                </Button>
                <Button disabled={busy || !title.trim()}>
                  {busy ? <LoaderCircle size={17} className="spin" /> : <PanelsTopLeft size={17} />}{' '}
                  Criar cartão
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </Modal>
  );
}

function WorldForm({
  entry,
  onSaved,
  onCancel,
}: {
  entry: WorldEntry;
  onSaved(): void;
  onCancel(): void;
}) {
  const w = useWorkspace();
  const [value, setValue] = useState(entry);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = w.data.world.some((row) => row.id === entry.id);
  const expected = useRef(existing ? entry.updated_at : null);
  const draftScope = useRef(
    `world:${existing ? entry.id : 'new:' + entry.campaign_id + ':' + entry.kind}`,
  );
  const draft = useEditorDraft(
    w.user?.id,
    draftScope.current,
    value,
    expected.current,
    (saved, version) => {
      expected.current = version;
      setValue(saved);
    },
  );
  const set = <K extends keyof WorldEntry>(key: K, val: WorldEntry[K]) =>
    setValue((current) => ({ ...current, [key]: val }));
  const regions = w.data.world.filter(
    (row) => row.campaign_id === value.campaign_id && row.kind === 'region',
  );
  const Icon = KINDS[value.kind];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let result = {
        ...value,
        name: value.name.trim(),
        type: value.type.trim(),
        region_id: value.kind === 'region' ? null : value.region_id,
      };
      if (!result.name) throw new Error(`Dê um nome à ${WORLD_LABELS[result.kind].toLowerCase()}.`);
      if (result.region_id && !regions.some((region) => region.id === result.region_id))
        throw new Error('Selecione uma região válida para esta campanha.');
      await w.perform(async (repo) => {
        await repo.saveWorld(result, expected.current);
        expected.current = result.updated_at;
        setValue({ ...result });
        if (file) {
          result = {
            ...result,
            image_path: await uploadImage(file, TABLES[result.kind], result.id, w.demo),
          };
          await repo.saveWorld(result, expected.current);
          expected.current = result.updated_at;
          setValue({ ...result });
        }
      }, `${WORLD_LABELS[result.kind]} salvo(a) no mundo.`);
      draft.clear();
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="world-form form-stack" onSubmit={submit}>
      <ErrorBox message={error} />
      <DraftRecovery draft={draft} />
      <div className="world-form-kind">
        <span>
          <Icon size={22} />
        </span>
        <div>
          <small>CRIANDO NO ATLAS</small>
          <strong>{WORLD_LABELS[value.kind]}</strong>
        </div>
      </div>
      <section className="world-form-section">
        <div className="world-form-heading">
          <span>01</span>
          <div>
            <h3>Identidade e localização</h3>
            <p>O essencial para encontrar este lugar no seu mundo.</p>
          </div>
        </div>
        <div className="form-grid">
          <Field
            label={`Nome ${value.kind === 'region' ? 'da região' : value.kind === 'city' ? 'da cidade' : 'do local'}`}
          >
            <Input
              required
              autoFocus
              maxLength={120}
              placeholder={
                value.kind === 'region'
                  ? 'Ex.: Terras do Norte'
                  : value.kind === 'city'
                    ? 'Ex.: Vila de Valória'
                    : 'Ex.: Taverna da Lua'
              }
              value={value.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Categoria">
            <Input
              maxLength={120}
              value={value.type}
              onChange={(e) => set('type', e.target.value)}
              placeholder={
                value.kind === 'region'
                  ? 'Reino, vale, arquipélago…'
                  : value.kind === 'city'
                    ? 'Capital, vila, fortaleza…'
                    : 'Taverna, ruína, templo…'
              }
            />
          </Field>
          {value.kind !== 'region' && (
            <Field
              label="Região"
              hint="As cidades e locais ficam organizados dentro desta região no Atlas."
            >
              <Select
                value={value.region_id ?? ''}
                onChange={(e) => set('region_id', e.target.value || null)}
              >
                <option value="">Sem região por enquanto</option>
                {regions.map((region) => (
                  <option value={region.id} key={region.id}>
                    {region.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Referência geográfica (opcional)">
            <Input
              maxLength={240}
              value={value.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Ex.: ao leste das Montanhas Cinzentas"
            />
          </Field>
          {value.kind === 'city' && (
            <>
              <Field label="População estimada">
                <Input
                  type="number"
                  min={0}
                  value={value.population ?? ''}
                  onChange={(e) =>
                    set('population', e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Governo / liderança">
                <Input
                  maxLength={240}
                  value={value.government}
                  onChange={(e) => set('government', e.target.value)}
                  placeholder="Ex.: Conselho dos Anciões"
                />
              </Field>
            </>
          )}
        </div>
      </section>
      <section className="world-form-section">
        <div className="world-form-heading">
          <span>02</span>
          <div>
            <h3>História e apresentação</h3>
            <p>Conte o que torna este lugar marcante para a aventura.</p>
          </div>
        </div>
        <Field label="Descrição">
          <Textarea
            rows={4}
            value={value.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="O que os aventureiros vão perceber quando chegarem aqui?"
          />
        </Field>
        <Field label="Pontos de interesse e informações públicas">
          <Textarea
            rows={3}
            value={value.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Lendas, comércio, lugares notáveis…"
          />
        </Field>
      </section>
      <section className="world-form-section">
        <div className="world-form-heading">
          <span>03</span>
          <div>
            <h3>Imagem do lugar</h3>
            <p>
              Use uma imagem panorâmica, quadrada ou vertical. A apresentação respeita suas
              proporções.
            </p>
          </div>
        </div>
        {value.image_path && !file && (
          <Cover
            path={value.image_path}
            name={value.name || 'Lugar'}
            className="world-form-image"
          />
        )}
        <ImageField
          aspect="original"
          label={value.image_path ? 'Trocar imagem' : 'Adicionar imagem'}
          current={value.image_path}
          value={file}
          onChange={setFile}
          onError={setError}
        />
      </section>
      <section className="world-form-section world-form-privacy">
        <div className="world-form-heading">
          <span>04</span>
          <div>
            <h3>Visibilidade e segredos</h3>
            <p>Você controla o que os jogadores descobrem.</p>
          </div>
        </div>
        <label className="world-visibility-choice">
          <input
            type="checkbox"
            checked={value.visible_to_players}
            onChange={(e) => set('visible_to_players', e.target.checked)}
          />
          <span>
            <strong>Mostrar este lugar no mundo dos jogadores</strong>
            <small>
              O Mural é independente: você pode preparar um cartão sem revelar este cadastro.
            </small>
          </span>
        </label>
        <details className="world-private-details">
          <summary>
            <LockKeyhole size={17} /> Anotações secretas do mestre <ChevronDown size={16} />
          </summary>
          <div className="form-stack">
            <Field label="Segredos">
              <Textarea
                rows={3}
                value={value.secrets ?? ''}
                onChange={(e) => set('secrets', e.target.value)}
                placeholder="O que os jogadores não sabem?"
              />
            </Field>
            <Field label="Observações privadas">
              <Textarea
                rows={3}
                value={value.private_notes ?? ''}
                onChange={(e) => set('private_notes', e.target.value)}
              />
            </Field>
          </div>
        </details>
      </section>
      <div className="form-actions world-form-footer">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button disabled={busy}>
          {busy ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />} Salvar{' '}
          {WORLD_LABELS[value.kind].toLowerCase()}
        </Button>
      </div>
    </form>
  );
}
