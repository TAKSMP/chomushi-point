import { describe, expect, it } from 'vitest';
import { applyPoints, buildSeries, niceMax, periodLabel, periodOf, periodRange, rankBy, totalsFrom } from './scoring';

describe('applyPoints', () => {
  const s = { a: 10, b: 3, c: 0 };
  it('adds the same value to every selected player', () => {
    expect(applyPoints(s, ['a', 'b'], 5, 'add')).toEqual({ a: 15, b: 8, c: 0 });
  });
  it('subtracts with a floor of 0 per player', () => {
    expect(applyPoints(s, ['a', 'b', 'c'], 5, 'sub')).toEqual({ a: 5, b: 0, c: 0 });
  });
  it('ignores unknown ids and does not mutate input', () => {
    const r = applyPoints(s, ['zzz'], 5, 'add');
    expect(r).toEqual(s);
    expect(r).not.toBe(s);
  });
});

describe('rankBy', () => {
  it('ties share a rank (competition ranking)', () => {
    const r = rankBy([{ n: 'a', p: 10 }, { n: 'b', p: 30 }, { n: 'c', p: 10 }, { n: 'd', p: 5 }], (x) => x.p);
    expect(r.map((x) => [x.item.n, x.rank])).toEqual([['b', 1], ['a', 2], ['c', 2], ['d', 4]]);
  });
  it('all equal → all first', () => {
    expect(rankBy([1, 1, 1], (x) => x).map((x) => x.rank)).toEqual([1, 1, 1]);
  });
});

describe('half-month periods', () => {
  it('1–15 is 前半, 16–end is 後半', () => {
    expect(periodOf(new Date(2026, 10, 15, 23, 59)).half).toBe(1);
    expect(periodOf(new Date(2026, 10, 16, 0, 0)).half).toBe(2);
    expect(periodOf(new Date(2026, 1, 28)).half).toBe(2);
    expect(periodLabel(periodOf(new Date(2026, 10, 3)))).toBe('11月前半');
  });
  it('range crosses years without a fixed limit', () => {
    const r = periodRange(new Date(2025, 11, 20), new Date(2026, 1, 2));
    expect(r.map(periodLabel)).toEqual(['12月後半', '1月前半', '1月後半', '2月前半']);
    expect(periodRange(new Date(2020, 0, 1), new Date(2026, 11, 31))).toHaveLength(7 * 24);
  });
});

describe('buildSeries', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
  const results = [
    { playerId: 'p', sessionId: 's1', finalPoints: 30, endedAt: at(2026, 10, 2) },
    { playerId: 'p', sessionId: 's2', finalPoints: 20, endedAt: at(2026, 10, 14) },
    { playerId: 'm', sessionId: 's2', finalPoints: 0, endedAt: at(2026, 10, 14) },
    { playerId: 'p', sessionId: 's3', finalPoints: 5, endedAt: at(2026, 11, 20) },
  ];
  it('sums final points of completed games per half-month', () => {
    const { periods, series } = buildSeries(results, ['p', 'm', 'new'], new Date(2026, 10, 21));
    expect(periods.map(periodLabel)).toEqual(['10月前半', '10月後半', '11月前半', '11月後半']);
    expect(series.p).toEqual([50, 0, 0, 5]);
    expect(series.m).toEqual([0, 0, 0, 0]);
    expect(series.new).toEqual([0, 0, 0, 0]);
  });
  it('no games → just the current period', () => {
    const { periods } = buildSeries([], ['p'], new Date(2026, 10, 21));
    expect(periods).toHaveLength(1);
  });
  it('totals are the sum of final points', () => {
    expect(totalsFrom(results)).toEqual({ p: 55, m: 0 });
  });
});

describe('niceMax', () => {
  it('rounds up to 1/2/5 steps', () => {
    expect([0, 3, 10, 11, 260, 999, 1001].map(niceMax)).toEqual([10, 5, 10, 20, 500, 1000, 2000]);
  });
});
