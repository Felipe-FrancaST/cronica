'use client';
import { useEffect, useRef, useState } from 'react';
interface Entity {
  id: string;
  campaign_id?: string;
  owner_id?: string;
}
interface Draft<T> {
  value: T;
  expected: string | null;
  updated_at: string;
  source_key?: string;
  source_text?: string;
}

export function useEditorDraft<T extends Entity>(
  user: string | undefined,
  scope: string,
  value: T,
  expected: string | null,
  restore: (value: T, expected: string | null) => void,
  enabled = true,
) {
  const [tab] = useState(() => {
    try {
      const old = sessionStorage.getItem('cronica:editor:tab');
      if (old) return old;
      const id = crypto.randomUUID();
      sessionStorage.setItem('cronica:editor:tab', id);
      return id;
    } catch {
      return 'current-tab';
    }
  });
  const prefix = `cronica:editor-draft:v1:${user}:${scope}`;
  const key = prefix + ':' + tab;
  const baseline = useRef(JSON.stringify(value));
  const latest = useRef({ value, expected });
  const consumed = useRef<{ key: string; text: string } | null>(null);
  const saved = useRef(false);
  latest.current = { value, expected };
  const [recovery, setRecovery] = useState<Draft<T> | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    if (!user || !enabled) return;
    try {
      const choices: Draft<T>[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const source = localStorage.key(i);
        if (!source || (source !== prefix && !source.startsWith(prefix + ':'))) continue;
        try {
          const text = localStorage.getItem(source)!;
          const draft = JSON.parse(text) as Draft<T>;
          if (
            draft?.value &&
            /^[\da-f-]{36}$/i.test(draft.value.id) &&
            (scope.includes(':new') || draft.value.id === value.id) &&
            draft.value.campaign_id === value.campaign_id &&
            draft.value.owner_id === value.owner_id &&
            (draft.expected === null || typeof draft.expected === 'string')
          )
            choices.push({ ...draft, source_key: source, source_text: text });
        } catch {
          /* Ignore one malformed draft, keep the others. */
        }
      }
      choices.sort(
        (a, b) =>
          Number(b.source_key === key) - Number(a.source_key === key) ||
          b.updated_at.localeCompare(a.updated_at),
      );
      setRecovery(choices[0] ?? null);
    } catch {
      /* A corrupt optional draft does not prevent editing. */
    }
  }, [key, enabled, user, prefix]);
  useEffect(() => {
    if (!user || !enabled) return;
    if (saved.current) saved.current = false;
    const flush = () => {
      if (saved.current) return;
      if (JSON.stringify(latest.current.value) === baseline.current) return;
      try {
        const text = JSON.stringify({ ...latest.current, updated_at: new Date().toISOString() });
        if (text.length > 512_000) throw new Error('draft_limit');
        localStorage.setItem(key, text);
      } catch {
        setWarning(
          'Não foi possível guardar o rascunho neste navegador. Mantenha esta janela aberta até salvar.',
        );
      }
    };
    const timer = setTimeout(flush, 500);
    window.addEventListener('beforeunload', flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [key, value, expected, user, enabled]);
  function clear() {
    saved.current = true;
    baseline.current = JSON.stringify(latest.current.value);
    try {
      localStorage.removeItem(key);
      if (consumed.current && localStorage.getItem(consumed.current.key) === consumed.current.text)
        localStorage.removeItem(consumed.current.key);
    } catch {
      /* optional storage */
    }
    setRecovery(null);
  }
  return {
    recovery,
    warning,
    clear,
    recover() {
      if (recovery) {
        if (recovery.source_key && recovery.source_text)
          consumed.current = { key: recovery.source_key, text: recovery.source_text };
        restore(recovery.value, recovery.expected);
        setRecovery(null);
      }
    },
  };
}
