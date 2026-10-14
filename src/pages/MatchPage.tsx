import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, uid, type EventType, type Match, type MatchEvent, type Player } from '../db';
import { LineupEditor, Modal, Pitch, PlayerList, shortName } from '../components';
import { slotsFor } from '../formations';
import { elapsed, formatClock, formatMinute, matchPlayerStats, mins, onPitch, score } from '../stats';

export function MatchPage() {
  const { id } = useParams();
  const match = useLiveQuery(() => db.matches.get(id!), [id]);
  const players = useLiveQuery(() => db.players.toArray(), []);
  if (match === undefined || !players) return null;
  if (!match) return <div className="page"><p>Match not found.</p></div>;
  if (match.status === 'setup') return <MatchSetup match={match} players={players} />;
  return <MatchLive match={match} players={players} />;
}

const save = (m: Match) => db.matches.put(m);

function MatchSetup({ match, players }: { match: Match; players: Player[] }) {
  const navigate = useNavigate();
  const lineups = useLiveQuery(() => db.lineups.toArray(), []);
  const starters = Object.values(match.lineup.slots).filter(Boolean).length;
  const needed = slotsFor(match.lineup.formation).length;

  const kickOff = async () => {
    if (starters === 0) return alert('Pick at least one starter first.');
    if (starters < needed && !confirm(`Only ${starters} of ${needed} positions are filled. Kick off anyway?`)) return;
    await save({ ...match, status: 'first', clock: { running: true, startedAt: Date.now(), elapsedBefore: 0 } });
  };

  const saveAsTemplate = async () => {
    const name = prompt('Name this line-up', `v ${match.opponent}`);
    if (!name) return;
    await db.lineups.add({ id: uid(), name, ...match.lineup, updatedAt: Date.now() });
    alert('Saved to Line-ups.');
  };

  const loadTemplate = async (tid: string) => {
    const t = lineups?.find((l) => l.id === tid);
    if (t) await save({ ...match, lineup: { formation: t.formation, slots: { ...t.slots }, bench: [...t.bench], captainId: t.captainId } });
  };

  const remove = async () => {
    if (!confirm('Delete this match?')) return;
    await db.matches.delete(match.id);
    navigate('/matches');
  };

  return (
    <div className="page">
      <Link to="/matches" className="back">‹ Matches</Link>
      <div className="page-head">
        <div>
          <h1>{match.venue === 'Home' ? 'v' : '@'} {match.opponent}</h1>
          <p className="muted small">{match.date}{match.competition ? ` · ${match.competition}` : ''} · {match.halfLength} min halves</p>
        </div>
      </div>
      {players.length === 0 ? (
        <p className="muted">Add players to your <Link to="/">squad</Link> first.</p>
      ) : (
        <>
          {!!lineups?.length && (
            <label className="field inline">
              <span>Load line-up</span>
              <select value="" onChange={(e) => loadTemplate(e.target.value)}>
                <option value="">Choose…</option>
                {lineups.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.formation})</option>)}
              </select>
            </label>
          )}
          <LineupEditor lineup={match.lineup} players={players} onChange={(lineup) => save({ ...match, lineup })} />
        </>
      )}
      <div className="sticky-actions">
        <button className="btn ghost" onClick={saveAsTemplate} disabled={starters === 0}>Save line-up</button>
        <button className="btn primary grow" onClick={kickOff}>Kick off</button>
      </div>
      <button className="btn ghost danger" onClick={remove}>Delete match</button>
    </div>
  );
}

type Flow =
  | { kind: 'player'; playerId: string }
  | { kind: 'scorer' }
  | { kind: 'assist'; scorerId?: string; ownGoal?: boolean; penalty: boolean }
  | { kind: 'subOut' }
  | { kind: 'subIn'; outId: string }
  | { kind: 'minutes' };

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Slot -> player currently filling it, after subs and red cards. */
function currentSlots(match: Match) {
  const slots = { ...match.lineup.slots };
  for (const e of [...match.events].sort((a, b) => a.t - b.t)) {
    if (e.type === 'sub' && e.outId) {
      const i = Object.entries(slots).find(([, id]) => id === e.outId)?.[0];
      if (i !== undefined) slots[Number(i)] = e.inId;
    }
    if (e.type === 'red' && e.playerId) {
      const i = Object.entries(slots).find(([, id]) => id === e.playerId)?.[0];
      if (i !== undefined) delete slots[Number(i)];
    }
  }
  return slots;
}

function MatchLive({ match, players }: { match: Match; players: Player[] }) {
  const navigate = useNavigate();
  const live = match.status === 'first' || match.status === 'second';
  const now = useNow(match.clock.running);
  const [flow, setFlow] = useState<Flow | null>(null);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const t = elapsed(match, now);
  const sc = score(match);
  const pitch = onPitch(match);
  const slots = currentSlots(match);
  const stats = matchPlayerStats(match, now);
  const finished = match.status === 'finished';
  const period: 1 | 2 = match.status === 'first' ? 1 : 2;

  const onPitchPlayers = [...pitch].map((id) => byId.get(id)).filter(Boolean) as Player[];
  const used = new Set([...stats.values()].filter((s) => s.appeared).map((s) => s.playerId));
  const sentOff = new Set(match.events.filter((e) => e.type === 'red').map((e) => e.playerId));
  const benchAvailable = match.lineup.bench
    .filter((id) => !pitch.has(id) && !used.has(id) && !sentOff.has(id))
    .map((id) => byId.get(id))
    .filter(Boolean) as Player[];

  const addEvents = async (...evs: Omit<MatchEvent, 'id' | 't' | 'period'>[]) => {
    const tNow = elapsed(match);
    const next = evs.map((e) => ({ ...e, id: uid(), t: tNow, period }));
    await save({ ...match, events: [...match.events, ...next] });
    setFlow(null);
  };

  const card = (type: 'yellow' | 'red', playerId: string) => {
    const priorYellow = match.events.some((e) => e.type === 'yellow' && e.playerId === playerId);
    if (type === 'yellow' && priorYellow) {
      if (!confirm('Second yellow card. Send the player off?')) return;
      return addEvents({ type: 'yellow', playerId }, { type: 'red', playerId });
    }
    return addEvents({ type, playerId });
  };

  const setClock = (patch: Partial<Match>) => save({ ...match, ...patch });
  const stopClock = () => ({ running: false, startedAt: undefined, elapsedBefore: elapsed(match) });

  const controls = () => {
    switch (match.status) {
      case 'first':
        return <button className="btn" onClick={() => setClock({ status: 'halftime', clock: { ...match.clock, ...stopClock() } })}>Half time</button>;
      case 'halftime':
        return (
          <button className="btn primary" onClick={() => {
            const e = elapsed(match);
            setClock({ status: 'second', clock: { running: true, startedAt: Date.now(), elapsedBefore: e, secondHalfStart: e } });
          }}>Start 2nd half</button>
        );
      case 'second':
        return (
          <button className="btn" onClick={() => {
            if (confirm('End the match?')) setClock({ status: 'finished', clock: { ...match.clock, ...stopClock() } });
          }}>Full time</button>
        );
      case 'finished':
        return (
          <button className="btn ghost" onClick={() => {
            if (confirm('Reopen the second half?')) setClock({ status: 'second', clock: { ...match.clock, running: false } });
          }}>Reopen</button>
        );
    }
  };

  const toggleClock = () =>
    setClock({ clock: match.clock.running ? { ...match.clock, ...stopClock() } : { ...match.clock, running: true, startedAt: Date.now() } });

  const removeEvent = async (id: string) => {
    if (!confirm('Remove this event?')) return;
    await save({ ...match, events: match.events.filter((e) => e.id !== id) });
  };

  const undo = () => {
    const last = match.events[match.events.length - 1];
    if (last) removeEvent(last.id);
  };

  const canEdit = live || match.status === 'halftime';
  const statusLabel = { first: '1st half', halftime: 'Half time', second: '2nd half', finished: 'Full time', setup: '' }[match.status];

  return (
    <div className="page live">
      <Link to="/matches" className="back">‹ Matches</Link>
      <div className="scoreboard">
        <div className="team"><span>Us</span><b>{sc.us}</b></div>
        <div className="clock">
          <button className={`clock-time${match.clock.running ? ' running' : ''}`} onClick={live ? toggleClock : undefined} disabled={!live} aria-label={match.clock.running ? 'Pause clock' : 'Start clock'}>
            {formatClock(match, t)}
          </button>
          <span className="muted small">{statusLabel}{live && !match.clock.running ? ' · paused' : ''}</span>
        </div>
        <div className="team"><span>{match.opponent}</span><b>{sc.them}</b></div>
      </div>

      <div className="row gap wrap controls">
        {controls()}
        <span className="grow" />
        <button className="btn ghost" onClick={() => setFlow({ kind: 'minutes' })}>Minutes</button>
        {canEdit && <button className="btn ghost" onClick={undo} disabled={!match.events.length}>Undo</button>}
      </div>

      {canEdit && (
        <div className="action-bar">
          <button className="btn big good" onClick={() => setFlow({ kind: 'scorer' })}>⚽ Our goal</button>
          <button className="btn big bad" onClick={() => addEvents({ type: 'goal_against' })}>Their goal</button>
          <button className="btn big" onClick={() => setFlow({ kind: 'subOut' })} disabled={!benchAvailable.length}>⇄ Sub</button>
        </div>
      )}

      <Pitch
        formation={match.lineup.formation}
        slots={slots}
        players={byId}
        captainId={match.lineup.captainId}
        onSlotClick={(i) => { const pid = slots[i]; if (pid && canEdit) setFlow({ kind: 'player', playerId: pid }); }}
        labelFor={(_, pid) => {
          const p = pid ? byId.get(pid) : undefined;
          if (!p) return '—';
          const s = stats.get(p.id);
          return <>{shortName(p)}{s?.goals ? ` ${'⚽'.repeat(Math.min(s.goals, 3))}` : ''}{s?.yellows ? ' 🟨' : ''}</>;
        }}
      />
      {canEdit && <p className="muted small center">Tap a player to log a shot, card or other event. Tap the clock to pause.</p>}

      {finished && <MatchReport match={match} byId={byId} />}

      <h3>Timeline</h3>
      <Timeline match={match} byId={byId} onRemove={canEdit || finished ? removeEvent : undefined} />

      {finished && (
        <button className="btn ghost danger" onClick={async () => {
          if (!confirm('Delete this match and its stats?')) return;
          await db.matches.delete(match.id);
          navigate('/matches');
        }}>Delete match</button>
      )}

      {flow?.kind === 'player' && (() => {
        const p = byId.get(flow.playerId)!;
        const items: [string, () => void, string?][] = [
          ['⚽ Goal', () => setFlow({ kind: 'assist', scorerId: p.id, penalty: false })],
          ['Shot on target', () => addEvents({ type: 'shot_on_target', playerId: p.id })],
          ['Shot off target', () => addEvents({ type: 'shot', playerId: p.id })],
          ['🟨 Yellow card', () => card('yellow', p.id)],
          ['🟥 Red card', () => { if (confirm(`Send off ${p.name}?`)) card('red', p.id); }, 'danger'],
          ['🩹 Injury', () => addEvents({ type: 'injury', playerId: p.id })],
          ['⇄ Sub off', () => setFlow({ kind: 'subIn', outId: p.id })],
        ];
        return (
          <Modal title={`${p.number ?? ''} ${p.name}`} onClose={() => setFlow(null)}>
            <div className="sheet-grid">
              {items.map(([label, fn, cls]) => (
                <button key={label} className={`btn big ${cls ?? ''}`} onClick={fn} disabled={label === '⇄ Sub off' && !benchAvailable.length}>{label}</button>
              ))}
            </div>
          </Modal>
        );
      })()}

      {flow?.kind === 'scorer' && (
        <Modal title="Who scored?" onClose={() => setFlow(null)}>
          <PlayerList players={onPitchPlayers} onPick={(p) => setFlow({ kind: 'assist', scorerId: p.id, penalty: false })} />
          <button className="btn ghost block" onClick={() => setFlow({ kind: 'assist', ownGoal: true, penalty: false })}>Opponent own goal</button>
        </Modal>
      )}

      {flow?.kind === 'assist' && (
        <Modal title={flow.ownGoal ? 'Own goal: assist?' : `Goal: ${byId.get(flow.scorerId!)?.name}`} onClose={() => setFlow(null)}>
          {!flow.ownGoal && (
            <label className="check">
              <input type="checkbox" checked={flow.penalty} onChange={(e) => setFlow({ ...flow, penalty: e.target.checked })} /> Penalty
            </label>
          )}
          <p className="muted small">Who assisted?</p>
          <button className="btn primary block" onClick={() => addEvents({ type: 'goal', playerId: flow.scorerId, ownGoal: flow.ownGoal, penalty: flow.penalty || undefined })}>No assist</button>
          {!flow.penalty && (
            <PlayerList
              players={onPitchPlayers.filter((p) => p.id !== flow.scorerId)}
              onPick={(p) => addEvents({ type: 'goal', playerId: flow.scorerId, assistId: p.id, ownGoal: flow.ownGoal })}
            />
          )}
        </Modal>
      )}

      {flow?.kind === 'subOut' && (
        <Modal title="Who's coming off?" onClose={() => setFlow(null)}>
          <PlayerList players={onPitchPlayers} onPick={(p) => setFlow({ kind: 'subIn', outId: p.id })} note={(p) => `${mins(stats.get(p.id)?.seconds ?? 0)} min`} />
        </Modal>
      )}

      {flow?.kind === 'subIn' && (
        <Modal title={`Replacing ${byId.get(flow.outId)?.name}`} onClose={() => setFlow(null)}>
          <PlayerList players={benchAvailable} onPick={(p) => addEvents({ type: 'sub', outId: flow.outId, inId: p.id })} />
        </Modal>
      )}

      {flow?.kind === 'minutes' && (
        <Modal title="Minutes played" onClose={() => setFlow(null)}>
          <ul className="pick-list">
            {[...new Set([...[...stats.values()].filter((s) => s.appeared).map((s) => s.playerId), ...match.lineup.bench])]
              .map((pid) => ({ p: byId.get(pid), seconds: stats.get(pid)?.seconds ?? 0 }))
              .filter((r): r is { p: Player; seconds: number } => !!r.p)
              .sort((a, b) => b.seconds - a.seconds)
              .map(({ p, seconds }) => (
                <li key={p.id}>
                  <div className="list-row">
                    <span className="num">{p.number ?? '–'}</span>
                    <span className="grow">{p.name}{pitch.has(p.id) ? ' · on' : ''}</span>
                    <b>{mins(seconds)}′</b>
                  </div>
                </li>
              ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

const EVENT_LABEL: Record<EventType, string> = {
  goal: '⚽ Goal',
  goal_against: '⚽ Conceded',
  shot: 'Shot off target',
  shot_on_target: 'Shot on target',
  yellow: '🟨 Yellow',
  red: '🟥 Red',
  sub: '⇄ Sub',
  injury: '🩹 Injury',
};

function Timeline({ match, byId, onRemove }: { match: Match; byId: Map<string, Player>; onRemove?: (id: string) => void }) {
  const name = (id?: string) => (id ? byId.get(id)?.name ?? 'Unknown' : '');
  const events = [...match.events].sort((a, b) => b.t - a.t);
  if (!events.length) return <p className="muted">No events yet.</p>;
  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id} className={`ev ${e.type}`}>
          <span className="min">{formatMinute(match, e)}</span>
          <span className="grow">
            <b>{EVENT_LABEL[e.type]}</b>{' '}
            {e.type === 'sub' ? <>{name(e.inId)} on, {name(e.outId)} off</> :
              e.type === 'goal' ? <>{e.ownGoal ? 'Own goal' : name(e.playerId)}{e.penalty ? ' (pen)' : ''}{e.assistId ? <span className="muted">, assist {name(e.assistId)}</span> : null}</> :
              e.type === 'goal_against' ? match.opponent : name(e.playerId)}
          </span>
          {onRemove && <button className="icon-btn" onClick={() => onRemove(e.id)} aria-label="Remove event">✕</button>}
        </li>
      ))}
    </ul>
  );
}

function MatchReport({ match, byId }: { match: Match; byId: Map<string, Player> }) {
  const stats = [...matchPlayerStats(match).values()].filter((s) => s.appeared);
  const sc = score(match);
  const team = stats.reduce((a, s) => ({ shots: a.shots + s.shots, on: a.on + s.shotsOnTarget }), { shots: 0, on: 0 });
  const result = sc.us > sc.them ? 'Win' : sc.us < sc.them ? 'Loss' : 'Draw';
  return (
    <section>
      <h3>Report</h3>
      <p><b>{result}</b> {sc.us}–{sc.them} {match.venue === 'Home' ? 'v' : '@'} {match.opponent}. {team.shots} shots, {team.on} on target.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Player</th><th>Min</th><th>G</th><th>A</th><th>Sh</th><th>SoT</th><th>Cards</th></tr></thead>
          <tbody>
            {stats.sort((a, b) => Number(b.started) - Number(a.started) || b.seconds - a.seconds).map((s) => {
              const p = byId.get(s.playerId);
              return (
                <tr key={s.playerId}>
                  <td>{p ? <Link to={`/players/${p.id}`}>{p.name}</Link> : 'Unknown'}{s.started ? '' : <span className="muted"> (sub)</span>}</td>
                  <td>{mins(s.seconds)}</td>
                  <td>{s.goals || ''}</td>
                  <td>{s.assists || ''}</td>
                  <td>{s.shots || ''}</td>
                  <td>{s.shotsOnTarget || ''}</td>
                  <td>{'🟨'.repeat(s.yellows)}{'🟥'.repeat(s.reds)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
