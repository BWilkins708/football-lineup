import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, uid, type Foot, type Player, type Position } from '../db';
import { Modal } from '../components';
import { useTeam } from '../team';
import { outcome, seasonStats } from '../stats';

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

export function SquadPage() {
  const { team } = useTeam();
  const players = useLiveQuery(() => db.players.where('teamId').equals(team.id).toArray(), [team.id]);
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
  const { team } = useTeam();
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
      teamId: player?.teamId ?? team.id,
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
  const { team } = useTeam();
  const results = useLiveQuery(
    () => db.results.where('teamId').equals(team.id).sortBy('date').then((r) => r.reverse()),
    [team.id],
  );
  const [editing, setEditing] = useState(false);
  if (player === undefined || !results) return null;
  if (!player) return <div className="page"><p>Player not found.</p></div>;

  const season = seasonStats([player], results).get(player.id)!;
  const log = results
    .map((r) => ({
      r,
      goals: r.goals.filter((g) => g.scorerId === player.id && !g.ownGoal).length,
      assists: r.goals.filter((g) => g.assistId === player.id).length,
    }))
    .filter((row) => row.goals || row.assists);

  const remove = async () => {
    if (log.length) {
      if (confirm(`${player.name} has goals or assists recorded. Mark them inactive instead of deleting?`)) {
        await db.players.update(player.id, { active: false });
      }
      return;
    }
    if (confirm(`Delete ${player.name}?`)) {
      await db.players.delete(player.id);
      navigate('/');
    }
  };

  const tiles: [string, number][] = [
    ['Goals', season.goals],
    ['Assists', season.assists],
    ['Goals + assists', season.goals + season.assists],
  ];

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

      <h3>Goals and assists by match</h3>
      {log.length === 0 ? <p className="muted">None recorded yet.</p> : (
        <table className="table">
          <thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th>G</th><th>A</th></tr></thead>
          <tbody>
            {log.map(({ r, goals, assists }) => {
              const res = outcome(r);
              return (
                <tr key={r.id} onClick={() => navigate(`/results/${r.id}`)} className="clickable">
                  <td>{r.date.slice(5)}</td>
                  <td>{r.opponent}</td>
                  <td><span className={`res ${res}`}>{res}</span> {r.goalsFor}–{r.goalsAgainst}</td>
                  <td>{goals || ''}</td>
                  <td>{assists || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <button className="btn ghost danger" onClick={remove}>Delete player</button>
      {editing && <PlayerForm player={player} onClose={() => setEditing(false)} />}
    </div>
  );
}
