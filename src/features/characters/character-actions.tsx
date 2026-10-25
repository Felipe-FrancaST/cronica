'use client';
import { useEffect, useRef, useState } from 'react';
import { Moon, Sun, Star, Plus, Minus } from 'lucide-react';
import { Badge, Button, ErrorBox, Field, Input, Modal, Select } from '@/components/ui';
import { useWorkspace } from '@/hooks/use-workspace';
import type { Character } from '@/types';
import { CLASSES } from '@/systems/dnd5e/catalog';
import { hitDicePools } from '@/systems/dnd5e/progression';
import { inspirationCount, type RestKind, type RestResult } from '@/systems/dnd5e/character-rest';
import { changeInspiration, executeCharacterRest } from './repository';
import { errorMessage } from '@/lib/utils';

export function InspirationControl({
  character,
  master,
  onUpdated,
  disabled = false,
}: {
  character: Character;
  master: boolean;
  onUpdated?(c: Character): void;
  disabled?: boolean;
}) {
  const w = useWorkspace(),
    [count, setCount] = useState(inspirationCount(character.sheet)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    lock = useRef(false);
  const clients = useRef(new Map<number, string>());
  useEffect(
    () => setCount(inspirationCount(character.sheet)),
    [character.updated_at, character.sheet.inspiration_count],
  );
  async function change(delta: number) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const client = clients.current.get(delta) ?? crypto.randomUUID();
    clients.current.set(delta, client);
    try {
      const result = await changeInspiration(character, delta, client, w.demo, w.user!.id);
      setCount(result.count);
      clients.current.delete(delta);
      onUpdated?.({
        ...character,
        updated_at: result.updated_at,
        sheet: {
          ...character.sheet,
          inspiration_count: result.count,
          details: { ...character.sheet.details, inspiration: result.count > 0 },
        },
      });
      await w.refresh();
      w.notify(
        delta > 0 ? 'Inspiração concedida pelo mestre.' : 'Inspiração utilizada ou removida.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="form-stack">
      <div className="inspiration-control" aria-label={`Inspirações de ${character.name}`}>
        <Star size={18} />
        <strong>Inspirações: {count}</strong>
        {master ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || disabled || count >= 99}
              aria-label={`Dar inspiração a ${character.name}`}
              onClick={() => void change(1)}
            >
              <Plus size={15} />
              Conceder
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || disabled || count === 0}
              aria-label={`Remover inspiração de ${character.name}`}
              onClick={() => void change(-1)}
            >
              <Minus size={15} />
            </Button>
          </>
        ) : (
          character.owner_id === w.user?.id && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy || disabled || count === 0}
              onClick={() => void change(-1)}
            >
              Usar inspiração
            </Button>
          )
        )}
      </div>
      <ErrorBox message={error} />
    </div>
  );
}
export function CharacterRestDialog({
  character,
  onClose,
}: {
  character: Character;
  onClose(): void;
}) {
  const w = useWorkspace(),
    [kind, setKind] = useState<RestKind>('short'),
    [choices, setChoices] = useState<Record<string, number>>({}),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [result, setResult] = useState<RestResult | null>(null);
  const lock = useRef(false),
    client = useRef(crypto.randomUUID()),
    pools = hitDicePools(character.sheet),
    budget = Math.max(1, Math.floor(character.sheet.level / 2));
  async function run() {
    if (lock.current || !confirmed) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const done = await executeCharacterRest(
        character,
        kind,
        choices,
        client.current,
        w.demo,
        w.user!.id,
      );
      setResult(done);
      await w.refresh();
      w.notify(
        `Descanso ${kind === 'long' ? 'longo' : 'curto'} registrado para ${character.name}.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Descansar · ${character.name}`}
      description="Recuperação conforme as classes e as regras da campanha."
    >
      <div className="form-stack">
        {result ? (
          <>
            <div className="rest-result" role="status">
              <strong>Descanso concluído</strong>
              <p>
                PV: {result.hp_before} → {result.hp_after}
              </p>
              <p>
                {result.hit_dice_spent} dados de vida gastos · {result.hit_dice_recovered}{' '}
                recuperados.
              </p>
              {result.healing_rolls.map((r, i) => (
                <p key={i}>
                  {CLASSES[r.class_id]?.name}: d{r.die} ({r.face}) {r.modifier >= 0 ? '+' : ''}
                  {r.modifier} = {r.healing} PV
                </p>
              ))}
            </div>
            <Button onClick={onClose}>Concluir</Button>
          </>
        ) : (
          <>
            <Field label="Tipo de descanso">
              <Select
                value={kind}
                disabled={busy}
                onChange={(e) => {
                  setKind(e.target.value as RestKind);
                  setChoices({});
                  setConfirmed(false);
                  client.current = crypto.randomUUID();
                }}
              >
                <option value="short">Curto · pelo menos 1 hora</option>
                <option value="long">Longo · pelo menos 8 horas</option>
              </Select>
            </Field>
            <p className="subtle">
              {kind === 'short'
                ? 'Recupera recursos de descanso curto. Para recuperar PV, escolha dados de vida; eles serão rolados pelo sistema com seu modificador de Constituição.'
                : 'Recupera PV e recursos de descanso longo, além de até metade dos dados de vida (mínimo 1). Só pode receber os benefícios de um descanso longo a cada 24 horas do jogo.'}
            </p>
            <div className="rest-hit-dice">
              {Object.entries(pools).map(([id, p]) => (
                <Field
                  key={id}
                  label={`${kind === 'short' ? 'Gastar' : 'Recuperar'} dados de ${CLASSES[id]?.name} · d${p.die}`}
                  hint={
                    kind === 'short'
                      ? `${p.total - p.used} disponíveis de ${p.total}.`
                      : `${p.used} gastos. Limite total de recuperação: ${budget}. Deixe todos em zero para recuperar automaticamente na ordem das classes.`
                  }
                >
                  <Input
                    type="number"
                    min={0}
                    max={kind === 'short' ? p.total - p.used : p.used}
                    value={choices[id] ?? 0}
                    disabled={busy}
                    onChange={(e) => {
                      setChoices((v) => ({ ...v, [id]: Number(e.target.value) }));
                      client.current = crypto.randomUUID();
                    }}
                  />
                </Field>
              ))}
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              O tempo necessário passou na história e o descanso foi concluído sem interrupções.
              {kind === 'long'
                ? ' O personagem também comeu e bebeu o necessário para recuperar um nível de exaustão.'
                : ''}
            </label>
            <Badge>Inspirações são preservadas</Badge>
            <ErrorBox message={error} />
            <Button
              disabled={busy || !confirmed}
              disabledReason="Confirme que o descanso foi concluído na história antes de recuperar os recursos."
              onClick={() => void run()}
            >
              {kind === 'long' ? <Moon size={18} /> : <Sun size={18} />}Executar descanso
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
