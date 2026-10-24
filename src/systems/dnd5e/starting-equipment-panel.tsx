'use client';
import { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { Button, ErrorBox, Field, Select } from '@/components/ui';
import { uid } from '@/lib/utils';
import { backgroundFor } from './backgrounds';
import {
  CLASS_STARTING_EQUIPMENT,
  applyBookStartingEquipment,
  backgroundStartingEquipment,
  equipmentSelection,
  resolveStartingEquipment,
  resolvedEquipmentOption,
} from './starting-equipment';
import type { DndSheet } from './types';
export function StartingEquipmentPanel({
  sheet: s,
  readOnly,
  onChange,
}: {
  sheet: DndSheet;
  readOnly?: boolean;
  onChange(s: DndSheet): void;
}) {
  const [error, setError] = useState<string | null>(null),
    c = s.creation,
    bg = backgroundFor(s),
    selected = equipmentSelection(s);
  const groups = [
    ...(CLASS_STARTING_EQUIPMENT[s.class_id]?.choices ?? []),
    ...backgroundStartingEquipment(s).choices,
  ];
  const locked = readOnly || c?.equipment_applied;
  const choose = (id: string, values: string[]) =>
    onChange({ ...s, creation: { ...c!, equipment_choices: { ...selected, [id]: values } } });
  const preview = (() => {
    try {
      return resolveStartingEquipment(s);
    } catch {
      return [];
    }
  })();
  return (
    <div className="form-stack">
      <ErrorBox message={error} />
      <p className="subtle">
        Escolha cada alternativa da sua classe inicial. Os pacotes são desmembrados nos itens e
        quantidades do livro. Multiclasse não concede outro conjunto.
      </p>
      <div className="form-grid">
        {groups.map((group) => {
          const opt = resolvedEquipmentOption(group, selected);
          return (
            <div className="form-stack" key={group.id}>
              <Field label={group.label}>
                <Select
                  value={opt.id}
                  disabled={locked}
                  onChange={(e) => choose(group.id, [e.target.value])}
                >
                  {group.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {(opt.picks ?? []).flatMap((p) =>
                Array.from({ length: p.count }, (_, index) => {
                  const key = `${group.id}:${opt.id}:${p.id}`;
                  return (
                    <Field
                      key={`${key}:${index}`}
                      label={`${p.label}${p.count > 1 ? ` ${index + 1}` : ''}`}
                    >
                      <Select
                        value={selected[key]?.[index] ?? p.options[0].name}
                        disabled={locked}
                        onChange={(e) => {
                          const values = Array.from(
                            { length: p.count },
                            (_, i) => selected[key]?.[i] ?? p.options[0].name,
                          );
                          values[index] = e.target.value;
                          choose(key, values);
                        }}
                      >
                        {p.options.map((i) => (
                          <option key={i.name} value={i.name}>
                            {i.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  );
                }),
              )}
            </div>
          );
        })}
      </div>
      <details className="starting-equipment-preview">
        <summary>Conferir itens e quantidades · {preview.length} tipos</summary>
        <ul>
          {preview.map((i) => (
            <li key={i.name}>
              {i.quantity} × {i.name}
            </li>
          ))}
        </ul>
        <p>
          {bg?.gp ?? 0} PO do antecedente. Armadura e escudo iniciais são equipados se você ainda
          não usa outros.
        </p>
      </details>
      <Button
        type="button"
        className="starting-equipment-action"
        disabled={locked || !bg}
        disabledReason={
          !bg
            ? 'Escolha um antecedente antes de receber o equipamento.'
            : c?.equipment_applied
              ? 'O equipamento inicial já foi recebido. Novos itens são gerenciados no inventário.'
              : 'A ficha está disponível somente para consulta.'
        }
        onClick={() => {
          try {
            onChange(applyBookStartingEquipment(s, uid));
            setError(null);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <PackageCheck size={17} />
        {c?.equipment_applied
          ? 'Equipamento inicial aplicado'
          : 'Aplicar equipamento e moedas iniciais'}
      </Button>
    </div>
  );
}
