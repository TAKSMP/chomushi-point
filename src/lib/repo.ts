import type { ResultRow, Scores } from './scoring';

export interface Player { id: string; displayName: string; createdAt: string }

export interface ActiveGame {
  sessionId: string;
  playerIds: string[]; // seat order
  scores: Scores;
  startedAt: string;
}

export interface GameResult {
  sessionId: string;
  endedAt: string;
  entries: { playerId: string; seat: number; finalPoints: number }[];
}

export interface Stats { totals: Record<string, number>; results: ResultRow[] }

export interface AuthUser { id: string; email: string | null }

/** Storage backend. SupabaseRepo is the real one; DemoRepo is a local trial mode. */
export interface Repo {
  readonly kind: 'supabase' | 'demo';
  getUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (u: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  ensureFamily(): Promise<string>;

  listPlayers(): Promise<Player[]>;
  addPlayer(name: string): Promise<Player>;
  renamePlayer(id: string, name: string): Promise<void>;
  deletePlayer(id: string): Promise<void>;

  getStats(): Promise<Stats>;

  startGame(sessionId: string, playerIds: string[]): Promise<void>;
  saveProgress(sessionId: string, scores: Scores): Promise<void>;
  getActiveGame(): Promise<ActiveGame | null>;
  abandonGame(sessionId: string): Promise<void>;
  completeGame(sessionId: string, scores: Scores): Promise<GameResult>;
  getGameResult(sessionId: string): Promise<GameResult | null>;
}

export class RepoError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

/** Human (kid-friendly) message for common errors. */
export function friendlyError(e: unknown): string {
  const any = e as { message?: string; code?: string };
  const msg = any?.message ?? String(e);
  if (any?.code === '23505' || /duplicate key|unique/i.test(msg)) return 'おなじ なまえが もう あります';
  if (/Invalid login credentials/i.test(msg)) return 'メールアドレスか パスワードが ちがいます';
  if (/Email not confirmed/i.test(msg)) return 'メールの かくにんが まだです。とどいた メールの リンクを ひらいてね';
  if (/User already registered/i.test(msg)) return 'このメールアドレスは もう とうろくされています';
  if (/Password should be/i.test(msg)) return 'パスワードは 6もじ いじょうに してね';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'インターネットに つながっていません';
  return msg;
}
