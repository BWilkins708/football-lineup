import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, exportData, importData } from '../db';
import { mins, seasonStats, type PlayerSeasonStats } from '../stats';

type SortKey = keyof Omit<PlayerSeasonStats, 'playerId'>;

const COLUMNS: [SortKey, string][] = [
  ['apps', 'Apps'],
  ['seconds', 'Min'],
  ['goals', 'G'],
  ['assists', 'A'],
  ['shots', 'Sh'],
  ['shotsOnTarget', 'SoT'],
  ['yellows', 'YC'],
  ['reds', 'RC'],
  ['cleanSheets', 'CS'],
];

export function StatsPage() {
  const players = useLiveQuery(() => db.players.toArray(), []);
  const matches = useLiveQuery(() => db.matches.toArray(), []);
  const [sort, setSort] = useState<SortKey>('goals');
  if (!players || !matches) return null;

  const stats = seasonStats(players, matches);
  const rows = players
    .map((p) => ({ p, s: stats.get(p.id)! }))
    .filter((r) => r.p.active || r.s.apps > 0)
    .sort((a, b) => b.s[sort] - a.s[sort] || b.s.seconds - a.s.seconds);
  const played = matches.filter((m) => m.status === 'finished').length;

  const leader = (key: SortKey) => {
    const top = [...rows].sort((a, b) => b.s[key] - a.s[key])[0];
    return top && top.s[key] > 0 ? top : undefined;
  };
  const leaders: [string, SortKey][] = [['Top scorer', 'goals'], ['Most assists', 'assists'], ['Most minutes', 'seconds']];

  return (
    <div className="page">
      <h1>Season stats</h1>
      <p className="muted small">{played} completed match{played === 1 ? '' : 'es'}.</p>
      <div className="tiles">
        {leaders.map(([label, key]) => {
          const l = leader(key);
          return (
            <div className="tile wide" key={key}>
              <span>{label}</span>
              <b>{l ? (key === 'seconds' ? mins(l.s.seconds) : l.s[key]) : '–'}</b>
              <span className="small">{l?.p.name ?? 'No data yet'}</span>
            </div>
          );
        })}
      </div>
      {rows.length === 0 ? <p className="muted">Add players and play a match to see stats.</p> : (
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
              {rows.map(({ p, s }) => (
                <tr key={p.id}>
                  <td><Link to={`/players/${p.id}`}>{p.number != null ? `${p.number}. ` : ''}{p.name}</Link></td>
                  {COLUMNS.map(([k]) => <td key={k}>{k === 'seconds' ? mins(s.seconds) : s[k] || ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Tap a column to sort. CS is clean sheets (60+ minutes played in a match with no goals conceded).</p>
      <Backup />
    </div>
  );
}

function Backup() {
  const file = useRef<HTMLInputElement>(null);

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
    if (!confirm('Restoring replaces all players, line-ups and matches on this device. Continue?')) return;
    try {
      await importData(JSON.parse(await f.text()));
      alert('Backup restored.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  return (
    <section className="backup">
      <h3>Backup</h3>
      <p className="muted small">Your data is stored on this device only. Download a backup to keep it safe or move it to another device.</p>
      <div className="row gap">
        <button className="btn" onClick={download}>Download backup</button>
        <button className="btn ghost" onClick={() => file.current?.click()}>Restore</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
      </div>
    </section>
  );
}
