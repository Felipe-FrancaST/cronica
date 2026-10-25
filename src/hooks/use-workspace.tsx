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
import { ActionNoticeProvider } from '@/components/action-notice';
import { createRefreshQueue } from '@/lib/refresh-queue';
import { shareWorkspace } from '@/lib/workspace-snapshot';
import { equalJson } from '@/lib/structural-sharing';
import { setMediaIdentity } from '@/services/storage';
import { readBrowserValue, writeBrowserValue, removeBrowserValue } from '@/lib/browser-storage';
import { readPreferences, tablePreferenceKey, type Preferences } from '@/lib/preferences';
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
  savePreferences(preferences: Partial<Preferences>): Promise<void>;
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
  const epoch = useRef(0);
  const [identity, setIdentity] = useState(0);
  const repository = demo ? demoRepository : supabaseRepository;
  const changeIdentity = useCallback((id: string | null) => {
    if (activeUser.current === id) return;
    setMediaIdentity(id);
    activeUser.current = id;
    epoch.current++;
    setIdentity(epoch.current);
    setData(empty);
    setError(null);
    setToast(null);
    if (id) setLoading(true);
  }, []);
  const enterDemo = useCallback(() => {
    if (!demoEnabled() || isConfigured()) return;
    writeBrowserValue('cronica:demo-active', 'true');
    setDemo(true);
    changeIdentity(DEMO_USER_ID);
    setUser(createDemoWorkspace().profiles.find((p) => p.id === DEMO_USER_ID)!);
    const stored = readBrowserValue(`cronica:mode:${DEMO_USER_ID}`);
    setMode(stored === 'player' ? 'player' : 'master');
    setReady(true);
  }, [changeIdentity]);
  useEffect(() => {
    if (!isConfigured()) {
      if (demoEnabled() && readBrowserValue('cronica:demo-active') !== 'false') enterDemo();
      else {
        setLoading(false);
        setReady(true);
      }
      return;
    }
    const s = getSupabase();
    let active = true;
    let authRevision = 0;
    const setAuthUser = (id?: string, email?: string, name?: string) => {
      if (!active) return;
      const changed = activeUser.current !== (id ?? null);
      changeIdentity(id ?? null);
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
        if (changed) {
          const stored = readBrowserValue(`cronica:mode:${id}`);
          setMode(stored === 'master' || stored === 'player' ? stored : null);
        }
      } else {
        setUser(null);
        setMode(null);
        setData(empty);
        setLoading(false);
      }
      setReady(true);
    };
    const initialRevision = authRevision;
    void s.auth
      .getUser()
      .then(({ data, error }) => {
        if (!active || initialRevision !== authRevision) return;
        if (error && !data.user) setAuthUser();
        else setAuthUser(data.user?.id, data.user?.email, data.user?.user_metadata?.name);
      })
      .catch(() => {
        if (!active || initialRevision !== authRevision) return;
        setAuthUser();
        setError('Não foi possível verificar sua sessão. Confira a conexão e entre novamente.');
      });
    const { data: listener } = s.auth.onAuthStateChange((_event, session) => {
      authRevision++;
      setAuthUser(session?.user.id, session?.user.email, session?.user.user_metadata?.name);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [enterDemo, changeIdentity]);
  const userId = user?.id;
  const queue = useMemo(() => {
    const current = epoch.current;
    const live = () => !!userId && activeUser.current === userId && epoch.current === current;
    return createRefreshQueue(() => repository.load(), {
      onData(result) {
        if (!live()) return;
        setData((previous) => shareWorkspace(previous, result));
        setError(null);
        const profile = result.profiles.find((p) => p.id === userId);
        if (profile) setUser((previous) => (equalJson(previous, profile) ? previous : profile));
      },
      onError(error) {
        if (live()) setError(errorMessage(error));
      },
      onSettled() {
        if (live()) setLoading(false);
      },
    });
  }, [userId, repository, identity]);
  const refresh = useCallback(
    () => (userId ? queue.refresh() : Promise.resolve()),
    [userId, queue],
  );
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void refresh().catch(() => {});
    return () => queue.cancel();
  }, [userId, refresh, queue]);
  useEffect(() => {
    if (!userId || demo) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => {
      if (document.visibilityState !== 'visible' || timeout) return;
      timeout = setTimeout(() => {
        timeout = undefined;
        void refresh().catch(() => {});
      }, 150);
    };
    const timer = setInterval(onFocus, 30000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onFocus);
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
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      onFocus,
    );
    channel.subscribe();
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      void getSupabase().removeChannel(channel);
    };
  }, [userId, demo, refresh]);
  const preferences = readPreferences(user?.preferences);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = preferences.text_size;
    root.dataset.motion = preferences.motion;
    return () => {
      delete root.dataset.textSize;
      delete root.dataset.motion;
    };
  }, [preferences.text_size, preferences.motion]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const chooseMode = useCallback(
    (value: Mode) => {
      setMode(value);
      if (userId) writeBrowserValue(`cronica:mode:${userId}`, value);
    },
    [userId],
  );
  const logout = useCallback(async () => {
    if (demo) writeBrowserValue('cronica:demo-active', 'false');
    else {
      const { error } = await getSupabase().auth.signOut();
      if (error) throw error;
    }
    queue.cancel();
    changeIdentity(null);
    setUser(null);
    setMode(null);
    setDemo(false);
    setData(empty);
    setLoading(false);
    setError(null);
    setToast(null);
  }, [demo, queue, changeIdentity]);
  const perform = useCallback(
    async (action: (repo: WorkspaceRepository) => Promise<void>, message: string) => {
      const current = epoch.current;
      setToast(null);
      await action(repository);
      if (epoch.current !== current) return;
      // A confirmed save remains successful even if the subsequent read loses connection.
      // The workspace error offers a retry without repeating the mutation.
      await refresh().catch(() => {});
      if (epoch.current !== current) return;
      setToast(message);
    },
    [repository, refresh],
  );
  const savePreferences = useCallback(
    async (patch: Partial<Preferences>) => {
      if (!userId) throw new Error('Entre na sua conta para salvar as configurações.');
      const current = epoch.current;
      const next = await repository.savePreferences(patch);
      if (activeUser.current !== userId || epoch.current !== current) return;
      queue.cancel();
      setLoading(false);
      setUser((profile) => (profile?.id === userId ? { ...profile, preferences: next } : profile));
      setData((data) => ({
        ...data,
        profiles: data.profiles.map((profile) =>
          profile.id === userId ? { ...profile, preferences: next } : profile,
        ),
      }));
      for (const key of ['view', 'quality', 'dice'] as const)
        removeBrowserValue(tablePreferenceKey(userId, key));
      setError(null);
    },
    [userId, repository, queue],
  );
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
      savePreferences,
      perform,
      notify: setToast,
    }),
    [
      data,
      user,
      mode,
      demo,
      ready,
      loading,
      error,
      toast,
      repository,
      refresh,
      enterDemo,
      chooseMode,
      logout,
      perform,
      savePreferences,
    ],
  );
  return (
    <Context.Provider value={value}>
      <ActionNoticeProvider>{children}</ActionNoticeProvider>
    </Context.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('WorkspaceProvider não encontrado.');
  return value;
}
