'use client';
import { useDeferredValue, useRef, useState } from 'react';
import {
  Archive,
  Copy,
  EyeOff,
  Gift,
  Package,
  Plus,
  RotateCcw,
  ScrollText,
  Sparkles,
  Swords,
} from 'lucide-react';
import type { Campaign } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { PageHeading } from '@/components/shell';
import { Cover } from '@/components/media';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  Select,
} from '@/components/ui';
import { ITEM_TYPES } from '@/systems/dnd5e/items';
import { errorMessage } from '@/lib/utils';
import {
  ACTION_LABELS,
  AREA_LABELS,
  FUNCTION_LABELS,
  ITEM_RARITIES,
  RECHARGE_LABELS,
  duplicateDefinition,
  itemMatches,
  newItemDefinition,
} from './model';
import { giveCampaignItem, rechargeCampaignItem, saveCampaignItem } from './repository';
import { useCampaignItems } from './use-items';
import { ItemEditor } from './item-editor';
import type { CampaignItem } from './types';

export function ItemsPage({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace(),
    collection = useCampaignItems(campaign.id, w.demo);
  const master = campaign.owner_id === w.user?.id;
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [rarity, setRarity] = useState(''),
    [status, setStatus] = useState('active');
  const [edit, setEdit] = useState<CampaignItem | null>(null),
    [detail, setDetail] = useState<CampaignItem | null>(null),
    [give, setGive] = useState<CampaignItem | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const search = useDeferredValue(query);
  const items = collection.items.filter(
    (i) =>
      (master
        ? status === 'archived'
          ? i.archived
          : !i.archived
        : !i.archived && i.visible_to_players) &&
      (!category || i.data.category === category) &&
      (!rarity || i.data.rarity === rarity) &&
      itemMatches(i, search),
  );
  const characters = w.data.characters.filter((c) => c.campaign_id === campaign.id);
  const active = collection.items.filter((i) => !i.archived);
  const deliveries = collection.deliveries.slice().reverse().slice(0, 100);
  async function action(run: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
      await collection.refresh();
      await w.refresh();
      w.notify(message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const fresh = (data = newItemDefinition()): CampaignItem => ({
    id: crypto.randomUUID(),
    campaign_id: campaign.id,
    name: data.name,
    data,
    visible_to_players: false,
    archived: false,
    version: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    private_notes: '',
  });
  return (
    <>
      <PageHeading
        eyebrow={campaign.name}
        title="Itens"
        description={
          master
            ? 'Crie relíquias, equipamentos e recompensas com funções próprias para sua aventura.'
            : 'Conheça os itens publicados pelo mestre e acompanhe suas recompensas.'
        }
        action={
          master ? (
            <Button onClick={() => setEdit(fresh())}>
              <Plus size={17} /> Criar item
            </Button>
          ) : undefined
        }
      />
      <ErrorBox message={error ?? collection.error} />
      <section className="items-workshop-banner">
        <span className="items-banner-icon">
          <Package size={32} />
        </span>
        <div>
          <strong>{master ? 'Oficina de itens da campanha' : 'O tesouro da aventura'}</strong>
          <p>
            {master
              ? 'Um item, várias possibilidades: funções, cargas, áreas, bônus e segredos.'
              : 'As funções e regras dos itens recebidos também aparecem no inventário e na Mesa.'}
          </p>
        </div>
      </section>
      <div className="items-stats" aria-label="Resumo dos itens">
        <div>
          <strong>{active.length}</strong>
          <span>{master ? 'Modelos ativos' : 'Itens publicados'}</span>
        </div>
        <div>
          <strong>{active.reduce((n, i) => n + i.data.functions.length, 0)}</strong>
          <span>Funções criadas</span>
        </div>
        <div>
          <strong>{collection.deliveries.length}</strong>
          <span>Entregas registradas</span>
        </div>
        {master && (
          <div>
            <strong>{active.filter((i) => !i.visible_to_players).length}</strong>
            <span>Reservados ao mestre</span>
          </div>
        )}
      </div>
      <div className="items-filters">
        <Field label="Buscar itens">
          <Input
            value={query}
            placeholder="Nome, etiqueta ou função…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <Field label="Filtrar categoria">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {Object.entries(ITEM_TYPES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Filtrar raridade">
          <Select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="">Todas as raridades</option>
            {ITEM_RARITIES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        {master && (
          <Field label="Estado dos itens">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Ativos</option>
              <option value="archived">Arquivados</option>
            </Select>
          </Field>
        )}
      </div>
      {collection.loading ? (
        <Loading />
      ) : items.length ? (
        <div className="campaign-items-grid">
          {items.map((item) => (
            <article className="campaign-item-card" key={item.id}>
              {item.data.image_path ? (
                <Cover
                  path={item.data.image_path}
                  name={item.name}
                  className="campaign-item-cover"
                />
              ) : (
                <div className={'item-card-emblem item-emblem-' + item.data.category}>
                  {item.data.category === 'weapon' ? (
                    <Swords size={35} />
                  ) : item.data.functions.length ? (
                    <Sparkles size={35} />
                  ) : (
                    <Package size={35} />
                  )}
                </div>
              )}
              <div className="item-card-content">
                <div className="item-card-badges">
                  <Badge>{item.data.rarity ?? 'Comum'}</Badge>
                  {master && (
                    <Badge tone={item.visible_to_players ? 'green' : 'muted'}>
                      {item.visible_to_players ? 'Publicado' : 'Privado'}
                    </Badge>
                  )}
                </div>
                <h2>{item.name}</h2>
                <span className="item-card-category">{ITEM_TYPES[item.data.category]}</span>
                <p>
                  {item.data.notes ||
                    'Uma nova peça da história, pronta para ganhar significado na mesa.'}
                </p>
                <div className="item-card-facts">
                  <span>
                    <Sparkles size={14} />
                    {item.data.functions.length} funções
                  </span>
                  <span>{item.data.charges ?? 0} cargas</span>
                  {item.data.attunement && <span>Sintonização</span>}
                </div>
                <div className="item-card-functions">
                  {item.data.functions.slice(0, 3).map((f) => (
                    <span key={f.id}>{f.name}</span>
                  ))}
                  {item.data.functions.length > 3 && <span>+{item.data.functions.length - 3}</span>}
                </div>
                <div className="item-card-actions">
                  <Button variant="secondary" onClick={() => setDetail(item)}>
                    <ScrollText size={15} /> Ver item
                  </Button>
                  {master && (
                    <>
                      <Button variant="ghost" onClick={() => setEdit(item)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Duplicar ${item.name}`}
                        onClick={() =>
                          setEdit({
                            ...fresh(duplicateDefinition(item.data)),
                            private_notes: item.private_notes ?? '',
                          })
                        }
                      >
                        <Copy size={15} />
                      </Button>
                      {!item.archived && (
                        <Button variant="gold" onClick={() => setGive(item)}>
                          <Gift size={15} /> Entregar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        disabled={busy}
                        aria-label={`${item.archived ? 'Reativar' : 'Arquivar'} ${item.name}`}
                        onClick={() =>
                          void action(
                            () => saveCampaignItem({ ...item, archived: !item.archived }, w.demo),
                            item.archived
                              ? 'Item reativado.'
                              : 'Item arquivado. Cópias já entregues foram preservadas.',
                          )
                        }
                      >
                        {item.archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            search || category || rarity
              ? 'Nenhum item corresponde aos filtros.'
              : status === 'archived'
                ? 'Nenhum item arquivado.'
                : master
                  ? 'Seu próximo tesouro começa aqui.'
                  : 'O mestre ainda não publicou itens.'
          }
          description={
            master && !search
              ? 'Crie do zero ou comece com uma poção, arma, varinha, amuleto ou item de missão.'
              : undefined
          }
          action={
            master && status === 'active' ? (
              <Button onClick={() => setEdit(fresh())}>
                <Plus size={16} /> Criar primeiro item
              </Button>
            ) : undefined
          }
        />
      )}
      <section className="panel item-delivery-history">
        <div className="panel-heading">
          <h2>Entregas aos aventureiros</h2>
          <Badge tone="muted">{collection.deliveries.length}</Badge>
        </div>
        {!deliveries.length ? (
          <p className="subtle">As entregas de itens aparecerão aqui.</p>
        ) : (
          <div className="item-delivery-table">
            {deliveries.map((d) => {
              const character = characters.find((c) => c.id === d.character_id),
                inventory = character?.sheet.inventory.find((i) => i.id === d.inventory_id);
              return (
                <div className="item-delivery-row" key={d.id}>
                  <div>
                    <strong>{d.item_name}</strong>
                    <small>
                      {character?.name ?? 'Personagem'} · {d.quantity} un. ·{' '}
                      {new Date(d.created_at).toLocaleDateString('pt-BR')}
                    </small>
                  </div>
                  <span>
                    {inventory?.charges
                      ? `${inventory.charges - (inventory.charges_used ?? 0)}/${inventory.charges} cargas`
                      : inventory
                        ? `${inventory.quantity} restantes`
                        : 'Entrega registrada'}
                  </span>
                  {master && inventory && !!inventory.charges && inventory.recharge !== 'none' && (
                    <Button
                      variant="secondary"
                      disabled={busy || !inventory.charges_used}
                      onClick={() =>
                        void action(
                          () =>
                            rechargeCampaignItem(
                              campaign.id,
                              inventory.id,
                              character!.updated_at,
                              w.demo,
                            ),
                          'Cargas restauradas pelo mestre.',
                        )
                      }
                    >
                      Restaurar cargas
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      {edit && (
        <ItemEditor
          key={edit.id}
          item={edit}
          demo={w.demo}
          onClose={() => setEdit(null)}
          onSave={async (item) => {
            await saveCampaignItem(item, w.demo);
            await collection.refresh();
            setEdit(null);
            w.notify('Item salvo no catálogo da campanha.');
          }}
        />
      )}
      {detail && (
        <Modal open title={detail.name} onClose={() => setDetail(null)} wide>
          <div className="form-stack item-detail">
            <div className="item-card-badges">
              <Badge>{detail.data.rarity ?? 'Comum'}</Badge>
              <Badge tone="muted">{ITEM_TYPES[detail.data.category]}</Badge>
              {detail.data.attunement && <Badge tone="blue">Exige sintonização</Badge>}
            </div>
            {detail.data.image_path && (
              <Cover
                path={detail.data.image_path}
                name={detail.name}
                className="item-detail-cover"
              />
            )}
            <p className="item-description">{detail.data.notes || 'Sem descrição.'}</p>
            <div className="item-detail-facts">
              <span>Peso: {detail.data.weight} kg</span>
              <span>Valor: {detail.data.cost_gp ?? 0} PO</span>
              <span>Cargas: {detail.data.charges ?? 0}</span>
              <span>Recarga: {RECHARGE_LABELS[detail.data.recharge]}</span>
            </div>
            {detail.data.damage && (
              <p>
                Dano: <strong>{detail.data.damage}</strong> · Alcance:{' '}
                {detail.data.weapon_range ?? 1.5} m
              </p>
            )}
            {detail.data.category === 'armor' && (
              <p>
                {detail.data.armor_type === 'shield' ? 'Bônus de CA do escudo' : 'CA base'}:{' '}
                {detail.data.armor_base}
              </p>
            )}
            {Object.values(detail.data.bonuses).some(Boolean) && (
              <section className="item-bonus-panel">
                <h3>Bônus passivos</h3>
                <p>
                  CA {detail.data.bonuses.ac >= 0 ? '+' : ''}
                  {detail.data.bonuses.ac} · Ataque {detail.data.bonuses.attack >= 0 ? '+' : ''}
                  {detail.data.bonuses.attack} · Dano {detail.data.bonuses.damage >= 0 ? '+' : ''}
                  {detail.data.bonuses.damage} · Deslocamento{' '}
                  {detail.data.bonuses.speed >= 0 ? '+' : ''}
                  {detail.data.bonuses.speed} m
                </p>
                <small>
                  {detail.data.passive_requires_equipped
                    ? 'Aplicam-se quando equipado.'
                    : 'Aplicam-se enquanto estiver no inventário.'}
                  {detail.data.attunement ? ' Exigem sintonização.' : ''}
                </small>
              </section>
            )}
            {detail.data.functions.map((f) => (
              <section className="item-function-detail" key={f.id}>
                <h3>
                  {f.name} <Badge tone="blue">{FUNCTION_LABELS[f.kind]}</Badge>
                </h3>
                <p>
                  {f.dice ? f.dice + ' · ' : ''}
                  {ACTION_LABELS[f.cost]} ·{' '}
                  {f.shape === 'self' ? 'Próprio usuário' : `Alcance ${f.range} m`}
                  {!['single', 'self'].includes(f.shape)
                    ? ` · ${AREA_LABELS[f.shape]} ${f.size} m`
                    : ''}
                </p>
                <small>
                  {f.charge_cost} cargas · {f.quantity_cost} unidades consumidas
                  {f.requires_equipped ? ' · equipado' : ''}
                  {f.save ? ` · salvaguarda ${f.save}` : ''}
                  {f.halfOnSave ? ' · metade ao passar' : ''}
                </small>
                <p className="item-description">{f.note}</p>
              </section>
            ))}
            {master && detail.private_notes && (
              <section className="item-secret-note">
                <h3>
                  <EyeOff size={17} /> Notas secretas do mestre
                </h3>
                <p className="item-description">{detail.private_notes}</p>
              </section>
            )}
          </div>
        </Modal>
      )}
      {give && (
        <GiveItem
          item={give}
          onClose={() => setGive(null)}
          onGiven={async () => {
            await collection.refresh();
            await w.refresh();
            setGive(null);
            w.notify('Item entregue ao inventário.');
          }}
        />
      )}
    </>
  );
}

function GiveItem({
  item,
  onClose,
  onGiven,
}: {
  item: CampaignItem;
  onClose(): void;
  onGiven(): Promise<void>;
}) {
  const w = useWorkspace(),
    characters = w.data.characters.filter((c) => c.campaign_id === item.campaign_id);
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? ''),
    [quantity, setQuantity] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const request = useRef({ signature: '', id: '' });
  return (
    <Modal
      open
      title={`Entregar ${item.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          const signature = `${characterId}:${quantity}`;
          if (request.current.signature !== signature)
            request.current = { signature, id: crypto.randomUUID() };
          try {
            await giveCampaignItem(item, characterId, quantity, request.current.id, w.demo);
            await onGiven();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox message={error} />
        <Field label="Personagem que receberá">
          <Select
            disabled={busy}
            value={characterId}
            onChange={(e) => setCharacterId(e.target.value)}
          >
            {!characters.length && <option value="">Crie um personagem primeiro</option>}
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Quantidade entregue"
          hint={
            item.data.charges ? 'Entregue cada dispositivo com cargas separadamente.' : undefined
          }
        >
          <Input
            disabled={busy}
            type="number"
            min={1}
            max={item.data.charges ? 1 : 9999}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </Field>
        <p className="subtle">
          O personagem recebe uma cópia desta versão, com suas funções e cargas. Editar o modelo
          depois não altera as cópias já entregues.
        </p>
        <div className="form-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !characterId}>
            {busy ? 'Entregando…' : 'Confirmar entrega'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
