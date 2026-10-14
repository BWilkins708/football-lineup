import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db, uid, type Match } from '../db';
import { Modal } from '../components';
import { score } from '../stats';

// en-CA formats as yyyy-mm-dd in the device's local time zone.
const today = () => new Date().toLocaleDateString('en-CA');

export function MatchesPage() {
  const matches = useLiveQuery(() => db.matches.orderBy('date').reverse().toArray(), []);
  const [creating, setCreating] = useState(false);
  if (!matches) return null;

  const live = matches.filter((m) => m.status !== 'setup' && m.status !== 'finished');
  const upcoming = matches.filter((m) => m.status === 'setup').reverse();
  const played = matches.filter((m) => m.status === 'finished');
  const record = played.reduce(
    (r, m) => {
      const s = score(m);
      if (s.us > s.them) r.w++; else if (s.us < s.them) r.l++; else r.d++;
      r.gf += s.us; r.ga += s.them;
      return r;
    },
    { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Matches</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>New match</button>
      </div>
      {played.length > 0 && (
        <p className="record">
          <b>{record.w}</b>W <b>{record.d}</b>D <b>{record.l}</b>L · Goals {record.gf}–{record.ga}
        </p>
      )}
      {matches.length === 0 && <div className="empty-state"><p>No matches yet. Create one to pick your line-up and track it live.</p></div>}
      <MatchGroup title="Live" matches={live} />
      <MatchGroup title="Upcoming" matches={upcoming} />
      <MatchGroup title="Results" matches={played} />
      {creating && <NewMatchForm onClose={() => setCreating(false)} />}
    </div>
  );
}

function MatchGroup({ title, matches }: { title: string; matches: Match[] }) {
  if (!matches.length) return null;
  return (
    <section>
      <h3 className="group-title">{title}</h3>
      <ul className="card-list">
        {matches.map((m) => {
          const s = score(m);
          const res = m.status === 'finished' ? (s.us > s.them ? 'W' : s.us < s.them ? 'L' : 'D') : null;
          return (
            <li key={m.id}>
              <Link to={`/matches/${m.id}`} className="card-row">
                <span className="grow">
                  <b>{m.venue === 'Home' ? 'v' : '@'} {m.opponent}</b>
                  <span className="muted small block">{new Date(m.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{m.competition ? ` · ${m.competition}` : ''}</span>
                </span>
                {m.status === 'setup' ? <span className="muted small">Set up</span> : (
                  <span className="score-pill">{res && <span className={`res ${res}`}>{res}</span>} {s.us}–{s.them}{res ? '' : ' · live'}</span>
                )}
                <span className="chev">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NewMatchForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const lineups = useLiveQuery(() => db.lineups.orderBy('updatedAt').reverse().toArray(), []);
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(today());
  const [venue, setVenue] = useState<'Home' | 'Away'>('Home');
  const [competition, setCompetition] = useState('');
  const [halfLength, setHalfLength] = useState(45);
  const [template, setTemplate] = useState('');

  const save = async () => {
    const t = lineups?.find((l) => l.id === template);
    const id = uid();
    await db.matches.add({
      id,
      opponent: opponent.trim(),
      date,
      venue,
      competition: competition.trim() || undefined,
      halfLength,
      lineup: t ? { formation: t.formation, slots: { ...t.slots }, bench: [...t.bench], captainId: t.captainId } : { formation: '4-4-2', slots: {}, bench: [] },
      status: 'setup',
      clock: { running: false, elapsedBefore: 0 },
      events: [],
      createdAt: Date.now(),
    });
    navigate(`/matches/${id}`);
  };

  return (
    <Modal title="New match" onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (opponent.trim()) save(); }}>
        <label className="field"><span>Opponent</span><input autoFocus value={opponent} onChange={(e) => setOpponent(e.target.value)} /></label>
        <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="field">
          <span>Venue</span>
          <div className="toggle-group">
            {(['Home', 'Away'] as const).map((v) => <button type="button" key={v} className={venue === v ? 'on' : ''} onClick={() => setVenue(v)}>{v}</button>)}
          </div>
        </div>
        <label className="field"><span>Competition (optional)</span><input value={competition} onChange={(e) => setCompetition(e.target.value)} placeholder="League, Cup, Friendly…" /></label>
        <label className="field"><span>Half length (minutes)</span><input type="number" inputMode="numeric" min={5} max={60} value={halfLength} onChange={(e) => setHalfLength(Number(e.target.value) || 45)} /></label>
        {!!lineups?.length && (
          <label className="field">
            <span>Start from saved line-up</span>
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">None</option>
              {lineups.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.formation})</option>)}
            </select>
          </label>
        )}
        <button className="btn primary block" disabled={!opponent.trim()}>Create match</button>
      </form>
    </Modal>
  );
}
