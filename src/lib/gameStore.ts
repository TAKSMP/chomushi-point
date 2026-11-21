// Local, per-device helpers that make the cloud writes resilient:
//  - active game cache: survives reloads / brief offline periods
//  - pending completions: "ゲーム終了" is queued and retried until the
//    (idempotent) complete_game RPC succeeds, so totals are added exactly once.
import type { ActiveGame, Repo } from './repo';
import type { Scores } from './scoring';

const ACTIVE = 'chomushi-active-game';
const PENDING = 'chomushi-pending-completions';

export interface CachedGame extends ActiveGame { synced: boolean; savedAt: number }

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function write(key: string, v: unknown) {
  try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota */ }
}

export const activeCache = {
  get: () => read<CachedGame | null>(ACTIVE, null),
  set: (g: CachedGame | null) => write(ACTIVE, g),
};

export interface PendingCompletion { sessionId: string; playerIds: string[]; scores: Scores; queuedAt: number }

export const pending = {
  list: () => read<PendingCompletion[]>(PENDING, []),
  add(p: PendingCompletion) {
    const all = pending.list().filter((x) => x.sessionId !== p.sessionId);
    all.push(p); write(PENDING, all);
  },
  remove(sessionId: string) { write(PENDING, pending.list().filter((x) => x.sessionId !== sessionId)); },
  has: (sessionId: string) => pending.list().some((x) => x.sessionId === sessionId),
};

let flushing: Promise<number> | null = null;
/** Retries queued completions. Returns how many were stored. */
export function flushPending(repo: Repo): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let done = 0;
    for (const p of pending.list()) {
      try {
        await repo.startGame(p.sessionId, p.playerIds); // idempotent; covers games started offline
        await repo.completeGame(p.sessionId, p.scores);
        pending.remove(p.sessionId);
        done++;
      } catch (e) {
        const msg = (e as { message?: string })?.message ?? '';
        // the game no longer exists (e.g. all its players were deleted) → drop it
        if (/session not found|unknown player|forbidden/i.test(msg)) pending.remove(p.sessionId);
        else break;
      }
    }
    return done;
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Pick the freshest copy of the in-progress game (cloud vs. this device). */
export function reconcileActive(cloud: ActiveGame | null): ActiveGame | null {
  const local = activeCache.get();
  if (local && pending.has(local.sessionId)) { activeCache.set(null); return cloud && cloud.sessionId !== local.sessionId ? cloud : null; }
  if (cloud && local && local.sessionId === cloud.sessionId && !local.synced) {
    return { ...cloud, scores: { ...cloud.scores, ...pick(local.scores, cloud.playerIds) } };
  }
  if (!cloud && local && !local.synced) return local; // offline start not yet uploaded
  return cloud;
}

function pick(s: Scores, ids: string[]): Scores {
  return Object.fromEntries(ids.filter((id) => id in s).map((id) => [id, s[id]]));
}
