'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  MousePointer2,
  Hand,
  Paintbrush,
  Eraser,
  PaintBucket,
  Pipette,
  Mountain,
  CircleUserRound,
  Route,
  Pentagon,
  Type,
  Ruler,
  Undo2,
  Redo2,
  Save,
  Download,
  Layers,
  Settings2,
  SlidersHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Scan,
  Swords,
  Check as CheckIcon,
  LoaderCircle,
  ShieldCheck,
  Keyboard,
  Eye,
  EyeOff,
  Send,
} from 'lucide-react';
import { Button, ErrorBox, Field, Modal, Select } from '@/components/ui';
import { useActionNotice } from '@/components/action-notice';
import { useWorkspace } from '@/hooks/use-workspace';
import { useCampaignSessions } from '@/features/sessions/use-sessions';
import { errorMessage } from '@/lib/utils';
import { AtlasCanvas, type CanvasHandle } from './atlas-canvas';
import {
  historyCommit,
  historyUndo,
  historyRedo,
  layerFor,
  resizeAtlas,
  type AtlasHistory,
} from './model';
import { duplicateFeatures } from './generator';
import { atlasThumbnail } from './render';
import { AssetLibraryPicker } from '@/features/map-assets/library';
import {
  atlasAssetIds,
  loadAtlasImages,
  loadMapAssetImages,
  type AssetImages,
} from '@/features/map-assets/atlas-images';
import {
  AtlasConflict,
  atlasTabId,
  clearAtlasDraft,
  createAtlasMap,
  draftKey,
  findAtlasDraft,
  saveAtlasMap,
  writeAtlasDraft,
  type AtlasDraft,
} from './repository';
import {
  Check,
  INITIAL_OPTIONS,
  LayersPanel,
  MapPanel,
  NumberField,
  SelectionPanel,
  ToolPanel,
  type ToolOptions,
} from './panels';
import { downloadAtlasJson, downloadAtlasPng, sendAtlasScene } from './export';
import {
  MAX_FEATURES,
  TERRAINS,
  type AtlasDocument,
  type AtlasMap,
  type AtlasTool,
  type MapFeature,
} from './types';

const TOOLS = [
  ['select', 'Selecionar', 'V', MousePointer2],
  ['pan', 'Navegar', 'H', Hand],
  ['paint', 'Pintar terreno', 'B', Paintbrush],
  ['erase', 'Apagar terreno', 'E', Eraser],
  ['fill', 'Preencher', 'G', PaintBucket],
  ['pick', 'Conta-gotas', 'I', Pipette],
  ['symbol', 'Símbolos', 'S', Mountain],
  ['token', 'Tokens', 'T', CircleUserRound],
  ['route', 'Rotas', 'R', Route],
  ['region', 'Regiões', 'P', Pentagon],
  ['label', 'Textos', 'L', Type],
  ['measure', 'Medir', 'M', Ruler],
] as const;
const TABS = [
  ['tool', 'Ferramenta', SlidersHorizontal],
  ['selection', 'Seleção', MousePointer2],
  ['layers', 'Camadas', Layers],
  ['map', 'Mapa', Settings2],
] as const;
type Panel = (typeof TABS)[number][0];
const PublishMuralDialog = dynamic(() =>
  import('./publish-mural-dialog').then((m) => m.PublishMuralDialog),
);
const editing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]');

export function AtlasEditor({ initial, onReload }: { initial: AtlasMap; onReload(): void }) {
  const announce = useActionNotice();
  const [showRoutePoints, setShowRoutePoints] = useState(true);
  const w = useWorkspace(),
    router = useRouter(),
    canvas = useRef<CanvasHandle>(null),
    root = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<AtlasHistory>({
      present: initial.document,
      past: [],
      future: [],
    }),
    h = useRef(history);
  const base = useRef(initial),
    saved = useRef(initial.document),
    alive = useRef(true),
    flight = useRef<Promise<AtlasMap> | null>(null);
  const [tool, setTool] = useState<AtlasTool>('select'),
    [options, setOptions] = useState<ToolOptions>(INITIAL_OPTIONS),
    [selected, setSelected] = useState<string[]>([]),
    [panel, setPanel] = useState<Panel>('tool'),
    [drawer, setDrawer] = useState(true),
    [snap, setSnap] = useState(false),
    [zoom, setZoom] = useState(1),
    [status, setStatus] = useState('Selecione uma ferramenta para começar.'),
    [autosave, setAutosave] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null),
    [conflict, setConflict] = useState(false),
    [localFailure, setLocalFailure] = useState(false),
    [full, setFull] = useState(false);
  const [exporting, setExporting] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [exportWidth, setExportWidth] = useState(initial.width),
    [includeTokens, setIncludeTokens] = useState(true),
    [resizeOpen, setResizeOpen] = useState(false),
    [size, setSize] = useState({ width: initial.width, height: initial.height, scale: true }),
    [sendOpen, setSendOpen] = useState(false),
    [publishOpen, setPublishOpen] = useState(false),
    [shortcuts, setShortcuts] = useState(false),
    [copying, setCopying] = useState(false);
  const [draft, setDraft] = useState<{ key: string; draft: AtlasDraft } | null>(null),
    draftChecked = useRef(false);
  const [key] = useState(() => draftKey(w.user!.id, initial.campaign_id, initial.id, atlasTabId()));
  const failedDoc = useRef<AtlasDocument | null>(null),
    copyRequest = useRef<{ document: AtlasDocument; id: string } | null>(null),
    draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastGroup = useRef({ key: '', at: 0 });
  const doc = history.present,
    dirty = doc !== saved.current;
  const [assetImages, setAssetImages] = useState<AssetImages>({});
  const [assetError, setAssetError] = useState<string | null>(null),
    [assetRetry, setAssetRetry] = useState(0);
  const assetKey = [
    ...new Set(
      [...atlasAssetIds(doc), options.symbolAssetId, options.tokenAssetId].filter(
        (id): id is string => !!id,
      ),
    ),
  ]
    .sort()
    .join(',');
  useEffect(() => {
    let active = true;
    void loadMapAssetImages(assetKey ? assetKey.split(',') : [], w.user?.id)
      .then((images) => {
        if (active) {
          setAssetImages(images);
          setAssetError(null);
        }
      })
      .catch((e) => {
        if (active) setAssetError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [assetKey, w.user?.id, assetRetry]);
  const cache = useCallback(
    (document: AtlasDocument, immediate = false) => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      const write = () => {
        draftTimer.current = null;
        const ok = writeAtlasDraft(key, {
          base_revision: base.current.revision,
          document,
          updated_at: new Date().toISOString(),
        });
        if (alive.current) setLocalFailure(!ok);
      };
      if (immediate) write();
      else draftTimer.current = setTimeout(write, 250);
    },
    [key],
  );
  const adopt = useCallback(
    (next: AtlasHistory) => {
      h.current = next;
      setHistory(next);
      setSelected((ids) => ids.filter((id) => next.present.objects.some((o) => o.id === id)));
      if (next.present !== saved.current) cache(next.present);
      else {
        if (draftTimer.current) clearTimeout(draftTimer.current);
        clearAtlasDraft(key);
      }
    },
    [cache, key],
  );
  const commit = useCallback(
    (next: AtlasDocument, group = '') => {
      if (next === h.current.present) return;
      if (next.objects.length > MAX_FEATURES) {
        setStatus(`Este mapa aceita até ${MAX_FEATURES} elementos.`);
        return;
      }
      if (next.objects.reduce((n, o) => n + ('points' in o ? o.points.length : 0), 0) > 20000) {
        setStatus('Limite de 20.000 pontos de rotas e regiões atingido.');
        return;
      }
      const now = Date.now(),
        coalesce = group && lastGroup.current.key === group && now - lastGroup.current.at < 650;
      lastGroup.current = { key: group, at: now };
      adopt(
        coalesce ? { ...h.current, present: next, future: [] } : historyCommit(h.current, next),
      );
    },
    [adopt],
  );
  const save = useCallback(async (): Promise<AtlasMap> => {
    canvas.current?.flush();
    if (flight.current) {
      await flight.current;
      if (h.current.present !== saved.current) return save();
      return base.current;
    }
    if (h.current.present === saved.current) return base.current;
    if (conflict)
      throw new Error('Recarregue a versão salva ou salve uma cópia antes de continuar.');
    const snapshot = h.current.present,
      record = base.current;
    setSaving(true);
    setError(null);
    failedDoc.current = null;
    const job = (async () => {
      try {
        const images = await loadAtlasImages(snapshot, w.user?.id);
        const result = await saveAtlasMap(
          record,
          snapshot,
          atlasThumbnail(snapshot, images),
          w.demo,
        );
        base.current = { ...result, document: snapshot };
        saved.current = snapshot;
        if (alive.current) {
          if (h.current.present === snapshot) clearAtlasDraft(key);
          else cache(h.current.present, true);
          setStatus(
            `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
          );
        }
        return base.current;
      } catch (e) {
        failedDoc.current = snapshot;
        if (alive.current) {
          setError(errorMessage(e));
          if (e instanceof AtlasConflict) setConflict(true);
        }
        throw e;
      } finally {
        flight.current = null;
        if (alive.current) setSaving(false);
      }
    })();
    flight.current = job;
    return job;
  }, [cache, conflict, key, w.demo]);
  useEffect(() => {
    alive.current = true;
    if (!draftChecked.current) {
      draftChecked.current = true;
      const found = findAtlasDraft(draftKey(w.user!.id, initial.campaign_id, initial.id), key);
      if (found && JSON.stringify(found.draft.document) !== JSON.stringify(initial.document))
        setDraft(found);
      else if (found?.key === key) clearAtlasDraft(key);
    }
    const leaving = (e: BeforeUnloadEvent) => {
      canvas.current?.flush();
      if (h.current.present !== saved.current) {
        cache(h.current.present, true);
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', leaving);
    return () => {
      alive.current = false;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      window.removeEventListener('beforeunload', leaving);
      if (h.current.present !== saved.current)
        writeAtlasDraft(key, {
          base_revision: base.current.revision,
          document: h.current.present,
          updated_at: new Date().toISOString(),
        });
    };
  }, [cache, initial, key, w.user]);
  useEffect(() => {
    if (
      !dirty ||
      !autosave ||
      saving ||
      conflict ||
      draft ||
      !doc.title.trim() ||
      failedDoc.current === doc
    )
      return;
    const timer = setTimeout(() => void save().catch(() => {}), 1300);
    return () => clearTimeout(timer);
  }, [doc, dirty, autosave, saving, conflict, draft, save]);
  const undo = useCallback(
    (redo = false) => {
      canvas.current?.cancel();
      lastGroup.current = { key: '', at: 0 };
      adopt(redo ? historyRedo(h.current) : historyUndo(h.current));
    },
    [adopt],
  );
  const remove = useCallback(() => {
    canvas.current?.cancel();
    const ids = new Set(
      selected.filter((id) => {
        const o = h.current.present.objects.find((o) => o.id === id);
        return o && !o.locked && !layerFor(h.current.present, o.kind).locked;
      }),
    );
    if (!ids.size) {
      setStatus('Desbloqueie o elemento e a camada para excluir.');
      return;
    }
    commit({
      ...h.current.present,
      objects: h.current.present.objects.filter((o) => !ids.has(o.id)),
    });
    setSelected([]);
    setStatus(`${ids.size} elemento(s) excluído(s). Você pode desfazer.`);
  }, [commit, selected]);
  const duplicate = useCallback(() => {
    const d = h.current.present,
      objects = d.objects.filter(
        (o) => selected.includes(o.id) && !o.locked && !layerFor(d, o.kind).locked,
      );
    const copies = objects.map((o) => duplicateFeatures([o], o.id, d.width, d.height).at(-1)!);
    if (d.objects.length + copies.length > MAX_FEATURES) {
      setStatus('Limite de elementos atingido.');
      return;
    }
    commit({ ...d, objects: [...d.objects, ...copies] });
    setSelected(copies.map((o) => o.id));
  }, [commit, selected]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        (document.activeElement as HTMLElement)?.blur();
        void save().catch(() => {});
        return;
      }
      if (editing(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'd'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'd') duplicate();
        else undo(e.shiftKey || e.key.toLowerCase() === 'y');
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
        return;
      }
      const found = TOOLS.find((t) => t[2].toLowerCase() === e.key.toLowerCase());
      if (found) {
        canvas.current?.cancel();
        setTool(found[0]);
        setPanel(found[0] === 'select' ? 'selection' : 'tool');
        setDrawer(true);
      }
      if (e.key === '0') {
        e.preventDefault();
        canvas.current?.fit();
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [duplicate, remove, save, undo]);
  useEffect(() => {
    const update = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  async function copy(document: AtlasDocument = h.current.present) {
    setCopying(true);
    setError(null);
    try {
      const next = { ...document, title: `${document.title.slice(0, 110)} · cópia` };
      if (copyRequest.current?.document !== document)
        copyRequest.current = { document, id: crypto.randomUUID() };
      const result = await createAtlasMap(
        initial.campaign_id,
        next,
        atlasThumbnail(next, await loadAtlasImages(next, w.user?.id)),
        w.demo,
        copyRequest.current.id,
      );
      if (alive.current) {
        clearAtlasDraft(key);
        if (draft) clearAtlasDraft(draft.key);
        saved.current = h.current.present;
        router.push(`/campanhas/${initial.campaign_id}/mapas/${result.id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCopying(false);
    }
  }
  function changeFeature(next: MapFeature) {
    const d = h.current.present,
      old = d.objects.find((o) => o.id === next.id);
    if (!old) return;
    if (layerFor(d, old.kind).locked) {
      setStatus('Desbloqueie a camada para editar este elemento.');
      return;
    }
    commit(
      { ...d, objects: d.objects.map((o) => (o.id === next.id ? next : o)) },
      `feature:${next.id}`,
    );
  }
  function choose(ids: string[]) {
    setSelected(ids);
    if (ids.length) {
      if (tool === 'route' || tool === 'region') setTool('select');
      setPanel('selection');
      setDrawer(true);
    }
  }
  const portal = full ? root.current : undefined;
  return (
    <div className="atlas-editor" ref={root}>
      <header className="atlas-editor-header">
        <Link
          className="atlas-back"
          href={`/campanhas/${initial.campaign_id}/mapas`}
          aria-label="Voltar à biblioteca de mapas"
        >
          <ArrowLeft size={19} />
        </Link>
        <div className="atlas-document-heading">
          <span className="eyebrow">OFICINA DE MAPAS</span>
          <h1 title={doc.title}>{doc.title || 'Mapa sem nome'}</h1>
          <span className="atlas-save-state" role="status">
            {saving ? (
              <>
                <LoaderCircle className="spin" size={12} />
                Salvando…
              </>
            ) : dirty ? (
              'Alterações pendentes'
            ) : (
              <>
                <CheckIcon size={12} />
                Salvo
              </>
            )}
          </span>
        </div>
        <div className="atlas-header-actions">
          <Button
            variant="secondary"
            aria-label="Salvar"
            onClick={() => void save().catch(() => {})}
            disabled={saving || conflict}
            disabledReason={
              conflict ? 'Resolva o conflito antes de salvar.' : 'O salvamento está em andamento.'
            }
          >
            <Save size={16} />
            <span>Salvar</span>
          </Button>
          <Button
            variant="secondary"
            aria-label="Exportar"
            onClick={() => {
              canvas.current?.flush();
              setExportOpen(true);
            }}
          >
            <Download size={16} />
            <span>Exportar</span>
          </Button>
          <Button
            variant="secondary"
            aria-label="Enviar ao mural"
            title="Enviar ao mural"
            onClick={() => {
              canvas.current?.flush();
              setPublishOpen(true);
            }}
          >
            <Send size={16} />
            <span>Enviar ao mural</span>
          </Button>
          <Button aria-label="Usar na Mesa" onClick={() => setSendOpen(true)}>
            <Swords size={16} />
            <span>Usar na Mesa</span>
          </Button>
        </div>
      </header>
      {draft && (
        <div className="atlas-notice">
          <div>
            <strong>Há um rascunho local recuperável.</strong>
            <p>
              {draft.draft.base_revision === base.current.revision
                ? 'Ele contém alterações que ainda não chegaram ao salvamento.'
                : 'O mapa salvo mudou desde esse rascunho. Guarde uma cópia para preservar as duas versões.'}
            </p>
          </div>
          <div className="atlas-inline-actions">
            {draft.draft.base_revision === base.current.revision ? (
              <Button
                onClick={() => {
                  commit(draft.draft.document);
                  if (draft.key !== key) clearAtlasDraft(draft.key);
                  setDraft(null);
                }}
              >
                Recuperar rascunho
              </Button>
            ) : (
              <Button disabled={copying} onClick={() => void copy(draft.draft.document)}>
                Salvar rascunho como cópia
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                clearAtlasDraft(draft.key);
                setDraft(null);
              }}
            >
              Descartar rascunho
            </Button>
          </div>
        </div>
      )}
      {assetError && (
        <div className="atlas-error">
          <ErrorBox message={assetError} />
          <Button type="button" variant="secondary" onClick={() => setAssetRetry((n) => n + 1)}>
            Tentar carregar imagens
          </Button>
        </div>
      )}
      {error && (
        <div className="atlas-error">
          <ErrorBox message={error} />
          {conflict && (
            <div className="atlas-inline-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  clearAtlasDraft(key);
                  saved.current = h.current.present;
                  onReload();
                }}
              >
                Carregar versão salva
              </Button>
              <Button onClick={() => void copy()} disabled={copying}>
                Salvar minhas alterações como cópia
              </Button>
            </div>
          )}
        </div>
      )}
      {localFailure && (
        <p className="atlas-local-warning">
          O navegador não conseguiu guardar o rascunho local. Salve no servidor ou exporte um backup
          antes de sair.
        </p>
      )}
      <div className="atlas-command-bar">
        <div className="atlas-inline-actions">
          <button
            type="button"
            aria-label="Desfazer"
            title="Desfazer · Ctrl Z"
            disabled={!history.past.length}
            onClick={() => undo()}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            aria-label="Refazer"
            title="Refazer · Ctrl Shift Z"
            disabled={!history.future.length}
            onClick={() => undo(true)}
          >
            <Redo2 size={17} />
          </button>
          <span className="atlas-command-divider" />
          {(tool === 'route' ||
            doc.objects.some((o) => selected.includes(o.id) && o.kind === 'route')) && (
            <button
              type="button"
              aria-label={showRoutePoints ? 'Ocultar pontos das rotas' : 'Mostrar pontos das rotas'}
              aria-pressed={!showRoutePoints}
              onClick={() => setShowRoutePoints((v) => !v)}
            >
              {showRoutePoints ? <EyeOff size={16} /> : <Eye size={16} />}
              {showRoutePoints ? 'Ocultar pontos' : 'Mostrar pontos'}
            </button>
          )}
          <ShieldCheck size={14} />
          <span className="atlas-privacy">Privado do mestre</span>
        </div>
        <div className="atlas-inline-actions">
          <Check label="Salvar automaticamente" checked={autosave} onChange={setAutosave} />
          <button
            type="button"
            aria-label="Atalhos do editor"
            title="Atalhos"
            onClick={() => setShortcuts(true)}
          >
            <Keyboard size={17} />
          </button>
          <button
            type="button"
            aria-label={full ? 'Sair da tela cheia' : 'Tela cheia'}
            onClick={() => {
              const action = full ? document.exitFullscreen() : root.current?.requestFullscreen();
              void action?.catch(() => setStatus('Este navegador não permite tela cheia.'));
            }}
          >
            {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          <button
            type="button"
            aria-label={drawer ? 'Recolher painel' : 'Abrir painel'}
            aria-expanded={drawer}
            aria-controls="atlas-inspector"
            onClick={() => setDrawer((v) => !v)}
          >
            {drawer ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </div>
      <div className={`atlas-workspace ${drawer ? 'with-panel' : ''}`}>
        <nav className="atlas-tool-rail" aria-label="Ferramentas do mapa">
          {TOOLS.map(([id, label, key, Icon]) => (
            <button
              type="button"
              key={id}
              title={`${label} · ${key}`}
              aria-label={label}
              aria-pressed={tool === id}
              onClick={() => {
                canvas.current?.cancel();
                setTool(id);
                setPanel(id === 'select' ? 'selection' : 'tool');
                setDrawer(true);
              }}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="atlas-stage">
          <AtlasCanvas
            ref={canvas}
            document={doc}
            assetImages={assetImages}
            tool={tool}
            {...options}
            selected={selected}
            showRoutePoints={showRoutePoints}
            snap={snap}
            onCommit={(next) => {
              const old = h.current.present;
              commit(next);
              if (next.objects.length > old.objects.length && next.objects.at(-1)?.kind === 'token')
                setOptions((o) => ({ ...o, tokenNumber: Math.min(999, o.tokenNumber + 1) }));
            }}
            onSelect={choose}
            onStatus={setStatus}
            onZoom={setZoom}
            onPick={(terrain, elevation) => {
              setOptions((o) => ({ ...o, brush: { ...o.brush, terrain, elevation } }));
              setTool('paint');
              setPanel('tool');
              setDrawer(true);
              setStatus(`Terreno selecionado: ${TERRAINS[terrain].name}.`);
            }}
          />
          <div className="atlas-view-controls">
            <button
              type="button"
              aria-label="Diminuir zoom"
              onClick={() => canvas.current?.zoom(1 / 1.25)}
            >
              <Minus size={16} />
            </button>
            <output aria-label="Zoom do mapa">{Math.round(zoom * 100)}%</output>
            <button
              type="button"
              aria-label="Aumentar zoom"
              onClick={() => canvas.current?.zoom(1.25)}
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              aria-label="Enquadrar mapa"
              title="Enquadrar · 0"
              onClick={() => canvas.current?.fit()}
            >
              <Scan size={16} />
            </button>
            <span />
            <button
              type="button"
              aria-label="Encaixar na malha"
              aria-pressed={snap}
              title="Encaixar elementos nas células de terreno"
              onClick={() => setSnap((v) => !v)}
            >
              Encaixe
            </button>
          </div>
        </div>
        {drawer && (
          <aside className="atlas-inspector" id="atlas-inspector" aria-label="Propriedades do mapa">
            <div className="atlas-inspector-tabs" role="tablist" aria-label="Painéis do editor">
              {TABS.map(([id, label, Icon]) => (
                <button
                  type="button"
                  role="tab"
                  key={id}
                  id={`atlas-tab-${id}`}
                  aria-controls="atlas-panel"
                  aria-selected={panel === id}
                  tabIndex={panel === id ? 0 : -1}
                  onClick={() => {
                    setPanel(id);
                    if (id === 'selection') {
                      canvas.current?.cancel();
                      setTool('select');
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                    e.preventDefault();
                    const i = TABS.findIndex((t) => t[0] === panel),
                      next = TABS[(i + (e.key === 'ArrowRight' ? 1 : 3)) % 4][0];
                    setPanel(next);
                    if (next === 'selection') {
                      canvas.current?.cancel();
                      setTool('select');
                    }
                    document.getElementById(`atlas-tab-${next}`)?.focus();
                  }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div
              className="atlas-panel-content"
              id="atlas-panel"
              role="tabpanel"
              aria-labelledby={`atlas-tab-${panel}`}
              tabIndex={0}
            >
              {panel === 'tool' && (
                <>
                  <h2>{TOOLS.find((t) => t[0] === tool)?.[1]}</h2>
                  {(tool === 'symbol' || tool === 'token') && (
                    <AssetLibraryPicker
                      kind={tool}
                      onSelect={(asset) =>
                        setOptions((o) =>
                          tool === 'symbol'
                            ? { ...o, symbolAssetId: asset.id, symbolAssetName: asset.name }
                            : { ...o, tokenAssetId: asset.id, tokenName: asset.name },
                        )
                      }
                    />
                  )}
                  {((tool === 'symbol' && options.symbolAssetId) ||
                    (tool === 'token' && options.tokenAssetId)) && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setOptions((o) =>
                          tool === 'symbol'
                            ? { ...o, symbolAssetId: undefined, symbolAssetName: undefined }
                            : { ...o, tokenAssetId: undefined },
                        )
                      }
                    >
                      Usar desenho padrão
                    </Button>
                  )}
                  <ToolPanel
                    tool={tool}
                    options={options}
                    onChange={(patch) => setOptions((o) => ({ ...o, ...patch }))}
                    document={doc}
                    onDocument={commit}
                    characters={w.data.characters.filter(
                      (c) => c.campaign_id === initial.campaign_id,
                    )}
                    onFinish={() => canvas.current?.finishPath()}
                    onCancel={() => canvas.current?.cancel()}
                  />
                </>
              )}
              {panel === 'selection' && (
                <>
                  <h2>Seleção</h2>
                  <SelectionPanel
                    ids={selected}
                    document={doc}
                    onChange={changeFeature}
                    onDelete={remove}
                    onDuplicate={duplicate}
                    onSelect={setSelected}
                  />
                </>
              )}
              {panel === 'layers' && (
                <>
                  <h2>Camadas e elementos</h2>
                  <LayersPanel
                    document={doc}
                    onDocument={commit}
                    onSelect={(ids) => {
                      setTool('select');
                      choose(ids);
                    }}
                  />
                </>
              )}
              {panel === 'map' && (
                <>
                  <h2>Configurações do mapa</h2>
                  <MapPanel
                    document={doc}
                    onDocument={commit}
                    onResize={() => {
                      setSize({ width: doc.width, height: doc.height, scale: true });
                      setResizeOpen(true);
                    }}
                  />
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      <footer className="atlas-editor-footer">
        <p role="status" aria-live="polite">
          {status}
        </p>
        <span>
          {doc.width} × {doc.height} · {doc.objects.length} elementos
        </span>
      </footer>
      <Modal
        open={exportOpen}
        onClose={() => {
          if (!exporting) setExportOpen(false);
        }}
        title="Exportar mapa"
        description="Guarde uma imagem ou um backup para continuar editando depois."
        portalContainer={portal}
      >
        <div className="atlas-options">
          <Field label="Largura da imagem">
            <Select value={exportWidth} onChange={(e) => setExportWidth(Number(e.target.value))}>
              {[...new Set([1024, 2048, doc.width])]
                .sort((a, b) => a - b)
                .map((v) => (
                  <option key={v} value={v}>
                    {v.toLocaleString('pt-BR')} px{v === doc.width ? ' · original' : ''}
                  </option>
                ))}
            </Select>
          </Field>
          <Check
            label="Incluir tokens visíveis na imagem"
            checked={includeTokens}
            onChange={setIncludeTokens}
          />
          <p className="atlas-hint">
            O PNG inclui as camadas visíveis. As notas privadas ficam fora da imagem. O backup
            editável inclui todas as camadas e as notas do mestre.
          </p>
          <div className="atlas-panel-actions">
            <Button
              disabled={exporting}
              onClick={() => {
                setExporting(true);
                setError(null);
                void downloadAtlasPng(h.current.present, exportWidth, includeTokens)
                  .then(() =>
                    announce(
                      'Download concluído: mapa PNG gerado e enviado ao navegador.',
                      'success',
                    ),
                  )
                  .catch((e) => setError(errorMessage(e)))
                  .finally(() => setExporting(false));
              }}
            >
              <Download size={16} />
              {exporting ? 'Gerando imagem…' : 'Baixar PNG'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                try {
                  downloadAtlasJson(h.current.present);
                  announce('Download concluído: backup editável enviado ao navegador.', 'success');
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Backup editável (.json)
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={resizeOpen}
        onClose={() => setResizeOpen(false)}
        title="Redimensionar mapa"
        description="A alteração pode ser desfeita. O tamanho máximo é 4.096 × 4.096."
        portalContainer={portal}
      >
        <div className="atlas-options">
          <div className="atlas-two-fields">
            <NumberField
              label="Largura"
              value={size.width}
              min={320}
              max={4096}
              onChange={(width) => setSize((v) => ({ ...v, width: Math.round(width) }))}
            />
            <NumberField
              label="Altura"
              value={size.height}
              min={320}
              max={4096}
              onChange={(height) => setSize((v) => ({ ...v, height: Math.round(height) }))}
            />
          </div>
          <Check
            label="Ajustar terreno e elementos ao novo tamanho"
            checked={size.scale}
            onChange={(scale) => setSize((v) => ({ ...v, scale }))}
          />
          <p className="atlas-hint">
            Desmarque para ampliar a área de desenho mantendo o conteúdo no mesmo tamanho. Ao
            reduzir a área, o terreno externo é cortado.
          </p>
          <Button
            onClick={() => {
              try {
                canvas.current?.flush();
                commit(resizeAtlas(h.current.present, size.width, size.height, size.scale));
                setResizeOpen(false);
                requestAnimationFrame(() => canvas.current?.fit());
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Aplicar dimensões
          </Button>
        </div>
      </Modal>
      <Modal
        open={shortcuts}
        onClose={() => setShortcuts(false)}
        title="Atalhos da oficina"
        portalContainer={portal}
      >
        <div className="atlas-shortcuts">
          {TOOLS.map(([, label, key]) => (
            <div key={key}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
          {[
            ['Desfazer / refazer', 'Ctrl Z / Ctrl Shift Z'],
            ['Salvar', 'Ctrl S'],
            ['Duplicar seleção', 'Ctrl D'],
            ['Excluir seleção', 'Delete'],
            ['Selecionar vários', 'Shift + clique'],
            ['Concluir rota / região', 'Enter'],
            ['Cancelar traçado', 'Esc'],
            ['Mover a vista', 'Espaço + arrastar'],
            ['Enquadrar mapa', '0'],
          ].map(([label, key]) => (
            <div key={key}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
      </Modal>
      {sendOpen && (
        <SendDialog
          map={base.current}
          demo={w.demo}
          portal={portal}
          onClose={() => setSendOpen(false)}
          onSave={save}
        />
      )}
      {publishOpen && (
        <PublishMuralDialog
          map={base.current}
          portal={portal}
          onClose={() => setPublishOpen(false)}
          onSave={save}
        />
      )}
    </div>
  );
}

function SendDialog({
  map,
  demo,
  portal,
  onClose,
  onSave,
}: {
  map: AtlasMap;
  demo: boolean;
  portal?: HTMLElement | null;
  onClose(): void;
  onSave(): Promise<AtlasMap>;
}) {
  const sessions = useCampaignSessions(map.campaign_id, true),
    eligible = sessions.items.filter((s) => s.status !== 'ended');
  const [chapter, setChapter] = useState(''),
    [cols, setCols] = useState(32),
    [rows, setRows] = useState(Math.max(4, Math.round((32 * map.height) / map.width))),
    [scale, setScale] = useState(1.5),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState<string | null>(null),
    [created, setCreated] = useState<string | null>(null);
  useEffect(() => {
    if (!chapter && eligible.length) setChapter(eligible[0].id);
  }, [chapter, eligible]);
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Usar mapa na Mesa"
      description="Crie um cenário em um capítulo da campanha com a arte deste mapa como fundo."
      portalContainer={portal}
    >
      <div className="atlas-options">
        {demo ? (
          <p>
            O envio à Mesa fica disponível com o Supabase conectado. Na demonstração, você pode
            exportar o mapa em PNG.
          </p>
        ) : created ? (
          <>
            <p className="atlas-success">
              <CheckIcon size={20} />
              Cenário criado com a imagem confirmada.
            </p>
            <Link className="button button-gold" href={`/campanhas/${map.campaign_id}/mesa/grid`}>
              Abrir Mesa
            </Link>
            <p className="atlas-hint">Selecione “{created}” no menu de cenários da Mesa.</p>
          </>
        ) : (
          <>
            <ErrorBox message={error || sessions.error} />
            <Field label="Capítulo de destino">
              <Select
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                disabled={busy || sessions.loading}
              >
                <option value="">
                  {sessions.loading ? 'Carregando capítulos…' : 'Escolher capítulo'}
                </option>
                {eligible.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.status === 'active' ? ' · em andamento' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {!sessions.loading && !eligible.length && (
              <Link href={`/campanhas/${map.campaign_id}/sessoes`}>
                Crie um capítulo para receber este cenário.
              </Link>
            )}
            <div className="atlas-two-fields">
              <NumberField
                label="Colunas do grid"
                value={cols}
                min={4}
                max={200}
                onChange={(v) => setCols(Math.round(v))}
              />
              <NumberField
                label="Linhas do grid"
                value={rows}
                min={4}
                max={200}
                onChange={(v) => setRows(Math.round(v))}
              />
            </div>
            <NumberField
              label="Metros por célula na Mesa"
              value={scale}
              min={0.1}
              max={10000}
              step={0.1}
              onChange={setScale}
            />
            <p className="atlas-hint">
              A arte mantém sua proporção no cenário. Tokens de planejamento, grade da oficina,
              barra de escala e notas privadas ficam fora da imagem. Coloque as peças de combate na
              Mesa.
            </p>
            <Button
              disabled={busy || !chapter || sessions.loading}
              disabledReason={
                !chapter ? 'Escolha um capítulo de destino.' : 'Aguarde o envio terminar.'
              }
              onClick={() => {
                setBusy(true);
                setError(null);
                setStatus('Salvando o mapa…');
                void onSave()
                  .then((saved) => sendAtlasScene(saved, chapter, cols, rows, scale, setStatus))
                  .then((result) => setCreated(result.name))
                  .catch((e) => setError(errorMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <Swords size={16} />}Criar
              cenário na Mesa
            </Button>
            <p role="status" className="atlas-hint">
              {status}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
