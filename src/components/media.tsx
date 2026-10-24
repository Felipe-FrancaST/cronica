'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useMedia } from '@/hooks/use-media';
import { initials, cx } from '@/lib/utils';
import { ImagePlus, Crop, LoaderCircle } from 'lucide-react';
import { Button } from './ui';
import { validateImage } from '@/services/storage';
const ImageCropper = dynamic(() => import('@/features/media/image-cropper'), {
  loading: () => <p role="status">Abrindo o ajuste da imagem…</p>,
});
export function Avatar({
  name,
  path,
  size = 'normal',
}: {
  name: string;
  path?: string | null;
  size?: 'small' | 'normal' | 'large';
}) {
  const src = useMedia(path ?? null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span className={cx('avatar', `avatar-${size}`)}>
      {src && src !== failedSrc ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
export function Cover({
  path,
  name,
  className,
  eager = false,
}: {
  path: string | null;
  name: string;
  className?: string;
  eager?: boolean;
}) {
  const src = useMedia(path);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className={cx('cover-image', className)}>
      {src && src !== failedSrc ? (
        <img
          src={src}
          alt={`Capa de ${name}`}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className="cover-fallback">
          <ImagePlus size={32} />
        </div>
      )}
    </div>
  );
}
export function ImageField({
  onChange,
  onError,
  current,
  label = 'Escolher imagem',
  aspect = 1,
  avatar = false,
  value,
  maxBytes = 5 * 1024 * 1024,
  maxSide = 2048,
  disabled = false,
  trigger,
}: {
  trigger?: ReactNode;
  onChange(file: File | null): void;
  onError(message: string): void;
  current?: string | null;
  label?: string;
  aspect?: number | 'original';
  avatar?: boolean;
  value?: File | null;
  maxBytes?: number;
  maxSide?: number;
  disabled?: boolean;
}) {
  const hintId = useId();
  const resolved = useMedia(current ?? null);
  const [candidate, setCandidate] = useState<File | null>(null),
    [loading, setLoading] = useState(false);
  const original = useRef<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<File | null>(null);
  const selected = value === undefined ? prepared : value;
  const check = (f: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
      throw new Error('Use uma imagem JPG, PNG ou WebP.');
    if (!f.size || f.size > maxBytes)
      throw new Error(`Escolha uma imagem de até ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  };
  async function adjust() {
    if (disabled || loading) return;
    if (selected) {
      setCandidate(original.current ?? selected);
      return;
    }
    if (!resolved) {
      onError('A imagem ainda não está disponível. Aguarde e tente novamente.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(resolved, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Não foi possível abrir a imagem atual.');
      const blob = await response.blob();
      const file = new File([blob], 'imagem-atual', { type: blob.type });
      check(file);
      setCandidate(file);
    } catch {
      onError('Não foi possível abrir a imagem atual. Tente novamente ou escolha outro arquivo.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="image-field-group">
      <label
        className={trigger ? 'image-field portrait-picker' : 'image-field'}
        role={trigger ? 'button' : undefined}
        tabIndex={trigger && !disabled ? 0 : undefined}
        aria-label={trigger ? label : undefined}
        onKeyDown={(event) => {
          if (trigger && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            input.current?.click();
          }
        }}
      >
        {trigger ?? <ImagePlus size={20} />}
        <span className={trigger ? 'sr-only' : undefined}>{current ? 'Trocar imagem' : label}</span>
        <small className={trigger ? 'sr-only' : undefined} id={hintId}>
          JPG, PNG ou WebP · até {Math.round(maxBytes / 1024 / 1024)} MB · ajuste antes de salvar
        </small>
        <input
          ref={input}
          type="file"
          disabled={disabled || loading}
          aria-label={trigger ? 'Adicionar retrato' : label}
          aria-describedby={hintId}
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f) {
              try {
                check(f);
                setCandidate(f);
              } catch (error) {
                onError(error instanceof Error ? error.message : 'Imagem inválida');
                e.target.value = '';
              }
            }
            e.target.value = '';
          }}
        />
      </label>
      {(selected || current) && (
        <Button type="button" variant="ghost" onClick={adjust} disabled={disabled || loading}>
          {loading ? <LoaderCircle className="spin" size={16} /> : <Crop size={16} />}
          {selected ? 'Ajustar recorte' : 'Ajustar imagem atual'}
        </Button>
      )}
      {selected && (
        <small className="subtle">
          {selected.name} · recorte preparado. Salve o formulário para aplicar a imagem.
        </small>
      )}
      {candidate && (
        <ImageCropper
          file={candidate}
          aspect={aspect}
          avatar={avatar}
          maxSide={maxSide}
          onClose={() => setCandidate(null)}
          onApply={(result) => {
            try {
              validateImage(result);
              original.current = candidate;
              setPrepared(result);
              onChange(result);
              setCandidate(null);
            } catch (error) {
              onError(error instanceof Error ? error.message : 'Imagem inválida.');
            }
          }}
        />
      )}
    </div>
  );
}
