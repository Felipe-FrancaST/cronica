'use client';
import { useRef, useState } from 'react';
import { BookOpen, Heart, Minus, Move, Plus, Shield } from 'lucide-react';
import { Button, ErrorBox, Field, Input, Modal, Select, Tabs } from '@/components/ui';
import {
  CONDITION_NAMES,
  CONDITION_RULES,
  EXHAUSTION_STEPS,
  type DndCondition,
} from '@/systems/dnd5e/conditions';
import type { BattleConditionEffect, BattleLifeState, BattleToken } from './types';
import { errorMessage } from '@/lib/utils';
export const DAMAGE_TYPES = [
  'ácido',
  'concussão',
  'cortante',
  'elétrico',
  'energético',
  'fogo',
  'frio',
  'necrótico',
  'perfurante',
  'psíquico',
  'radiante',
  'trovejante',
  'veneno',
];
export type CreatureChange =
  | {
      operation: 'damage' | 'healing' | 'temporary';
      amount: number;
      damage_type?: string;
      critical?: boolean;
    }
  | {
      operation: 'condition';
      condition: DndCondition;
      source_token_id?: string | null;
      source_reach?: number;
      rounds?: number | null;
      level?: number;
      note?: string;
    }
  | { operation: 'remove_condition'; condition: string };
export function CreatureVitals({
  name,
  life,
  onSheet,
}: {
  name: string;
  life?: BattleLifeState;
  onSheet(): void;
}) {
  const [conditionsOpen, setConditionsOpen] = useState(false);
  return (
    <>
      <div className="battle-player-vitals" aria-label="Minha vida e defesa">
        <strong>{name}</strong>
        <span>
          <Heart size={15} />
          PV{' '}
          <b>
            {life?.hp_current ?? '—'}/{life?.hp_max ?? '—'}
          </b>
          {!!life?.hp_temp && <small>+{life.hp_temp} temporários</small>}
        </span>
        <span>
          <Shield size={15} />
          CA <b>{life?.ac ?? '—'}</b>
        </span>
        {!!life?.conditions?.length && (
          <Button variant="ghost" onClick={() => setConditionsOpen(true)}>
            Condições · {life.conditions.length}
          </Button>
        )}
        <Button variant="secondary" onClick={onSheet}>
          <BookOpen size={15} />
          Minha ficha
        </Button>
      </div>
      <Modal
        open={conditionsOpen}
        onClose={() => setConditionsOpen(false)}
        title="Minhas condições"
        description={name}
        portalContainer={
          typeof document === 'undefined'
            ? undefined
            : (document.fullscreenElement as HTMLElement | null)
        }
      >
        <div className="form-stack">
          {life?.conditions?.map((c) => (
            <section key={c}>
              <strong>
                {c}
                {c === 'Exaustão' ? ` · nível ${life.exhaustion ?? 1}` : ''}
              </strong>
              <p className="subtle">
                {CONDITION_RULES[c as DndCondition] ?? 'Condição definida pela sua fonte.'}
              </p>
            </section>
          ))}
        </div>
      </Modal>
    </>
  );
}
export function CreatureMenu({
  token,
  tokens,
  life,
  conditions,
  busy,
  onClose,
  onMove,
  onSheet,
  onChange,
}: {
  token: BattleToken | null;
  tokens: BattleToken[];
  life?: BattleLifeState;
  conditions: BattleConditionEffect[];
  busy: boolean;
  onClose(): void;
  onMove(): void;
  onSheet(): void;
  onChange(change: CreatureChange, clientId: string): Promise<void>;
}) {
  const [tab, setTab] = useState('vitality'),
    [amount, setAmount] = useState(''),
    [kind, setKind] = useState<'damage' | 'healing' | 'temporary'>('damage'),
    [damageType, setDamageType] = useState(''),
    [critical, setCritical] = useState(false),
    [condition, setCondition] = useState<DndCondition>('Caído'),
    [source, setSource] = useState(''),
    [reach, setReach] = useState('1.5'),
    [rounds, setRounds] = useState(''),
    [level, setLevel] = useState('1'),
    [note, setNote] = useState(''),
    [error, setError] = useState<string | null>(null),
    [status, setStatus] = useState('');
  const sending = useRef(false),
    retry = useRef<{ payload: string; id: string } | null>(null);
  async function send(change: CreatureChange) {
    if (sending.current || busy) return;
    sending.current = true;
    setError(null);
    setStatus('');
    const payload = JSON.stringify(change);
    if (retry.current?.payload !== payload) retry.current = { payload, id: crypto.randomUUID() };
    try {
      await onChange(change, retry.current.id);
      retry.current = null;
      setStatus(
        change.operation === 'remove_condition'
          ? 'Condição removida.'
          : change.operation === 'condition'
            ? 'Condição aplicada.'
            : 'Vida atualizada.',
      );
      if (change.operation !== 'condition') setAmount('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      sending.current = false;
    }
  }
  const names = [
    ...new Set([...(life?.conditions ?? []), ...conditions.map((c) => c.condition)]),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return (
    <Modal
      open={!!token}
      onClose={onClose}
      title={token?.name ?? 'Criatura'}
      description="Controle do mestre"
      portalContainer={
        typeof document === 'undefined'
          ? undefined
          : (document.fullscreenElement as HTMLElement | null)
      }
    >
      {token && (
        <div className="form-stack battle-creature-controls">
          <div className="npc-summary">
            <span>
              <small>Vida</small>
              <strong>
                {life?.hp_current ?? '—'}/{life?.hp_max ?? '—'}
              </strong>
            </span>
            <span>
              <small>CA</small>
              <strong>{life?.ac ?? '—'}</strong>
            </span>
            <span>
              <small>PV temporários</small>
              <strong>{life?.hp_temp ?? 0}</strong>
            </span>
          </div>
          <div className="vtt-action-buttons">
            <Button
              variant="secondary"
              disabled={busy || (!token.character_id && !token.npc_id)}
              onClick={onSheet}
            >
              <BookOpen size={16} />
              Abrir ficha
            </Button>
            <Button variant="secondary" onClick={onMove}>
              <Move size={16} />
              Mover no grid
            </Button>
          </div>
          <Tabs
            label="Controles da criatura"
            value={tab}
            onChange={setTab}
            idPrefix="creature-control"
            panelId="creature-control-panel"
            items={[
              { id: 'vitality', label: 'Vida' },
              { id: 'conditions', label: 'Condições' },
            ]}
          />
          <ErrorBox message={error} />
          {status && (
            <p role="status" className="info-box">
              {status}
            </p>
          )}
          <div
            role="tabpanel"
            id="creature-control-panel"
            aria-labelledby={'creature-control-' + tab}
            className="form-stack"
          >
            {tab === 'vitality' ? (
              <>
                <Field label="Alteração de vida">
                  <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                    <option value="damage">Causar dano</option>
                    <option value="healing">Curar</option>
                    <option value="temporary">Conceder PV temporários</option>
                  </Select>
                </Field>
                <Field label="Quantidade">
                  <Input
                    type="number"
                    min={1}
                    max={100000}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
                {kind === 'damage' && (
                  <>
                    <Field
                      label="Tipo de dano"
                      hint="Resistências, imunidades e vulnerabilidades são consideradas automaticamente."
                    >
                      <Select value={damageType} onChange={(e) => setDamageType(e.target.value)}>
                        <option value="">Sem tipo / dano direto</option>
                        {DAMAGE_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                    </Field>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={critical}
                        onChange={(e) => setCritical(e.target.checked)}
                      />
                      Acerto crítico (duas falhas contra a morte se já estiver a 0 PV)
                    </label>
                  </>
                )}
                {kind === 'temporary' && (
                  <small>PV temporários não se somam: mantém o maior valor.</small>
                )}
                <Button
                  disabled={
                    busy ||
                    !Number.isInteger(Number(amount)) ||
                    Number(amount) <= 0 ||
                    Number(amount) > 100000
                  }
                  onClick={() =>
                    void send({
                      operation: kind,
                      amount: Number(amount),
                      damage_type: damageType,
                      critical,
                    })
                  }
                >
                  {kind === 'healing' ? <Plus size={17} /> : <Minus size={17} />}Aplicar{' '}
                  {kind === 'healing' ? 'cura' : kind === 'temporary' ? 'PV temporários' : 'dano'}
                </Button>
              </>
            ) : (
              <>
                <Field label="Aplicar condição">
                  <Select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as DndCondition)}
                  >
                    {CONDITION_NAMES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <p className="info-box">{CONDITION_RULES[condition]}</p>
                {condition === 'Exaustão' ? (
                  <Field label="Nível total de exaustão">
                    <Select value={level} onChange={(e) => setLevel(e.target.value)}>
                      {EXHAUSTION_STEPS.slice(1).map((s, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1} · {s}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <>
                    {['Amedrontado', 'Enfeitiçado', 'Agarrado'].includes(condition) && (
                      <Field
                        label="Fonte da condição"
                        hint="Escolha o causador para aplicar as restrições contra essa criatura."
                      >
                        <Select value={source} onChange={(e) => setSource(e.target.value)}>
                          <option value="">Fonte narrativa / fora do grid</option>
                          {tokens
                            .filter((t) => t.id !== token.id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </Select>
                      </Field>
                    )}
                    {condition === 'Agarrado' && source && (
                      <Field label="Alcance do agarrão (m)">
                        <Input
                          type="number"
                          min={0.5}
                          max={30}
                          step={0.5}
                          value={reach}
                          onChange={(e) => setReach(e.target.value)}
                        />
                      </Field>
                    )}
                    <Field
                      label="Duração em rodadas"
                      hint="Vazio: o mestre encerra conforme a fonte. Não inventa salvaguardas para a condição."
                    >
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        value={rounds}
                        onChange={(e) => setRounds(e.target.value)}
                        placeholder="Até ser removida"
                      />
                    </Field>
                  </>
                )}
                <Field label="Origem / observação">
                  <Input
                    value={note}
                    maxLength={200}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex.: agarrão do ogro, veneno da armadilha"
                  />
                </Field>
                <Button
                  disabled={
                    busy ||
                    (condition !== 'Exaustão' &&
                      !!rounds &&
                      (!Number.isInteger(Number(rounds)) ||
                        Number(rounds) < 1 ||
                        Number(rounds) > 10000)) ||
                    (condition === 'Agarrado' &&
                      !!source &&
                      (!Number.isFinite(Number(reach)) ||
                        Number(reach) < 0.5 ||
                        Number(reach) > 30))
                  }
                  onClick={() =>
                    void send({
                      operation: 'condition',
                      condition,
                      source_token_id: source || null,
                      source_reach: Number(reach),
                      rounds: rounds ? Number(rounds) : null,
                      level: Number(level),
                      note,
                    })
                  }
                >
                  Aplicar condição
                </Button>
              </>
            )}
            {!!names.length && (
              <section className="form-stack">
                <strong>Condições atuais</strong>
                {names.map((c) => (
                  <div className="battle-condition-chip" key={c}>
                    <details>
                      <summary>
                        {c}
                        {c === 'Exaustão' ? ' · nível ' + (life?.exhaustion ?? 1) : ''}
                      </summary>
                      <p>
                        {CONDITION_RULES[c as DndCondition] ?? 'Efeito definido pela sua fonte.'}
                      </p>
                      {conditions
                        .filter((x) => x.condition === c)
                        .map((x) => (
                          <small key={x.id}>
                            {x.label}
                            {x.source_token_id
                              ? ' · ' +
                                (tokens.find((t) => t.id === x.source_token_id)?.name ?? 'fonte')
                              : ''}
                            {x.expires_round ? ' · até rodada ' + x.expires_round : ''}
                          </small>
                        ))}
                    </details>
                    <Button
                      variant="ghost"
                      disabled={busy || (c === 'Inconsciente' && life?.hp_current === 0)}
                      onClick={() => void send({ operation: 'remove_condition', condition: c })}
                    >
                      Remover {c}
                    </Button>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
