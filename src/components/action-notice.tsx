'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';

type Tone = 'info' | 'error' | 'success';
const NO_NOTICE = () => {};
const Context = createContext<(message: string, tone?: Tone) => void>(NO_NOTICE);
export const useActionNoticeAvailable = () => useContext(Context) !== NO_NOTICE;
export const useActionNotice = () => useContext(Context);

export function ActionNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ message: string; sequence: number; tone: Tone } | null>(
    null,
  );
  const [host, setHost] = useState<Element | null>(null);
  const announce = useCallback(
    (message: string, tone: Tone = 'info') =>
      setNotice((previous) => ({ message, tone, sequence: (previous?.sequence ?? 0) + 1 })),
    [],
  );
  useEffect(() => {
    const update = () => setHost(document.fullscreenElement ?? document.body);
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    if (!notice || notice.tone === 'error') return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <Context.Provider value={announce}>
      {children}
      {notice &&
        host &&
        createPortal(
          <div
            className={`action-notice is-${notice.tone}${notice.tone === 'success' ? ' toast success-box' : notice.tone === 'error' ? ' error-box' : ''}`}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
            key={notice.sequence}
          >
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
