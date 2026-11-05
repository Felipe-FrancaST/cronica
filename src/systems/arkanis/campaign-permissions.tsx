'use client';
import { useState, type FormEvent } from 'react';
import type { Campaign } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { rulesFor } from '@/features/sessions/types';
import { saveRules } from '@/features/sessions/repository';
import { Button, ErrorBox, Field, Select } from '@/components/ui';
import { PageHeading } from '@/components/shell';
import { errorMessage } from '@/lib/utils';

export function ArkanisPermissions({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace(),
    [value, setValue] = useState(() => {
      const r = rulesFor(w.data.rules, campaign.id);
      return {
        ...r,
        hit_point_method:
          r.hit_point_method === 'rolled' ? ('rolled' as const) : ('maximum' as const),
      };
    }),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveRules(value, w.demo);
      await w.refresh();
      w.notify('Permissões de Arkanis atualizadas.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={campaign.name}
        title="Permissões de Arkanis"
        description="Controle quem cria e edita fichas, itens e ingredientes. Valores e decisões do livro são registrados nas próprias fichas."
      />
      <form onSubmit={save} className="panel form-stack">
        <ErrorBox message={error} />
        {(
          [
            ['players_can_create_characters', 'Jogadores podem criar personagens'],
            ['players_can_edit_sheets', 'Jogadores podem editar suas fichas'],
            ['players_can_create_custom_items', 'Jogadores podem registrar itens personalizados'],
          ] as const
        ).map(([key, label]) => (
          <label className="session-rule" key={key}>
            <input
              type="checkbox"
              disabled={busy}
              checked={value[key]}
              onChange={(e) => setValue((v) => ({ ...v, [key]: e.target.checked }))}
            />
            <span>{label}</span>
          </label>
        ))}
        <Field label="Pontos de vida por nível">
          <Select
            value={value.hit_point_method}
            disabled={busy}
            onChange={(e) =>
              setValue((v) => ({ ...v, hit_point_method: e.target.value as 'maximum' | 'rolled' }))
            }
          >
            <option value="maximum">Dado cheio por nível</option>
            <option value="rolled">Rolar dado por nível</option>
          </Select>
        </Field>
        <p className="subtle">
          Cada nível soma o dado racial e o modificador de Resistência. Orcs somam a Resistência
          total por nível, mais 8 PV raciais uma única vez. Rolagens já registradas são preservadas.
        </p>
        <div className="form-actions">
          <Button type="submit" disabled={busy}>
            Salvar permissões
          </Button>
        </div>
      </form>
    </>
  );
}
