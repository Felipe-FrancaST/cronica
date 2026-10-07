'use client';
import dynamic from 'next/dynamic';
import { useState, useEffect, type FormEvent } from 'react';
import { Save, LoaderCircle } from 'lucide-react';
import type { Character, DndSheet } from '@/types';
import { Button, Field, Input, Select, Textarea, ErrorBox, Confirm, Tabs } from '@/components/ui';
import { Avatar, ImageField } from '@/components/media';
import { ABILITIES, SKILLS, CLASSES, CONDITIONS } from './catalog';
import { InventoryManager } from './inventory-manager';
import { getSystem } from '../registry';
import { useWorkspace } from '@/hooks/use-workspace';
import { signed, errorMessage } from '@/lib/utils';
import { uploadImage } from '@/services/storage';
import { RaceField } from './race-field';
import { getRace } from './ancestries';
import { CharacterBuilder, ClassProgression } from './character-builder';
import {
  classLevels,
  withClassLevels,
  withCharacterLevel,
  profession,
  hitDicePools,
  effectiveSkills,
} from './progression';
import { pathsFor, SUBCLASS_LEVELS } from './progression-catalog';
import { normalizeSpellResources } from './spellcasting';
const SpellManager = dynamic(() => import('./spell-manager'), {
  loading: () => <p className="subtle">Abrindo o grimório...</p>,
});
const TABS = [
  { id: 'basic', label: 'Identidade' },
  { id: 'build', label: 'Criação assistida' },
  { id: 'progression', label: 'Classes e habilidades' },
  { id: 'stats', label: 'Atributos e perícias' },
  { id: 'combat', label: 'Combate' },
  { id: 'inventory', label: 'Equipamentos' },
  { id: 'spells', label: 'Magias' },
  { id: 'story', label: 'História' },
];
export function SheetEditor({
  character,
  readOnly: requestedReadOnly = false,
  onSaved,
  onCancel,
}: {
  character: Character;
  readOnly?: boolean;
  onSaved(): void;
  onCancel(): void;
}) {
  const w = useWorkspace();
  const rules = w.data.rules?.find((r) => r.campaign_id === character.campaign_id);
  const master = w.data.campaigns.some(
    (c) => c.id === character.campaign_id && c.owner_id === w.user?.id,
  );
  const readOnly = requestedReadOnly || (!master && rules?.players_can_edit_sheets === false);
  const levelLocked = rules?.lock_player_level === true;
  const [value, setValue] = useState(() => {
      const c = structuredClone(character);
      if (levelLocked && rules) c.sheet = withCharacterLevel(c.sheet, rules.party_level);
      c.sheet = normalizeSpellResources({ ...c.sheet, race_id: getRace(c.sheet.race)?.id ?? null });
      return c;
    }),
    [tab, setTab] = useState('basic');
  useEffect(() => {
    if (levelLocked && rules)
      setValue((v) => ({
        ...v,
        sheet: normalizeSpellResources(withCharacterLevel(v.sheet, rules.party_level)),
      }));
  }, [levelLocked, rules?.party_level]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);

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
    setValue((v) => ({
      ...v,
      sheet: {
        ...v.sheet,
        [key]: val,
        ...(key === 'abilities' && v.sheet.creation?.method === 'manual'
          ? { creation: { ...v.sheet.creation, base: val as DndSheet['abilities'] } }
          : {}),
      },
    }));
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
          skills:
            derived.skills && s.creation
              ? ({
                  ...s.skills,
                  ...Object.fromEntries(
                    (s.creation.class_skills ?? [])
                      .concat(s.creation.background_skills ?? [])
                      .map((id) => [id, Math.max(1, s.skills[id] ?? 0)]),
                  ),
                } as DndSheet['skills'])
              : s.skills,
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
            {s.race} · {profession(s)} · Nível {s.level}
          </p>
        </div>
      </div>
      <Tabs
        label="Seções da ficha"
        items={TABS}
        value={tab}
        onChange={setTab}
        idPrefix="sheet-tab"
        panelId="sheet-panel"
      />
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
              <Field
                label="Classe"
                hint="A primeira classe define suas salvaguardas iniciais. Distribua níveis em Classes e habilidades."
              >
                <Select
                  value={s.class_id}
                  disabled={readOnly || classLevels(s).length > 1 || s.creation?.equipment_applied}
                  onChange={(e) => {
                    const id = e.target.value;
                    const next = withClassLevels(
                      {
                        ...s,
                        saves: [...CLASSES[id].saves],
                        creation: s.creation ? { ...s.creation, class_skills: [] } : undefined,
                      },
                      [{ class_id: id, level: s.level, subclass_id: '' }],
                    );
                    setValue((v) => ({ ...v, sheet: normalizeSpellResources(next) }));
                  }}
                >
                  {Object.values(CLASSES).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Nível"
                hint={
                  levelLocked ? 'Nível definido pelo mestre nas regras da campanha.' : undefined
                }
              >
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={s.level}
                  disabled={readOnly || levelLocked}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      sheet: normalizeSpellResources(
                        withCharacterLevel(v.sheet, Number(e.target.value)),
                      ),
                    }))
                  }
                />
              </Field>
              <Field
                label="Caminho da classe inicial"
                hint={`Escolha disponível no nível ${SUBCLASS_LEVELS[s.class_id]} da classe.`}
              >
                <Select
                  value={s.subclass_id ?? ''}
                  disabled={readOnly || classLevels(s)[0].level < SUBCLASS_LEVELS[s.class_id]}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      sheet: normalizeSpellResources(
                        withClassLevels(
                          v.sheet,
                          classLevels(v.sheet).map((c, i) =>
                            i === 0 ? { ...c, subclass_id: e.target.value, choices: {} } : c,
                          ),
                        ),
                      ),
                    }))
                  }
                >
                  <option value="">Escolha o caminho…</option>
                  {pathsFor(s.class_id).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
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
        {tab === 'build' && (
          <CharacterBuilder
            sheet={s}
            onChange={(s) => setValue((v) => ({ ...v, sheet: s }))}
            readOnly={readOnly}
          />
        )}
        {tab === 'progression' && (
          <ClassProgression
            sheet={s}
            onChange={(s) => setValue((v) => ({ ...v, sheet: s }))}
            readOnly={readOnly}
            lockedLevel={levelLocked ? rules?.party_level : undefined}
          />
        )}
        {tab === 'stats' && (
          <div className="form-stack">
            <p className="subtle">
              {s.creation && s.creation.method !== 'manual'
                ? 'Atributos gerados: altere a base em Criação assistida e as melhorias em Classes e habilidades.'
                : 'Valores livres conforme as regras da mesa.'}
            </p>
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
                    disabled={readOnly || (!!s.creation && s.creation.method !== 'manual')}
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
                      value={effectiveSkills(s)[skill.id] ?? 0}
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
              {classLevels(s).length > 1 &&
                Object.entries(hitDicePools(s)).map(([id, p]) => (
                  <Field
                    key={id}
                    label={`Dados de Vida usados · ${CLASSES[id]?.name} (${p.total}d${p.die})`}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={p.total}
                      value={p.used}
                      disabled={readOnly}
                      onChange={(e) =>
                        sheet('hit_dice_by_class', {
                          ...s.hit_dice_by_class,
                          [id]: Math.min(p.total, Math.max(0, Number(e.target.value))),
                        })
                      }
                    />
                  </Field>
                ))}
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
              <Field
                label={`Dados de vida usados (${classLevels(s)
                  .map((c) => `${c.level}d${CLASSES[c.class_id]?.hitDie}`)
                  .join(' + ')})`}
              >
                <Input
                  type="number"
                  min={0}
                  max={s.level}
                  value={s.hit_dice_used}
                  disabled={readOnly || classLevels(s).length > 1}
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
            <InventoryManager
              inventory={s.inventory}
              readOnly={readOnly}
              onChange={(items) => sheet('inventory', items)}
              onRemove={(id) => setPendingDelete({ type: 'item', id })}
            />
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
