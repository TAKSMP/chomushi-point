import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushPending } from './lib/gameStore';
import { friendlyError, type Player, type Repo, type Stats } from './lib/repo';

interface AppState {
  repo: Repo;
  players: Player[];
  stats: Stats;
  loaded: boolean;
  syncError: string | null;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
  playerName: (id: string) => string;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider missing');
  return v;
}

export function AppProvider({ repo, children }: { repo: Repo; children: ReactNode }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<Stats>({ totals: {}, results: [] });
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number>(undefined);
  const seq = useRef(0);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    try {
      await repo.ensureFamily();
      await flushPending(repo);
      const [p, s] = await Promise.all([repo.listPlayers(), repo.getStats()]);
      if (my !== seq.current) return;
      setPlayers(p); setStats(s); setSyncError(null);
    } catch (e) {
      if (my === seq.current) setSyncError(friendlyError(e));
    } finally {
      if (my === seq.current) setLoaded(true);
    }
  }, [repo]);

  // Initial load + re-fetch whenever the app comes back to the foreground or online,
  // so every device shows the latest names / totals / history from the cloud.
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onOnline = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onOnline);
    };
  }, [refresh]);

  const playerName = useCallback((id: string) => players.find((p) => p.id === id)?.displayName ?? '？', [players]);

  return (
    <Ctx.Provider value={{ repo, players, stats, loaded, syncError, refresh, toast, playerName }}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
