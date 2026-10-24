'use client';
import { useState } from 'react';
import { Disclosure } from '@/components/disclosure';
import { Field, Select, Input, Badge } from '@/components/ui';
import { getRace, RACE_CATALOG } from './ancestries';
export function RaceField({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange(value: string, id: string | null): void;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState('');
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR');
  const race = getRace(value),
    filtered = RACE_CATALOG.filter((r) =>
      normalize(r.name + ' ' + r.source).includes(normalize(query)),
    );
  return (
    <div className="form-stack">
      {!readOnly && (
        <Field label="Pesquisar raça">
          <Input
            type="search"
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
            placeholder="Nome ou livro de origem…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
      )}
      {query && (
        <small role="status">
          {filtered.length} raça(s) encontrada(s). A raça atual é preservada até você escolher
          outra.
        </small>
      )}
      <Field label="Raça">
        <Select
          searchable={false}
          value={race?.id ?? 'custom'}
          disabled={readOnly}
          onChange={(e) => {
            const r = getRace(e.target.value);
            onChange(r?.name ?? '', r?.id ?? null);
          }}
        >
          {[...filtered, ...(race && !filtered.some((r) => r.id === race.id) ? [race] : [])].map(
            (r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.optional ? ' · opcional' : ''}
              </option>
            ),
          )}
          <option value="custom">Raça personalizada</option>
        </Select>
      </Field>
      {!race && (
        <Field label="Nome da raça personalizada">
          <Input
            value={value}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value, null)}
          />
        </Field>
      )}
      {race && (
        <fieldset className="ancestry-summary race-characteristics">
          <legend>Características da raça</legend>
          <div className="spell-tags">
            <Badge tone="muted">{race.size}</Badge>
            <Badge tone="muted">{race.speed} m</Badge>
            <Badge tone="blue">
              {race.darkvision > 0 ? `Visão no escuro: ${race.darkvision} m` : 'Visão normal'}
            </Badge>
          </div>
          <Disclosure title="Traços raciais">
            <ul>
              {race.traits.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Disclosure>
          <Disclosure title="Referências da raça">
            <small className="subtle">
              {race.source}
              {race.optional ? ' · suplemento opcional Plane Shift' : ''}
            </small>
          </Disclosure>
        </fieldset>
      )}
    </div>
  );
}
