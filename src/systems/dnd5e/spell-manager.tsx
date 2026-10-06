'use client';
import { useState } from 'react';
import { BookOpen, Plus, Trash2, Sparkles, Moon, RotateCcw } from 'lucide-react';
import type { DndSheet, Spell } from './types';
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Badge,
  Modal,
  Empty,
  ErrorBox,
} from '@/components/ui';
import { useWorkspace } from '@/hooks/use-workspace';
import { uid, signed } from '@/lib/utils';
import {
  castingProfile,
  spellPools,
  spellProfile,
  spellIsInactive,
  normalizeSpellResources,
  recoverSpellResources,
  availableCastResources,
  castSpell,
  type CastResource,
} from './spellcasting';
import { SPELL_CATALOG, spellFromCatalog, type CatalogSpell } from './spell-catalog';
import { SpellBrowser, SpellDetails } from './spell-browser';
import { CLASSES } from './catalog';
import { classLevels } from './progression';
import { pathSpells } from './path-spells';
function ResourceRow({
  level,
  max,
  used,
  kind,
  onChange,
  readOnly,
}: {
  level: number;
  max: number;
  used: number;
  kind: 'slot' | 'pact' | 'arcanum';
  onChange(n: number): void;
  readOnly: boolean;
}) {
  const label = kind === 'pact' ? 'pacto' : kind === 'arcanum' ? 'Arcano Místico' : 'magia';
  return (
    <div className="spell-resource-row">
      <div>
        <strong>{level}º círculo</strong>
        <span className="subtle">
          {max - used} de {max} disponíveis
        </span>
      </div>
      <div className="resource-pips" aria-label={`${max - used} usos de ${label} disponíveis`}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < used ? 'pip pip-used' : 'pip'} />
        ))}
      </div>
      <Field label={`Usados · ${label} ${level}`}>
        <Input
          type="number"
          min={0}
          max={max}
          value={used}
          disabled={readOnly}
          onChange={(e) => onChange(Math.min(max, Math.max(0, Math.floor(Number(e.target.value)))))}
        />
      </Field>
    </div>
  );
}
function GrimoireSpell({
  spell: sp,
  sheet,
  readOnly,
  onUpdate,
  onRemove,
  onCast,
}: {
  spell: Spell;
  sheet: DndSheet;
  readOnly: boolean;
  onUpdate(update: Partial<Spell>): void;
  onRemove(): void;
  onCast(kind: CastResource, level: number): void;
}) {
  const seed = SPELL_CATALOG.find((e) => e.id === sp.catalog_id);
  const entry: CatalogSpell | undefined = sp.catalog_id
    ? {
        ...seed,
        id: sp.catalog_id,
        name: sp.name,
        english_name: sp.english_name ?? seed?.english_name ?? sp.name,
        level: sp.level,
        school: sp.school ?? seed?.school ?? '',
        casting_time: sp.casting_time ?? seed?.casting_time ?? '',
        range: sp.range,
        components: sp.components,
        duration: sp.duration,
        description: sp.description,
        ritual: !!sp.ritual,
        concentration: !!sp.concentration,
        classes: sp.catalog_classes ?? seed?.classes ?? [],
        source: sp.source ?? 'Catálogo da mesa',
        source_page: sp.source_page ?? 0,
        source_reference_page: sp.source_reference_page ?? seed?.source_reference_page ?? 0,
        source_pages: sp.source_pages ?? [],
        edition: '2014',
      }
    : undefined;
  const profile = spellProfile(sheet, sp),
    resources = availableCastResources(sheet, sp);
  const [selection, setSelection] = useState('');
  const key = (r: { kind: CastResource; level: number }) => `${r.kind}:${r.level}`;
  const chosen =
    resources.find((r) => key(r) === selection) ??
    resources.find((r) => r.remaining > 0) ??
    resources[0];
  const ready =
    sp.level === 0 ||
    sp.prepared ||
    sp.always_prepared ||
    sp.casting_mode === 'arcanum' ||
    chosen?.kind === 'ritual';
  return (
    <section
      className="spell-card grimoire-spell"
      aria-label={`Magia ${sp.name || 'personalizada'}`}
    >
      <div className="panel-heading">
        <div>
          <h4>{sp.name || 'Nova magia'}</h4>
          <div className="spell-tags">
            <Badge tone="muted">{sp.school || 'Personalizada'}</Badge>
            {sp.ritual && <Badge tone="blue">Ritual</Badge>}
            {sp.concentration && <Badge tone="blue">Concentração</Badge>}
            {sp.casting_mode === 'arcanum' && <Badge>Arcano Místico</Badge>}
            {spellIsInactive(sheet, sp) && (
              <Badge tone="muted">Indisponível nesta progressão</Badge>
            )}
          </div>
        </div>
        {!readOnly && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Remover magia ${sp.name}`}
            onClick={onRemove}
          >
            <Trash2 size={17} />
          </button>
        )}
      </div>
      <Field
        label={`Classe de conjuração de ${sp.name}`}
        hint="A classe de origem define atributo, CD e círculo de aprendizado."
      >
        <Select
          value={sp.class_id || sheet.class_id}
          disabled={readOnly}
          onChange={(e) => onUpdate({ class_id: e.target.value })}
        >
          {!classLevels(sheet).some((c) => c.class_id === (sp.class_id || sheet.class_id)) && (
            <option value={sp.class_id}>
              {CLASSES[sp.class_id ?? '']?.name ?? sp.class_id} · classe anterior
            </option>
          )}
          {classLevels(sheet).map((c) => (
            <option key={c.class_id} value={c.class_id}>
              {CLASSES[c.class_id]?.name} {c.level}
            </option>
          ))}
        </Select>
      </Field>
      <div className="spell-preparation">
        <label>
          <input
            type="checkbox"
            checked={sp.level === 0 || sp.prepared || !!sp.always_prepared}
            disabled={
              readOnly || sp.level === 0 || sp.casting_mode === 'arcanum' || sp.always_prepared
            }
            onChange={(e) => onUpdate({ prepared: e.target.checked })}
          />
          {sp.level === 0
            ? 'Truque conhecido'
            : profile.learning === 'known'
              ? 'Conhecida'
              : 'Preparada'}
        </label>
        {sp.level > 0 && sp.casting_mode !== 'arcanum' && (
          <label>
            <input
              type="checkbox"
              checked={!!sp.always_prepared}
              disabled={readOnly}
              onChange={(e) =>
                onUpdate({
                  always_prepared: e.target.checked,
                  prepared: e.target.checked || sp.prepared,
                })
              }
            />
            Sempre preparada / extra
          </label>
        )}
      </div>
      <div className="spell-cast-controls">
        {sp.level === 0 ? (
          <span className="subtle">Truques não gastam espaços.</span>
        ) : (
          <Field label={`Recurso para ${sp.name}`}>
            <Select
              disabled={readOnly || !resources.length}
              value={chosen ? key(chosen) : ''}
              onChange={(e) => setSelection(e.target.value)}
            >
              {!resources.length && <option value="">Sem recurso disponível neste nível</option>}
              {resources.map((r) => (
                <option key={key(r)} value={key(r)}>
                  {r.kind === 'ritual'
                    ? 'Ritual · sem gasto'
                    : r.kind === 'arcanum'
                      ? `Arcano ${r.level}º · ${r.remaining} uso`
                      : `${r.kind === 'pact' ? 'Pacto' : 'Espaço'} ${r.level}º · ${r.remaining} disponíveis`}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={readOnly || !chosen || chosen.remaining < 1 || !ready}
          onClick={() => chosen && onCast(chosen.kind, chosen.level)}
        >
          <Sparkles size={16} />
          {chosen?.kind === 'ritual' ? 'Conjurar ritual' : 'Conjurar'}
        </Button>
      </div>
      {!ready && (
        <small className="subtle">
          Marque como {profile.learning === 'known' ? 'conhecida' : 'preparada'} para conjurar.
        </small>
      )}
      <details className="spell-expanded" open={!entry || undefined}>
        <summary>{entry ? 'Descrição e referência' : 'Editar magia personalizada'}</summary>
        {entry ? (
          <SpellDetails spell={entry} />
        ) : (
          <div className="form-grid">
            <Field label="Nome da magia">
              <Input
                value={sp.name}
                disabled={readOnly}
                onChange={(e) => onUpdate({ name: e.target.value })}
              />
            </Field>
            <Field label="Círculo (0 = truque)">
              <Input
                type="number"
                min={0}
                max={9}
                value={sp.level}
                disabled={readOnly}
                onChange={(e) => onUpdate({ level: Number(e.target.value) })}
              />
            </Field>
            {(['casting_time', 'range', 'duration', 'components'] as const).map((k) => (
              <Field
                key={k}
                label={
                  {
                    casting_time: 'Tempo de lançamento',
                    range: 'Alcance',
                    duration: 'Duração',
                    components: 'Componentes',
                  }[k]
                }
              >
                <Input
                  value={sp[k] ?? ''}
                  disabled={readOnly}
                  onChange={(e) => onUpdate({ [k]: e.target.value })}
                />
              </Field>
            ))}
            <div className="full-width">
              <Field label="Descrição">
                <Textarea
                  value={sp.description}
                  disabled={readOnly}
                  onChange={(e) => onUpdate({ description: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}
      </details>
      <div className="spell-note-grid">
        <Field label={`Origem de ${sp.name || 'magia'}`}>
          <Select
            value={sp.casting_mode ?? 'class'}
            disabled={readOnly}
            onChange={(e) =>
              onUpdate({
                casting_mode: e.target.value as Spell['casting_mode'],
                prepared: e.target.value === 'arcanum' || sp.prepared,
              })
            }
          >
            <option value="class">Magia de classe</option>
            <option value="bonus">Raça, talento ou habilidade</option>
            {profile.pact && sp.level >= 6 && (
              <option
                value="arcanum"
                disabled={
                  !profile.arcanumLevels.includes(sp.level) ||
                  (!!entry && !entry.classes.includes('warlock'))
                }
              >
                Arcano Místico
                {!profile.arcanumLevels.includes(sp.level) ? ' · requer nível maior' : ''}
              </option>
            )}
          </Select>
        </Field>
        <Field label={`Notas de ${sp.name || 'magia'}`}>
          <Input
            value={sp.notes ?? ''}
            disabled={readOnly}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            placeholder="Efeitos, escolhas ou anotações da mesa"
          />
        </Field>
      </div>
    </section>
  );
}
export default function SpellManager({
  sheet: s,
  onChange,
  readOnly = false,
  onRemove,
}: {
  sheet: DndSheet;
  onChange(sheet: DndSheet): void;
  readOnly?: boolean;
  onRemove(id: string): void;
}) {
  const [selectedClass, setSelectedClass] = useState(s.class_id);
  const activeClass = classLevels(s).some((c) => c.class_id === selectedClass)
    ? selectedClass
    : s.class_id;
  const pools = spellPools(s);
  const w = useWorkspace(),
    p = castingProfile(s, activeClass),
    normalized = normalizeSpellResources(s);
  const [browser, setBrowser] = useState(false),
    [error, setError] = useState<string | null>(null);
  const classSpells = s.spells.filter(
    (sp) =>
      (sp.class_id || s.class_id) === activeClass &&
      sp.level > 0 &&
      sp.level <= p.spellLimit &&
      sp.casting_mode !== 'arcanum' &&
      sp.casting_mode !== 'bonus' &&
      !sp.always_prepared &&
      sp.prepared,
  );
  const cantrips = s.spells.filter(
    (sp) =>
      (sp.class_id || s.class_id) === activeClass && sp.level === 0 && sp.casting_mode !== 'bonus',
  ).length;
  const activeLimit = p.prepared ?? p.known;
  const granted = pathSpells(s, activeClass);
  const update = (id: string, changes: Partial<Spell>) =>
    onChange({ ...s, spells: s.spells.map((sp) => (sp.id === id ? { ...sp, ...changes } : sp)) });
  function add(entry: CatalogSpell) {
    if (s.spells.some((sp) => sp.catalog_id === entry.id)) return;
    const arcanum =
      p.pact && p.arcanumLevels.includes(entry.level) && entry.classes.includes('warlock');
    if (
      arcanum &&
      s.spells.some((sp) => sp.casting_mode === 'arcanum' && sp.level === entry.level)
    ) {
      setError(
        `Você já escolheu um Arcano Místico do ${entry.level}º círculo. Remova o anterior para trocar.`,
      );
      return;
    }
    const added = spellFromCatalog(entry, uid(), activeClass, arcanum);
    added.prepared = added.prepared || p.learning === 'known';
    if (!entry.classes.includes(p.catalogClass)) added.casting_mode = 'bonus';
    onChange({ ...s, spells: [...s.spells, added] });
    setError(null);
    w.notify(`${entry.name} adicionada à ficha.`);
  }
  function cast(sp: Spell, kind: CastResource, level: number) {
    try {
      onChange(castSpell(s, sp, kind, level));
      setError(null);
      w.notify(
        `${sp.name} conjurada${kind === 'slot' || kind === 'pact' ? ` · espaço do ${level}º círculo usado` : kind === 'arcanum' ? ' · uso de Arcano Místico gasto' : kind === 'ritual' ? ' como ritual · sem gasto' : ' · sem gasto'}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const ability = p.ability ? Math.floor((s.abilities[p.ability] - 10) / 2) : 0,
    prof = 2 + Math.floor((Math.min(20, Math.max(1, s.level)) - 1) / 4);
  return (
    <div className="form-stack spell-manager">
      <ErrorBox message={error} />
      {!!granted.length && (
        <div className="info-box">
          <p>Magias do caminho · sempre preparadas: {granted.join(', ')}.</p>
          <Button
            type="button"
            variant="ghost"
            disabled={
              readOnly || granted.every((name) => s.spells.some((sp) => sp.english_name === name))
            }
            onClick={() => {
              const additions = granted.flatMap((name) => {
                const entry = SPELL_CATALOG.find((e) => e.english_name === name);
                if (!entry || s.spells.some((sp) => sp.catalog_id === entry.id)) return [];
                return [
                  {
                    ...spellFromCatalog(entry, uid(), activeClass),
                    prepared: true,
                    always_prepared: true,
                    casting_mode: 'bonus' as const,
                    granted_path: classLevels(s).find((c) => c.class_id === activeClass)
                      ?.subclass_id,
                    notes: 'Concedida pelo caminho da classe; sempre preparada.',
                  },
                ];
              });
              onChange({ ...s, spells: [...s.spells, ...additions] });
            }}
          >
            Adicionar magias concedidas pelo caminho
          </Button>
        </div>
      )}
      <Field
        label="Classe do grimório"
        hint="Conhecidas e preparadas são contadas separadamente para cada classe."
      >
        <Select value={activeClass} onChange={(e) => setSelectedClass(e.target.value)}>
          {classLevels(s).map((c) => (
            <option key={c.class_id} value={c.class_id}>
              {CLASSES[c.class_id]?.name} · nível {c.level}
            </option>
          ))}
        </Select>
      </Field>
      <div className="detail-stats">
        <div className="detail-stat">
          <strong>{p.ability ? 8 + prof + ability : '—'}</strong>
          <span>CD de magia</span>
        </div>
        <div className="detail-stat">
          <strong>{p.ability ? signed(prof + ability) : '—'}</strong>
          <span>Ataque mágico</span>
        </div>
        <div className="detail-stat">
          <strong>
            {cantrips}
            {p.cantrips ? ` / ${p.cantrips}` : ''}
          </strong>
          <span>Truques de classe</span>
        </div>
        <div className="detail-stat">
          <strong>
            {classSpells.length}
            {activeLimit !== null ? ` / ${activeLimit}` : ''}
          </strong>
          <span>{p.learning === 'known' ? 'Magias conhecidas' : 'Magias preparadas'}</span>
        </div>
      </div>
      {((p.cantrips > 0 && cantrips > p.cantrips) ||
        (activeLimit !== null && classSpells.length > activeLimit)) && (
        <div className="info-box">
          A seleção excede o limite básico da classe. Marque as magias concedidas por domínio,
          juramento, raça ou talento como extras, conforme as regras da mesa.
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>
              {pools.pactSlots && !pools.slots.length
                ? 'Espaços de pacto'
                : 'Espaços de magia compartilhados'}
            </h3>
            <p className="subtle">
              {CLASSES[activeClass]?.name} · nível de classe {p.classLevel} · total {s.level} ·{' '}
              {pools.slots.length
                ? 'espaços comuns recuperam em descanso longo'
                : 'pacto recupera em descanso curto ou longo'}
            </p>
          </div>
          <div className="spell-rest-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={readOnly || !pools.pactSlots}
              onClick={() => {
                onChange(recoverSpellResources(s, 'short'));
                w.notify('Espaços de pacto recuperados.');
              }}
            >
              <RotateCcw size={15} />
              Descanso curto
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={readOnly}
              onClick={() => {
                onChange(recoverSpellResources(s, 'long'));
                w.notify('Espaços de magia e Arcanos Místicos recuperados.');
              }}
            >
              <Moon size={15} />
              Descanso longo
            </Button>
          </div>
        </div>
        {pools.slots.map(
          (max, i) =>
            max > 0 && (
              <ResourceRow
                key={`slot-${i}`}
                level={i + 1}
                max={max}
                used={normalized.slots_used[String(i + 1)] ?? 0}
                kind="slot"
                readOnly={readOnly}
                onChange={(used) =>
                  onChange({ ...s, slots_used: { ...s.slots_used, [String(i + 1)]: used } })
                }
              />
            ),
        )}
        {pools.pactSlots > 0 && (
          <div className="arcanum-section">
            {!!pools.slots.length && <h4>Espaços de pacto · reserva separada</h4>}
            <ResourceRow
              level={pools.pactLevel}
              max={pools.pactSlots}
              used={normalized.pact_slots_used ?? 0}
              kind="pact"
              readOnly={readOnly}
              onChange={(used) => onChange({ ...s, pact_slots_used: used })}
            />
          </div>
        )}
        {!pools.slots.length && !pools.pactSlots && (
          <p className="subtle">Este personagem ainda não possui espaços de magia.</p>
        )}
        {!!pools.arcanumLevels.length && (
          <div className="arcanum-section">
            <h4>Arcanos Místicos</h4>
            <p className="subtle">
              Uma magia escolhida por círculo; um uso por descanso longo. Usam um recurso próprio.
            </p>
            {pools.arcanumLevels.map((level) => (
              <ResourceRow
                key={level}
                level={level}
                max={1}
                kind="arcanum"
                used={normalized.arcanum_used?.[String(level)] ?? 0}
                readOnly={readOnly}
                onChange={(used) =>
                  onChange({ ...s, arcanum_used: { ...s.arcanum_used, [String(level)]: used } })
                }
              />
            ))}
          </div>
        )}
      </section>
      <div className="panel-heading">
        <div>
          <h3>Grimório</h3>
          <p className="subtle">Organizado por círculo · {s.spells.length} entradas</p>
        </div>
        {!readOnly && (
          <div className="spell-rest-actions">
            <Button type="button" variant="secondary" onClick={() => setBrowser(true)}>
              <BookOpen size={17} />
              Catálogo de magias
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...s,
                  spells: [
                    ...s.spells,
                    {
                      id: uid(),
                      name: 'Nova magia',
                      level: 0,
                      prepared: true,
                      description: '',
                      range: '',
                      duration: '',
                      components: '',
                      casting_mode: 'bonus',
                    },
                  ],
                })
              }
            >
              <Plus size={17} />
              Personalizada
            </Button>
          </div>
        )}
      </div>
      {!readOnly && (
        <p className="subtle">
          Conjurações, descansos e escolhas serão gravados ao salvar a ficha. Truques não consomem
          espaços; magias podem usar espaços de círculos superiores.
        </p>
      )}
      {s.spells.length ? (
        Array.from({ length: 10 }, (_, level) => {
          const spells = s.spells
            .filter((sp) => sp.level === level)
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
          return spells.length ? (
            <section className="grimoire-circle" key={level}>
              <h3>
                {level === 0 ? 'Truques' : `${level}º círculo`}
                <Badge tone="muted">{spells.length}</Badge>
              </h3>
              {spells.map((sp) => (
                <GrimoireSpell
                  key={sp.id}
                  spell={sp}
                  sheet={s}
                  readOnly={readOnly}
                  onUpdate={(changes) => update(sp.id, changes)}
                  onRemove={() => onRemove(sp.id)}
                  onCast={(kind, l) => cast(sp, kind, l)}
                />
              ))}
            </section>
          ) : null;
        })
      ) : (
        <Empty
          title="Seu grimório está esperando a primeira magia."
          description="Consulte o catálogo e escolha magias da sua classe."
        />
      )}
      <Modal
        open={browser}
        onClose={() => setBrowser(false)}
        title="Catálogo de magias e truques"
        description="Referência do PDF fornecido · D&D 5e de 2014"
        wide
      >
        <SpellBrowser
          key={`${activeClass}:${p.classLevel}`}
          classId={p.catalogClass}
          maxLevel={Math.max(p.spellLimit, ...p.arcanumLevels, 0)}
          addedIds={s.spells.flatMap((sp) => (sp.catalog_id ? [sp.catalog_id] : []))}
          onAdd={add}
        />
        <ErrorBox message={error} />
      </Modal>
    </div>
  );
}
