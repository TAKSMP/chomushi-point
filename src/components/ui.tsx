import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isMuted, onMutedChange, setMuted, unlock } from '../lib/sound';
import { navigate, type Route } from '../router';

/** CSS var used to shrink long names so they fit without ellipsis. */
export const fit = (text: string) => ({ ['--len' as string]: Math.max(3, [...text].length) });

export const img = (name: string) => `${import.meta.env.BASE_URL}img/${name}.webp`;

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`screen ${className}`}>{children}</main>;
}

export function TitleBoard({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <header className={`title-board ${small ? 'small' : ''}`}>
      <h1 className="title-text" style={typeof children === 'string' ? fit(children) : undefined}>{children}</h1>
    </header>
  );
}

export function BackButton({ to = { name: 'home' }, label = 'もどる', onClick }: { to?: Route; label?: string; onClick?: () => void }) {
  return (
    <button type="button" className="round-wood back-btn" aria-label={label}
      onClick={onClick ?? (() => navigate(to))}>
      <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 12 13 24l14 12M14 24h22" fill="none" stroke="#fff8e6" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return <div className="top-bar"><div>{left}</div><div>{right}</div></div>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-paper">{children}</div></section>;
}

export function PillButton({ color = 'yellow', children, className = '', ...rest }:
  { color?: 'yellow' | 'red' | 'plank' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`pill pill-${color} ${className}`} {...rest}><span>{children}</span></button>;
}

export function Dialog({ open, title, children, actions, onClose }:
  { open: boolean; title: ReactNode; children?: ReactNode; actions: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="dialog-paper">
          <h2 className="dialog-title">{title}</h2>
          {children && <div className="dialog-body">{children}</div>}
          <div className="dialog-actions">{actions}</div>
        </div>
      )}
    </dialog>
  );
}

export function SoundToggle() {
  const [muted, setM] = useState(isMuted());
  useEffect(() => onMutedChange(setM), []);
  return (
    <button type="button" className="round-wood sound-toggle" aria-pressed={!muted}
      aria-label={muted ? 'おとを だす' : 'おとを けす'}
      onClick={() => { unlock(); setMuted(!muted); }}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M8 18h8l11-9v30l-11-9H8z" fill="#fff8e6" />
        {muted
          ? <path d="M33 18l10 12M43 18 33 30" stroke="#ffb3a8" strokeWidth="5" strokeLinecap="round" />
          : <path d="M33 16c4 4 4 12 0 16M38 11c7 7 7 19 0 26" fill="none" stroke="#fff8e6" strokeWidth="4.5" strokeLinecap="round" />}
      </svg>
    </button>
  );
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#fff8e6" d="M27.6 4.5l1 5a15 15 0 0 1 4 1.7l4.3-2.8 5.1 5.1-2.8 4.3a15 15 0 0 1 1.7 4l5 1v7.2l-5 1a15 15 0 0 1-1.7 4l2.8 4.3-5.1 5.1-4.3-2.8a15 15 0 0 1-4 1.7l-1 5h-7.2l-1-5a15 15 0 0 1-4-1.7l-4.3 2.8-5.1-5.1 2.8-4.3a15 15 0 0 1-1.7-4l-5-1v-7.2l5-1a15 15 0 0 1 1.7-4L6 12.5l5.1-5.1 4.3 2.8a15 15 0 0 1 4-1.7l1-5zM24 16.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z" />
    </svg>
  );
}

export function Loading({ label = 'よみこみちゅう…' }: { label?: string }) {
  return <div className="loading"><img src={img('butterfly')} alt="" className="loading-bug" />{label}</div>;
}
