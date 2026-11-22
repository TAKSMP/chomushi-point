// BGM / SE engine (Web Audio: low-latency SE and gapless BGM loops).
// Browsers only allow sound after the first tap, so everything is unlocked on the first pointer event.

export type Bgm = 'main' | 'clear' | null;
export type Se = 'a' | 'b' | 'c' | 'd';

const FILES: Record<string, string> = {
  'bgm-main': 'audio/bgm-main.mp3',     // choumushipoint_mainBGM
  'bgm-clear': 'audio/bgm-clear.mp3',   // choumushipoint_clearBGM
  'se-a': 'audio/se-a.mp3',             // choumushipoint_SE_A: ホームの「みんなのポイント」「むしさがし」
  'se-b': 'audio/se-b.mp3',             // choumushipoint_SE_B: そのほかのボタン
  'se-c': 'audio/se-c.mp3',             // choumushipoint_SE_C: むしさがし中に ポイントを たす
  'se-d': 'audio/se-d.mp3',             // choumushipoint_SE_D: むしさがし中に ポイントを ひく
};

const BGM_VOLUME = 0.45;
const SE_VOLUME = 0.9;
const FADE = 0.35;
const MUTE_KEY = 'chomushi-sound-muted';

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
let wantedBgm: Bgm = null;
let current: { name: Bgm; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();
const listeners = new Set<(m: boolean) => void>();

function url(path: string) { return `${import.meta.env.BASE_URL}${path}`; }

function ensureCtx(): Ctx | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  return ctx;
}

function load(key: string): Promise<AudioBuffer | null> {
  const c = ensureCtx();
  if (!c) return Promise.resolve(null);
  const hit = buffers.get(key);
  if (hit) return Promise.resolve(hit);
  let p = loading.get(key);
  if (!p) {
    p = fetch(url(FILES[key]))
      .then((r) => r.arrayBuffer())
      .then((ab) => new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(ab, res, rej)))
      .then((b) => { buffers.set(key, b); return b; })
      .catch(() => { loading.delete(key); return null; });
    loading.set(key, p);
  }
  return p;
}

/** Trim the encoder's silent padding so loops are seamless. */
function loopPoints(b: AudioBuffer): [number, number] {
  const d = b.getChannelData(0);
  const th = 1e-4;
  let s = 0; while (s < d.length && Math.abs(d[s]) < th) s++;
  let e = d.length - 1; while (e > s && Math.abs(d[e]) < th) e--;
  if (e - s < b.sampleRate) return [0, b.duration];
  return [s / b.sampleRate, (e + 1) / b.sampleRate];
}

let unlocked = false;
export function unlock() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended' && document.visibilityState === 'visible') void c.resume();
  if (!unlocked) {
    unlocked = true;
    Object.keys(FILES).forEach((k) => void load(k));
    // iOS: a silent one-sample buffer fully unlocks output
    const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
    void applyBgm();
  }
}

async function applyBgm() {
  const c = ensureCtx();
  if (!c || !master || !unlocked) return;
  const name = wantedBgm;
  if (current?.name === name) return;
  // fade out current
  if (current) {
    const old = current; current = null;
    const t = c.currentTime;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + FADE);
    old.src.stop(t + FADE + 0.05);
  }
  if (!name) return;
  const buf = await load(`bgm-${name}`);
  if (!buf || wantedBgm !== name || (current as { name: Bgm } | null)?.name === name) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const [ls, le] = loopPoints(buf);
  src.loopStart = ls; src.loopEnd = le;
  const gain = c.createGain();
  const t = c.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(BGM_VOLUME, t + FADE);
  src.connect(gain).connect(master);
  src.start(t, ls);
  current = { name, src, gain };
}

export function setBgm(name: Bgm) {
  wantedBgm = name;
  void applyBgm();
}

export function playSe(name: Se) {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const buf = buffers.get(`se-${name}`);
  if (!buf) { void load(`se-${name}`); return; }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = SE_VOLUME;
  src.connect(g).connect(master);
  src.start();
}

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
  listeners.forEach((f) => f(m));
}
export function onMutedChange(f: (m: boolean) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/**
 * Installs global listeners:
 *  - first tap unlocks audio (and starts the BGM)
 *  - every <button> click plays an SE: data-se="a|c|d|none" overrides the default "b"
 *  - sound pauses while the app is in the background
 */
export function installSound() {
  const onFirst = () => unlock();
  window.addEventListener('pointerdown', onFirst, { capture: true });
  window.addEventListener('keydown', onFirst, { capture: true });
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest?.('button');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const se = btn.getAttribute('data-se');
    if (se === 'none') return;
    unlock();
    playSe((se === 'a' || se === 'c' || se === 'd') ? se : 'b');
  }, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') void ctx.suspend();
    else if (unlocked) void ctx.resume();
  });
}

// debug hook (DevTools: __chomushiSound())
(window as unknown as Record<string, unknown>).__chomushiSound = () => ({
  state: ctx?.state, bgm: current?.name ?? null, wanted: wantedBgm, muted, loaded: [...buffers.keys()],
});
