'use client';
import { Plus, Trash2, Package, FlaskConical } from 'lucide-react';
import { Button, Field, Input, Select, Textarea, Badge } from '@/components/ui';
import type { InventoryItem } from '../dnd5e/types';
import { uid } from '@/lib/utils';
import { IngredientIcon } from './alchemy-panel';
import { isIngredient } from './ingredients';

export function ArkanisInventory({
  items,
  onChange,
  onCatalog,
  readOnly,
  allowCustom,
}: {
  items: InventoryItem[];
  onChange(items: InventoryItem[]): void;
  onCatalog(): void;
  readOnly: boolean;
  allowCustom: boolean;
}) {
  const update = (id: string, changes: Partial<InventoryItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  return (
    <section>
      <header className="arkanis-section-heading">
        <div>
          <span className="arkanis-kicker">O QUE VOCÊ CARREGA</span>
          <h2>
            <Package size={22} /> Bolsa de viagem
          </h2>
          <p>Equipamentos, objetos e ingredientes pertencentes a este personagem.</p>
        </div>
        <div className="arkanis-inline">
          <Button type="button" variant="secondary" onClick={onCatalog}>
            <FlaskConical size={17} />
            Ingredientes
          </Button>
          {!readOnly && allowCustom && (
            <Button
              type="button"
              onClick={() =>
                onChange([
                  ...items,
                  {
                    id: uid(),
                    name: 'Novo item',
                    category: 'gear',
                    quantity: 1,
                    weight: 0,
                    equipped: false,
                    notes: '',
                    tags: [],
                  },
                ])
              }
            >
              <Plus size={16} />
              Novo item
            </Button>
          )}
        </div>
      </header>
      {!items.length && (
        <div className="arkanis-empty">
          <Package size={30} />
          <h3>A bolsa está vazia.</h3>
          <p>Adicione os ingredientes do catálogo ou registre seus equipamentos.</p>
        </div>
      )}
      <div className="arkanis-bag-list">
        {items.map((item) => (
          <article className="arkanis-bag-item" key={item.id}>
            <div className="arkanis-bag-heading">
              <IngredientIcon item={item} size={48} />
              <div>
                <h3>{item.name}</h3>
                {isIngredient(item) && <Badge tone="green">ingredientes</Badge>}
                {item.campaign_item_id && <small>Entregue pelo mestre</small>}
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remover ${item.name}`}
                  onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                >
                  <Trash2 size={17} />
                </Button>
              )}
            </div>
            <fieldset disabled={readOnly} className="arkanis-item-fields">
              <Field label="Nome">
                <Input
                  value={item.name}
                  maxLength={120}
                  onChange={(e) => update(item.id, { name: e.target.value })}
                  readOnly={Boolean(item.ingredient_id || item.campaign_item_id)}
                />
              </Field>
              <Field label={`Quantidade de ${item.name}`}>
                <Input
                  type="number"
                  min={0}
                  max={9999}
                  value={item.quantity}
                  onChange={(e) => update(item.id, { quantity: Number(e.target.value) })}
                />
              </Field>
              <Field label="Peso por unidade">
                <Input
                  type="number"
                  min={0}
                  max={99999}
                  step="0.01"
                  value={item.weight}
                  onChange={(e) => update(item.id, { weight: Number(e.target.value) })}
                />
              </Field>
              <Field label="Tipo">
                <Select
                  value={item.category}
                  disabled={Boolean(item.ingredient_id || item.campaign_item_id)}
                  onChange={(e) =>
                    update(item.id, { category: e.target.value as InventoryItem['category'] })
                  }
                >
                  {Object.entries({
                    gear: 'Equipamento',
                    weapon: 'Arma',
                    armor: 'Armadura',
                    potion: 'Poção',
                    tool: 'Ferramenta',
                    consumable: 'Consumível',
                    item: 'Outro',
                    magic: 'Item mágico',
                    treasure: 'Tesouro',
                    container: 'Recipiente',
                    ammunition: 'Munição',
                    focus: 'Foco',
                  }).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="arkanis-checkbox">
                <input
                  type="checkbox"
                  checked={isIngredient(item)}
                  disabled={Boolean(item.ingredient_id || item.campaign_item_id)}
                  onChange={(e) =>
                    update(item.id, {
                      tags: e.target.checked
                        ? [
                            ...(item.tags ?? []).filter(
                              (t) => !['ingrediente', 'ingredientes'].includes(t.toLowerCase()),
                            ),
                            'ingredientes',
                          ]
                        : (item.tags ?? []).filter(
                            (t) => !['ingrediente', 'ingredientes'].includes(t.toLowerCase()),
                          ),
                    })
                  }
                />
                Usar como ingrediente
              </label>
              <Field label="Observações">
                <Textarea
                  rows={2}
                  value={item.notes}
                  readOnly={Boolean(item.campaign_item_id)}
                  onChange={(e) => update(item.id, { notes: e.target.value })}
                />
              </Field>
            </fieldset>
          </article>
        ))}
      </div>
      <p className="subtle">
        {items.reduce((sum, i) => sum + i.quantity, 0)} unidades · peso registrado{' '}
        {items.reduce((sum, i) => sum + i.quantity * i.weight, 0).toLocaleString('pt-BR')} ·
        Quantidade zero conserva o registro e o retira dos ingredientes disponíveis.
      </p>
    </section>
  );
}
