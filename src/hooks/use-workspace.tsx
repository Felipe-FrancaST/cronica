'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Mode, Profile, Workspace, WorkspaceRepository } from '@/types';
import { getSupabase, isConfigured, demoEnabled } from '@/lib/supabase/client';
import { demoRepository } from '@/services/demo-repository';
import { supabaseRepository } from '@/services/supabase-repository';
import { createDemoWorkspace, DEMO_USER_ID } from '@/lib/demo-data';
import { errorMessage } from '@/lib/utils';
const empty: Workspace = {
  profiles: [],
  systems: [],
  campaigns: [],
  members: [],
  characters: [],
  world: [],
  npcs: [],
};
interface ContextValue {
  data: Workspace;
  user: Profile | null;
  mode: Mode | null;
  demo: boolean;
  ready: boolean;
  loading: boolean;
  error: string | null;
  toast: string | null;
  repository: WorkspaceRepository;
  chooseMode(mode: Mode): void;
  enterDemo(): void;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  perform(action: (repo: WorkspaceRepository) => Promise<void>, message: string): Promise<void>;
  notify(message: string): void;
}
const Context = createContext<ContextValue | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace>(empty),
    [user, setUser] = useState<Profile | null>(null);
  const [mode, setMode] = useState<Mode | null>(null),
    [demo, setDemo] = useState(false),
    [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [toast, setToast] = useState<string | null>(null);
  const activeUser = useRef<string | null>(null);
  const repository = demo ? demoRepository : supabaseRepository;
  const enterDemo = useCallback(() => {
    if (!demoEnabled() || isConfigured()) return;
    localStorage.setItem('cronica:demo-active', 'true');
    setDemo(true);
    activeUser.current = DEMO_USER_ID;
    setUser(createDemoWorkspace().profiles.find((p) => p.id === DEMO_USER_ID)!);
    setMode((localStorage.getItem(`cronica:mode:${DEMO_USER_ID}`) as Mode) || 'master');
    setReady(true);
  }, []);
  useEffect(() => {
    if (!isConfigured()) {
      if (demoEnabled() && localStorage.getItem('cronica:demo-active') !== 'false') enterDemo();
      else {
        setLoading(false);
        setReady(true);
      }
      return;
    }
    const s = getSupabase();
    let active = true;
    const setAuthUser = (id?: string, email?: string, name?: string) => {
      if (!active) return;
      if (activeUser.current !== (id ?? null)) setData(empty);
      activeUser.current = id ?? null;
      if (id) {
        setUser((prev) =>
          prev?.id === id
            ? prev
            : {
                id,
                name: name || 'Aventureiro',
                email: email || '',
                avatar_path: null,
                preferences: {},
                created_at: new Date().toISOString(),
              },
        );
        const stored = localStorage.getItem(`cronica:mode:${id}`);
        setMode(stored === 'master' || stored === 'player' ? stored : null);
      } else {
        setUser(null);
        setMode(null);
        setData(empty);
        setLoading(false);
      }
      setReady(true);
    };
    void s.auth.getUser().then(({ data, error }) => {
      if (error && !data.user) setAuthUser();
      else setAuthUser(data.user?.id, data.user?.email, data.user?.user_metadata?.name);
    });
    const { data: listener } = s.auth.onAuthStateChange((_event, session) =>
      setAuthUser(session?.user.id, session?.user.email, session?.user.user_metadata?.name),
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [enterDemo]);
  const userId = user?.id;
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await repository.load();
      if (activeUser.current !== userId) return;
      setData(result);
      setError(null);
      const profile = result.profiles.find((p) => p.id === userId);
      if (profile) setUser(profile);
    } catch (e) {
      if (activeUser.current === userId) setError(errorMessage(e));
      throw e;
    } finally {
      if (activeUser.current === userId) setLoading(false);
    }
  }, [userId, repository]);
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void refresh().catch(() => {});
  }, [userId, refresh]);
  useEffect(() => {
    if (!userId || demo) return;
    const onFocus = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => {});
    };
    const timer = setInterval(onFocus, 30000);
    window.addEventListener('focus', onFocus);
    const channel = getSupabase().channel(`workspace-${userId}`);
    [
      'campaign_rules',
      'characters',
      'npcs',
      'campaigns',
      'campaign_members',
      'world_regions',
      'world_cities',
      'world_locations',
    ].forEach((table) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onFocus),
    );
    channel.subscribe();
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      void getSupabase().removeChannel(channel);
    };
  }, [userId, demo, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const chooseMode = (value: Mode) => {
    setMode(value);
    if (user) localStorage.setItem(`cronica:mode:${user.id}`, value);
  };
  const logout = async () => {
    if (demo) localStorage.setItem('cronica:demo-active', 'false');
    else {
      const { error } = await getSupabase().auth.signOut();
      if (error) throw error;
    }
    activeUser.current = null;
    setUser(null);
    setMode(null);
    setDemo(false);
    setData(empty);
    setLoading(false);
    setError(null);
    setToast(null);
  };
  const perform = async (action: (repo: WorkspaceRepository) => Promise<void>, message: string) => {
    await action(repository);
    await refresh();
    setToast(message);
  };
  const value = useMemo(
    () => ({
      data,
      user,
      mode,
      demo,
      ready,
      loading,
      error,
      toast,
      repository,
      chooseMode,
      enterDemo,
      logout,
      refresh,
      perform,
      notify: setToast,
    }),
    [data, user, mode, demo, ready, loading, error, toast, repository, refresh, enterDemo],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('WorkspaceProvider não encontrado.');
  return value;
}
