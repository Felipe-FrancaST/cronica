'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  BattleActionRequest,
  BattleMap,
  BattleToken,
  GridPoint,
  BattleFogCell,
} from './types';
import { combatEffectStyle, combatAreaPoints, type CombatVisualKind } from './combat-effect-style';
import { visionCell, type VisionMap } from './vision';
import { areaHidden } from './fog';
export interface CombatProjection {
  element: HTMLElement;
  project(point: GridPoint): { x: number; y: number } | null;
}
export const combatEffectColor = (q: BattleActionRequest) => combatEffectStyle(q).color;
type P = { x: number; y: number };
interface Visual {
  id: string;
  width: number;
  height: number;
  color: string;
  kind: CombatVisualKind;
  from: P;
  to: P[];
  area: P[];
  miss: boolean;
  critical: boolean;
}
/** One event, six targets, 24 area vertices. CSS only; no perpetual frame loop. */
export function CombatVisuals({
  requests,
  tokens,
  projection,
  enabled,
  mapId,
  map,
  vision,
  master = false,
  fog = [],
  suspended = false,
}: {
  requests: BattleActionRequest[];
  tokens: BattleToken[];
  projection: CombatProjection | null;
  enabled: boolean;
  mapId: string;
  map?: BattleMap;
  vision?: VisionMap;
  master?: boolean;
  fog?: BattleFogCell[];
  suspended?: boolean;
}) {
  const seen = useRef(new Set<string>()),
    scope = useRef('');
  const [effect, setEffect] = useState<Visual | null>(null);
  const queued = useRef<Visual | null>(null);
  useEffect(() => {
    if (scope.current !== mapId) {
      scope.current = mapId;
      seen.current = new Set(
        requests.filter((q) => ['success', 'failure'].includes(q.status)).map((q) => q.id),
      );
      setEffect(null);
      queued.current = null;
      return;
    }
    const fresh = requests.filter(
      (q) => ['success', 'failure'].includes(q.status) && !seen.current.has(q.id),
    );
    fresh.forEach((q) => seen.current.add(q.id));
    if (seen.current.size > 300) seen.current = new Set([...seen.current].slice(-200));
    const q = fresh.find((q) => ['spell', 'weapon', 'item', 'opportunity'].includes(q.kind));
    if (!q || !enabled || !projection) return;
    const visible = (p: GridPoint) =>
      master || (!areaHidden(fog, p) && visionCell(vision, Math.floor(p.x), Math.floor(p.y)));
    const actor = tokens.find((t) => t.id === q.token_id);
    if (!actor || !visible(actor)) return;
    const width = Math.max(1, projection.element.clientWidth),
      height = Math.max(1, projection.element.clientHeight);
    const project = (p: GridPoint) => {
      const n = projection.project(p);
      return n ? { x: n.x * width, y: n.y * height } : null;
    };
    const from = project({
      x: actor.x + actor.size / 2 - 0.5,
      y: actor.y + actor.size / 2 - 0.5,
      z: actor.z,
    });
    if (!from) return;
    const ids = q.resolution.affected?.map((a) => a.token_id) ?? q.target_ids;
    const to = tokens
      .filter((t) => ids.includes(t.id) && visible(t))
      .slice(0, 6)
      .map((t) => project({ x: t.x + t.size / 2 - 0.5, y: t.y + t.size / 2 - 0.5, z: t.z }))
      .filter((p): p is P => !!p);
    if (!to.length && visible(q.target)) {
      const p = project(q.target);
      if (p) to.push(p);
    }
    if (!to.length) return;
    const points = map ? combatAreaPoints(q, actor, map) : [];
    const area =
      points.length && points.every(visible) ? points.map(project).filter((p): p is P => !!p) : [];
    const visual = {
      id: q.id,
      width,
      height,
      ...combatEffectStyle(q),
      from,
      to,
      area,
      miss: q.status === 'failure',
      critical: !!q.resolution.critical,
    };
    if (suspended) queued.current = visual;
    else setEffect(visual);
  }, [requests, tokens, projection, enabled, mapId, map, vision, master, fog, suspended]);
  useEffect(() => {
    if (!suspended && queued.current) {
      setEffect(queued.current);
      queued.current = null;
    }
  }, [suspended]);
  useEffect(() => {
    if (!effect) return;
    const t = setTimeout(() => setEffect(null), 900);
    return () => clearTimeout(t);
  }, [effect?.id]);
  if (!effect || !projection || !enabled || suspended) return null;
  return createPortal(
    <svg
      viewBox={`0 0 ${effect.width} ${effect.height}`}
      preserveAspectRatio="none"
      className={`combat-visual-overlay fx-${effect.kind}${effect.miss ? ' is-miss' : ''}${effect.critical ? ' is-critical' : ''}`}
      aria-hidden="true"
      data-combat-effect={effect.id}
      data-effect-kind={effect.kind}
      style={{ color: effect.color }}
    >
      {effect.area.length >= 3 && (
        <polygon className="fx-area" points={effect.area.map((p) => `${p.x},${p.y}`).join(' ')} />
      )}
      {effect.to.map((p, i) => {
        const angle = (Math.atan2(p.y - effect.from.y, p.x - effect.from.x) * 180) / Math.PI;
        const path =
          effect.kind === 'bolt'
            ? `M${effect.from.x} ${effect.from.y} L${effect.from.x + (p.x - effect.from.x) * 0.3 + 12} ${effect.from.y + (p.y - effect.from.y) * 0.3 - 12} L${effect.from.x + (p.x - effect.from.x) * 0.65 - 10} ${effect.from.y + (p.y - effect.from.y) * 0.65 + 10} L${p.x} ${p.y}`
            : `M${effect.from.x} ${effect.from.y} L${p.x} ${p.y}`;
        return (
          <g key={i}>
            {['arrow', 'bolt', 'orb'].includes(effect.kind) && (
              <>
                <path d={path} className="fx-trail" pathLength="1" />
                <path d={path} className="fx-flight" pathLength="1" />
                {effect.kind === 'arrow' && (
                  <path
                    d="M-13-7 0 0-13 7"
                    className="fx-arrowhead"
                    transform={`translate(${p.x} ${p.y}) rotate(${angle})`}
                  />
                )}
              </>
            )}
            <g transform={`translate(${p.x} ${p.y})`}>
              {effect.kind === 'slash' ? (
                <>
                  <path d="M-38 27Q-4-42 38-25Q1-3-38 27" className="fx-slash" />
                  <path d="M-29 34Q9-17 44-14" className="fx-slash-secondary" />
                </>
              ) : effect.kind === 'heal' ? (
                <>
                  <path d="M-12 0H12M0-12V12" className="fx-heal-cross" />
                  <circle r="32" className="fx-ring" />
                  <path d="M-27 16V-6M25 10V-15" className="fx-heal-motes" />
                </>
              ) : effect.kind === 'rune' ? (
                <>
                  <circle r="32" className="fx-rune" />
                  <path d="M0-24 21 12-21 12Z M0 24-21-12H21Z" className="fx-rune" />
                </>
              ) : (
                !effect.miss && (
                  <>
                    <circle r="22" className="fx-core" />
                    <circle r="38" className="fx-ring" />
                    <path
                      d="M-40 0H-26M26 0H40M0-40V-26M0 26V40M-28-28-18-18M18 18 28 28"
                      className="fx-sparks"
                    />
                  </>
                )
              )}
              {effect.miss && <path d="M-16 16 16-16M-16-16 16 16" className="fx-miss" />}
            </g>
          </g>
        );
      })}
    </svg>,
    projection.element,
  );
}
