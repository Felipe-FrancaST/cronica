'use client';
import { useState } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { Badge, Button, Empty, Field, Input, Select, Textarea } from '@/components/ui';
import type { InventoryItem } from './types';
import { ITEM_CATALOG, ITEM_TYPES, equipItem, itemUse } from './items';
import { uid } from '@/lib/utils';

export function InventoryManager({
  inventory,
  readOnly,
  onChange,
  onRemove,
}: {
  inventory: InventoryItem[];
  readOnly: boolean;
  onChange(items: InventoryItem[]): void;
  onRemove(id: string): void;
}) {
  const [type, setType] = useState(''),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState('');
  const catalog = ITEM_CATALOG.filter(
    (i) =>
      (!type || i.category === type) &&
      i.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
  );
  const candidate = catalog.find((i) => i.catalog_id === selected) ?? catalog[0];
  const update = (id: string, changes: Partial<InventoryItem>) =>
    onChange(inventory.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  return (
    <div className="form-stack inventory-manager">
      <div className="panel-heading">
        <h3>Inventário</h3>
        <Badge tone="muted">
          {inventory.reduce((n, i) => n + i.weight * i.quantity, 0).toFixed(2)} kg
        </Badge>
      </div>
      {!readOnly && (
        <section className="panel inventory-catalog">
          <h4>Adicionar ao inventário</h4>
          <div className="form-grid">
            <Field label="Tipo de item">
              <Select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setSelected('');
                }}
              >
                <option value="">Todos os tipos</option>
                {Object.entries(ITEM_TYPES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Buscar equipamento">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome do item…"
              />
            </Field>
          </div>
          <div className="inline-form">
            <Field label="Item do catálogo">
              <Select
                value={candidate?.catalog_id ?? ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                {!catalog.length && <option value="">Nenhum item encontrado</option>}
                {catalog.map((i) => (
                  <option key={i.catalog_id} value={i.catalog_id}>
                    {i.name}
                    {i.cost_gp ? ` · ${i.cost_gp} PO` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              variant="secondary"
              disabled={!candidate}
              onClick={() => {
                if (!candidate) return;
                const { use: _use, ...item } = candidate;
                onChange([...inventory, { ...item, id: uid() }]);
              }}
            >
              <Plus size={16} /> Adicionar item
            </Button>
          </div>
          {candidate && (
            <p className="subtle">
              {candidate.damage || candidate.notes || ITEM_TYPES[candidate.category]}
              {candidate.use ? ' · Pode ser usado na Mesa, com aprovação do mestre.' : ''}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              onChange([
                ...inventory,
                {
                  id: uid(),
                  name: 'Novo item',
                  category: (type || 'item') as InventoryItem['category'],
                  quantity: 1,
                  weight: 0,
                  equipped: false,
                  notes: '',
                },
              ])
            }
          >
            Criar item personalizado
          </Button>
        </section>
      )}
      {!inventory.length && <Empty title="Sua mochila ainda está vazia." />}
      {Object.entries(ITEM_TYPES).map(([category, label]) => {
        const items = inventory.filter((i) => i.category === category);
        return items.length ? (
          <section key={category} className="inventory-group">
            <h4>
              <Package size={16} /> {label} <Badge tone="muted">{items.length}</Badge>
            </h4>
            {items.map((i) => (
              <details key={i.id} className="panel inventory-entry" open={i.name === 'Novo item'}>
                <summary>
                  <strong>{i.name}</strong>
                  <span>
                    {i.quantity} un.{i.equipped ? ' · equipado' : ''}
                    {i.quantity === 0 ? ' · esgotado' : ''}
                  </span>
                  {i.damage && <small>{i.damage}</small>}
                  {itemUse(i) && <Badge tone="blue">Usável na Mesa</Badge>}
                </summary>
                <div className="form-grid form-grid-three">
                  <Field label="Nome">
                    <Input
                      value={i.name}
                      disabled={readOnly}
                      onChange={(e) => update(i.id, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Categoria">
                    <Select
                      value={i.category}
                      disabled={readOnly}
                      onChange={(e) =>
                        update(i.id, {
                          category: e.target.value as InventoryItem['category'],
                          catalog_id: undefined,
                        })
                      }
                    >
                      {Object.entries(ITEM_TYPES).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Quantidade">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={i.quantity}
                      disabled={readOnly}
                      onChange={(e) =>
                        update(i.id, {
                          quantity: Math.max(0, Math.floor(Number(e.target.value))),
                          ...(Number(e.target.value) <= 0 ? { equipped: false } : {}),
                        })
                      }
                    />
                  </Field>
                  <Field label="Peso unitário (kg)">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={i.weight}
                      disabled={readOnly}
                      onChange={(e) => update(i.id, { weight: Number(e.target.value) })}
                    />
                  </Field>
                  {i.category === 'weapon' && (
                    <>
                      <Field label="Dano">
                        <Input
                          value={i.damage ?? ''}
                          disabled={readOnly}
                          onChange={(e) => update(i.id, { damage: e.target.value })}
                        />
                      </Field>
                      <Field label="Treinamento da arma">
                        <Select
                          value={i.weapon_type ?? 'simple'}
                          disabled={readOnly}
                          onChange={(e) =>
                            update(i.id, {
                              weapon_type: e.target.value as InventoryItem['weapon_type'],
                            })
                          }
                        >
                          <option value="simple">Simples</option>
                          <option value="martial">Marcial</option>
                        </Select>
                      </Field>
                      <Field
                        label="Proficiência com esta arma"
                        hint="Outros treinamentos, como raça ou talento, podem ser informados aqui."
                      >
                        <Select
                          value={i.weapon_proficiency ?? 'auto'}
                          disabled={readOnly}
                          onChange={(e) =>
                            update(i.id, {
                              weapon_proficiency: e.target
                                .value as InventoryItem['weapon_proficiency'],
                            })
                          }
                        >
                          <option value="auto">Automática pelas classes</option>
                          <option value="proficient">
                            Treinado (raça, talento ou outra origem)
                          </option>
                          <option value="untrained">Sem proficiência</option>
                        </Select>
                      </Field>
                      <Field
                        label="Bônus adicional no ataque"
                        hint="Por exemplo, +1 de uma arma mágica; não altera o dano."
                      >
                        <Input
                          type="number"
                          min={-20}
                          max={20}
                          value={i.weapon_attack_bonus ?? 0}
                          disabled={readOnly}
                          onChange={(e) =>
                            update(i.id, {
                              weapon_attack_bonus: Math.min(
                                20,
                                Math.max(-20, Math.floor(Number(e.target.value))),
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label="Tipo de ataque">
                        <Select
                          value={i.weapon_mode ?? 'melee'}
                          disabled={readOnly}
                          onChange={(e) =>
                            update(i.id, {
                              weapon_mode: e.target.value as InventoryItem['weapon_mode'],
                            })
                          }
                        >
                          <option value="melee">Corpo a corpo</option>
                          <option value="ranged">À distância</option>
                        </Select>
                      </Field>
                      <Field label="Alcance (m)">
                        <Input
                          type="number"
                          min={0}
                          max={600}
                          step={0.5}
                          value={i.weapon_range ?? 1.5}
                          disabled={readOnly}
                          onChange={(e) => update(i.id, { weapon_range: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="Atributo da arma">
                        <Select
                          value={i.weapon_ability ?? ''}
                          disabled={readOnly}
                          onChange={(e) =>
                            update(i.id, {
                              weapon_ability: (e.target.value ||
                                undefined) as InventoryItem['weapon_ability'],
                            })
                          }
                        >
                          <option value="">Automático (Força / Destreza)</option>
                          {['str', 'dex', 'int', 'wis', 'cha'].map((a) => (
                            <option key={a} value={a}>
                              {a.toUpperCase()}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Propriedades">
                        <Input
                          value={i.properties?.join(', ') ?? ''}
                          disabled={readOnly}
                          placeholder="acuidade, leve, duas mãos…"
                          onChange={(e) =>
                            update(i.id, {
                              properties: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </Field>
                    </>
                  )}
                  {i.category === 'armor' && (
                    <>
                      <Field label="Tipo de armadura">
                        <Select
                          value={i.armor_type ?? 'light'}
                          disabled={readOnly}
                          onChange={(e) =>
                            update(i.id, {
                              armor_type: e.target.value as InventoryItem['armor_type'],
                            })
                          }
                        >
                          <option value="light">Leve</option>
                          <option value="medium">Média</option>
                          <option value="heavy">Pesada</option>
                          <option value="shield">Escudo</option>
                        </Select>
                      </Field>
                      <Field label="CA base">
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          value={i.armor_base ?? 10}
                          disabled={readOnly}
                          onChange={(e) => update(i.id, { armor_base: Number(e.target.value) })}
                        />
                      </Field>
                    </>
                  )}
                  {!!i.charges && (
                    <Field label={`Usos gastos (máximo ${i.charges})`}>
                      <Input
                        type="number"
                        min={0}
                        max={i.charges}
                        value={i.charges_used ?? 0}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(i.id, {
                            charges_used: Math.min(
                              i.charges!,
                              Math.max(0, Math.floor(Number(e.target.value))),
                            ),
                          })
                        }
                      />
                    </Field>
                  )}
                </div>
                {['weapon', 'armor', 'magic', 'focus'].includes(i.category) && (
                  <label className="visibility-label">
                    <input
                      type="checkbox"
                      checked={i.equipped}
                      disabled={readOnly || i.quantity < 1}
                      onChange={(e) => onChange(equipItem(inventory, i.id, e.target.checked))}
                    />{' '}
                    Equipado
                  </label>
                )}
                <Field label="Observações">
                  <Textarea
                    rows={2}
                    value={i.notes}
                    disabled={readOnly}
                    onChange={(e) => update(i.id, { notes: e.target.value })}
                  />
                </Field>
                {!readOnly && (
                  <Button type="button" variant="ghost" onClick={() => onRemove(i.id)}>
                    <Trash2 size={15} /> Remover item
                  </Button>
                )}
              </details>
            ))}
          </section>
        ) : null;
      })}
    </div>
  );
}
