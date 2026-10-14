import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { PlayerPage, SquadPage } from './pages/Squad';
import { LineupEditPage, LineupsPage } from './pages/Lineups';
import { MatchesPage } from './pages/Matches';
import { MatchPage } from './pages/MatchPage';
import { StatsPage } from './pages/Stats';

const NAV = [
  { to: '/', label: 'Squad', icon: '👥', end: true },
  { to: '/lineups', label: 'Line-ups', icon: '📋' },
  { to: '/matches', label: 'Matches', icon: '⚽' },
  { to: '/stats', label: 'Stats', icon: '📊' },
];

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <main>
          <Routes>
            <Route path="/" element={<SquadPage />} />
            <Route path="/players/:id" element={<PlayerPage />} />
            <Route path="/lineups" element={<LineupsPage />} />
            <Route path="/lineups/:id" element={<LineupEditPage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="/matches/:id" element={<MatchPage />} />
            <Route path="/stats" element={<StatsPage />} />
          </Routes>
        </main>
        <nav className="tabbar">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <span aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </HashRouter>
  );
}
