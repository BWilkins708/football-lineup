import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, uid, type Goal, type Player, type Result } from '../db';
import { outcome, record, scorerSummary } from '../stats';
import { useTeam } from '../team';

// en-CA formats as yyyy-mm-dd in the device's local time zone.
const today = () => new Date().toLocaleDateString('en-CA');

const formatDate = (d: string) =>
  new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function MatchesPage() {
  const { team } = useTeam();
  const results = useLiveQuery(
    () => db.results.where('teamId').equals(team.id).sortBy('date').then((r) => r.reverse()),
    [team.id],
  );
  const players = useLiveQuery(() => db.players.where('teamId').equals(team.id).toArray(), [team.id]);
  if (!results || !players) return null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const rec = record(results);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Results</h1>
        <Link className="btn primary" to="/results/new">Add result</Link>
      </div>
      {results.length > 0 && (
        <p className="record">
          <b>{rec.W}</b>W <b>{rec.D}</b>D <b>{rec.L}</b>L · Goals {rec.gf}–{rec.ga}
        </p>
      )}
      {results.length === 0 ? (
        <div className="empty-state"><p>No results yet. Add one after each game with the score, scorers and assists.</p></div>
      ) : (
        <ul className="card-list">
          {results.map((r) => {
            const res = outcome(r);
            const scorers = scorerSummary(r, byId);
            return (
              <li key={r.id}>
                <Link to={`/results/${r.id}`} className="card-row">
                  <span className="grow">
                    <b>{r.venue === 'Home' ? 'v' : '@'} {r.opponent}</b>
                    <span className="muted small block">{formatDate(r.date)}{r.competition ? ` · ${r.competition}` : ''}</span>
                    {scorers && <span className="small block">⚽ {scorers}</span>}
                  </span>
                  <span className="score-pill"><span className={`res ${res}`}>{res}</span> {r.goalsFor}–{r.goalsAgainst}</span>
                  <span className="chev">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <span className="muted small">{label}</span>
      <div className="row">
        <button type="button" className="btn" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`${label} minus one`}>−</button>
        <b className="stepper-value">{value}</b>
        <button type="button" className="btn" onClick={() => onChange(value + 1)} aria-label={`${label} plus one`}>+</button>
      </div>
    </div>
  );
}

const OWN_GOAL = '__own_goal__';

export function ResultPage() {
  const { id } = useParams();
  // Remount per result so the form never carries over another result's draft.
  return <ResultForm key={id} id={id!} />;
}

function ResultForm({ id }: { id: string }) {
  const isNew = id === 'new';
  const navigate = useNavigate();
  // null once loaded when there is no saved result; undefined while loading.
  const existing = useLiveQuery(async () => (isNew ? null : (await db.results.get(id)) ?? null), [id, isNew]);
  const { team } = useTeam();
  const players = useLiveQuery(() => db.players.where('teamId').equals(team.id).toArray(), [team.id]);
  const [draft, setDraft] = useState<Result | undefined>();

  useEffect(() => {
    if (draft) return;
    if (isNew) {
      setDraft({ id: uid(), teamId: team.id, opponent: '', date: today(), venue: 'Home', goalsFor: 0, goalsAgainst: 0, goals: [], createdAt: Date.now() });
    } else if (existing) {
      setDraft(existing);
    }
  }, [isNew, existing, draft, team.id]);

  if (!players || (!isNew && existing === undefined)) return null;
  if (!isNew && !existing) return <div className="page"><p>Result not found.</p></div>;
  if (!draft) return null;

  const squad = players
    .filter((p) => p.active || draft.goals.some((g) => g.scorerId === p.id || g.assistId === p.id))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  const set = (patch: Partial<Result>) => setDraft({ ...draft, ...patch });

  const setGoalsFor = (n: number) => {
    const goals = draft.goals.slice(0, n);
    while (goals.length < n) goals.push({});
    set({ goalsFor: n, goals });
  };

  const setGoal = (i: number, patch: Goal) => {
    const goals = draft.goals.map((g, j) => (j === i ? { ...g, ...patch } : g));
    set({ goals });
  };

  const save = async () => {
    await db.results.put({ ...draft, opponent: draft.opponent.trim(), competition: draft.competition?.trim() || undefined });
    navigate('/matches');
  };

  const remove = async () => {
    if (!confirm('Delete this result?')) return;
    await db.results.delete(draft.id);
    navigate('/matches');
  };

  return (
    <div className="page">
      <Link to="/matches" className="back">‹ Results</Link>
      <h1>{isNew ? 'Add result' : 'Edit result'}</h1>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (draft.opponent.trim()) save(); }}>
        <label className="field"><span>Opponent</span><input autoFocus={isNew} value={draft.opponent} onChange={(e) => set({ opponent: e.target.value })} /></label>
        <div className="row gap">
          <label className="field grow"><span>Date</span><input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} /></label>
          <div className="field">
            <span>Venue</span>
            <div className="toggle-group">
              {(['Home', 'Away'] as const).map((v) => <button type="button" key={v} className={draft.venue === v ? 'on' : ''} onClick={() => set({ venue: v })}>{v}</button>)}
            </div>
          </div>
        </div>
        <label className="field"><span>Competition (optional)</span><input value={draft.competition ?? ''} onChange={(e) => set({ competition: e.target.value })} placeholder="League, Cup, Friendly…" /></label>

        <div className="score-entry">
          <Stepper label="Us" value={draft.goalsFor} onChange={setGoalsFor} />
          <span className="score-dash">–</span>
          <Stepper label={draft.opponent.trim() || 'Them'} value={draft.goalsAgainst} onChange={(n) => set({ goalsAgainst: n })} />
        </div>

        {draft.goalsFor > 0 && (
          <section>
            <h3>Our goals</h3>
            <ol className="goal-list">
              {draft.goals.map((g, i) => (
                <li key={i}>
                  <span className="num">{i + 1}</span>
                  <label className="field grow">
                    <span>Scorer</span>
                    <PlayerSelect
                      players={squad}
                      value={g.ownGoal ? OWN_GOAL : g.scorerId ?? ''}
                      onChange={(v) => setGoal(i, v === OWN_GOAL ? { ownGoal: true, scorerId: undefined } : { ownGoal: undefined, scorerId: v || undefined })}
                      empty="Not sure"
                      extra={<option value={OWN_GOAL}>Opponent own goal</option>}
                    />
                  </label>
                  <label className="field grow">
                    <span>Assist</span>
                    <PlayerSelect
                      players={squad.filter((p) => p.id !== g.scorerId)}
                      value={g.assistId ?? ''}
                      onChange={(v) => setGoal(i, { assistId: v || undefined })}
                      empty="No assist"
                    />
                  </label>
                </li>
              ))}
            </ol>
            {squad.length === 0 && <p className="muted small">Add players to your <Link to="/">squad</Link> to record scorers.</p>}
          </section>
        )}

        <button className="btn primary block" disabled={!draft.opponent.trim()}>Save result</button>
      </form>
      {!isNew && <button className="btn ghost danger" onClick={remove}>Delete result</button>}
    </div>
  );
}

function PlayerSelect({ players, value, onChange, empty, extra }: {
  players: Player[];
  value: string;
  onChange: (id: string) => void;
  empty: string;
  extra?: ReactNode;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {players.map((p) => <option key={p.id} value={p.id}>{p.number != null ? `${p.number}. ` : ''}{p.name}</option>)}
      {extra}
    </select>
  );
}
