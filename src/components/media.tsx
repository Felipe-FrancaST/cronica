'use client';
import { useId } from 'react';
import { useMedia } from '@/hooks/use-media';
import { initials, cx } from '@/lib/utils';
import { ImagePlus } from 'lucide-react';
import { validateImage } from '@/services/storage';
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
  return (
    <span className={cx('avatar', `avatar-${size}`)}>
      {src ? <img src={src} alt={name} /> : initials(name)}
    </span>
  );
}
export function Cover({
  path,
  name,
  className,
}: {
  path: string | null;
  name: string;
  className?: string;
}) {
  const src = useMedia(path);
  return (
    <div className={cx('cover-image', className)}>
      {src ? (
        <img src={src} alt={`Capa de ${name}`} />
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
}: {
  onChange(file: File | null): void;
  onError(message: string): void;
  current?: string | null;
  label?: string;
}) {
  const hintId = useId();
  return (
    <label className="image-field">
      <ImagePlus size={20} />
      <span>{current ? 'Trocar imagem' : label}</span>
      <small id={hintId}>JPG, PNG ou WebP · até 5 MB</small>
      <input
        type="file"
        aria-label={label}
        aria-describedby={hintId}
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f) {
            try {
              validateImage(f);
              onChange(f);
            } catch (error) {
              onError(error instanceof Error ? error.message : 'Imagem inválida');
              e.target.value = '';
            }
          } else onChange(null);
        }}
      />
    </label>
  );
}
