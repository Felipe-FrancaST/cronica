'use client';
import { useEffect, useRef, useState } from 'react';
import { Dices, Lock, RotateCcw } from 'lucide-react';
import { Button, Field, Input, Select, ErrorBox } from '@/components/ui';
import { useWorkspace } from '@/hooks/use-workspace';
import { errorMessage } from '@/lib/utils';
import { useDice } from './dice-provider';
import {
  DIE_SIDES,
  canUseAdvantage,
  parseDiceExpression,
  rollBreakdown,
  type DiceRoll,
  type DieSides,
  type RollMode,
  type RollVisibility,
} from './dice';
export function DieGlyph({ sides }: { sides: DieSides }) {
  const shape =
    sides === 4
      ? '16,2 30,29 2,29'
      : sides === 6
        ? '5,5 27,5 27,27 5,27'
        : sides === 8
          ? '16,1 30,16 16,31 2,16'
          : sides === 10 || sides === 100
            ? '16,1 29,10 25,27 16,31 7,27 3,10'
            : '16,1 29,9 29,23 16,31 3,23 3,9';
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <polygon
        points={shape}
        fill="currentColor"
        fillOpacity=".12"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M16 2 L16 10 M3 23 L10 19 M29 23 L22 19"
        stroke="currentColor"
        opacity=".4"
        fill="none"
      />
    </svg>
  );
}
export function DicePanel({ mapId, master }: { mapId: string; master: boolean }) {
  const dice = useDice(),
    w = useWorkspace();
  const [side, setSide] = useState<DieSides>(20),
    [count, setCount] = useState(1),
    [modifier, setModifier] = useState(0),
    [formula, setFormula] = useState('1d20'),
    [mode, setMode] = useState<RollMode>('normal'),
    [visibility, setVisibility] = useState<RollVisibility>('public'),
    [label, setLabel] = useState(''),
    [error, setError] = useState<string | null>(null);
  const retry = useRef<string | null>(null);
  useEffect(() => {
    retry.current = null;
    setError(null);
  }, [formula, mode, visibility, label, mapId]);
  function compose(n: number, s: DieSides, m: number) {
    setFormula(`${n}d${s}${m === 0 ? '' : m > 0 ? '+' + m : m}`);
    setMode('normal');
  }
  async function submit() {
    if (dice.rolling || !dice.ready) return;
    try {
      setError(null);
      parseDiceExpression(formula);
      retry.current ??= crypto.randomUUID();
      await dice.roll(
        mapId,
        {
          expression: formula,
          mode: canUseAdvantage(formula) ? mode : 'normal',
          label,
          visibility,
        },
        retry.current,
      );
      retry.current = null;
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const history = dice.history.filter((r) => r.map_id === mapId).slice(0, 12);
  return (
    <section className="dice-panel" aria-label="Rolagem de dados">
      <div className="vtt-panel-title">
        <span>
          <Dices size={17} />
          Dados da mesa
        </span>
        <small>d4–d100</small>
      </div>
      {!dice.ready && (
        <p className="vtt-review-note">Aplique a migração 010 para habilitar os dados.</p>
      )}
      <div className="dice-picker" role="group" aria-label="Tipo de dado">
        {DIE_SIDES.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`Escolher d${s}`}
            aria-pressed={side === s}
            onClick={() => {
              setSide(s);
              compose(count, s, modifier);
            }}
          >
            <DieGlyph sides={s} />
            <span>d{s}</span>
          </button>
        ))}
      </div>
      <div className="dice-input-row">
        <Field label="Quantidade">
          <Input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => {
              const n = Number(e.target.value);
              setCount(n);
              compose(n, side, modifier);
            }}
          />
        </Field>
        <Field label="Modificador">
          <Input
            type="number"
            min={-100000}
            max={100000}
            value={modifier}
            onChange={(e) => {
              const m = Number(e.target.value);
              setModifier(m);
              compose(count, side, m);
            }}
          />
        </Field>
      </div>
      <Field label="Fórmula">
        <Input
          maxLength={200}
          value={formula}
          onChange={(e) => {
            setFormula(e.target.value);
            if (!canUseAdvantage(e.target.value)) setMode('normal');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="2d6+3"
        />
      </Field>
      {canUseAdvantage(formula) && (
        <Field label="Modo do d20">
          <Select value={mode} onChange={(e) => setMode(e.target.value as RollMode)}>
            <option value="normal">Normal</option>
            <option value="advantage">Vantagem · maior de 2d20</option>
            <option value="disadvantage">Desvantagem · menor de 2d20</option>
          </Select>
        </Field>
      )}
      <Field label="Motivo da rolagem">
        <Input
          value={label}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ataque, dano, cura…"
        />
      </Field>
      <Field label="Quem vê a rolagem">
        <Select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as RollVisibility)}
        >
          <option value="public">Toda a mesa</option>
          <option value="self">Somente eu</option>
          {master && <option value="gm">Somente o mestre</option>}
        </Select>
      </Field>
      <ErrorBox message={error} />
      <Button disabled={dice.rolling || !dice.ready} onClick={() => void submit()}>
        <Dices size={16} />
        {dice.rolling ? 'Rolando…' : 'Rolar dados'}
      </Button>
      <label className="vtt-check">
        <input
          type="checkbox"
          checked={dice.animated}
          onChange={(e) => dice.setAnimated(e.target.checked)}
        />
        Animar os dados
      </label>
      <div className="dice-history">
        <strong>Últimas rolagens</strong>
        {history.length ? (
          history.map((r) => (
            <div className="dice-history-row" key={r.id}>
              <div>
                <strong>{r.label || r.expression}</strong>
                <small>
                  {w.data.profiles.find((p) => p.id === r.rolled_by)?.name ?? 'Participante'} ·{' '}
                  {r.expression}
                  {r.mode !== 'normal'
                    ? ' · ' + (r.mode === 'advantage' ? 'vantagem' : 'desvantagem')
                    : ''}
                  {r.visibility !== 'public' && <Lock size={11} aria-label="Rolagem privada" />}
                </small>
                <small>{rollBreakdown(r)}</small>
              </div>
              <b>{r.total}</b>
            </div>
          ))
        ) : (
          <small>Role um dado para começar o histórico.</small>
        )}
      </div>
    </section>
  );
}
export function DiceField({
  mapId,
  value,
  onChange,
  onSelected,
  requestId,
  effectId,
  label = 'Dados ou valor',
  purpose = 'Rolagem',
}: {
  mapId: string;
  value: string;
  onChange(v: string): void;
  onSelected(r: DiceRoll | null): void;
  requestId?: string;
  effectId?: string;
  label?: string;
  purpose?: string;
}) {
  const dice = useDice();
  const [selected, setSelected] = useState<DiceRoll | null>(null),
    [error, setError] = useState<string | null>(null);
  const retry = useRef<string | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setSelected(null);
    retry.current = null;
    setError(null);
    onSelected(null);
    return () => {
      revision.current++;
    };
  }, [value, requestId, effectId, mapId]);
  let rollable = false;
  try {
    rollable = parseDiceExpression(value).terms.some((t) => t.sides !== null);
  } catch {}
  async function roll() {
    const seq = revision.current;
    try {
      setError(null);
      retry.current ??= crypto.randomUUID();
      const r = await dice.roll(
        mapId,
        { expression: value, visibility: 'gm', label: purpose, requestId, effectId },
        retry.current,
      );
      if (seq !== revision.current) return;
      retry.current = null;
      setSelected(r);
      onSelected(r);
    } catch (e) {
      if (seq === revision.current) setError(errorMessage(e));
    }
  }
  return (
    <div className="dice-field">
      <Field label={label}>
        <Input
          maxLength={200}
          disabled={dice.rolling}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="8d6 ou 20"
        />
      </Field>
      <Button
        variant="secondary"
        disabled={!rollable || dice.rolling || !dice.ready}
        onClick={() => void roll()}
      >
        <Dices size={15} />
        {selected ? <RotateCcw size={13} /> : null}
        {selected
          ? 'Rolar novamente'
          : 'Rolar ' + (purpose.toLowerCase().includes('cura') ? 'cura' : 'dano')}
      </Button>
      {selected && (
        <div className="dice-field-result" role="status">
          <strong>Total: {selected.total}</strong>
          <small>{rollBreakdown(selected)}</small>
          <small>Este valor será usado ao aprovar.</small>
        </div>
      )}
      <ErrorBox message={error} />
    </div>
  );
}
