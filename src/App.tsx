import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { PlayerPage, SquadPage } from './pages/Squad';
import { LineupEditPage, LineupsPage } from './pages/Lineups';
import { MatchesPage, ResultPage } from './pages/Matches';
import { StatsPage } from './pages/Stats';
import { BackupReminder, TeamBar, TeamProvider, useTeam } from './team';

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const NAV = [
  { to: '/', label: 'Squad', end: true, icon: icon('M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7') },
  { to: '/lineups', label: 'Line-ups', icon: icon('M5 3h14v18H5zM5 12h14M12 3v3M12 18v3M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4') },
  { to: '/matches', label: 'Results', icon: icon('M8 4h8v6a4 4 0 0 1-8 0zM16 6h3v1a3 3 0 0 1-3 3M8 6H5v1a3 3 0 0 0 3 3M12 14v3M8 20h8M9.5 17h5v3h-5z') },
  { to: '/stats', label: 'Stats', icon: icon('M4 20h16M7 16v-4M12 16V6M17 16v-7') },
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
      <BackupReminder />
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
            <span className="tab-icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
