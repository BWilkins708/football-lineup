import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, uid, type Foot, type Player, type Position } from '../db';
import { Modal } from '../components';
import { SeasonPicker, useTeam } from '../team';
import { earnsCleanSheets, outcome, seasonStats } from '../stats';
import { inSeason } from '../seasons';
import { parsePlayerList } from '../players';

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const GROUPS: [Position | undefined, string][] = [['GK', 'Goalkeepers'], ['DEF', 'Defenders'], ['MID', 'Midfielders'], ['FWD', 'Forwards'], [undefined, 'No position yet']];
/** Sort order for a main position, with players who have none last. */
const posOrder = (p: Player) => (p.positions.length ? POSITIONS.indexOf(p.positions[0]) : POSITIONS.length);


export function SquadPage() {
  const { team } = useTeam();
  const players = useLiveQuery(() => db.players.where('teamId').equals(team.id).toArray(), [team.id]);
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  if (!players) return null;

  const sorted = [...players]
    .filter((p) => showInactive || p.active)
    .sort((a, b) => posOrder(a) - posOrder(b) || (a.number ?? 999) - (b.number ?? 999));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Squad</h1>
        <button className="btn primary" onClick={() => setEditing('new')}>Add player</button>
      </div>
      {players.length === 0 ? (
        <div className="empty-state">
          <p>Start by adding the players in your squad. You can paste a whole list at once.</p>
          <div className="row gap center-row">
            <button className="btn primary" onClick={() => setQuickAdd(true)}>Add your squad</button>
            <button className="btn ghost" onClick={() => setEditing('new')}>Add one player</button>
          </div>
        </div>
      ) : (
        <>
          {GROUPS.map(([pos, title]) => {
            const group = sorted.filter((p) => p.positions[0] === pos);
            if (!group.length) return null;
            return (
              <section key={title}>
                <h3 className="group-title">{title}</h3>
                <ul className="card-list">
                  {group.map((p) => (
                    <li key={p.id}>
                      <Link to={`/players/${p.id}`} className={`card-row${p.active ? '' : ' dim'}`}>
                        <span className="num big">{p.number ?? '–'}</span>
                        <span className="grow">
                          <b>{p.name}</b>
                          <span className="muted small block">{[p.positions.join(' / '), p.foot && `${p.foot} foot`, !p.active && 'inactive'].filter(Boolean).join(' · ') || 'Tap to add positions'}</span>
                        </span>
                        <span className="chev">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <div className="row gap">
            <label className="check muted small grow">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive players
            </label>
            <button className="btn ghost small-btn" onClick={() => setQuickAdd(true)}>Add several</button>
          </div>
        </>
      )}
      {editing && <PlayerForm player={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {quickAdd && <QuickAdd onClose={() => setQuickAdd(false)} />}
    </div>
  );
}

function QuickAdd({ onClose }: { onClose: () => void }) {
  const { team } = useTeam();
  const [text, setText] = useState('');
  const parsed = parsePlayerList(text);

  const save = async () => {
    const now = Date.now();
    await db.players.bulkAdd(
      parsed.map((p, i) => ({ id: uid(), teamId: team.id, name: p.name, number: p.number, positions: [], active: true, createdAt: now + i })),
    );
    onClose();
  };

  return (
    <Modal title="Add several players" onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (parsed.length) save(); }}>
        <label className="field">
          <span>One player per line, shirt number first if you like</span>
          <textarea autoFocus rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1 Alex Green\n4 Sam Carter\n9 Jo Reid'} />
        </label>
        <p className="muted small">You can add positions later by tapping a player. Line-up auto-fill uses them.</p>
        <button className="btn primary block" disabled={!parsed.length}>
          Add {parsed.length || ''} player{parsed.length === 1 ? '' : 's'}
        </button>
      </form>
    </Modal>
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
  const valid = name.trim().length > 0;

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
          <span>Positions (first is main, optional)</span>
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
  const { team, season: seasonKey, startMonth } = useTeam();
  const allResults = useLiveQuery(
    () => db.results.where('teamId').equals(team.id).sortBy('date').then((r) => r.reverse()),
    [team.id],
  );
  const [editing, setEditing] = useState(false);
  if (player === undefined || !allResults) return null;
  if (!player) return <div className="page"><p>Player not found.</p></div>;

  const results = inSeason(allResults, seasonKey, startMonth);
  const season = seasonStats([player], results).get(player.id)!;
  const log = results
    .map((r) => ({
      r,
      played: !!r.playedIds?.includes(player.id),
      goals: r.goals.filter((g) => g.scorerId === player.id && !g.ownGoal).length,
      assists: r.goals.filter((g) => g.assistId === player.id).length,
    }))
    .filter((row) => row.played || row.goals || row.assists);
  const hasRecords = allResults.some((r) => r.playedIds?.includes(player.id) || r.goals.some((g) => g.scorerId === player.id || g.assistId === player.id));

  const remove = async () => {
    if (hasRecords) {
      if (confirm(`${player.name} has games, goals or assists recorded. Mark them inactive instead of deleting?`)) {
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
    ['Games', season.apps],
    ['Goals', season.goals],
    ['Assists', season.assists],
    ...(earnsCleanSheets(player) ? [['Clean sheets', season.cleanSheets] as [string, number]] : []),
  ];

  return (
    <div className="page">
      <Link to="/" className="back">‹ Squad</Link>
      <div className="profile-head">
        <span className="num huge">{player.number ?? '–'}</span>
        <div className="grow">
          <h1>{player.name}</h1>
          <p className="muted">{[player.positions.join(' / '), player.foot && `${player.foot} foot`, !player.active && 'inactive'].filter(Boolean).join(' · ')}</p>
        </div>
        <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
      </div>
      {player.notes && <p className="notes">{player.notes}</p>}

      <h3>Season</h3>
      <SeasonPicker />
      <div className="tiles">
        {tiles.map(([label, v]) => (
          <div className="tile" key={label}><b>{v}</b><span>{label}</span></div>
        ))}
      </div>

      <h3>Games</h3>
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
