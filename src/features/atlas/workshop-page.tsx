'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Upload,
  Map as MapIcon,
  Mountain,
  Route,
  Layers,
  ArrowUpRight,
  Copy,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { Campaign } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { PageHeading } from '@/components/shell';
import {
  Button,
  Confirm,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  Select,
} from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { generateAtlas } from './generator';
import { parseAtlasFile } from './model';
import { atlasThumbnail, exportAtlasCanvas } from './render';
import { createAtlasMap, deleteAtlasMap, getAtlasMap, listAtlasMaps } from './repository';
import { AtlasEditor } from './editor';
import { NumberField } from './panels';
import {
  TEMPLATES,
  type AtlasDocument,
  type AtlasMap,
  type AtlasSummary,
  type Template,
} from './types';
import './atlas.css';

export function AtlasWorkshop({ campaign, mapId }: { campaign?: Campaign; mapId?: string }) {
  const w = useWorkspace();
  if (w.loading) return <Loading />;
  if (campaign ? campaign.owner_id !== w.user?.id : w.mode !== 'master')
    return (
      <Empty
        title="Oficina reservada ao mestre"
        description="O mestre da campanha cria e organiza os mapas por aqui."
      />
    );
  if (mapId && campaign) return <OpenMap key={mapId} id={mapId} campaign={campaign} />;
  return <MapLibrary campaign={campaign} />;
}
function OpenMap({ id, campaign }: { id: string; campaign: Campaign }) {
  const w = useWorkspace(),
    [map, setMap] = useState<AtlasMap | null>(null),
    [error, setError] = useState<string | null>(null),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let current = true;
    setMap(null);
    setError(null);
    void getAtlasMap(id, campaign.id, w.demo)
      .then((m) => {
        if (current) setMap(m);
      })
      .catch((e) => {
        if (current) setError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, [id, campaign.id, w.demo, w.user?.id, epoch]);
  if (error)
    return (
      <>
        <ErrorBox message={error} />
        <div className="atlas-inline-actions">
          <Button onClick={() => setEpoch((n) => n + 1)}>Tentar novamente</Button>
          <Link className="button button-secondary" href={`/campanhas/${campaign.id}/mapas`}>
            Voltar à biblioteca
          </Link>
        </div>
      </>
    );
  if (!map) return <Loading />;
  return (
    <AtlasEditor key={`${id}:${epoch}`} initial={map} onReload={() => setEpoch((n) => n + 1)} />
  );
}
function MapLibrary({ campaign }: { campaign?: Campaign }) {
  const [hero] = useState(() =>
    generateAtlas('island', 960, 640, 'hero-ventobravo', 'Terras de Ventobravo'),
  );
  const w = useWorkspace(),
    router = useRouter(),
    owned = w.data.campaigns.filter((c) => c.owner_id === w.user?.id);
  const [filter, setFilter] = useState(campaign?.id ?? ''),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [items, setItems] = useState<AtlasSummary[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [version, setVersion] = useState(0),
    [create, setCreate] = useState(false),
    [remove, setRemove] = useState<AtlasSummary | null>(null),
    [busy, setBusy] = useState(false),
    [imported, setImported] = useState<AtlasDocument | null>(null),
    file = useRef<HTMLInputElement>(null),
    copyRequests = useRef(new Map<string, string>());
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listAtlasMaps(filter || undefined, query, page, w.demo)
      .then((result) => {
        if (active) {
          setItems(result.items);
          setTotal(result.total);
          if (page > 0 && !result.items.length && result.total)
            setPage(Math.max(0, Math.ceil(result.total / 12) - 1));
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter, query, page, w.demo, w.user?.id, version]);
  async function duplicate(item: AtlasSummary) {
    setBusy(true);
    setError(null);
    try {
      const original = await getAtlasMap(item.id, item.campaign_id, w.demo),
        d = { ...original.document, title: `${original.document.title.slice(0, 110)} · cópia` };
      const key = `${original.id}:${original.revision}`;
      if (!copyRequests.current.has(key)) copyRequests.current.set(key, crypto.randomUUID());
      const next = await createAtlasMap(
        item.campaign_id,
        d,
        atlasThumbnail(d),
        w.demo,
        copyRequests.current.get(key),
      );
      router.push(`/campanhas/${item.campaign_id}/mapas/${next.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="atlas-library">
      <PageHeading
        eyebrow="CARTOGRAFIA DO MESTRE"
        title="Oficina de mapas"
        description="Dê forma aos lugares que a sua aventura ainda vai descobrir."
        action={
          <div className="atlas-inline-actions">
            <Button
              variant="secondary"
              disabled={busy || !owned.length}
              disabledReason="Crie uma campanha para organizar seus mapas."
              onClick={() => file.current?.click()}
            >
              <Upload size={16} />
              Importar
            </Button>
            <Button
              disabled={!owned.length}
              disabledReason="Crie uma campanha para começar seu mapa."
              onClick={() => {
                setImported(null);
                setCreate(true);
              }}
            >
              <Plus size={17} />
              Criar mapa
            </Button>
          </div>
        }
      />
      <input
        type="file"
        className="sr-only"
        ref={file}
        accept=".json,application/json"
        aria-label="Importar backup de mapa"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (!picked) return;
          if (picked.size > 2000000) {
            setError('O arquivo do mapa deve ter até 2 MB.');
            return;
          }
          void picked
            .text()
            .then(parseAtlasFile)
            .then((d) => {
              setImported(d);
              setCreate(true);
            })
            .catch((err) => setError(errorMessage(err)));
        }}
      />
      <section className="atlas-hero">
        <div>
          <span className="eyebrow">UM MUNDO, À SUA MANEIRA</span>
          <h2>
            Da primeira ilha
            <br />
            ao último esconderijo.
          </h2>
          <p>
            Pinte biomas, desenhe caminhos e preencha seu mundo com cidades, montanhas e encontros.
            Tudo em um espaço privado para o mestre.
          </p>
          <div className="atlas-hero-tags">
            <span>
              <Mountain size={15} />
              22 terrenos
            </span>
            <span>
              <Route size={15} />
              Rotas editáveis
            </span>
            <span>
              <Layers size={15} />6 camadas
            </span>
          </div>
        </div>
        <AtlasPreview document={hero} className="atlas-hero-map" />
      </section>
      <div className="atlas-library-toolbar">
        <div className="atlas-search">
          <Search size={17} />
          <Input
            aria-label="Buscar mapas"
            placeholder="Buscar nos seus mapas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!campaign && (
          <Select
            aria-label="Filtrar mapas por campanha"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas as campanhas</option>
            {owned.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <span>
          {total} {total === 1 ? 'mapa' : 'mapas'}
        </span>
        <Button
          variant="ghost"
          aria-label="Atualizar biblioteca de mapas"
          onClick={() => setVersion((n) => n + 1)}
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : !items.length ? (
        <Empty
          title={owned.length ? 'Seu próximo mundo começa aqui.' : 'Primeiro, uma campanha.'}
          description={
            query
              ? 'Nenhum mapa corresponde à busca.'
              : owned.length
                ? 'Escolha um modelo para começar ou importe um backup da oficina.'
                : 'Crie uma campanha para guardar seus mapas e levá-los à Mesa.'
          }
          action={
            owned.length ? (
              <Button
                onClick={() => {
                  setImported(null);
                  setCreate(true);
                }}
              >
                Criar primeiro mapa
              </Button>
            ) : (
              <Link className="button button-gold" href="/campanhas">
                Ir às campanhas
              </Link>
            )
          }
        />
      ) : (
        <div className="atlas-map-grid">
          {items.map((item) => (
            <article className="atlas-map-card" key={item.id}>
              <Link
                href={`/campanhas/${item.campaign_id}/mapas/${item.id}`}
                className="atlas-map-cover"
                aria-label={`Editar mapa ${item.name}`}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" loading="lazy" />
                ) : (
                  <MapIcon size={56} />
                )}
                <span className="atlas-map-open">
                  Editar mapa <ArrowUpRight size={16} />
                </span>
              </Link>
              <div className="atlas-card-body">
                <span className="eyebrow">
                  {TEMPLATES.find((t) => t.id === item.template)?.name ?? 'Mapa'}
                </span>
                <Link href={`/campanhas/${item.campaign_id}/mapas/${item.id}`}>
                  <h3>{item.name}</h3>
                </Link>
                <p>{owned.find((c) => c.id === item.campaign_id)?.name ?? 'Campanha'}</p>
                <div>
                  <small>
                    {item.width} × {item.height} ·{' '}
                    {new Date(item.updated_at).toLocaleDateString('pt-BR')}
                  </small>
                  <div className="atlas-mini-actions">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Duplicar mapa ${item.name}`}
                      title="Duplicar"
                      onClick={() => void duplicate(item)}
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Excluir mapa ${item.name}`}
                      title="Excluir"
                      onClick={() => setRemove(item)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {total > 12 && (
        <div className="atlas-pagination">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
            <ChevronLeft size={15} />
            Anterior
          </Button>
          <span>
            Página {page + 1} de {Math.ceil(total / 12)}
          </span>
          <Button
            variant="secondary"
            disabled={(page + 1) * 12 >= total}
            onClick={() => setPage((n) => n + 1)}
          >
            Próxima
            <ChevronRight size={15} />
          </Button>
        </div>
      )}
      <p className="atlas-library-footnote">
        <ShieldCheck size={15} />
        Mapas e notas ficam privados na oficina. Você decide qual imagem usar na Mesa ou exportar.
      </p>
      {create && (
        <CreateDialog
          campaigns={owned}
          initialCampaign={campaign?.id ?? filter}
          imported={imported}
          onClose={() => setCreate(false)}
          onCreate={async (cid, doc, id) => {
            const next = await createAtlasMap(cid, doc, atlasThumbnail(doc), w.demo, id);
            router.push(`/campanhas/${cid}/mapas/${next.id}`);
          }}
        />
      )}
      <Confirm
        open={!!remove}
        title="Excluir este mapa?"
        description={`“${remove?.name ?? ''}” será removido da oficina. Cenários já enviados à Mesa continuam disponíveis.`}
        onCancel={() => setRemove(null)}
        onConfirm={async () => {
          if (!remove) return;
          try {
            await deleteAtlasMap(remove, w.demo);
            setRemove(null);
            setVersion((n) => n + 1);
          } catch (e) {
            setError(errorMessage(e));
            setRemove(null);
          }
        }}
      />
    </div>
  );
}
function AtlasPreview({
  document: d,
  className = '',
}: {
  document: AtlasDocument;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    const draw = () => {
      if (!active || !ref.current) return;
      const image = exportAtlasCanvas(d, 800);
      ref.current.width = image.width;
      ref.current.height = image.height;
      ref.current.getContext('2d')?.drawImage(image, 0, 0);
    };
    draw();
    void document.fonts.ready.then(draw);
    return () => {
      active = false;
    };
  }, [d]);
  return (
    <canvas ref={ref} className={className} role="img" aria-label={`Prévia do mapa ${d.title}`} />
  );
}
function CreateDialog({
  campaigns,
  initialCampaign,
  imported,
  onClose,
  onCreate,
}: {
  campaigns: Campaign[];
  initialCampaign: string;
  imported: AtlasDocument | null;
  onClose(): void;
  onCreate(cid: string, d: AtlasDocument, id: string): Promise<void>;
}) {
  const [cid, setCid] = useState(initialCampaign || campaigns[0]?.id || ''),
    [template, setTemplate] = useState<Template>('island'),
    [title, setTitle] = useState(imported?.title ?? 'Terras de Ventobravo'),
    [seed, setSeed] = useState('Ventobravo'),
    [size, setSize] = useState({ width: 1600, height: 1024 }),
    [preview, setPreview] = useState(() => imported ?? generateAtlas()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const creation = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    if (imported) {
      setPreview({ ...imported, title });
      return;
    }
    const timer = setTimeout(
      () =>
        setPreview(generateAtlas(template, size.width, size.height, seed, title || 'Novo mapa')),
      220,
    );
    return () => clearTimeout(timer);
  }, [template, size, seed, title, imported]);
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={imported ? 'Importar mapa' : 'Criar um novo mapa'}
      description={
        imported
          ? 'Seu backup será importado como um novo mapa da campanha.'
          : 'Escolha um ponto de partida. Todos os detalhes poderão ser editados.'
      }
      wide
    >
      <div className="atlas-create-layout">
        <div className="atlas-options">
          <ErrorBox message={error} />
          <Field label="Campanha do mapa">
            <Select value={cid} disabled={busy} onChange={(e) => setCid(e.target.value)}>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nome do novo mapa">
            <Input
              autoFocus
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </Field>
          {!imported && (
            <>
              <div className="atlas-template-grid" role="group" aria-label="Modelos de mapa">
                {TEMPLATES.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    aria-pressed={template === t.id}
                    onClick={() => setTemplate(t.id)}
                  >
                    <strong>{t.name}</strong>
                    <small>{t.description}</small>
                  </button>
                ))}
              </div>
              <details className="atlas-disclosure">
                <summary>Geração e dimensões</summary>
                <div className="atlas-options">
                  <Field
                    label="Semente do mapa"
                    hint="A mesma semente e dimensões reproduzem o mesmo terreno."
                  >
                    <Input maxLength={80} value={seed} onChange={(e) => setSeed(e.target.value)} />
                  </Field>
                  <Button variant="ghost" onClick={() => setSeed(crypto.randomUUID().slice(0, 12))}>
                    Sortear outro terreno
                  </Button>
                  <div className="atlas-two-fields">
                    <NumberField
                      label="Largura inicial"
                      value={size.width}
                      min={320}
                      max={4096}
                      onChange={(width) => setSize((s) => ({ ...s, width: Math.round(width) }))}
                    />
                    <NumberField
                      label="Altura inicial"
                      value={size.height}
                      min={320}
                      max={4096}
                      onChange={(height) => setSize((s) => ({ ...s, height: Math.round(height) }))}
                    />
                  </div>
                </div>
              </details>
            </>
          )}
          <Button
            disabled={busy || !title.trim() || !cid}
            disabledReason={
              !title.trim() ? 'Dê um nome ao mapa.' : 'Escolha uma campanha e aguarde a criação.'
            }
            onClick={() => {
              setBusy(true);
              setError(null);
              const d = imported
                ? { ...imported, title: title.trim() }
                : generateAtlas(template, size.width, size.height, seed, title.trim());
              const signature = JSON.stringify([cid, d]);
              if (creation.current?.signature !== signature)
                creation.current = { signature, id: crypto.randomUUID() };
              void onCreate(cid, d, creation.current.id).catch((e) => {
                setError(errorMessage(e));
                setBusy(false);
              });
            }}
          >
            <Plus size={16} />
            {busy ? 'Criando mapa…' : imported ? 'Importar e abrir editor' : 'Criar e abrir editor'}
          </Button>
        </div>
        <div className="atlas-create-preview">
          <AtlasPreview document={preview} />
          <span>PRÉVIA DO SEU MAPA</span>
          <p>
            {imported
              ? 'Camadas, elementos e notas do backup serão preservados.'
              : 'Um ponto de partida para o mundo que só você conhece.'}
          </p>
        </div>
      </div>
    </Modal>
  );
}
