'use client';
import { useEffect, useRef, useState } from 'react';
import { Crop, RotateCw, RefreshCw, LoaderCircle } from 'lucide-react';
import { Button, ErrorBox, Field, Input, Modal, Select } from '@/components/ui';
import {
  cropImageFile,
  cropRectangle,
  constrainCrop,
  rotatedSize,
  INITIAL_CROP,
  type CropState,
} from './crop';

export default function ImageCropper({
  file,
  aspect = 1,
  avatar = false,
  maxSide = 2048,
  onApply,
  onClose,
}: {
  file: File;
  aspect?: number | 'original';
  avatar?: boolean;
  maxSide?: number;
  onApply(file: File): void;
  onClose(): void;
}) {
  const [source, setSource] = useState(''),
    [size, setSize] = useState({ width: 0, height: 0 });
  const [state, setState] = useState<CropState>(INITIAL_CROP),
    [frameRatio, setFrameRatio] = useState('original');
  const [stageSize, setStageSize] = useState({ width: 480, height: 340 });
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; state: CropState } | null>(null);
  const rotated = rotatedSize(size.width, size.height, state.rotation);
  const ratio =
    aspect === 'original'
      ? frameRatio === 'original'
        ? rotated.width / rotated.height || 1
        : Number(frameRatio)
      : aspect;
  const frameWidth = Math.min(stageSize.width * 0.84, stageSize.height * 0.84 * ratio),
    frameHeight = frameWidth / ratio;
  const rect = size.width
    ? cropRectangle(size.width, size.height, ratio, state)
    : { x: 0, y: 0, width: 1, height: 1 };
  const scale = frameWidth / rect.width;
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!stageElement) return;
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stageElement);
    return () => observer.disconnect();
  }, [stageElement]);
  function change(next: CropState) {
    setError(null);
    setState(size.width ? constrainCrop(size.width, size.height, ratio, next) : next);
  }
  async function apply() {
    if (busy || !image.current || !size.width) return;
    setBusy(true);
    setError(null);
    try {
      onApply(await cropImageFile(image.current, file, rect, state.rotation, maxSide));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ajustar a imagem.');
    } finally {
      setBusy(false);
    }
  }
  const imageStyle = {
    width: size.width * scale,
    height: size.height * scale,
    left: stageSize.width / 2 + (rotated.width / 2 - rect.x - rect.width / 2) * scale,
    top: stageSize.height / 2 + (rotated.height / 2 - rect.y - rect.height / 2) * scale,
    transform: `translate(-50%, -50%) rotate(${state.rotation}deg)`,
  };
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Ajustar imagem"
      description="Arraste para posicionar e use o zoom. A moldura mostra a parte exibida; a área escura fica de fora."
      wide
    >
      <div className="image-crop-editor">
        <ErrorBox message={error} />
        {aspect === 'original' && (
          <Field label="Formato do recorte">
            <Select
              value={frameRatio}
              onChange={(e) => {
                setError(null);
                setFrameRatio(e.target.value);
                setState(INITIAL_CROP);
              }}
              disabled={busy}
            >
              <option value="original">Proporção original</option>
              <option value={1}>Quadrado</option>
              <option value={16 / 9}>Panorâmico · 16:9</option>
              <option value={4 / 3}>Horizontal · 4:3</option>
              <option value={3 / 4}>Retrato · 3:4</option>
            </Select>
          </Field>
        )}
        <div
          className="image-crop-stage"
          ref={setStageElement}
          role="application"
          aria-label="Área de recorte da imagem. Arraste ou use as setas para posicionar."
          tabIndex={0}
          onPointerDown={(e) => {
            if (busy || !size.width) return;
            e.preventDefault();
            e.currentTarget.focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, state };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            change({
              ...d.state,
              x: d.state.x - (e.clientX - d.x) / (rotated.width * scale),
              y: d.state.y - (e.clientY - d.y) / (rotated.height * scale),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            if (busy || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
              return;
            e.preventDefault();
            const step = e.shiftKey ? 0.05 : 0.01;
            change({
              ...state,
              x: state.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
              y: state.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0),
            });
          }}
        >
          {source && (
            <img
              ref={image}
              src={source}
              style={imageStyle}
              alt="Imagem original para recorte"
              draggable={false}
              onLoad={(e) => {
                setSize({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                });
                setState(INITIAL_CROP);
              }}
              onError={() =>
                setError('Não foi possível ler a imagem. Escolha outro JPG, PNG ou WebP.')
              }
            />
          )}
          <div
            className="image-crop-frame"
            style={{ width: frameWidth, height: frameHeight }}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <i />
            {avatar && <span className="image-crop-avatar-guide" />}
          </div>
        </div>
        <p className="subtle">
          {avatar
            ? 'A moldura é o arquivo salvo. O círculo indica como o avatar e o token serão exibidos.'
            : 'Somente a área dentro da moldura será salva.'}
        </p>
        <Field label={`Zoom da imagem · ${Math.round(state.zoom * 100)}%`}>
          <Input
            aria-label="Zoom da imagem"
            type="range"
            min={1}
            max={6}
            step={0.01}
            value={state.zoom}
            disabled={busy || !size.width}
            onChange={(e) => change({ ...state, zoom: Number(e.target.value) })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Posição horizontal">
            <Input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={state.x}
              disabled={busy || !size.width}
              onChange={(e) => change({ ...state, x: Number(e.target.value) })}
            />
          </Field>
          <Field label="Posição vertical">
            <Input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={state.y}
              disabled={busy || !size.width}
              onChange={(e) => change({ ...state, y: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="image-crop-tools">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setError(null);
              setState({ ...INITIAL_CROP, rotation: (state.rotation + 90) % 360 });
            }}
          >
            <RotateCw size={16} />
            Girar 90°
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setError(null);
              setState(INITIAL_CROP);
            }}
          >
            <RefreshCw size={16} />
            Centralizar e restaurar
          </Button>
        </div>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar ajuste
          </Button>
          <Button type="button" onClick={apply} disabled={busy || !size.width || !!error}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Crop size={17} />}Usar este
            recorte
          </Button>
        </div>
      </div>
    </Modal>
  );
}
