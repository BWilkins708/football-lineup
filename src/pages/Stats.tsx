import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db';
import { playerStatsCsv, resultsCsv } from '../csv';
import { ALL_SEASONS, inSeason, seasonLabel } from '../seasons';
import { shareFile, slug } from '../share';
import { opponentRecords, record, seasonStats } from '../stats';
import { SeasonPicker, useTeam } from '../team';

type SortKey = 'apps' | 'goals' | 'assists' | 'cleanSheets' | 'total';

const COLUMNS: [SortKey, string][] = [
  ['apps', 'Apps'],
  ['goals', 'Goals'],
  ['assists', 'Assists'],
  ['cleanSheets', 'CS'],
  ['total', 'G+A'],
];

export function StatsPage() {
  const { team, season, startMonth } = useTeam();
  const players = useLiveQuery(() => db.players.where('teamId').equals(team.id).toArray(), [team.id]);
  const allResults = useLiveQuery(() => db.results.where('teamId').equals(team.id).toArray(), [team.id]);
  const [sort, setSort] = useState<SortKey>('goals');
  if (!players || !allResults) return null;

  const results = inSeason(allResults, season, startMonth);
  const stats = seasonStats(players, results);
  const rows = players
    .map((p) => {
      const s = stats.get(p.id)!;
      return { p, v: { apps: s.apps, goals: s.goals, assists: s.assists, cleanSheets: s.cleanSheets, total: s.goals + s.assists } };
    })
    .filter((r) => r.p.active || r.v.apps > 0 || r.v.total > 0)
    .sort((a, b) => b.v[sort] - a.v[sort] || b.v.total - a.v.total || a.p.name.localeCompare(b.p.name));
  const rec = record(results);
  const opponents = opponentRecords(results);
  // Hide columns nobody has anything in yet, e.g. appearances before "who played" was recorded.
  const columns = COLUMNS.filter(([k]) => k === 'goals' || k === 'assists' || rows.some((r) => r.v[k] > 0));

  const leader = (key: SortKey) => {
    const top = [...rows].sort((a, b) => b.v[key] - a.v[key])[0];
    return top && top.v[key] > 0 ? top : undefined;
  };
  const leaders: [string, SortKey][] = [['Top scorer', 'goals'], ['Most assists', 'assists']];

  const exportCsv = (kind: 'players' | 'results') => {
    const csv = kind === 'players' ? playerStatsCsv(players, results) : resultsCsv(results, players);
    const name = `${slug(team.name)}-${kind}-${slug(seasonLabel(season, startMonth))}.csv`;
    shareFile(new Blob([csv], { type: 'text/csv' }), name, `${team.name} ${kind}`);
  };

  return (
    <div className="page">
      <h1>Stats</h1>
      <SeasonPicker />
      <div className="tiles">
        <div className="tile wide">
          <span>Record</span>
          <b>{rec.W}-{rec.D}-{rec.L}</b>
          <span className="small">{results.length} game{results.length === 1 ? '' : 's'} · goals {rec.gf}–{rec.ga}</span>
        </div>
        <div className="tile wide">
          <span>Clean sheets</span>
          <b>{rec.cleanSheets}</b>
          <span className="small">Games without conceding</span>
        </div>
        {leaders.map(([label, key]) => {
          const l = leader(key);
          return (
            <div className="tile wide" key={key}>
              <span>{label}</span>
              <b>{l ? l.v[key] : '–'}</b>
              <span className="small">{l?.p.name ?? 'No data yet'}</span>
            </div>
          );
        })}
      </div>

      <h3>Players</h3>
      {rows.length === 0 ? <p className="muted">Add players and results to see stats.</p> : (
        <>
          <div className="table-wrap">
            <table className="table sortable">
              <thead>
                <tr>
                  <th>Player</th>
                  {columns.map(([k, label]) => (
                    <th key={k} className={sort === k ? 'sorted' : ''} onClick={() => setSort(k)}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, v }) => (
                  <tr key={p.id}>
                    <td><Link to={`/players/${p.id}`}>{p.number != null ? `${p.number}. ` : ''}{p.name}</Link></td>
                    {columns.map(([k]) => <td key={k}>{v[k] || ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Tap a column to sort. Apps counts games ticked under “Who played”; clean sheets go to keepers and defenders who played.</p>
        </>
      )}

      {opponents.length > 0 && (
        <>
          <h3>Against each opponent</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Opponent</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Goals</th></tr></thead>
              <tbody>
                {opponents.map((o) => (
                  <tr key={o.opponent}>
                    <td>{o.opponent}</td>
                    <td>{o.played}</td>
                    <td>{o.W}</td>
                    <td>{o.D}</td>
                    <td>{o.L}</td>
                    <td>{o.gf}–{o.ga}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {results.length > 0 && (
        <section className="backup">
          <h3>Export to a spreadsheet</h3>
          <p className="muted small">CSV files for {season === ALL_SEASONS ? 'all seasons' : `the ${seasonLabel(season, startMonth)} season`} that open in Excel, Numbers or Google Sheets.</p>
          <div className="row gap wrap">
            <button className="btn" onClick={() => exportCsv('players')}>Player stats</button>
            <button className="btn" onClick={() => exportCsv('results')}>Results</button>
          </div>
        </section>
      )}
    </div>
  );
}
