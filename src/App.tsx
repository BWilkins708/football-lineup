import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { PlayerPage, SquadPage } from './pages/Squad';
import { LineupEditPage, LineupsPage } from './pages/Lineups';
import { MatchesPage, ResultPage } from './pages/Matches';
import { StatsPage } from './pages/Stats';
import { TeamBar, TeamProvider, useTeam } from './team';

const NAV = [
  { to: '/', label: 'Squad', icon: '👥', end: true },
  { to: '/lineups', label: 'Line-ups', icon: '📋' },
  { to: '/matches', label: 'Results', icon: '⚽' },
  { to: '/stats', label: 'Stats', icon: '📊' },
];

export default function App() {
  return (
    <HashRouter>
      <TeamProvider>
        <Shell />
      </TeamProvider>
    </HashRouter>
  );
}

function Shell() {
  const { team } = useTeam();
  return (
    <div className="app">
      <TeamBar />
      {/* Remount pages on team switch so no page keeps another team's data. */}
      <main key={team.id}>
        <Routes>
          <Route path="/" element={<SquadPage />} />
          <Route path="/players/:id" element={<PlayerPage />} />
          <Route path="/lineups" element={<LineupsPage />} />
          <Route path="/lineups/:id" element={<LineupEditPage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/results/:id" element={<ResultPage />} />
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
  );
}
