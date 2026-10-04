'use client';
import dynamic from 'next/dynamic';
import { useState, type FormEvent } from 'react';
import { Save, LoaderCircle, Plus, Trash2, Shield, Heart, Sparkles, Swords } from 'lucide-react';
import type { Character, DndSheet, InventoryItem, Spell, Ability } from '@/types';
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  ErrorBox,
  Empty,
  Badge,
  Confirm,
} from '@/components/ui';
import { Avatar, ImageField } from '@/components/media';
import { ABILITIES, SKILLS, CLASSES, RACES, CONDITIONS, EQUIPMENT } from './catalog';
import { getSystem } from '../registry';
import { useWorkspace } from '@/hooks/use-workspace';
import { uid, signed, errorMessage } from '@/lib/utils';
import { uploadImage } from '@/services/storage';
import { RaceField } from './race-field';
import { getRace } from './ancestries';
import { normalizeSpellResources, CASTING_SUBCLASSES } from './spellcasting';
const SpellManager = dynamic(() => import('./spell-manager'), {
  loading: () => <p className="subtle">Abrindo o grimório...</p>,
});
const TABS = [
  { id: 'basic', label: 'Identidade' },
  { id: 'stats', label: 'Atributos e perícias' },
  { id: 'combat', label: 'Combate' },
  { id: 'inventory', label: 'Equipamentos' },
  { id: 'spells', label: 'Magias' },
  { id: 'story', label: 'História' },
];
export function SheetEditor({
  character,
  readOnly = false,
  onSaved,
  onCancel,
}: {
  character: Character;
  readOnly?: boolean;
  onSaved(): void;
  onCancel(): void;
}) {
  const w = useWorkspace();
  const [value, setValue] = useState(() => {
      const c = structuredClone(character);
      c.sheet = normalizeSpellResources({ ...c.sheet, race_id: getRace(c.sheet.race)?.id ?? null });
      return c;
    }),
    [tab, setTab] = useState('basic');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [equipment, setEquipment] = useState('0');
  const [pendingDelete, setPendingDelete] = useState<{ type: 'item' | 'spell'; id: string } | null>(
    null,
  );
  const module = getSystem(
    w.data.systems.find((s) => s.id === value.rpg_system_id)?.slug || 'dnd5e',
  );
  const derived = module.calculate(value.sheet),
    s = value.sheet;
  const set = <K extends keyof Character>(key: K, val: Character[K]) =>
    setValue((v) => ({ ...v, [key]: val }));
  const sheet = <K extends keyof DndSheet>(key: K, val: DndSheet[K]) =>
    setValue((v) => ({ ...v, sheet: { ...v.sheet, [key]: val } }));
  const item = (id: string, update: Partial<InventoryItem>) =>
    sheet(
      'inventory',
      s.inventory.map((i) => (i.id === id ? { ...i, ...update } : i)),
    );
  function addItem() {
    const base =
      equipment === 'custom'
        ? {
            name: 'Novo item',
            category: 'item' as const,
            quantity: 1,
            weight: 0,
            equipped: false,
            notes: '',
          }
        : EQUIPMENT[Number(equipment)];
    sheet('inventory', [...s.inventory, { ...base, id: uid() }]);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setError(null);
    const errors = module.validate(value);
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setBusy(true);
    try {
      let c = {
        ...value,
        name: value.name.trim(),
        sheet: {
          ...normalizeSpellResources(s),
          hp_current: Math.min(s.hp_current, derived.hpMax),
          hit_dice_used: Math.min(s.hit_dice_used, s.level),
        },
      };
      await w.perform(async (repo) => {
        await repo.saveCharacter(c);
        if (file) {
          c = { ...c, portrait_path: await uploadImage(file, 'characters', c.id, w.demo) };
          await repo.saveCharacter(c);
        }
      }, 'Ficha salva.');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function remove() {
    if (!pendingDelete) return;
    if (pendingDelete.type === 'item')
      sheet(
        'inventory',
        s.inventory.filter((i) => i.id !== pendingDelete.id),
      );
    else
      sheet(
        'spells',
        s.spells.filter((i) => i.id !== pendingDelete.id),
      );
    setPendingDelete(null);
  }
  const numberField = (label: string, key: keyof DndSheet, min = 0, max?: number) => (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={s[key] as number}
        disabled={readOnly}
        onChange={(e) => sheet(key, Number(e.target.value) as never)}
      />
    </Field>
  );
  return (
    <form onSubmit={submit} className="form-stack">
      <div className="sheet-header">
        <Avatar name={value.name || 'Novo personagem'} path={value.portrait_path} size="large" />
        <div>
          <h2>{value.name || 'Um novo aventureiro'}</h2>
          <p>
            {s.race} · {CLASSES[s.class_id]?.name} · Nível {s.level}
          </p>
        </div>
      </div>
      <div className="tabs-bar" role="tablist" aria-label="Seções da ficha">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`sheet-tab-${t.id}`}
            aria-controls="sheet-panel"
            aria-selected={tab === t.id}
            className="tab-button"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      <div role="tabpanel" id="sheet-panel" aria-labelledby={`sheet-tab-${tab}`} tabIndex={0}>
        {tab === 'basic' && (
          <div className="form-stack">
            <div className="form-grid">
              <Field label="Nome do personagem">
                <Input
                  value={value.name}
                  maxLength={120}
                  disabled={readOnly}
                  onChange={(e) => set('name', e.target.value)}
                />
              </Field>
              <Field label="Jogador">
                <Input
                  readOnly
                  value={
                    w.data.profiles.find((p) => p.id === value.owner_id)?.name ||
                    'Jogador da campanha'
                  }
                />
              </Field>
              <RaceField
                value={s.race}
                readOnly={readOnly}
                onChange={(race, race_id) =>
                  setValue((v) => ({ ...v, sheet: { ...v.sheet, race, race_id } }))
                }
              />
              <Field label="Classe">
                <Select
                  value={s.class_id}
                  disabled={readOnly}
                  onChange={(e) => {
                    const cls = e.target.value;
                    setValue((v) => ({
                      ...v,
                      sheet: {
                        ...v.sheet,
                        class_id: cls,
                        subclass_id: '',
                        pact_slots_used: 0,
                        arcanum_used: {},
                        saves: [...CLASSES[cls].saves],
                        slots_used: {},
                        spells: v.sheet.spells.map((sp) =>
                          sp.casting_mode === 'arcanum'
                            ? { ...sp, casting_mode: 'bonus' as const }
                            : sp,
                        ),
                      },
                    }));
                  }}
                >
                  {Object.entries(CLASSES).map(([id, c]) => (
                    <option key={id} value={id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nível">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={s.level}
                  disabled={readOnly}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      sheet: normalizeSpellResources({ ...v.sheet, level: Number(e.target.value) }),
                    }))
                  }
                />
              </Field>
              {(s.class_id === 'fighter' || s.class_id === 'rogue') && (
                <Field label="Conjuração de subclasse">
                  <Select
                    value={s.subclass_id ?? ''}
                    disabled={readOnly}
                    onChange={(e) =>
                      setValue((v) => ({
                        ...v,
                        sheet: normalizeSpellResources({ ...v.sheet, subclass_id: e.target.value }),
                      }))
                    }
                  >
                    <option value="">Sem conjuração de subclasse</option>
                    <option
                      value={CASTING_SUBCLASSES[s.class_id as keyof typeof CASTING_SUBCLASSES].id}
                    >
                      {CASTING_SUBCLASSES[s.class_id as keyof typeof CASTING_SUBCLASSES].name}
                    </option>
                  </Select>
                </Field>
              )}
              <div className="class-summary full-width">
                <strong>
                  {CLASSES[s.class_id]?.name} · d{CLASSES[s.class_id]?.hitDie}
                </strong>
                <p>{CLASSES[s.class_id]?.description}</p>
                <small className="subtle">{CLASSES[s.class_id]?.source} · D&D 5e de 2014</small>
              </div>
              {numberField('Experiência', 'xp')}
              <Field label="Antecedente">
                <Input
                  value={s.background}
                  disabled={readOnly}
                  onChange={(e) => sheet('background', e.target.value)}
                  placeholder="Acólito, soldado, artesão..."
                />
              </Field>
              <Field label="Alinhamento">
                <Select
                  value={s.alignment}
                  disabled={readOnly}
                  onChange={(e) => sheet('alignment', e.target.value)}
                >
                  {[
                    'Leal e bom',
                    'Neutro e bom',
                    'Caótico e bom',
                    'Leal e neutro',
                    'Neutro',
                    'Caótico e neutro',
                    'Leal e mau',
                    'Neutro e mau',
                    'Caótico e mau',
                  ].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </Select>
              </Field>
            </div>
            {!readOnly && (
              <ImageField
                current={value.portrait_path}
                onChange={setFile}
                onError={setError}
                label="Adicionar retrato"
              />
            )}
            {file && <small className="file-name">{file.name}</small>}
          </div>
        )}
        {tab === 'stats' && (
          <div className="form-stack">
            <div className="abilities-grid">
              {ABILITIES.map((a) => (
                <div key={a.id} className="ability-card">
                  <label htmlFor={`ability-${a.id}`}>{a.label}</label>
                  <Input
                    id={`ability-${a.id}`}
                    aria-label={a.label}
                    type="number"
                    min={1}
                    max={30}
                    value={s.abilities[a.id]}
                    disabled={readOnly}
                    onChange={(e) =>
                      sheet('abilities', { ...s.abilities, [a.id]: Number(e.target.value) })
                    }
                  />
                  <strong>{signed(derived.modifiers[a.id])}</strong>
                </div>
              ))}
            </div>
            <div className="detail-stats">
              <div className="detail-stat">
                <strong>{signed(derived.proficiency)}</strong>
                <span>Proficiência</span>
              </div>
              <div className="detail-stat">
                <strong>{derived.passivePerception}</strong>
                <span>Percepção passiva</span>
              </div>
            </div>
            <section className="form-divider">
              <h3>Salvaguardas</h3>
              <div className="skills-grid">
                {ABILITIES.map((a) => (
                  <label key={a.id} className="skill-row">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={s.saves.includes(a.id)}
                      onChange={(e) =>
                        sheet(
                          'saves',
                          e.target.checked ? [...s.saves, a.id] : s.saves.filter((v) => v !== a.id),
                        )
                      }
                    />
                    <span className="skills-label">{a.label}</span>
                    <span className="skill-bonus">{signed(derived.saves[a.id])}</span>
                  </label>
                ))}
              </div>
            </section>
            <section className="form-divider">
              <h3>Perícias</h3>
              <p className="subtle section-space">
                Marque proficiência ou especialização conforme as habilidades do personagem.
              </p>
              <div className="skills-grid">
                {SKILLS.map((skill) => (
                  <div key={skill.id} className="skill-row">
                    <label className="skills-label" htmlFor={`skill-${skill.id}`}>
                      {skill.label}{' '}
                      <small>({ABILITIES.find((a) => a.id === skill.ability)?.short})</small>
                    </label>
                    <Select
                      id={`skill-${skill.id}`}
                      value={s.skills[skill.id] ?? 0}
                      disabled={readOnly}
                      onChange={(e) =>
                        sheet('skills', {
                          ...s.skills,
                          [skill.id]: Number(e.target.value) as 0 | 1 | 2,
                        })
                      }
                    >
                      <option value={0}>Sem bônus</option>
                      <option value={1}>Proficiente</option>
                      <option value={2}>Especialista</option>
                    </Select>
                    <strong className="skill-bonus">{signed(derived.skills[skill.id])}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
        {tab === 'combat' && (
          <div className="form-stack">
            <div className="detail-stats">
              <div className="detail-stat">
                <strong>{derived.armorClass}</strong>
                <span>Classe de armadura</span>
              </div>
              <div className="detail-stat">
                <strong>{signed(derived.initiative)}</strong>
                <span>Iniciativa</span>
              </div>
              <div className="detail-stat">
                <strong>{derived.speed} m</strong>
                <span>Deslocamento</span>
              </div>
              <div className="detail-stat">
                <strong>{derived.hpMax}</strong>
                <span>PV máximos</span>
              </div>
            </div>
            <div className="form-grid form-grid-three">
              {numberField('PV atuais', 'hp_current', 0, derived.hpMax)}
              {numberField('PV temporários', 'hp_temp')}
              <Field
                label="PV máximos personalizados"
                hint="Em branco: cálculo com a média dos dados de vida."
              >
                <Input
                  type="number"
                  min={1}
                  placeholder={`Automático: ${derived.hpMax}`}
                  disabled={readOnly}
                  value={s.hp_max_override ?? ''}
                  onChange={(e) =>
                    sheet('hp_max_override', e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </Field>
              {numberField('Bônus adicional de CA', 'ac_bonus', -20, 20)}
              {numberField('Bônus adicional de iniciativa', 'initiative_bonus', -20, 20)}
              <Field label="Deslocamento personalizado (m)">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder={`Automático: ${derived.speed}`}
                  disabled={readOnly}
                  value={s.speed_override ?? ''}
                  onChange={(e) =>
                    sheet('speed_override', e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </Field>
              <Field label={`Dados de vida usados (${s.level}d${derived.hitDie})`}>
                <Input
                  type="number"
                  min={0}
                  max={s.level}
                  value={s.hit_dice_used}
                  disabled={readOnly}
                  onChange={(e) => sheet('hit_dice_used', Number(e.target.value))}
                />
              </Field>
              {numberField('Sucessos contra morte', 'death_successes', 0, 3)}
              {numberField('Falhas contra morte', 'death_failures', 0, 3)}
            </div>
            <div className="info-box">
              A CA considera a armadura e o escudo equipados. Os PV usam o dado máximo no primeiro
              nível e a média nos demais; ajuste o máximo se sua mesa usar rolagens.
            </div>
            <section className="form-divider">
              <h3>Condições</h3>
              <div className="condition-list">
                {CONDITIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="condition-chip"
                    disabled={readOnly}
                    aria-pressed={s.conditions.includes(c)}
                    onClick={() =>
                      sheet(
                        'conditions',
                        s.conditions.includes(c)
                          ? s.conditions.filter((v) => v !== c)
                          : [...s.conditions, c],
                      )
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
        {tab === 'inventory' && (
          <div className="form-stack">
            <div className="currency-grid">
              {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map((k) => (
                <Field
                  key={k}
                  label={{ cp: 'Cobre', sp: 'Prata', ep: 'Electro', gp: 'Ouro', pp: 'Platina' }[k]}
                >
                  <Input
                    type="number"
                    min={0}
                    value={s.currency[k]}
                    disabled={readOnly}
                    onChange={(e) =>
                      sheet('currency', { ...s.currency, [k]: Number(e.target.value) })
                    }
                  />
                </Field>
              ))}
            </div>
            <section className="form-divider">
              <h3>
                Inventário{' '}
                <small className="subtle">
                  · {s.inventory.reduce((sum, i) => sum + i.weight * i.quantity, 0).toFixed(2)} kg
                </small>
              </h3>
              {!readOnly && (
                <div className="inline-form section-space">
                  <Field label="Adicionar equipamento">
                    <Select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                      {EQUIPMENT.map((e, i) => (
                        <option key={e.name} value={i}>
                          {e.name}
                        </option>
                      ))}
                      <option value="custom">Criar item personalizado</option>
                    </Select>
                  </Field>
                  <Button type="button" variant="secondary" onClick={addItem}>
                    <Plus size={17} />
                    Adicionar
                  </Button>
                </div>
              )}
              {!s.inventory.length ? (
                <Empty title="Sua mochila ainda está vazia." />
              ) : (
                <div className="form-stack">
                  {s.inventory.map((i) => (
                    <section key={i.id} className="panel">
                      <div className="panel-heading">
                        <h3>{i.name}</h3>
                        {!readOnly && (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Remover ${i.name}`}
                            onClick={() => setPendingDelete({ type: 'item', id: i.id })}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                      <div className="form-grid form-grid-three">
                        <Field label="Nome">
                          <Input
                            value={i.name}
                            disabled={readOnly}
                            onChange={(e) => item(i.id, { name: e.target.value })}
                          />
                        </Field>
                        <Field label="Categoria">
                          <Select
                            value={i.category}
                            disabled={readOnly}
                            onChange={(e) =>
                              item(i.id, { category: e.target.value as InventoryItem['category'] })
                            }
                          >
                            <option value="weapon">Arma</option>
                            <option value="armor">Armadura / escudo</option>
                            <option value="gear">Equipamento</option>
                            <option value="item">Item</option>
                          </Select>
                        </Field>
                        <Field label="Quantidade">
                          <Input
                            type="number"
                            min={1}
                            value={i.quantity}
                            disabled={readOnly}
                            onChange={(e) => item(i.id, { quantity: Number(e.target.value) })}
                          />
                        </Field>
                        <Field label="Peso unitário (kg)">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={i.weight}
                            disabled={readOnly}
                            onChange={(e) => item(i.id, { weight: Number(e.target.value) })}
                          />
                        </Field>
                        {i.category === 'weapon' && (
                          <>
                            <Field label="Dano">
                              <Input
                                value={i.damage ?? ''}
                                disabled={readOnly}
                                onChange={(e) => item(i.id, { damage: e.target.value })}
                              />
                            </Field>
                            <Field label="Tipo de ataque">
                              <Select
                                value={i.weapon_mode ?? ''}
                                disabled={readOnly}
                                onChange={(e) =>
                                  item(i.id, {
                                    weapon_mode:
                                      (e.target.value as InventoryItem['weapon_mode']) || undefined,
                                  })
                                }
                              >
                                <option value="">Automático pelo nome</option>
                                <option value="melee">Corpo a corpo</option>
                                <option value="ranged">À distância</option>
                              </Select>
                            </Field>
                            <Field label="Alcance da arma (m)">
                              <Input
                                type="number"
                                min={0}
                                max={600}
                                step={0.5}
                                placeholder="Automático"
                                value={i.weapon_range ?? ''}
                                disabled={readOnly}
                                onChange={(e) =>
                                  item(i.id, {
                                    weapon_range: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  })
                                }
                              />
                            </Field>
                            <Field label="Atributo da arma">
                              <Select
                                value={i.weapon_ability ?? ''}
                                disabled={readOnly}
                                onChange={(e) =>
                                  item(i.id, {
                                    weapon_ability: (e.target.value as Ability) || undefined,
                                  })
                                }
                              >
                                <option value="">Automático (Força / Destreza)</option>
                                <option value="str">Força</option>
                                <option value="dex">Destreza</option>
                                <option value="int">Inteligência</option>
                                <option value="wis">Sabedoria</option>
                                <option value="cha">Carisma</option>
                              </Select>
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
                                  item(i.id, {
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
                                onChange={(e) => item(i.id, { armor_base: Number(e.target.value) })}
                              />
                            </Field>
                          </>
                        )}
                      </div>
                      <label className="visibility-label" style={{ marginTop: 15 }}>
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={i.equipped}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const inventory = s.inventory.map((other) =>
                              other.id === i.id
                                ? { ...other, equipped: checked }
                                : checked &&
                                    i.category === 'armor' &&
                                    other.category === 'armor' &&
                                    (i.armor_type === 'shield'
                                      ? other.armor_type === 'shield'
                                      : other.armor_type !== 'shield')
                                  ? { ...other, equipped: false }
                                  : other,
                            );
                            sheet('inventory', inventory);
                          }}
                        />
                        Equipado
                      </label>
                      <Field label="Observações">
                        <Textarea
                          rows={2}
                          value={i.notes}
                          disabled={readOnly}
                          onChange={(e) => item(i.id, { notes: e.target.value })}
                        />
                      </Field>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        {tab === 'spells' && (
          <SpellManager
            sheet={s}
            readOnly={readOnly}
            onChange={(next) => setValue((v) => ({ ...v, sheet: next }))}
            onRemove={(id) => setPendingDelete({ type: 'spell', id })}
          />
        )}
        {tab === 'story' && (
          <div className="form-stack">
            <Field label="Aparência">
              <Textarea
                value={value.appearance}
                disabled={readOnly}
                onChange={(e) => set('appearance', e.target.value)}
              />
            </Field>
            <Field label="História / background">
              <Textarea
                rows={7}
                value={value.biography}
                disabled={readOnly}
                onChange={(e) => set('biography', e.target.value)}
              />
            </Field>
            <Field label="Habilidades, traços e talentos">
              <Textarea
                rows={5}
                value={s.features}
                disabled={readOnly}
                onChange={(e) => sheet('features', e.target.value)}
              />
            </Field>
            <Field label="Idiomas">
              <Input
                value={s.languages}
                disabled={readOnly}
                onChange={(e) => sheet('languages', e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>
      <div className="form-actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {readOnly ? 'Fechar ficha' : 'Cancelar'}
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={busy}>
            {busy ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />}Salvar ficha
          </Button>
        )}
      </div>
      <Confirm
        open={Boolean(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={remove}
        title={pendingDelete?.type === 'item' ? 'Remover item?' : 'Remover magia?'}
        description="O registro será removido da ficha quando você salvar as alterações."
      />
    </form>
  );
}
