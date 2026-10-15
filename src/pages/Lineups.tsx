import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, uid, type LineupTemplate } from '../db';
import { LineupEditor } from '../components';
import { sizeOf } from '../formations';

export function LineupsPage() {
  const lineups = useLiveQuery(() => db.lineups.orderBy('updatedAt').reverse().toArray(), []);
  const navigate = useNavigate();
  if (!lineups) return null;

  const create = async () => {
    const id = uid();
    await db.lineups.add({ id, name: 'New line-up', formation: '4-4-2', slots: {}, bench: [], updatedAt: Date.now() });
    navigate(`/lineups/${id}`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Line-ups</h1>
        <button className="btn primary" onClick={create}>New line-up</button>
      </div>
      <p className="muted small">Plan your team and formation for matchday.</p>
      {lineups.length === 0 ? (
        <div className="empty-state"><p>No saved line-ups yet.</p></div>
      ) : (
        <ul className="card-list">
          {lineups.map((l) => (
            <li key={l.id}>
              <Link to={`/lineups/${l.id}`} className="card-row">
                <span className="grow"><b>{l.name}</b><span className="muted small block">{sizeOf(l.formation)}-a-side · {l.formation} · {Object.values(l.slots).filter(Boolean).length} starters · {l.bench.length} subs</span></span>
                <span className="chev">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LineupEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const saved = useLiveQuery(() => db.lineups.get(id!), [id]);
  const players = useLiveQuery(() => db.players.toArray(), []);
  const [draft, setDraft] = useState<LineupTemplate | undefined>();

  useEffect(() => {
    if (saved && !draft) setDraft(saved);
  }, [saved, draft]);

  if (saved === undefined || !players) return null;
  if (!saved || !draft) return <div className="page"><p>Line-up not found.</p></div>;

  const update = (l: LineupTemplate) => {
    const next = { ...l, updatedAt: Date.now() };
    setDraft(next);
    db.lineups.put(next);
  };

  const remove = async () => {
    if (!confirm(`Delete "${draft.name}"?`)) return;
    await db.lineups.delete(draft.id);
    navigate('/lineups');
  };

  return (
    <div className="page">
      <Link to="/lineups" className="back">‹ Line-ups</Link>
      <label className="field">
        <span>Name</span>
        <input value={draft.name} onChange={(e) => update({ ...draft, name: e.target.value })} />
      </label>
      {players.length === 0 ? (
        <p className="muted">Add players to your <Link to="/">squad</Link> first.</p>
      ) : (
        <LineupEditor lineup={draft} players={players} onChange={(l) => update({ ...draft, ...l })} />
      )}
      <p className="muted small">Changes save automatically.</p>
      <button className="btn ghost danger" onClick={remove}>Delete line-up</button>
    </div>
  );
}
