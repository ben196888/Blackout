import { Home } from './components/Home';
import { MatchPage } from './components/MatchPage';

export function App() {
  const match = window.location.pathname.match(/^\/play\/([^/]+)\/?$/);
  if (match?.[1]) return <MatchPage matchID={decodeURIComponent(match[1])} />;
  return <Home />;
}
