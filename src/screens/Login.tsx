import { useState, type FormEvent } from 'react';
import { Panel, PillButton, Screen, TitleBoard, img } from '../components/ui';
import { friendlyError, type Repo } from '../lib/repo';

export function Login({ repo }: { repo: Repo }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'signin') await repo.signIn(email.trim(), password);
      else {
        const r = await repo.signUp(email.trim(), password);
        if (r.needsConfirmation) {
          setMsg({ kind: 'info', text: 'かくにんメールを おくりました。メールの リンクを ひらいてから ログインしてね。' });
          setMode('signin');
        }
      }
    } catch (err) {
      setMsg({ kind: 'error', text: friendlyError(err) });
    } finally { setBusy(false); }
  }

  return (
    <Screen className="login">
      <TitleBoard>ちょうむしポイント</TitleBoard>
      <div className="login-bugs" aria-hidden="true">
        <img src={img('grasshopper')} alt="" /><img src={img('butterfly')} alt="" />
      </div>
      <Panel>
        <form className="login-form" onSubmit={submit}>
          <h2 className="section-title">{mode === 'signin' ? 'かぞくで ログイン' : 'かぞくアカウントを つくる'}</h2>
          <label className="field">
            <span>メールアドレス</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {msg && <p className={`form-msg ${msg.kind}`} role="alert">{msg.text}</p>}
          <PillButton type="submit" color="yellow" className="wide" disabled={busy}>
            {busy ? '…' : mode === 'signin' ? 'ログイン' : 'つくる'}
          </PillButton>
          <button type="button" className="link-btn" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null); }}>
            {mode === 'signin' ? 'はじめての かぞくは こちら（アカウントを つくる）' : 'アカウントが ある かぞくは こちら（ログイン）'}
          </button>
          <p className="hint">かぞく みんなで おなじ メールアドレスと パスワードを つかうと、どの スマホでも おなじ ポイントが みられます。</p>
        </form>
      </Panel>
    </Screen>
  );
}

export function SetupNeeded() {
  return (
    <Screen className="login">
      <TitleBoard>ちょうむしポイント</TitleBoard>
      <Panel>
        <div className="setup-needed">
          <h2 className="section-title">クラウドの せってい が まだです</h2>
          <p>このアプリは Supabase にデータを保存します。管理者の方は README の「初期設定」に沿って、
            <code>VITE_SUPABASE_URL</code> と <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> を設定してからビルドしてください。</p>
          <p>設定前に画面だけ試す場合は <code>VITE_DEMO_MODE=true</code>（この端末だけに保存されるおためしモード）で起動できます。</p>
        </div>
      </Panel>
    </Screen>
  );
}
