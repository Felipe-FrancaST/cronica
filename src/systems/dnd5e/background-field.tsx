'use client';
import { Field, Input, Select } from '@/components/ui';
import { BACKGROUNDS, backgroundFor } from './backgrounds';
import { selectBackground } from './creation';
import type { DndSheet } from './types';

export function BackgroundField({
  sheet,
  onChange,
  readOnly,
  label = 'Antecedente',
}: {
  sheet: DndSheet;
  onChange(s: DndSheet): void;
  readOnly?: boolean;
  label?: string;
}) {
  const bg = backgroundFor(sheet),
    locked = !!sheet.creation?.equipment_applied;
  return (
    <>
      <Field
        label={label}
        hint={
          locked
            ? 'Origem preservada após receber o equipamento inicial.'
            : 'Livro do Jogador de 2014 · selecione a origem para preencher os benefícios.'
        }
      >
        <Select
          value={bg?.id ?? (sheet.background ? 'legacy' : '')}
          disabled={readOnly || locked}
          onChange={(e) => onChange(selectBackground(sheet, e.target.value))}
        >
          <option value="">Escolha o antecedente…</option>
          {!bg && sheet.background && (
            <option value="legacy">{sheet.background} · antecedente atual</option>
          )}
          <optgroup label="Livro do Jogador (2014)">
            {BACKGROUNDS.filter((b) => !b.variantOf && b.id !== 'custom').map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Variantes do Livro do Jogador">
            {BACKGROUNDS.filter((b) => b.variantOf).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </optgroup>
          <option value="custom">Antecedente personalizado</option>
        </Select>
      </Field>
      {bg?.id === 'custom' && label === 'Antecedente' && (
        <Field label="Nome do antecedente personalizado">
          <Input
            value={sheet.creation?.custom_background_name ?? ''}
            disabled={readOnly || locked}
            onChange={(e) =>
              onChange({
                ...sheet,
                background: e.target.value || 'Antecedente personalizado',
                creation: { ...sheet.creation!, custom_background_name: e.target.value },
              })
            }
          />
        </Field>
      )}
    </>
  );
}
