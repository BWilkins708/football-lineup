import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, parseBackup, restoreBackup, uid, type Backup, type Team } from './db';
import { Modal } from './components';
import { BACKED_UP, backUpNow, backupStatus, lastBackupAt, needsBackup, snoozeBackup } from './backup';
import { ALL_SEASONS, DEFAULT_SEASON_START, MONTHS, seasonLabel, seasonOf, seasonOptions, today } from './seasons';

const STORAGE_KEY = 'currentTeamId';

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

interface TeamContextValue {
  team: Team;
  teams: Team[];
  selectTeam: (id: string) => void;
  /** Season shown on the results and stats pages, or ALL_SEASONS. */
  season: string;
  setSeason: (season: string) => void;
  /** Month the selected team's season starts, 1 = January. */
  startMonth: number;
}

const TeamContext = createContext<TeamContextValue | null>(null);

/** The team currently selected in the app. Only use inside TeamProvider. */
export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used inside TeamProvider');
  return ctx;
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const teams = useLiveQuery(() => db.teams.toArray().then((t) => t.sort((a, b) => a.createdAt - b.createdAt)), []);
  const [selectedId, setSelectedId] = useState(readStored);
  // Undefined means "the current season", so it moves on by itself when a new season starts.
  const [seasonChoice, setSeason] = useState<string>();
  if (!teams?.length) return null;

  // Fall back to the first team if the remembered one was deleted.
  const team = teams.find((t) => t.id === selectedId) ?? teams[0];
  const startMonth = team.seasonStartMonth ?? DEFAULT_SEASON_START;
  const season = seasonChoice ?? seasonOf(today(), startMonth);
  const selectTeam = (id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Remembering the team is a convenience; ignore storage being unavailable.
    }
  };

  return <TeamContext.Provider value={{ team, teams, selectTeam, season, setSeason, startMonth }}>{children}</TeamContext.Provider>;
}

/** Season dropdown for the results and stats pages. Hidden until there is more than one season to choose. */
export function SeasonPicker() {
  const { team, season, setSeason, startMonth } = useTeam();
  const dates = useLiveQuery(() => db.results.where('teamId').equals(team.id).toArray(), [team.id]);
  if (!dates) return null;
  const options = seasonOptions(dates, startMonth, today());
  if (options.length < 2) return null;
  return (
    <label className="field inline season-picker">
      <span>Season</span>
      <select value={season} onChange={(e) => setSeason(e.target.value)}>
        {options.map((s) => <option key={s} value={s}>{seasonLabel(s, startMonth)}</option>)}
        <option value={ALL_SEASONS}>All seasons</option>
      </select>
    </label>
  );
}

const MANAGE = '__manage__';

/** Top-level tab for a path, e.g. a player's page belongs to the Squad tab. */
const tabFor = (path: string) =>
  path.startsWith('/players') ? '/' : path.startsWith('/results') ? '/matches' : path.startsWith('/lineups') ? '/lineups' : path;

const gear = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export function TeamBar() {
  const { team, teams, selectTeam } = useTeam();
  const [settings, setSettings] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // A player, line-up or result page belongs to one team, so switching goes back to the tab's list.
  const switchTo = (id: string) => {
    selectTeam(id);
    navigate(tabFor(pathname));
  };

  return (
    <header className="team-bar">
      <span className="crest" aria-hidden>{team.name.trim().charAt(0).toUpperCase() || '?'}</span>
      <label className="team-select">
        <span className="sr-only">Team</span>
        <select
          value={team.id}
          onChange={(e) => (e.target.value === MANAGE ? setSettings(true) : switchTo(e.target.value))}
        >
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value={MANAGE}>Add or edit teams…</option>
        </select>
      </label>
      <button className="icon-btn on-dark" onClick={() => setSettings(true)} aria-label="Settings and backup">{gear}</button>
      {settings && <Settings onSelect={switchTo} onClose={() => setSettings(false)} />}
    </header>
  );
}

/** Banner asking the coach to back up when there is new data that only lives on this phone. */
export function BackupReminder() {
  const status = useLiveQuery(backupStatus, []);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const hide = () => setHidden(true);
    window.addEventListener(BACKED_UP, hide);
    return () => window.removeEventListener(BACKED_UP, hide);
  }, []);
  if (!status || hidden || !needsBackup(status)) return null;

  return (
    <div className="banner" role="status">
      <span className="grow">
        <b>Back up your data</b>
        <span className="small block">
          {status.lastBackup ? `Last backup ${new Date(status.lastBackup).toLocaleDateString()}.` : 'It only lives on this phone.'} Save a copy so nothing is lost.
        </span>
      </span>
      <button className="btn primary small-btn" onClick={backUpNow}>Back up</button>
      <button className="icon-btn" onClick={() => { snoozeBackup(); setHidden(true); }} aria-label="Remind me later">✕</button>
    </div>
  );
}

function Settings({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void }) {
  const { team, teams, startMonth } = useTeam();
  const [newName, setNewName] = useState('');
  const [lastBackup, setLastBackup] = useState(lastBackupAt);
  const [restoring, setRestoring] = useState<Backup>();
  const file = useRef<HTMLInputElement>(null);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = uid();
    await db.teams.add({ id, name, seasonStartMonth: team.seasonStartMonth, createdAt: Date.now() });
    setNewName('');
    onSelect(id);
  };

  const rename = (t: Team, name: string) => db.teams.update(t.id, { name });

  const remove = async (t: Team) => {
    const [players, results] = await Promise.all([
      db.players.where('teamId').equals(t.id).count(),
      db.results.where('teamId').equals(t.id).count(),
    ]);
    if (!confirm(`Delete ${t.name} with its ${players} players, ${results} results and line-ups? This can't be undone.`)) return;
    await db.transaction('rw', [db.teams, db.players, db.lineups, db.results], async () => {
      await db.players.where('teamId').equals(t.id).delete();
      await db.lineups.where('teamId').equals(t.id).delete();
      await db.results.where('teamId').equals(t.id).delete();
      await db.teams.delete(t.id);
    });
    if (t.id === team.id) onSelect(teams.find((x) => x.id !== t.id)!.id);
  };

  const backUp = async () => {
    if (await backUpNow()) setLastBackup(lastBackupAt());
  };

  const openFile = async (f: File) => {
    try {
      setRestoring(parseBackup(JSON.parse(await f.text())));
    } catch (e) {
      alert(e instanceof SyntaxError ? 'Could not read that file.' : e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  if (restoring) {
    return (
      <RestoreBackup
        backup={restoring}
        onDone={(id) => { if (id) onSelect(id); onClose(); }}
        onCancel={() => setRestoring(undefined)}
      />
    );
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <h3>Teams</h3>
      <p className="muted small">Each team has its own squad, line-ups, results and stats. Tap a name to rename it.</p>
      <ul className="card-list">
        {teams.map((t) => (
          <li key={t.id}>
            <div className="list-row">
              <input
                className="inline-input grow"
                aria-label={`Name of ${t.name}`}
                defaultValue={t.name}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && rename(t, e.target.value.trim())}
              />
              {t.id === team.id ? (
                <span className="muted small">Selected</span>
              ) : (
                <button className="btn ghost" onClick={() => { onSelect(t.id); onClose(); }}>Select</button>
              )}
              {teams.length > 1 && (
                <button className="icon-btn" onClick={() => remove(t)} aria-label={`Delete ${t.name}`}>✕</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form className="row gap" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="field grow">
          <span className="sr-only">New team name</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New team name, e.g. Sunday XI" />
        </label>
        <button className="btn primary" disabled={!newName.trim()}>Add team</button>
      </form>

      <h3>Season</h3>
      <label className="field inline">
        <span>{team.name}'s season starts in</span>
        <select value={startMonth} onChange={(e) => db.teams.update(team.id, { seasonStartMonth: Number(e.target.value) })}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </label>
      <p className="muted small">Results and stats show one season at a time. Pick January if your season follows the calendar year.</p>

      <h3>Backup</h3>
      <p className="muted small">
        Your data is stored on this phone only. A backup saves every team to a file you can keep in Files, Drive or email,
        and restore on any device. {lastBackup ? `Last backup: ${new Date(lastBackup).toLocaleDateString()}.` : 'You haven’t backed up yet.'}
      </p>
      <div className="row gap">
        <button className="btn primary" onClick={backUp}>Back up now</button>
        <button className="btn ghost" onClick={() => file.current?.click()}>Restore from file</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />
      </div>
      <button className="btn block" onClick={onClose}>Done</button>
    </Modal>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function RestoreBackup({ backup, onDone, onCancel }: { backup: Backup; onDone: (teamId?: string) => void; onCancel: () => void }) {
  const [picked, setPicked] = useState(() => new Set(backup.teams.map((t) => t.id)));
  const existing = useLiveQuery(() => db.teams.toArray(), []);
  const count = (rows: { teamId: string }[], id: string) => rows.filter((r) => r.teamId === id).length;
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const run = async (mode: 'merge' | 'replace') => {
    if (mode === 'replace' && !confirm('Delete everything on this phone and load the whole backup instead? This can’t be undone.')) return;
    try {
      onDone(await restoreBackup(backup, mode, [...picked]));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not restore that backup.');
    }
  };

  return (
    <Modal title="Restore backup" onClose={onCancel}>
      <p className="muted small">
        {backup.exportedAt ? `Saved ${new Date(backup.exportedAt).toLocaleString()}. ` : ''}
        Choose the teams to bring back. Other teams on this phone are kept.
      </p>
      <ul className="pick-list">
        {backup.teams.map((t) => (
          <li key={t.id}>
            <button className={picked.has(t.id) ? 'picked' : ''} onClick={() => toggle(t.id)} aria-pressed={picked.has(t.id)}>
              <span className="tick" aria-hidden>{picked.has(t.id) ? '✓' : ''}</span>
              <span className="grow">
                {t.name}
                <span className="muted small block">
                  {plural(count(backup.players, t.id), 'player')} · {plural(count(backup.results, t.id), 'result')} · {plural(count(backup.lineups, t.id), 'line-up')}
                  {existing?.some((x) => x.id === t.id) ? ' · replaces the copy on this phone' : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button className="btn primary block" disabled={!picked.size} onClick={() => run('merge')}>
        Restore {picked.size === 1 ? '1 team' : `${picked.size} teams`}
      </button>
      <button className="btn ghost danger block" onClick={() => run('replace')}>Replace everything on this phone</button>
    </Modal>
  );
}
