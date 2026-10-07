'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Plus,
  Play,
  Square,
  Map,
  PanelsTopLeft,
  Pencil,
  RefreshCw,
  StickyNote,
  Copy,
  Skull,
  LoaderCircle,
  Lock,
} from 'lucide-react';
import type { Campaign } from '@/types';
import { PageHeading } from '@/components/shell';
import {
  Button,
  Badge,
  Empty,
  ErrorBox,
  Modal,
  Confirm,
  Field,
  Input,
  Select,
  Textarea,
  Loading,
} from '@/components/ui';
import { ImageField } from '@/components/media';
import { useMedia } from '@/hooks/use-media';
import { useWorkspace } from '@/hooks/use-workspace';
import { errorMessage } from '@/lib/utils';
import { uploadImage } from '@/services/storage';
import { getSupabase } from '@/lib/supabase/client';
import { SESSION_STATUS, defaultSession, type CampaignSession, type SessionEvent } from './types';
import { useCampaignSessions } from './use-sessions';
import {
  saveSession,
  changeSession,
  loadSessionEvents,
  addSessionNote,
  confirmDeath,
  copyMap,
  copyMural,
  sessionError,
} from './repository';
const time = (date: string | null) =>
  date ? new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export function SessionsPage({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace(),
    master = campaign.owner_id === w.user?.id,
    list = useCampaignSessions(campaign.id, master);
  const [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<{ previous?: CampaignSession } | null>(null),
    [ending, setEnding] = useState<CampaignSession | null>(null),
    [summary, setSummary] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const current = list.items.find((s) => s.id === selected) ?? defaultSession(list.items, master),
    active = list.items.find((s) => s.status === 'active');
  const [journalVersion, setJournalVersion] = useState(0);
  async function run(operation: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
      await list.refresh();
      setJournalVersion((v) => v + 1);
      w.notify(message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={campaign.name}
        title="Sessões"
        description="Cada capítulo guarda seus cenários, imagens e acontecimentos."
        action={
          master ? (
            <Button onClick={() => setEditing({})}>
              <Plus size={17} /> Criar sessão
            </Button>
          ) : undefined
        }
      />
      <ErrorBox message={error ?? list.error} />
      {list.loading ? (
        <Loading />
      ) : list.items.length ? (
        <div className="sessions-layout">
          <aside className="session-list" aria-label="Sessões da campanha">
            {list.items.map((s) => (
              <button
                key={s.id}
                className={`session-card ${current?.id === s.id ? 'selected' : ''}`}
                onClick={() => setSelected(s.id)}
              >
                <span className="session-number">{String(s.number).padStart(2, '0')}</span>
                <span>
                  <strong>{s.name}</strong>
                  <small>
                    {SESSION_STATUS[s.status]} · Criada {time(s.created_at)}
                  </small>
                </span>
                <Badge
                  tone={s.status === 'active' ? 'green' : s.status === 'ended' ? 'muted' : 'gold'}
                >
                  {s.status === 'active' ? 'Agora' : `#${s.number}`}
                </Badge>
              </button>
            ))}
          </aside>
          {current && (
            <section className="session-detail">
              <div className="panel session-summary">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">SESSÃO {current.number}</span>
                    <h2>{current.name}</h2>
                  </div>
                  <Badge tone={current.status === 'active' ? 'green' : 'muted'}>
                    {SESSION_STATUS[current.status]}
                  </Badge>
                </div>
                <div className="session-dates">
                  <span>
                    Criada <strong>{time(current.created_at)}</strong>
                  </span>
                  <span>
                    Iniciada <strong>{time(current.started_at)}</strong>
                  </span>
                  <span>
                    Encerrada <strong>{time(current.ended_at)}</strong>
                  </span>
                </div>
                {current.summary && <p className="session-text">{current.summary}</p>}
                <div className="session-actions">
                  {master && current.status === 'planned' && (
                    <>
                      <Button
                        disabled={busy || Boolean(active)}
                        disabledReason={
                          busy
                            ? 'Aguarde a atualização da sessão.'
                            : 'Encerre a sessão em andamento antes de iniciar outra.'
                        }
                        onClick={() =>
                          void run(
                            () => changeSession(current, 'start', w.demo),
                            'Sessão iniciada.',
                          )
                        }
                      >
                        <Play size={16} /> Iniciar sessão
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditing({ previous: current })}
                      >
                        <Pencil size={16} /> Editar
                      </Button>
                    </>
                  )}
                  {master && current.status === 'active' && (
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        setSummary('');
                        setEnding(current);
                      }}
                    >
                      <Square size={16} /> Encerrar sessão
                    </Button>
                  )}
                  <Link
                    className="button button-secondary"
                    href={`/campanhas/${campaign.id}/mesa/grid?sessao=${current.id}`}
                  >
                    <Map size={16} />
                    {current.status === 'ended' ? 'Ver grids salvos' : 'Abrir Grid'}
                  </Link>
                  <Link
                    className="button button-secondary"
                    href={`/campanhas/${campaign.id}/mesa/mural?sessao=${current.id}`}
                  >
                    <PanelsTopLeft size={16} />
                    {current.status === 'ended' ? 'Ver Mural salvo' : 'Abrir Mural'}
                  </Link>
                  {master && current.status === 'ended' && (
                    <SessionReuse source={current} sessions={list.items} />
                  )}
                </div>
                {master && current.status === 'planned' && active && (
                  <p className="subtle">Encerre a sessão {active.number} antes de iniciar esta.</p>
                )}
                {current.status === 'ended' && (
                  <p className="archive-notice">
                    <Lock size={15} /> Arquivo para consulta. As fichas permanecem na campanha; as
                    peças foram retiradas dos grids.
                  </p>
                )}
              </div>
              <SessionJournal
                key={`${current.id}:${journalVersion}`}
                session={current}
                master={master}
              />
            </section>
          )}
        </div>
      ) : (
        <Empty
          title={master ? 'Escreva o primeiro capítulo.' : 'A primeira sessão está a caminho.'}
          description={
            master
              ? 'Crie uma sessão com nome e número. Prepare o Grid e o Mural, depois inicie a aventura.'
              : 'As sessões iniciadas pelo mestre aparecerão aqui.'
          }
          action={
            master ? (
              <Button onClick={() => setEditing({})}>
                <Plus size={17} /> Criar sessão
              </Button>
            ) : undefined
          }
        />
      )}
      {editing && (
        <SessionForm
          previous={editing.previous}
          nextNumber={Math.max(0, ...list.items.map((s) => s.number)) + 1}
          busy={busy}
          error={error}
          onClose={() => setEditing(null)}
          onSave={(name, number) =>
            run(async () => {
              const s = await saveSession(campaign.id, name, number, w.demo, editing.previous);
              setSelected(s.id);
              setEditing(null);
            }, 'Sessão salva.')
          }
        />
      )}
      <Modal
        open={Boolean(ending)}
        onClose={() => !busy && setEnding(null)}
        title="Encerrar sessão"
        description="Os cenários, imagens e registros serão preservados para consulta. As peças sairão dos grids; as fichas permanecem na campanha."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ending)
              void run(async () => {
                await changeSession(ending, 'end', w.demo, summary);
                setEnding(null);
              }, 'Sessão encerrada e arquivada.');
          }}
        >
          <Field label="Resumo da sessão (visível aos jogadores)">
            <Textarea
              maxLength={12000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Como terminou este capítulo?"
            />
          </Field>
          <ErrorBox message={error} />
          <div className="form-actions">
            <Button variant="ghost" type="button" onClick={() => setEnding(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Square size={17} />} Encerrar e
              arquivar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
function SessionForm({
  previous,
  nextNumber,
  busy,
  error,
  onSave,
  onClose,
}: {
  previous?: CampaignSession;
  nextNumber: number;
  busy: boolean;
  error: string | null;
  onSave: (name: string, number: number) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(previous?.name ?? ''),
    [number, setNumber] = useState(previous?.number ?? nextNumber);
  return (
    <Modal open onClose={onClose} title={previous ? 'Editar sessão' : 'Criar sessão'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(name, number);
        }}
      >
        <ErrorBox message={error} />
        <div className="form-grid">
          <Field label="Nome da sessão">
            <Input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="O início"
            />
          </Field>
          <Field label="Número da sessão">
            <Input
              type="number"
              required
              min={1}
              max={100000}
              value={number}
              onChange={(e) => setNumber(Number(e.target.value))}
            />
          </Field>
        </div>
        <p className="subtle">
          A data de criação é registrada automaticamente. Você pode preparar o cenário antes de
          iniciar.
        </p>
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <CalendarDays size={17} />} Salvar
            sessão
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function SessionJournal({ session, master }: { session: CampaignSession; master: boolean }) {
  const w = useWorkspace(),
    [events, setEvents] = useState<SessionEvent[]>([]),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(false),
    [death, setDeath] = useState(false),
    [pendingDeath, setPendingDeath] = useState<{
      id: string;
      kind: 'character' | 'npc';
      name: string;
    } | null>(null);
  const gen = useRef(0),
    alive = useRef(false),
    offset = useRef(0);
  const refresh = useCallback(
    async (loadMore = false) => {
      const n = ++gen.current;
      try {
        const rows = await loadSessionEvents(
          session,
          w.demo,
          master,
          loadMore ? offset.current : 0,
        );
        if (alive.current && n === gen.current) {
          setEvents((old) =>
            loadMore ? [...old, ...rows.filter((r) => !old.some((e) => e.id === r.id))] : rows,
          );
          offset.current = (loadMore ? offset.current : 0) + rows.length;
          setMore(rows.length === 50);
          setError(null);
        }
      } catch (e) {
        if (alive.current && n === gen.current) setError(errorMessage(e));
      } finally {
        if (alive.current && n === gen.current) setLoading(false);
      }
    },
    [session.id, session.status, w.demo, master],
  );
  useEffect(() => {
    alive.current = true;
    void refresh();
    const reload = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = session.status === 'active' ? setInterval(reload, 15000) : undefined;
    window.addEventListener('focus', reload);
    return () => {
      alive.current = false;
      gen.current++;
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', reload);
    };
  }, [refresh, session.status]);
  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      await w.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel session-journal">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">MEMÓRIA DA AVENTURA</span>
          <h2>Acontecimentos</h2>
        </div>
        <div className="session-actions">
          <Button
            variant="ghost"
            aria-label="Atualizar acontecimentos"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RefreshCw size={16} />
          </Button>
          {master && session.status === 'active' && (
            <>
              <Button variant="secondary" onClick={() => setNote(true)}>
                <StickyNote size={16} /> Registrar
              </Button>
              <Button variant="ghost" onClick={() => setDeath(true)}>
                <Skull size={16} /> Confirmar morte
              </Button>
            </>
          )}
        </div>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : events.length ? (
        <ol className="session-timeline">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </ol>
      ) : (
        <Empty
          title={
            session.status === 'planned'
              ? 'Pronta para começar.'
              : 'Ainda não há acontecimentos visíveis.'
          }
          description={
            session.status === 'planned'
              ? 'O registro automático começa ao iniciar a sessão.'
              : 'O Mural, combates, ações, dados e mortes confirmadas serão registrados aqui.'
          }
        />
      )}
      {more && (
        <Button variant="secondary" onClick={() => void refresh(true)}>
          Carregar acontecimentos anteriores
        </Button>
      )}
      {note && (
        <NoteForm
          busy={busy}
          error={error}
          onClose={() => setNote(false)}
          onSave={(title, description, file, visible) =>
            run(async () => {
              const image = file
                ? await uploadImage(file, 'campaign_mural', session.campaign_id, w.demo)
                : null;
              await addSessionNote(session, title, description, image, visible, w.demo);
              setNote(false);
            })
          }
        />
      )}
      <Modal
        open={death}
        onClose={() => setDeath(false)}
        title="Confirmar morte"
        description="Esta confirmação atualiza a ficha e registra o acontecimento. Um jogador com 0 PV ainda pode fazer salvaguardas contra a morte."
      >
        <div className="record-list">
          {[
            ...w.data.characters
              .filter((c) => c.campaign_id === session.campaign_id)
              .map((c) => ({ id: c.id, name: c.name, kind: 'character' as const })),
            ...w.data.npcs
              .filter((n) => n.campaign_id === session.campaign_id)
              .map((n) => ({ id: n.id, name: n.name, kind: 'npc' as const })),
          ].map((e) => (
            <Button key={e.id} variant="ghost" onClick={() => setPendingDeath(e)}>
              <Skull size={16} />
              {e.name} <small>{e.kind === 'npc' ? 'NPC' : 'Jogador'}</small>
            </Button>
          ))}
        </div>
      </Modal>
      <Confirm
        open={Boolean(pendingDeath)}
        title={`Confirmar morte de ${pendingDeath?.name ?? ''}?`}
        description="O estado de vida será atualizado e a morte ficará registrada nesta sessão."
        onCancel={() => setPendingDeath(null)}
        onConfirm={() =>
          void run(async () => {
            if (pendingDeath)
              await confirmDeath(session, pendingDeath.id, pendingDeath.kind, w.demo);
            setPendingDeath(null);
            setDeath(false);
          })
        }
      />
    </div>
  );
}
function EventCard({ event: e }: { event: SessionEvent }) {
  const image = useMedia(e.image_path);
  return (
    <li className={`session-event ${e.kind.endsWith('_death') ? 'death' : ''}`}>
      <span className="session-event-dot" />
      <div>
        <div className="session-event-heading">
          <time dateTime={e.created_at}>{time(e.created_at)}</time>
          {e.visibility === 'gm' && <Badge tone="muted">Só o mestre</Badge>}
        </div>
        <strong>{e.title}</strong>
        {e.description && <p className="session-text">{e.description}</p>}
        {image && (
          <a href={image} target="_blank" rel="noreferrer">
            <img className="session-event-image" src={image} alt={e.title} loading="lazy" />
          </a>
        )}
      </div>
    </li>
  );
}
function NoteForm({
  busy,
  error,
  onSave,
  onClose,
}: {
  busy: boolean;
  error: string | null;
  onSave: (
    title: string,
    description: string,
    file: File | null,
    visible: boolean,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [visible, setVisible] = useState(true),
    [fileError, setFileError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Registrar acontecimento">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void onSave(title, description, file, visible);
        }}
      >
        <ErrorBox message={fileError ?? error} />
        <Field label="Título">
          <Input
            required
            maxLength={240}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Descrição">
          <Textarea
            maxLength={12000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <ImageField
          label="Imagem do acontecimento"
          current={null}
          onChange={setFile}
          onError={setFileError}
        />
        <label className="session-rule">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          <span>Compartilhar com os jogadores</span>
        </label>
        <div className="form-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy}>Salvar acontecimento</Button>
        </div>
      </form>
    </Modal>
  );
}
export function SessionReuse({
  source,
  sessions,
  mapId,
  mapName,
}: {
  source: CampaignSession;
  sessions: CampaignSession[];
  mapId?: string;
  mapName?: string;
}) {
  const w = useWorkspace(),
    [open, setOpen] = useState(false),
    [target, setTarget] = useState(''),
    [maps, setMaps] = useState<{ id: string; name: string }[]>([]),
    [chosen, setChosen] = useState(mapId ?? ''),
    [name, setName] = useState(mapName ?? ''),
    [mode, setMode] = useState<'map' | 'mural'>(w.demo ? 'mural' : 'map'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const destinations = sessions.filter((s) => s.id !== source.id && s.status !== 'ended');
  useEffect(() => {
    if (!open) return;
    setTarget(destinations[0]?.id ?? '');
    if (mapId || w.demo) return;
    let active = true;
    void getSupabase()
      .from('battle_maps')
      .select('id,name')
      .eq('adventure_session_id', source.id)
      .order('created_at')
      .then(({ data, error }) => {
        if (!active) return;
        try {
          sessionError(error);
          const rows = (data ?? []) as { id: string; name: string }[];
          setMaps(rows);
          setChosen(rows[0]?.id ?? '');
          setName(rows[0]?.name ?? '');
        } catch (e) {
          setError(errorMessage(e));
        }
      });
    return () => {
      active = false;
    };
  }, [open, source.id, mapId, w.demo]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'mural') {
        const count = await copyMural(source, target, w.demo);
        w.notify(`${count} cartões copiados para a nova sessão.`);
      } else {
        await copyMap(chosen, target, name);
        w.notify('Cenário copiado. As fichas e peças não são copiadas.');
      }
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Copy size={16} /> Reaproveitar cenário
      </Button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Reaproveitar cenário"
        description="Cria uma cópia independente em outra sessão, preservando este arquivo."
      >
        <form onSubmit={submit}>
          <ErrorBox message={error} />
          {destinations.length ? (
            <>
              <Field label="Sessão de destino">
                <Select required value={target} onChange={(e) => setTarget(e.target.value)}>
                  {destinations.map((s) => (
                    <option key={s.id} value={s.id}>
                      Sessão {s.number} — {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {!mapId && (
                <Field label="O que copiar">
                  <Select value={mode} onChange={(e) => setMode(e.target.value as 'map' | 'mural')}>
                    <option value="map" disabled={w.demo}>
                      Estrutura de um grid
                    </option>
                    <option value="mural">Todos os cartões do Mural</option>
                  </Select>
                </Field>
              )}
              {mode === 'map' && !w.demo && (
                <>
                  {!mapId && (
                    <Field label="Grid de origem">
                      <Select
                        value={chosen}
                        required
                        onChange={(e) => {
                          setChosen(e.target.value);
                          setName(maps.find((m) => m.id === e.target.value)?.name ?? '');
                        }}
                      >
                        <option value="" disabled>
                          Selecione um grid
                        </option>
                        {maps.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label="Nome do novo grid">
                    <Input
                      maxLength={120}
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                  <p className="subtle">
                    Copia elementos, terreno, fundo e áreas ocultas. As peças e o combate não são
                    copiados. Portais conectam apenas pontos da sessão de destino.
                  </p>
                </>
              )}
              {mode === 'mural' && (
                <p className="subtle">
                  O Mural de destino deve estar vazio. As imagens e descrições são copiadas com a
                  mesma visibilidade.
                </p>
              )}
              <div className="form-actions">
                <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={busy || !target || (mode === 'map' && (!chosen || w.demo))}
                  disabledReason={
                    busy
                      ? 'Aguarde a cópia terminar.'
                      : !target
                        ? 'Escolha a sessão de destino para copiar.'
                        : w.demo
                          ? 'A cópia de mapas entre sessões fica disponível ao conectar a campanha ao Supabase.'
                          : 'Escolha o mapa que deseja copiar.'
                  }
                >
                  Copiar cenário
                </Button>
              </div>
            </>
          ) : (
            <Empty
              title="Crie primeiro a próxima sessão."
              description="A cópia precisa de outra sessão em preparação ou em andamento."
            />
          )}
        </form>
      </Modal>
    </>
  );
}
