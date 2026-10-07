'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';

const Context = createContext<(message: string) => void>(() => {});
export const useActionNotice = () => useContext(Context);

export function ActionNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ message: string; sequence: number } | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const announce = useCallback(
    (message: string) =>
      setNotice((previous) => ({ message, sequence: (previous?.sequence ?? 0) + 1 })),
    [],
  );
  useEffect(() => {
    const update = () => setHost(document.fullscreenElement ?? document.body);
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <Context.Provider value={announce}>
      {children}
      {notice &&
        host &&
        createPortal(
          <div className="action-notice" role="status" aria-live="polite" key={notice.sequence}>
            <Info size={20} aria-hidden />
            <span>{notice.message}</span>
            <button type="button" aria-label="Fechar aviso" onClick={() => setNotice(null)}>
              <X size={18} />
            </button>
          </div>,
          host,
        )}
    </Context.Provider>
  );
}

// Native fields keep their disabled semantics. The surrounding area explains
// why they cannot be edited when the user tries to interact with them.
export function BlockedActionScope({
  children,
  reason,
  className,
}: {
  children: ReactNode;
  reason?: string | null;
  className?: string;
}) {
  const announce = useActionNotice();
  return (
    <div
      className={className}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement;
        const control = target.closest<HTMLElement>('input, select, textarea, button, label');
        const field = control?.matches('label')
          ? control.querySelector<HTMLElement>('input')
          : control;
        if (field?.matches(':disabled')) {
          event.stopPropagation();
          announce(
            field.dataset.disabledReason ||
              field.title ||
              reason ||
              'Este campo está bloqueado. Confira as instruções desta seção.',
          );
        }
      }}
    >
      {children}
    </div>
  );
}
