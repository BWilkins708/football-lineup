import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db, uid, type Goal, type LineupTemplate, type Player, type Result } from '../db';
import { inSeason, today } from '../seasons';
import { outcome, record, scorerSummary } from '../stats';
import { SeasonPicker, useTeam } from '../team';

const formatDate = (d: string) =>
  new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function MatchesPage() {
  const { team, season, startMonth } = useTeam();
  const allResults = useLiveQuery(
    () => db.results.where('teamId').equals(team.id).sortBy('date').then((r) => r.reverse()),
    [team.id],
  );
  const players = useLiveQuery(() => db.players.where('teamId').equals(team.id).toArray(), [team.id]);
  if (!allResults || !players) return null;
  const results = inSeason(allResults, season, startMonth);
  const byId = new Map(players.map((p) => [p.id, p]));
  const rec = record(results);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Results</h1>
        <Link className="btn primary" to="/results/new">Add result</Link>
      </div>
      <SeasonPicker />
      {results.length > 0 && (
        <p className="record">
          <b>{rec.W}</b>W <b>{rec.D}</b>D <b>{rec.L}</b>L · Goals {rec.gf}–{rec.ga}{rec.cleanSheets ? ` · ${rec.cleanSheets} clean sheet${rec.cleanSheets === 1 ? '' : 's'}` : ''}
        </p>
      )}
      {results.length === 0 ? (
        <div className="empty-state"><p>{allResults.length ? 'No results this season yet.' : 'No results yet. Add one after each game with the score, who played and who scored.'}</p></div>
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
  const [params] = useSearchParams();
  const fromLineup = params.get('lineup');
  const players = useLiveQuery(() => db.players.where('teamId').equals(team.id).toArray(), [team.id]);
  const lineups = useLiveQuery(
    () => db.lineups.where('teamId').equals(team.id).sortBy('updatedAt').then((l) => l.reverse()),
    [team.id],
  );
  const [draft, setDraft] = useState<Result | undefined>();

  useEffect(() => {
    if (draft || !players || !lineups) return;
    if (isNew) {
      // Start with the line-up the coach came from, otherwise everyone in the squad.
      const lineup = lineups.find((l) => l.id === fromLineup);
      const playedIds = lineup ? lineupPlayers(lineup, players) : players.filter((p) => p.active).map((p) => p.id);
      setDraft({ id: uid(), teamId: team.id, opponent: '', date: today(), venue: 'Home', goalsFor: 0, goalsAgainst: 0, goals: [], playedIds, createdAt: Date.now() });
    } else if (existing) {
      setDraft(existing);
    }
  }, [isNew, existing, draft, team.id, players, lineups, fromLineup]);

  if (!players || !lineups || (!isNew && existing === undefined)) return null;
  if (!isNew && !existing) return <div className="page"><p>Result not found.</p></div>;
  if (!draft) return null;

  const played = new Set(draft.playedIds ?? []);
  const squad = players
    .filter((p) => p.active || played.has(p.id) || draft.goals.some((g) => g.scorerId === p.id || g.assistId === p.id))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  // Only offer players who played as scorers, once anyone is ticked.
  const scorers = played.size ? squad.filter((p) => played.has(p.id) || draft.goals.some((g) => g.scorerId === p.id || g.assistId === p.id)) : squad;
  const set = (patch: Partial<Result>) => setDraft({ ...draft, ...patch });
  const setPlayed = (ids: string[]) => set({ playedIds: ids });
  const togglePlayed = (id: string) => setPlayed(played.has(id) ? [...played].filter((x) => x !== id) : [...played, id]);

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
    await db.results.put({ ...draft, opponent: draft.opponent.trim(), competition: draft.competition?.trim() || undefined, updatedAt: Date.now() });
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

        <section>
          <div className="section-head">
            <h3>Who played ({played.size})</h3>
            <div className="row">
              <button type="button" className="btn ghost small-btn" onClick={() => setPlayed(squad.filter((p) => p.active).map((p) => p.id))}>All</button>
              <button type="button" className="btn ghost small-btn" onClick={() => setPlayed([])}>None</button>
            </div>
          </div>
          {lineups.length > 0 && (
            <label className="field inline">
              <span>Use line-up</span>
              <select value="" onChange={(e) => { const l = lineups.find((x) => x.id === e.target.value); if (l) setPlayed(lineupPlayers(l, players)); }}>
                <option value="">Choose…</option>
                {lineups.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}
          {squad.length === 0 ? (
            <p className="muted small">Add players to your <Link to="/">squad</Link> to record who played.</p>
          ) : (
            <div className="played-grid">
              {squad.map((p) => (
                <button type="button" key={p.id} className={`played-chip${played.has(p.id) ? ' on' : ''}`} onClick={() => togglePlayed(p.id)} aria-pressed={played.has(p.id)}>
                  <b>{p.number ?? '–'}</b> {p.name}
                </button>
              ))}
            </div>
          )}
        </section>

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
                      players={scorers}
                      value={g.ownGoal ? OWN_GOAL : g.scorerId ?? ''}
                      onChange={(v) => setGoal(i, v === OWN_GOAL ? { ownGoal: true, scorerId: undefined } : { ownGoal: undefined, scorerId: v || undefined })}
                      empty="Not sure"
                      extra={<option value={OWN_GOAL}>Opponent own goal</option>}
                    />
                  </label>
                  <label className="field grow">
                    <span>Assist</span>
                    <PlayerSelect
                      players={scorers.filter((p) => p.id !== g.scorerId)}
                      value={g.assistId ?? ''}
                      onChange={(v) => setGoal(i, { assistId: v || undefined })}
                      empty="No assist"
                    />
                  </label>
                </li>
              ))}
            </ol>
          </section>
        )}

        <button className="btn primary block" disabled={!draft.opponent.trim()}>Save result</button>
      </form>
      {!isNew && <button className="btn ghost danger" onClick={remove}>Delete result</button>}
    </div>
  );
}

/** Starters and subs named in a saved line-up who are still in the squad. */
const lineupPlayers = (l: LineupTemplate, players: Player[]) => {
  const ids = new Set([...Object.values(l.slots), ...l.bench]);
  return players.filter((p) => ids.has(p.id)).map((p) => p.id);
};

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
