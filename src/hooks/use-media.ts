'use client';
import { useEffect, useState } from 'react';
import { resolveImage } from '@/services/storage';
import { useWorkspace } from '@/hooks/use-workspace';
import { localImageSource } from '@/lib/media-path';
export function useMedia(path: string | null) {
  const { demo, user } = useWorkspace();
  const identity = user?.id;
  const [resolved, setResolved] = useState<{
    path: string | null;
    src: string | null;
    identity: string | undefined;
  }>({
    path,
    identity,
    src: localImageSource(path, demo),
  });
  useEffect(() => {
    let active = true;
    const local = localImageSource(path, demo);
    if (!path || local) {
      setResolved((previous) =>
        previous.path === path && previous.identity === identity && previous.src === local
          ? previous
          : { path, src: local, identity },
      );
      return;
    }
    setResolved((previous) =>
      previous.path === path && previous.identity === identity && previous.src === null
        ? previous
        : { path, src: null, identity },
    );
    const refresh = () => {
      void resolveImage(path, demo)
        .then((url) => {
          if (active)
            setResolved((previous) =>
              previous.path === path && previous.identity === identity && previous.src === url
                ? previous
                : { path, src: url, identity },
            );
        })
        .catch(() => {
          if (active) setResolved({ path, src: null, identity });
        });
    };
    refresh();
    const timer = setInterval(refresh, 12 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, demo, identity]);
  return (
    localImageSource(path, demo) ??
    (resolved.path === path && resolved.identity === identity ? resolved.src : null)
  );
}
