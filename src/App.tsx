import { Home } from './components/Home';
import { MatchPage } from './components/MatchPage';
import { RulesPage } from './components/RulesPage';

export function App() {
  const { pathname } = window.location;
  if (/^\/rules\/?$/.test(pathname)) return <RulesPage />;
  const match = pathname.match(/^\/play\/([^/]+)\/?$/);
  if (match?.[1]) return <MatchPage matchID={decodeURIComponent(match[1])} />;
  return <Home />;
}
