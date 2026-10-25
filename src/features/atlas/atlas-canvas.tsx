'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { AssetImages } from '@/features/map-assets/atlas-images';
import { AtlasPainter, drawSelection, drawFeature, traceRoute, THEMES } from './render';
import {
  canDraw,
  cloneForStroke,
  featureBase,
  featureBounds,
  floodFill,
  hitFeature,
  paintLine,
} from './model';
import {
  CELL,
  FEATURE_LAYER,
  MAX_FEATURES,
  TOKEN_LABELS,
  SYMBOLS,
  type AtlasDocument,
  type AtlasTool,
  type Brush,
  type MapFeature,
  type Point,
  type RegionFeature,
  type RouteFeature,
  type SymbolId,
  type TokenIcon,
  type RouteStyle,
} from './types';

export interface CanvasHandle {
  fit(): void;
  zoom(factor: number): void;
  cancel(): void;
  finishPath(): void;
  flush(): void;
}
interface Props {
  assetImages?: AssetImages;
  symbolAssetId?: string;
  symbolAssetName?: string;
  tokenAssetId?: string;
  document: AtlasDocument;
  tool: AtlasTool;
  brush: Brush;
  selected: string[];
  snap: boolean;
  showRoutePoints?: boolean;
  symbol: SymbolId;
  symbolSize: number;
  symbolColor: string;
  stamp: boolean;
  pieceRotation?: number;
  token: TokenIcon;
  tokenColor: string;
  tokenSize: number;
  tokenName: string;
  tokenFaction: 'neutral' | 'ally' | 'enemy';
  tokenNumber: number;
  routeStyle: RouteStyle;
  routeColor: string;
  routeWidth: number;
  routeCurved: boolean;
  regionColor: string;
  regionOpacity: number;
  label: string;
  labelSize: number;
  labelColor: string;
  onCommit(doc: AtlasDocument): void;
  onSelect(ids: string[]): void;
  onStatus(text: string): void;
  onZoom(zoom: number): void;
  onPick(terrain: number, height: number): void;
}
type Gesture =
  | { type: 'paint'; base: AtlasDocument; doc: AtlasDocument; last: Point; changed: boolean }
  | { type: 'stamp'; base: AtlasDocument; doc: AtlasDocument; last: Point; changed: boolean }
  | {
      type: 'move';
      base: AtlasDocument;
      doc: AtlasDocument;
      from: Point;
      ids: string[];
      changed: boolean;
    }
  | {
      type: 'vertex';
      base: AtlasDocument;
      doc: AtlasDocument;
      id: string;
      index: number;
      changed: boolean;
    }
  | { type: 'box'; from: Point; to: Point; additive: boolean }
  | { type: 'pan'; from: Point; pan: Point }
  | { type: 'pinch'; distance: number; zoom: number; anchor: Point };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (!!target.closest('input,textarea,select,button,a,[role="dialog"],[role="alertdialog"]') ||
    target.isContentEditable);

export const AtlasCanvas = forwardRef<CanvasHandle, Props>(function AtlasCanvas(props, ref) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    current = useRef(props),
    painter = useRef<AtlasPainter | null>(null);
  current.current = props;
  const view = useRef({ zoom: 1, pan: { x: 0, y: 0 }, width: 1, height: 1, dpr: 1, ready: false });
  const gesture = useRef<Gesture | null>(null),
    points = useRef<Point[]>([]),
    hover = useRef<Point | null>(null),
    space = useRef(false),
    pointers = useRef(new Map<number, Point>()),
    touchPathLength = useRef(0),
    frame = useRef(0),
    active = useRef(false);
  function render() {
    frame.current = 0;
    const c = canvas.current?.getContext('2d');
    if (!c || !active.current) return;
    const v = view.current,
      g = gesture.current,
      d = g && 'doc' in g ? g.doc : current.current.document;
    c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    c.clearRect(0, 0, v.width, v.height);
    c.fillStyle = '#121917';
    c.fillRect(0, 0, v.width, v.height);
    c.save();
    c.translate(v.pan.x, v.pan.y);
    c.scale(v.zoom, v.zoom);
    c.shadowColor = '#0009';
    c.shadowBlur = 18 / v.zoom;
    c.fillStyle = THEMES[d.theme].paper;
    c.fillRect(0, 0, d.width, d.height);
    c.shadowBlur = 0;
    painter.current?.draw(c, d, { assets: current.current.assetImages });
    for (const id of current.current.selected) {
      const o = d.objects.find((o) => o.id === id);
      if (o && o.visible && d.layers.find((l) => l.id === FEATURE_LAYER[o.kind])?.visible) {
        drawSelection(c, o, v.zoom);
        if (
          current.current.selected.length === 1 &&
          (o.kind === 'region' || (o.kind === 'route' && current.current.showRoutePoints !== false))
        ) {
          c.save();
          c.translate(o.x, o.y);
          c.rotate((o.rotation * Math.PI) / 180);
          c.fillStyle = '#ffe2a3';
          c.strokeStyle = '#785b31';
          c.lineWidth = 1 / v.zoom;
          for (const p of o.points) {
            c.beginPath();
            c.arc(p.x, p.y, 4 / v.zoom, 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
          c.restore();
        }
      }
    }
    if (g?.type === 'box') {
      c.fillStyle = '#e0b35d20';
      c.strokeStyle = '#e0b35d';
      c.lineWidth = 1 / v.zoom;
      c.fillRect(g.from.x, g.from.y, g.to.x - g.from.x, g.to.y - g.from.y);
      c.strokeRect(g.from.x, g.from.y, g.to.x - g.from.x, g.to.y - g.from.y);
    }
    const path = points.current,
      h = hover.current,
      tool = current.current.tool;
    if (path.length) {
      const ps = h && !(tool === 'measure' && path.length >= 2) ? [...path, h] : path;
      c.strokeStyle =
        tool === 'region'
          ? current.current.regionColor
          : tool === 'measure'
            ? '#fff1bf'
            : current.current.routeColor;
      c.lineWidth = tool === 'route' ? current.current.routeWidth : 2 / v.zoom;
      c.setLineDash([6 / v.zoom, 4 / v.zoom]);
      traceRoute(c, ps, current.current.routeCurved && tool === 'route');
      c.stroke();
      if (tool === 'region' && ps.length > 2) {
        c.closePath();
        c.fillStyle = current.current.regionColor + '25';
        c.fill();
      }
      c.setLineDash([]);
      c.fillStyle = '#ffe1a1';
      for (const p of tool === 'route' && current.current.showRoutePoints === false ? [] : path) {
        c.beginPath();
        c.arc(p.x, p.y, 3.5 / v.zoom, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (h && ['paint', 'erase', 'fill'].includes(tool)) {
      c.lineWidth = 1.5 / v.zoom;
      c.strokeStyle = '#fff2b9';
      c.shadowColor = '#0008';
      c.shadowBlur = 2 / v.zoom;
      c.setLineDash([4 / v.zoom, 3 / v.zoom]);
      if (current.current.brush.shape === 'square') {
        const r = current.current.brush.radius * CELL;
        c.strokeRect(h.x - r, h.y - r, r * 2, r * 2);
      } else {
        c.beginPath();
        c.arc(h.x, h.y, current.current.brush.radius * CELL, 0, Math.PI * 2);
        c.stroke();
      }
      c.shadowBlur = 0;
      c.setLineDash([]);
    }
    if (h && ['symbol', 'token', 'label'].includes(tool) && !g) {
      const o = makeFeature(h);
      if (o) {
        c.save();
        c.globalAlpha = 0.45;
        drawFeature(c, o, THEMES[d.theme].ink, current.current.assetImages);
        c.restore();
      }
    }
    c.restore();
  }
  function draw() {
    if (active.current && !frame.current) frame.current = requestAnimationFrame(render);
  }
  function local(client: Point) {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }
  function world(client: Point, bounded = true) {
    const p = local(client),
      v = view.current,
      d = current.current.document;
    const q = { x: (p.x - v.pan.x) / v.zoom, y: (p.y - v.pan.y) / v.zoom };
    return bounded ? { x: clamp(q.x, 0, d.width - 0.01), y: clamp(q.y, 0, d.height - 0.01) } : q;
  }
  function aligned(p: Point) {
    if (!current.current.snap) return p;
    const d = current.current.document;
    return {
      x: clamp(Math.round(p.x / CELL) * CELL, 0, d.width),
      y: clamp(Math.round(p.y / CELL) * CELL, 0, d.height),
    };
  }
  function zoomAt(factor: number, anchor?: Point) {
    const v = view.current,
      a = anchor ?? { x: v.width / 2, y: v.height / 2 },
      d = current.current.document,
      fit = Math.min((v.width - 52) / d.width, (v.height - 52) / d.height),
      next = clamp(v.zoom * factor, Math.max(0.035, fit * 0.35), 8),
      x = (a.x - v.pan.x) / v.zoom,
      y = (a.y - v.pan.y) / v.zoom;
    v.zoom = next;
    v.pan = { x: a.x - x * next, y: a.y - y * next };
    current.current.onZoom(next);
    draw();
  }
  function fit() {
    const d = current.current.document,
      v = view.current;
    v.zoom = Math.max(0.035, Math.min((v.width - 56) / d.width, (v.height - 56) / d.height));
    v.pan = { x: (v.width - d.width * v.zoom) / 2, y: (v.height - d.height * v.zoom) / 2 };
    v.ready = true;
    current.current.onZoom(v.zoom);
    draw();
  }
  function cancel() {
    gesture.current = null;
    points.current = [];
    painter.current?.invalidateTerrain();
    draw();
  }
  function finishGesture() {
    const g = gesture.current;
    gesture.current = null;
    if (g && 'doc' in g && g.changed) current.current.onCommit(g.doc);
    draw();
  }
  function makeFeature(p: Point): MapFeature | null {
    const pr = current.current,
      base = featureBase(aligned(p), '');
    if (pr.tool === 'symbol')
      return {
        ...base,
        kind: 'symbol',
        name: pr.symbolAssetId
          ? pr.symbolAssetName || 'Imagem'
          : (SYMBOLS.find((s) => s[0] === pr.symbol)?.[1] ?? 'Símbolo'),
        ...(pr.symbolAssetId ? { asset_id: pr.symbolAssetId } : {}),
        rotation: pr.pieceRotation ?? 0,
        symbol: pr.symbol,
        size: pr.symbolSize,
        color: pr.symbolColor,
      };
    if (pr.tool === 'token')
      return {
        ...base,
        name: pr.tokenName.trim().slice(0, 120) || TOKEN_LABELS[pr.token],
        kind: 'token',
        rotation: pr.pieceRotation ?? 0,
        icon: pr.token,
        ...(pr.tokenAssetId ? { asset_id: pr.tokenAssetId } : {}),
        size: pr.tokenSize,
        color: pr.tokenColor,
        faction: pr.tokenFaction,
        number: pr.tokenNumber,
      };
    if (pr.tool === 'label')
      return {
        ...base,
        name: pr.label.slice(0, 120),
        kind: 'label',
        text: pr.label.trim() || 'Novo lugar',
        fontSize: pr.labelSize,
        color: pr.labelColor,
        font: 'serif',
        italic: false,
      };
    return null;
  }
  function addStamp(doc: AtlasDocument, p: Point) {
    if (doc.objects.length >= MAX_FEATURES) {
      current.current.onStatus('Limite de 1.800 elementos. Remova ou reutilize elementos.');
      return false;
    }
    const o = makeFeature(p);
    if (!o) return false;
    if (
      (o.kind === 'symbol' || o.kind === 'token') &&
      o.asset_id &&
      !doc.objects.some(
        (v) => (v.kind === 'symbol' || v.kind === 'token') && v.asset_id === o.asset_id,
      ) &&
      new Set(
        doc.objects.flatMap((v) =>
          (v.kind === 'symbol' || v.kind === 'token') && v.asset_id ? [v.asset_id] : [],
        ),
      ).size >= 96
    ) {
      current.current.onStatus('Use até 96 imagens diferentes por mapa.');
      return false;
    }
    doc.objects.push(o);
    return true;
  }
  function finishPath() {
    const pr = current.current,
      min = pr.tool === 'region' ? 3 : 2,
      ps = points.current;
    if (pr.tool === 'measure') {
      points.current = [];
      draw();
      return;
    }
    if (ps.length < min) {
      pr.onStatus(`Marque pelo menos ${min} pontos antes de concluir.`);
      return;
    }
    if (pr.document.objects.length >= MAX_FEATURES) {
      pr.onStatus('Limite de 1.800 elementos por mapa.');
      return;
    }
    if (!canDraw(pr.document, pr.tool === 'region' ? 'regions' : 'routes')) {
      pr.onStatus('Mostre e desbloqueie a camada para concluir o traçado.');
      return;
    }
    const origin = ps[0],
      base = featureBase(origin, pr.tool === 'region' ? 'Nova região' : 'Nova rota'),
      relative = ps.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
    const o: RouteFeature | RegionFeature =
      pr.tool === 'region'
        ? {
            ...base,
            kind: 'region',
            points: relative,
            color: pr.regionColor,
            fill: pr.regionColor,
            width: 2,
            fillOpacity: pr.regionOpacity,
          }
        : {
            ...base,
            kind: 'route',
            points: relative,
            color: pr.routeColor,
            width: pr.routeWidth,
            style: pr.routeStyle,
            curved: pr.routeCurved,
          };
    points.current = [];
    pr.onCommit({ ...pr.document, objects: [...pr.document.objects, o] });
    pr.onSelect([o.id]);
    draw();
  }
  useImperativeHandle(ref, () => ({ fit, zoom: zoomAt, cancel, finishPath, flush: finishGesture }));
  useEffect(() => {
    const c = canvas.current,
      h = host.current;
    if (!c || !h) return;
    active.current = true;
    painter.current = new AtlasPainter();
    const resize = () => {
      const rect = h.getBoundingClientRect(),
        v = view.current;
      const center = { x: (v.width / 2 - v.pan.x) / v.zoom, y: (v.height / 2 - v.pan.y) / v.zoom };
      v.width = Math.max(1, rect.width);
      v.height = Math.max(1, rect.height);
      v.dpr = Math.min(devicePixelRatio || 1, 2);
      c.width = Math.round(v.width * v.dpr);
      c.height = Math.round(v.height * v.dpr);
      if (!v.ready) fit();
      else {
        v.pan = { x: v.width / 2 - center.x * v.zoom, y: v.height / 2 - center.y * v.zoom };
        draw();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(h);
    resize();
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-clamp(e.deltaY, -160, 160) * 0.003), local({ x: e.clientX, y: e.clientY }));
    };
    c.addEventListener('wheel', wheel, { passive: false });
    const keydown = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.code === 'Space') {
        space.current = true;
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        cancel();
        current.current.onStatus('Edição em andamento cancelada.');
      }
      if (e.key === 'Enter' && points.current.length) {
        e.preventDefault();
        finishPath();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    const blurred = () => {
      space.current = false;
      cancel();
      pointers.current.clear();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blurred);
    void document.fonts.ready.then(() => {
      if (active.current) draw();
    });
    return () => {
      active.current = false;
      observer.disconnect();
      c.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blurred);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      gesture.current = null;
      pointers.current.clear();
    };
  }, []);
  useEffect(() => {
    const g = gesture.current;
    if (g && 'base' in g && g.base !== props.document) gesture.current = null;
    draw();
  }, [props.document, props.selected, props.showRoutePoints, props.assetImages]);
  useEffect(() => {
    gesture.current = null;
    points.current = [];
    hover.current = null;
    draw();
  }, [props.tool]);
  useEffect(
    () => draw(),
    [
      props.brush,
      props.symbol,
      props.symbolAssetId,
      props.tokenAssetId,
      props.symbolSize,
      props.symbolColor,
      props.pieceRotation,
      props.token,
      props.tokenColor,
      props.tokenSize,
      props.label,
      props.labelSize,
      props.labelColor,
      props.routeColor,
      props.regionColor,
    ],
  );
  return (
    <div className="atlas-canvas-host" ref={host}>
      <canvas
        ref={canvas}
        tabIndex={0}
        className={`atlas-canvas tool-${props.tool}`}
        aria-label="Editor de mapa interativo"
        aria-describedby="atlas-canvas-help"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button > 2) return;
          e.preventDefault();
          e.currentTarget.focus({ preventScroll: true });
          e.currentTarget.setPointerCapture(e.pointerId);
          const client = { x: e.clientX, y: e.clientY };
          pointers.current.set(e.pointerId, client);
          if (e.pointerType === 'touch' && pointers.current.size === 1)
            touchPathLength.current = points.current.length;
          const pr = current.current,
            d = pr.document;
          if (pointers.current.size === 2) {
            points.current = points.current.slice(0, touchPathLength.current);
            const [a, b] = [...pointers.current.values()],
              mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            gesture.current = {
              type: 'pinch',
              distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
              zoom: view.current.zoom,
              anchor: world(mid, false),
            };
            painter.current?.invalidateTerrain();
            draw();
            return;
          }
          const p = world(client),
            raw = world(client, false);
          hover.current = p;
          if (pr.tool === 'pan' || space.current || e.button !== 0) {
            gesture.current = { type: 'pan', from: local(client), pan: { ...view.current.pan } };
            return;
          }
          if (raw.x < 0 || raw.x > d.width || raw.y < 0 || raw.y > d.height) {
            gesture.current = { type: 'pan', from: local(client), pan: { ...view.current.pan } };
            return;
          }
          const layer = ['paint', 'erase', 'fill', 'pick'].includes(pr.tool)
            ? 'terrain'
            : pr.tool === 'symbol'
              ? 'symbols'
              : pr.tool === 'token'
                ? 'tokens'
                : pr.tool === 'label'
                  ? 'labels'
                  : pr.tool === 'route'
                    ? 'routes'
                    : 'regions';
          if (!['select', 'measure', 'pick'].includes(pr.tool) && !canDraw(d, layer)) {
            pr.onStatus('Mostre e desbloqueie a camada para usar esta ferramenta.');
            return;
          }
          if (pr.tool === 'paint' || pr.tool === 'erase') {
            const working = cloneForStroke(d, true),
              changed = paintLine(working, p, p, pr.brush, pr.tool === 'erase');
            gesture.current = { type: 'paint', base: d, doc: working, last: p, changed };
            painter.current?.invalidateTerrain();
          } else if (pr.tool === 'fill') {
            const working = cloneForStroke(d, true);
            if (floodFill(working, p, pr.brush)) pr.onCommit(working);
          } else if (pr.tool === 'pick') {
            const i = Math.floor(p.y / CELL) * Math.ceil(d.width / CELL) + Math.floor(p.x / CELL);
            pr.onStatus(`Terreno: ${d.terrain[i]} · altura ${d.elevation[i]}`);
            pr.onPick(d.terrain[i], d.elevation[i]);
          } else if (['symbol', 'token', 'label'].includes(pr.tool)) {
            const working = cloneForStroke(d, false),
              changed = addStamp(working, p);
            gesture.current = { type: 'stamp', base: d, doc: working, last: p, changed };
          } else if (['route', 'region', 'measure'].includes(pr.tool)) {
            const next = aligned(p);
            if (pr.tool === 'measure' && points.current.length === 2) points.current = [];
            if (points.current.length >= 300) {
              pr.onStatus('Limite de 300 pontos. Conclua o traçado.');
              return;
            }
            if (
              !points.current.length ||
              Math.hypot(points.current.at(-1)!.x - next.x, points.current.at(-1)!.y - next.y) >
                2 / view.current.zoom
            )
              points.current.push(next);
            draw();
          } else if (pr.tool === 'select') {
            const selected =
              pr.selected.length === 1 ? d.objects.find((o) => o.id === pr.selected[0]) : null;
            if (
              selected &&
              (selected.kind === 'region' ||
                (selected.kind === 'route' && pr.showRoutePoints !== false)) &&
              canDraw(d, FEATURE_LAYER[selected.kind]) &&
              !selected.locked
            ) {
              const a = (-selected.rotation * Math.PI) / 180,
                dx = p.x - selected.x,
                dy = p.y - selected.y,
                q = {
                  x: dx * Math.cos(a) - dy * Math.sin(a),
                  y: dx * Math.sin(a) + dy * Math.cos(a),
                },
                index = selected.points.findIndex(
                  (v) => Math.hypot(v.x - q.x, v.y - q.y) < 9 / view.current.zoom,
                );
              if (index >= 0) {
                gesture.current = {
                  type: 'vertex',
                  base: d,
                  doc: cloneForStroke(d, false),
                  id: selected.id,
                  index,
                  changed: false,
                };
                return;
              }
            }
            const hit = hitFeature(d, p, view.current.zoom);
            if (hit) {
              const ids = e.shiftKey
                ? pr.selected.includes(hit.id)
                  ? pr.selected.filter((id) => id !== hit.id)
                  : [...pr.selected, hit.id]
                : pr.selected.includes(hit.id)
                  ? pr.selected
                  : [hit.id];
              pr.onSelect(ids);
              gesture.current = {
                type: 'move',
                base: d,
                doc: cloneForStroke(d, false),
                from: p,
                ids: ids.filter((id) => {
                  const o = d.objects.find((o) => o.id === id);
                  return o && !o.locked && canDraw(d, FEATURE_LAYER[o.kind]);
                }),
                changed: false,
              };
            } else {
              if (!e.shiftKey) pr.onSelect([]);
              gesture.current = { type: 'box', from: p, to: p, additive: e.shiftKey };
            }
          }
          draw();
        }}
        onPointerMove={(e) => {
          const client = { x: e.clientX, y: e.clientY };
          if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, client);
          const pr = current.current,
            p = world(client),
            g = gesture.current,
            v = view.current;
          hover.current = p;
          if (g?.type === 'pinch' && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()],
              mid = local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            v.zoom = clamp((g.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / g.distance, 0.035, 8);
            v.pan = { x: mid.x - g.anchor.x * v.zoom, y: mid.y - g.anchor.y * v.zoom };
            pr.onZoom(v.zoom);
          } else if (g?.type === 'pan') {
            const q = local(client);
            v.pan = { x: g.pan.x + q.x - g.from.x, y: g.pan.y + q.y - g.from.y };
          } else if (g?.type === 'paint') {
            g.changed = paintLine(g.doc, g.last, p, pr.brush, pr.tool === 'erase') || g.changed;
            g.last = p;
            painter.current?.invalidateTerrain();
          } else if (
            g?.type === 'stamp' &&
            pr.stamp &&
            pr.tool === 'symbol' &&
            Math.hypot(p.x - g.last.x, p.y - g.last.y) >= pr.symbolSize * 0.65
          ) {
            g.changed = addStamp(g.doc, p) || g.changed;
            g.last = p;
          } else if (g?.type === 'move') {
            const q = aligned(p),
              start = pr.snap ? aligned(g.from) : g.from,
              dx = q.x - start.x,
              dy = q.y - start.y;
            for (const id of g.ids) {
              const initial = g.base.objects.find((o) => o.id === id)!,
                o = g.doc.objects.find((o) => o.id === id)!;
              o.x = clamp(initial.x + dx, 0, g.doc.width);
              o.y = clamp(initial.y + dy, 0, g.doc.height);
            }
            g.changed = Math.abs(dx) + Math.abs(dy) > 0.5;
          } else if (g?.type === 'vertex') {
            const o = g.doc.objects.find((o) => o.id === g.id)!;
            if (o.kind === 'route' || o.kind === 'region') {
              const q = aligned(p),
                a = (-o.rotation * Math.PI) / 180,
                dx = q.x - o.x,
                dy = q.y - o.y;
              o.points[g.index] = {
                x: dx * Math.cos(a) - dy * Math.sin(a),
                y: dx * Math.sin(a) + dy * Math.cos(a),
              };
              g.changed = true;
            }
          } else if (g?.type === 'box') g.to = p;
          if (pr.tool === 'measure' && points.current.length) {
            const ps = points.current.length >= 2 ? points.current : [...points.current, p];
            const distance =
              (ps.slice(1).reduce((n, b, i) => n + Math.hypot(b.x - ps[i].x, b.y - ps[i].y), 0) /
                CELL) *
              pr.document.distancePerCell;
            pr.onStatus(
              `Distância: ${distance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${pr.document.unit}`,
            );
          }
          draw();
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          const g = gesture.current;
          if (g?.type === 'pinch') {
            if (pointers.current.size === 0) gesture.current = null;
            return;
          }
          if (g?.type === 'box') {
            const d = current.current.document,
              left = Math.min(g.from.x, g.to.x),
              right = Math.max(g.from.x, g.to.x),
              top = Math.min(g.from.y, g.to.y),
              bottom = Math.max(g.from.y, g.to.y),
              ids = d.objects
                .filter((o) => {
                  if (!o.visible || o.locked || !canDraw(d, FEATURE_LAYER[o.kind])) return false;
                  const b = featureBounds(o);
                  return (
                    o.x + b.x >= left &&
                    o.x + b.x + b.width <= right &&
                    o.y + b.y >= top &&
                    o.y + b.y + b.height <= bottom
                  );
                })
                .map((o) => o.id);
            current.current.onSelect(
              g.additive ? [...new Set([...current.current.selected, ...ids])] : ids,
            );
          }
          finishGesture();
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          cancel();
        }}
        onPointerLeave={() => {
          if (!gesture.current) {
            hover.current = null;
            draw();
          }
        }}
        onDoubleClick={() => {
          if (['route', 'region'].includes(current.current.tool)) finishPath();
        }}
      />
      <p id="atlas-canvas-help" className="sr-only">
        Use a ferramenta selecionada para editar o mapa. Espaço e arraste para navegar; a roda
        aproxima. Rotas e regiões terminam com Enter ou duplo clique. Escape cancela. A seleção
        permite arrastar elementos e pontos de rotas. Shift adiciona elementos à seleção.
      </p>
    </div>
  );
});
