import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, uid, type Foot, type Player, type Position } from '../db';
import { Modal } from '../components';
import { formatMinute, matchPlayerStats, mins, score, seasonStats } from '../stats';

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

export function SquadPage() {
  const players = useLiveQuery(() => db.players.toArray(), []);
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  if (!players) return null;

  const sorted = [...players]
    .filter((p) => showInactive || p.active)
    .sort((a, b) => POSITIONS.indexOf(a.positions[0]) - POSITIONS.indexOf(b.positions[0]) || (a.number ?? 999) - (b.number ?? 999));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Squad</h1>
        <button className="btn primary" onClick={() => setEditing('new')}>Add player</button>
      </div>
      {players.length === 0 ? (
        <div className="empty-state">
          <p>Start by adding the players in your squad.</p>
          <button className="btn primary" onClick={() => setEditing('new')}>Add your first player</button>
        </div>
      ) : (
        <>
          {POSITIONS.map((pos) => {
            const group = sorted.filter((p) => p.positions[0] === pos);
            if (!group.length) return null;
            return (
              <section key={pos}>
                <h3 className="group-title">{({ GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' })[pos]}</h3>
                <ul className="card-list">
                  {group.map((p) => (
                    <li key={p.id}>
                      <Link to={`/players/${p.id}`} className={`card-row${p.active ? '' : ' dim'}`}>
                        <span className="num big">{p.number ?? '–'}</span>
                        <span className="grow">
                          <b>{p.name}</b>
                          <span className="muted small block">{p.positions.join(' / ')}{p.foot ? ` · ${p.foot} foot` : ''}{p.active ? '' : ' · inactive'}</span>
                        </span>
                        <span className="chev">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <label className="check muted small">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive players
          </label>
        </>
      )}
      {editing && <PlayerForm player={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function PlayerForm({ player, onClose }: { player?: Player; onClose: () => void }) {
  const [name, setName] = useState(player?.name ?? '');
  const [number, setNumber] = useState(player?.number?.toString() ?? '');
  const [positions, setPositions] = useState<Position[]>(player?.positions ?? []);
  const [foot, setFoot] = useState<Foot | ''>(player?.foot ?? '');
  const [notes, setNotes] = useState(player?.notes ?? '');
  const [active, setActive] = useState(player?.active ?? true);

  const toggle = (p: Position) => setPositions((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const valid = name.trim().length > 0 && positions.length > 0;

  const save = async () => {
    if (!valid) return;
    const data: Player = {
      id: player?.id ?? uid(),
      name: name.trim(),
      number: number ? Number(number) : undefined,
      positions,
      foot: foot || undefined,
      notes: notes.trim() || undefined,
      active,
      createdAt: player?.createdAt ?? Date.now(),
    };
    await db.players.put(data);
    onClose();
  };

  return (
    <Modal title={player ? 'Edit player' : 'Add player'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam Carter" />
        </label>
        <label className="field">
          <span>Shirt number</span>
          <input type="number" inputMode="numeric" min={0} max={99} value={number} onChange={(e) => setNumber(e.target.value)} />
        </label>
        <div className="field">
          <span>Positions (first is main)</span>
          <div className="toggle-group">
            {POSITIONS.map((p) => (
              <button type="button" key={p} className={positions.includes(p) ? 'on' : ''} onClick={() => toggle(p)}>
                {p}{positions[0] === p ? ' ★' : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Strong foot</span>
          <div className="toggle-group">
            {(['Left', 'Right', 'Both'] as Foot[]).map((f) => (
              <button type="button" key={f} className={foot === f ? 'on' : ''} onClick={() => setFoot(foot === f ? '' : f)}>{f}</button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {player && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active in squad
          </label>
        )}
        <button className="btn primary block" disabled={!valid}>Save</button>
      </form>
    </Modal>
  );
}

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const player = useLiveQuery(() => db.players.get(id!), [id]);
  const matches = useLiveQuery(() => db.matches.orderBy('date').reverse().toArray(), []);
  const [editing, setEditing] = useState(false);
  if (player === undefined || !matches) return null;
  if (!player) return <div className="page"><p>Player not found.</p></div>;

  const season = seasonStats([player], matches).get(player.id)!;
  const log = matches
    .filter((m) => m.status !== 'setup')
    .map((m) => ({ m, s: matchPlayerStats(m).get(player.id) }))
    .filter((r) => r.s?.appeared);

  const remove = async () => {
    const used = matches.some((m) => matchPlayerStats(m).has(player.id));
    if (used) {
      if (confirm(`${player.name} has match history. Mark them inactive instead of deleting?`)) {
        await db.players.update(player.id, { active: false });
      }
      return;
    }
    if (confirm(`Delete ${player.name}?`)) {
      await db.players.delete(player.id);
      navigate('/');
    }
  };

  const tiles: [string, number | string][] = [
    ['Apps', season.apps],
    ['Starts', season.starts],
    ['Minutes', mins(season.seconds)],
    ['Goals', season.goals],
    ['Assists', season.assists],
    ['Shots', season.shots],
    ['On target', season.shotsOnTarget],
    ['Yellows', season.yellows],
    ['Reds', season.reds],
  ];
  if (player.positions.includes('GK') || player.positions.includes('DEF')) tiles.push(['Clean sheets', season.cleanSheets]);

  return (
    <div className="page">
      <Link to="/" className="back">‹ Squad</Link>
      <div className="profile-head">
        <span className="num huge">{player.number ?? '–'}</span>
        <div className="grow">
          <h1>{player.name}</h1>
          <p className="muted">{player.positions.join(' / ')}{player.foot ? ` · ${player.foot} foot` : ''}{player.active ? '' : ' · inactive'}</p>
        </div>
        <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
      </div>
      {player.notes && <p className="notes">{player.notes}</p>}

      <h3>Season</h3>
      <div className="tiles">
        {tiles.map(([label, v]) => (
          <div className="tile" key={label}><b>{v}</b><span>{label}</span></div>
        ))}
      </div>
      {season.apps > 0 && (
        <p className="muted small">
          {(season.goals + season.assists) > 0 ? `${Math.round(mins(season.seconds) / (season.goals + season.assists))} minutes per goal or assist. ` : ''}
          Average {Math.round(mins(season.seconds) / season.apps)} minutes per appearance.
        </p>
      )}

      <h3>Match log</h3>
      {log.length === 0 ? <p className="muted">No appearances yet.</p> : (
        <table className="table">
          <thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th>Min</th><th>G</th><th>A</th></tr></thead>
          <tbody>
            {log.map(({ m, s }) => {
              const sc = score(m);
              const res = sc.us > sc.them ? 'W' : sc.us < sc.them ? 'L' : 'D';
              return (
                <tr key={m.id} onClick={() => navigate(`/matches/${m.id}`)} className="clickable">
                  <td>{m.date.slice(5)}</td>
                  <td>{m.opponent}{s!.started ? '' : ' (sub)'}</td>
                  <td><span className={`res ${res}`}>{res}</span> {sc.us}–{sc.them}</td>
                  <td>{mins(s!.seconds)}</td>
                  <td>{s!.goals || ''}</td>
                  <td>{s!.assists || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {log.length > 0 && <GoalList playerId={player.id} matches={log.map((r) => r.m)} />}

      <button className="btn ghost danger" onClick={remove}>Delete player</button>
      {editing && <PlayerForm player={player} onClose={() => setEditing(false)} />}
    </div>
  );
}

function GoalList({ playerId, matches }: { playerId: string; matches: import('../db').Match[] }) {
  const goals = matches.flatMap((m) =>
    m.events.filter((e) => e.type === 'goal' && e.playerId === playerId && !e.ownGoal).map((e) => ({ m, e })),
  );
  if (!goals.length) return null;
  return (
    <p className="muted small">
      Goals: {goals.map(({ m, e }) => `${formatMinute(m, e)} v ${m.opponent}${e.penalty ? ' (pen)' : ''}`).join(', ')}
    </p>
  );
}
