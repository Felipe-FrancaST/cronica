'use client';

import { useState } from 'react';
import {
  Backpack,
  Check,
  ChevronDown,
  Package,
  Plus,
  Search,
  Shield,
  Sparkles,
  Sword,
  Trash2,
} from 'lucide-react';
import type { InventoryItem } from '@/systems/dnd5e/types';
import { ITEM_CATALOG, ITEM_TYPES, equipItem, type CatalogItem } from '@/systems/dnd5e/items';
import { uid } from '@/lib/utils';
import { suggestedNpcArmorClass } from '@/lib/npc-equipment';
import { Button, Field, Input, Select, Textarea } from './ui';

type Filter = 'all' | InventoryItem['category'];
const categories: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'weapon', label: 'Armas' },
  { value: 'armor', label: 'Armaduras' },
  { value: 'potion', label: 'Poções' },
  { value: 'gear', label: 'Aventura' },
  { value: 'magic', label: 'Mágicos' },
];

function itemIcon(category: InventoryItem['category']) {
  if (category === 'weapon' || category === 'ammunition') return <Sword size={19} />;
  if (category === 'armor') return <Shield size={19} />;
  if (category === 'magic' || category === 'potion' || category === 'focus')
    return <Sparkles size={19} />;
  return <Package size={19} />;
}

export function NpcEquipmentEditor({
  equipment,
  inventoryNotes,
  readOnly,
  onChange,
  onNotesChange,
  onCreateAttack,
  dexterity,
  armorClass,
  onApplyArmorClass,
}: {
  equipment: InventoryItem[];
  inventoryNotes: string;
  readOnly: boolean;
  onChange(next: InventoryItem[]): void;
  onNotesChange(next: string): void;
  onCreateAttack?(item: InventoryItem): void;
  dexterity: number;
  armorClass: number;
  onApplyArmorClass(value: number): void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<InventoryItem['category']>('gear');
  const [customId, setCustomId] = useState<string | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);

  const suggestedAc = suggestedNpcArmorClass(equipment, dexterity);
  const weight = equipment.reduce((total, item) => total + item.weight * item.quantity, 0);
  const itemsCount = equipment.reduce((total, item) => total + item.quantity, 0);
  const equippedCount = equipment.filter((item) => item.equipped && item.quantity > 0).length;
  const normalized = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const matches = ITEM_CATALOG.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    const label = `${item.name} ${ITEM_TYPES[item.category]}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return label.includes(normalized);
  });
  const visible = expanded ? matches : matches.slice(0, 6);

  function update(id: string, changes: Partial<InventoryItem>) {
    onChange(equipment.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }
  function add(item: CatalogItem) {
    const old = equipment.find((entry) => entry.catalog_id === item.catalog_id);
    if (old) {
      update(old.id, { quantity: Math.min(old.quantity + 1, 9999) });
    } else {
      const { use: _use, ...data } = item;
      onChange([...equipment, { ...data, id: uid() }]);
    }
    setRecentlyAdded(item.catalog_id);
  }
  function addCustom() {
    if (!customName.trim()) return;
    const id = uid();
    onChange([
      ...equipment,
      {
        id,
        name: customName.trim(),
        category: customCategory,
        quantity: 1,
        weight: 0,
        equipped: false,
        notes: '',
      },
    ]);
    setCustomId(id);
    setCustomName('');
    setCreating(false);
  }

  return (
    <div className="npc-equipment-editor form-stack">
      <div className="npc-section-intro">
        <div>
          <span className="npc-kicker">ARSENAL E PERTENCES</span>
          <h3>Equipamentos do NPC</h3>
          <p>Escolha no catálogo, ajuste quantidades e indique o que está equipado.</p>
        </div>
        <div className="npc-equipment-total" aria-label="Resumo do equipamento">
          <span>
            <Backpack size={16} /> {itemsCount} un.
          </span>
          <span>
            <Check size={16} /> {equippedCount} equipado(s)
          </span>
          <span>{weight.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg</span>
        </div>
      </div>

      {!readOnly && (
        <section className="npc-catalog" aria-label="Catálogo de equipamentos">
          <div className="npc-catalog-heading">
            <div>
              <h4>Adicionar do catálogo</h4>
              <p>Encontre armas, armaduras, poções e objetos prontos para usar.</p>
            </div>
            <span className="npc-catalog-count">{matches.length} disponíveis</span>
          </div>
          <label className="npc-equipment-search">
            <Search size={18} aria-hidden="true" />
            <Input
              type="search"
              value={query}
              placeholder="Buscar item pelo nome…"
              aria-label="Buscar equipamento no catálogo"
              onChange={(event) => {
                setQuery(event.target.value);
                setExpanded(false);
              }}
            />
          </label>
          <div className="npc-category-filters" aria-label="Filtrar por tipo">
            {categories.map((entry) => (
              <button
                type="button"
                key={entry.value}
                className={`npc-filter-chip ${category === entry.value ? 'is-active' : ''}`}
                aria-pressed={category === entry.value}
                onClick={() => {
                  setCategory(entry.value);
                  setExpanded(false);
                }}
              >
                {entry.label}
              </button>
            ))}
            <Select
              className="npc-category-more"
              aria-label="Mais categorias de itens"
              value={categories.some((entry) => entry.value === category) ? '' : category}
              searchable={false}
              onChange={(event) => {
                setCategory(event.target.value as Filter);
                setExpanded(false);
              }}
            >
              <option value="">Outros tipos…</option>
              {Object.entries(ITEM_TYPES)
                .filter(([id]) => !categories.some((entry) => entry.value === id))
                .map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
            </Select>
          </div>
          {matches.length ? (
            <>
              <div className="npc-catalog-grid">
                {visible.map((item) => (
                  <article key={item.catalog_id} className="npc-catalog-item">
                    <span className="npc-item-icon">{itemIcon(item.category)}</span>
                    <div className="npc-catalog-item-copy">
                      <strong>{item.name}</strong>
                      <small>
                        {ITEM_TYPES[item.category]}
                        {item.damage ? ` · ${item.damage}` : ''}
                      </small>
                    </div>
                    <button
                      className="npc-catalog-add"
                      type="button"
                      aria-label={`Adicionar ${item.name}`}
                      title={`Adicionar ${item.name}`}
                      onClick={() => add(item)}
                    >
                      {recentlyAdded === item.catalog_id ? <Check size={18} /> : <Plus size={18} />}
                    </button>
                  </article>
                ))}
              </div>
              {matches.length > 6 && (
                <Button
                  className="npc-show-more"
                  type="button"
                  variant="ghost"
                  onClick={() => setExpanded((v) => !v)}
                >
                  <ChevronDown className={expanded ? 'npc-chevron-up' : ''} size={16} />
                  {expanded ? 'Mostrar menos' : `Ver todos os ${matches.length} itens`}
                </Button>
              )}
            </>
          ) : (
            <div className="npc-empty-equip">
              Nenhum item encontrado. Experimente outro termo ou crie um item personalizado.
            </div>
          )}
          <div className="npc-custom-create">
            {creating ? (
              <div className="npc-custom-fields">
                <Field label="Nome do novo item">
                  <Input
                    value={customName}
                    autoFocus
                    maxLength={120}
                    placeholder="Ex.: Espada do capitão"
                    onChange={(event) => setCustomName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addCustom();
                      }
                    }}
                  />
                </Field>
                <Field label="Categoria">
                  <Select
                    searchable={false}
                    value={customCategory}
                    onChange={(event) =>
                      setCustomCategory(event.target.value as InventoryItem['category'])
                    }
                  >
                    {Object.entries(ITEM_TYPES).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="npc-custom-actions">
                  <Button type="button" onClick={addCustom} disabled={!customName.trim()}>
                    <Plus size={16} /> Criar
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setCreating(true)}>
                <Plus size={16} /> Criar item personalizado
              </Button>
            )}
          </div>
        </section>
      )}

      {suggestedAc !== null && suggestedAc !== armorClass && (
        <div className="npc-armor-suggestion">
          <div>
            <strong>
              <Shield size={17} /> CA sugerida: {suggestedAc}
            </strong>
            <p>Calculada pela armadura, escudo e Destreza equipados. A CA atual é {armorClass}.</p>
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onApplyArmorClass(suggestedAc)}
            >
              Aplicar CA {suggestedAc}
            </Button>
          )}
        </div>
      )}
      <section className="npc-backpack" aria-label="Itens do NPC">
        <div className="npc-backpack-heading">
          <h4>
            <Backpack size={19} /> Itens na ficha
          </h4>
          <span>{equipment.length} tipo(s) de item</span>
        </div>
        {equipment.length === 0 ? (
          <div className="npc-empty-equip">
            <Package size={26} />
            <strong>Este NPC ainda não tem equipamentos.</strong>
            <span>
              {readOnly
                ? 'Nenhum item registrado.'
                : 'Use a busca acima para adicionar o primeiro item.'}
            </span>
          </div>
        ) : (
          <div className="npc-owned-items">
            {equipment.map((item) => (
              <article className="npc-owned-item" key={item.id}>
                <span className="npc-item-icon">{itemIcon(item.category)}</span>
                <div className="npc-owned-main">
                  <strong>{item.name}</strong>
                  <small>
                    {ITEM_TYPES[item.category]}
                    {item.damage ? ` · ${item.damage}` : ''}
                  </small>
                  {item.equipped && (
                    <span className="npc-equipped-label">
                      <Check size={13} /> Equipado
                    </span>
                  )}
                </div>
                <div className="npc-item-actions">
                  {readOnly && <span className="npc-readonly-quantity">{item.quantity} un.</span>}
                  {!readOnly && (
                    <>
                      <label className="npc-quantity">
                        <span>Qtd.</span>
                        <Input
                          type="number"
                          min={0}
                          max={9999}
                          step={1}
                          aria-label={`Quantidade de ${item.name}`}
                          value={item.quantity}
                          onChange={(event) => {
                            const quantity = Math.max(
                              0,
                              Math.min(9999, Math.floor(Number(event.target.value) || 0)),
                            );
                            update(item.id, {
                              quantity,
                              ...(quantity === 0 ? { equipped: false } : {}),
                            });
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className={`npc-equip-button ${item.equipped ? 'is-active' : ''}`}
                        disabled={item.quantity === 0}
                        aria-pressed={item.equipped}
                        aria-label={`${item.equipped ? 'Desequipar' : 'Equipar'} ${item.name}`}
                        onClick={() => onChange(equipItem(equipment, item.id, !item.equipped))}
                      >
                        <Check size={15} /> {item.equipped ? 'Desequipar' : 'Equipar'}
                      </button>
                      <button
                        className="npc-delete-equipment"
                        type="button"
                        aria-label={`Remover ${item.name}`}
                        title={`Remover ${item.name} da ficha`}
                        onClick={() => onChange(equipment.filter((entry) => entry.id !== item.id))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
                <details
                  className="npc-item-details"
                  open={customId === item.id ? true : undefined}
                  onToggle={(event) => {
                    if (!event.currentTarget.open && customId === item.id) setCustomId(null);
                  }}
                >
                  <summary>Detalhes {readOnly ? 'do item' : 'e ajustes'}</summary>
                  <div className="form-grid">
                    <Field label="Nome">
                      <Input
                        disabled={readOnly}
                        maxLength={120}
                        value={item.name}
                        onChange={(event) => update(item.id, { name: event.target.value })}
                      />
                    </Field>
                    <Field label="Categoria">
                      <Select
                        searchable={false}
                        disabled={readOnly}
                        value={item.category}
                        onChange={(event) =>
                          update(item.id, {
                            category: event.target.value as InventoryItem['category'],
                            catalog_id: undefined,
                          })
                        }
                      >
                        {Object.entries(ITEM_TYPES).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Peso por unidade (kg)">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        disabled={readOnly}
                        value={item.weight}
                        onChange={(event) =>
                          update(item.id, { weight: Math.max(0, Number(event.target.value) || 0) })
                        }
                      />
                    </Field>
                    {(item.category === 'weapon' || item.category === 'ammunition') && (
                      <Field label="Dano">
                        <Input
                          disabled={readOnly}
                          placeholder="Ex.: 1d8 cortante"
                          value={item.damage ?? ''}
                          onChange={(event) => update(item.id, { damage: event.target.value })}
                        />
                      </Field>
                    )}
                    {item.category === 'armor' && (
                      <>
                        <Field label="Tipo de armadura">
                          <Select
                            searchable={false}
                            disabled={readOnly}
                            value={item.armor_type ?? 'light'}
                            onChange={(event) =>
                              update(item.id, {
                                armor_type: event.target.value as InventoryItem['armor_type'],
                              })
                            }
                          >
                            <option value="light">Leve</option>
                            <option value="medium">Média</option>
                            <option value="heavy">Pesada</option>
                            <option value="shield">Escudo</option>
                          </Select>
                        </Field>
                        <Field label="CA base / bônus de escudo">
                          <Input
                            type="number"
                            min={0}
                            max={40}
                            disabled={readOnly}
                            value={item.armor_base ?? 0}
                            onChange={(event) =>
                              update(item.id, {
                                armor_base: Math.max(0, Number(event.target.value) || 0),
                              })
                            }
                          />
                        </Field>
                      </>
                    )}
                    <div className="full-width">
                      <Field label="Descrição e anotações">
                        <Textarea
                          disabled={readOnly}
                          value={item.notes}
                          placeholder="Características, propriedades, origem..."
                          onChange={(event) => update(item.id, { notes: event.target.value })}
                        />
                      </Field>
                    </div>
                  </div>
                  {!readOnly && item.category === 'weapon' && item.damage && onCreateAttack && (
                    <Button type="button" variant="secondary" onClick={() => onCreateAttack(item)}>
                      <Sword size={16} /> Criar ataque com esta arma
                    </Button>
                  )}
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
      <details className="npc-advanced-card">
        <summary>Objetos narrativos e anotações livres</summary>
        <div className="npc-advanced-content">
          <Field
            label="Pertences não catalogados / observações"
            hint="As anotações antigas dos NPCs continuam aqui. Não alteram os equipamentos acima."
          >
            <Textarea
              disabled={readOnly}
              value={inventoryNotes}
              placeholder="Ex.: carrega a chave secreta da torre..."
              onChange={(event) => onNotesChange(event.target.value)}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}
