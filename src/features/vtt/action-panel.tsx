'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Footprints, Sparkles, Swords, Shield, Check, X, Dices } from 'lucide-react';
import { useDice } from './dice-provider';
import dynamic from 'next/dynamic';
const ActionDiceAnimation = dynamic(() => import('./dice-animation').then((m) => m.DiceAnimation), {
  ssr: false,
});
import { DiceField } from './dice-panel';
import { rollBreakdown, type DiceRoll } from './dice';
import { Badge, Button, Field, Input, Select, Modal } from '@/components/ui';
import type { Character, Npc } from '@/types';
import type { DndSheet, InventoryItem, Spell } from '@/systems/dnd5e/types';
import { availableCastResources } from '@/systems/dnd5e/spellcasting';
import { calculate } from '@/systems/dnd5e';
import {
  EMPTY_EFFECT,
  scaledSpellEffect,
  FACTION_LABELS,
  factionColor,
  previewEffect,
  spellEffect,
  weaponEffect,
  type CombatEffect,
  type EffectPreview,
} from './effects';
import type {
  BattleActionPayload,
  BattleActionRequest,
  BattleMovementPlan,
  BattleMap,
  BattleSession,
  BattleSpellEffect,
  BattleToken,
  GridPoint,
} from './types';

export interface ActionDraft {
  actorId: string;
  kind: 'weapon' | 'spell';
  sourceId: string;
  effect: CombatEffect;
  target: GridPoint;
  targetIds: string[];
  targetChosen: boolean;
  resourceKind: BattleActionRequest['resource_kind'];
  resourceLevel: number;
}
const resourceLabel = (kind: string, level: number, remaining: number) =>
  kind === 'cantrip'
    ? 'Truque · sem espaço'
    : kind === 'arcanum'
      ? `Arcanum ${level} · ${remaining} uso`
      : `${kind === 'pact' ? 'Pacto' : 'Espaço'} ${level} · ${remaining} restante(s)`;

export function actionEffectPreview(
  map: BattleMap,
  actor: BattleToken | null,
  draft: ActionDraft | null,
  tokens: BattleToken[],
): EffectPreview | null {
  if (!actor || !draft || draft.actorId !== actor.id) return null;
  return previewEffect(map, actor, draft.target, draft.effect, tokens);
}
export function changeActionTarget(
  draft: ActionDraft,
  point: GridPoint,
  tokenId: string | null,
): ActionDraft {
  if (draft.effect.selective && draft.effect.shape !== 'single' && tokenId) {
    const ids = draft.targetIds.includes(tokenId)
      ? draft.targetIds.filter((id) => id !== tokenId)
      : [...draft.targetIds, tokenId];
    return { ...draft, targetIds: ids.slice(0, draft.effect.maxTargets) };
  }
  return { ...draft, target: point, targetIds: tokenId ? [tokenId] : [], targetChosen: true };
}

export function PlayerActionPanel({
  token,
  character,
  npc,
  map,
  session,
  tokens,
  requests,
  movementPlan,
  draft,
  preview,
  ready,
  busy,
  onDraft,
  onRequest,
  onCancel,
  onRoll,
  onCancelMove,
  onSheet,
  onMove,
  npcEditable = false,
  onEndTurn,
}: {
  npcEditable?: boolean;
  onEndTurn?(): Promise<void>;
  token: BattleToken;
  character: Character | null;
  npc: Npc | null;
  map: BattleMap;
  session: BattleSession | null;
  tokens: BattleToken[];
  requests: BattleActionRequest[];
  movementPlan: BattleMovementPlan | null;
  draft: ActionDraft | null;
  preview: EffectPreview | null;
  ready: boolean;
  busy: boolean;
  onDraft(draft: ActionDraft | null): void;
  onRequest(payload: BattleActionPayload, clientId: string): Promise<void>;
  onCancel(id: string): Promise<void>;
  onRoll(id: string, clientId: string): Promise<void>;
  onCancelMove(id: string): Promise<void>;
  onSheet(): void;
  onMove(): void;
}) {
  const diceContext = useDice();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'weapon' | 'spell' | null>(null);
  const [search, setSearch] = useState('');
  const [resultId, setResultId] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);
  const rollClients = useRef(new Map<string, string>());
  const previousStatus = useRef(new Map<string, string>());
  const [preferBonus, setPreferBonus] = useState(true);
  const clientId = useRef<string | null>(null);
  const sheet = character?.sheet;
  const weapons: InventoryItem[] = sheet
    ? sheet.inventory.filter((i) => i.category === 'weapon' && i.quantity > 0)
    : (npc?.attacks ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        category: 'weapon',
        quantity: 1,
        weight: 0,
        equipped: true,
        damage: a.damage,
        notes: a.description,
        weapon_range: Number(a.range.match(/\d+(?:[.,]\d+)?/)?.[0].replace(',', '.') ?? 1.5),
      }));
  const spells = (sheet?.spells ?? npc?.spells ?? []).filter(
    (s) =>
      (s.level === 0 || s.prepared || s.always_prepared || s.casting_mode === 'arcanum' || !!npc) &&
      s.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
  );
  const pending = requests.find(
    (r) => r.token_id === token.id && (r.status === 'pending' || r.status === 'approved'),
  );
  const latest = requests
    .filter((r) => r.token_id === token.id && r.kind !== 'opportunity')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const result = requests.find((r) => r.id === resultId);
  useEffect(() => {
    for (const r of requests.filter((r) => r.token_id === token.id && r.kind !== 'opportunity')) {
      const old = previousStatus.current.get(r.id);
      if (
        (r.status === 'approved' && old !== 'approved') ||
        (old === 'pending' && (r.status === 'failure' || r.status === 'success')) ||
        (old === 'approved' && r.status !== 'approved')
      ) {
        setResultId(r.id);
        setTab(null);
        setOpen(false);
      }
      previousStatus.current.set(r.id, r.status);
    }
  }, [requests, token.id]);
  async function rollAction(r: BattleActionRequest) {
    setRollError(null);
    setRevealing(true);
    const key = rollClients.current.get(r.id) ?? crypto.randomUUID();
    rollClients.current.set(r.id, key);
    try {
      await onRoll(r.id, key);
      // Keep the result hidden until the animation inside the dialog finishes.
    } catch (error) {
      setRevealing(false);
      setRollError(
        error instanceof Error ? error.message : 'Não foi possível rolar. Tente novamente.',
      );
    }
  }
  const active = session?.status === 'active' && session.active_token_id === token.id;
  const canAction = !token.action_used;
  const canAttack = canAction || (token.attacks_remaining ?? 0) > 0;
  const cunningAction = sheet?.class_id === 'rogue' && sheet.level >= 2;
  const rogueBonus = cunningAction && !token.bonus_used && preferBonus;
  const forbidden =
    busy ||
    !ready ||
    !active ||
    !!pending ||
    !!movementPlan ||
    (sheet?.hp_current ?? npc?.hp_current ?? 1) <= 0;
  useEffect(() => {
    setOpen(false);
    setTab(null);
    setSearch('');
    clientId.current = null;
  }, [token.id, session?.turn_started_at]);
  useEffect(() => {
    clientId.current = null;
  }, [draft]);
  function choose(kind: 'weapon' | 'spell', source: InventoryItem | Spell) {
    setTab(null);
    if (kind === 'weapon') {
      const e = sheet
        ? weaponEffect(source as InventoryItem, sheet)
        : {
            ...EMPTY_EFFECT,
            kind: 'damage' as const,
            range: (source as InventoryItem).weapon_range ?? 1.5,
            dice: (source as InventoryItem).damage?.match(/[\dd+\-]+/)?.[0] ?? '',
            review: true,
          };
      onDraft({
        actorId: token.id,
        kind,
        sourceId: source.id,
        effect: e,
        target: { x: Math.min(map.width - 1, token.x + 1), y: token.y },
        targetIds: [],
        targetChosen: false,
        resourceKind: 'none',
        resourceLevel: 0,
      });
    } else {
      const spell = source as Spell,
        e = spellEffect(spell);
      const resource = sheet
        ? availableCastResources(sheet, spell).find((r) => r.kind !== 'ritual' && r.remaining > 0)
        : {
            kind: spell.level === 0 ? ('cantrip' as const) : ('none' as const),
            level: spell.level,
            remaining: Infinity,
          };
      if (!resource) return;
      const mod = sheet ? calculate(sheet).modifiers[calculate(sheet).spellAbility ?? 'int'] : 0;
      const effect = scaledSpellEffect(
        e,
        spell.level,
        resource.level,
        sheet?.level ?? npc?.level ?? 1,
        mod,
      );
      const self = e.origin === 'self';
      onDraft({
        actorId: token.id,
        kind,
        sourceId: spell.id,
        effect,
        target: self
          ? { x: token.x, y: Math.min(map.height - 1, token.y + 1) }
          : { x: token.x, y: token.y },
        targetIds: e.shape === 'self' ? [token.id] : [],
        targetChosen: self,
        resourceKind: resource.kind as ActionDraft['resourceKind'],
        resourceLevel: resource.level,
      });
    }
  }
  const sourceSpell = (sheet?.spells ?? npc?.spells)?.find((s) => s.id === draft?.sourceId);
  const resources =
    sourceSpell && sheet
      ? availableCastResources(sheet, sourceSpell).filter(
          (r) => r.kind !== 'ritual' && r.remaining > 0,
        )
      : [];
  const enoughTargets =
    draft &&
    (draft.effect.kind === 'utility' ||
      (draft.effect.shape !== 'single' && !draft.effect.selective) ||
      draft.targetIds.length > 0);
  async function send(payload: BattleActionPayload) {
    clientId.current ??= crypto.randomUUID();
    try {
      await onRequest(payload, clientId.current);
    } catch {
      return;
    }
    setTab(null);
    setOpen(false);
    setSearch('');
  }
  return (
    <div className="vtt-action-panel" aria-label={`Ações de ${token.name}`}>
      <div className="vtt-actor-heading">
        <span className="vtt-faction-dot" style={{ background: factionColor(token) }} />
        <strong>{token.name}</strong>
        <Badge>{FACTION_LABELS[token.faction ?? (token.npc_id ? 'neutral' : 'ally')]}</Badge>
      </div>
      {(character || (npc && npcEditable)) && (
        <Button variant="secondary" onClick={onSheet}>
          <BookOpen size={16} /> {npc ? 'Editar ficha do NPC' : 'Abrir ficha'}
        </Button>
      )}
      <div className="vtt-actor-vitals">
        <span>
          PV{' '}
          <b>
            {sheet?.hp_current ?? npc?.hp_current ?? '—'}/
            {sheet ? calculate(sheet).hpMax : (npc?.hp_max ?? '—')}
          </b>
        </span>
        <span>
          CA <b>{sheet ? calculate(sheet).armorClass : (npc?.ac ?? '—')}</b>
        </span>
        <span>
          Deslocamento{' '}
          <b>
            {token.movement_remaining} {token.movement_unit}
          </b>
        </span>
      </div>
      <div className="vtt-turn-budget">
        <span>
          Ação: <b>{token.action_used ? 'usada' : 'livre'}</b>
        </span>
        <span>
          Bônus: <b>{token.bonus_used ? 'usado' : 'livre'}</b>
        </span>
        <span>
          Reação: <b>{token.reaction_used ? 'usada' : 'livre'}</b>
        </span>
      </div>
      {(token.attacks_remaining ?? 0) > 0 && (
        <small>{token.attacks_remaining} ataque(s) restante(s)</small>
      )}
      {token.disengaged && <Badge>Desengajado · sem ataques de oportunidade</Badge>}
      {token.dodging && <Badge>Esquivando · mestre aplica as vantagens da condição</Badge>}
      {!ready && <p className="vtt-muted">Aplique a migração 009 para habilitar as ações.</p>}
      {!active && (
        <small>A ficha pode ser aberta agora. As ações ficam disponíveis no seu turno.</small>
      )}
      {pending ? (
        <div className="vtt-pending" role="status">
          <strong>
            {pending.status === 'approved' ? 'Sucesso · rolagem liberada' : 'Aguardando o mestre'}
          </strong>
          <span>{pending.name}</span>
          <small>
            {pending.cost === 'bonus'
              ? 'Ação bônus'
              : pending.cost === 'reaction'
                ? 'Reação'
                : 'Ação'}
            {pending.resource_level > 0 ? ` · círculo ${pending.resource_level}` : ''}
          </small>
          {pending.status === 'approved' ? (
            <>
              <b className="vtt-required-dice">{pending.resolution.required_dice}</b>
              <Button disabled={busy || revealing} onClick={() => setResultId(pending.id)}>
                <Dices size={16} /> Rolar dados
              </Button>
            </>
          ) : (
            <Button variant="secondary" disabled={busy} onClick={() => onCancel(pending.id)}>
              Cancelar tentativa
            </Button>
          )}
        </div>
      ) : (
        <>
          {movementPlan && (
            <div className="vtt-pending" role="status">
              <strong>Movimento aguardando reação</strong>
              <small>
                O mestre decide o ataque de oportunidade antes de você sair do alcance. Sua ação
                continua disponível.
              </small>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onCancelMove(movementPlan.id)}
              >
                Cancelar movimento
              </Button>
            </div>
          )}
          <Button disabled={forbidden} onClick={() => setOpen(!open)}>
            <Swords size={16} /> Executar ações
          </Button>
          {open && (
            <div className="vtt-action-options">
              <div className="vtt-action-buttons">
                <Button
                  variant="secondary"
                  disabled={forbidden || token.movement_remaining <= 0}
                  onClick={() => {
                    setTab(null);
                    onDraft(null);
                    onMove();
                  }}
                >
                  <Footprints size={15} /> Mover
                </Button>
                <Button
                  variant="secondary"
                  disabled={forbidden || !canAttack}
                  onClick={() => {
                    setTab('weapon');
                    onDraft(null);
                  }}
                >
                  <Swords size={15} /> Atacar com arma
                </Button>
                <Button
                  variant="secondary"
                  disabled={forbidden}
                  onClick={() => {
                    setTab('spell');
                    onDraft(null);
                  }}
                >
                  <Sparkles size={15} /> Conjurar magia
                </Button>
              </div>
              <small>
                Mover gasta deslocamento. Você pode mover antes, depois e entre ataques.
              </small>
              {cunningAction && (
                <label className="vtt-check">
                  <input
                    type="checkbox"
                    checked={preferBonus}
                    onChange={(e) => setPreferBonus(e.target.checked)}
                  />
                  Usar Ação Ardilosa para Disparada e Desengajar
                </label>
              )}
              <div className="vtt-action-buttons">
                {(['dash', 'disengage', 'dodge'] as const).map((kind) => (
                  <Button
                    key={kind}
                    variant="secondary"
                    disabled={forbidden || (!canAction && !(kind !== 'dodge' && rogueBonus))}
                    onClick={() =>
                      send({ kind, cost: kind !== 'dodge' && rogueBonus ? 'bonus' : 'action' })
                    }
                  >
                    <Shield size={14} />
                    {kind === 'dash'
                      ? 'Disparada'
                      : kind === 'disengage'
                        ? 'Desengajar'
                        : 'Esquivar'}
                    {kind !== 'dodge' && rogueBonus ? ' (bônus)' : ''}
                  </Button>
                ))}
              </div>
              {draft && (
                <div className="vtt-target-card">
                  <strong>
                    {draft.kind === 'spell'
                      ? sourceSpell?.name
                      : weapons.find((i) => i.id === draft.sourceId)?.name}
                  </strong>
                  <small>
                    {draft.effect.shape === 'single'
                      ? `Alcance: ${draft.effect.range} m`
                      : `${draft.effect.shape === 'sphere' ? 'Raio' : draft.effect.shape === 'cone' ? 'Cone' : draft.effect.shape === 'line' ? 'Linha' : 'Cubo'}: ${draft.effect.size} m`}
                    {draft.effect.dice ? ` · ${draft.effect.dice}` : ''}
                  </small>
                  {resources.length > 0 && (
                    <Field label="Espaço de magia">
                      <Select
                        value={`${draft.resourceKind}:${draft.resourceLevel}`}
                        onChange={(event) => {
                          const [kind, level] = event.target.value.split(':'),
                            e = spellEffect(sourceSpell!);
                          const mod = calculate(sheet!).modifiers[
                            calculate(sheet!).spellAbility ?? 'int'
                          ];
                          onDraft({
                            ...draft,
                            resourceKind: kind as ActionDraft['resourceKind'],
                            resourceLevel: Number(level),
                            effect: scaledSpellEffect(
                              e,
                              sourceSpell!.level,
                              Number(level),
                              sheet!.level,
                              mod,
                            ),
                          });
                        }}
                      >
                        {resources.map((r) => (
                          <option key={`${r.kind}:${r.level}`} value={`${r.kind}:${r.level}`}>
                            {resourceLabel(r.kind, r.level, r.remaining)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <p className="vtt-muted">
                    {draft.effect.selective && draft.effect.shape !== 'single'
                      ? 'Toque no chão para posicionar a área e nos personagens para escolher os alvos.'
                      : draft.effect.origin === 'self' &&
                          ['cone', 'line', 'cube'].includes(draft.effect.shape)
                        ? 'Toque no grid para apontar a direção.'
                        : 'Toque no grid ou no alvo para posicionar o efeito.'}
                  </p>
                  {preview && (
                    <div aria-live="polite">
                      <Badge>{preview.cells.length} célula(s)</Badge>
                      <small>
                        Na área:{' '}
                        {tokens
                          .filter((t) => preview.affected.includes(t.id))
                          .map((t) => t.name)
                          .join(', ') || 'nenhum personagem'}
                        {draft.effect.selective
                          ? ` · escolhidos: ${draft.targetIds.length}/${draft.effect.maxTargets}`
                          : ''}
                      </small>
                      {!preview.valid && <p className="error-text">Fora do alcance</p>}
                    </div>
                  )}
                  {draft.effect.review && (
                    <small className="vtt-review-note">{draft.effect.note}</small>
                  )}
                  {sourceSpell && (
                    <details>
                      <summary>Descrição da magia</summary>
                      <p className="vtt-spell-description">{sourceSpell.description}</p>
                    </details>
                  )}
                  <Button
                    disabled={forbidden || !draft.targetChosen || !enoughTargets || !preview?.valid}
                    onClick={() =>
                      send({
                        kind: draft.kind,
                        source_id: draft.sourceId,
                        target: draft.target,
                        target_ids:
                          draft.effect.selective ||
                          draft.effect.shape === 'single' ||
                          draft.effect.shape === 'self'
                            ? draft.targetIds
                            : [],
                        resource_kind: draft.resourceKind,
                        resource_level: draft.resourceLevel,
                      })
                    }
                  >
                    Enviar ao mestre
                  </Button>
                  <Button variant="secondary" onClick={() => onDraft(null)}>
                    Limpar seleção
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <Modal
        portalContainer={
          typeof document !== 'undefined'
            ? (document.fullscreenElement as HTMLElement | null)
            : undefined
        }
        open={tab !== null}
        onClose={() => {
          setTab(null);
          setSearch('');
        }}
        title={tab === 'weapon' ? 'Escolher arma' : 'Escolher magia'}
        description="Escolha o que usar. Em seguida, selecione o alvo ou a área no grid."
        wide
      >
        <div className="vtt-picker-body">
          {tab === 'weapon' && (
            <div className="vtt-source-list">
              <strong>Suas armas</strong>
              {weapons.length ? (
                weapons.map((i) => (
                  <button
                    type="button"
                    className={draft?.sourceId === i.id ? 'selected' : ''}
                    key={i.id}
                    disabled={forbidden || !canAttack}
                    onClick={() => choose('weapon', i)}
                  >
                    <span>{i.name}</span>
                    <small>
                      {i.damage || 'Dano definido pelo mestre'}
                      {i.equipped ? ' · equipada' : ''}
                    </small>
                  </button>
                ))
              ) : (
                <small>Adicione uma arma ao inventário da ficha.</small>
              )}
            </div>
          )}
          {tab === 'spell' && (
            <div className="vtt-source-list">
              <strong>Magias e truques disponíveis</strong>
              <Input
                aria-label="Buscar magia na mesa"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar magia…"
              />
              {spells.length ? (
                spells.map((sp) => {
                  const hasUses =
                    !sheet ||
                    availableCastResources(sheet, sp).some(
                      (r) => r.kind !== 'ritual' && r.remaining > 0,
                    );
                  const bonus = sp.casting_time?.toLowerCase().includes('bônus');
                  const reaction = sp.casting_time?.toLowerCase().includes('rea');
                  const canCast = bonus
                    ? !token.bonus_used
                    : reaction
                      ? !token.reaction_used
                      : canAction;
                  return (
                    <button
                      type="button"
                      key={sp.id}
                      className={draft?.sourceId === sp.id ? 'selected' : ''}
                      disabled={forbidden || !hasUses || !canCast}
                      onClick={() => choose('spell', sp)}
                    >
                      <span>{sp.name}</span>
                      <small>
                        {sp.level ? `Círculo ${sp.level}` : 'Truque'} ·{' '}
                        {sp.casting_time || '1 ação'}
                        {!hasUses ? ' · sem espaços' : ''}
                      </small>
                    </button>
                  );
                })
              ) : (
                <small>Marque as magias como preparadas/conhecidas na ficha.</small>
              )}
            </div>
          )}
        </div>
      </Modal>
      {!pending && latest && ['success', 'failure', 'expired'].includes(latest.status) && (
        <button
          className={`vtt-last-result ${latest.status}`}
          onClick={() => setResultId(latest.id)}
        >
          <strong>
            {latest.status === 'success'
              ? 'Sucesso'
              : latest.status === 'failure'
                ? 'Falha'
                : 'Turno encerrado'}
          </strong>
          <span>{latest.name}</span>
          <small>{actionOutcome(latest)}</small>
        </button>
      )}
      <Modal
        portalContainer={
          typeof document !== 'undefined'
            ? (document.fullscreenElement as HTMLElement | null)
            : undefined
        }
        open={!!result}
        onClose={() => {
          if (!revealing) setResultId(null);
        }}
        title={
          result?.status === 'failure'
            ? 'Falha'
            : result?.status === 'expired'
              ? 'Turno encerrado'
              : result?.status === 'cancelled'
                ? 'Tentativa cancelada'
                : 'Sucesso'
        }
        description={result?.name || 'Resultado da ação'}
      >
        {result && (
          <div className="vtt-roll-result" role="status">
            {result.status === 'approved' ? (
              <>
                <p>
                  O mestre aprovou sua ação. Role os dados para aplicar{' '}
                  {result.resolution.roll_kind === 'healing'
                    ? 'a cura'
                    : result.resolution.roll_kind === 'temporary'
                      ? 'os PV temporários'
                      : 'o dano'}
                  .
                </p>
                <div className="vtt-dice-formula">
                  <Dices size={32} />
                  <b>{result.resolution.required_dice}</b>
                </div>
                <small>
                  Dados definidos pela ficha
                  {result.resource_level > 0
                    ? ` e pelo espaço de círculo ${result.resource_level}`
                    : ''}
                  . Os bônus aplicáveis já estão incluídos.
                </small>
                <Button disabled={busy || revealing} onClick={() => void rollAction(result)}>
                  {revealing ? 'Rolando dados…' : 'Rolar dados'}
                </Button>
              </>
            ) : revealing ? (
              <>
                <p>Rolando dados…</p>
                {result.resolution.dice_roll && (
                  <ActionDiceAnimation
                    roll={result.resolution.dice_roll}
                    animated={diceContext.animated}
                    onComplete={() => setRevealing(false)}
                  />
                )}
              </>
            ) : (
              <>
                <strong className="vtt-outcome-message">{actionOutcome(result)}</strong>
                {result.resolution.dice_roll && (
                  <small>{rollBreakdown(result.resolution.dice_roll)}</small>
                )}
                {(result.resolution.affected ?? []).map((a) => (
                  <div className="vtt-outcome-target" key={a.token_id + a.kind}>
                    <span>
                      {a.name}
                      {a.saved ? ' · resistência bem-sucedida' : ''}
                    </span>
                    <b>
                      {a.kind === 'healing' ? '+' : a.kind === 'damage' ? '−' : '+'}
                      {a.amount} PV{a.kind === 'temporary' ? ' temporários' : ''}
                    </b>
                  </div>
                ))}
                <Button variant="secondary" onClick={() => setResultId(null)}>
                  Voltar ao grid
                </Button>
              </>
            )}
            {rollError && <p className="error-text">{rollError}</p>}
          </div>
        )}
      </Modal>
      {onEndTurn && (
        <Button
          variant="secondary"
          disabled={busy || !ready || !active || !!pending || !!movementPlan}
          onClick={() => void onEndTurn()}
        >
          Fim do turno
        </Button>
      )}
    </div>
  );
}

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
}: {
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
}) {
  const pending = requests.filter((r) => r.status === 'pending');
  const approved = requests.filter((r) => r.status === 'approved');
  return (
    <div className="vtt-master-actions">
      <strong>
        Tentativas dos jogadores {pending.length > 0 && <Badge>{pending.length}</Badge>}
      </strong>
      {!pending.length && <small>As ações enviadas aparecerão aqui para sua decisão.</small>}
      {pending.map((r) => (
        <MasterActionCard
          key={r.id}
          request={r}
          tokens={tokens}
          map={map}
          busy={busy}
          onResolve={onResolve}
          onCancel={onCancel}
          onPreview={onPreview}
        />
      ))}
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
              <small>{e.definition.note}</small>
              <div className="vtt-action-buttons">
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
              {e.definition.kind !== 'utility' && (
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
}: {
  request: BattleActionRequest;
  tokens: BattleToken[];
  map: BattleMap;
  busy: boolean;
  onResolve(id: string, success: boolean, opts: Record<string, unknown>): Promise<void>;
  onCancel(id: string): Promise<void>;
  onPreview(p: EffectPreview | null): void;
}) {
  const [dice, setDice] = useState(r.definition.dice ?? '');
  const [selectedRoll, setSelectedRoll] = useState<DiceRoll | null>(null);
  const [kind, setKind] = useState(r.definition.kind ?? 'utility');
  const [targets, setTargets] = useState<
    Record<string, { saved: boolean; multiplier: number; amount?: number }>
  >({});
  const [applyNow, setApplyNow] = useState(false);
  const [dtype, setDtype] = useState(r.definition.damageType ?? '');
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
    damageType: dtype,
    geometry,
    ...(chooseTargets ? { target_ids: chosen } : {}),
  };
  return (
    <div className="vtt-pending" role="region" aria-label={`Tentativa ${r.name}`}>
      <strong>
        {actor?.name ?? 'Personagem'} quer{' '}
        {r.kind === 'spell' ? 'conjurar' : r.kind === 'weapon' ? 'atacar com' : ''} {r.name}
      </strong>
      <small>
        Rodada {r.round} ·{' '}
        {r.cost === 'bonus' ? 'ação bônus' : r.cost === 'reaction' ? 'reação' : 'ação'}
        {r.resource_level > 0 ? ` · círculo ${r.resource_level}` : ''}
      </small>
      <small>Alvos: {affected.map((t) => t.name).join(', ') || 'área / efeito sem alvo'}</small>
      {r.kind === 'weapon' || r.kind === 'spell' || r.kind === 'opportunity' ? (
        <>
          <Button variant="secondary" onClick={() => onPreview(area)}>
            Mostrar área no grid
          </Button>
          {r.definition.review && <p className="vtt-review-note">{r.definition.note}</p>}
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
                  {geometry.shape === 'line' && (
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
        <Button disabled={busy} onClick={() => onResolve(r.id, true, opts)}>
          <Check size={16} />
          Sucesso
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => onResolve(r.id, false, {})}>
          <X size={16} />
          Falha
        </Button>
      </div>
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
  const [ids, setIds] = useState<string[]>([]),
    [dice, setDice] = useState(effect.definition.dice);
  const [selectedRoll, setSelectedRoll] = useState<DiceRoll | null>(null);
  const actor = tokens.find((t) => t.id === effect.token_id);
  const area = actor ? previewEffect(map, actor, effect.target, effect.definition, tokens) : null;
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
        <small>
          Selecione apenas quem ativou o gatilho. Resistências podem ser incorporadas no valor dos
          dados.
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
          onClick={() =>
            onPulse(effect, {
              dice,
              target_ids: ids,
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

export function actionOutcome(r: BattleActionRequest) {
  if (r.status === 'failure') return 'O mestre decidiu pela falha. A ação não foi executada.';
  if (r.status === 'expired') return 'O turno terminou antes da conclusão desta ação.';
  if (r.status === 'cancelled') return 'Esta tentativa foi cancelada.';
  if (r.status === 'approved') return 'Sucesso! Role os dados para concluir a ação.';
  const kind = r.resolution.roll_kind ?? r.definition.kind;
  if (r.resolution.dice_roll) {
    const amount = Math.max(0, r.resolution.dice_roll.total);
    if (kind === 'healing')
      return `Você curou ${(r.resolution.affected ?? []).filter((a) => a.kind === 'healing').reduce((sum, a) => sum + a.amount, 0)} PV.`;
    if (kind === 'temporary') return `Você concedeu ${amount} PV temporários.`;
    if (kind === 'damage')
      return `Você deu ${amount} de dano${r.definition.damageType ? ` (${r.definition.damageType})` : ''}.`;
  }
  return 'Sua ação foi executada.';
}
