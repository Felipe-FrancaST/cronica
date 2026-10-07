'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Field, Input, Select, Button, Badge, Empty } from '@/components/ui';
import { CLASSES } from './catalog';
import { filterSpells, SPELL_SCHOOLS, SPELL_CATALOG, type CatalogSpell } from './spell-catalog';
import { loadSpellCatalog } from './catalog-repository';
import { useWorkspace } from '@/hooks/use-workspace';
export function SpellDetails({ spell }: { spell: CatalogSpell }) {
  return (
    <div className="spell-details">
      <div>
        <h3>{spell.name}</h3>
        <p className="subtle">{spell.english_name}</p>
      </div>
      <div className="spell-tags">
        <Badge>{spell.level === 0 ? 'Truque' : `${spell.level}º círculo`}</Badge>
        <Badge tone="muted">{spell.school}</Badge>
        {spell.ritual && <Badge tone="blue">Ritual</Badge>}
        {spell.concentration && <Badge tone="blue">Concentração</Badge>}
      </div>
      <dl className="spell-facts">
        {[
          ['Lançamento', spell.casting_time],
          ['Alcance', spell.range],
          ['Componentes', spell.components],
          ['Duração', spell.duration],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="spell-description">{spell.description}</p>
      <div>
        <strong>Classes</strong>
        <p className="subtle">{spell.classes.map((c) => CLASSES[c]?.name ?? c).join(' · ')}</p>
      </div>
      <small className="subtle">
        {spell.source}
        {spell.source_page > 0 ? ` · página ${spell.source_page}` : ''}
        {spell.source_reference_page > 0 ? ` (referência p. ${spell.source_reference_page})` : ''} ·
        regras de 2014
      </small>
    </div>
  );
}
export function SpellBrowser({
  classId = '',
  maxLevel,
  onAdd,
  addedIds = [],
  lockClass = false,
  canLearn,
  extraNames = [],
}: {
  classId?: string;
  maxLevel?: number;
  onAdd?(spell: CatalogSpell): void;
  addedIds?: string[];
  lockClass?: boolean;
  canLearn?(spell: CatalogSpell): string | null;
  extraNames?: string[];
}) {
  const { demo } = useWorkspace();
  const [catalog, setCatalog] = useState(SPELL_CATALOG),
    [local, setLocal] = useState(false);
  const [query, setQuery] = useState(''),
    [cls, setCls] = useState(classId),
    [level, setLevel] = useState(''),
    [school, setSchool] = useState('');
  const [ritual, setRitual] = useState(false),
    [concentration, setConcentration] = useState(false),
    [available, setAvailable] = useState(true),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState('');
  useEffect(() => {
    let active = true;
    void loadSpellCatalog(demo).then((r) => {
      if (active) {
        setCatalog(r.spells);
        setLocal(r.local);
      }
    });
    return () => {
      active = false;
    };
  }, [demo]);
  const results = useMemo(
    () =>
      filterSpells(
        lockClass && extraNames.length
          ? catalog.filter(
              (sp) => sp.classes.includes(classId) || extraNames.includes(sp.english_name),
            )
          : catalog,
        {
          query,
          classId: lockClass ? (extraNames.length ? '' : classId) : cls,
          level,
          school,
          ritual,
          concentration,
          maxLevel: lockClass || available ? maxLevel : undefined,
        },
      ),
    [
      catalog,
      query,
      cls,
      classId,
      lockClass,
      level,
      school,
      ritual,
      concentration,
      maxLevel,
      available,
      extraNames,
    ],
  );
  useEffect(() => setPage(0), [query, cls, level, school, ritual, concentration, available]);
  const pages = Math.max(1, Math.ceil(results.length / 12)),
    safePage = Math.min(page, pages - 1),
    visible = results.slice(safePage * 12, (safePage + 1) * 12),
    detail = visible.find((s) => s.id === selected) ?? visible[0];
  return (
    <div className="form-stack spell-browser">
      <div className="catalog-search">
        <Search size={18} />
        <Input
          aria-label="Buscar magia"
          placeholder="Busque em português ou inglês..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="catalog-filters">
        <Field label="Classe da magia">
          <Select
            value={lockClass ? classId : cls}
            disabled={lockClass}
            onChange={(e) => setCls(e.target.value)}
          >
            <option value="">Todas as classes</option>
            {Object.values(CLASSES)
              .filter((c) => c.caster !== 'none')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Círculo">
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Todos os círculos</option>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? 'Truques' : `${i}º círculo`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Escola">
          <Select value={school} onChange={(e) => setSchool(e.target.value)}>
            <option value="">Todas as escolas</option>
            {SPELL_SCHOOLS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="catalog-options">
        <label>
          <input type="checkbox" checked={ritual} onChange={(e) => setRitual(e.target.checked)} />
          Rituais
        </label>
        <label>
          <input
            type="checkbox"
            checked={concentration}
            onChange={(e) => setConcentration(e.target.checked)}
          />
          Concentração
        </label>
        {maxLevel !== undefined && !lockClass && (
          <label>
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            Somente círculos disponíveis
          </label>
        )}
      </div>
      <div className="catalog-result-count" role="status">
        {results.length} {results.length === 1 ? 'resultado' : 'resultados'} · {catalog.length}{' '}
        magias e truques no catálogo
        {local && <small>Catálogo de referência local · sincronização indisponível</small>}
      </div>
      {!results.length ? (
        <Empty
          title="Nenhuma magia encontrada."
          description="Ajuste os filtros ou consulte todas as classes."
        />
      ) : (
        <div className="spell-browser-columns">
          <div className="spell-result-list" aria-label="Resultados de magias">
            {visible.map((sp) => (
              <button
                type="button"
                key={sp.id}
                className={`spell-result ${detail?.id === sp.id ? 'spell-result-selected' : ''}`}
                aria-pressed={detail?.id === sp.id}
                onClick={() => setSelected(sp.id)}
              >
                <strong>{sp.name}</strong>
                <span>
                  {sp.level === 0 ? 'Truque' : `${sp.level}º círculo`} · {sp.school}
                  {addedIds.includes(sp.id) ? ' · Na ficha' : ''}
                </span>
              </button>
            ))}
          </div>
          {detail && (
            <section className="panel spell-preview">
              <SpellDetails spell={detail} />
              {onAdd && (
                <Button
                  type="button"
                  className="catalog-add"
                  disabled={addedIds.includes(detail.id) || !!canLearn?.(detail)}
                  disabledReason={
                    addedIds.includes(detail.id)
                      ? 'Esta magia já está na ficha.'
                      : canLearn?.(detail)
                  }
                  onClick={() => onAdd(detail)}
                >
                  <Plus size={17} />
                  {addedIds.includes(detail.id) ? 'Já está na ficha' : 'Adicionar à ficha'}
                </Button>
              )}
              {onAdd && canLearn?.(detail) && (
                <p className="subtle" role="status">
                  {canLearn(detail)}
                </p>
              )}
            </section>
          )}
        </div>
      )}
      {pages > 1 && (
        <div className="catalog-pagination">
          <Button
            type="button"
            variant="secondary"
            disabled={safePage === 0}
            disabledReason="Você já está na primeira página do catálogo."
            onClick={() => setPage(safePage - 1)}
            aria-label="Página anterior de magias"
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            Página {safePage + 1} de {pages}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={safePage === pages - 1}
            disabledReason="Você já está na última página do catálogo."
            onClick={() => setPage(safePage + 1)}
            aria-label="Próxima página de magias"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
