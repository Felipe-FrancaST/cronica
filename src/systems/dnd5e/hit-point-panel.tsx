'use client';
import { useState, useRef } from 'react';
import { Dices } from 'lucide-react';
import { Button, Badge, ErrorBox } from '@/components/ui';
import { useWorkspace } from '@/hooks/use-workspace';
import { rollCharacterHitPoints } from '@/features/sessions/repository';
import type { Character, DndSheet } from '@/types';
import { errorMessage } from '@/lib/utils';
import { CLASSES } from './catalog';
import { HIT_POINT_METHODS, hitPointEntries } from './hit-points';

export function HitPointPanel({
  character,
  sheet,
  readOnly,
  onChange,
}: {
  character: Character;
  sheet: DndSheet;
  readOnly: boolean;
  onChange(sheet: DndSheet): void;
}) {
  const workspace = useWorkspace();
  const latest = useRef(sheet);
  latest.current = sheet;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const entries = hitPointEntries(sheet),
    pending = entries.filter((entry) => entry.pending);
  async function roll() {
    if (busy || readOnly || !pending.length) return;
    setBusy(true);
    setError(null);
    try {
      const rolls = await rollCharacterHitPoints(character, sheet, workspace.demo);
      onChange({ ...latest.current, hit_point_rolls: rolls });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel hp-progression" aria-label="Progressão dos pontos de vida">
      <div className="panel-heading">
        <h3>Pontos de vida por nível</h3>
        <Badge>{HIT_POINT_METHODS[sheet.hit_point_method ?? 'average']}</Badge>
      </div>
      <p className="subtle">
        Regra definida pelo mestre. Cada dado recebe seu modificador atual de Constituição, com
        ganho mínimo de 1 PV; bônus de raça e classe entram no total da ficha.
      </p>
      <ErrorBox message={error} />
      {pending.length > 0 && (
        <p className="info-box">
          Faltam {pending.length} rolagens. O total exibido ainda é uma prévia. Role os dados antes
          de salvar.
        </p>
      )}
      <ol className="hp-levels">
        {entries.map((entry) => (
          <li key={`${entry.classId}:${entry.level}`}>
            <span>
              {CLASSES[entry.classId]?.name} {entry.level}
            </span>
            <strong>{entry.pending ? `d${entry.die} pendente` : entry.value}</strong>
            <small>
              {entry.first
                ? 'Primeiro nível · dado cheio'
                : sheet.hit_point_method === 'rolled'
                  ? 'Resultado registrado'
                  : sheet.hit_point_method === 'maximum'
                    ? `Máximo do d${entry.die}`
                    : `Média do d${entry.die}`}
            </small>
          </li>
        ))}
      </ol>
      {sheet.hit_point_method === 'rolled' && (
        <>
          <Button
            type="button"
            onClick={() => void roll()}
            disabled={busy || readOnly || !pending.length}
            disabledReason={
              busy
                ? 'Aguarde o registro dos resultados.'
                : readOnly
                  ? 'Você não pode editar esta ficha. Peça ao mestre para rolar os PV.'
                  : 'Todos os níveis já têm um resultado registrado. Novos dados ficam disponíveis ao subir de nível.'
            }
          >
            <Dices size={18} className={busy ? 'spin' : ''} />
            {busy ? 'Registrando rolagens…' : 'Rolar dados de vida pendentes'}
          </Button>
          <small className="subtle">
            Cada classe e nível guarda um único resultado no banco. Repetir a solicitação recupera
            esse resultado.
          </small>
        </>
      )}
    </section>
  );
}
