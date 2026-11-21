// おためしモード: Supabase を設定する前に画面を試すためのローカル専用バックエンド。
// 端末間の共有はできません（VITE_DEMO_MODE=true のときだけ有効）。
import type { ActiveGame, AuthUser, GameResult, Player, Repo, Stats } from './repo';
import { RepoError } from './repo';
import { MAX_POINTS, totalsFrom, type Scores } from './scoring';

interface Session { id: string; status: 'in_progress' | 'completed'; startedAt: string; endedAt: string | null; updatedAt: string;
  parts: { playerId: string; seat: number; current: number; final: number | null }[] }
interface DB { players: Player[]; sessions: Session[] }

const KEY = 'chomushi-demo-db';
const USER: AuthUser = { id: 'demo', email: 'おためし' };
const clamp = (n: number) => Math.min(MAX_POINTS, Math.max(0, Math.round(n)));

export class DemoRepo implements Repo {
  readonly kind = 'demo' as const;
  private load(): DB {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '') as DB; } catch { return { players: [], sessions: [] }; }
  }
  private save(db: DB) { localStorage.setItem(KEY, JSON.stringify(db)); }

  async getUser() { return USER; }
  onAuthChange() { return () => {}; }
  async signIn() {}
  async signUp() { return { needsConfirmation: false }; }
  async signOut() {}
  async ensureFamily() { return 'demo'; }

  async listPlayers() { return this.load().players; }
  async addPlayer(name: string) {
    const db = this.load();
    const n = name.trim();
    if (db.players.some((p) => p.displayName === n)) throw new RepoError('duplicate key', '23505');
    const p: Player = { id: crypto.randomUUID(), displayName: n, createdAt: new Date().toISOString() };
    db.players.push(p); this.save(db); return p;
  }
  async renamePlayer(id: string, name: string) {
    const db = this.load();
    const n = name.trim();
    if (db.players.some((p) => p.displayName === n && p.id !== id)) throw new RepoError('duplicate key', '23505');
    const p = db.players.find((x) => x.id === id); if (p) p.displayName = n; this.save(db);
  }
  async deletePlayer(id: string) {
    const db = this.load();
    db.players = db.players.filter((p) => p.id !== id);
    for (const s of db.sessions) s.parts = s.parts.filter((p) => p.playerId !== id);
    db.sessions = db.sessions.filter((s) => s.parts.length > 0);
    this.save(db);
  }
  async getStats(): Promise<Stats> {
    const results = this.load().sessions.filter((s) => s.status === 'completed').flatMap((s) =>
      s.parts.map((p) => ({ sessionId: s.id, playerId: p.playerId, finalPoints: p.final ?? 0, endedAt: s.endedAt! })));
    return { results, totals: totalsFrom(results) };
  }
  async startGame(sessionId: string, playerIds: string[]) {
    const db = this.load();
    if (db.sessions.some((s) => s.id === sessionId)) return;
    const now = new Date().toISOString();
    db.sessions.push({ id: sessionId, status: 'in_progress', startedAt: now, endedAt: null, updatedAt: now,
      parts: playerIds.map((playerId, i) => ({ playerId, seat: i + 1, current: 0, final: null })) });
    this.save(db);
  }
  async saveProgress(sessionId: string, scores: Scores) {
    const db = this.load();
    const s = db.sessions.find((x) => x.id === sessionId);
    if (!s || s.status !== 'in_progress') return;
    for (const p of s.parts) if (p.playerId in scores) p.current = clamp(scores[p.playerId]);
    s.updatedAt = new Date().toISOString(); this.save(db);
  }
  async getActiveGame(): Promise<ActiveGame | null> {
    const s = this.load().sessions.filter((x) => x.status === 'in_progress')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!s) return null;
    return { sessionId: s.id, startedAt: s.startedAt, playerIds: s.parts.map((p) => p.playerId),
      scores: Object.fromEntries(s.parts.map((p) => [p.playerId, p.current])) };
  }
  async abandonGame(sessionId: string) {
    const db = this.load();
    db.sessions = db.sessions.filter((s) => !(s.id === sessionId && s.status === 'in_progress'));
    this.save(db);
  }
  async completeGame(sessionId: string, scores: Scores): Promise<GameResult> {
    const db = this.load();
    const s = db.sessions.find((x) => x.id === sessionId);
    if (!s) throw new RepoError('session not found');
    if (s.status === 'in_progress') {
      for (const p of s.parts) p.final = p.current = clamp(scores[p.playerId] ?? p.current);
      s.status = 'completed'; s.endedAt = new Date().toISOString();
      this.save(db);
    }
    return (await this.getGameResult(sessionId))!;
  }
  async getGameResult(sessionId: string): Promise<GameResult | null> {
    const s = this.load().sessions.find((x) => x.id === sessionId);
    if (!s || s.status !== 'completed') return null;
    return { sessionId, endedAt: s.endedAt!, entries: s.parts.map((p) => ({ playerId: p.playerId, seat: p.seat, finalPoints: p.final ?? 0 })) };
  }
}
