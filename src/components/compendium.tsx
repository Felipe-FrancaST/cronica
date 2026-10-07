'use client';
import { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Badge, Field, Input, Select, Tabs } from './ui';
import { ABILITIES, CLASSES } from '@/systems/dnd5e/catalog';
import { RACE_CATALOG, RACE_GROUPS } from '@/systems/dnd5e/ancestries';
import { SpellBrowser } from '@/systems/dnd5e/spell-browser';
import { normalizeSearch } from '@/systems/dnd5e/spell-catalog';
import { ItemReference } from '@/systems/dnd5e/item-reference';
import { ITEM_CATALOG } from '@/systems/dnd5e/items';
import {
  ProgressionReference,
  BackgroundReference,
  CreationReference,
} from '@/systems/dnd5e/progression-reference';
export function Compendium() {
  const [tab, setTab] = useState('spells'),
    [query, setQuery] = useState(''),
    [source, setSource] = useState('');
  const races = useMemo(
    () =>
      RACE_CATALOG.filter(
        (r) =>
          (!source || r.source === source) &&
          normalizeSearch(`${r.name} ${r.source} ${r.parent ?? ''}`).includes(
            normalizeSearch(query),
          ),
      ),
    [query, source],
  );
  return (
    <div className="page-content compendium">
      <div className="page-heading">
        <div>
          <p className="eyebrow">REFERÊNCIA DA MESA</p>
          <h1>
            <BookOpen size={28} />
            Compêndio D&D 5e
          </h1>
          <p className="subtle">
            13 classes · {RACE_CATALOG.length} raças e variantes · 361 magias e truques · regras de
            2014 · {ITEM_CATALOG.length} itens
          </p>
        </div>
      </div>
      <Tabs
        label="Categorias do compêndio"
        value={tab}
        onChange={setTab}
        idPrefix="compendium"
        panelId="compendium-panel"
        items={[
          { id: 'spells', label: 'Magias e truques' },
          { id: 'classes', label: 'Classes' },
          { id: 'progression', label: 'Habilidades e caminhos' },
          { id: 'backgrounds', label: 'Antecedentes' },
          { id: 'creation', label: 'Criação e multiclasse' },
          { id: 'races', label: 'Raças e linhagens' },
          { id: 'items', label: 'Itens e equipamentos' },
        ]}
      />
      <div
        role="tabpanel"
        id="compendium-panel"
        aria-labelledby={`compendium-${tab}`}
        tabIndex={0}
        className="catalog-page-panel"
      >
        {tab === 'spells' && <SpellBrowser />}
        {tab === 'items' && <ItemReference />}
        {tab === 'progression' && <ProgressionReference />}
        {tab === 'backgrounds' && <BackgroundReference />}
        {tab === 'creation' && <CreationReference />}
        {tab === 'classes' && (
          <div className="reference-grid">
            {Object.values(CLASSES).map((c) => (
              <section key={c.id} className="panel reference-card">
                <div className="panel-heading">
                  <h3>{c.name}</h3>
                  <Badge>d{c.hitDie}</Badge>
                </div>
                <p>{c.description}</p>
                <dl className="spell-facts">
                  <div>
                    <dt>Salvaguardas</dt>
                    <dd>
                      {c.saves.map((a) => ABILITIES.find((x) => x.id === a)?.label).join(' e ')}
                    </dd>
                  </div>
                  <div>
                    <dt>Conjuração</dt>
                    <dd>
                      {c.caster === 'none'
                        ? 'Por subclasse ou habilidade'
                        : `${c.spellAbility ? ABILITIES.find((a) => a.id === c.spellAbility)?.label : ''} · ${c.caster === 'pact' ? 'magia de pacto' : c.spellLearning === 'prepared' ? 'magias preparadas' : 'magias conhecidas'}`}
                    </dd>
                  </div>
                </dl>
                <small className="subtle">{c.source}</small>
              </section>
            ))}
          </div>
        )}
        {tab === 'races' && (
          <div className="form-stack">
            <div className="catalog-filters">
              <Field label="Buscar raça">
                <Input
                  value={query}
                  placeholder="Nome, família ou livro..."
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Field>
              <Field label="Fonte da raça">
                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">Todas as fontes</option>
                  {RACE_GROUPS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="subtle" role="status">
              {races.length} raças e variantes. As opções de Plane Shift estão identificadas como
              suplementos opcionais.
            </p>
            <div className="reference-grid">
              {races.map((r) => (
                <section key={r.id} className="panel reference-card">
                  <h3>{r.name}</h3>
                  <div className="spell-tags">
                    <Badge tone="muted">{r.size}</Badge>
                    <Badge tone="muted">{r.speed} m</Badge>
                    {r.darkvision > 0 && <Badge tone="blue">Visão: {r.darkvision} m</Badge>}
                    {r.optional && <Badge>Opcional</Badge>}
                  </div>
                  <p>{r.traits.join(' · ')}</p>
                  <small className="subtle">{r.source}</small>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
