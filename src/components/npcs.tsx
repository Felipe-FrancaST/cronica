'use client';
import { useState, type FormEvent } from 'react';
import { Plus, Search, Trash2, Eye, EyeOff, LoaderCircle, Save } from 'lucide-react';
import type { Campaign, Npc, NpcAttack, Spell } from '@/types';
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
import { Avatar, ImageField } from './media';
import { uid, now, errorMessage, signed } from '@/lib/utils';
import { uploadImage } from '@/services/storage';
import { ABILITIES, RACES } from '@/systems/dnd5e/catalog';
import { abilityModifier } from '@/systems/dnd5e';
export function NpcCollection({ campaign }: { campaign?: Campaign }) {
  const w = useWorkspace();
  const [query, setQuery] = useState(''),
    [editing, setEditing] = useState<Npc | null>(null),
    [pending, setPending] = useState<Npc | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const records = w.data.npcs.filter(
    (x) =>
      (!campaign || x.campaign_id === campaign.id) &&
      `${x.name} ${x.faction} ${x.race} ${x.location}`.toLowerCase().includes(query.toLowerCase()),
  );
  const owned = w.data.campaigns.filter((c) => c.owner_id === w.user?.id);
  const canCreate = campaign ? campaign.owner_id === w.user?.id : owned.length > 0;
  function create() {
    const c = campaign || owned[0];
    if (!c) return;
    setEditing({
      id: uid(),
      campaign_id: c.id,
      rpg_system_id: c.rpg_system_id,
      name: '',
      image_path: null,
      race: 'Humano',
      type: '',
      level: 1,
      age: '',
      appearance: '',
      personality: '',
      biography: '',
      location: '',
      faction: '',
      relationship: 'Neutra',
      status: 'Vivo',
      visible_to_players: false,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      hp_current: 10,
      hp_max: 10,
      ac: 10,
      attacks: [],
      spells: [],
      abilities_text: '',
      resistances: '',
      weaknesses: '',
      inventory: '',
      created_at: now(),
      updated_at: now(),
    });
  }
  async function remove() {
    if (!pending) return;
    setBusy(true);
    try {
      await w.perform((r) => r.deleteNpc(pending.id), 'NPC excluído.');
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
        eyebrow={campaign?.name || 'QUEM HABITA SUAS HISTÓRIAS'}
        title="NPCs"
        description="Aliados, rivais e desconhecidos que tornam seu mundo inesquecível."
        action={
          canCreate ? (
            <Button onClick={create}>
              <Plus size={18} />
              Criar NPC
            </Button>
          ) : undefined
        }
      />
      <ErrorBox message={error} />
      <div className="collection-toolbar">
        <span className="subtle">{records.length} personagens do mundo</span>
        <label className="search-field">
          <Search size={17} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar NPC..."
            aria-label="Buscar NPC"
          />
        </label>
      </div>
      {records.length ? (
        <div className="campaign-grid">
          {records.map((n) => (
            <article className="npc-card" key={n.id}>
              <div className="character-card-top">
                <Avatar name={n.name} path={n.image_path} />
                <div>
                  <h3>{n.name}</h3>
                  <small>
                    {n.race} · {n.type || 'NPC'}
                  </small>
                </div>
              </div>
              <div className="panel-heading">
                <Badge
                  tone={
                    n.relationship === 'Hostil'
                      ? 'red'
                      : n.relationship === 'Aliada'
                        ? 'green'
                        : 'muted'
                  }
                >
                  {n.relationship || 'Neutra'}
                </Badge>
                <span className="private-label">
                  {n.visible_to_players ? (
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
              <p>{n.personality || n.biography}</p>
              <div className="card-counts">
                <span>Nível {n.level}</span>
                <span>CA {n.ac}</span>
                <span>
                  {n.hp_current}/{n.hp_max} PV
                </span>
              </div>
              <div className="record-card-footer">
                <small>{n.faction || n.location || 'Sem facção'}</small>
                <div className="record-actions">
                  <Button variant="secondary" onClick={() => setEditing(n)}>
                    Abrir ficha
                  </Button>
                  {w.data.campaigns.some(
                    (c) => c.id === n.campaign_id && c.owner_id === w.user?.id,
                  ) && (
                    <button
                      className="icon-button"
                      aria-label={`Excluir ${n.name}`}
                      onClick={() => setPending(n)}
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
          title="Há muitas histórias para povoar este mundo."
          description={
            canCreate
              ? 'Crie um aliado, um rival ou alguém com um segredo.'
              : 'O mestre ainda não apresentou NPCs nesta campanha.'
          }
          action={
            canCreate ? (
              <Button onClick={create}>
                <Plus size={18} />
                Criar NPC
              </Button>
            ) : undefined
          }
        />
      )}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.name || 'Um novo rosto'}
        description="Ficha de NPC · D&D 5e"
        wide
      >
        {editing && (
          <NpcForm
            key={editing.id}
            npc={editing}
            readOnly={
              !w.data.campaigns.some(
                (c) => c.id === editing.campaign_id && c.owner_id === w.user?.id,
              )
            }
            campaignLocked={Boolean(campaign) || w.data.npcs.some((n) => n.id === editing.id)}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <Confirm
        open={Boolean(pending)}
        onCancel={() => setPending(null)}
        onConfirm={() => void remove()}
        title={`Excluir ${pending?.name}?`}
        description="O NPC, seus ataques e magias serão excluídos. Esta ação não pode ser desfeita."
        busy={busy}
      />
    </>
  );
}
function NpcForm({
  npc,
  readOnly,
  campaignLocked,
  onSaved,
  onCancel,
}: {
  npc: Npc;
  readOnly: boolean;
  campaignLocked: boolean;
  onSaved(): void;
  onCancel(): void;
}) {
  const w = useWorkspace();
  const [value, setValue] = useState(() => structuredClone(npc)),
    [tab, setTab] = useState('identity'),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ type: 'attack' | 'spell'; id: string } | null>(null);
  const set = <K extends keyof Npc>(key: K, val: Npc[K]) => setValue((v) => ({ ...v, [key]: val }));
  const attack = (id: string, update: Partial<NpcAttack>) =>
    set(
      'attacks',
      value.attacks.map((x) => (x.id === id ? { ...x, ...update } : x)),
    );
  const spell = (id: string, update: Partial<Spell>) =>
    set(
      'spells',
      value.spells.map((x) => (x.id === id ? { ...x, ...update } : x)),
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setError(null);
    try {
      let result = {
        ...value,
        name: value.name.trim(),
        hp_current: Math.min(value.hp_current, value.hp_max),
        updated_at: now(),
      };
      if (!result.name) throw new Error('Dê um nome ao NPC.');
      if (Object.values(result.abilities).some((v) => v < 1 || v > 30))
        throw new Error('Os atributos devem estar entre 1 e 30.');
      await w.perform(async (repo) => {
        await repo.saveNpc(result);
        if (file) {
          result = { ...result, image_path: await uploadImage(file, 'npcs', result.id, w.demo) };
          await repo.saveNpc(result);
        }
      }, 'NPC salvo.');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const text = (key: keyof Npc, label: string, area = false) => (
    <Field label={label}>
      {area ? (
        <Textarea
          disabled={readOnly}
          value={value[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
        />
      ) : (
        <Input
          disabled={readOnly}
          value={value[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
        />
      )}
    </Field>
  );
  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="tabs-bar" role="tablist" aria-label="Ficha do NPC">
        {[
          { id: 'identity', label: 'Identidade' },
          { id: 'stats', label: 'Atributos e combate' },
          { id: 'powers', label: 'Ataques e magias' },
          { id: 'story', label: 'História e detalhes' },
        ].map((t) => (
          <button
            type="button"
            key={t.id}
            className="tab-button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {tab === 'identity' && (
        <div className="form-stack">
          <div className="form-grid">
            {!campaignLocked && (
              <Field label="Campanha">
                <Select
                  value={value.campaign_id}
                  onChange={(e) => {
                    const c = w.data.campaigns.find((c) => c.id === e.target.value)!;
                    setValue((v) => ({ ...v, campaign_id: c.id, rpg_system_id: c.rpg_system_id }));
                  }}
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
            {text('name', 'Nome')}
            {text('race', 'Raça')}
            {text('type', 'Classe / tipo')}
            <Field label="Nível">
              <Input
                type="number"
                min={1}
                max={30}
                disabled={readOnly}
                value={value.level}
                onChange={(e) => set('level', Number(e.target.value))}
              />
            </Field>
            {text('age', 'Idade')}
            {text('location', 'Localização')}
            {text('faction', 'Facção')}
            <Field label="Relação com jogadores">
              <Select
                value={value.relationship}
                disabled={readOnly}
                onChange={(e) => set('relationship', e.target.value)}
              >
                {['Neutra', 'Aliada', 'Hostil', 'Desconhecida'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={value.status}
                disabled={readOnly}
                onChange={(e) => set('status', e.target.value)}
              >
                {['Vivo', 'Morto', 'Desaparecido', 'Desconhecido'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
          </div>
          {!readOnly && (
            <>
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
              <div className="info-box">
                Quando público, o NPC e sua ficha ficam visíveis aos jogadores da campanha.
              </div>
            </>
          )}
        </div>
      )}
      {tab === 'stats' && (
        <div className="form-stack">
          <div className="abilities-grid">
            {ABILITIES.map((a) => (
              <div key={a.id} className="ability-card">
                <label htmlFor={`npc-${a.id}`}>{a.label}</label>
                <Input
                  id={`npc-${a.id}`}
                  type="number"
                  min={1}
                  max={30}
                  value={value.abilities[a.id]}
                  disabled={readOnly}
                  onChange={(e) =>
                    set('abilities', { ...value.abilities, [a.id]: Number(e.target.value) })
                  }
                />
                <strong>{signed(abilityModifier(value.abilities[a.id]))}</strong>
              </div>
            ))}
          </div>
          <div className="form-grid form-grid-three">
            {(
              [
                { id: 'hp_current', label: 'PV atuais', min: 0 },
                { id: 'hp_max', label: 'PV máximos', min: 1 },
                { id: 'ac', label: 'Classe de armadura', min: 0 },
              ] as const
            ).map((f) => (
              <Field key={f.id} label={f.label}>
                <Input
                  type="number"
                  min={f.min}
                  value={value[f.id]}
                  disabled={readOnly}
                  onChange={(e) => set(f.id, Number(e.target.value))}
                />
              </Field>
            ))}
          </div>
          {text('resistances', 'Resistências')}
          {text('weaknesses', 'Fraquezas')}
          {text('abilities_text', 'Habilidades', true)}
        </div>
      )}
      {tab === 'powers' && (
        <div className="form-stack">
          <div className="panel-heading">
            <h3>Ataques</h3>
            {!readOnly && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  set('attacks', [
                    ...value.attacks,
                    { id: uid(), name: '', bonus: 0, damage: '', range: '', description: '' },
                  ])
                }
              >
                <Plus size={17} />
                Adicionar ataque
              </Button>
            )}
          </div>
          {value.attacks.map((a) => (
            <section className="panel" key={a.id}>
              <div className="panel-heading">
                <h3>{a.name || 'Novo ataque'}</h3>
                {!readOnly && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remover ataque"
                    onClick={() => setPending({ type: 'attack', id: a.id })}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="form-grid">
                <Field label="Nome">
                  <Input
                    disabled={readOnly}
                    value={a.name}
                    onChange={(e) => attack(a.id, { name: e.target.value })}
                  />
                </Field>
                <Field label="Bônus de ataque">
                  <Input
                    type="number"
                    disabled={readOnly}
                    value={a.bonus}
                    onChange={(e) => attack(a.id, { bonus: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Dano">
                  <Input
                    disabled={readOnly}
                    value={a.damage}
                    onChange={(e) => attack(a.id, { damage: e.target.value })}
                    placeholder="1d8 + 3 cortante"
                  />
                </Field>
                <Field label="Alcance">
                  <Input
                    disabled={readOnly}
                    value={a.range}
                    onChange={(e) => attack(a.id, { range: e.target.value })}
                  />
                </Field>
                <div className="full-width">
                  <Field label="Descrição">
                    <Textarea
                      disabled={readOnly}
                      value={a.description}
                      onChange={(e) => attack(a.id, { description: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </section>
          ))}
          <div className="panel-heading">
            <h3>Magias</h3>
            {!readOnly && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  set('spells', [
                    ...value.spells,
                    {
                      id: uid(),
                      name: '',
                      level: 0,
                      prepared: false,
                      description: '',
                      range: '',
                      duration: '',
                      components: '',
                    },
                  ])
                }
              >
                <Plus size={17} />
                Adicionar magia
              </Button>
            )}
          </div>
          {value.spells.map((s) => (
            <section className="spell-card" key={s.id}>
              <div className="panel-heading">
                <h4>{s.name || 'Nova magia'}</h4>
                {!readOnly && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remover magia"
                    onClick={() => setPending({ type: 'spell', id: s.id })}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="form-grid">
                <Field label="Nome">
                  <Input
                    disabled={readOnly}
                    value={s.name}
                    onChange={(e) => spell(s.id, { name: e.target.value })}
                  />
                </Field>
                <Field label="Nível (0 = truque)">
                  <Input
                    type="number"
                    min={0}
                    max={9}
                    disabled={readOnly}
                    value={s.level}
                    onChange={(e) => spell(s.id, { level: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Alcance">
                  <Input
                    disabled={readOnly}
                    value={s.range}
                    onChange={(e) => spell(s.id, { range: e.target.value })}
                  />
                </Field>
                <Field label="Duração">
                  <Input
                    disabled={readOnly}
                    value={s.duration}
                    onChange={(e) => spell(s.id, { duration: e.target.value })}
                  />
                </Field>
                <Field label="Componentes">
                  <Input
                    disabled={readOnly}
                    value={s.components}
                    onChange={(e) => spell(s.id, { components: e.target.value })}
                  />
                </Field>
                <label className="visibility-label">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={s.prepared}
                    onChange={(e) => spell(s.id, { prepared: e.target.checked })}
                  />
                  Preparada / conhecida
                </label>
                <div className="full-width">
                  <Field label="Descrição">
                    <Textarea
                      disabled={readOnly}
                      value={s.description}
                      onChange={(e) => spell(s.id, { description: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      {tab === 'story' && (
        <div className="form-stack">
          {text('appearance', 'Aparência', true)}
          {text('personality', 'Personalidade', true)}
          {text('biography', 'História', true)}
          {text('inventory', 'Inventário', true)}
        </div>
      )}
      <div className="form-actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {readOnly ? 'Fechar ficha' : 'Cancelar'}
        </Button>
        {!readOnly && (
          <Button disabled={busy}>
            {busy ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />}Salvar NPC
          </Button>
        )}
      </div>
      <Confirm
        open={Boolean(pending)}
        onCancel={() => setPending(null)}
        title="Remover da ficha?"
        description="A remoção será aplicada quando você salvar o NPC."
        onConfirm={() => {
          if (pending?.type === 'attack')
            set(
              'attacks',
              value.attacks.filter((a) => a.id !== pending.id),
            );
          else if (pending)
            set(
              'spells',
              value.spells.filter((a) => a.id !== pending.id),
            );
          setPending(null);
        }}
      />
    </form>
  );
}
