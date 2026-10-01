'use client';
import { useEffect, useState } from 'react';
import { resolveImage } from '@/services/storage';
import { useWorkspace } from '@/hooks/use-workspace';
export function useMedia(path: string | null) {
  const { demo } = useWorkspace();
  const [src, setSrc] = useState<string | null>(path?.startsWith('/') ? path : null);
  useEffect(() => {
    let active = true;
    setSrc(path?.startsWith('/') ? path : null);
    const refresh = () => {
      if (path)
        void resolveImage(path, demo)
          .then((url) => {
            if (active) setSrc(url);
          })
          .catch(() => {
            if (active) setSrc(null);
          });
    };
    refresh();
    const timer = setInterval(refresh, 12 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, demo]);
  return src;
}
