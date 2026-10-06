'use client';
import { useState } from 'react';
import { Dices, PackageCheck, WandSparkles } from 'lucide-react';
import { Badge, Button, Field, Input, Select, Textarea, ErrorBox } from '@/components/ui';
import { ABILITIES, CLASSES, SKILLS } from './catalog';
import type { Ability, CharacterCreation, ClassLevel, DndSheet } from './types';
import {
  BACKGROUNDS,
  LANGUAGES,
  TOOLS,
  STANDARD_ARRAY,
  POINT_COST,
  RACE_BONUSES,
  STARTER_PACKS,
  newCreation,
  pointCost,
  rollAbilities,
  selectBackground,
  withCreation,
  applyStartingEquipment,
} from './creation';
import {
  CLASS_TRAINING,
  CLASS_PATHS,
  SUBCLASS_LEVELS,
  classFeatures,
  featureChoices,
  pathsFor,
  MULTICLASS_REQUIREMENTS,
} from './progression-catalog';
import {
  classLevels,
  meetsPrerequisite,
  withClassLevels,
  effectiveSkills,
  featureResources,
  recoverFeatures,
  profession,
  cleanClassLevels,
} from './progression';
import { normalizeSpellResources } from './spellcasting';
import { uid } from '@/lib/utils';

export function ChoiceChecklist({
  label,
  options,
  selected,
  limit,
  onChange,
  disabled = false,
}: {
  label: string;
  options: { id: string; name: string; description?: string; disabled?: boolean }[];
  selected: string[];
  limit: number;
  onChange(v: string[]): void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="builder-choice">
      <legend>
        {label}{' '}
        <span className="subtle">
          {selected.length} / {limit}
        </span>
      </legend>
      <div className="builder-options">
        {options.map((o) => (
          <label
            key={o.id}
            className={selected.includes(o.id) ? 'builder-option is-selected' : 'builder-option'}
          >
            <input
              type="checkbox"
              aria-label={o.name}
              checked={selected.includes(o.id)}
              disabled={
                disabled || o.disabled || (!selected.includes(o.id) && selected.length >= limit)
              }
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id),
                )
              }
            />
            <span>
              <strong>{o.name}</strong>
              {o.description && <small>{o.description}</small>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function CharacterBuilder({
  sheet: s,
  onChange,
  readOnly = false,
}: {
  sheet: DndSheet;
  onChange(s: DndSheet): void;
  readOnly?: boolean;
}) {
  const [rolling, setRolling] = useState(false),
    [pack, setPack] = useState(0),
    [error, setError] = useState<string | null>(null);
  const c = s.creation,
    bg = BACKGROUNDS.find((b) => b.id === c?.background_id),
    training = CLASS_TRAINING[s.class_id];
  const update = (change: Partial<CharacterCreation>) =>
    onChange(withCreation(s, { ...(c ?? newCreation()), ...change }));
  const scores =
    c?.method === 'rolled'
      ? (c.rolls?.map((r) => r.reduce((n, v) => n + v, 0) - Math.min(...r)) ?? [])
      : STANDARD_ARRAY;
  function assign(a: Ability, n: number) {
    if (!c) return;
    const base = { ...c.base },
      other = ABILITIES.find((b) => b.id !== a && base[b.id] === n);
    if (other) base[other.id] = base[a];
    base[a] = n;
    update({ base });
  }
  async function roll() {
    setRolling(true);
    setError(null);
    try {
      const result = rollAbilities();
      await new Promise((resolve) => setTimeout(resolve, 650));
      update({
        method: 'rolled',
        rolls: result.rolls,
        base: Object.fromEntries(ABILITIES.map((a, i) => [a.id, result.scores[i]])) as Record<
          Ability,
          number
        >,
      });
    } finally {
      setRolling(false);
    }
  }
  return (
    <div className="form-stack character-builder">
      <div className="builder-intro">
        <WandSparkles size={22} />
        <div>
          <h3>Monte seu aventureiro</h3>
          <p>
            Escolha atributos, treinamento e origem. As melhorias de cada classe ficam em Classes e
            habilidades.
          </p>
        </div>
        <Badge>D&D 2014</Badge>
      </div>
      <ErrorBox message={error} />
      {!c ? (
        <div className="info-box">
          <p>
            Esta ficha usa atributos livres. A criação assistida preserva os dados atuais até você
            escolher um método ou aplicar um pacote.
          </p>
          <Button
            type="button"
            disabled={readOnly}
            onClick={() => update({ method: 'manual', base: { ...s.abilities } })}
          >
            Abrir criação assistida
          </Button>
        </div>
      ) : (
        <>
          <section className="panel">
            <h3>1. Atributos iniciais</h3>
            <Field label="Método de atributos">
              <Select
                value={c.method}
                disabled={readOnly || rolling}
                onChange={(e) => {
                  const method = e.target.value as CharacterCreation['method'];
                  update({
                    method,
                    base:
                      method === 'point-buy'
                        ? { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }
                        : method === 'standard'
                          ? newCreation().base
                          : { ...s.abilities },
                    bonuses: method === 'manual' ? {} : c.bonuses,
                  });
                }}
              >
                <option value="standard">Conjunto padrão · 15, 14, 13, 12, 10, 8</option>
                <option value="point-buy">Compra de pontos · 27 pontos</option>
                <option value="rolled">Rolagem · 4d6, descarte o menor</option>
                <option value="manual">Manual · valores acordados com o mestre</option>
              </Select>
            </Field>
            {c.method === 'point-buy' && (
              <p className="builder-budget" role="status">
                {27 - pointCost(c.base)} pontos restantes de 27 · valores de 8 a 15
              </p>
            )}
            {c.method === 'rolled' && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={readOnly || rolling}
                  onClick={() => void roll()}
                >
                  <Dices size={18} />
                  {rolling
                    ? 'Rolando os atributos…'
                    : c.rolls?.length
                      ? 'Rolar novamente 4d6 × 6'
                      : 'Rolar 4d6 × 6'}
                </Button>
                <div className={`ability-rolls ${rolling ? 'is-rolling' : ''}`} aria-live="polite">
                  {(c.rolls ?? Array.from({ length: 6 }, () => [1, 2, 3, 4])).map((r, i) => (
                    <div className="ability-roll" key={i}>
                      {r.map((v, j) => (
                        <span
                          className={`ability-die ${j === r.indexOf(Math.min(...r)) ? 'discarded' : ''}`}
                          key={j}
                        >
                          {v}
                        </span>
                      ))}
                      <strong>
                        {c.rolls ? r.reduce((n, v) => n + v, 0) - Math.min(...r) : '—'}
                      </strong>
                    </div>
                  ))}
                </div>
                <small className="subtle">
                  Os quatro dados de cada resultado ficam registrados na ficha. Combine com o mestre
                  antes de repetir a rolagem.
                </small>
              </>
            )}
            <div className="builder-abilities">
              {ABILITIES.map((a) => (
                <div className="builder-ability" key={a.id}>
                  <Field label={`Base · ${a.label}`}>
                    {c.method === 'point-buy' || c.method === 'manual' ? (
                      <Input
                        type="number"
                        min={c.method === 'point-buy' ? 8 : 1}
                        max={c.method === 'point-buy' ? 15 : 30}
                        value={c.base[a.id]}
                        disabled={readOnly}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (
                            c.method === 'point-buy' &&
                            (!(v in POINT_COST) || pointCost({ ...c.base, [a.id]: v }) > 27)
                          )
                            return;
                          update({ base: { ...c.base, [a.id]: v } });
                        }}
                      />
                    ) : (
                      <Select
                        value={c.base[a.id]}
                        disabled={readOnly || rolling || !scores.length}
                        onChange={(e) => assign(a.id, Number(e.target.value))}
                      >
                        {[...new Set(scores)]
                          .sort((a, b) => b - a)
                          .map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                      </Select>
                    )}
                  </Field>
                  {c.method !== 'manual' && (
                    <Field label={`Bônus de origem · ${a.short}`}>
                      <Input
                        type="number"
                        min={0}
                        max={2}
                        value={c.bonuses[a.id] ?? 0}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({ bonuses: { ...c.bonuses, [a.id]: Number(e.target.value) } })
                        }
                      />
                    </Field>
                  )}
                  <strong>
                    {s.abilities[a.id]} <small>final</small>
                  </strong>
                </div>
              ))}
            </div>
            {c.method !== 'manual' && (
              <div className="info-box">
                <p>
                  Os bônus de origem são separados da compra/rolagem. Antecedentes de 2014 não
                  concedem pontos de atributo.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={readOnly || !RACE_BONUSES[s.race]}
                  onClick={() => update({ bonuses: RACE_BONUSES[s.race] ?? {} })}
                >
                  Aplicar bônus de {s.race}
                </Button>
                <small>Para outras linhagens, preencha os bônus indicados no livro da mesa.</small>
              </div>
            )}
          </section>
          <section className="panel">
            <h3>2. Treinamento de {CLASSES[s.class_id]?.name}</h3>
            <p className="subtle">
              Salvaguardas e equipamento inicial vêm da primeira classe. Multiclasse concede apenas
              as proficiências indicadas em Classes e habilidades.
            </p>
            <ChoiceChecklist
              label="Perícias da classe inicial"
              options={(training?.skills ?? []).map((id) => ({
                id,
                name: SKILLS.find((k) => k.id === id)?.label ?? id,
              }))}
              selected={c.class_skills ?? []}
              limit={training?.count ?? 0}
              disabled={readOnly}
              onChange={(class_skills) => update({ class_skills })}
            />
            <p>{training?.initial.join(' · ')}</p>
          </section>
          <section className="panel">
            <h3>3. Antecedente e personalidade</h3>
            <Field label="Escolher antecedente">
              <Select
                value={c.background_id ?? ''}
                disabled={readOnly || c.equipment_applied}
                onChange={(e) => {
                  const next = selectBackground(s, e.target.value);
                  const chosen = BACKGROUNDS.find((b) => b.id === e.target.value);
                  onChange({ ...next, background: chosen?.name ?? s.background });
                }}
              >
                <option value="">Escolha sua origem…</option>
                {BACKGROUNDS.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            {bg && (
              <>
                <div className="class-summary">
                  <strong>
                    {bg.feature} · {bg.gp} PO
                  </strong>
                  <p>{bg.description}</p>
                  <small>
                    {bg.source} · {bg.items.join(', ') || 'Equipamento acordado com o mestre'}
                  </small>
                </div>
                {bg.id === 'custom' && (
                  <div className="form-grid">
                    <Field label="Nome do antecedente personalizado">
                      <Input
                        value={c.custom_background_name ?? ''}
                        disabled={readOnly}
                        onChange={(e) => {
                          update({ custom_background_name: e.target.value });
                        }}
                      />
                    </Field>
                    <Field label="Habilidade do antecedente">
                      <Textarea
                        value={c.custom_background_feature ?? ''}
                        disabled={readOnly}
                        onChange={(e) => update({ custom_background_feature: e.target.value })}
                      />
                    </Field>
                  </div>
                )}
                <ChoiceChecklist
                  label="Perícias do antecedente"
                  options={SKILLS.map((k) => ({
                    id: k.id,
                    name: k.label,
                    description: (c.class_skills ?? []).includes(k.id)
                      ? 'Já escolhida na classe; escolha outra para substituir a repetição.'
                      : undefined,
                  }))}
                  selected={c.background_skills ?? []}
                  limit={2}
                  disabled={readOnly}
                  onChange={(background_skills) => update({ background_skills })}
                />
                {!!(bg.languages || bg.id === 'custom') && (
                  <ChoiceChecklist
                    label="Idiomas adicionais"
                    options={LANGUAGES.filter(
                      (l) =>
                        !s.languages
                          .split(',')
                          .map((v) => v.trim())
                          .includes(l),
                    ).map((l) => ({ id: l, name: l }))}
                    selected={c.background_languages ?? []}
                    limit={
                      bg.id === 'custom'
                        ? Math.max(0, 2 - (c.background_tools?.length ?? 0))
                        : bg.languages
                    }
                    disabled={readOnly}
                    onChange={(background_languages) => update({ background_languages })}
                  />
                )}
                <p className="subtle">
                  {bg.tools.length ? `Proficiência automática: ${bg.tools.join(', ')}.` : ''} Os
                  idiomas e ferramentas escolhidos aparecem nesta seção e na ficha.
                </p>
                {!!bg.toolChoices && (
                  <ChoiceChecklist
                    label="Ferramentas adicionais"
                    options={TOOLS.filter((t) => !bg.tools.includes(t))
                      .filter((t) =>
                        bg.id === 'custom' ||
                        bg.id === 'criminal' ||
                        bg.id === 'soldier' ||
                        bg.id === 'noble'
                          ? bg.id === 'custom' || ['Dados de jogo', 'Baralho'].includes(t)
                          : t.startsWith('Ferramentas de'),
                      )
                      .map((t) => ({ id: t, name: t }))}
                    selected={c.background_tools ?? []}
                    limit={
                      bg.id === 'custom'
                        ? Math.max(0, 2 - (c.background_languages?.length ?? 0))
                        : bg.toolChoices
                    }
                    disabled={readOnly}
                    onChange={(background_tools) => update({ background_tools })}
                  />
                )}
              </>
            )}
            <div className="form-grid">
              {(['traits', 'ideal', 'bond', 'flaw'] as const).map((key, i) => (
                <Field
                  key={key}
                  label={['Traços de personalidade', 'Ideal', 'Vínculo', 'Defeito'][i]}
                >
                  <Textarea
                    value={c[key] ?? ''}
                    disabled={readOnly}
                    onChange={(e) => update({ [key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          </section>
          <section className="panel">
            <h3>4. Equipamento inicial</h3>
            <p>
              O pacote da primeira classe e do antecedente é aplicado uma vez. Ganhar outra classe
              não entrega um novo pacote nem moedas.
            </p>
            {STARTER_PACKS[s.class_id]?.length > 0 ? (
              <Field label="Pacote da classe">
                <Select
                  value={pack < STARTER_PACKS[s.class_id].length ? pack : 0}
                  disabled={readOnly || c.equipment_applied}
                  onChange={(e) => setPack(Number(e.target.value))}
                >
                  {STARTER_PACKS[s.class_id].map((names, i) => (
                    <option key={i} value={i}>
                      {names.join(' · ')}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="subtle">
                Registre os itens desta classe conforme o suplemento da mesa.
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={readOnly || !bg || c.equipment_applied}
              onClick={() => {
                try {
                  onChange(
                    applyStartingEquipment(
                      s,
                      pack < STARTER_PACKS[s.class_id]?.length ? pack : 0,
                      uid,
                    ),
                  );
                  setError(null);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <PackageCheck size={18} />
              {c.equipment_applied
                ? 'Equipamento inicial aplicado'
                : 'Aplicar equipamento e moedas iniciais'}
            </Button>
          </section>
        </>
      )}
    </div>
  );
}

export function ClassProgression({
  sheet: s,
  onChange,
  readOnly = false,
  lockedLevel,
}: {
  sheet: DndSheet;
  onChange(s: DndSheet): void;
  readOnly?: boolean;
  lockedLevel?: number;
}) {
  const levels = classLevels(s),
    [adding, setAdding] = useState(''),
    [error, setError] = useState<string | null>(null),
    [future, setFuture] = useState(false);
  const skills = effectiveSkills(s),
    resources = featureResources(s);
  function update(next: ClassLevel[]) {
    const result = normalizeSpellResources(withClassLevels(s, cleanClassLevels(next)));
    const available = featureResources(result);
    result.feature_uses = Object.fromEntries(
      Object.entries(result.feature_uses ?? {})
        .filter(([id]) => available.some((r) => r.id === id))
        .map(([id, n]) => [id, Math.min(n, available.find((r) => r.id === id)!.max)]),
    );
    result.hit_dice_by_class = Object.fromEntries(
      Object.entries(result.hit_dice_by_class ?? {})
        .filter(([id]) => next.some((c) => c.class_id === id))
        .map(([id, n]) => [id, Math.min(n, next.find((c) => c.class_id === id)!.level)]),
    );
    onChange(result);
    setError(null);
  }
  function changeClass(index: number, changes: Partial<ClassLevel>) {
    const next = levels.map((c, i) => (i === index ? { ...c, ...changes } : c));
    update(next);
  }
  function level(index: number, value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 20) return;
    const next = structuredClone(levels),
      delta = value - next[index].level;
    if (lockedLevel) {
      const donor = next.findIndex((c, i) => i !== index && c.level - delta >= 1);
      if (donor < 0 && delta !== 0) {
        setError(
          'Para redistribuir o nível fixado pelo mestre, adicione uma classe ou retire níveis de outra classe.',
        );
        return;
      }
      if (donor >= 0) next[donor].level -= delta;
    }
    if (next.reduce((n, c) => n + c.level, 0) + (!lockedLevel ? delta : 0) > 20) return;
    next[index].level = value;
    // Preserve choices in the record for future levels, but remove allocations
    // that cannot be used at this level so downgrading stays valid.
    for (const c of next) {
      if (c.level < SUBCLASS_LEVELS[c.class_id]) c.subclass_id = '';
      c.choices = Object.fromEntries(
        Object.entries(c.choices ?? {})
          .filter(([key]) =>
            featureChoices(c.class_id, c.level, c.subclass_id, next.indexOf(c) === 0).some(
              (x) => x.id === key,
            ),
          )
          .map(([key, ids]) => [
            key,
            ids.slice(
              0,
              featureChoices(c.class_id, c.level, c.subclass_id, next.indexOf(c) === 0).find(
                (x) => x.id === key,
              )!.count,
            ),
          ]),
      );
      c.improvements = Object.fromEntries(
        Object.entries(c.improvements ?? {}).filter(([l]) => Number(l) <= c.level),
      );
    }
    update(next);
  }
  return (
    <div className="form-stack">
      <div className="builder-intro">
        <div>
          <h3>{profession(s)}</h3>
          <p>
            Nível total {s.level}/20 · proficiência +{2 + Math.floor((s.level - 1) / 4)}
            {lockedLevel ? ` · nível ${lockedLevel} fixado pelo mestre` : ''}
          </p>
        </div>
        <Badge>Multiclasse</Badge>
      </div>
      <ErrorBox message={error} />
      <div className="info-box">
        Melhorias, caminhos e magias aprendidas seguem o nível de cada classe. Ataque Extra e
        Canalizar Divindade não acumulam usos indevidamente.
      </div>
      {levels.map((c, i) => (
        <section className="panel class-progression" key={c.class_id}>
          <div className="panel-heading">
            <h3>
              {CLASSES[c.class_id]?.name} {c.level}{' '}
              <Badge tone="muted">{i === 0 ? 'Inicial' : `d${CLASSES[c.class_id]?.hitDie}`}</Badge>
            </h3>
            {i > 0 && (
              <Button
                type="button"
                variant="ghost"
                disabled={readOnly}
                onClick={() => {
                  const next = levels.filter((_, j) => j !== i);
                  if (lockedLevel) next[0] = { ...next[0], level: next[0].level + c.level };
                  update(next);
                }}
              >
                Remover classe
              </Button>
            )}
          </div>
          <div className="form-grid">
            <Field label={`Nível de ${CLASSES[c.class_id]?.name}`}>
              <Input
                type="number"
                min={1}
                max={20}
                value={c.level}
                disabled={readOnly}
                onChange={(e) => level(i, Number(e.target.value))}
              />
            </Field>
            <Field
              label={`Caminho de ${CLASSES[c.class_id]?.name}`}
              hint={`Disponível no nível ${SUBCLASS_LEVELS[c.class_id]} desta classe.`}
            >
              <Select
                value={c.subclass_id ?? ''}
                disabled={readOnly || c.level < SUBCLASS_LEVELS[c.class_id]}
                onChange={(e) =>
                  changeClass(i, {
                    subclass_id: e.target.value,
                    choices: {},
                    custom_subclass_name: '',
                  })
                }
              >
                <option value="">Escolha o caminho…</option>
                {pathsFor(c.class_id).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={`Caminho personalizado de ${CLASSES[c.class_id]?.name}`}
              hint="Para opções de outros livros; registre as habilidades e combine as regras com o mestre."
            >
              <Input
                value={c.custom_subclass_name ?? ''}
                disabled={readOnly || !!c.subclass_id || c.level < SUBCLASS_LEVELS[c.class_id]}
                onChange={(e) => changeClass(i, { custom_subclass_name: e.target.value })}
              />
            </Field>
          </div>
          <p className="subtle">
            Proficiências {i === 0 ? 'iniciais' : 'ganhas na multiclasse'}:{' '}
            {(i === 0
              ? CLASS_TRAINING[c.class_id]?.initial
              : CLASS_TRAINING[c.class_id]?.multi
            )?.join(' · ') || 'Nenhuma adicional'}
            . {i > 0 ? 'Sem novas salvaguardas ou equipamento inicial.' : ''}
          </p>
          {featureChoices(c.class_id, c.level, c.subclass_id, i === 0).map((ch) => (
            <ChoiceChecklist
              key={ch.id}
              label={ch.name}
              selected={c.choices?.[ch.id] ?? []}
              limit={ch.count}
              disabled={readOnly}
              options={ch.options.map((o) => ({
                ...o,
                disabled:
                  (o.level ?? 0) > c.level ||
                  (!!o.pact && !c.choices?.pact?.includes(o.pact)) ||
                  (!!ch.expertise && o.id !== 'thieves-tools' && !skills[o.id]),
              }))}
              onChange={(v) => changeClass(i, { choices: { ...c.choices, [ch.id]: v } })}
            />
          ))}
          {classFeatures(c.class_id)
            .filter((f) => f.name === 'Melhoria de atributos' && f.level <= c.level)
            .map((f) => {
              const allocated = c.improvements?.[String(f.level)] ?? {},
                points = Object.entries(allocated).flatMap(([id, n]) =>
                  Array.from({ length: n ?? 0 }, () => id),
                );
              return (
                <div className="builder-improvement" key={f.level}>
                  <h4>
                    Melhoria de atributos · {CLASSES[c.class_id]?.name} {f.level}
                  </h4>
                  <p className="subtle">
                    2 pontos. Os valores finais são atualizados sem somar novamente ao reabrir a
                    ficha.
                  </p>
                  <div className="form-grid">
                    {[0, 1].map((n) => (
                      <Field
                        label={`Ponto ${n + 1} · ${CLASSES[c.class_id]?.name} ${f.level}`}
                        key={n}
                      >
                        <Select
                          disabled={readOnly}
                          value={points[n] ?? ''}
                          onChange={(e) => {
                            const next = [points[0] ?? '', points[1] ?? ''];
                            next[n] = e.target.value;
                            const allocation = Object.fromEntries(
                              ABILITIES.map((a) => [a.id, next.filter((id) => id === a.id).length]),
                            );
                            changeClass(i, {
                              improvements: { ...c.improvements, [String(f.level)]: allocation },
                            });
                          }}
                        >
                          <option value="">Ainda não distribuído</option>
                          {ABILITIES.map((a) => (
                            <option
                              value={a.id}
                              key={a.id}
                              disabled={s.abilities[a.id] >= 20 && !points.includes(a.id)}
                            >
                              {a.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ))}
                  </div>
                </div>
              );
            })}
          <div className="feature-timeline">
            {[
              ...classFeatures(c.class_id),
              ...(CLASS_PATHS.find((p) => p.class_id === c.class_id && p.id === c.subclass_id)
                ?.features ?? []),
            ]
              .filter((f) => f.name !== 'Melhoria de atributos' && (future || f.level <= c.level))
              .sort((a, b) => a.level - b.level)
              .map((f, j) => (
                <details key={`${f.id}:${j}`} className={f.level > c.level ? 'feature-locked' : ''}>
                  <summary>
                    <Badge tone="muted">Nv. {f.level}</Badge>
                    {f.name}
                    {f.level > c.level && <small>futuro</small>}
                  </summary>
                  <p>{f.description}</p>
                </details>
              ))}
          </div>
        </section>
      ))}
      <label className="subtle">
        <input type="checkbox" checked={future} onChange={(e) => setFuture(e.target.checked)} />{' '}
        Mostrar habilidades dos próximos níveis
      </label>
      {!readOnly && (
        <section className="panel">
          <h3>Adicionar outra classe</h3>
          <Field label="Nova classe de multiclasse">
            <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Escolha uma classe…</option>
              {Object.values(CLASSES)
                .filter((c) => !levels.some((l) => l.class_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id} disabled={!meetsPrerequisite(c.id, s.abilities)}>
                    {c.name} ·{' '}
                    {(MULTICLASS_REQUIREMENTS[c.id] ?? [])
                      .map((group) =>
                        group.map((a) => ABILITIES.find((x) => x.id === a)?.short).join(' ou '),
                      )
                      .join(' e ')}{' '}
                    13
                  </option>
                ))}
            </Select>
          </Field>
          <Button
            type="button"
            disabled={
              !adding ||
              (!lockedLevel && s.level >= 20) ||
              (!!lockedLevel && !levels.some((c) => c.level > 1))
            }
            onClick={() => {
              if (!levels.every((c) => meetsPrerequisite(c.class_id, s.abilities))) {
                setError('A classe atual também precisa cumprir seu requisito de atributo 13.');
                return;
              }
              const next = structuredClone(levels);
              if (lockedLevel) {
                const donor = next.find((c) => c.level > 1)!;
                donor.level--;
              }
              next.push({ class_id: adding, level: 1, subclass_id: '' });
              update(next);
              setAdding('');
            }}
          >
            Adicionar nível de multiclasse
          </Button>
          <small className="subtle">
            {lockedLevel
              ? 'O novo nível é retirado de uma classe existente, mantendo o total da campanha.'
              : 'O nível total aumenta em 1. Você pode redistribuir os níveis depois.'}
          </small>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h3>Usos e pontos de habilidades</h3>
          <div className="spell-rest-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={readOnly}
              onClick={() => onChange(recoverFeatures(s, 'short'))}
            >
              Recuperar descanso curto
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={readOnly}
              onClick={() => onChange(recoverFeatures(s, 'long'))}
            >
              Recuperar descanso longo
            </Button>
          </div>
        </div>
        <p className="subtle">
          Registre os usos gastos e salve a ficha. Efeitos especiais das habilidades são decididos
          com o mestre na Mesa.
        </p>
        <div className="builder-resources">
          {resources.map((r) => (
            <Field
              label={`${r.name} · usados`}
              key={r.id}
              hint={`${r.max >= 999 ? 'Ilimitado' : `${r.max - (s.feature_uses?.[r.id] ?? 0)} / ${r.max} disponíveis`} · descanso ${r.rest === 'short' ? 'curto ou longo' : 'longo'}. ${r.description}`}
            >
              <Input
                type="number"
                min={0}
                max={r.max}
                value={s.feature_uses?.[r.id] ?? 0}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({
                    ...s,
                    feature_uses: {
                      ...s.feature_uses,
                      [r.id]: Math.min(r.max, Math.max(0, Math.floor(Number(e.target.value)))),
                    },
                  })
                }
              />
            </Field>
          ))}
        </div>
      </section>
    </div>
  );
}
