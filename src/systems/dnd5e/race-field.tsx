'use client';
import { Field, Select, Input, Badge } from '@/components/ui';
import { getRace, RACE_CATALOG, RACE_GROUPS } from './ancestries';
export function RaceField({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange(value: string, id: string | null): void;
  readOnly?: boolean;
}) {
  const race = getRace(value);
  return (
    <div className="form-stack">
      <Field label="Raça">
        <Select
          value={race?.id ?? 'custom'}
          disabled={readOnly}
          onChange={(e) => {
            const r = getRace(e.target.value);
            onChange(r?.name ?? '', r?.id ?? null);
          }}
        >
          {RACE_GROUPS.map((source) => (
            <optgroup key={source} label={source}>
              {RACE_CATALOG.filter((r) => r.source === source).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.optional ? ' · opcional' : ''}
                </option>
              ))}
            </optgroup>
          ))}
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
        <div className="ancestry-summary">
          <div className="spell-tags">
            <Badge tone="muted">{race.size}</Badge>
            <Badge tone="muted">{race.speed} m</Badge>
            {race.darkvision > 0 && <Badge tone="blue">Visão no escuro: {race.darkvision} m</Badge>}
          </div>
          <small>{race.traits.join(' · ')}</small>
          <small className="subtle">
            {race.source}
            {race.optional ? ' · suplemento opcional Plane Shift' : ''}
          </small>
        </div>
      )}
    </div>
  );
}
