import { useEffect, useState, type FormEvent } from 'react';
import { BackButton, Dialog, Panel, PillButton, Screen, SoundToggle, TitleBoard, TopBar } from '../components/ui';
import { activeCache } from '../lib/gameStore';
import { friendlyError, type AuthUser, type Player } from '../lib/repo';
import { formatPoints } from '../lib/scoring';
import { useApp } from '../store';

const MAX_NAME = 12;

export function Settings() {
  const { repo, players, stats, refresh, toast } = useApp();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Player | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => { void refresh(); repo.getUser().then(setUser); }, [refresh, repo]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); await refresh(); if (ok) toast(ok); return true; }
    catch (e) { toast(friendlyError(e)); return false; }
    finally { setBusy(false); }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (await run(() => repo.addPlayer(name), `「${name}」を とうろくしました`)) setNewName('');
  }

  async function saveRename(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    if (await run(() => repo.renamePlayer(editing.id, name), 'なまえを かえました')) setEditing(null);
  }

  async function doDelete() {
    if (!deleting) return;
    const p = deleting;
    setDeleting(null);
    const ok = await run(() => repo.deletePlayer(p.id), `「${p.displayName}」を けしました`);
    if (ok) {
      const c = activeCache.get();
      if (c?.playerIds.includes(p.id)) activeCache.set(null);
    }
  }

  const gamesOf = (id: string) => stats.results.filter((r) => r.playerId === id).length;

  return (
    <Screen className="settings">
      <TopBar left={<BackButton />} />
      <TitleBoard small>せってい</TitleBoard>
      <Panel>
        <h2 className="section-title">なまえの とうろく</h2>
        <ul className="name-admin">
          {players.length === 0 && <li className="empty">まだ なまえが ありません</li>}
          {players.map((p) => (
            <li key={p.id} className="name-admin-row">
              {editing?.id === p.id ? (
                <form className="rename-form" onSubmit={saveRename}>
                  <input autoFocus value={editing.name} maxLength={MAX_NAME} aria-label={`${p.displayName} の あたらしい なまえ`}
                    onChange={(e) => setEditing({ id: p.id, name: e.target.value })} />
                  <PillButton type="submit" color="yellow" disabled={busy || !editing.name.trim()}>OK</PillButton>
                  <PillButton color="plank" onClick={() => setEditing(null)}>やめる</PillButton>
                </form>
              ) : (
                <>
                  <span className="admin-name">{p.displayName}</span>
                  <span className="admin-total">{formatPoints(stats.totals[p.id] ?? 0)}pt</span>
                  <button type="button" className="icon-btn" aria-label={`${p.displayName} の なまえを かえる`} onClick={() => setEditing({ id: p.id, name: p.displayName })}>✏️</button>
                  <button type="button" className="icon-btn danger" aria-label={`${p.displayName} を けす`} onClick={() => setDeleting(p)}>🗑️</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="new-name" onSubmit={add}>
          <input value={newName} maxLength={MAX_NAME} placeholder="あたらしい なまえ" aria-label="あたらしい なまえ"
            onChange={(e) => setNewName(e.target.value)} />
          <PillButton type="submit" color="yellow" disabled={busy || !newName.trim()}>ついか</PillButton>
        </form>
        <p className="hint">なまえは この かぞくの すべての スマホ・タブレットで おなじに なります。</p>
      </Panel>

      <Panel className="sound-panel">
        <div className="sound-row"><h2 className="section-title">おと（BGM・こうかおん）</h2><SoundToggle /></div>
      </Panel>

      <Panel className="account-panel">
        <h2 className="section-title">かぞくアカウント</h2>
        <p className="account-line">{repo.kind === 'demo' ? 'おためしモード（この たんまつ だけに ほぞん）' : user?.email ?? ''}</p>
        {repo.kind === 'supabase' && <PillButton color="plank" className="wide" onClick={() => setConfirmLogout(true)}>ログアウト</PillButton>}
      </Panel>

      <Dialog open={!!deleting} title={`「${deleting?.displayName ?? ''}」を けしますか？`} onClose={() => setDeleting(null)}
        actions={<>
          <PillButton color="plank" onClick={() => setDeleting(null)}>けさない</PillButton>
          <PillButton color="red" onClick={doDelete}>けす</PillButton>
        </>}>
        {deleting && (
          <>
            <p>いっしょに つぎの データも きえて、もとに もどせません。</p>
            <ul className="impact-list">
              <li>ごうけい <b>{formatPoints(stats.totals[deleting.id] ?? 0)} ポイント</b></li>
              <li>ゲームの きろく <b>{gamesOf(deleting.id)} かい ぶん</b></li>
              <li>「みんなのポイント」の グラフ</li>
            </ul>
            <p className="small">※ ほかの ひとの ポイントは そのまま です。</p>
          </>
        )}
      </Dialog>

      <Dialog open={confirmLogout} title="ログアウトしますか？" onClose={() => setConfirmLogout(false)}
        actions={<>
          <PillButton color="plank" onClick={() => setConfirmLogout(false)}>もどる</PillButton>
          <PillButton color="red" onClick={() => { setConfirmLogout(false); void repo.signOut(); }}>ログアウト</PillButton>
        </>}>
        データは クラウドに のこります。また おなじ アカウントで ログインすれば みられます。
      </Dialog>
    </Screen>
  );
}
