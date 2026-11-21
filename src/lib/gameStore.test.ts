import { beforeEach, describe, expect, it } from 'vitest';
import { DemoRepo } from './demoRepo';
import { activeCache, flushPending, pending, reconcileActive } from './gameStore';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

beforeEach(() => { (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage(); });

describe('pending completions', () => {
  it('retries until online and adds totals exactly once', async () => {
    const repo = new DemoRepo();
    const a = await repo.addPlayer('パパ');
    const b = await repo.addPlayer('かいと');
    let online = false;
    const flaky = Object.create(repo) as DemoRepo;
    flaky.startGame = async (...args) => { if (!online) throw new Error('Failed to fetch'); return repo.startGame(...args); };

    // game played completely offline
    pending.add({ sessionId: 's1', playerIds: [a.id, b.id], scores: { [a.id]: 30, [b.id]: 12 }, queuedAt: Date.now() });
    expect(await flushPending(flaky)).toBe(0);
    expect(pending.has('s1')).toBe(true);
    expect((await repo.getStats()).totals).toEqual({});

    online = true;
    expect(await flushPending(flaky)).toBe(1);
    expect(pending.has('s1')).toBe(false);
    // a duplicate retry (e.g. second device / double tap) changes nothing
    pending.add({ sessionId: 's1', playerIds: [a.id, b.id], scores: { [a.id]: 999, [b.id]: 999 }, queuedAt: Date.now() });
    await flushPending(flaky);
    expect((await repo.getStats()).totals).toEqual({ [a.id]: 30, [b.id]: 12 });
  });

  it('prefers unsynced local scores for the same session', () => {
    activeCache.set({ sessionId: 'g', playerIds: ['x'], scores: { x: 50 }, startedAt: '', synced: false, savedAt: 1 });
    const r = reconcileActive({ sessionId: 'g', playerIds: ['x'], scores: { x: 10 }, startedAt: '' });
    expect(r?.scores.x).toBe(50);
  });

  it('drops the local copy of a game that is already being completed', () => {
    activeCache.set({ sessionId: 'g', playerIds: ['x'], scores: { x: 50 }, startedAt: '', synced: true, savedAt: 1 });
    pending.add({ sessionId: 'g', playerIds: ['x'], scores: { x: 50 }, queuedAt: 1 });
    expect(reconcileActive({ sessionId: 'g', playerIds: ['x'], scores: { x: 50 }, startedAt: '' })).toBeNull();
    expect(activeCache.get()).toBeNull();
  });
});
