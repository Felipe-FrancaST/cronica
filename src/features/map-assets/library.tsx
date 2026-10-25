'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Pencil,
  RefreshCw,
  Mountain,
  Shapes,
  CircleUserRound,
  ChevronDown,
} from 'lucide-react';
import { Button, ErrorBox, Field, Input, Modal, Select, Loading } from '@/components/ui';
import { ImageField } from '@/components/media';
import { useWorkspace } from '@/hooks/use-workspace';
import { useActionNotice } from '@/components/action-notice';
import { errorMessage } from '@/lib/utils';
import { assetUrls, listMapAssets, updateMapAsset, uploadMapAsset } from './repository';
import { ASSET_LABELS, type MapAsset, type MapAssetKind, type MapAssetScope } from './types';

export function MapAssetLibrary({
  kind,
  admin = false,
  backgrounds = false,
  onSelect,
}: {
  kind: MapAssetKind;
  admin?: boolean;
  backgrounds?: boolean;
  onSelect?(asset: MapAsset): void;
}) {
  const { demo, user } = useWorkspace(),
    announce = useActionNotice();
  const [scope, setScope] = useState<MapAssetScope | 'all'>(
    admin || backgrounds ? 'system' : 'all',
  );
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [archived, setArchived] = useState(false);
  const [rows, setRows] = useState<MapAsset[]>([]),
    [urls, setUrls] = useState<Record<string, string>>({}),
    [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null),
    [dialog, setDialog] = useState<MapAsset | 'new' | null>(null);
  const revision = useRef(0);
  const [loadedFor, setLoadedFor] = useState(user?.id);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(0);
  }, [scope, kind, archived]);
  const reload = useCallback(async () => {
    const version = ++revision.current;
    if (demo) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listMapAssets(kind, scope, query, page, archived);
      const sources = await assetUrls(data.rows, true);
      if (revision.current !== version) return;
      setRows(data.rows);
      setLoadedFor(user?.id);
      setTotal(data.total);
      setUrls(sources);
    } catch (e) {
      if (revision.current === version) {
        setRows([]);
        setUrls({});
        setTotal(0);
        setLoadedFor(user?.id);
        setError(errorMessage(e));
      }
    } finally {
      if (revision.current === version) setLoading(false);
    }
  }, [kind, scope, query, page, archived, demo, user?.id]);
  useEffect(() => {
    void reload();
    return () => {
      revision.current++;
    };
  }, [reload]);
  if (demo) return <p>Entre na sua conta para salvar e usar imagens da biblioteca.</p>;
  if (loadedFor !== user?.id) return <Loading />;
  return (
    <section className="map-asset-library" aria-label={ASSET_LABELS[kind] + ' da biblioteca'}>
      <div className="map-asset-actions">
        {!backgrounds && (
          <Button type="button" onClick={() => setDialog('new')}>
            <ImagePlus size={16} />
            {admin ? 'Adicionar ao sistema' : 'Enviar para minha biblioteca'}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={loading}
          aria-label="Atualizar biblioteca"
          onClick={() => void reload()}
        >
          <RefreshCw size={15} />
        </Button>
      </div>
      {!admin && !backgrounds && (
        <Field label="Origem dos recursos">
          <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="all">Sistema e minha biblioteca</option>
            <option value="system">Recursos do sistema</option>
            <option value="personal">Minha biblioteca</option>
          </Select>
        </Field>
      )}
      <Input
        aria-label="Buscar recurso na biblioteca"
        placeholder="Buscar por nome"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {(admin || (!backgrounds && scope === 'personal')) && (
        <label className="map-asset-check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Mostrar arquivados
        </label>
      )}
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="map-asset-grid">
            {rows.map((row) => (
              <article className="map-asset-card" key={row.id}>
                <button
                  type="button"
                  className="map-asset-choice"
                  aria-label={'Usar ' + row.name}
                  disabled={!onSelect || !row.active}
                  onClick={() => onSelect?.(row)}
                >
                  {urls[row.id] ? (
                    <img src={urls[row.id]} alt={row.name} loading="lazy" decoding="async" />
                  ) : (
                    <ImagePlus size={28} />
                  )}
                  <strong>{row.name}</strong>
                  <small>
                    {row.scope === 'system' ? 'Sistema' : 'Minha biblioteca'}
                    {!row.active ? ' · Arquivado' : ''}
                  </small>
                </button>
                {!!row.tags.length && (
                  <small className="map-asset-tags">{row.tags.slice(0, 3).join(' · ')}</small>
                )}
                {((admin && row.scope === 'system') || row.owner_id === user?.id) && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={'Editar recurso ' + row.name}
                    onClick={() => setDialog(row)}
                  >
                    <Pencil size={14} />
                    Editar
                  </Button>
                )}
              </article>
            ))}
          </div>
          {!rows.length && (
            <p className="muted">
              Nenhum recurso encontrado.
              {!backgrounds
                ? ' Envie uma imagem para começar.'
                : ' Os fundos publicados pelo administrador aparecerão aqui.'}
            </p>
          )}
          {total > 12 && (
            <div className="map-asset-pages">
              <Button
                type="button"
                variant="secondary"
                disabled={!page}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span>
                {page + 1} / {Math.ceil(total / 12)}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={(page + 1) * 12 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
      {dialog && (
        <AssetDialog
          key={dialog === 'new' ? 'new' : dialog.id}
          asset={dialog === 'new' ? undefined : dialog}
          scope={admin ? 'system' : 'personal'}
          kind={kind}
          onClose={() => setDialog(null)}
          onSaved={(asset) => {
            setDialog(null);
            void reload();
            announce('Recurso salvo na biblioteca.');
            if (asset.active) onSelect?.(asset);
          }}
        />
      )}
    </section>
  );
}

function AssetDialog({
  asset,
  scope,
  kind,
  onClose,
  onSaved,
}: {
  asset?: MapAsset;
  scope: MapAssetScope;
  kind: MapAssetKind;
  onClose(): void;
  onSaved(asset: MapAsset): void;
}) {
  const [name, setName] = useState(asset?.name ?? ''),
    [tags, setTags] = useState(asset?.tags.join(', ') ?? ''),
    [active, setActive] = useState(asset?.active ?? true);
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const job = useRef<{ file: File; id: string } | null>(null),
    locked = useRef(false);
  return (
    <Modal
      open
      wide
      title={
        asset
          ? 'Editar recurso'
          : 'Enviar ' +
            (kind === 'background' ? 'fundo para grid' : kind === 'token' ? 'token' : 'símbolo')
      }
      onClose={() => {
        if (!locked.current) onClose();
      }}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (locked.current) return;
          locked.current = true;
          setBusy(true);
          setError(null);
          try {
            const labels = tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
            if (!name.trim()) throw new Error('Dê um nome ao recurso.');
            if (labels.length > 12 || labels.some((t) => t.length > 40))
              throw new Error('Use até 12 etiquetas de no máximo 40 caracteres.');
            let result: MapAsset;
            if (asset) result = await updateMapAsset(asset, name, labels, active);
            else {
              if (!file) throw new Error('Escolha a imagem do recurso.');
              if (job.current?.file !== file) job.current = { file, id: crypto.randomUUID() };
              result = await uploadMapAsset(job.current.id, file, kind, scope, name, labels);
            }
            onSaved(result);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            locked.current = false;
            setBusy(false);
          }
        }}
      >
        <ErrorBox message={error} />
        <Field label="Nome do recurso">
          <Input
            required
            maxLength={120}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Etiquetas">
          <Input
            value={tags}
            disabled={busy}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Ex.: floresta, cidade, masmorra"
          />
        </Field>
        {!asset && (
          <ImageField
            label="Imagem do recurso"
            aspect="original"
            maxBytes={5 * 1024 * 1024}
            maxSide={kind === 'background' ? 4096 : 512}
            value={file}
            disabled={busy}
            onChange={setFile}
            onError={setError}
          />
        )}
        {!asset && (
          <small>
            PNG, JPG ou WebP. A transparência é preservada.{' '}
            {scope === 'system'
              ? 'Disponível no catálogo do sistema para os mestres com acesso.'
              : 'Esta biblioteca fica disponível somente na sua conta.'}
          </small>
        )}
        {asset && (
          <label className="map-asset-check">
            <input
              type="checkbox"
              checked={active}
              disabled={busy}
              onChange={(e) => setActive(e.target.checked)}
            />
            Disponível para novas escolhas
          </label>
        )}
        {asset && (
          <small>
            Arquivar remove o recurso da biblioteca de novas escolhas. Os mapas que já o usam
            continuam funcionando.
          </small>
        )}
        <div className="form-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando imagem…' : 'Salvar recurso'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function AssetLibraryPicker({
  kind,
  backgrounds = false,
  onSelect,
}: {
  kind: MapAssetKind;
  backgrounds?: boolean;
  onSelect(asset: MapAsset): void;
}) {
  const [open, setOpen] = useState(false);
  const title = backgrounds ? 'Terrenos' : kind === 'token' ? 'Criar token' : 'Criar símbolo';
  const Icon = backgrounds ? Mountain : kind === 'token' ? CircleUserRound : Shapes;
  return (
    <details
      className="atlas-fold map-asset-disclosure"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary aria-label={title}>
        <Icon size={19} aria-hidden />
        <span>
          <strong>{title}</strong>
          <small>
            {backgrounds
              ? 'Escolha um terreno para o grid'
              : 'Envie uma imagem ou escolha da biblioteca'}
          </small>
        </span>
        <ChevronDown size={16} className="map-asset-chevron" aria-hidden />
      </summary>
      {open && <MapAssetLibrary kind={kind} backgrounds={backgrounds} onSelect={onSelect} />}
    </details>
  );
}
