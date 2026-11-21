import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { ActiveGame, AuthUser, GameResult, Player, Repo, Stats } from './repo';
import { totalsFrom, type ResultRow, type Scores } from './scoring';

const toUser = (u: User | null | undefined): AuthUser | null => (u ? { id: u.id, email: u.email ?? null } : null);

function check<T = unknown>(res: { data?: unknown; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient;
  private familyId: string | null = null;

  constructor(url: string, publishableKey: string) {
    this.sb = createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'chomushi-auth' },
    });
  }

  async getUser() {
    const { data } = await this.sb.auth.getSession();
    return toUser(data.session?.user);
  }

  onAuthChange(cb: (u: AuthUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, session) => {
      if (!session) this.familyId = null;
      cb(toUser(session?.user));
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string) {
    check(await this.sb.auth.signInWithPassword({ email, password }));
  }

  async signUp(email: string, password: string) {
    const data = check<{ session: unknown }>(await this.sb.auth.signUp({
      email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname },
    }));
    return { needsConfirmation: !data.session };
  }

  async signOut() {
    this.familyId = null;
    await this.sb.auth.signOut();
  }

  async ensureFamily() {
    if (this.familyId) return this.familyId;
    this.familyId = check<string>(await this.sb.rpc('ensure_family'));
    return this.familyId;
  }

  async listPlayers(): Promise<Player[]> {
    const rows = check(await this.sb.from('players').select('id, display_name, created_at')
      .order('created_at', { ascending: true })) as { id: string; display_name: string; created_at: string }[];
    return rows.map((r) => ({ id: r.id, displayName: r.display_name, createdAt: r.created_at }));
  }

  async addPlayer(name: string): Promise<Player> {
    const familyId = await this.ensureFamily();
    const r = check(await this.sb.from('players').insert({ family_id: familyId, display_name: name.trim() })
      .select('id, display_name, created_at').single()) as { id: string; display_name: string; created_at: string };
    return { id: r.id, displayName: r.display_name, createdAt: r.created_at };
  }

  async renamePlayer(id: string, name: string) {
    check(await this.sb.from('players').update({ display_name: name.trim() }).eq('id', id));
  }

  async deletePlayer(id: string) {
    check(await this.sb.rpc('delete_player', { p_player_id: id }));
  }

  async getStats(): Promise<Stats> {
    const results: ResultRow[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const rows = check(await this.sb.from('completed_results')
        .select('session_id, player_id, final_points, ended_at')
        .order('ended_at', { ascending: true }).order('session_id').order('player_id')
        .range(from, from + page - 1)) as { session_id: string; player_id: string; final_points: number; ended_at: string }[];
      for (const r of rows) results.push({ sessionId: r.session_id, playerId: r.player_id, finalPoints: r.final_points, endedAt: r.ended_at });
      if (rows.length < page) break;
    }
    // Totals come from the DB view (recomputed from completed games); fall back to the rows.
    const totals = totalsFrom(results);
    const t = await this.sb.from('player_totals').select('player_id, total_points');
    if (!t.error && t.data) for (const r of t.data as { player_id: string; total_points: number }[]) totals[r.player_id] = Number(r.total_points);
    return { totals, results };
  }

  async startGame(sessionId: string, playerIds: string[]) {
    await this.ensureFamily();
    check(await this.sb.rpc('start_game', { p_session_id: sessionId, p_player_ids: playerIds }));
  }

  async saveProgress(sessionId: string, scores: Scores) {
    check(await this.sb.rpc('save_progress', { p_session_id: sessionId, p_scores: scores }));
  }

  async getActiveGame(): Promise<ActiveGame | null> {
    const rows = check(await this.sb.from('game_sessions')
      .select('id, started_at, game_participants(player_id, seat, current_points)')
      .eq('status', 'in_progress').order('updated_at', { ascending: false }).limit(1)) as {
        id: string; started_at: string; game_participants: { player_id: string; seat: number; current_points: number }[];
      }[];
    const s = rows[0];
    if (!s || s.game_participants.length === 0) return null;
    const parts = [...s.game_participants].sort((a, b) => a.seat - b.seat);
    return {
      sessionId: s.id, startedAt: s.started_at,
      playerIds: parts.map((p) => p.player_id),
      scores: Object.fromEntries(parts.map((p) => [p.player_id, p.current_points])),
    };
  }

  async abandonGame(sessionId: string) {
    check(await this.sb.rpc('abandon_game', { p_session_id: sessionId }));
  }

  async completeGame(sessionId: string, scores: Scores): Promise<GameResult> {
    const rows = check(await this.sb.rpc('complete_game', { p_session_id: sessionId, p_scores: scores })) as
      { player_id: string; seat: number; final_points: number; ended_at: string }[];
    return {
      sessionId, endedAt: rows[0]?.ended_at ?? new Date().toISOString(),
      entries: rows.map((r) => ({ playerId: r.player_id, seat: r.seat, finalPoints: r.final_points })),
    };
  }

  async getGameResult(sessionId: string): Promise<GameResult | null> {
    const rows = check(await this.sb.from('game_sessions')
      .select('id, status, ended_at, game_participants(player_id, seat, final_points)')
      .eq('id', sessionId).limit(1)) as {
        id: string; status: string; ended_at: string | null;
        game_participants: { player_id: string; seat: number; final_points: number | null }[];
      }[];
    const s = rows[0];
    if (!s || s.status !== 'completed' || !s.ended_at) return null;
    return {
      sessionId, endedAt: s.ended_at,
      entries: s.game_participants.sort((a, b) => a.seat - b.seat)
        .map((p) => ({ playerId: p.player_id, seat: p.seat, finalPoints: p.final_points ?? 0 })),
    };
  }
}
