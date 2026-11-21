import { useEffect, useState, type FormEvent } from 'react';
import { BackButton, Dialog, Panel, PillButton, Screen, TitleBoard, TopBar, fit, img } from '../components/ui';
import { activeCache, reconcileActive } from '../lib/gameStore';
import { friendlyError, type ActiveGame } from '../lib/repo';
import { navigate } from '../router';
import { useApp } from '../store';

const MAX_NAME = 12;

export function Setup() {
  const { repo, players, refresh, toast } = useApp();
  const [count, setCount] = useState<number | null>(null);
  const [slots, setSlots] = useState<(string | null)[]>([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<ActiveGame | null>(null);
  const [askReplace, setAskReplace] = useState(false);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    repo.getActiveGame().catch(() => null).then((g) => setExisting(reconcileActive(g)));
  }, [repo]);

  function chooseCount(n: number) {
    setCount(n);
    setSlots((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? null));
  }

  const chosen = new Set(slots.filter(Boolean) as string[]);
  const firstEmpty = slots.findIndex((s) => s === null);

  function pick(id: string) {
    if (chosen.has(id)) { setSlots(slots.map((s) => (s === id ? null : s))); return; }
    if (firstEmpty < 0) { toast('もう いっぱいです。かえる ときは うえの なまえを おしてね'); return; }
    const next = [...slots]; next[firstEmpty] = id; setSlots(next);
  }

  async function addNew(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const dup = players.find((p) => p.displayName === name);
    if (dup) { pick(dup.id); setNewName(''); return; }
    setBusy(true);
    try {
      const p = await repo.addPlayer(name);
      setNewName('');
      await refresh();
      if (firstEmpty >= 0) { const next = [...slots]; next[firstEmpty] = p.id; setSlots(next); }
    } catch (err) { toast(friendlyError(err)); } finally { setBusy(false); }
  }

  async function start(replace = false) {
    const ids = slots.filter(Boolean) as string[];
    if (ids.length !== count) return;
    if (existing && !replace) { setAskReplace(true); return; }
    setBusy(true);
    try {
      if (existing) { await repo.abandonGame(existing.sessionId).catch(() => {}); }
      const sessionId = crypto.randomUUID();
      const scores = Object.fromEntries(ids.map((id) => [id, 0])); // every game starts at 0
      const game = { sessionId, playerIds: ids, scores, startedAt: new Date().toISOString() };
      activeCache.set({ ...game, synced: false, savedAt: Date.now() });
      try {
        await repo.startGame(sessionId, ids);
        activeCache.set({ ...game, synced: true, savedAt: Date.now() });
      } catch (err) {
        // offline: keep playing locally; it is uploaded when the game is finished
        toast(`${friendlyError(err)}（あとで ほぞんします）`);
      }
      navigate({ name: 'game' }, { replace: true });
    } finally { setBusy(false); }
  }

  return (
    <Screen className="setup">
      <TopBar left={<BackButton onClick={() => (count ? setCount(null) : navigate({ name: 'home' }))} />} />
      <TitleBoard>むしさがし</TitleBoard>

      {count === null ? (
        <Panel>
          <h2 className="section-title">なんにんで あそぶ？</h2>
          <div className="count-grid">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} type="button" className="count-btn" onClick={() => chooseCount(n)}>
                <span className="count-num">{n}</span><span className="count-unit">にん</span>
              </button>
            ))}
          </div>
          <div className="setup-bugs" aria-hidden="true"><img src={img('grasshopper')} alt="" /><img src={img('butterfly')} alt="" /></div>
        </Panel>
      ) : (
        <Panel>
          <h2 className="section-title">だれが あそぶ？ <small>（{count}にん）</small></h2>
          <ol className={`slot-list n${count}`}>
            {slots.map((id, i) => (
              <li key={i}>
                <button type="button" className={`slot ${id ? 'filled' : ''} ${i === firstEmpty ? 'next' : ''}`}
                  onClick={() => id && pick(id)} aria-label={id ? `${i + 1}にんめ ${players.find((p) => p.id === id)?.displayName}（おすと はずす）` : `${i + 1}にんめ`}>
                  <span className="slot-no">{i + 1}</span>
                  <span className="slot-name" style={id ? fit(players.find((p) => p.id === id)?.displayName ?? '') : undefined}>{id ? players.find((p) => p.id === id)?.displayName : 'なまえを えらんでね'}</span>
                </button>
              </li>
            ))}
          </ol>

          {players.length > 0 && <p className="sub-title">とうろくした なまえ</p>}
          <div className="chip-grid">
            {players.map((p) => (
              <button key={p.id} type="button" className={`name-chip ${chosen.has(p.id) ? 'chosen' : ''}`}
                aria-pressed={chosen.has(p.id)} onClick={() => pick(p.id)}>
                {p.displayName}
              </button>
            ))}
          </div>

          <form className="new-name" onSubmit={addNew}>
            <input value={newName} maxLength={MAX_NAME} placeholder="あたらしい なまえ"
              onChange={(e) => setNewName(e.target.value)} aria-label="あたらしい なまえ" />
            <PillButton type="submit" color="yellow" disabled={busy || !newName.trim()}>とうろく</PillButton>
          </form>

          <PillButton color="yellow" className="wide start-btn" disabled={busy || firstEmpty !== -1} onClick={() => start()}>
            スタート！
          </PillButton>
        </Panel>
      )}

      <Dialog open={askReplace} title="とちゅうの ゲームが あります" onClose={() => setAskReplace(false)}
        actions={<>
          <PillButton color="yellow" onClick={() => navigate({ name: 'game' })}>つづきを する</PillButton>
          <PillButton color="red" onClick={() => { setAskReplace(false); void start(true); }}>あたらしく はじめる</PillButton>
        </>}>
        あたらしく はじめると、とちゅうの ゲームの ポイントは きえます。
      </Dialog>
    </Screen>
  );
}
