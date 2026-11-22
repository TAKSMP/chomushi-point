import { useCallback, useEffect, useRef, useState } from 'react';
import { BackButton, Dialog, Loading, PillButton, Screen, TitleBoard, TopBar, fit, img } from '../components/ui';
import { activeCache, flushPending, pending, reconcileActive } from '../lib/gameStore';
import type { ActiveGame } from '../lib/repo';
import { POINT_VALUES, applyPoints, formatPoints, type Mode, type Scores } from '../lib/scoring';
import { navigate } from '../router';
import { useApp } from '../store';

interface Pop { id: number; text: string }

export function Game() {
  const { repo, playerName, refresh } = useApp();
  const [game, setGame] = useState<ActiveGame | null | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('add');
  const [pops, setPops] = useState<Record<string, Pop>>({});
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [nudge, setNudge] = useState(0);
  const saveTimer = useRef<number>(undefined);
  const popSeq = useRef(0);

  useEffect(() => {
    let live = true;
    const local = activeCache.get();
    if (local && !pending.has(local.sessionId)) setGame(local); // instant
    repo.getActiveGame().catch(() => null).then((cloud) => {
      if (!live) return;
      const g = reconcileActive(cloud);
      if (!g) { navigate({ name: 'setup' }, { replace: true }); return; }
      setGame((cur) => (cur && cur.sessionId === g.sessionId ? cur : g));
    });
    return () => { live = false; };
  }, [repo]);

  const persist = useCallback((g: ActiveGame) => {
    activeCache.set({ ...g, synced: false, savedAt: Date.now() });
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await repo.saveProgress(g.sessionId, g.scores);
        const c = activeCache.get();
        if (c && c.sessionId === g.sessionId && c.savedAt <= Date.now()) activeCache.set({ ...c, synced: true });
      } catch { /* stays unsynced; uploaded later */ }
    }, 700);
  }, [repo]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  if (game === undefined || game === null) return <Screen className="game"><Loading /></Screen>;

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function press(value: number) {
    if (!game) return;
    if (selected.size === 0) { setNudge((n) => n + 1); return; }
    const scores: Scores = applyPoints(game.scores, selected, value, mode);
    const next = { ...game, scores };
    setGame(next);
    persist(next);
    const sign = mode === 'add' ? '+' : '−';
    setPops((p) => {
      const n = { ...p };
      for (const id of selected) n[id] = { id: ++popSeq.current, text: `${sign}${formatPoints(value)}` };
      return n;
    });
    navigator.vibrate?.(15);
  }

  async function endGame() {
    if (!game) return;
    setConfirmEnd(false);
    window.clearTimeout(saveTimer.current);
    pending.add({ sessionId: game.sessionId, playerIds: game.playerIds, scores: game.scores, queuedAt: Date.now() });
    activeCache.set(null);
    navigate({ name: 'result', sessionId: game.sessionId }, { replace: true });
    await flushPending(repo);
    void refresh();
  }

  const n = game.playerIds.length;
  return (
    <Screen className={`game mode-${mode}`}>
      <TopBar left={<BackButton label="ホームへ（ゲームは のこります）" />} />
      <TitleBoard>むしさがし</TitleBoard>

      <section className="panel players-panel">
        <div className="panel-paper">
          <div key={nudge} className={`player-grid n${n} ${nudge ? 'nudge' : ''}`} role="group" aria-label="ポイントを つける ひと">
            {game.playerIds.map((id) => {
              const on = selected.has(id);
              const pop = pops[id];
              return (
                <button key={id} type="button" className={`player-slot ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(id)}>
                  <span className="name-plank"><span className="name-text" style={fit(playerName(id))}>{playerName(id)}</span></span>
                  <span className="score-sign">
                    <span className="score-num">{formatPoints(game.scores[id] ?? 0)}</span>
                    <span className="score-unit">ポイント</span>
                  </span>
                  {pop && <span key={pop.id} className={`pop ${mode}`} aria-hidden="true">{pop.text}</span>}
                </button>
              );
            })}
          </div>
          {selected.size === 0 && <p className="pick-hint">なまえを おして えらんでね（なんにんでも OK）</p>}
        </div>
      </section>

      <div className="bug-strip" aria-hidden="true">
        <img className="bug-hopper" src={img('grasshopper')} alt="" />
        <img className="bug-fly" src={img('butterfly')} alt="" />
      </div>

      <section className="panel points-panel">
        <div className="mode-bar" role="radiogroup" aria-label="たす か ひく">
          <button type="button" role="radio" aria-checked={mode === 'add'} className={`mode-btn add ${mode === 'add' ? 'active' : ''}`} onClick={() => setMode('add')}>
            <span>たす</span>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'sub'} className={`mode-btn sub ${mode === 'sub' ? 'active' : ''}`} onClick={() => setMode('sub')}>
            <span>ひく</span>
          </button>
        </div>
        <div className="panel-paper">
          <div className="token-grid">
            {POINT_VALUES.map((v) => (
              <button key={v} type="button" className={`token ${mode}`} data-digits={String(v).length}
                data-se={selected.size === 0 ? 'b' : mode === 'add' ? 'c' : 'd'}
                aria-label={`${v}ポイント ${mode === 'add' ? 'たす' : 'ひく'}`} onClick={() => press(v)}>
                <span>{v}</span>
              </button>
            ))}
          </div>
          <PillButton color="plank" className="wide end-btn" onClick={() => setConfirmEnd(true)}>ゲームおわり</PillButton>
        </div>
      </section>

      <Dialog open={confirmEnd} title="ゲームを おわりにしますか？" onClose={() => setConfirmEnd(false)}
        actions={<>
          <PillButton color="plank" onClick={() => setConfirmEnd(false)}>まだ つづける</PillButton>
          <PillButton color="yellow" onClick={endGame}>おわりにする</PillButton>
        </>}>
        <ul className="confirm-scores">
          {game.playerIds.map((id) => <li key={id}><span>{playerName(id)}</span><b>{formatPoints(game.scores[id] ?? 0)} ポイント</b></li>)}
        </ul>
        <p>おわりに すると、いまの ポイントが ごうけいに たされます。</p>
      </Dialog>
    </Screen>
  );
}
