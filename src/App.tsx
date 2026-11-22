import { useEffect, useMemo, useState } from 'react';
import { Loading, Screen } from './components/ui';
import { createRepo } from './lib/config';
import type { AuthUser } from './lib/repo';
import { setBgm } from './lib/sound';
import { useRoute, type Route } from './router';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { Login, SetupNeeded } from './screens/Login';
import { Points } from './screens/Points';
import { Result } from './screens/Result';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { AppProvider } from './store';

export default function App() {
  const repo = useMemo(() => createRepo(), []);
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const route = useRoute();

  // BGM: main everywhere, none while playing むしさがし, clear on the result screen
  useEffect(() => {
    setBgm(user && route.name === 'game' ? null : user && route.name === 'result' ? 'clear' : 'main');
  }, [user, route.name]);

  useEffect(() => {
    if (!repo) return;
    let live = true;
    repo.getUser().then((u) => { if (live) setUser(u); });
    const off = repo.onAuthChange((u) => setUser(u));
    return () => { live = false; off(); };
  }, [repo]);

  if (!repo) return <SetupNeeded />;
  if (user === undefined) return <Screen><Loading /></Screen>;
  if (!user) return <Login repo={repo} />;
  return (
    <AppProvider key={user.id} repo={repo}>
      <Router route={route} />
    </AppProvider>
  );
}

function Router({ route }: { route: Route }) {
  switch (route.name) {
    case 'points': return <Points />;
    case 'setup': return <Setup />;
    case 'game': return <Game />;
    case 'result': return <Result sessionId={route.sessionId} />;
    case 'settings': return <Settings />;
    default: return <Home />;
  }
}
