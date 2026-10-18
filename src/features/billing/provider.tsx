'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { getSupabase } from '@/lib/supabase/client';
import type { BillingContext } from './types';
import { demoBillingContext } from './model';
interface State {
  data: BillingContext | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<BillingContext | null>;
}
const Context = createContext<State | null>(null);
export function BillingProvider({ children }: { children: ReactNode }) {
  const w = useWorkspace(),
    userId = w.user?.id;
  const generation = useRef(0);
  const [loaded, setLoaded] = useState<{ id: string; data: BillingContext } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const own = ++generation.current;
    if (!userId) {
      setLoaded(null);
      setLoading(false);
      setError(null);
      return null;
    }
    if (w.demo) {
      const data = demoBillingContext();
      setLoaded({ id: userId, data });
      setLoading(false);
      setError(null);
      return data;
    }
    try {
      const { data, error } = await getSupabase().rpc('get_billing_context');
      if (error) throw error;
      if (
        !data?.access?.master ||
        !data?.access?.player ||
        !data.settings ||
        !Array.isArray(data.plans)
      )
        throw new Error('invalid_billing_context');
      if (own !== generation.current) return null;
      setLoaded({ id: userId, data: data as BillingContext });
      setError(null);
      return data as BillingContext;
    } catch {
      if (own === generation.current) {
        setLoaded(null);
        setError(
          'Não foi possível verificar seu acesso. Tente novamente ou entre em contato com o suporte.',
        );
      }
      return null;
    } finally {
      if (own === generation.current) setLoading(false);
    }
  }, [userId, w.demo]);
  useEffect(() => {
    if (!w.ready) return;
    setLoading(true);
    void refresh();
    return () => {
      generation.current++;
    };
  }, [w.ready, refresh]);
  useEffect(() => {
    if (!userId || w.demo) return;
    const update = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(update, 60000);
    window.addEventListener('focus', update);
    window.addEventListener('cronica:billing-change', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('cronica:billing-change', update);
    };
  }, [userId, w.demo, refresh]);
  return (
    <Context.Provider
      value={{ data: loaded && loaded.id === userId ? loaded.data : null, loading, error, refresh }}
    >
      {children}
    </Context.Provider>
  );
}
export function useBilling() {
  const context = useContext(Context);
  if (!context) throw new Error('BillingProvider ausente.');
  return context;
}
export class BillingApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function billingApi<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(65_000),
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new BillingApiError(
      'A conexão foi interrompida. Confira a situação antes de tentar novamente.',
      'connection_interrupted',
      0,
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new BillingApiError(
      'O serviço não retornou uma resposta válida. Tente novamente em alguns instantes.',
      'invalid_response',
      response.status,
    );
  }
  if (!response.ok)
    throw new BillingApiError(
      data.error ?? 'Não foi possível concluir a operação.',
      data.code ?? 'request_failed',
      response.status,
    );
  return data as T;
}
