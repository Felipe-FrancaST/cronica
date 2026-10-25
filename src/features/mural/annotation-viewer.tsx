'use client';
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import {
  Eraser,
  Hand,
  LockKeyhole,
  MapPin,
  Minus,
  Paintbrush,
  Plus,
  RefreshCw,
  Scan,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { Button, Confirm, ErrorBox, Field, Input, Select } from '@/components/ui';
import { useActionNotice } from '@/components/action-notice';
import { useWorkspace } from '@/hooks/use-workspace';
import { useMedia } from '@/hooks/use-media';
import { rulesFor } from '@/features/sessions/types';
import { useAnnotations } from './use-annotations';
import {
  boundAnnotationPoints,
  normalizedAnnotationPoint,
  type AnnotationPoint,
  type MuralAnnotation,
} from './annotation-model';
import type { MuralItem } from './types';
type Tool = 'pan' | 'stroke' | 'marker' | 'text' | 'erase';
const TOOLS = [
  ['pan', 'Mover imagem', Hand],
  ['stroke', 'Desenhar', Paintbrush],
  ['marker', 'Marcar ponto', MapPin],
  ['text', 'Adicionar texto', Type],
  ['erase', 'Borracha', Eraser],
] as const;
const pathData = (points: AnnotationPoint[], height: number) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${p.x * 1000} ${p.y * height}`).join(' ');
const Graphic = memo(function Graphic({
  row,
  height,
  erase,
  pending,
}: {
  row: MuralAnnotation;
  height: number;
  erase: boolean;
  pending: boolean;
}) {
  const p = row.payload;
  const x = p.kind === 'stroke' ? 0 : p.x * 1000,
    y = p.kind === 'stroke' ? 0 : p.y * height;
  return (
    <g
      data-annotation-id={row.id}
      className={erase ? 'mural-mark-erasable' : undefined}
      opacity={pending ? 0.6 : 1}
      role={erase ? 'button' : undefined}
      tabIndex={erase ? 0 : undefined}
      aria-label={
        erase
          ? `Apagar ${p.kind === 'stroke' ? 'traçado' : p.kind === 'text' ? 'texto' : 'ponto'}${p.kind !== 'stroke' && p.text ? ': ' + p.text : ''}`
          : undefined
      }
    >
      <title>{p.kind === 'stroke' ? 'Traçado' : p.text || 'Ponto marcado'}</title>
      {p.kind === 'stroke' ? (
        <>
          {erase && (
            <path
              d={pathData(p.points, height)}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(18, p.width)}
              strokeLinecap="round"
            />
          )}
          <path
            d={pathData(p.points, height)}
            fill="none"
            stroke={p.color}
            strokeWidth={p.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : p.kind === 'marker' ? (
        <g transform={`translate(${x} ${y})`}>
          <circle r="10" fill={p.color} stroke="#fff" strokeWidth="3" />
          <circle r="3" fill="#fff" />
          {!!p.text && (
            <text
              x="16"
              y="6"
              fontSize="18"
              fill={p.color}
              stroke="#fff"
              strokeWidth="3"
              paintOrder="stroke"
              fontWeight="600"
            >
              {p.text.slice(0, 80)}
            </text>
          )}
        </g>
      ) : (
        <text
          x={x}
          y={y}
          fontSize="22"
          fill={p.color}
          stroke="#fff"
          strokeWidth="3"
          paintOrder="stroke"
          fontWeight="600"
        >
          {p.text
            .match(/.{1,38}(?:\s|$)|.{1,38}/g)
            ?.slice(0, 7)
            .map((line, i) => (
              <tspan key={i} x={x} dy={i ? '1.25em' : 0}>
                {line.trim()}
              </tspan>
            ))}
        </text>
      )}
    </g>
  );
});
export function AnnotationViewer({
  item,
  master,
  archived = false,
  onPendingChange,
}: {
  item: MuralItem;
  master: boolean;
  archived?: boolean;
  onPendingChange(count: number): void;
}) {
  const w = useWorkspace(),
    announce = useActionNotice(),
    src = useMedia(item.image_path);
  const allowed =
    !archived && (master || !!rulesFor(w.data.rules, item.campaign_id).players_can_annotate_mural);
  const board = useAnnotations(item, allowed);
  const [tool, setTool] = useState<Tool>('pan'),
    [color, setColor] = useState('#e5b858'),
    [width, setWidth] = useState(4),
    [text, setText] = useState(''),
    [zoom, setZoom] = useState(1),
    [showMarks, setShowMarks] = useState(true),
    [clearOpen, setClearOpen] = useState(false),
    [size, setSize] = useState({ width: 1000, height: 700 }),
    [imageReady, setImageReady] = useState(false),
    [imageError, setImageError] = useState(false),
    [imageRetry, setImageRetry] = useState(0);
  const viewport = useRef<HTMLDivElement>(null),
    overlay = useRef<SVGSVGElement>(null),
    preview = useRef<SVGPathElement>(null),
    gesture = useRef<{ pointer: number; points: AnnotationPoint[] } | null>(null),
    pan = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null),
    frame = useRef(0);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewportSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const height = (1000 * size.height) / size.width,
    fit = Math.min(
      1,
      viewportSize.height / Math.max(1, (viewportSize.width * size.height) / size.width),
    ),
    writable = board.canWrite && imageReady;
  useEffect(() => {
    onPendingChange(board.pending);
  }, [board.pending, onPendingChange]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      onPendingChange(0);
    },
    [onPendingChange],
  );
  function cancelGesture() {
    gesture.current = null;
    pan.current = null;
    if (preview.current) preview.current.setAttribute('d', '');
  }
  useEffect(() => {
    if (!writable) {
      cancelGesture();
      setTool('pan');
    }
  }, [writable]);
  function point(e: { clientX: number; clientY: number }) {
    return normalizedAnnotationPoint(
      e.clientX,
      e.clientY,
      overlay.current!.getBoundingClientRect(),
    );
  }
  function down(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || !imageReady) return;
    if (tool === 'pan') {
      if (e.pointerType === 'mouse' && viewport.current) {
        pan.current = {
          pointer: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          left: viewport.current.scrollLeft,
          top: viewport.current.scrollTop,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (!writable) return;
    e.preventDefault();
    if (tool === 'erase') {
      const id = (e.target as Element)
        .closest('[data-annotation-id]')
        ?.getAttribute('data-annotation-id');
      if (id) {
        const row = board.rows.find((a) => a.id === id);
        if (row && (master || row.author_id === w.user?.id)) board.erase(id);
        else announce('Você só pode apagar suas próprias marcações.');
      }
      return;
    }
    const p = point(e);
    if (tool === 'text' || tool === 'marker') {
      if (tool === 'text' && !text.trim()) {
        announce('Escreva o texto e clique no mapa para posicioná-lo.');
        return;
      }
      board.add({ kind: tool, color, ...p, text: text.trim() });
      setShowMarks(true);
      return;
    }
    gesture.current = { pointer: e.pointerId, points: [p] };
    e.currentTarget.setPointerCapture(e.pointerId);
    setShowMarks(true);
    if (preview.current) preview.current.setAttribute('d', pathData([p, p], height));
  }
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const drag = pan.current;
    if (drag?.pointer === e.pointerId && viewport.current) {
      viewport.current.scrollLeft = drag.left - (e.clientX - drag.x);
      viewport.current.scrollTop = drag.top - (e.clientY - drag.y);
      return;
    }
    const drawing = gesture.current;
    if (!drawing || drawing.pointer !== e.pointerId || !writable) return;
    const p = point(e),
      old = drawing.points.at(-1)!;
    if (Math.hypot((p.x - old.x) * 1000, (p.y - old.y) * height) < 2) return;
    drawing.points.push(p);
    if (drawing.points.length > 1024) drawing.points = boundAnnotationPoints(drawing.points);
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (gesture.current && preview.current)
          preview.current.setAttribute('d', pathData(gesture.current.points, height));
      });
  }
  function up(e: ReactPointerEvent<SVGSVGElement>) {
    const drawing = gesture.current;
    if (drawing?.pointer === e.pointerId && writable) {
      drawing.points.push(point(e));
      if (
        drawing.points.length === 2 &&
        drawing.points[0].x === drawing.points[1].x &&
        drawing.points[0].y === drawing.points[1].y
      )
        drawing.points[1] = { ...drawing.points[0], x: Math.min(1, drawing.points[0].x + 0.00001) };
      board.add({ kind: 'stroke', color, width, points: boundAnnotationPoints(drawing.points) });
    }
    cancelGesture();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const own = board.rows.filter((a) => a.author_id === w.user?.id && !board.savingIds.has(a.id));
  return (
    <div className="mural-map-viewer">
      <div className="mural-map-toolbar">
        <div className="mural-mark-tools" role="group" aria-label="Ferramentas de marcação">
          {TOOLS.filter(([id]) => id === 'pan' || writable).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={tool === id ? 'is-active' : ''}
              aria-label={label}
              aria-pressed={tool === id}
              title={label}
              onClick={() => {
                cancelGesture();
                setTool(id);
                setShowMarks(true);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="mural-map-zoom" role="group" aria-label="Zoom da imagem">
          <button
            type="button"
            aria-label="Diminuir imagem"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <Minus size={17} />
          </button>
          <output aria-label="Zoom da imagem">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            aria-label="Ampliar imagem"
            disabled={zoom >= 4}
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            aria-label="Enquadrar imagem"
            onClick={() => {
              setZoom(1);
              viewport.current?.scrollTo(0, 0);
            }}
          >
            <Scan size={17} />
          </button>
        </div>
      </div>
      {writable && tool !== 'pan' && (
        <div className="mural-mark-options">
          {tool !== 'erase' && (
            <label className="mural-mark-color">
              Cor{' '}
              <input
                type="color"
                aria-label="Cor da marcação"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
          )}
          {tool === 'stroke' && (
            <Field label="Espessura">
              <Select value={width} onChange={(e) => setWidth(Number(e.target.value))}>
                <option value={2}>Fina</option>
                <option value={4}>Média</option>
                <option value={8}>Grossa</option>
              </Select>
            </Field>
          )}
          {(tool === 'text' || tool === 'marker') && (
            <Field label={tool === 'text' ? 'Texto da marcação' : 'Legenda do ponto (opcional)'}>
              <Input
                value={text}
                maxLength={tool === 'marker' ? 80 : 240}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  tool === 'text' ? 'Escreva e clique no mapa' : 'Ex.: entrada da caverna'
                }
              />
            </Field>
          )}
          <small>
            {tool === 'stroke'
              ? 'Arraste para desenhar.'
              : tool === 'erase'
                ? master
                  ? 'Toque em uma marcação para apagá-la.'
                  : 'Toque em uma marcação sua para apagá-la.'
                : 'Clique no mapa para posicionar.'}
          </small>
        </div>
      )}
      {!writable && !board.loading && (
        <p className="mural-mark-permission">
          <LockKeyhole size={15} />
          {archived
            ? 'Sessão encerrada: mapa disponível para consulta.'
            : board.error
              ? 'Marcações indisponíveis. Atualize para tentar novamente.'
              : 'O mestre não liberou marcações. Você pode explorar o mapa.'}
        </p>
      )}
      <ErrorBox message={board.error} />
      <div
        ref={viewport}
        className={`mural-map-viewport tool-${tool}`}
        aria-label="Visualização do mapa"
        style={{ aspectRatio: `${size.width}/${size.height}` }}
      >
        <div
          className="mural-map-sheet"
          style={{ width: `${fit * zoom * 100}%`, aspectRatio: `${size.width}/${size.height}` }}
        >
          {src && (
            <img
              key={imageRetry}
              src={src}
              alt={item.title}
              draggable={false}
              onLoad={(e) => {
                setSize({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                });
                setImageReady(true);
                setImageError(false);
              }}
              onError={() => {
                setImageError(true);
                setImageReady(false);
              }}
            />
          )}
          <svg
            ref={overlay}
            viewBox={`0 0 1000 ${height}`}
            role="group"
            aria-label="Marcações do mapa"
            style={{ touchAction: tool === 'pan' ? 'pan-x pan-y' : 'none' }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancelGesture}
            onKeyDown={(e) => {
              if (
                tool !== 'erase' ||
                !writable ||
                !['Enter', 'Delete', 'Backspace'].includes(e.key)
              )
                return;
              const id = (e.target as Element)
                .closest('[data-annotation-id]')
                ?.getAttribute('data-annotation-id');
              if (id) {
                e.preventDefault();
                board.erase(id);
              }
            }}
          >
            {showMarks &&
              board.rows.map((row) => (
                <Graphic
                  key={row.id}
                  row={row}
                  height={height}
                  erase={tool === 'erase' && writable && (master || row.author_id === w.user?.id)}
                  pending={board.savingIds.has(row.id)}
                />
              ))}
            <path
              ref={preview}
              fill="none"
              stroke={color}
              strokeWidth={width}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          </svg>
          {(!src || !imageReady) && (
            <div className="mural-map-loading" role="status">
              {imageError
                ? 'Não foi possível abrir a imagem. Use Atualizar mapa.'
                : 'Carregando mapa…'}
            </div>
          )}
        </div>
      </div>
      <div className="mural-mark-footer">
        <label>
          <input
            type="checkbox"
            checked={showMarks}
            onChange={(e) => setShowMarks(e.target.checked)}
          />{' '}
          Mostrar marcações ({board.rows.length})
        </label>
        {master && !archived && (
          <Link href={`/campanhas/${item.campaign_id}/regras`}>
            {rulesFor(w.data.rules, item.campaign_id).players_can_annotate_mural
              ? 'Jogadores podem marcar · configurar'
              : 'Somente o mestre marca · liberar jogadores'}
          </Link>
        )}
        <span role="status">
          {board.pending
            ? board.failed
              ? `${board.failed} marcação(ões) não salva(s)`
              : 'Salvando marcações…'
            : board.loading
              ? 'Carregando marcações…'
              : 'Marcações sincronizadas'}
        </span>
        <div>
          {board.failed > 0 && (
            <Button type="button" variant="secondary" disabled={!writable} onClick={board.retry}>
              Tentar salvar novamente
            </Button>
          )}
          {writable && (
            <Button
              type="button"
              variant="ghost"
              aria-label="Desfazer minha última marcação"
              disabled={!own.length}
              onClick={() => board.erase(own.at(-1)!.id)}
            >
              <Undo2 size={16} /> Desfazer minha marcação
            </Button>
          )}
          {master && writable && (
            <Button
              type="button"
              variant="ghost"
              disabled={!board.rows.length || !!board.pending}
              onClick={() => setClearOpen(true)}
            >
              <Trash2 size={16} /> Limpar marcações
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            aria-label="Atualizar mapa"
            onClick={() => {
              void board.refresh();
              if (imageError) setImageRetry((n) => n + 1);
            }}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>
      <Confirm
        open={clearOpen}
        onCancel={() => setClearOpen(false)}
        title="Limpar todas as marcações?"
        description="Isso remove os desenhos, pontos e textos de todos neste mapa. A imagem original permanece intacta."
        confirmLabel="Limpar marcações"
        onConfirm={() => {
          board.clear();
          setClearOpen(false);
        }}
      />
    </div>
  );
}
