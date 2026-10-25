'use client';
import { useEffect, useRef, useState } from 'react';
import { ErrorBox } from '@/components/ui';
import { AssetLibraryPicker } from './library';
import { mapAssetFile } from './repository';
import { errorMessage } from '@/lib/utils';
export function BackgroundLibraryPicker({
  onChoose,
  onBusyChange,
  disabled = false,
}: {
  onChoose(file: File): void;
  onBusyChange?(busy: boolean): void;
  disabled?: boolean;
}) {
  const lock = useRef(false),
    mounted = useRef(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onBusyChange?.(false);
    };
  }, [onBusyChange]);
  return (
    <fieldset className="map-asset-fetch" disabled={disabled || busy}>
      <AssetLibraryPicker
        kind="background"
        backgrounds
        onSelect={(asset) => {
          if (lock.current || disabled) return;
          lock.current = true;
          setBusy(true);
          onBusyChange?.(true);
          setError(null);
          void mapAssetFile(asset)
            .then((file) => {
              if (mounted.current) onChoose(file);
            })
            .catch((e) => {
              if (mounted.current) setError(errorMessage(e));
            })
            .finally(() => {
              lock.current = false;
              if (mounted.current) {
                setBusy(false);
                onBusyChange?.(false);
              }
            });
        }}
      />
      {busy && <p role="status">Carregando fundo…</p>}
      <ErrorBox message={error} />
    </fieldset>
  );
}
