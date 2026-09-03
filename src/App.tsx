import { Home } from './components/Home';
import { MatchPage } from './components/MatchPage';
import { RulesPage } from './components/RulesPage';
import { ToastProvider } from './components/Toaster';

export function App() {
  const { pathname } = window.location;
  const match = pathname.match(/^\/play\/([^/]+)\/?$/);
  return (
    <ToastProvider>
      {/^\/rules\/?$/.test(pathname)
        ? <RulesPage />
        : match?.[1]
          ? <MatchPage matchID={decodeURIComponent(match[1])} />
          : <Home />}
    </ToastProvider>
  );
}
