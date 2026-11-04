'use client';
import { Badge, Button, Field, Input, Select } from '@/components/ui';
import { Check, Dices, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { type DiceRoll } from './dice';
import { DiceField } from './dice-panel';
import { previewEffect, type CombatEffect, type EffectPreview } from './effects';
import type { NarrativeOptions } from './narrative-spell-dialog';
import type {
  BattleActionRequest,
  BattleDecision,
  BattleMap,
  BattleSpellEffect,
  BattleToken,
} from './types';
const NarrativeSpellDialog = dynamic(
  () => import('./narrative-spell-dialog').then((m) => m.NarrativeSpellDialog),
  { ssr: false },
);

export function MasterActionQueue({
  requests,
  effects,
  tokens,
  map,
  busy,
  onResolve,
  onCancel,
  onPreview,
  onPulse,
  onEndEffect,
  decisions = [],
  onGuide,
  onDecision,
  onDecisionMode,
  onNarrative,
}: {
  onNarrative?(
    request: BattleActionRequest,
    options: NarrativeOptions,
    place: boolean,
  ): Promise<void>;
  requests: BattleActionRequest[];
  effects: BattleSpellEffect[];
  tokens: BattleToken[];
  map: BattleMap;
  busy: boolean;
  onResolve(id: string, success: boolean, opts: Record<string, unknown>): Promise<void>;
  onCancel(id: string): Promise<void>;
  onPreview(effect: EffectPreview | null): void;
  onPulse(effect: BattleSpellEffect, opts: Record<string, unknown>): Promise<void>;
  onEndEffect(id: string): Promise<void>;
  decisions?: BattleDecision[];
  onGuide?(id: string, options: Record<string, unknown>): Promise<void>;
  onDecision?(id: string): void;
  onDecisionMode?(id: string, mode: import('./dice').RollMode, modifier?: number): void;
}) {
  const [narrative, setNarrative] = useState<BattleActionRequest | null>(null);
  const pending = requests.filter((r) => r.status === 'pending');
  const approved = requests.filter((r) => r.status === 'approved');
  return (
    <div className="vtt-master-actions">
      {narrative && (
        <NarrativeSpellDialog
          key={narrative.id}
          request={narrative}
          effect={effects.find((e) => e.request_id === narrative.id)}
          busy={busy}
          onClose={() => setNarrative(null)}
          onKeep={async (options, place) => {
            await onNarrative?.(narrative, options, place);
          }}
        />
      )}
      {!!requests.filter(
        (r) =>
          r.kind === 'spell' &&
          r.status === 'success' &&
          r.definition.kind === 'utility' &&
          !effects.some((e) => e.request_id === r.id),
      ).length && (
        <details className="panel">
          <summary>Magias narrativas utilizadas</summary>
          {requests
            .filter(
              (r) =>
                r.kind === 'spell' &&
                r.status === 'success' &&
                r.definition.kind === 'utility' &&
                !effects.some((e) => e.request_id === r.id),
            )
            .slice(0, 12)
            .map((r) => (
              <div className="vtt-pending" key={r.id}>
                <strong>{r.name}</strong>
                <small>{tokens.find((t) => t.id === r.token_id)?.name ?? 'Conjurador'}</small>
                <Button variant="secondary" onClick={() => setNarrative(r)}>
                  Ler descrição / manter efeito
                </Button>
              </div>
            ))}
        </details>
      )}
      <strong>Ações em andamento {pending.length > 0 && <Badge>{pending.length}</Badge>}</strong>
      {!pending.length && (
        <small>As ações são executadas automaticamente. Os testes dos NPCs aparecem aqui.</small>
      )}
      {pending
        .filter((r) => !r.resolution.guided && tokens.some((t) => t.id === r.token_id && t.npc_id))
        .map((r) => (
          <MasterActionCard
            key={r.id}
            request={r}
            tokens={tokens}
            map={map}
            busy={busy}
            onResolve={onResolve}
            onCancel={onCancel}
            onPreview={onPreview}
            onGuide={onGuide}
          />
        ))}
      {pending
        .filter((r) => r.resolution.guided)
        .map((r) => (
          <div className="vtt-pending" key={r.id}>
            <strong>{r.name} · resolução guiada</strong>
            <small>
              Aguardando as rolagens e escolhas dos participantes. Cada etapa aparece na tela de
              quem precisa responder.
            </small>
            {tokens.some((t) => t.id === r.token_id && t.npc_id) && (
              <Button variant="ghost" disabled={busy} onClick={() => onCancel(r.id)}>
                {r.resolution.checks_started
                  ? 'Encerrar tentativa e gastar recursos'
                  : 'Cancelar tentativa sem gasto'}
              </Button>
            )}
          </div>
        ))}
      {decisions.some((d) => tokens.some((t) => t.id === d.token_id && t.npc_id)) && (
        <div className="battle-pending-decisions">
          <strong>Próximas decisões</strong>
          {decisions
            .filter((d) => tokens.some((t) => t.id === d.token_id && t.npc_id))
            .map((d) => (
              <div className="battle-pending-decision" key={d.id}>
                <strong>
                  {tokens.find((t) => t.id === d.token_id)?.name ?? 'Participante'} · {d.label}
                </strong>
                {d.kind !== 'choice' && d.kind !== 'damage' && (
                  <Select
                    aria-label={`Modo da rolagem de ${tokens.find((t) => t.id === d.token_id)?.name ?? d.id}`}
                    value={d.mode}
                    disabled={busy}
                    onChange={(event) =>
                      onDecisionMode?.(d.id, event.target.value as import('./dice').RollMode)
                    }
                  >
                    <option value="normal">Normal</option>
                    <option value="advantage">Vantagem</option>
                    <option value="disadvantage">Desvantagem</option>
                  </Select>
                )}
                {tokens.find((token) => token.id === d.token_id)?.npc_id &&
                  !['choice', 'damage'].includes(d.kind) && (
                    <Field
                      label="Bônus total do NPC"
                      hint="Use o bônus do bloco de estatísticas, incluindo proficiência quando houver."
                    >
                      <Input
                        key={`${d.id}:${d.modifier}`}
                        type="number"
                        min={-50}
                        max={50}
                        defaultValue={d.modifier}
                        disabled={busy}
                        onBlur={(event) => {
                          const modifier = Math.max(
                            -50,
                            Math.min(50, Math.floor(Number(event.target.value))),
                          );
                          if (modifier !== d.modifier) onDecisionMode?.(d.id, d.mode, modifier);
                        }}
                      />
                    </Field>
                  )}
                <Button variant="secondary" disabled={busy} onClick={() => onDecision?.(d.id)}>
                  Realizar teste do NPC
                </Button>
              </div>
            ))}
        </div>
      )}
      {approved.map((r) => (
        <div className="vtt-pending vtt-approved" key={r.id}>
          <strong>{tokens.find((t) => t.id === r.token_id)?.name} · sucesso</strong>
          <span>{r.name}</span>
          <small>Aguardando rolagem · {r.resolution.required_dice}</small>
          <Button variant="secondary" disabled={busy} onClick={() => onCancel(r.id)}>
            Cancelar ação aprovada
          </Button>
        </div>
      ))}
      {effects.length > 0 && (
        <div className="vtt-active-effects">
          <strong>Áreas e efeitos ativos</strong>
          {effects.map((e) => (
            <div key={e.id} className="vtt-pending">
              <strong>{e.name}</strong>
              <small>
                {e.duration}
                {e.concentration ? ' · concentração' : ''}
              </small>
              <small>{e.definition.scene?.manual ?? e.definition.note}</small>
              {e.definition.scene?.triggers?.length && (
                <small>Gatilhos de entrada/turno abrem testes para o participante afetado.</small>
              )}
              {e.expires_round && (
                <small>
                  Duração até a rodada {e.expires_round}, no início do turno do conjurador.
                </small>
              )}
              <div className="vtt-action-buttons">
                {requests.find((r) => r.id === e.request_id) && (
                  <Button
                    variant="secondary"
                    onClick={() => setNarrative(requests.find((r) => r.id === e.request_id)!)}
                  >
                    Ler descrição{e.definition.kind === 'utility' ? ' / manter efeito' : ''}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    const actor = tokens.find((t) => t.id === e.token_id);
                    if (actor) onPreview(previewEffect(map, actor, e.target, e.definition, tokens));
                  }}
                >
                  Ver área
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => onEndEffect(e.id)}>
                  Encerrar
                </Button>
              </div>
              {e.definition.kind !== 'utility' && !e.definition.scene?.triggers?.length && (
                <PulseEditor effect={e} busy={busy} onPulse={onPulse} tokens={tokens} map={map} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function MasterActionCard({
  request: r,
  tokens,
  map,
  busy,
  onResolve,
  onCancel,
  onPreview,
  onGuide,
}: {
  request: BattleActionRequest;
  tokens: BattleToken[];
  map: BattleMap;
  busy: boolean;
  onResolve(id: string, success: boolean, opts: Record<string, unknown>): Promise<void>;
  onCancel(id: string): Promise<void>;
  onPreview(p: EffectPreview | null): void;
  onGuide?(id: string, options: Record<string, unknown>): Promise<void>;
}) {
  const [dice, setDice] = useState(r.definition.dice ?? '');
  const [selectedRoll, setSelectedRoll] = useState<DiceRoll | null>(null);
  const [kind, setKind] = useState(r.definition.kind ?? 'utility');
  const [targets, setTargets] = useState<
    Record<string, { saved: boolean; multiplier: number; amount?: number }>
  >({});
  const [applyNow, setApplyNow] = useState(false);
  const [critical, setCritical] = useState(false);
  const [dtype, setDtype] = useState(r.definition.damageType ?? '');
  const [guideDc, setGuideDc] = useState('');
  const [guideAttackBonus, setGuideAttackBonus] = useState('');
  const [guideMode, setGuideMode] = useState<import('./dice').RollMode | 'auto'>('auto');
  const [geometry, setGeometry] = useState({
    shape: r.definition.shape,
    size: r.definition.size ?? 0,
    width: r.definition.width ?? 1.5,
    origin: r.definition.origin ?? 'point',
  });
  const [chooseTargets, setChooseTargets] = useState(false);
  const [chosen, setChosen] = useState(r.target_ids);
  const actor = tokens.find((t) => t.id === r.token_id);
  const area = useMemo(
    () =>
      actor
        ? previewEffect(map, actor, r.target, { ...r.definition, ...geometry, kind }, tokens)
        : null,
    [map, actor, r.target, r.definition, geometry, kind, tokens],
  );
  const affected = tokens.filter((t) =>
    chooseTargets
      ? chosen.includes(t.id)
      : r.kind === 'opportunity' || r.definition.selective || geometry.shape === 'single'
        ? r.target_ids.includes(t.id)
        : area?.affected.includes(t.id),
  );
  const opts = {
    dice,
    ...(selectedRoll ? { roll_id: selectedRoll.id } : {}),
    kind,
    targets,
    apply_now: applyNow,
    critical,
    damageType: dtype,
    geometry,
    ...(chooseTargets ? { target_ids: chosen } : {}),
  };
  const guideNeedsManual =
    dice !== (r.definition.dice ?? '') ||
    kind !== r.definition.kind ||
    critical ||
    !!selectedRoll ||
    geometry.shape !== r.definition.shape ||
    geometry.origin !== r.definition.origin ||
    geometry.size !== (r.definition.size ?? 0) ||
    geometry.width !== (r.definition.width ?? 1.5) ||
    Object.values(targets).some(
      (target) => target.saved || target.amount !== undefined || target.multiplier !== 1,
    );
  return (
    <div className="vtt-pending" role="region" aria-label={`Tentativa ${r.name}`}>
      <strong>
        {actor?.name ?? 'Personagem'} quer{' '}
        {r.kind === 'spell'
          ? 'conjurar'
          : r.kind === 'weapon'
            ? 'atacar com'
            : r.kind === 'item'
              ? 'usar'
              : r.kind === 'feature'
                ? 'ativar'
                : ''}{' '}
        {r.name}
      </strong>
      <small>
        Rodada {r.round} ·{' '}
        {r.cost === 'bonus'
          ? 'ação bônus'
          : r.cost === 'reaction'
            ? 'reação'
            : r.cost === 'free'
              ? 'sem ação'
              : 'ação'}
        {r.resource_level > 0 ? ` · círculo ${r.resource_level}` : ''}
      </small>
      <small>Alvos: {affected.map((t) => t.name).join(', ') || 'área / efeito sem alvo'}</small>
      {['weapon', 'spell', 'item', 'feature', 'opportunity'].includes(r.kind) ? (
        <>
          <Button variant="secondary" onClick={() => onPreview(area)}>
            Mostrar área no grid
          </Button>
          {r.definition.review && <p className="vtt-review-note">{r.definition.note}</p>}
          {r.definition.attackBonus !== undefined && (
            <p className="subtle">
              Ataque {r.definition.attackBonus >= 0 ? '+' : ''}
              {r.definition.attackBonus} · crítico em {r.definition.criticalAt}–20.
            </p>
          )}
          {r.definition.kind === 'damage' &&
            r.definition.shape === 'single' &&
            !r.definition.save && (
              <label className="vtt-check">
                <input
                  type="checkbox"
                  checked={critical}
                  onChange={(e) => setCritical(e.target.checked)}
                />{' '}
                Acerto crítico · dobra os dados, preserva os modificadores
              </label>
            )}
          {r.definition.description && (
            <details>
              <summary>Descrição e regras</summary>
              <p className="vtt-spell-description">{r.definition.description}</p>
            </details>
          )}
          {r.kind === 'opportunity' ? (
            <>
              <DiceField
                mapId={map.id}
                requestId={r.id}
                value={dice}
                onChange={setDice}
                onSelected={setSelectedRoll}
                purpose={kind === 'healing' ? 'Cura · ' + r.name : 'Dano · ' + r.name}
              />
            </>
          ) : (
            <div className="vtt-approval-note">
              <b>{r.definition.dice || 'Sem rolagem de dados'}</b>
              <small>
                Sucesso libera a rolagem do jogador quando este efeito usa dados. Resistências e
                multiplicadores serão aplicados ao resultado.
              </small>
              {(r.definition.review || !r.definition.dice) && (
                <Field label="Dados do efeito (revisão do mestre)">
                  <Input
                    value={dice}
                    placeholder="Ex.: 2d8+3"
                    onChange={(event) => setDice(event.target.value)}
                  />
                </Field>
              )}
            </div>
          )}
          <details open={r.definition.review}>
            <summary>Ajustar efeito e resistências</summary>
            <div className="form-stack">
              <Field label="Efeito">
                <Select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as CombatEffect['kind'])}
                >
                  <option value="damage">Dano</option>
                  <option value="healing">Cura</option>
                  <option value="temporary">PV temporários</option>
                  <option value="utility">Outro efeito / condição manual</option>
                </Select>
              </Field>

              {r.kind === 'spell' && (
                <>
                  <Field label="Formato da área">
                    <Select
                      value={geometry.shape}
                      onChange={(e) =>
                        setGeometry({ ...geometry, shape: e.target.value as CombatEffect['shape'] })
                      }
                    >
                      <option value="single">Alvo único</option>
                      <option value="self">O conjurador</option>
                      <option value="sphere">Esfera / cilindro (raio)</option>
                      <option value="cone">Cone</option>
                      <option value="line">Linha</option>
                      <option value="cube">Cubo</option>
                      <option value="wall">Parede</option>
                    </Select>
                  </Field>
                  <Field label="Dimensão da área (m)">
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      step={0.5}
                      value={geometry.size}
                      onChange={(e) => setGeometry({ ...geometry, size: Number(e.target.value) })}
                    />
                  </Field>
                  {(geometry.shape === 'line' || geometry.shape === 'wall') && (
                    <Field label="Largura da linha (m)">
                      <Input
                        type="number"
                        min={0.1}
                        max={10000}
                        step={0.5}
                        value={geometry.width}
                        onChange={(e) =>
                          setGeometry({ ...geometry, width: Number(e.target.value) })
                        }
                      />
                    </Field>
                  )}
                  <Field label="Origem">
                    <Select
                      value={geometry.origin}
                      onChange={(e) =>
                        setGeometry({
                          ...geometry,
                          origin: e.target.value as CombatEffect['origin'],
                        })
                      }
                    >
                      <option value="point">Ponto escolhido</option>
                      <option value="self">Conjurador</option>
                    </Select>
                  </Field>
                </>
              )}
              <label className="vtt-check">
                <input
                  type="checkbox"
                  checked={chooseTargets}
                  onChange={(e) => setChooseTargets(e.target.checked)}
                />
                Escolher os alvos
              </label>
              {chooseTargets && (
                <>
                  <small>
                    Use para dividir raios ou aplicar exceções da descrição. Confirme alcance e
                    quantidade de alvos.
                  </small>
                  {tokens.map((t) => (
                    <label key={t.id} className="vtt-check">
                      <input
                        type="checkbox"
                        checked={chosen.includes(t.id)}
                        onChange={(e) =>
                          setChosen(
                            e.target.checked
                              ? [...chosen, t.id]
                              : chosen.filter((id) => id !== t.id),
                          )
                        }
                      />
                      {t.name}
                    </label>
                  ))}
                </>
              )}
              {kind === 'damage' && (
                <Field label="Tipo de dano">
                  <Input value={dtype} onChange={(e) => setDtype(e.target.value)} />
                </Field>
              )}
              {r.definition.timing === 'trigger' && (
                <label className="vtt-check">
                  <input
                    type="checkbox"
                    checked={applyNow}
                    onChange={(e) => setApplyNow(e.target.checked)}
                  />
                  Aplicar PV também nesta conjuração
                </label>
              )}
            </div>
          </details>
          {kind !== 'utility' && affected.length > 0 && (
            <div className="vtt-save-list">
              {affected.map((t) => {
                const value = targets[t.id];
                return (
                  <div key={t.id}>
                    <strong>{t.name}</strong>
                    {r.definition.save && (
                      <label className="vtt-check">
                        <input
                          type="checkbox"
                          checked={value?.saved ?? false}
                          onChange={(e) =>
                            setTargets({
                              ...targets,
                              [t.id]: {
                                ...value,
                                saved: e.target.checked,
                                multiplier: value?.multiplier ?? 1,
                              },
                            })
                          }
                        />
                        Passou na resistência ({r.definition.save.toUpperCase()})
                      </label>
                    )}
                    <Select
                      aria-label={`Resistência de ${t.name}`}
                      value={value?.multiplier ?? 1}
                      onChange={(e) =>
                        setTargets({
                          ...targets,
                          [t.id]: {
                            ...value,
                            saved: value?.saved ?? false,
                            multiplier: Number(e.target.value),
                          },
                        })
                      }
                    >
                      <option value={1}>Normal</option>
                      <option value={0.5}>Metade</option>
                      <option value={2}>Dobro</option>
                      <option value={0}>Imune / sem efeito</option>
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      max={100000}
                      aria-label={`Valor final para ${t.name}`}
                      placeholder="Valor final opcional"
                      value={value?.amount ?? ''}
                      onChange={(e) =>
                        setTargets({
                          ...targets,
                          [t.id]: {
                            saved: value?.saved ?? false,
                            multiplier: value?.multiplier ?? 1,
                            amount: e.target.value === '' ? undefined : Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
      <div className="vtt-action-buttons">
        {onGuide && r.kind !== 'opportunity' && (
          <div className="form-stack">
            {(r.kind === 'weapon' || r.definition.attackRoll) && (
              <Field label="Rolagem de ataque">
                <Select
                  value={guideMode}
                  onChange={(event) =>
                    setGuideMode(event.target.value as import('./dice').RollMode | 'auto')
                  }
                >
                  <option value="auto">Automático · condições</option>
                  <option value="normal">Normal</option>
                  <option value="advantage">Vantagem</option>
                  <option value="disadvantage">Desvantagem</option>
                </Select>
              </Field>
            )}
            {actor?.npc_id && (r.kind === 'weapon' || r.definition.attackRoll) && (
              <Field label="Bônus de ataque do NPC">
                <Input
                  type="number"
                  min={-50}
                  max={50}
                  value={guideAttackBonus}
                  onChange={(event) => setGuideAttackBonus(event.target.value)}
                />
              </Field>
            )}
            {r.definition.save &&
              (!actor?.character_id || r.kind !== 'spell') &&
              !r.definition.save_dc && (
                <Field label="CD da salvaguarda">
                  <Input
                    type="number"
                    min={1}
                    max={40}
                    value={guideDc}
                    onChange={(event) => setGuideDc(event.target.value)}
                  />
                </Field>
              )}
            <Button
              disabled={busy || guideNeedsManual}
              disabledReason={
                guideNeedsManual
                  ? 'Você personalizou a fórmula, área ou resultado. Use Decisão manual do mestre para aplicar essa exceção.'
                  : undefined
              }
              onClick={() =>
                onGuide(r.id, {
                  ...(guideMode !== 'auto' ? { attack_mode: guideMode } : {}),
                  ...(guideDc ? { dc: Number(guideDc) } : {}),
                  ...(guideAttackBonus ? { attack_bonus: Number(guideAttackBonus) } : {}),
                  ...(dtype ? { damageType: dtype } : {}),
                  ...(chooseTargets ? { target_ids: chosen } : {}),
                  apply_now: applyNow,
                })
              }
            >
              <Dices size={17} /> Resolver pelas regras
            </Button>
            <small>
              O sistema pede ataques, salvaguardas e dano aos participantes. Confirme cobertura,
              visibilidade e exceções da descrição antes de autorizar.
            </small>
          </div>
        )}
      </div>
      <details>
        <summary>Decisão manual do mestre</summary>
        <div className="vtt-action-buttons">
          <Button disabled={busy} onClick={() => onResolve(r.id, true, opts)}>
            <Check size={16} />
            Sucesso
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => onResolve(r.id, false, {})}>
            <X size={16} />
            Falha
          </Button>
        </div>
      </details>
      <Button variant="secondary" disabled={busy} onClick={() => onCancel(r.id)}>
        Cancelar sem gasto
      </Button>
    </div>
  );
}
function PulseEditor({
  effect,
  busy,
  onPulse,
  tokens,
  map,
}: {
  effect: BattleSpellEffect;
  busy: boolean;
  onPulse(e: BattleSpellEffect, opts: Record<string, unknown>): Promise<void>;
  tokens: BattleToken[];
  map: BattleMap;
}) {
  const [savedIds, setSavedIds] = useState<string[]>([]),
    [damageType, setDamageType] = useState(effect.definition.damageType),
    [halfOnSave, setHalfOnSave] = useState(effect.definition.halfOnSave);
  const [ids, setIds] = useState<string[]>([]),
    [dice, setDice] = useState(effect.definition.dice);
  const [selectedRoll, setSelectedRoll] = useState<DiceRoll | null>(null);
  const actor = tokens.find((t) => t.id === effect.token_id);
  const area = actor
    ? previewEffect(
        map,
        actor,
        effect.target,
        effect.definition.shape === 'wall'
          ? { ...effect.definition, width: effect.definition.width + 6 }
          : effect.definition,
        tokens,
      )
    : null;
  return (
    <details>
      <summary>Aplicar efeito quando ocorrer o gatilho</summary>
      <div className="form-stack">
        <DiceField
          key={`${effect.id}:${effect.pulses}`}
          mapId={map.id}
          effectId={effect.id}
          value={dice}
          onChange={setDice}
          onSelected={setSelectedRoll}
          label="Dados do efeito"
          purpose={
            effect.definition.kind === 'healing' ? 'Cura · ' + effect.name : 'Dano · ' + effect.name
          }
        />
        {effect.definition.kind === 'damage' && (
          <>
            <Field label="Tipo de dano do gatilho">
              <Select value={damageType} onChange={(e) => setDamageType(e.target.value)}>
                {[
                  'ácido',
                  'concussão',
                  'cortante',
                  'elétrico',
                  'energia',
                  'fogo',
                  'frio',
                  'necrótico',
                  'perfurante',
                  'psíquico',
                  'radiante',
                  'trovejante',
                  'veneno',
                ].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="vtt-check">
              <input
                type="checkbox"
                checked={halfOnSave}
                onChange={(e) => setHalfOnSave(e.target.checked)}
              />
              Sucesso na salvaguarda reduz à metade (desmarcado: evita todo o dano)
            </label>
          </>
        )}
        {tokens
          .filter((t) => area?.affected.includes(t.id))
          .map((t) => (
            <label key={t.id} className="vtt-check">
              <input
                type="checkbox"
                checked={ids.includes(t.id)}
                onChange={(e) =>
                  setIds(e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id))
                }
              />
              {t.name}
            </label>
          ))}
        {ids.length > 0 && effect.definition.kind === 'damage' && (
          <fieldset className="form-stack">
            <legend>Resultados das salvaguardas do gatilho</legend>
            {tokens
              .filter((t) => ids.includes(t.id))
              .map((t) => (
                <label className="vtt-check" key={t.id}>
                  <input
                    type="checkbox"
                    checked={savedIds.includes(t.id)}
                    onChange={(e) =>
                      setSavedIds((v) =>
                        e.target.checked ? [...v, t.id] : v.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {t.name}: sucesso na salvaguarda
                </label>
              ))}
          </fieldset>
        )}
        <small>
          Selecione somente quem ativou o gatilho e confirme as salvaguardas. Resistências e
          imunidades cadastradas são aplicadas pelo sistema.
        </small>
        {effect.definition.pulseCost && (
          <small>
            Usa a {effect.definition.pulseCost === 'bonus' ? 'ação bônus' : 'ação'} do conjurador,
            no turno dele. Não gasta outro espaço.
          </small>
        )}
        {effect.definition.pulseOnce && <small>Este efeito se encerra após a aplicação.</small>}
        <Button
          disabled={busy || !ids.length}
          disabledReason={
            busy
              ? 'Aguarde a aplicação atual terminar.'
              : 'Selecione pelo menos um alvo atingido pelo efeito antes de aplicar.'
          }
          onClick={() =>
            onPulse(effect, {
              dice,
              target_ids: ids,
              ...(effect.definition.kind === 'damage'
                ? {
                    damageType,
                    halfOnSave,
                    targets: Object.fromEntries(
                      ids.map((id) => [id, { saved: savedIds.includes(id) }]),
                    ),
                  }
                : {}),
              ...(selectedRoll ? { roll_id: selectedRoll.id } : {}),
            })
          }
        >
          Aplicar efeito
        </Button>
      </div>
    </details>
  );
}

export function ActionHistory({ requests }: { requests: BattleActionRequest[] }) {
  const resolved = requests
    .filter((r) => r.status !== 'pending' && r.status !== 'approved')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);
  return resolved.length ? (
    <details className="vtt-action-history">
      <summary>Últimas ações</summary>
      {resolved.map((r) => (
        <div key={r.id}>
          <strong>{r.name}</strong>
          <small>
            {r.status === 'success'
              ? 'Sucesso'
              : r.status === 'failure'
                ? 'Falha'
                : r.status === 'expired'
                  ? 'Turno encerrado'
                  : 'Cancelada'}
            {r.resolution.resources_consumed ? ' · recurso utilizado' : ''}
          </small>
          {r.resolution.affected?.map((e) => (
            <small key={e.token_id}>
              {e.name}: {e.amount}{' '}
              {e.kind === 'healing'
                ? 'de cura'
                : e.kind === 'temporary'
                  ? 'PV temporários'
                  : 'de dano'}
            </small>
          ))}
        </div>
      ))}
    </details>
  ) : null;
}
