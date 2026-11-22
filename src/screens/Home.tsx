import { useEffect, useState } from 'react';
import { Dialog, GearIcon, PillButton, Screen, SoundToggle, TitleBoard, TopBar, img } from '../components/ui';
import { activeCache, reconcileActive } from '../lib/gameStore';
import type { ActiveGame } from '../lib/repo';
import { navigate } from '../router';
import { useApp } from '../store';

export function Home() {
  const { repo, playerName, syncError, toast } = useApp();
  const [active, setActive] = useState<ActiveGame | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let live = true;
    repo.getActiveGame().catch(() => null).then((cloud) => { if (live) setActive(reconcileActive(cloud)); });
    return () => { live = false; };
  }, [repo]);

  async function discard() {
    if (!active) return;
    setConfirmDiscard(false);
    try {
      await repo.abandonGame(active.sessionId);
      activeCache.set(null);
      setActive(null);
    } catch { toast('いまは けせませんでした。あとで もういちど ためしてね'); }
  }

  return (
    <Screen className="home">
      <TopBar left={<SoundToggle />} right={
        <button type="button" className="round-wood" aria-label="せってい（なまえの かんり）" onClick={() => navigate({ name: 'settings' })}>
          <GearIcon />
        </button>
      } />
      <img className="home-fly" src={img('butterfly')} alt="" aria-hidden="true" />
      <TitleBoard>ちょうむしポイント</TitleBoard>

      {syncError && <p className="sync-banner" role="alert">⚠ {syncError}</p>}

      <nav className="home-menu">
        <button type="button" className="menu-card" data-se="a" onClick={() => navigate({ name: 'points' })}>
          <span className="menu-icon coins" aria-hidden="true">
            <span className="coin c-blue"><img src={img('butterfly')} alt="" /></span>
            <span className="coin c-yellow"><img src={img('butterfly')} alt="" /></span>
            <span className="coin c-green"><img src={img('grasshopper')} alt="" /></span>
          </span>
          <span className="menu-label">みんなの<br />ポイント</span>
        </button>
        <button type="button" className="menu-card" data-se="a" onClick={() => navigate({ name: 'setup' })}>
          <span className="menu-icon search" aria-hidden="true">
            <svg className="magnifier" viewBox="0 0 64 64"><circle cx="26" cy="26" r="17" fill="#bfe6ff" stroke="#c9ced6" strokeWidth="6" /><circle cx="21" cy="20" r="5" fill="#fff" opacity=".8" /><path d="M39 39l15 15" stroke="#a0622b" strokeWidth="9" strokeLinecap="round" /></svg>
            <img className="search-bug" src={img('grasshopper')} alt="" />
          </span>
          <span className="menu-label">むしさがし</span>
        </button>
      </nav>

      {active && (
        <div className="resume-card">
          <p className="resume-text">
            とちゅうの ゲームが あります<br />
            <small>{active.playerIds.map(playerName).join('・')}</small>
          </p>
          <div className="resume-actions">
            <PillButton color="yellow" onClick={() => navigate({ name: 'game' })}>つづける</PillButton>
            <PillButton color="plank" onClick={() => setConfirmDiscard(true)}>やめる</PillButton>
          </div>
        </div>
      )}

      <Dialog open={confirmDiscard} title="とちゅうの ゲームを やめますか？" onClose={() => setConfirmDiscard(false)}
        actions={<>
          <PillButton color="plank" data-se="b" onClick={() => setConfirmDiscard(false)}>もどる</PillButton>
          <PillButton color="red" onClick={discard}>やめる</PillButton>
        </>}>
        このゲームの ポイントは ごうけいに たされず、きえます。
      </Dialog>
    </Screen>
  );
}
