'use client';
import { useState, type FormEvent } from 'react';
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
} from 'lucide-react';
import type { Campaign, WorldEntry, WorldKind } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
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
} from './ui';
import { Cover, ImageField } from './media';
import { uid, now, errorMessage, cx } from '@/lib/utils';
import { uploadImage } from '@/services/storage';
const labels = { region: 'Região', city: 'Cidade', location: 'Local' };
const tables = {
  region: 'world_regions',
  city: 'world_cities',
  location: 'world_locations',
} as const;
export function WorldCollection({
  campaign,
  locationsOnly = false,
}: {
  campaign?: Campaign;
  locationsOnly?: boolean;
}) {
  const w = useWorkspace();
  const [kind, setKind] = useState<WorldKind | 'all'>(locationsOnly ? 'location' : 'all'),
    [query, setQuery] = useState(''),
    [editing, setEditing] = useState<WorldEntry | null>(null),
    [detail, setDetail] = useState<WorldEntry | null>(null),
    [pending, setPending] = useState<WorldEntry | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const records = w.data.world.filter(
    (x) =>
      (!campaign || x.campaign_id === campaign.id) &&
      (kind === 'all' || x.kind === kind) &&
      `${x.name} ${x.description} ${x.location}`.toLowerCase().includes(query.toLowerCase()),
  );
  const owned = w.data.campaigns.filter((c) => c.owner_id === w.user?.id);
  const canCreate = campaign ? campaign.owner_id === w.user?.id : owned.length > 0;
  function create() {
    const c = campaign || owned[0];
    if (!c) return;
    setEditing({
      id: uid(),
      campaign_id: c.id,
      kind: locationsOnly ? 'location' : 'region',
      name: '',
      description: '',
      image_path: null,
      type: '',
      location: '',
      notes: '',
      region_id: null,
      population: null,
      government: '',
      visible_to_players: false,
      secrets: '',
      private_notes: '',
      created_at: now(),
      updated_at: now(),
    });
  }
  async function remove() {
    if (!pending) return;
    setBusy(true);
    try {
      await w.perform((r) => r.deleteWorld(pending), 'Registro do mundo excluído.');
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
        eyebrow={campaign?.name || 'DÊ VIDA AO SEU UNIVERSO'}
        title={locationsOnly ? 'Locais' : 'Construir mundo'}
        description="Regiões, cidades e lugares que guardam histórias."
        action={
          canCreate ? (
            <Button onClick={create}>
              <Plus size={18} />
              {locationsOnly ? 'Criar local' : 'Novo registro'}
            </Button>
          ) : undefined
        }
      />
      <ErrorBox message={error} />
      <div className="collection-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filtrar lugares">
          {(locationsOnly ? ['location'] : ['all', 'region', 'city', 'location']).map((k) => (
            <button
              key={k}
              className={cx('filter-tab', kind === k && 'selected')}
              aria-pressed={kind === k}
              onClick={() => setKind(k as WorldKind | 'all')}
            >
              {{ all: 'Todos', region: 'Regiões', city: 'Cidades', location: 'Locais' }[k]}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <Input
            aria-label="Buscar no mundo"
            placeholder="Buscar no mundo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {records.length ? (
        <div className="campaign-grid">
          {records.map((entry) => (
            <article className="world-card" key={entry.id}>
              {entry.image_path && <Cover path={entry.image_path} name={entry.name} />}
              <div className="panel-heading">
                <Badge tone="blue">{labels[entry.kind]}</Badge>
                <span className="private-label">
                  {entry.visible_to_players ? (
                    <>
                      <Eye size={14} />
                      Público
                    </>
                  ) : (
                    <>
                      <EyeOff size={14} />
                      Privado
                    </>
                  )}
                </span>
              </div>
              <h3>{entry.name}</h3>
              <p>{entry.description}</p>
              <div className="record-card-footer">
                <small>
                  <MapPin size={13} style={{ display: 'inline', marginRight: 5 }} />
                  {entry.location || 'Localização indefinida'}
                </small>
                <div className="record-actions">
                  <Button variant="secondary" onClick={() => setDetail(entry)}>
                    Explorar
                  </Button>
                  {w.data.campaigns.some(
                    (c) => c.id === entry.campaign_id && c.owner_id === w.user?.id,
                  ) && (
                    <button
                      className="icon-button"
                      aria-label={`Excluir ${entry.name}`}
                      onClick={() => setPending(entry)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Este mundo ainda guarda páginas em branco."
          description={
            canCreate
              ? 'Crie a primeira região, cidade ou local da campanha.'
              : 'O mestre ainda não revelou lugares para a sua aventura.'
          }
          action={
            canCreate ? (
              <Button onClick={create}>
                <Plus size={18} />
                Criar o primeiro lugar
              </Button>
            ) : undefined
          }
        />
      )}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={
          w.data.world.some((x) => x.id === editing?.id)
            ? 'Editar lugar'
            : 'Um lugar para descobrir'
        }
        description="Construa o mundo e escolha o que os jogadores podem conhecer."
        wide
      >
        {editing && (
          <WorldForm
            key={editing.id}
            entry={editing}
            campaignLocked={Boolean(campaign) || w.data.world.some((x) => x.id === editing.id)}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name || 'Lugar'}
        description={
          detail ? `${labels[detail.kind]} · ${detail.type || 'Mundo da campanha'}` : undefined
        }
      >
        {detail && (
          <div className="detail-content">
            {detail.image_path && (
              <Cover path={detail.image_path} name={detail.name} className="detail-cover" />
            )}
            <p className="subtle detail-description">{detail.description || 'Sem descrição.'}</p>
            <div className="form-grid">
              <div>
                <small className="subtle">Localização</small>
                <p>{detail.location || 'Não informada'}</p>
              </div>
              {detail.kind === 'city' && (
                <>
                  <div>
                    <small className="subtle">População</small>
                    <p>{detail.population?.toLocaleString('pt-BR') ?? 'Não informada'}</p>
                  </div>
                  <div>
                    <small className="subtle">Governo</small>
                    <p>{detail.government || 'Não informado'}</p>
                  </div>
                </>
              )}
            </div>
            {detail.notes && (
              <section className="panel">
                <h3>Observações</h3>
                <p className="detail-description">{detail.notes}</p>
              </section>
            )}
            {(detail.secrets || detail.private_notes) && (
              <section className="panel npc-secrets">
                <div className="panel-heading">
                  <h3>Somente para o mestre</h3>
                  <LockKeyhole size={17} />
                </div>
                <p className="detail-description">{detail.secrets}</p>
                <p className="detail-description">{detail.private_notes}</p>
              </section>
            )}
            {w.data.campaigns.some(
              (c) => c.id === detail.campaign_id && c.owner_id === w.user?.id,
            ) && (
              <div className="form-actions">
                <Button
                  onClick={() => {
                    setEditing(detail);
                    setDetail(null);
                  }}
                >
                  Editar lugar
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
      <Confirm
        open={Boolean(pending)}
        onCancel={() => setPending(null)}
        onConfirm={() => void remove()}
        title={`Excluir ${pending?.name}?`}
        description="O registro e suas notas serão excluídos. Os lugares relacionados à região serão mantidos."
        busy={busy}
      />
    </>
  );
}
function WorldForm({
  entry,
  onSaved,
  onCancel,
  campaignLocked,
}: {
  entry: WorldEntry;
  onSaved(): void;
  onCancel(): void;
  campaignLocked: boolean;
}) {
  const w = useWorkspace();
  const [value, setValue] = useState(entry),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const existing = w.data.world.some((x) => x.id === entry.id);
  const set = <K extends keyof WorldEntry>(key: K, val: WorldEntry[K]) =>
    setValue((v) => ({ ...v, [key]: val }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let result = { ...value, name: value.name.trim(), updated_at: now() };
      if (!result.name) throw new Error('Dê um nome ao lugar.');
      await w.perform(async (repo) => {
        await repo.saveWorld(result);
        if (file) {
          result = {
            ...result,
            image_path: await uploadImage(file, tables[result.kind], result.id, w.demo),
          };
          await repo.saveWorld(result);
        }
      }, 'Registro do mundo salvo.');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <ErrorBox message={error} />
      <div className="form-grid">
        {!campaignLocked && (
          <Field label="Campanha">
            <Select
              value={value.campaign_id}
              onChange={(e) =>
                setValue((v) => ({ ...v, campaign_id: e.target.value, region_id: null }))
              }
            >
              {w.data.campaigns
                .filter((c) => c.owner_id === w.user?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label="Tipo de registro">
          <Select
            value={value.kind}
            disabled={existing}
            onChange={(e) =>
              setValue((v) => ({ ...v, kind: e.target.value as WorldKind, region_id: null }))
            }
          >
            {Object.entries(labels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome">
          <Input
            value={value.name}
            required
            maxLength={120}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Tipo / categoria">
          <Input
            value={value.type}
            maxLength={120}
            onChange={(e) => set('type', e.target.value)}
            placeholder="Floresta, capital, taverna..."
          />
        </Field>
        <Field label="Localização">
          <Input value={value.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
        {value.kind !== 'region' && (
          <Field label="Região relacionada">
            <Select
              value={value.region_id ?? ''}
              onChange={(e) => set('region_id', e.target.value || null)}
            >
              <option value="">Sem região</option>
              {w.data.world
                .filter((r) => r.kind === 'region' && r.campaign_id === value.campaign_id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        {value.kind === 'city' && (
          <>
            <Field label="População">
              <Input
                type="number"
                min={0}
                value={value.population ?? ''}
                onChange={(e) =>
                  set('population', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </Field>
            <Field label="Governo">
              <Input value={value.government} onChange={(e) => set('government', e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <Field label="Descrição">
        <Textarea
          rows={5}
          value={value.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>
      <Field label="Observações públicas">
        <Textarea value={value.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <ImageField current={value.image_path} onChange={setFile} onError={setError} />
      {file && <small className="file-name">{file.name}</small>}
      <label className="visibility-label">
        <input
          type="checkbox"
          checked={value.visible_to_players}
          onChange={(e) => set('visible_to_players', e.target.checked)}
        />
        <Eye size={17} />
        Visível para jogadores
      </label>
      <section className="form-divider">
        <h3>
          <LockKeyhole size={17} style={{ display: 'inline', marginRight: 8 }} />
          Anotações do mestre
        </h3>
        <div className="form-stack">
          <Field label="Segredos">
            <Textarea
              value={value.secrets ?? ''}
              onChange={(e) => set('secrets', e.target.value)}
            />
          </Field>
          <Field label="Observações privadas">
            <Textarea
              value={value.private_notes ?? ''}
              onChange={(e) => set('private_notes', e.target.value)}
            />
          </Field>
        </div>
      </section>
      <div className="form-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={busy}>
          {busy ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />}Salvar lugar
        </Button>
      </div>
    </form>
  );
}
