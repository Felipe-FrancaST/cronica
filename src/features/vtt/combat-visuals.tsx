'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BattleActionRequest, BattleToken, GridPoint } from './types';
export interface CombatProjection {
  element: HTMLElement;
  project(point: GridPoint): { x: number; y: number } | null;
}
export function combatEffectColor(request: BattleActionRequest) {
  if (request.definition.kind === 'healing' || request.definition.kind === 'temporary')
    return '#71e5ae';
  const type = (request.definition.damageType ?? '').toLowerCase();
  if (/fogo/.test(type)) return '#ffae66';
  if (/frio|gelo|elétrico/.test(type)) return '#85d9ff';
  return request.kind === 'spell' ? '#b9a4ff' : '#f4da9b';
}
/** One short SVG overlay, at most six targets, no new WebGL context or perpetual frame loop. */
export function CombatVisuals({
  requests,
  tokens,
  projection,
  enabled,
  mapId,
}: {
  requests: BattleActionRequest[];
  tokens: BattleToken[];
  projection: CombatProjection | null;
  enabled: boolean;
  mapId: string;
}) {
  const seen = useRef(new Set<string>()),
    scope = useRef('');
  const [effect, setEffect] = useState<{
    id: string;
    color: string;
    from: { x: number; y: number };
    to: { x: number; y: number }[];
    miss: boolean;
  } | null>(null);
  useEffect(() => {
    if (scope.current !== mapId) {
      scope.current = mapId;
      seen.current = new Set(
        requests.filter((q) => ['success', 'failure'].includes(q.status)).map((q) => q.id),
      );
      setEffect(null);
      return;
    }
    const fresh = requests.filter(
      (q) => ['success', 'failure'].includes(q.status) && !seen.current.has(q.id),
    );
    fresh.forEach((q) => seen.current.add(q.id));
    if (seen.current.size > 300) seen.current = new Set([...seen.current].slice(-200));
    const q = fresh[0];
    if (
      !q ||
      !['spell', 'weapon', 'item', 'opportunity'].includes(q.kind) ||
      !enabled ||
      !projection
    )
      return;
    const actor = tokens.find((t) => t.id === q.token_id);
    if (!actor) return;
    const from = projection.project(actor);
    if (!from) return;
    const ids = q.resolution.affected?.map((a) => a.token_id) ?? q.target_ids;
    const targets = tokens.filter((t) => ids.includes(t.id)).slice(0, 6);
    const to = targets
      .map((t) => projection.project(t))
      .filter((p): p is { x: number; y: number } => !!p);
    if (!to.length) {
      const p = projection.project(q.target);
      if (p) to.push(p);
    }
    if (to.length)
      setEffect({ id: q.id, color: combatEffectColor(q), from, to, miss: q.status === 'failure' });
  }, [requests, tokens, projection, enabled, mapId]);
  useEffect(() => {
    if (!effect) return;
    const timer = setTimeout(() => setEffect(null), 650);
    return () => clearTimeout(timer);
  }, [effect?.id]);
  if (!effect || !projection || !enabled) return null;
  return createPortal(
    <svg
      className="combat-visual-overlay"
      aria-hidden="true"
      data-combat-effect={effect.id}
      style={{ color: effect.color }}
    >
      {effect.to.map((p, i) => (
        <g key={i}>
          <line
            x1={`${effect.from.x * 100}%`}
            y1={`${effect.from.y * 100}%`}
            x2={`${p.x * 100}%`}
            y2={`${p.y * 100}%`}
            className={effect.miss ? 'combat-trace is-miss' : 'combat-trace'}
          />
          {!effect.miss && (
            <circle cx={`${p.x * 100}%`} cy={`${p.y * 100}%`} r="22" className="combat-impact" />
          )}
        </g>
      ))}
    </svg>,
    projection.element,
  );
}
