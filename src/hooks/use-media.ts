'use client';
import { useEffect, useState } from 'react';
import { resolveImage } from '@/services/storage';
import { useWorkspace } from '@/hooks/use-workspace';
import { localImageSource } from '@/lib/media-path';
export function useMedia(path: string | null) {
  const { demo } = useWorkspace();
  const [resolved, setResolved] = useState<{ path: string | null; src: string | null }>({
    path,
    src: localImageSource(path, demo),
  });
  useEffect(() => {
    let active = true;
    const local = localImageSource(path, demo);
    if (!path || local) {
      setResolved({ path, src: local });
      return;
    }
    setResolved({ path, src: null });
    const refresh = () => {
      void resolveImage(path, demo)
        .then((url) => {
          if (active) setResolved({ path, src: url });
        })
        .catch(() => {
          if (active) setResolved({ path, src: null });
        });
    };
    refresh();
    const timer = setInterval(refresh, 12 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, demo]);
  return localImageSource(path, demo) ?? (resolved.path === path ? resolved.src : null);
}
