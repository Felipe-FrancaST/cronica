'use client';
import { useEffect, useRef, useState } from 'react';
import { BellRing, Check, Dices, ShieldCheck, Swords } from 'lucide-react';
import { Badge, Button, ErrorBox, Modal } from '@/components/ui';
import { errorMessage, signed } from '@/lib/utils';
import { ABILITIES } from '@/systems/dnd5e/catalog';
import { rollBreakdown } from './dice';
import type { BattleDecision, BattleToken, BattleActionRequest } from './types';

const TITLES = {
  attack: 'Faça seu ataque',
  save: 'Você precisa fazer uma salvaguarda',
  damage: 'Role e aplique o efeito',
  concentration: 'Mantenha sua concentração',
  choice: 'Uma escolha para você',
};
export function DecisionCenter({
  decisions,
  tokens,
  autoTokenIds,
  requestedId,
  busy,
  onAnswer,
  requests,
}: {
  decisions: BattleDecision[];
  tokens: BattleToken[];
  autoTokenIds: string[];
  requestedId: string | null;
  busy: boolean;
  onAnswer(id: string, clientId: string, answer?: { choice?: string }): Promise<BattleDecision>;
  requests: BattleActionRequest[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<BattleDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const lock = useRef(false);
  const seen = useRef(new Set<string>());
  const clients = useRef(new Map<string, string>());
  const pending = decisions.filter((d) => d.status === 'pending');
  const nextAuto = pending.find(
    (d) => autoTokenIds.includes(d.token_id) && !seen.current.has(d.id),
  );
  useEffect(() => {
    if (!selectedId && !completed && nextAuto) {
      seen.current.add(nextAuto.id);
      setSelectedId(nextAuto.id);
      setError(null);
    }
  }, [selectedId, completed, nextAuto?.id]);
  useEffect(() => {
    if (requestedId) {
      setSelectedId(requestedId);
      setCompleted(null);
      setError(null);
    }
  }, [requestedId]);
  const decision = completed ?? pending.find((d) => d.id === selectedId);
  const actor = tokens.find((t) => t.id === decision?.token_id);
  const target = tokens.find((t) => t.id === decision?.options.target_id);
  const isComplete = decision?.status === 'answered';
  const actionResult = requests.find((request) => request.id === decision?.request_id);
  function close() {
    if (lock.current) return;
    pending.forEach((d) => seen.current.add(d.id));
    setSelectedId(null);
    setCompleted(null);
    setError(null);
  }
  function next() {
    setCompleted(null);
    setSelectedId(null);
    setError(null);
    const following = pending.find(
      (d) => autoTokenIds.includes(d.token_id) && d.id !== decision?.id,
    );
    if (following) {
      seen.current.add(following.id);
      setSelectedId(following.id);
    }
  }
  async function answer(choice?: string) {
    if (!decision || busy || lock.current || decision.status !== 'pending') return;
    lock.current = true;
    setRolling(true);
    setError(null);
    const client = clients.current.get(decision.id) ?? crypto.randomUUID();
    clients.current.set(decision.id, client);
    try {
      setCompleted(await onAnswer(decision.id, client, choice ? { choice } : {}));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setRolling(false);
    }
  }
  return (
    <>
      {pending.length > 0 && (
        <div className="battle-decision-notice" role="status">
          <BellRing size={19} />
          <div>
            <strong>
              {pending.length === 1
                ? 'Há uma decisão de combate pendente'
                : `${pending.length} decisões de combate pendentes`}
            </strong>
            <small>Rolagens, salvaguardas e escolhas aparecem aqui, mesmo fora do seu turno.</small>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setCompleted(null);
              setSelectedId(pending[0].id);
              setError(null);
            }}
          >
            Abrir pendência
          </Button>
        </div>
      )}
      <Modal
        open={!!decision}
        onClose={close}
        title={decision ? (isComplete ? 'Resultado da rolagem' : TITLES[decision.kind]) : 'Combate'}
        description={`${actor?.name ?? 'Seu participante'} · ${decision?.label ?? ''}`}
        portalContainer={
          typeof document !== 'undefined'
            ? (document.fullscreenElement as HTMLElement | null)
            : undefined
        }
      >
        {decision && (
          <div className="form-stack battle-decision-dialog">
            {isComplete ? (
              <>
                <div
                  className={`battle-decision-result ${decision.result.hit === false || decision.result.passed === false ? 'is-failure' : ''}`}
                  role="status"
                >
                  <strong>
                    {decision.result.critical
                      ? 'Acerto crítico!'
                      : decision.result.hit === true
                        ? 'Ataque acertou!'
                        : decision.result.hit === false
                          ? 'O ataque não acertou'
                          : decision.result.passed === true
                            ? decision.kind === 'concentration'
                              ? 'Concentração mantida'
                              : 'Salvaguarda bem-sucedida'
                            : decision.result.passed === false
                              ? decision.kind === 'concentration'
                                ? 'A concentração terminou'
                                : 'Falha na salvaguarda'
                              : decision.result.choice === 'cancel'
                                ? 'Conjuração cancelada'
                                : decision.result.choice
                                  ? 'Escolha registrada'
                                  : 'Efeito aplicado'}
                  </strong>
                  {decision.result.roll && (
                    <>
                      <b>{decision.result.roll.total}</b>
                      <small>
                        {decision.result.roll.expression} · {rollBreakdown(decision.result.roll)}
                      </small>
                    </>
                  )}
                  {decision.kind !== 'damage' && decision.result.message && (
                    <p>{decision.result.message}</p>
                  )}
                </div>
                {(decision.result.rolls?.length ?? 0) > 1 && (
                  <div className="battle-roll-list">
                    {decision.result.rolls!.map((roll, i) => (
                      <p key={roll.id}>
                        Dano do acerto {i + 1}: <b>{roll.total}</b> · {rollBreakdown(roll)}
                      </p>
                    ))}
                  </div>
                )}
                {decision.kind === 'damage' &&
                  (actionResult?.resolution.affected ?? []).map((target) => (
                    <div className="vtt-outcome-target" key={target.token_id + target.kind}>
                      <span>
                        {target.name}
                        {target.saved ? ' · salvaguarda bem-sucedida' : ''}
                      </span>
                      <strong>
                        {target.kind === 'damage' ? '−' : '+'}
                        {target.amount} PV{target.kind === 'temporary' ? ' temporários' : ''}
                      </strong>
                    </div>
                  ))}
                {actionResult?.status === 'failure' && actionResult.resolution.message && (
                  <p>{actionResult.resolution.message}</p>
                )}
                <p className="subtle">
                  {decision.kind === 'damage'
                    ? 'Os recursos e os pontos de vida foram atualizados. Continue para voltar ao combate.'
                    : 'Resultado registrado. Continue para acompanhar a próxima etapa.'}
                </p>
                <Button onClick={next}>
                  <Check size={17} /> Continuar
                </Button>
              </>
            ) : (
              <>
                {target && (
                  <p>
                    Alvo: <strong>{target.name}</strong>
                  </p>
                )}
                {decision.kind === 'choice' ? (
                  <>
                    <p>
                      Você já mantém outra magia. Continuar encerrará a concentração anterior quando
                      esta conjuração for concluída.
                    </p>
                    {decision.options.choices?.map((choice) => (
                      <Button
                        key={choice.id}
                        variant={choice.id === 'cancel' ? 'secondary' : 'gold'}
                        disabled={busy || rolling}
                        onClick={() => void answer(choice.id)}
                      >
                        {choice.label}
                      </Button>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="battle-decision-formula">
                      {decision.kind === 'attack' ? (
                        <Swords size={26} />
                      ) : decision.kind === 'save' || decision.kind === 'concentration' ? (
                        <ShieldCheck size={26} />
                      ) : (
                        <Dices size={26} />
                      )}
                      <strong>
                        {decision.kind === 'damage'
                          ? decision.options.dice || 'Efeito da ação'
                          : `1d20${signed(decision.modifier)}`}
                      </strong>
                    </div>
                    {decision.ability && (
                      <p>
                        {ABILITIES.find((a) => a.id === decision.ability)?.label} · CD{' '}
                        <b>{decision.dc}</b>
                      </p>
                    )}
                    {decision.mode !== 'normal' && (
                      <Badge tone="blue">
                        {decision.mode === 'advantage'
                          ? 'Vantagem · melhor de 2d20'
                          : 'Desvantagem · pior de 2d20'}
                      </Badge>
                    )}
                    {decision.kind === 'save' && (
                      <p>
                        {decision.options.half_on_save
                          ? 'Ao passar, você recebe metade do dano, antes das suas resistências.'
                          : 'O resultado define se o efeito atinge você; o mestre acompanha as condições da descrição.'}
                      </p>
                    )}
                    {decision.kind === 'concentration' && (
                      <p>
                        Se falhar, a magia de concentração termina. Esta rolagem não gasta sua ação
                        ou reação.
                      </p>
                    )}
                    {decision.options.separate_attacks && (
                      <p>
                        Cada acerto terá seu próprio dano. Os críticos e as resistências são
                        calculados por ataque.
                      </p>
                    )}
                    <Button disabled={busy || rolling} onClick={() => void answer()}>
                      <Dices size={18} />
                      {rolling
                        ? 'Registrando rolagem…'
                        : decision.kind === 'damage'
                          ? 'Rolar e aplicar efeito'
                          : 'Rolar dados'}
                    </Button>
                  </>
                )}
                <Button variant="ghost" disabled={busy || rolling} onClick={close}>
                  Ver depois
                </Button>
              </>
            )}
            <ErrorBox message={error} />
          </div>
        )}
      </Modal>
    </>
  );
}
