'use client';
import { drawFog, fogCells } from './fog';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  calculateMovementCost,
  createMovementContext,
  convertDistance,
  pathDistanceInCells,
  reachableCells,
} from './movement';
import type { BattleToken, GridPoint, MovementResult } from './types';
import type { TacticalViewportProps } from './viewport-types';
import { canControlToken, tokenAtCell } from './interaction';
import { factionColor, effectBoundary } from './effects';
import { sceneryMovementCells, sceneryPreview } from './scenery';
import { drawScenery2D } from './scenery-art';
import { terrainPreview } from './terrain-brush';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function TacticalCanvas(props: TacticalViewportProps) {
  const {
    map,
    cells: terrainCells,
    tokens,
    master,
    selectedTokenId,
    onSelectToken,
    terrainTool,
    backgroundUrl,
    tokenUrls,
    forceMove,
    disabled,
  } = props;
  const cells = useMemo(
    () => sceneryMovementCells(terrainCells, props.objects ?? []),
    [terrainCells, props.objects],
  );
  const sceneryTextures = useRef(new Map<string, HTMLCanvasElement>());
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 900, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [hoverCell, setHoverCell] = useState<GridPoint | null>(null);
  const brushPreview =
    terrainPreview(
      map,
      hoverCell,
      terrainTool,
      props.terrainBrushWidth,
      props.terrainBrushHeight,
    ) ?? sceneryPreview(map, hoverCell, props.sceneryBrush);
  const [preview, setPreview] = useState<MovementResult | null>(null);
  const [dragToken, setDragToken] = useState<string | null>(null);
  const [pendingTouchCell, setPendingTouchCell] = useState<GridPoint | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
    lastPinch?: number;
  }>({ startX: 0, startY: 0, panX: 0, panY: 0, moved: false });
  const selected = tokens.find((token) => token.id === selectedTokenId) ?? null;
  const movementContext = useMemo(
    () => createMovementContext(cells, tokens, selected?.id),
    [cells, tokens, selected?.id],
  );
  useEffect(() => setPendingTouchCell(null), [selectedTokenId, map.id]);
  const cellRenderKey = useMemo(
    () =>
      cells
        .map(
          (cell) =>
            `${cell.x}:${cell.y}:${cell.movement_cost}:${cell.blocked ? 1 : 0}:${cell.terrain_type}`,
        )
        .sort()
        .join('|'),
    [cells],
  );
  const mapRenderKey = `${map.id}:${map.width}:${map.height}:${map.cell_size}:${map.background_offset_x}:${map.background_offset_y}:${map.background_scale}:${map.grid_visible ? 1 : 0}:${map.grid_opacity}`;

  const canControl = useCallback(
    (token: BattleToken) => canControlToken(token, props),
    [master, props.userId, props.characterOwners, props.restrictToTurn, props.sessionActiveTokenId],
  );

  const remainingGridCost = useMemo(() => {
    if (!selected) return 0;
    return (
      convertDistance(selected.movement_remaining, selected.movement_unit, map.scale_unit) /
      map.scale_per_cell
    );
  }, [selected, map.scale_per_cell, map.scale_unit]);
  const reachable = useMemo(
    () =>
      selected && canControl(selected) && props.movementLimited && !(forceMove && master)
        ? reachableCells({
            from: selected,
            width: map.width,
            height: map.height,
            cells,
            tokens,
            movingTokenId: selected.id,
            context: movementContext,
            rules: { diagonalRule: map.diagonal_rule },
            maxCost: remainingGridCost,
          })
        : new Map<string, number>(),
    [
      selected,
      canControl,
      props.movementLimited,
      map.width,
      map.height,
      map.diagonal_rule,
      cells,
      tokens,
      movementContext,
      forceMove,
      master,
      remainingGridCost,
    ],
  );

  const fit = useCallback(() => {
    const padding = 36;
    const worldWidth = map.width * map.cell_size;
    const worldHeight = map.height * map.cell_size;
    const nextZoom = clamp(
      Math.min(
        (viewport.width - padding * 2) / worldWidth,
        (viewport.height - padding * 2) / worldHeight,
      ),
      0.08,
      2.5,
    );
    setZoom(nextZoom);
    setPan({
      x: (viewport.width - worldWidth * nextZoom) / 2,
      y: (viewport.height - worldHeight * nextZoom) / 2,
    });
  }, [map.width, map.height, map.cell_size, viewport]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const resize = () =>
      setViewport({
        width: Math.max(1, node.clientWidth),
        height: Math.max(420, node.clientHeight),
      });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    fit();
  }, [fit]);
  useEffect(() => {
    const command = props.cameraCommand;
    if (!command) return;
    if (command.action === 'fit') fit();
    if (command.action === 'zoom-in' || command.action === 'zoom-out') {
      const factor = command.action === 'zoom-in' ? 1.18 : 1 / 1.18;
      const next = clamp(zoom * factor, 0.08, 4);
      setPan({
        x: viewport.width / 2 - ((viewport.width / 2 - pan.x) * next) / zoom,
        y: viewport.height / 2 - ((viewport.height / 2 - pan.y) * next) / zoom,
      });
      setZoom(next);
    }
    if (command.action === 'center')
      setPan({
        x: (viewport.width - map.width * map.cell_size * zoom) / 2,
        y: (viewport.height - map.height * map.cell_size * zoom) / 2,
      });
    if (command.action === 'focus' && selected)
      setPan({
        x: viewport.width / 2 - (selected.x + selected.size / 2) * map.cell_size * zoom,
        y: viewport.height / 2 - (selected.y + selected.size / 2) * map.cell_size * zoom,
      });
    // Commands are one-shot; panning/zooming must not repeat the last command.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.cameraCommand]);

  useEffect(() => {
    if (!selected || !hoverCell || !canControl(selected) || terrainTool !== 'move') {
      setPreview(null);
      return;
    }
    setPreview(
      calculateMovementCost({
        from: selected,
        to: hoverCell,
        width: map.width,
        height: map.height,
        cells,
        tokens,
        movingTokenId: selected.id,
        context: movementContext,
        rules: { diagonalRule: map.diagonal_rule },
        maxCost: !props.movementLimited || (forceMove && master) ? undefined : remainingGridCost,
      }),
    );
  }, [
    selected,
    hoverCell,
    canControl,
    terrainTool,
    map.width,
    map.height,
    map.diagonal_rule,
    cells,
    tokens,
    movementContext,
    forceMove,
    master,
    remainingGridCost,
    props.movementLimited,
  ]);

  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    ctx.fillStyle = '#111710';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    const imageCache = imageCacheRef.current;
    const load = (src: string | null | undefined) => {
      if (!src) return null;
      let image = imageCache.get(src);
      if (!image) {
        image = new Image();
        image.src = src;
        image.onload = () => setPan((current) => ({ ...current }));
        imageCache.set(src, image);
      }
      return image.complete && image.naturalWidth > 0 ? image : null;
    };
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    const cellSize = map.cell_size;
    const worldWidth = map.width * cellSize;
    const worldHeight = map.height * cellSize;
    const bg = load(backgroundUrl);
    if (bg) {
      ctx.globalAlpha = 0.96;
      ctx.drawImage(
        bg,
        map.background_offset_x,
        map.background_offset_y,
        worldWidth * map.background_scale,
        worldHeight * map.background_scale,
      );
      ctx.globalAlpha = 1;
    } else {
      const gradient = ctx.createLinearGradient(0, 0, worldWidth, worldHeight);
      gradient.addColorStop(0, '#283321');
      gradient.addColorStop(1, '#161c14');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, worldWidth, worldHeight);
    }
    for (const cell of terrainCells) {
      const x = cell.x * cellSize;
      const y = cell.y * cellSize;
      ctx.fillStyle = cell.blocked
        ? 'rgba(116,39,35,.58)'
        : cell.movement_cost > 1
          ? 'rgba(157,121,51,.34)'
          : 'rgba(74,112,64,.18)';
      ctx.fillRect(x, y, cellSize, cellSize);
    }
    drawScenery2D(ctx, props.objects ?? [], cellSize, sceneryTextures.current);
    if (map.grid_visible) {
      ctx.strokeStyle = `rgba(226,205,146,${map.grid_opacity})`;
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      for (let x = 0; x <= map.width; x += 1) {
        ctx.moveTo(x * cellSize, 0);
        ctx.lineTo(x * cellSize, worldHeight);
      }
      for (let y = 0; y <= map.height; y += 1) {
        ctx.moveTo(0, y * cellSize);
        ctx.lineTo(worldWidth, y * cellSize);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, [
    viewport.width,
    viewport.height,
    mapRenderKey,
    cellRenderKey,
    pan,
    zoom,
    backgroundUrl,
    props.objects,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    const imageCache = imageCacheRef.current;
    const load = (src: string | null | undefined) => {
      if (!src) return null;
      let image = imageCache.get(src);
      if (!image) {
        image = new Image();
        image.src = src;
        image.onload = () => setPan((current) => ({ ...current }));
        imageCache.set(src, image);
      }
      return image.complete && image.naturalWidth > 0 ? image : null;
    };
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    const cellSize = map.cell_size;
    if (selected && canControl(selected) && !props.targeting && !props.effectPreview) {
      ctx.fillStyle = 'rgba(114,163,92,.13)';
      for (const reachableKey of reachable.keys()) {
        const [x, y] = reachableKey.split(':').map(Number);
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
    if (!props.targeting && preview?.path.length) {
      ctx.fillStyle = preview.allowed ? 'rgba(216,181,91,.35)' : 'rgba(180,58,54,.38)';
      for (const point of preview.path)
        ctx.fillRect(point.x * cellSize, point.y * cellSize, cellSize, cellSize);
    }
    if (brushPreview) {
      ctx.fillStyle = !brushPreview.valid
        ? 'rgba(239,119,119,.48)'
        : brushPreview.kind === 'damage'
          ? 'rgba(238,130,101,.38)'
          : 'rgba(115,200,238,.38)';
      for (const point of brushPreview.cells)
        ctx.fillRect(point.x * cellSize, point.y * cellSize, cellSize, cellSize);
    }
    if (props.effectPreview) {
      ctx.fillStyle = !props.effectPreview.valid
        ? 'rgba(239,119,119,.48)'
        : ['healing', 'temporary'].includes(props.effectPreview.kind)
          ? 'rgba(105,227,169,.48)'
          : props.effectPreview.kind === 'damage'
            ? 'rgba(238,130,101,.48)'
            : 'rgba(115,200,238,.48)';
      for (const point of props.effectPreview.cells)
        ctx.fillRect(point.x * cellSize, point.y * cellSize, cellSize, cellSize);
      ctx.strokeStyle = props.effectPreview.valid ? '#fff4cb' : '#ff5353';
      ctx.lineWidth = Math.max(2, cellSize * 0.055);
      ctx.beginPath();
      for (const [a, b] of effectBoundary(props.effectPreview.cells)) {
        ctx.moveTo(a.x * cellSize, a.y * cellSize);
        ctx.lineTo(b.x * cellSize, b.y * cellSize);
      }
      ctx.stroke();
    }
    for (const token of tokens) {
      const x = (token.x + token.size / 2) * cellSize;
      const y = (token.y + token.size / 2) * cellSize;
      const radius = cellSize * 0.39 * token.size;
      ctx.save();
      ctx.globalAlpha = token.visible ? 1 : 0.42;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.clip();
      const image = load(tokenUrls[token.id]);
      if (image) ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
      else {
        ctx.fillStyle = factionColor(token);
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        ctx.fillStyle = '#f0dfb0';
        ctx.font = `600 ${Math.max(12, cellSize * 0.28)}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(token.name.slice(0, 2).toUpperCase(), x, y);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle =
        token.id === selectedTokenId
          ? '#f0cc68'
          : props.sessionActiveTokenId === token.id
            ? '#81c979'
            : '#1b2118';
      ctx.lineWidth = (token.id === selectedTokenId ? 4 : 3) / zoom;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, radius - 5 / zoom, 0, Math.PI * 2);
      ctx.strokeStyle = factionColor(token);
      ctx.lineWidth = 3 / zoom;
      ctx.stroke();
      ctx.font = `600 ${12 / zoom}px Inter`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelY = y + radius + 5 / zoom;
      const label = token.name;
      const width = ctx.measureText(label).width + 10 / zoom;
      ctx.fillStyle = 'rgba(10,13,9,.82)';
      ctx.fillRect(x - width / 2, labelY, width, 18 / zoom);
      ctx.fillStyle = '#f1e6c5';
      ctx.fillText(label, x, labelY + 2 / zoom);
    }
    drawFog(ctx, props.fog ?? [], cellSize, master);
    if (master && (terrainTool === 'hide' || terrainTool === 'reveal')) {
      ctx.strokeStyle = terrainTool === 'hide' ? '#b39bd5' : '#9ccdab';
      ctx.lineWidth = 2 / zoom;
      for (const f of fogCells(map, hoverCell, props.fogBrushSize ?? 1))
        ctx.strokeRect(f.x * cellSize + 1, f.y * cellSize + 1, cellSize - 2, cellSize - 2);
    }
    ctx.restore();
  }, [
    viewport.width,
    viewport.height,
    map.cell_size,
    tokens,
    selectedTokenId,
    props.sessionActiveTokenId,
    pan,
    zoom,
    tokenUrls,
    reachable,
    preview,
    selected,
    canControl,
    master,
    props.targeting,
    props.effectPreview,
    hoverCell,
    props.sceneryBrush,
    props.terrainBrushWidth,
    props.terrainBrushHeight,
    props.fog,
    props.fogBrushSize,
    terrainTool,
  ]);

  function cellFromClient(clientX: number, clientY: number): GridPoint | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor((clientX - rect.left - pan.x) / zoom / map.cell_size);
    const y = Math.floor((clientY - rect.top - pan.y) / zoom / map.cell_size);
    return x >= 0 && y >= 0 && x < map.width && y < map.height ? { x, y } : null;
  }
  function tokenAt(point: GridPoint | null) {
    return tokenAtCell(tokens, point);
  }

  async function completeMove(token: BattleToken, point: GridPoint | null) {
    if (!point || disabled || !canControl(token)) return;
    const result = calculateMovementCost({
      from: token,
      to: point,
      width: map.width,
      height: map.height,
      cells,
      tokens,
      movingTokenId: token.id,
      rules: { diagonalRule: map.diagonal_rule },
      maxCost:
        !props.movementLimited || (forceMove && master)
          ? undefined
          : convertDistance(token.movement_remaining, token.movement_unit, map.scale_unit) /
            map.scale_per_cell,
    });
    if (!result.allowed || !result.path.length) return;
    await props.onMove(token, point, result.path, forceMove && master);
  }

  function pointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const point = cellFromClient(e.clientX, e.clientY);
    const hit = tokenAt(point);
    gesture.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
    if (pointers.current.size === 2) {
      gesture.current.lastPinch = 0;
      setDragToken(null);
      return;
    }
    if (terrainTool !== 'move' && master) return;
    if (hit && !props.targeting) {
      setPendingTouchCell(null);
      onSelectToken(hit.id);
      if (canControl(hit)) setDragToken(hit.id);
    }
  }
  function pointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    // Hover must keep working so movement previews can be drawn, but panning/dragging
    // is only allowed for pointers that actually started with pointerDown.
    const hover = cellFromClient(e.clientX, e.clientY);
    setHoverCell(hover);
    if (props.targeting) props.onTargetHover?.(hover);
    if (!pointers.current.has(e.pointerId)) return;

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const values = [...pointers.current.values()];
    if (values.length === 2) {
      gesture.current.moved = true;
      const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      const last = gesture.current.lastPinch || distance;
      setZoom((value) => clamp(value * (distance / Math.max(1, last)), 0.08, 4));
      gesture.current.lastPinch = distance;
      return;
    }

    if (gesture.current.lastPinch !== undefined) return;
    const dx = e.clientX - gesture.current.startX,
      dy = e.clientY - gesture.current.startY;
    const dragThreshold = e.pointerType === 'touch' ? 10 : 6;
    const crossedDragThreshold = Math.hypot(dx, dy) > dragThreshold;
    if (crossedDragThreshold) gesture.current.moved = true;

    // Do not nudge/pan the board on an ordinary click. The board only starts
    // following the pointer after the drag threshold has been crossed.
    if (
      crossedDragThreshold &&
      !dragToken &&
      terrainTool === 'move' &&
      !tokenAt(cellFromClient(gesture.current.startX, gesture.current.startY))
    ) {
      setPan({ x: gesture.current.panX + dx, y: gesture.current.panY + dy });
    }
  }
  async function pointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    // Ignore stray pointerup events that did not originate on this canvas.
    if (!pointers.current.has(e.pointerId)) return;

    const point = cellFromClient(e.clientX, e.clientY);
    const hitStart = tokenAt(cellFromClient(gesture.current.startX, gesture.current.startY));
    const wasPinching = pointers.current.size > 1 || gesture.current.lastPinch !== undefined;
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!pointers.current.size) gesture.current.lastPinch = undefined;

    // A pinch gesture must never finish as a token move or a cell click.
    if (wasPinching) {
      setDragToken(null);
      return;
    }

    if (props.targeting && !gesture.current.moved && point) {
      props.onTarget?.(point, tokenAt(point)?.id ?? null);
      setPendingTouchCell(null);
    } else if (terrainTool !== 'move' && master && !gesture.current.moved && point) {
      setPendingTouchCell(null);
      await props.onPaint(point, terrainTool);
    } else if (dragToken) {
      const token = tokens.find((t) => t.id === dragToken);
      if (token && gesture.current.moved) await completeMove(token, point);
      setPendingTouchCell(null);
    } else if (!gesture.current.moved && !hitStart && selected && point) {
      if (e.pointerType === 'touch') {
        const confirms = pendingTouchCell?.x === point.x && pendingTouchCell?.y === point.y;
        if (confirms) {
          await completeMove(selected, point);
          setPendingTouchCell(null);
        } else {
          setHoverCell(point);
          setPendingTouchCell(point);
        }
      } else {
        await completeMove(selected, point);
      }
    }
    setDragToken(null);
  }
  function wheel(e: ReactWheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left,
      mouseY = e.clientY - rect.top;
    const worldX = (mouseX - pan.x) / zoom,
      worldY = (mouseY - pan.y) / zoom;
    const next = clamp(zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.08, 4);
    setPan({ x: mouseX - worldX * next, y: mouseY - worldY * next });
    setZoom(next);
  }
  const previewDistance =
    preview && selected
      ? pathDistanceInCells(selected, preview.path, map.diagonal_rule) * map.scale_per_cell
      : 0;
  const previewMovement = preview ? preview.cost * map.scale_per_cell : 0;
  const previewRemaining = selected
    ? Math.max(
        0,
        convertDistance(selected.movement_remaining, selected.movement_unit, map.scale_unit) -
          previewMovement,
      )
    : 0;

  return (
    <div ref={wrapRef} className={`vtt-canvas-wrap ${terrainTool !== 'move' ? 'is-painting' : ''}`}>
      <canvas ref={baseCanvasRef} className="vtt-canvas-base" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="vtt-canvas-overlay"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={(e) => void pointerUp(e)}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (!pointers.current.size) gesture.current.lastPinch = undefined;
          setDragToken(null);
          setPendingTouchCell(null);
        }}
        onWheel={wheel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Mapa tático interativo"
      />
      <div className="vtt-canvas-help">
        {terrainTool === 'move'
          ? 'Clique numa célula para mover · arraste espaço vazio para navegar · scroll/pinça para zoom · arraste seu token para mover'
          : 'Clique/toque em células para pintar o terreno'}
      </div>
      {preview && selected && hoverCell && (
        <div className={`vtt-preview ${preview.allowed ? '' : 'is-invalid'}`}>
          <strong>{preview.distance} células</strong>
          <span>
            Distância {previewDistance.toFixed(1)} {map.scale_unit}
          </span>
          <span>
            Custo {previewMovement.toFixed(1)} {map.scale_unit}
          </span>
          <small>
            {!preview.allowed
              ? preview.reason
              : props.movementLimited
                ? `${pendingTouchCell?.x === hoverCell.x && pendingTouchCell?.y === hoverCell.y ? 'Toque novamente para confirmar · ' : ''}Restante ${previewRemaining.toFixed(1)} ${map.scale_unit}`
                : `${pendingTouchCell?.x === hoverCell.x && pendingTouchCell?.y === hoverCell.y ? 'Toque novamente para confirmar · ' : ''}Fora de combate · sem consumo`}
          </small>
        </div>
      )}
    </div>
  );
}
