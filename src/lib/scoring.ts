// Pure game / statistics logic (unit-tested in scoring.test.ts)

export const POINT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 100, 500, 1000, 10000] as const;
export const MAX_POINTS = 1_000_000_000;
export type Mode = 'add' | 'sub';
export type Scores = Record<string, number>;

/** Apply the same value to every selected player. Never below 0. */
export function applyPoints(scores: Scores, selected: Iterable<string>, value: number, mode: Mode): Scores {
  const next = { ...scores };
  for (const id of selected) {
    if (!(id in next)) continue;
    const v = mode === 'add' ? next[id] + value : next[id] - value;
    next[id] = Math.min(MAX_POINTS, Math.max(0, v));
  }
  return next;
}

export interface Ranked<T> { item: T; rank: number }

/** Competition ranking: ties share a rank, next rank skips (1,1,3). */
export function rankBy<T>(items: T[], score: (t: T) => number): Ranked<T>[] {
  const sorted = [...items].sort((a, b) => score(b) - score(a));
  let prevScore: number | null = null;
  let prevRank = 0;
  return sorted.map((item, i) => {
    const s = score(item);
    const rank = prevScore !== null && s === prevScore ? prevRank : i + 1;
    prevScore = s;
    prevRank = rank;
    return { item, rank };
  });
}

// ---------- half-month periods ----------
export interface Period { key: string; year: number; month: number; half: 1 | 2 }

/** 1–15 = 前半(1), 16–月末 = 後半(2), in local time. */
export function periodOf(date: Date): Period {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const half: 1 | 2 = date.getDate() <= 15 ? 1 : 2;
  return { key: periodKey(year, month, half), year, month, half };
}

function periodKey(y: number, m: number, h: 1 | 2) {
  return `${y}-${String(m).padStart(2, '0')}-${h}`;
}

export function nextPeriod(p: Period): Period {
  if (p.half === 1) return { ...p, half: 2, key: periodKey(p.year, p.month, 2) };
  const year = p.month === 12 ? p.year + 1 : p.year;
  const month = p.month === 12 ? 1 : p.month + 1;
  return { key: periodKey(year, month, 1), year, month, half: 1 };
}

/** Every period from `from` to `to` inclusive (no fixed limit). */
export function periodRange(from: Date, to: Date): Period[] {
  const out: Period[] = [];
  let p = periodOf(from);
  const end = periodOf(to).key;
  if (p.key > end) return [periodOf(to)];
  for (;;) {
    out.push(p);
    if (p.key === end) break;
    p = nextPeriod(p);
  }
  return out;
}

export function periodLabel(p: Period): string {
  return `${p.month}月${p.half === 1 ? '前半' : '後半'}`;
}

export interface ResultRow { playerId: string; sessionId: string; finalPoints: number; endedAt: string }

/**
 * Builds per-player series: for each half-month, the sum of that player's
 * final points of games completed in the period.
 */
export function buildSeries(results: ResultRow[], playerIds: string[], now = new Date()) {
  const first = results.reduce<Date | null>((min, r) => {
    const d = new Date(r.endedAt);
    return !min || d < min ? d : min;
  }, null);
  const periods = periodRange(first ?? now, now);
  const index = new Map(periods.map((p, i) => [p.key, i]));
  const series: Record<string, number[]> = {};
  for (const id of playerIds) series[id] = periods.map(() => 0);
  for (const r of results) {
    const s = series[r.playerId];
    const i = index.get(periodOf(new Date(r.endedAt)).key);
    if (s && i !== undefined) s[i] += r.finalPoints;
  }
  return { periods, series };
}

export function totalsFrom(results: ResultRow[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const r of results) t[r.playerId] = (t[r.playerId] ?? 0) + r.finalPoints;
  return t;
}

/** Round up to a friendly axis maximum (1,2,5 × 10^n). */
export function niceMax(v: number): number {
  if (v <= 0) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

export function formatPoints(n: number): string {
  return n.toLocaleString('ja-JP');
}
