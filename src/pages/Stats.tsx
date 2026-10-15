import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, exportData, importData } from '../db';
import { record, seasonStats } from '../stats';
import { useTeam } from '../team';

type SortKey = 'goals' | 'assists' | 'total';

const COLUMNS: [SortKey, string][] = [
  ['goals', 'Goals'],
  ['assists', 'Assists'],
  ['total', 'G+A'],
];

export function StatsPage() {
  const { team } = useTeam();
  const players = useLiveQuery(() => db.players.where('teamId').equals(team.id).toArray(), [team.id]);
  const results = useLiveQuery(() => db.results.where('teamId').equals(team.id).toArray(), [team.id]);
  const [sort, setSort] = useState<SortKey>('goals');
  if (!players || !results) return null;

  const stats = seasonStats(players, results);
  const rows = players
    .map((p) => {
      const s = stats.get(p.id)!;
      return { p, v: { goals: s.goals, assists: s.assists, total: s.goals + s.assists } };
    })
    .filter((r) => r.p.active || r.v.total > 0)
    .sort((a, b) => b.v[sort] - a.v[sort] || b.v.total - a.v.total || a.p.name.localeCompare(b.p.name));
  const rec = record(results);

  const leader = (key: SortKey) => {
    const top = [...rows].sort((a, b) => b.v[key] - a.v[key])[0];
    return top && top.v[key] > 0 ? top : undefined;
  };
  const leaders: [string, SortKey][] = [['Top scorer', 'goals'], ['Most assists', 'assists']];

  return (
    <div className="page">
      <h1>Season stats</h1>
      <p className="muted small">{team.name}</p>
      <div className="tiles">
        <div className="tile wide">
          <span>Record</span>
          <b>{rec.W}-{rec.D}-{rec.L}</b>
          <span className="small">{results.length} game{results.length === 1 ? '' : 's'} · goals {rec.gf}–{rec.ga}</span>
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
      {rows.length === 0 ? <p className="muted">Add players and results to see stats.</p> : (
        <div className="table-wrap">
          <table className="table sortable">
            <thead>
              <tr>
                <th>Player</th>
                {COLUMNS.map(([k, label]) => (
                  <th key={k} className={sort === k ? 'sorted' : ''} onClick={() => setSort(k)}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, v }) => (
                <tr key={p.id}>
                  <td><Link to={`/players/${p.id}`}>{p.number != null ? `${p.number}. ` : ''}{p.name}</Link></td>
                  {COLUMNS.map(([k]) => <td key={k}>{v[k] || ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Tap a column to sort.</p>
      <Backup />
    </div>
  );
}

function Backup() {
  const file = useRef<HTMLInputElement>(null);
  const { selectTeam } = useTeam();

  const download = async () => {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `soccer-lineup-backup-${new Date().toLocaleDateString('en-CA')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = async (f: File) => {
    if (!confirm('Restoring replaces all teams, players, line-ups and results on this device. Continue?')) return;
    try {
      selectTeam(await importData(JSON.parse(await f.text())));
      alert('Backup restored.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  return (
    <section className="backup">
      <h3>Backup</h3>
      <p className="muted small">Your data is stored on this device only. A backup includes all your teams; download one to keep it safe or move it to another device.</p>
      <div className="row gap">
        <button className="btn" onClick={download}>Download backup</button>
        <button className="btn ghost" onClick={() => file.current?.click()}>Restore</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
      </div>
    </section>
  );
}
