import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'points' }
  | { name: 'setup' }
  | { name: 'game' }
  | { name: 'result'; sessionId: string }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'points': return { name: 'points' };
    case 'setup': return { name: 'setup' };
    case 'game': return { name: 'game' };
    case 'settings': return { name: 'settings' };
    case 'result': return parts[1] ? { name: 'result', sessionId: parts[1] } : { name: 'home' };
    default: return { name: 'home' };
  }
}

export function href(r: Route): string {
  return r.name === 'result' ? `#/result/${r.sessionId}` : r.name === 'home' ? '#/' : `#/${r.name}`;
}

export function navigate(r: Route, opts: { replace?: boolean } = {}) {
  const h = href(r);
  if (opts.replace) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => { setRoute(parseHash(location.hash)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
  }, []);
  return route;
}
