import { useEffect, useState } from 'react';
import { Loading, PillButton, Screen, TitleBoard, fit, img } from '../components/ui';
import { flushPending, pending } from '../lib/gameStore';
import type { GameResult } from '../lib/repo';
import { formatPoints, rankBy } from '../lib/scoring';
import { navigate } from '../router';
import { useApp } from '../store';

export function Result({ sessionId }: { sessionId: string }) {
  const { repo, playerName, stats, refresh } = useApp();
  const [result, setResult] = useState<GameResult | null | undefined>(undefined);
  const [saving, setSaving] = useState(pending.has(sessionId));

  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    const load = async () => {
      if (pending.has(sessionId)) await flushPending(repo);
      const stillPending = pending.list().find((p) => p.sessionId === sessionId);
      if (stillPending) {
        // not stored in the cloud yet (offline) → show the local result and retry
        if (!live) return;
        setSaving(true);
        setResult({ sessionId, endedAt: new Date(stillPending.queuedAt).toISOString(),
          entries: stillPending.playerIds.map((playerId, i) => ({ playerId, seat: i + 1, finalPoints: Math.max(0, stillPending.scores[playerId] ?? 0) })) });
        timer = window.setTimeout(load, 5000);
        return;
      }
      const r = await repo.getGameResult(sessionId).catch(() => null);
      if (!live) return;
      setSaving(false);
      setResult(r);
      void refresh();
    };
    void load();
    return () => { live = false; window.clearTimeout(timer); };
  }, [repo, sessionId, refresh]);

  if (result === undefined) return <Screen className="result"><Loading label="けっかを まとめています…" /></Screen>;
  if (result === null) {
    return (
      <Screen className="result">
        <TitleBoard>こんかいの けっか</TitleBoard>
        <section className="panel"><div className="panel-paper"><p className="empty">けっかが みつかりませんでした。</p>
          <PillButton className="wide" onClick={() => navigate({ name: 'home' }, { replace: true })}>ホームへ</PillButton></div></section>
      </Screen>
    );
  }

  const ranked = rankBy(result.entries, (e) => e.finalPoints);
  const ended = new Date(result.endedAt);
  return (
    <Screen className="result">
      <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} />)}</div>
      <TitleBoard>こんかいの けっか</TitleBoard>
      <section className="panel">
        <div className="panel-paper">
          <p className="result-date">{ended.getMonth() + 1}月{ended.getDate()}日 {String(ended.getHours()).padStart(2, '0')}:{String(ended.getMinutes()).padStart(2, '0')} おわり</p>
          <ol className="podium-list">
            {ranked.map(({ item, rank }) => (
              <li key={item.playerId} className={`rank-row rank-${Math.min(rank, 4)}`}>
                <span className="medal" aria-label={`${rank}い`}>{rank === 1 && <span className="crown" aria-hidden="true">👑</span>}<b>{rank}</b><small>い</small></span>
                <span className="rank-name"><span style={fit(playerName(item.playerId))}>{playerName(item.playerId)}</span></span>
                <span className="rank-points"><b>{formatPoints(item.finalPoints)}</b><small>ポイント</small></span>
                {!saving && stats.totals[item.playerId] !== undefined && (
                  <span className="rank-total">ごうけい {formatPoints(stats.totals[item.playerId])}</span>
                )}
              </li>
            ))}
          </ol>
          {saving && <p className="sync-note">☁ クラウドに ほぞんちゅう…（つながったら じどうで ほぞんします）</p>}
          <div className="result-bugs" aria-hidden="true"><img src={img('grasshopper')} alt="" /><img src={img('butterfly')} alt="" /></div>
          <PillButton color="yellow" className="wide" onClick={() => navigate({ name: 'home' }, { replace: true })}>ホームへ もどる</PillButton>
          <PillButton color="plank" className="wide" onClick={() => navigate({ name: 'points' })}>みんなの ポイントを みる</PillButton>
        </div>
      </section>
    </Screen>
  );
}
