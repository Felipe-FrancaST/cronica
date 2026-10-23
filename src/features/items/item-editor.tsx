'use client';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2, Sparkles, Shield, Swords, ScrollText, LockKeyhole } from 'lucide-react';
import { Button, Field, Input, Select, Textarea, ErrorBox, Modal, Badge } from '@/components/ui';
import { ImageField } from '@/components/media';
import { uploadImage } from '@/services/storage';
import { ITEM_CATALOG, ITEM_TYPES } from '@/systems/dnd5e/items';
import { errorMessage } from '@/lib/utils';
import {
  ACTION_LABELS,
  FUNCTION_LABELS,
  ITEM_RARITIES,
  ITEM_STARTERS,
  RECHARGE_LABELS,
  definitionFromCatalog,
  itemDefinitionErrors,
  newItemFunction,
} from './model';
import type { CampaignItem, ItemDefinition, ItemFunction } from './types';

export function ItemEditor({
  item,
  demo,
  onClose,
  onSave,
}: {
  item: CampaignItem;
  demo: boolean;
  onClose(): void;
  onSave(item: CampaignItem): Promise<void>;
}) {
  const [data, setData] = useState<ItemDefinition>(() => structuredClone(item.data));
  const [tagsText, setTagsText] = useState(item.data.tags.join(', ')),
    [propertiesText, setPropertiesText] = useState(item.data.properties?.join(', ') ?? '');
  const [visible, setVisible] = useState(item.visible_to_players),
    [secret, setSecret] = useState(item.private_notes ?? '');
  const [tab, setTab] = useState('identity'),
    [template, setTemplate] = useState('blank');
  const [image, setImage] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const update = (changes: Partial<ItemDefinition>) => setData((old) => ({ ...old, ...changes }));
  const updateFunction = (id: string, changes: Partial<ItemFunction>) =>
    update({ functions: data.functions.map((f) => (f.id === id ? { ...f, ...changes } : f)) });
  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errors = itemDefinitionErrors(data);
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setBusy(true);
    try {
      const image_path = image
        ? await uploadImage(image, 'campaigns', item.campaign_id, demo)
        : data.image_path;
      await onSave({
        ...item,
        name: data.name.trim(),
        data: { ...data, name: data.name.trim(), image_path },
        visible_to_players: visible,
        private_notes: secret,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const number = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    min = 0,
    max = 999,
    step = 1,
  ) => (
    <Field label={label}>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
  return (
    <Modal
      open
      title={item.version ? 'Editar item' : 'Criar item'}
      description="Defina a identidade, os equipamentos e as funções que seus aventureiros poderão usar."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form onSubmit={save} className="form-stack campaign-item-form">
        <ErrorBox message={error} />
        <div className="item-editor-tabs" role="tablist" aria-label="Configuração do item">
          {[
            ['identity', 'Identidade', ScrollText],
            ['equipment', 'Equipamento', Swords],
            ['functions', 'Funções e bônus', Sparkles],
            ['secrets', 'Visibilidade e segredos', LockKeyhole],
          ].map(([id, label, Icon]) => {
            const Symbol = Icon as typeof ScrollText;
            return (
              <button
                key={String(id)}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(String(id))}
              >
                <Symbol size={15} />
                {String(label)}
              </button>
            );
          })}
        </div>
        <fieldset disabled={busy} className="item-form-fields">
          {tab === 'identity' && (
            <div className="form-stack">
              {!item.version && (
                <Field
                  label="Começar de um modelo"
                  hint="Os modelos são editáveis. Ajuste os valores e as funções para sua campanha."
                >
                  <Select
                    value={template}
                    onChange={(e) => {
                      setTemplate(e.target.value);
                      const starter = ITEM_STARTERS.find((t) => t.id === e.target.value);
                      const next = starter
                        ? starter.create()
                        : definitionFromCatalog(
                            ITEM_CATALOG.find((c) => c.catalog_id === e.target.value.slice(4))!,
                          );
                      setData(next);
                      setTagsText(next.tags.join(', '));
                      setPropertiesText(next.properties?.join(', ') ?? '');
                    }}
                  >
                    <optgroup label="Modelos da oficina">
                      {ITEM_STARTERS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Equipamentos do catálogo">
                      {ITEM_CATALOG.map((c) => (
                        <option key={c.catalog_id} value={'cat:' + c.catalog_id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  </Select>
                </Field>
              )}
              <div className="form-grid">
                <Field label="Nome do item">
                  <Input
                    value={data.name}
                    maxLength={100}
                    placeholder="Ex.: Varinha das brasas"
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </Field>
                <Field label="Categoria do item">
                  <Select
                    value={data.category}
                    onChange={(e) =>
                      update({
                        category: e.target.value as ItemDefinition['category'],
                        ...(e.target.value === 'weapon'
                          ? {
                              damage: data.damage ?? '1d6 cortante',
                              weapon_type: data.weapon_type ?? 'simple',
                              weapon_mode: data.weapon_mode ?? 'melee',
                              weapon_range: data.weapon_range ?? 1.5,
                            }
                          : {}),
                        ...(e.target.value === 'armor'
                          ? {
                              armor_type: data.armor_type ?? 'light',
                              armor_base: data.armor_base ?? 11,
                            }
                          : {}),
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
                <Field label="Raridade">
                  <Select
                    value={data.rarity ?? 'Comum'}
                    onChange={(e) => update({ rarity: e.target.value })}
                  >
                    {ITEM_RARITIES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
                {number(
                  'Peso unitário (kg)',
                  data.weight,
                  (v) => update({ weight: v }),
                  0,
                  100000,
                  0.01,
                )}
                {number(
                  'Valor unitário (PO)',
                  data.cost_gp ?? 0,
                  (v) => update({ cost_gp: v }),
                  0,
                  1000000000,
                  0.01,
                )}
                <Field label="Etiquetas" hint="Separe por vírgulas: missão, amaldiçoado, tesouro…">
                  <Input
                    value={tagsText}
                    maxLength={500}
                    onChange={(e) => {
                      setTagsText(e.target.value);
                      update({
                        tags: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      });
                    }}
                  />
                </Field>
              </div>
              <Field label="Descrição e regras do item">
                <Textarea
                  rows={6}
                  value={data.notes}
                  maxLength={12000}
                  placeholder="Origem, aparência, propriedades, requisitos e regras especiais…"
                  onChange={(e) => update({ notes: e.target.value })}
                />
              </Field>
              <ImageField
                value={image}
                label="Imagem do item"
                current={image?.name ?? data.image_path}
                onChange={setImage}
                onError={setError}
              />
              {data.image_path && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    update({ image_path: null });
                    setImage(null);
                  }}
                >
                  Remover imagem
                </Button>
              )}
            </div>
          )}
          {tab === 'equipment' && (
            <div className="form-stack">
              <p className="subtle">
                Armas e armaduras aparecem nos controles já existentes da ficha e da Mesa.
              </p>
              {data.category === 'weapon' ? (
                <div className="form-grid">
                  <Field
                    label="Dano da arma"
                    hint="Ex.: 1d8+1 cortante. O atributo do ataque é acrescentado pelas regras da ficha."
                  >
                    <Input
                      value={data.damage ?? ''}
                      onChange={(e) => update({ damage: e.target.value })}
                    />
                  </Field>
                  <Field label="Tipo de arma">
                    <Select
                      value={data.weapon_type ?? 'simple'}
                      onChange={(e) =>
                        update({ weapon_type: e.target.value as ItemDefinition['weapon_type'] })
                      }
                    >
                      <option value="simple">Simples</option>
                      <option value="martial">Marcial</option>
                    </Select>
                  </Field>
                  <Field label="Modo de ataque">
                    <Select
                      value={data.weapon_mode ?? 'melee'}
                      onChange={(e) =>
                        update({ weapon_mode: e.target.value as ItemDefinition['weapon_mode'] })
                      }
                    >
                      <option value="melee">Corpo a corpo</option>
                      <option value="ranged">À distância</option>
                    </Select>
                  </Field>
                  {number(
                    'Alcance da arma (m)',
                    data.weapon_range ?? 1.5,
                    (v) => update({ weapon_range: v }),
                    0,
                    600,
                    0.5,
                  )}
                  {number(
                    'Bônus de ataque da arma',
                    data.weapon_attack_bonus ?? 0,
                    (v) => update({ weapon_attack_bonus: v }),
                    -20,
                    20,
                  )}
                  <Field label="Atributo da arma">
                    <Select
                      value={data.weapon_ability ?? ''}
                      onChange={(e) =>
                        update({
                          weapon_ability: (e.target.value ||
                            undefined) as ItemDefinition['weapon_ability'],
                        })
                      }
                    >
                      <option value="">Automático</option>
                      {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => (
                        <option key={a} value={a}>
                          {a.toUpperCase()}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Propriedades da arma">
                    <Input
                      value={propertiesText}
                      placeholder="acuidade, leve, arremesso…"
                      onChange={(e) => {
                        setPropertiesText(e.target.value);
                        update({
                          properties: e.target.value
                            .split(',')
                            .map((v) => v.trim())
                            .filter(Boolean),
                        });
                      }}
                    />
                  </Field>
                  <Field label="Dano versátil">
                    <Input
                      value={data.versatile_damage ?? ''}
                      placeholder="Ex.: 1d10"
                      onChange={(e) => update({ versatile_damage: e.target.value })}
                    />
                  </Field>
                </div>
              ) : data.category === 'armor' ? (
                <div className="form-grid">
                  <Field label="Tipo de armadura">
                    <Select
                      value={data.armor_type ?? 'light'}
                      onChange={(e) =>
                        update({ armor_type: e.target.value as ItemDefinition['armor_type'] })
                      }
                    >
                      <option value="light">Leve</option>
                      <option value="medium">Média</option>
                      <option value="heavy">Pesada</option>
                      <option value="shield">Escudo</option>
                    </Select>
                  </Field>
                  {number(
                    data.armor_type === 'shield' ? 'Bônus de CA do escudo' : 'CA base da armadura',
                    data.armor_base ?? 11,
                    (v) => update({ armor_base: v }),
                    0,
                    50,
                  )}
                </div>
              ) : (
                <p>
                  Escolha a categoria Armas ou Armaduras e escudos em Identidade para configurar
                  este equipamento. Outros itens também podem conceder bônus na próxima aba.
                </p>
              )}
              <label className="vtt-check">
                <input
                  type="checkbox"
                  checked={!!data.attunement}
                  onChange={(e) => update({ attunement: e.target.checked })}
                />{' '}
                Exigir sintonização para funções e bônus
              </label>
            </div>
          )}
          {tab === 'functions' && (
            <div className="form-stack">
              <section className="item-bonus-panel">
                <h3>
                  <Shield size={17} /> Bônus passivos
                </h3>
                <small>
                  Entram nos cálculos da ficha e dos ataques. Os ajustes de ataque e dano valem para
                  ataques com armas.
                </small>
                <div className="form-grid form-grid-three">
                  {number(
                    'Bônus de CA',
                    data.bonuses.ac,
                    (v) => update({ bonuses: { ...data.bonuses, ac: v } }),
                    -20,
                    20,
                  )}
                  {number(
                    'Bônus de ataque',
                    data.bonuses.attack,
                    (v) => update({ bonuses: { ...data.bonuses, attack: v } }),
                    -20,
                    20,
                  )}
                  {number(
                    'Bônus de dano',
                    data.bonuses.damage,
                    (v) => update({ bonuses: { ...data.bonuses, damage: v } }),
                    -20,
                    20,
                  )}
                  {number(
                    'Ajuste de deslocamento (m)',
                    data.bonuses.speed,
                    (v) => update({ bonuses: { ...data.bonuses, speed: v } }),
                    -120,
                    120,
                    0.5,
                  )}
                </div>
                <label className="vtt-check">
                  <input
                    type="checkbox"
                    checked={data.passive_requires_equipped}
                    onChange={(e) => update({ passive_requires_equipped: e.target.checked })}
                  />{' '}
                  Aplicar bônus somente quando equipado
                </label>
              </section>
              <div className="form-grid">
                {number(
                  'Capacidade de cargas',
                  data.charges ?? 0,
                  (v) => update({ charges: v }),
                  0,
                  999,
                )}
                <Field
                  label="Condição de recarga"
                  hint="O mestre restaura as cargas na seção de entregas, após conferir esta condição."
                >
                  <Select
                    value={data.recharge}
                    onChange={(e) =>
                      update({ recharge: e.target.value as ItemDefinition['recharge'] })
                    }
                  >
                    {Object.entries(RECHARGE_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="panel-heading">
                <h3>
                  Funções ao usar <Badge tone="muted">{data.functions.length}/12</Badge>
                </h3>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={data.functions.length >= 12}
                  onClick={() => update({ functions: [...data.functions, newItemFunction()] })}
                >
                  <Plus size={15} /> Adicionar função
                </Button>
              </div>
              {!data.functions.length && (
                <p className="subtle">
                  Adicione cura, dano, PV temporários ou um efeito narrativo. Um mesmo item pode
                  oferecer várias opções.
                </p>
              )}
              {data.functions.map((fn, index) => (
                <section
                  className="item-function-editor"
                  key={fn.id}
                  aria-label={`Função ${index + 1}`}
                >
                  <div className="panel-heading">
                    <strong>Função {index + 1}</strong>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remover função ${index + 1}`}
                      onClick={() =>
                        update({ functions: data.functions.filter((f) => f.id !== fn.id) })
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  <div className="form-grid">
                    <Field label={`Nome da função ${index + 1}`}>
                      <Input
                        value={fn.name}
                        maxLength={80}
                        onChange={(e) => updateFunction(fn.id, { name: e.target.value })}
                      />
                    </Field>
                    <Field label={`Efeito da função ${index + 1}`}>
                      <Select
                        value={fn.kind}
                        onChange={(e) =>
                          updateFunction(fn.id, {
                            kind: e.target.value as ItemFunction['kind'],
                            dice: e.target.value === 'utility' ? '' : fn.dice || '1d6',
                          })
                        }
                      >
                        {Object.entries(FUNCTION_LABELS).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {fn.kind !== 'utility' && (
                      <Field label={`Dados da função ${index + 1}`}>
                        <Input
                          value={fn.dice}
                          placeholder="Ex.: 2d6+3"
                          maxLength={200}
                          onChange={(e) => updateFunction(fn.id, { dice: e.target.value })}
                        />
                      </Field>
                    )}
                    <Field label={`Ação da função ${index + 1}`}>
                      <Select
                        value={fn.cost}
                        onChange={(e) =>
                          updateFunction(fn.id, { cost: e.target.value as ItemFunction['cost'] })
                        }
                      >
                        {Object.entries(ACTION_LABELS).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={`Área da função ${index + 1}`}>
                      <Select
                        value={fn.shape}
                        onChange={(e) =>
                          updateFunction(fn.id, {
                            shape: e.target.value as ItemFunction['shape'],
                            origin: ['self', 'cone', 'line'].includes(e.target.value)
                              ? 'self'
                              : 'point',
                            ...(e.target.value === 'self' ? { range: 0 } : {}),
                          })
                        }
                      >
                        {[
                          ['single', 'Uma criatura'],
                          ['self', 'O próprio usuário'],
                          ['sphere', 'Esfera'],
                          ['cone', 'Cone'],
                          ['line', 'Linha'],
                          ['cube', 'Cubo'],
                        ].map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {number(
                      `Alcance da função ${index + 1} (m)`,
                      fn.range,
                      (v) => updateFunction(fn.id, { range: v }),
                      0,
                      600,
                      0.5,
                    )}
                    {!['single', 'self'].includes(fn.shape) && (
                      <>
                        <Field label={`Origem da área ${index + 1}`}>
                          <Select
                            value={fn.origin}
                            onChange={(e) =>
                              updateFunction(fn.id, {
                                origin: e.target.value as ItemFunction['origin'],
                              })
                            }
                          >
                            <option value="point">Ponto escolhido no Grid</option>
                            <option value="self">O próprio usuário</option>
                          </Select>
                        </Field>
                        {number(
                          `Tamanho da área ${index + 1} (m)`,
                          fn.size,
                          (v) => updateFunction(fn.id, { size: v }),
                          0,
                          600,
                          0.5,
                        )}
                        {fn.shape === 'line' &&
                          number(
                            `Largura da linha ${index + 1} (m)`,
                            fn.width,
                            (v) => updateFunction(fn.id, { width: v }),
                            0.5,
                            600,
                            0.5,
                          )}
                      </>
                    )}
                    {number(
                      `Cargas por uso ${index + 1}`,
                      fn.charge_cost,
                      (v) => updateFunction(fn.id, { charge_cost: v }),
                      0,
                      999,
                    )}
                    {number(
                      `Unidades consumidas ${index + 1}`,
                      fn.quantity_cost,
                      (v) => updateFunction(fn.id, { quantity_cost: v }),
                      0,
                      999,
                    )}
                    {fn.kind === 'damage' && (
                      <Field label={`Tipo de dano ${index + 1}`}>
                        <Input
                          value={fn.damageType}
                          maxLength={40}
                          placeholder="fogo, frio, radiante…"
                          onChange={(e) => updateFunction(fn.id, { damageType: e.target.value })}
                        />
                      </Field>
                    )}
                    <Field
                      label={`Salvaguarda ${index + 1}`}
                      hint="O participante atingido recebe a salvaguarda no combate guiado."
                    >
                      <Select
                        value={fn.save}
                        disabled={!!fn.attackRoll}
                        onChange={(e) => updateFunction(fn.id, { save: e.target.value })}
                      >
                        <option value="">Sem salvaguarda</option>
                        {['FOR', 'DES', 'CON', 'INT', 'SAB', 'CAR'].map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </Select>
                    </Field>
                    {fn.save && (
                      <Field
                        label={`CD da salvaguarda ${index + 1}`}
                        hint="Em branco: o mestre informa a CD ao autorizar a ação."
                      >
                        <Input
                          type="number"
                          min={1}
                          max={40}
                          value={fn.save_dc ?? ''}
                          onChange={(event) =>
                            updateFunction(fn.id, {
                              save_dc:
                                event.target.value === ''
                                  ? undefined
                                  : Math.max(
                                      1,
                                      Math.min(40, Math.floor(Number(event.target.value))),
                                    ),
                            })
                          }
                        />
                      </Field>
                    )}
                  </div>
                  <div className="item-function-checks">
                    {fn.kind === 'damage' && (
                      <label className="vtt-check">
                        <input
                          type="checkbox"
                          checked={!!fn.attackRoll}
                          onChange={(event) =>
                            updateFunction(fn.id, {
                              attackRoll: event.target.checked,
                              ...(event.target.checked ? { save: '' } : {}),
                            })
                          }
                        />{' '}
                        Exigir jogada de ataque
                      </label>
                    )}
                    <label className="vtt-check">
                      <input
                        type="checkbox"
                        checked={fn.requires_equipped}
                        onChange={(e) =>
                          updateFunction(fn.id, { requires_equipped: e.target.checked })
                        }
                      />{' '}
                      Exigir item equipado
                    </label>
                    {fn.kind === 'damage' && (
                      <label className="vtt-check">
                        <input
                          type="checkbox"
                          checked={fn.halfOnSave}
                          onChange={(e) => updateFunction(fn.id, { halfOnSave: e.target.checked })}
                        />{' '}
                        Metade do dano ao passar na salvaguarda
                      </label>
                    )}
                  </div>
                  {fn.attackRoll && (
                    <Field
                      label={`Bônus de ataque da função ${index + 1}`}
                      hint="Opcional. Em branco: usa Destreza do portador, sem proficiência, como arma improvisada."
                    >
                      <Input
                        type="number"
                        min={-50}
                        max={50}
                        value={fn.attack_bonus ?? ''}
                        onChange={(event) =>
                          updateFunction(fn.id, {
                            attack_bonus:
                              event.target.value === ''
                                ? undefined
                                : Math.max(
                                    -50,
                                    Math.min(50, Math.floor(Number(event.target.value))),
                                  ),
                          })
                        }
                      />
                    </Field>
                  )}
                  <Field label={`Regras da função ${index + 1}`}>
                    <Textarea
                      rows={3}
                      value={fn.note}
                      maxLength={4000}
                      placeholder="Condições, duração, restrições, pistas ou efeitos que o mestre aplica."
                      onChange={(e) => updateFunction(fn.id, { note: e.target.value })}
                    />
                  </Field>
                </section>
              ))}
            </div>
          )}
          {tab === 'secrets' && (
            <div className="form-stack">
              <label className="vtt-check">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => setVisible(e.target.checked)}
                />{' '}
                Publicar no catálogo dos jogadores
              </label>
              <p className="subtle">
                Itens entregues ficam no inventário do personagem mesmo quando o modelo não está
                publicado.
              </p>
              <Field
                label="Notas secretas do mestre"
                hint="Não são enviadas aos jogadores nem copiadas para o inventário."
              >
                <Textarea
                  rows={8}
                  value={secret}
                  maxLength={12000}
                  placeholder="Maldição oculta, pistas, preço real, gancho de aventura…"
                  onChange={(e) => setSecret(e.target.value)}
                />
              </Field>
            </div>
          )}
        </fieldset>
        <div className="item-editor-footer">
          <small>
            {data.functions.length} funções · {data.charges ?? 0} cargas ·{' '}
            {visible ? 'Publicado para jogadores' : 'Reservado ao mestre'}
          </small>
          <div className="form-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar item'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
