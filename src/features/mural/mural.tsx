'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import {
  Plus,
  Search,
  MapPin,
  UserRound,
  Image as ImageIcon,
  StickyNote,
  Eye,
  EyeOff,
  Pin,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  LoaderCircle,
  BookOpen,
  Save,
} from 'lucide-react';
import type { Campaign } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { useMedia } from '@/hooks/use-media';
import { uid, now, errorMessage, cx } from '@/lib/utils';
import {
  Button,
  Badge,
  Empty,
  ErrorBox,
  Modal,
  Confirm,
  Input,
  Select,
  Textarea,
  Field,
  Loading,
} from '@/components/ui';
import { ImageField } from '@/components/media';
import { uploadImage } from '@/services/storage';
import { copyWorldImageToMural, discardMuralImage } from './world-publication';
import { worldMuralSummary } from '@/lib/world-hierarchy';
import Link from 'next/link';
import { saveMural, deleteMural, reorderMural } from './repository';
import { useMural } from './use-mural';
import { MURAL_KINDS, MURAL_LABELS, type MuralItem, type MuralKind } from './types';

const ICONS = { location: MapPin, npc: UserRound, image: ImageIcon, note: StickyNote };
const AnnotationViewer = dynamic(
  () => import('./annotation-viewer').then((m) => m.AnnotationViewer),
  { loading: () => <Loading /> },
);
export function Mural({
  campaign,
  adventure,
}: {
  campaign: Campaign;
  adventure?: import('@/features/sessions/types').CampaignSession;
}) {
  const w = useWorkspace(),
    owner = campaign.owner_id === w.user?.id,
    master = owner && adventure?.status !== 'ended';
  const board = useMural(campaign.id, w.demo, owner, w.user?.id ?? null, adventure?.id);
  const [filter, setFilter] = useState<MuralKind | 'all'>('all'),
    [query, setQuery] = useState(''),
    [limit, setLimit] = useState(24);
  const [editing, setEditing] = useState<{ item: MuralItem; existing: boolean } | null>(null),
    [reading, setReading] = useState<string | null>(null),
    [pending, setPending] = useState<MuralItem | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [annotationPending, setAnnotationPending] = useState(0),
    [closingReader, setClosingReader] = useState(false);
  const matches = useMemo(
    () =>
      board.items.filter(
        (i) =>
          (filter === 'all' || i.kind === filter) &&
          `${i.title} ${i.description}`
            .toLocaleLowerCase('pt-BR')
            .includes(query.toLocaleLowerCase('pt-BR')),
      ),
    [board.items, filter, query],
  );
  const reader = board.items.find((i) => i.id === reading);
  useEffect(() => setLimit(24), [filter, query]);
  useEffect(() => {
    if (reading && !board.loading && !board.items.some((i) => i.id === reading)) setReading(null);
  }, [reading, board.items, board.loading]);
  function create(kind: MuralKind = 'image') {
    setEditing({
      existing: false,
      item: {
        id: uid(),
        campaign_id: campaign.id,
        adventure_session_id: adventure?.id,
        kind,
        title: '',
        description: '',
        image_path: null,
        source_location_id: null,
        source_npc_id: null,
        visible_to_players: false,
        pinned: false,
        sort_order: 0,
        created_at: now(),
        updated_at: now(),
      },
    });
  }
  async function run(operation: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
      await board.refresh();
      w.notify(message);
    } catch (e) {
      setError(errorMessage(e));
      await board.refresh();
    } finally {
      setBusy(false);
    }
  }
  function move(item: MuralItem, direction: number) {
    const index = board.items.findIndex((i) => i.id === item.id),
      neighbor = board.items[index + direction];
    if (!neighbor || neighbor.pinned !== item.pinned) return;
    const ids = board.items.map((i) => i.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    void run(
      () => reorderMural(campaign.id, ids, w.demo, adventure?.id),
      'Ordem do mural atualizada.',
    );
  }
  return (
    <section className="mural" aria-label="Mural da campanha">
      <div className="mural-heading">
        <div>
          <span className="eyebrow">HISTÓRIAS À VISTA</span>
          <h2>Mural</h2>
          <p>
            {master
              ? 'Reúna lugares, rostos e pistas. Revele cada cartão quando fizer sentido na aventura.'
              : 'Lugares, rostos e pistas que o mestre compartilhou com a mesa.'}
          </p>
        </div>
        <div className="mural-heading-actions">
          <Button
            variant="ghost"
            aria-label="Atualizar mural"
            disabled={busy}
            onClick={() => void board.refresh()}
          >
            <RefreshCw size={17} />
          </Button>
          {master && (
            <Link className="button button-secondary" href={`/campanhas/${campaign.id}/mundo`}>
              <MapPin size={16} /> Mundo
            </Link>
          )}
          {master && (
            <Button onClick={() => create()}>
              <Plus size={17} />
              Novo cartão
            </Button>
          )}
        </div>
      </div>
      <ErrorBox message={error ?? board.error} />
      {w.demo && (
        <p className="mural-demo-note">Demonstração: os cartões ficam salvos neste navegador.</p>
      )}
      {master && (
        <div className="mural-create-shortcuts" aria-label="Adicionar ao mural">
          <Button variant="secondary" onClick={() => create('location')}>
            <MapPin size={16} />
            Lugar do mundo
          </Button>
          <Button variant="secondary" onClick={() => create('npc')}>
            <UserRound size={16} />
            Mostrar NPC
          </Button>
          <Button variant="secondary" onClick={() => create('image')}>
            <ImageIcon size={16} />
            Imagem
          </Button>
          <Button variant="secondary" onClick={() => create('note')}>
            <StickyNote size={16} />
            Nota
          </Button>
        </div>
      )}
      <div className="mural-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filtrar mural">
          {(['all', ...MURAL_KINDS] as const).map((kind) => (
            <button
              key={kind}
              className={cx('filter-tab', filter === kind && 'selected')}
              aria-pressed={filter === kind}
              onClick={() => setFilter(kind)}
            >
              {kind === 'all'
                ? 'Todos'
                : { location: 'Mundo', npc: 'NPCs', image: 'Imagens', note: 'Notas' }[kind]}
              <span>{board.items.filter((i) => kind === 'all' || i.kind === kind).length}</span>
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <Input
            aria-label="Buscar no mural"
            placeholder="Buscar no mural…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {board.loading ? (
        <Loading />
      ) : matches.length ? (
        <>
          <div className="mural-grid">
            {matches.slice(0, limit).map((item) => {
              const Icon = ICONS[item.kind],
                index = board.items.findIndex((i) => i.id === item.id);
              return (
                <article
                  key={item.id}
                  className={cx(
                    'mural-card',
                    `mural-card-${item.kind}`,
                    item.pinned && 'mural-card-pinned',
                    !item.visible_to_players && 'mural-card-draft',
                  )}
                  aria-label={`Cartão ${item.title}`}
                >
                  <button
                    type="button"
                    className="mural-card-open"
                    onClick={() => setReading(item.id)}
                    aria-label={`Abrir ${item.title}`}
                  >
                    <MuralImage path={item.image_path} title={item.title} kind={item.kind} />
                    <div className="mural-card-body">
                      <div className="mural-card-meta">
                        <span>
                          <Icon size={14} />
                          {MURAL_LABELS[item.kind]}
                        </span>
                        {item.pinned && <Pin size={14} aria-label="Em destaque" />}
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.description || 'Abra para explorar esta parte da história.'}</p>
                    </div>
                  </button>
                  {master && (
                    <div className="mural-card-controls">
                      <button
                        type="button"
                        className="mural-visibility"
                        disabled={busy}
                        aria-label={`${item.visible_to_players ? 'Ocultar' : 'Mostrar'} ${item.title}`}
                        onClick={() =>
                          void run(
                            () =>
                              saveMural(
                                { ...item, visible_to_players: !item.visible_to_players },
                                item.updated_at,
                                w.demo,
                              ),
                            item.visible_to_players
                              ? 'Cartão ocultado dos jogadores.'
                              : 'Cartão mostrado aos jogadores.',
                          )
                        }
                      >
                        {item.visible_to_players ? <Eye size={15} /> : <EyeOff size={15} />}
                        <span>{item.visible_to_players ? 'Visível' : 'Rascunho'}</span>
                      </button>
                      <div className="mural-card-tools">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Mover ${item.title} para cima`}
                          disabled={
                            busy ||
                            !board.items[index - 1] ||
                            board.items[index - 1].pinned !== item.pinned
                          }
                          onClick={() => move(item, -1)}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Mover ${item.title} para baixo`}
                          disabled={
                            busy ||
                            !board.items[index + 1] ||
                            board.items[index + 1].pinned !== item.pinned
                          }
                          onClick={() => move(item, 1)}
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Editar ${item.title}`}
                          disabled={busy}
                          onClick={() => setEditing({ item, existing: true })}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button mural-delete"
                          aria-label={`Excluir ${item.title}`}
                          disabled={busy}
                          onClick={() => setPending(item)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {limit < matches.length && (
            <div className="mural-more">
              <Button variant="secondary" onClick={() => setLimit((n) => n + 24)}>
                Mostrar mais cartões ({matches.length - limit})
              </Button>
            </div>
          )}
        </>
      ) : (
        <Empty
          title={
            query || filter !== 'all'
              ? 'Nenhum cartão encontrado.'
              : master
                ? 'Um novo capítulo começa aqui.'
                : 'O mestre ainda não revelou cartões.'
          }
          description={
            master
              ? 'Escolha uma região, cidade ou local do mundo; apresente um NPC ou prepare uma imagem para a cena.'
              : 'Os cartões compartilhados aparecerão neste mural.'
          }
          action={
            master && !query ? (
              <Button onClick={() => create('note')}>
                <BookOpen size={17} />
                Preparar primeiro cartão
              </Button>
            ) : undefined
          }
        />
      )}
      {editing && (
        <MuralEditor
          key={editing.item.id}
          campaign={campaign}
          item={editing.item}
          existing={editing.existing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await board.refresh();
            w.notify('Cartão salvo no mural.');
          }}
        />
      )}
      <Modal
        open={Boolean(reader)}
        onClose={() => {
          if (annotationPending) setClosingReader(true);
          else setReading(null);
        }}
        title={reader?.title ?? 'Cartão do mural'}
        description={
          reader?.kind === 'image'
            ? 'Mapa compartilhado com a mesa.'
            : 'Uma parte da história compartilhada na Mesa.'
        }
        wide
      >
        {reader && (
          <div className="mural-reader">
            {reader.kind !== 'image' && <Badge tone="muted">{MURAL_LABELS[reader.kind]}</Badge>}
            {owner && reader.source_location_id && (
              <Link className="mural-world-link" href={`/campanhas/${campaign.id}/mundo`}>
                <MapPin size={15} /> Ver no mundo da campanha
              </Link>
            )}
            {reader.image_path &&
              (reader.kind === 'image' ? (
                <AnnotationViewer
                  key={`${reader.id}:${reader.image_path}:${w.user?.id}`}
                  item={reader}
                  master={owner}
                  archived={adventure?.status === 'ended'}
                  onPendingChange={setAnnotationPending}
                />
              ) : (
                <MuralImage path={reader.image_path} title={reader.title} kind={reader.kind} />
              ))}
            {(reader.description || reader.kind !== 'image') && (
              <p>{reader.description || 'Uma nova descoberta na aventura.'}</p>
            )}
          </div>
        )}
      </Modal>
      <Confirm
        open={closingReader}
        onCancel={() => setClosingReader(false)}
        onConfirm={() => {
          setClosingReader(false);
          setReading(null);
        }}
        title="Fechar com marcações pendentes?"
        description="Há marcações que ainda não foram salvas. Aguarde a sincronização ou tente salvá-las novamente para preservar seu trabalho."
        confirmLabel="Fechar mesmo assim"
      />
      <Confirm
        open={Boolean(pending)}
        onCancel={() => setPending(null)}
        onConfirm={() =>
          void run(async () => {
            if (pending) {
              await deleteMural(pending, w.demo);
              setPending(null);
            }
          }, 'Cartão excluído.')
        }
        title={`Excluir ${pending?.title ?? 'cartão'}?`}
        description="A exclusão remove apenas este cartão do Mural. O local ou NPC vinculado permanece no cadastro."
        busy={busy}
      />
    </section>
  );
}
function MuralImage({
  path,
  title,
  kind,
  previewSrc,
}: {
  path: string | null;
  title: string;
  kind: MuralKind;
  previewSrc?: string | null;
}) {
  const media = useMedia(path),
    src = previewSrc ?? media,
    Icon = ICONS[kind];
  const [shape, setShape] = useState<'wide' | 'landscape' | 'portrait'>('landscape');
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className={cx('mural-image', `mural-image-${kind}`, `mural-image-${shape}`)}>
      {src && src !== failed ? (
        <>
          <img
            className="mural-image-atmosphere"
            src={src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
          <img
            className="mural-image-foreground"
            src={src}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={(event) => {
              const ratio =
                event.currentTarget.naturalWidth / Math.max(1, event.currentTarget.naturalHeight);
              setShape(ratio >= 2 ? 'wide' : ratio < 0.86 ? 'portrait' : 'landscape');
            }}
            onError={() => setFailed(src)}
          />
        </>
      ) : (
        <div className="mural-image-fallback">
          <Icon size={44} strokeWidth={1} />
          <span>{MURAL_LABELS[kind]}</span>
        </div>
      )}
    </div>
  );
}
function MuralEditor({
  campaign,
  item,
  existing,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  item: MuralItem;
  existing: boolean;
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const w = useWorkspace(),
    [draft, setDraft] = useState(item),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [selectedWorldId, setSelectedWorldId] = useState(item.source_location_id ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const places = w.data.world
      .filter((l) => l.campaign_id === campaign.id)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'pt-BR')),
    npcs = w.data.npcs.filter((n) => n.campaign_id === campaign.id);
  const source =
    draft.kind === 'location'
      ? places.find((l) => l.id === selectedWorldId)
      : draft.kind === 'npc'
        ? npcs.find((n) => n.id === draft.source_npc_id)
        : null;
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function link(id: string) {
    const record =
      draft.kind === 'location' ? places.find((l) => l.id === id) : npcs.find((n) => n.id === id);
    setFile(null);
    if (draft.kind === 'location') setSelectedWorldId(id);
    setDraft((d) => ({
      ...d,
      source_location_id:
        d.kind === 'location' && record && 'kind' in record && record.kind === 'location'
          ? id
          : null,
      source_npc_id: d.kind === 'npc' ? id || null : null,
      ...(record
        ? {
            title: record.name,
            description: 'kind' in record ? worldMuralSummary(record) : record.appearance,
            image_path: record.image_path,
          }
        : {}),
    }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    let uploaded: string | null = null;
    try {
      let image = draft.image_path;
      if (file) {
        uploaded = await uploadImage(file, 'campaign_mural', campaign.id, w.demo);
        image = uploaded;
      } else if (image && !image.startsWith('campaign_mural/')) {
        const copy = await copyWorldImageToMural(image, campaign.id, w.demo);
        if (copy !== image) uploaded = copy;
        image = copy;
      }
      await saveMural({ ...draft, image_path: image }, existing ? item.updated_at : null, w.demo);
      uploaded = null;
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
      if (uploaded) await discardMuralImage(uploaded, w.demo).catch(() => {});
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
      title={existing ? 'Editar cartão' : 'Novo cartão'}
      description="Escolha o texto e a imagem que farão parte da história. Rascunhos ficam disponíveis só para o mestre."
      wide
    >
      <form className="mural-editor form-stack" onSubmit={submit}>
        <ErrorBox message={error} />
        <fieldset disabled={busy}>
          <div className="mural-editor-columns">
            <div className="form-stack">
              <Field label="Tipo de cartão">
                <Select
                  value={draft.kind}
                  onChange={(e) => {
                    setSelectedWorldId('');
                    setDraft((d) => ({
                      ...d,
                      kind: e.target.value as MuralKind,
                      source_location_id: null,
                      source_npc_id: null,
                    }));
                  }}
                >
                  {MURAL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {MURAL_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              {draft.kind === 'location' && (
                <Field
                  label="Região, cidade ou local do mundo"
                  hint="Ao escolher um registro, o cartão recebe uma cópia de sua apresentação, nunca os segredos do mestre."
                >
                  <Select value={selectedWorldId} onChange={(e) => link(e.target.value)}>
                    <option value="">Cartão personalizado (sem registro)</option>
                    {(['region', 'city', 'location'] as const).map((kind) => (
                      <optgroup
                        key={kind}
                        label={{ region: 'Regiões', city: 'Cidades', location: 'Locais' }[kind]}
                      >
                        {places
                          .filter((place) => place.kind === kind)
                          .map((place) => (
                            <option key={place.id} value={place.id}>
                              {place.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
              )}
              {draft.kind === 'npc' && (
                <Field
                  label="NPC vinculado"
                  hint="O cartão compartilha a apresentação escolhida. A ficha do NPC mantém suas permissões."
                >
                  <Select value={draft.source_npc_id ?? ''} onChange={(e) => link(e.target.value)}>
                    <option value="">Sem vínculo · personagem da história</option>
                    {npcs.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {draft.kind === 'location' &&
                source &&
                'kind' in source &&
                source.kind !== 'location' && (
                  <small className="mural-source-note">
                    Regiões e cidades são adicionadas como cópias independentes. Você pode
                    selecionar o registro novamente para atualizar a apresentação.
                  </small>
                )}
              {source && (
                <Button variant="ghost" type="button" onClick={() => link(source.id)}>
                  <RefreshCw size={15} />
                  Usar dados do cadastro
                </Button>
              )}
              <Field label="Título do cartão">
                <Input
                  required
                  maxLength={180}
                  value={draft.title}
                  placeholder="A taverna do dragão adormecido"
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </Field>
              <Field
                label="Descrição do cartão"
                hint="Este é o texto que os jogadores verão quando o cartão estiver visível."
              >
                <Textarea
                  rows={8}
                  maxLength={12000}
                  value={draft.description}
                  placeholder="Descreva a cena, o lugar, o personagem ou a pista…"
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </Field>
            </div>
            <div className="mural-editor-media">
              <MuralImage
                path={draft.image_path}
                title={draft.title || 'Prévia do cartão'}
                kind={draft.kind}
                previewSrc={preview}
              />
              <ImageField
                aspect="original"
                value={file}
                label="Escolher imagem do cartão"
                current={preview ?? draft.image_path}
                onChange={setFile}
                onError={setError}
              />
              {(file || draft.image_path) && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setDraft((d) => ({ ...d, image_path: null }));
                  }}
                >
                  Remover imagem
                </Button>
              )}
              <div className="mural-editor-publishing">
                <label>
                  <input
                    type="checkbox"
                    aria-label="Mostrar aos jogadores"
                    checked={draft.visible_to_players}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, visible_to_players: e.target.checked }))
                    }
                  />
                  <span>
                    <strong>Mostrar aos jogadores</strong>
                    <small>Desmarcado: rascunho só para o mestre.</small>
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label="Destacar no mural"
                    checked={draft.pinned}
                    onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
                  />
                  <span>
                    <strong>Destacar no mural</strong>
                    <small>Cartões em destaque aparecem primeiro.</small>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </fieldset>
        <div className="form-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}Salvar cartão
          </Button>
        </div>
      </form>
    </Modal>
  );
}
