import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, uid, type Team } from './db';
import { Modal } from './components';

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
  if (!teams?.length) return null;

  // Fall back to the first team if the remembered one was deleted.
  const team = teams.find((t) => t.id === selectedId) ?? teams[0];
  const selectTeam = (id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Remembering the team is a convenience; ignore storage being unavailable.
    }
  };

  return <TeamContext.Provider value={{ team, teams, selectTeam }}>{children}</TeamContext.Provider>;
}

const MANAGE = '__manage__';

/** Top-level tab for a path, e.g. a player's page belongs to the Squad tab. */
const tabFor = (path: string) =>
  path.startsWith('/players') ? '/' : path.startsWith('/results') ? '/matches' : path.startsWith('/lineups') ? '/lineups' : path;

export function TeamBar() {
  const { team, teams, selectTeam } = useTeam();
  const [managing, setManaging] = useState(false);
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
          onChange={(e) => (e.target.value === MANAGE ? setManaging(true) : switchTo(e.target.value))}
        >
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value={MANAGE}>Add or edit teams…</option>
        </select>
      </label>
      <button className="btn small-btn on-dark" onClick={() => setManaging(true)}>Teams</button>
      {managing && <ManageTeams onSelect={switchTo} onClose={() => setManaging(false)} />}
    </header>
  );
}

function ManageTeams({ onSelect, onClose }: { onSelect: (id: string) => void; onClose: () => void }) {
  const { team, teams } = useTeam();
  const [newName, setNewName] = useState('');

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = uid();
    await db.teams.add({ id, name, createdAt: Date.now() });
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

  return (
    <Modal title="Teams" onClose={onClose}>
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
      <button className="btn block" onClick={onClose}>Done</button>
    </Modal>
  );
}
