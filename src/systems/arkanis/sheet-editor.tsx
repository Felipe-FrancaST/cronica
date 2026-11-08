'use client';
import { useRef, useState, useEffect, type FormEvent } from 'react';
import {
  Save,
  LoaderCircle,
  Dices,
  Sparkles,
  Heart,
  Brain,
  Shield,
  Compass,
  BookOpen,
  Package,
  FlaskConical,
  Swords,
  UserRound,
  Camera,
} from 'lucide-react';
import { Button, Field, Input, Select, Textarea, ErrorBox, Badge } from '@/components/ui';
import { Avatar, ImageField } from '@/components/media';
import { DraftRecovery } from '@/components/draft-recovery';
import { useEditorDraft } from '@/hooks/use-editor-draft';
import { useWorkspace } from '@/hooks/use-workspace';
import { rulesFor } from '@/features/sessions/types';
import { uid, signed, errorMessage } from '@/lib/utils';
import { uploadImage } from '@/services/storage';
import type { Character } from '@/types';
import type { ArkanisSheet, ArkanisAttribute, AptitudeRank } from './types';
import {
  ANCESTRIES,
  syncArkanis,
  RACIAL_APTITUDES,
  ATTRIBUTES,
  APTITUDE_GROUPS,
  calculateArkanis,
  validateArkanis,
  storedCharacter,
} from './rules';
import { addIngredient } from './ingredients';
import { AlchemyPanel } from './alchemy-panel';
import { ArkanisInventory } from './inventory-panel';
import { ArsenalPanel, GrimoirePanel } from './repertoire-panel';
import './arkanis.css';

const SECTIONS = [
  { id: 'identity', label: 'Identidade', short: 'Identidade', icon: UserRound },
  { id: 'essence', label: 'Corpo, mente e espírito', short: 'Essência', icon: Sparkles },
  { id: 'aptitudes', label: 'Aptidões', short: 'Aptidões', icon: Compass },
  { id: 'arsenal', label: 'Arsenal e técnicas', short: 'Arsenal', icon: Swords },
  { id: 'grimoire', label: 'Grimório', short: 'Grimório', icon: BookOpen },
  { id: 'inventory', label: 'Bolsa', short: 'Bolsa', icon: Package },
  { id: 'alchemy', label: 'Alquimia', short: 'Alquimia', icon: FlaskConical },
];
function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 99999,
  hint,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        step={1}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
const d = (sides: number) =>
  Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) * sides) + 1;
export function ArkanisSheetEditor({
  character,
  onSaved,
  onCancel,
  readOnly: requestedReadOnly = false,
}: {
  character: Character<ArkanisSheet>;
  onSaved(): void;
  onCancel(): void;
  readOnly?: boolean;
}) {
  const w = useWorkspace(),
    rules = rulesFor(w.data.rules, character.campaign_id);
  const existing = w.data.characters.some((c) => c.id === character.id);
  const master = w.data.campaigns.some(
    (c) => c.id === character.campaign_id && c.owner_id === w.user?.id,
  );
  const readOnly =
    requestedReadOnly ||
    (!master && (character.owner_id !== w.user?.id || !rules.players_can_edit_sheets));
  const [value, setValue] = useState(() => ({
    ...structuredClone(character),
    sheet: syncArkanis(character.sheet, rules.hit_point_method === 'rolled' ? 'rolled' : 'maximum'),
  }));
  const [tab, setTab] = useState('identity'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPortraitPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPortraitPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const expected = useRef<string | null>(existing ? character.updated_at : null),
    lock = useRef(false),
    form = useRef<HTMLFormElement>(null);
  const s = value.sheet,
    derived = calculateArkanis(s),
    ancestry = ANCESTRIES.find((a) => a.id === s.race_id);
  const patch = (changes: Partial<ArkanisSheet>) =>
    setValue((v) => ({
      ...v,
      sheet: syncArkanis(
        { ...v.sheet, ...changes },
        rules.hit_point_method === 'rolled' ? 'rolled' : 'maximum',
      ),
    }));
  const draft = useEditorDraft(
    readOnly ? undefined : w.user?.id,
    `arkanis:${character.id}`,
    value,
    expected.current,
    (saved, version) => {
      expected.current = version;
      setValue({
        ...saved,
        sheet: syncArkanis(saved.sheet, rules.hit_point_method === 'rolled' ? 'rolled' : 'maximum'),
      });
    },
  );
  const navigate = (next: string) => {
    setTab(next);
    form.current
      ?.querySelector<HTMLButtonElement>(`#arkanis-tab-${next}`)
      ?.focus({ preventScroll: true });
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (readOnly || lock.current) return;
    draft.persist();
    setError(null);
    const errors = validateArkanis(value);
    if (rules.lock_player_level && s.level !== rules.party_level)
      errors.push(`O nível do grupo é ${rules.party_level}, definido pelo mestre.`);
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      let result = structuredClone(value);
      await w.perform(
        async (repo) => {
          await repo.saveCharacter(storedCharacter(result), expected.current);
          expected.current = result.updated_at;
          setValue({ ...result });
          if (file) {
            result = {
              ...result,
              portrait_path: await uploadImage(file, 'characters', result.id, w.demo),
            };
            await repo.saveCharacter(storedCharacter(result), expected.current);
            expected.current = result.updated_at;
            setValue({ ...result });
          }
        },
        'Ficha de Arkanis salva.',
        (data) => ({
          ...data,
          characters: data.characters.some((c) => c.id === result.id)
            ? data.characters.map((c) => (c.id === result.id ? storedCharacter(result) : c))
            : [...data.characters, storedCharacter(result)],
        }),
      );
      draft.clear();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="arkanis" onSubmit={save} ref={form}>
      <header className="arkanis-hero">
        <div className="arkanis-portrait">
          <ImageField
            value={file}
            current={value.portrait_path}
            onChange={setFile}
            onError={setError}
            label="Trocar retrato do personagem"
            disabled={readOnly || busy}
            avatar
            trigger={
              <span className="arkanis-portrait-frame">
                {portraitPreview ? (
                  <img src={portraitPreview} alt={`Retrato de ${value.name || 'personagem'}`} />
                ) : (
                  <Avatar
                    name={value.name || 'Nova centelha'}
                    path={value.portrait_path}
                    size="large"
                  />
                )}
                {!readOnly && (
                  <span className="arkanis-portrait-edit">
                    <Camera size={14} /> Trocar
                  </span>
                )}
              </span>
            }
          />
        </div>
        <div>
          <span className="arkanis-kicker">ARKANIS · DOSSIÊ DA ALMA</span>
          <h1>{value.name || 'Uma nova centelha'}</h1>
          <p>
            {s.race} · Nível {s.level} · Seu caminho é construído por escolhas.
          </p>
        </div>
        <Badge>Sem classes</Badge>
      </header>
      <DraftRecovery draft={draft} />
      {notice && (
        <p className="arkanis-notice" role="status">
          {notice}
        </p>
      )}
      <div className="arkanis-vitals">
        {[
          {
            label: 'PV',
            icon: Heart,
            current: s.hp_current,
            max: derived.hpMax,
            key: 'hp_current' as const,
          },
          {
            label: 'Mana',
            icon: Sparkles,
            current: s.mana_current,
            max: derived.manaMax,
            key: 'mana_current' as const,
          },
          {
            label: 'Sanidade',
            icon: Brain,
            current: s.sanity_current,
            max: s.sanity_max,
            key: 'sanity_current' as const,
          },
        ].map((r) => (
          <div key={r.key} className={`arkanis-vital ${r.key}`}>
            <r.icon size={19} />
            <div>
              <label htmlFor={`arkanis-${r.key}`}>{r.label}</label>
              <div>
                <Input
                  id={`arkanis-${r.key}`}
                  aria-label={`${r.label} atual`}
                  type="number"
                  min={0}
                  max={r.max ?? 99999}
                  value={r.current}
                  disabled={readOnly || busy}
                  onChange={(e) => patch({ [r.key]: Number(e.target.value) })}
                />
                <span>/ {r.max ?? '—'}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="arkanis-vital">
          <Shield size={20} />
          <div>
            <span>Reflexos</span>
            <strong>{derived.reflex}</strong>
          </div>
        </div>
      </div>
      <div className="arkanis-layout">
        <nav className="arkanis-nav" role="tablist" aria-label="Seções da ficha de Arkanis">
          {SECTIONS.map((section) => (
            <button
              type="button"
              role="tab"
              key={section.id}
              id={`arkanis-tab-${section.id}`}
              aria-label={section.label}
              aria-selected={tab === section.id}
              aria-controls="arkanis-panel"
              tabIndex={tab === section.id ? 0 : -1}
              onClick={() => navigate(section.id)}
              onKeyDown={(event) => {
                const index = SECTIONS.findIndex((item) => item.id === tab);
                const next =
                  event.key === 'ArrowRight'
                    ? (index + 1) % SECTIONS.length
                    : event.key === 'ArrowLeft'
                      ? (index + SECTIONS.length - 1) % SECTIONS.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? SECTIONS.length - 1
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  navigate(SECTIONS[next].id);
                }
              }}
            >
              <section.icon size={18} />
              <span>{section.short}</span>
            </button>
          ))}
        </nav>
        <div
          className="arkanis-content"
          role="tabpanel"
          id="arkanis-panel"
          aria-labelledby={`arkanis-tab-${tab}`}
        >
          <fieldset className="arkanis-fields" disabled={busy || (readOnly && tab !== 'alchemy')}>
            {tab === 'identity' && (
              <section>
                <header className="arkanis-section-heading">
                  <div>
                    <span className="arkanis-kicker">ANTES DO PRIMEIRO PASSO</span>
                    <h2>Quem carrega esta centelha?</h2>
                    <p>Origem, desejos e marcas que dão sentido à sua jornada.</p>
                  </div>
                </header>
                <div className="form-grid">
                  <Field label="Nome do personagem">
                    <Input
                      required
                      maxLength={120}
                      value={value.name}
                      onChange={(e) => setValue((v) => ({ ...v, name: e.target.value }))}
                    />
                  </Field>
                  <Field label="Raça de Arkanis">
                    <Select
                      value={s.race_id}
                      onChange={(e) => {
                        const race = ANCESTRIES.find((r) => r.id === e.target.value)!;
                        patch({ race_id: race.id, race: race.name });
                      }}
                    >
                      {ANCESTRIES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <NumberField
                    label="Nível do personagem"
                    min={1}
                    max={100}
                    value={s.level}
                    onChange={(level) => patch({ level })}
                  />
                  <Field label="Idiomas">
                    <Input
                      value={s.identity.languages}
                      onChange={(e) =>
                        patch({ identity: { ...s.identity, languages: e.target.value } })
                      }
                    />
                  </Field>
                </div>
                <div className="arkanis-racial">
                  <Badge>Dado de PV: d{ancestry?.hitDie ?? 8}</Badge>
                  <Badge>Deslocamento: {derived.speed || 'a definir'} m</Badge>
                  <p>{ancestry?.notes}</p>
                  <small>
                    Os bônus de atributos e Arkano da raça são incluídos no resumo. Aptidões raciais
                    são ativadas automaticamente: 1 = Básico, 2 = Avançado, 3 = Mestre.
                  </small>
                </div>
                {s.race_id === 'human' && (
                  <Field label="Atributo humano à escolha (+1)">
                    <Select
                      value={s.human_attribute}
                      onChange={(e) =>
                        patch({ human_attribute: e.target.value as ArkanisAttribute })
                      }
                    >
                      {ATTRIBUTES.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <div className="arkanis-grid-3">
                  {(['age', 'height', 'weight', 'eyes', 'hair'] as const).map((key, i) => (
                    <Field
                      key={key}
                      label={['Idade', 'Altura', 'Peso corporal', 'Olhos', 'Cabelos'][i]}
                    >
                      <Input
                        value={s.identity[key]}
                        onChange={(e) =>
                          patch({ identity: { ...s.identity, [key]: e.target.value } })
                        }
                      />
                    </Field>
                  ))}
                </div>
                {(
                  [
                    ['origin', 'Origem'],
                    ['motivation', 'Motivação'],
                    ['defining_trait', 'Traço marcante'],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Textarea
                      rows={2}
                      value={s.background[key]}
                      onChange={(e) =>
                        patch({ background: { ...s.background, [key]: e.target.value } })
                      }
                    />
                  </Field>
                ))}
                <Field label="Aparência">
                  <Textarea
                    value={value.appearance}
                    onChange={(e) => setValue((v) => ({ ...v, appearance: e.target.value }))}
                  />
                </Field>
                <Field label="História do personagem">
                  <Textarea
                    rows={5}
                    value={value.biography}
                    onChange={(e) => setValue((v) => ({ ...v, biography: e.target.value }))}
                  />
                </Field>
                <Field label="Traços raciais, usos e decisões da mesa">
                  <Textarea
                    value={s.racial_notes}
                    onChange={(e) => patch({ racial_notes: e.target.value })}
                  />
                </Field>
                <Field label="Notas de jornada">
                  <Textarea value={s.notes} onChange={(e) => patch({ notes: e.target.value })} />
                </Field>
              </section>
            )}
            {tab === 'essence' && (
              <section>
                <header className="arkanis-section-heading">
                  <div>
                    <span className="arkanis-kicker">O EIXO DA IDENTIDADE</span>
                    <h2>Corpo, mente e espírito</h2>
                    <p>Base, ajustes e vínculos compõem os seus atributos finais.</p>
                  </div>
                </header>
                <div className="arkanis-inline">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      patch({
                        attributes: { for: 20, agi: 19, res: 18, int: 15, sen: 14, pre: 12 },
                        attribute_method: 'standard',
                        attribute_rolls: [],
                      });
                      setNotice(
                        'Valores padrão distribuídos na ordem dos atributos. Você pode redistribuí-los.',
                      );
                    }}
                  >
                    Usar valores padrão
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const rolls = ATTRIBUTES.map(() => [d(6), d(6), d(6)]);
                      patch({
                        attributes: Object.fromEntries(
                          ATTRIBUTES.map((a, i) => [a.id, rolls[i].reduce((n, v) => n + v, 4)]),
                        ) as ArkanisSheet['attributes'],
                        attribute_method: 'rolled',
                        attribute_rolls: rolls,
                      });
                      setNotice(
                        'Seis rolagens de 3d6 + 4 registradas. Redistribua os totais como preferir.',
                      );
                    }}
                  >
                    <Dices size={16} />
                    Rolar atributos (3d6 + 4)
                  </Button>
                </div>
                <div className="arkanis-attributes">
                  {ATTRIBUTES.map(({ id, name }) => (
                    <article className="arkanis-attribute" key={id}>
                      <span>{name}</span>
                      <strong>{derived.attributes[id]}</strong>
                      <small>Modificador {signed(derived.modifiers[id])}</small>
                      <NumberField
                        label={`Base de ${name}`}
                        min={1}
                        max={30}
                        value={s.attributes[id]}
                        onChange={(score) =>
                          patch({
                            attributes: { ...s.attributes, [id]: score },
                            attribute_method: 'manual',
                          })
                        }
                      />
                      <NumberField
                        label={`Ajuste de ${name}`}
                        min={-20}
                        max={20}
                        value={s.attribute_adjustments[id]}
                        onChange={(score) =>
                          patch({
                            attribute_adjustments: { ...s.attribute_adjustments, [id]: score },
                          })
                        }
                      />
                    </article>
                  ))}
                </div>
                {s.attribute_rolls.length > 0 && (
                  <p className="subtle">
                    Rolagens:{' '}
                    {s.attribute_rolls
                      .map((r) => `${r.join(' + ')} + 4 = ${r.reduce((n, v) => n + v, 4)}`)
                      .join(' · ')}
                  </p>
                )}
                <div className="arkanis-arkano">
                  <div>
                    <span className="arkanis-kicker">EQUILÍBRIO TOTAL</span>
                    <h3>Arkano</h3>
                    <strong>{derived.arkano}</strong>
                    <span>
                      ModARK{' '}
                      {derived.arkModifier === null ? 'a definir' : signed(derived.arkModifier)}
                    </span>
                  </div>
                  <div className="form-stack">
                    <div className="arkanis-grid-3">
                      {(['body', 'mind', 'spirit'] as const).map((key, i) => (
                        <NumberField
                          key={key}
                          label={['Corpo (d10)', 'Mente (d10)', 'Espírito (d10)'][i]}
                          min={0}
                          max={10}
                          value={s.arkano[key]}
                          onChange={(v) => patch({ arkano: { ...s.arkano, [key]: v } })}
                        />
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        patch({ arkano: { ...s.arkano, body: d(10), mind: d(10), spirit: d(10) } })
                      }
                    >
                      <Dices size={16} />
                      Rolar Arkano (3d10)
                    </Button>
                    <NumberField
                      label="Evolução ou ajuste de Arkano"
                      min={-30}
                      max={97}
                      value={s.arkano.bonus}
                      onChange={(bonus) => patch({ arkano: { ...s.arkano, bonus } })}
                    />
                    <p className="subtle">
                      Cada 10 concede +1 ao vínculo: Corpo → Resistência, Mente → Inteligência,
                      Espírito → Presença. O bônus é incluído uma única vez nos atributos finais.
                    </p>
                    <Field
                      label="ModARK definido pelo mestre"
                      hint="Opcional; necessário no valor 75, sobreposto na tabela do livro."
                    >
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={s.arkano.modifier_override ?? ''}
                        placeholder="Usar a tabela do livro"
                        onChange={(e) =>
                          patch({
                            arkano: {
                              ...s.arkano,
                              modifier_override:
                                e.target.value === '' ? null : Number(e.target.value),
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
                <h3>Vitalidade e defesa</h3>
                <div className="arkanis-grid-3">
                  <Field
                    label="PV máximo"
                    hint={`${s.level} × (d${derived.hitDie} + ${s.race_id === 'orc' ? 'Resistência total' : 'modificador de Resistência'})${s.race_id === 'orc' ? ' + 8 raciais' : ''}. Regra: ${s.hit_point_method === 'rolled' ? 'rolar por nível' : 'dado cheio'}.`}
                  >
                    <Input aria-label="PV máximo" readOnly value={s.hp_max} />
                    {s.hit_point_method === 'rolled' && (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={(s.pv_rolls?.[s.race_id]?.length ?? 0) >= s.level}
                          onClick={() => {
                            const rolls = [...(s.pv_rolls?.[s.race_id] ?? [])];
                            while (rolls.length < s.level) rolls.push(d(derived.hitDie));
                            patch({ pv_rolls: { ...s.pv_rolls, [s.race_id]: rolls } });
                            setNotice(
                              `PV: dados registrados por nível: ${rolls.slice(0, s.level).join(', ')}.`,
                            );
                          }}
                        >
                          Rolar PV dos níveis pendentes
                        </Button>
                        <small>
                          Dados por nível:{' '}
                          {s.pv_rolls?.[s.race_id]?.slice(0, s.level).join(' · ') || 'pendentes'}
                        </small>
                      </>
                    )}
                  </Field>
                  <NumberField
                    label="Sanidade máxima"
                    min={1}
                    value={s.sanity_max}
                    onChange={(sanity_max) => patch({ sanity_max })}
                  />
                  <Field
                    label="Mana máxima definida pela mesa"
                    hint={`Sugestão: (nível × 5 + INT final) × ModARK, sem multiplicar quando o modificador é zero. Resultado: ${derived.manaMax ?? 'a definir'}.`}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={s.mana_max_override ?? ''}
                      placeholder="Usar cálculo do livro"
                      onChange={(e) =>
                        patch({
                          mana_max_override: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <NumberField
                    label="Ajuste de Reflexos"
                    min={-30}
                    max={30}
                    value={s.reflex_bonus}
                    hint="Reflexos = piso((AGI final + SEN final) ÷ 2) + ajustes."
                    onChange={(reflex_bonus) => patch({ reflex_bonus })}
                  />
                  <Field label="Deslocamento definido pela mesa (m)">
                    <Input
                      type="number"
                      min={0}
                      max={999}
                      step="0.5"
                      value={s.speed_override ?? ''}
                      placeholder={
                        ancestry?.speed === null
                          ? 'Definir com o mestre'
                          : String(ancestry?.speed ?? 9)
                      }
                      onChange={(e) =>
                        patch({
                          speed_override: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Registro de PV e decisões de cálculo">
                  <Textarea
                    rows={2}
                    value={s.hit_point_notes}
                    onChange={(e) => patch({ hit_point_notes: e.target.value })}
                  />
                </Field>
                <div className="arkanis-armor">
                  <h3>Armadura · segunda camada de defesa</h3>
                  <div className="arkanis-grid-3">
                    <Field label="Nome da armadura">
                      <Input
                        value={s.armor.name}
                        onChange={(e) => patch({ armor: { ...s.armor, name: e.target.value } })}
                      />
                    </Field>
                    <NumberField
                      label="Valor de armadura (VA)"
                      value={s.armor.value}
                      onChange={(value) => patch({ armor: { ...s.armor, value } })}
                    />
                    <NumberField
                      label="Durabilidade máxima (DUR)"
                      value={s.armor.durability_max}
                      onChange={(durability_max) =>
                        patch({ armor: { ...s.armor, durability_max } })
                      }
                    />
                    <NumberField
                      label="Durabilidade atual"
                      value={s.armor.durability_current}
                      onChange={(durability_current) =>
                        patch({ armor: { ...s.armor, durability_current } })
                      }
                    />
                  </div>
                  <p className="subtle">
                    PV e durabilidade são atualizados conforme a resolução da mesa. A descrição e o
                    exemplo do livro divergem sobre o desconto na DUR.
                  </p>
                </div>
              </section>
            )}
            {tab === 'aptitudes' && (
              <section>
                <header className="arkanis-section-heading">
                  <div>
                    <span className="arkanis-kicker">O QUE VOCÊ APRENDEU</span>
                    <h2>Aptidões</h2>
                    <p>Sem aptidão: sem bônus. Básico: +5. Avançado: +10. Mestre: +15.</p>
                  </div>
                </header>
                <div className="arkanis-aptitude-grid">
                  {APTITUDE_GROUPS.map((group) => (
                    <section className="arkanis-aptitude-group" key={group.name}>
                      <h3>{group.name}</h3>
                      {group.entries.map(([id, label]) => (
                        <div className="arkanis-aptitude" key={id}>
                          <Field label={label}>
                            <Select
                              value={s.aptitudes[id] ?? 0}
                              onChange={(e) =>
                                patch({
                                  aptitude_training: {
                                    ...s.aptitude_training,
                                    [id]: Number(e.target.value) as AptitudeRank,
                                  },
                                })
                              }
                            >
                              {[
                                [0, 'Sem aptidão'],
                                [1, 'Básico · +5'],
                                [2, 'Avançado · +10'],
                                [3, 'Mestre · +15'],
                              ].map(([n, name]) => (
                                <option
                                  key={n}
                                  value={n}
                                  disabled={Number(n) < (RACIAL_APTITUDES[s.race_id]?.[id] ?? 0)}
                                >
                                  {name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={`Rolar ${label}`}
                            onClick={() => {
                              const roll = d(20),
                                bonus = (s.aptitudes[id] ?? 0) * 5;
                              setNotice(
                                `${label}: d20 ${roll} + aptidão ${bonus} = ${roll + bonus}.`,
                              );
                            }}
                          >
                            <Dices size={17} />
                          </Button>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
                <Field label="Aptidões adicionais e observações">
                  <Textarea
                    value={s.background.notes}
                    onChange={(e) =>
                      patch({ background: { ...s.background, notes: e.target.value } })
                    }
                  />
                </Field>
              </section>
            )}
            {tab === 'arsenal' && <ArsenalPanel sheet={s} onChange={patch} readOnly={readOnly} />}
            {tab === 'grimoire' && <GrimoirePanel sheet={s} onChange={patch} readOnly={readOnly} />}
            {tab === 'inventory' && (
              <>
                <ArkanisInventory
                  items={s.inventory}
                  onChange={(inventory) => patch({ inventory })}
                  onCatalog={() => navigate('alchemy')}
                  readOnly={readOnly}
                  allowCustom={master || rules.players_can_create_custom_items}
                />
                <Field label="Moedas, valores e riquezas">
                  <Textarea
                    rows={2}
                    value={s.wealth}
                    onChange={(e) => patch({ wealth: e.target.value })}
                  />
                </Field>
              </>
            )}
            {tab === 'alchemy' && (
              <AlchemyPanel
                inventory={s.inventory}
                onChange={(inventory) => patch({ inventory })}
                readOnly={readOnly}
                onAdd={(ingredient, quantity) => {
                  try {
                    patch({ inventory: addIngredient(s.inventory, ingredient, uid(), quantity) });
                    setNotice(
                      `${quantity} × ${ingredient.name} na bolsa. Salve a ficha para confirmar.`,
                    );
                    setError(null);
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              />
            )}
          </fieldset>
        </div>
      </div>
      <ErrorBox message={error} />
      <footer className="arkanis-footer">
        <small>
          {readOnly
            ? 'Ficha em consulta.'
            : 'Alterações ficam na ficha após salvar. Seu rascunho é recuperável neste navegador.'}
        </small>
        <div className="arkanis-inline">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            {readOnly ? 'Fechar' : 'Voltar'}
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}
              {busy ? 'Salvando ficha…' : 'Salvar ficha de Arkanis'}
            </Button>
          )}
        </div>
      </footer>
    </form>
  );
}
