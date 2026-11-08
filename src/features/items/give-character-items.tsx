'use client';
import { useRef, useState } from 'react';
import { Gift, Search, Leaf, FlaskConical, Package, Check } from 'lucide-react';
import type { Character } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button, Modal, Field, Input, Select, ErrorBox } from '@/components/ui';
import { useCampaignItems } from './use-items';
import { giveCampaignItem, giveArkanisCatalogItem } from './repository';
import { errorMessage } from '@/lib/utils';
import { INGREDIENTS, HABITATS, normalizeSearch } from '@/systems/arkanis/ingredients';
import { POTIONS } from '@/systems/arkanis/potions';
import { isArkanisSheet } from '@/systems/arkanis/rules';
import { arkanisGiftDefinition } from '@/systems/arkanis/catalog-gifts';
import './give-character-items.css';
export function GiveCharacterItems({
  character,
  onClose,
}: {
  character: Character;
  onClose(): void;
}) {
  const w = useWorkspace();
  const catalog = useCampaignItems(character.campaign_id, w.demo);
  const arkanis = isArkanisSheet(character.sheet);
  const [kind, setKind] = useState(arkanis ? 'ingredients' : 'campaign');
  const [query, setQuery] = useState(''),
    [habitat, setHabitat] = useState(''),
    [level, setLevel] = useState('');
  const [itemId, setItemId] = useState(''),
    [quantity, setQuantity] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const request = useRef({ signature: '', id: '' });
  const lock = useRef(false);
  const term = normalizeSearch(query.trim());
  const items =
    kind === 'ingredients'
      ? INGREDIENTS.filter(
          (i) =>
            (!habitat || i.habitat_id === habitat) &&
            normalizeSearch(`${i.name} ${i.affinities} ${i.habitat}`).includes(term),
        ).map((i) => ({ id: i.id, name: i.name, subtitle: i.habitat, icon: i.icon }))
      : kind === 'potions'
        ? POTIONS.filter(
            (i) =>
              (!level || String(i.level) === level) &&
              normalizeSearch(`${i.name} ${i.effect} ${i.ingredients.join(' ')}`).includes(term),
          ).map((i) => ({
            id: i.id,
            name: i.name,
            subtitle: `Nível ${i.level} · ${i.use}`,
            icon: i.icon,
          }))
        : catalog.items
            .filter(
              (i) => !i.archived && normalizeSearch(`${i.name} ${i.data.notes}`).includes(term),
            )
            .map((i) => ({ id: i.id, name: i.name, subtitle: 'Item da campanha', icon: null }));
  const selected = items.find((i) => i.id === itemId);
  const campaignItem = kind === 'campaign' ? catalog.items.find((i) => i.id === itemId) : undefined;
  const data = selected
    ? kind === 'campaign'
      ? campaignItem?.data
      : arkanisGiftDefinition(selected.id)
    : undefined;
  function changeFilter(update: () => void) {
    update();
    setItemId('');
  }
  return (
    <Modal
      open
      wide
      title={`Dar itens a ${character.name}`}
      description="Escolha o item, confira os detalhes e defina a quantidade."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="gift-catalog"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current || !selected || !data) return;
          lock.current = true;
          setBusy(true);
          setError(null);
          const signature = `${kind}:${selected.id}:${campaignItem?.version ?? 0}:${quantity}`;
          if (request.current.signature !== signature)
            request.current = { signature, id: crypto.randomUUID() };
          try {
            if (kind === 'campaign' && campaignItem)
              await giveCampaignItem(
                campaignItem,
                character.id,
                quantity,
                request.current.id,
                w.demo,
              );
            else
              await giveArkanisCatalogItem(
                character.id,
                character.campaign_id,
                selected.id,
                quantity,
                request.current.id,
                w.demo,
              );
            await w.refresh();
            w.notify(`${quantity} × ${selected.name} entregue a ${character.name}.`);
            onClose();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <ErrorBox message={error || (kind === 'campaign' ? catalog.error : null)} />
        {arkanis && (
          <div className="gift-categories" aria-label="Tipo de item">
            {[
              { id: 'ingredients', label: 'Ingredientes', count: 180, Icon: Leaf },
              { id: 'potions', label: 'Poções', count: 75, Icon: FlaskConical },
              {
                id: 'campaign',
                label: 'Da campanha',
                count: catalog.items.filter((i) => !i.archived).length,
                Icon: Package,
              },
            ].map(({ id, label, count, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={kind === id}
                disabled={busy}
                onClick={() =>
                  changeFilter(() => {
                    setKind(id);
                    setQuery('');
                  })
                }
              >
                <Icon size={18} />
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="gift-filters">
          <Field label="Buscar item">
            <div className="gift-search">
              <Search size={17} />
              <Input
                aria-label="Buscar item"
                placeholder="Nome, efeito ou ingrediente…"
                value={query}
                disabled={busy}
                onChange={(e) => changeFilter(() => setQuery(e.target.value))}
              />
            </div>
          </Field>
          {kind === 'ingredients' && (
            <Field label="Localidade dos ingredientes">
              <Select
                value={habitat}
                disabled={busy}
                onChange={(e) => changeFilter(() => setHabitat(e.target.value))}
              >
                <option value="">Todas as localidades</option>
                {HABITATS.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {kind === 'potions' && (
            <Field label="Nível da poção">
              <Select
                value={level}
                disabled={busy}
                onChange={(e) => changeFilter(() => setLevel(e.target.value))}
              >
                <option value="">Todos os níveis</option>
                <option value="1">I · Básicas</option>
                <option value="2">II · Aprimoradas</option>
                <option value="3">III · Superiores</option>
              </Select>
            </Field>
          )}
        </div>
        <p className="subtle" role="status">
          {items.length} {items.length === 1 ? 'item encontrado' : 'itens encontrados'}
          {kind === 'ingredients'
            ? ' · Filtre pela região de origem.'
            : kind === 'potions'
              ? ' · Poções prontas para entregar.'
              : ''}
        </p>
        <div className="gift-body">
          <div className="gift-grid" aria-label="Itens disponíveis">
            {items.map((i) => (
              <button
                key={i.id}
                type="button"
                aria-pressed={itemId === i.id}
                aria-label={`Selecionar ${i.name}`}
                disabled={busy}
                onClick={() => setItemId(i.id)}
              >
                {i.icon ? (
                  <img src={i.icon} alt="" width={44} height={48} loading="lazy" />
                ) : (
                  <Package size={28} />
                )}
                <span>
                  <strong>{i.name}</strong>
                  <small>{i.subtitle}</small>
                </span>
                {itemId === i.id && <Check size={15} />}
              </button>
            ))}
            {!items.length && (
              <p className="gift-empty">
                {kind === 'campaign' && catalog.loading
                  ? 'Carregando…'
                  : 'Nenhum item encontrado. Tente outro nome ou filtro.'}
              </p>
            )}
          </div>
          <aside className="gift-preview">
            {selected && data ? (
              <>
                {selected.icon ? (
                  <img src={selected.icon} alt="" width={72} height={86} />
                ) : (
                  <Package size={44} />
                )}
                <span className="gift-eyebrow">ENTREGAR A {character.name}</span>
                <h3>{selected.name}</h3>
                <p>{data.notes}</p>
                <Field label="Quantidade entregue">
                  <Input
                    type="number"
                    min={1}
                    max={data.charges ? 1 : 9999}
                    step={1}
                    disabled={busy}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </Field>
              </>
            ) : (
              <>
                <Gift size={40} />
                <h3>Um presente para a jornada</h3>
                <p>Selecione um item para ver os detalhes e escolher a quantidade.</p>
              </>
            )}
          </aside>
        </div>
        <div className="form-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !selected || !data}>
            <Gift size={16} />
            {busy ? 'Entregando…' : 'Entregar itens'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
