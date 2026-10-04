'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Box } from 'lucide-react';
import {
  calculateMovementCost,
  convertDistance,
  pathDistanceInCells,
  reachableCells,
} from './movement';
import { canControlToken, movementBudget, sameCell } from './interaction';
import { TacticalSceneEngine } from './scene-engine';
import type { TacticalViewportProps } from './viewport-types';
import type { BattleToken, GridPoint } from './types';

interface Gesture {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  tokenId: string | null;
  hitId: string | null;
  moved: boolean;
  cancelled: boolean;
  navigation: boolean;
}

export function TacticalScene(props: TacticalViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<TacticalSceneEngine | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const moving = useRef(false);
  const pendingRef = useRef<GridPoint | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<GridPoint | null>(null);
  const [pending, setPending] = useState<GridPoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const [assetError, setAssetError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const navigation = props.navigationMode ?? 'play';
  const selected = props.tokens.find((token) => token.id === props.selectedTokenId) ?? null;
  const canControl = useCallback(
    (token: BattleToken) => canControlToken(token, props),
    [
      props.master,
      props.userId,
      props.characterOwners,
      props.restrictToTurn,
      props.sessionActiveTokenId,
    ],
  );
  const budget = selected ? movementBudget(selected, props) : undefined;
  const preview = useMemo(
    () =>
      selected &&
      hover &&
      canControl(selected) &&
      props.terrainTool === 'move' &&
      navigation === 'play' &&
      !props.disabled
        ? calculateMovementCost({
            from: selected,
            to: hover,
            width: props.map.width,
            height: props.map.height,
            cells: props.cells,
            tokens: props.tokens,
            movingTokenId: selected.id,
            rules: { diagonalRule: props.map.diagonal_rule },
            maxCost: budget,
          })
        : null,
    [
      selected,
      hover,
      canControl,
      props.terrainTool,
      navigation,
      props.disabled,
      props.map.width,
      props.map.height,
      props.map.diagonal_rule,
      props.cells,
      props.tokens,
      budget,
    ],
  );
  const reachable = useMemo(
    () =>
      selected && canControl(selected) && budget !== undefined && navigation === 'play'
        ? reachableCells({
            from: selected,
            width: props.map.width,
            height: props.map.height,
            cells: props.cells,
            tokens: props.tokens,
            movingTokenId: selected.id,
            rules: { diagonalRule: props.map.diagonal_rule },
            maxCost: budget,
          })
        : new Map<string, number>(),
    [
      selected,
      canControl,
      budget,
      navigation,
      props.map.width,
      props.map.height,
      props.map.diagonal_rule,
      props.cells,
      props.tokens,
    ],
  );

  function clearPending() {
    pendingRef.current = null;
    setPending(null);
  }
  function updateHover(point: GridPoint | null) {
    setHover((current) => (sameCell(current, point) || (!current && !point) ? current : point));
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: TacticalSceneEngine;
    try {
      engine = new TacticalSceneEngine(
        host,
        propsRef.current.map,
        propsRef.current.quality ?? 'balanced',
        () => {
          setUnavailable(true);
          propsRef.current.onUnavailable?.();
        },
        () => setAssetError(true),
      );
    } catch {
      setUnavailable(true);
      propsRef.current.onUnavailable?.();
      return;
    }
    engineRef.current = engine;
    setReady(true);
    const canvas = engine.renderer.domElement;

    async function completeMove(token: BattleToken, point: GridPoint | null) {
      const current = propsRef.current;
      if (!point || moving.current || current.disabled || !canControlToken(token, current)) return;
      const result = calculateMovementCost({
        from: token,
        to: point,
        width: current.map.width,
        height: current.map.height,
        cells: current.cells,
        tokens: current.tokens,
        movingTokenId: token.id,
        rules: { diagonalRule: current.map.diagonal_rule },
        maxCost: movementBudget(token, current),
      });
      if (!result.allowed || !result.path.length) return;
      moving.current = true;
      clearPending();
      try {
        await current.onMove(token, point, result.path, current.master && current.forceMove);
      } finally {
        moving.current = false;
      }
    }

    const down = (event: PointerEvent) => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size > 1) {
        if (gesture.current) gesture.current.cancelled = true;
        setDragging(false);
        clearPending();
        updateHover(null);
        return;
      }
      const current = propsRef.current;
      const hit = engine.pick(event.clientX, event.clientY);
      const token = current.tokens.find((item) => item.id === hit.tokenId) ?? null;
      const navigate = (current.navigationMode ?? 'play') !== 'play' || event.button !== 0;
      const canDrag =
        !navigate &&
        !current.targeting &&
        !current.disabled &&
        current.terrainTool === 'move' &&
        token &&
        canControlToken(token, current);
      gesture.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        tokenId: canDrag ? token.id : null,
        hitId: hit.tokenId,
        moved: false,
        cancelled: false,
        navigation: navigate,
      };
      if (!navigate && !current.targeting && current.terrainTool === 'move' && token) {
        current.onSelectToken(token.id);
        clearPending();
      }
      if (navigate) updateHover(null);
      canvas.focus({ preventScroll: true });
    };
    const move = (event: PointerEvent) => {
      const tracked = pointers.current.has(event.pointerId);
      const current = propsRef.current;
      if (tracked) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size > 1 || gesture.current?.cancelled) return;
      const g = gesture.current;
      if (tracked && g) {
        const crossed =
          Math.hypot(event.clientX - g.startX, event.clientY - g.startY) >
          (event.pointerType === 'touch' ? 10 : 6);
        if (crossed) g.moved = true;
        if (g.navigation) return;
        if (g.moved && !g.hitId && current.terrainTool === 'move') {
          // OrbitControls has no primary action in play mode, so a click never nudges the board.
          engine.controls.pan(
            event.clientX - (g.lastX === g.startX ? g.startX : g.lastX),
            event.clientY - (g.lastY === g.startY ? g.startY : g.lastY),
          );
          engine.controls.update();
          g.lastX = event.clientX;
          g.lastY = event.clientY;
          clearPending();
          updateHover(null);
          return;
        }
        if (g.tokenId && g.moved) setDragging(true);
      }
      if ((current.navigationMode ?? 'play') === 'play')
        updateHover(engine.pick(event.clientX, event.clientY).cell);
    };
    const up = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      const g = gesture.current;
      pointers.current.delete(event.pointerId);
      const cancelled = !g || g.cancelled || pointers.current.size > 0 || g.navigation;
      if (!pointers.current.size) gesture.current = null;
      setDragging(false);
      if (cancelled || !g) return;
      const current = propsRef.current;
      if (current.disabled) return;
      const hit = engine.pick(event.clientX, event.clientY);
      if (current.targeting && !g.moved && hit.cell) {
        clearPending();
        current.onTarget?.(hit.cell, hit.tokenId);
      } else if (current.terrainTool !== 'move' && current.master && !g.moved && hit.cell) {
        clearPending();
        void current.onPaint(hit.cell, current.terrainTool).catch(() => {});
      } else if (g.tokenId && g.moved) {
        const token = current.tokens.find((item) => item.id === g.tokenId);
        if (token) void completeMove(token, hit.cell).catch(() => {});
      } else if (!g.moved && !g.hitId && hit.cell) {
        const token = current.tokens.find((item) => item.id === current.selectedTokenId);
        if (!token || !canControlToken(token, current)) return;
        if (event.pointerType === 'touch' && !sameCell(pendingRef.current, hit.cell)) {
          pendingRef.current = hit.cell;
          setPending(hit.cell);
          updateHover(hit.cell);
        } else {
          void completeMove(token, hit.cell).catch(() => {});
        }
      }
    };
    const cancel = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.delete(event.pointerId);
      if (gesture.current) gesture.current.cancelled = true;
      if (!pointers.current.size) gesture.current = null;
      setDragging(false);
      clearPending();
      updateHover(null);
    };
    const leave = () => {
      // Touch sends pointerleave immediately after pointerup. Keep the first-tap
      // destination visible until the player confirms it or changes selection.
      if (!pointers.current.size && !pendingRef.current) updateHover(null);
    };
    const context = (event: Event) => event.preventDefault();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearPending();
        updateHover(null);
      }
      const actions: Record<
        string,
        'zoom-in' | 'zoom-out' | 'fit' | 'rotate-left' | 'rotate-right'
      > = {
        '+': 'zoom-in',
        '=': 'zoom-in',
        '-': 'zoom-out',
        '0': 'fit',
        q: 'rotate-left',
        e: 'rotate-right',
      };
      const action = actions[event.key.toLowerCase()];
      if (action) {
        event.preventDefault();
        engine.command({ sequence: 0, action });
        updateHover(null);
      }
    };
    canvas.addEventListener('pointerdown', down, true);
    canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up, true);
    canvas.addEventListener('pointercancel', cancel, true);
    canvas.addEventListener('lostpointercapture', cancel);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('contextmenu', context);
    canvas.addEventListener('keydown', keydown);
    return () => {
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', cancel, true);
      canvas.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('contextmenu', context);
      canvas.removeEventListener('keydown', keydown);
      pointers.current.clear();
      gesture.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, [props.map.id]);

  const boardKey = `${props.map.width}:${props.map.height}:${props.map.cell_size}:${props.map.grid_visible}:${props.map.grid_opacity}:${props.map.background_offset_x}:${props.map.background_offset_y}:${props.map.background_scale}`;
  useEffect(() => {
    if (!ready) return;
    setAssetError(false);
    engineRef.current?.setBoard(props.map, props.backgroundUrl);
  }, [ready, props.map.id, boardKey, props.backgroundUrl]);
  useEffect(() => {
    if (ready) engineRef.current?.setTerrain(props.cells);
  }, [ready, props.cells]);
  useEffect(() => {
    if (ready)
      engineRef.current?.setTokens(
        props.tokens.filter(
          (token) =>
            props.master ||
            token.visible ||
            canControlToken(token, { ...props, restrictToTurn: false }),
        ),
        props.tokenUrls,
        props.selectedTokenId,
        props.sessionActiveTokenId,
      );
  }, [
    ready,
    props.tokens,
    props.master,
    props.userId,
    props.characterOwners,
    props.tokenUrls,
    props.selectedTokenId,
    props.sessionActiveTokenId,
  ]);
  useEffect(() => {
    if (ready)
      engineRef.current?.setOverlay(
        props.targeting || props.effectPreview ? new Map() : reachable,
        props.targeting ? null : preview,
        selected,
        hover,
        props.effectPreview,
      );
  }, [ready, reachable, preview, selected, hover, props.targeting, props.effectPreview]);
  useEffect(() => {
    if (ready) engineRef.current?.configureNavigation(navigation);
    clearPending();
    updateHover(null);
  }, [ready, navigation, props.terrainTool]);
  useEffect(() => {
    if (ready) engineRef.current?.setQuality(props.quality ?? 'balanced');
  }, [ready, props.quality]);
  useEffect(() => {
    if (ready && props.cameraCommand) {
      engineRef.current?.command(props.cameraCommand);
      clearPending();
      updateHover(null);
    }
  }, [ready, props.cameraCommand]);
  useEffect(() => {
    clearPending();
  }, [props.selectedTokenId, selected?.x, selected?.y, props.disabled]);

  const distance =
    selected && preview
      ? pathDistanceInCells(selected, preview.path, props.map.diagonal_rule) *
        props.map.scale_per_cell
      : 0;
  const cost = preview ? preview.cost * props.map.scale_per_cell : 0;
  const remaining = selected
    ? Math.max(
        0,
        convertDistance(selected.movement_remaining, selected.movement_unit, props.map.scale_unit) -
          cost,
      )
    : 0;
  return (
    <div
      className={`vtt-canvas-wrap vtt-scene-wrap ${navigation !== 'play' ? 'is-navigating' : ''} ${dragging ? 'is-dragging' : ''} ${props.terrainTool !== 'move' ? 'is-painting' : ''}`}
    >
      <div ref={hostRef} className="vtt-scene-host" />
      <div className="vtt-scene-badge">
        <Box size={13} /> MESA 3D{' '}
        <span>
          {props.map.width} × {props.map.height}
        </span>
      </div>
      {unavailable && (
        <div className="vtt-scene-notice" role="status">
          A visualização 3D não está disponível neste aparelho. Use a vista 2D.
        </div>
      )}
      {assetError && (
        <div className="vtt-scene-notice" role="status">
          <AlertTriangle size={14} /> Uma imagem não carregou. A mesa continua disponível.
        </div>
      )}
      <div className="vtt-canvas-help">
        {navigation === 'orbit'
          ? 'Arraste para girar a câmera · pinça/scroll para zoom'
          : navigation === 'pan'
            ? 'Arraste para navegar · pinça/scroll para zoom'
            : props.terrainTool !== 'move'
              ? 'Clique ou toque nas células para pintar o terreno'
              : 'Selecione e mova sua peça · arraste o chão para navegar · botão direito gira · dois dedos navegam'}
      </div>
      {preview && selected && hover && preview.path.length > 0 && (
        <div
          className={`vtt-preview ${preview.allowed ? '' : 'is-invalid'}`}
          role="status"
          aria-live="polite"
        >
          <strong>{preview.distance} células</strong>
          <span>
            Distância {distance.toFixed(1)} {props.map.scale_unit}
          </span>
          <span>
            Custo {cost.toFixed(1)} {props.map.scale_unit}
          </span>
          <small>
            {!preview.allowed
              ? preview.reason
              : `${sameCell(pending, hover) ? 'Toque novamente para confirmar · ' : ''}${props.movementLimited ? `Restante ${remaining.toFixed(1)} ${props.map.scale_unit}` : 'Fora de combate · sem consumo'}`}
          </small>
        </div>
      )}
      {preview && !preview.allowed && !preview.path.length && (
        <div className="vtt-preview is-invalid" role="status">
          {preview.reason}
        </div>
      )}
    </div>
  );
}
