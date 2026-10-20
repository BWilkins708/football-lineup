import Dexie, { type EntityTable } from 'dexie';

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Foot = 'Left' | 'Right' | 'Both';

export interface Team {
  id: string;
  name: string;
  /** Month the season starts, 1 = January. Missing means August. */
  seasonStartMonth?: number;
  createdAt: number;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  number?: number;
  /** Main position first. Can be empty when the coach hasn't set one yet. */
  positions: Position[];
  foot?: Foot;
  notes?: string;
  active: boolean;
  createdAt: number;
}

/** Slot index in the formation -> player id. */
export type SlotMap = Record<number, string | undefined>;

export interface Lineup {
  formation: string;
  slots: SlotMap;
  bench: string[];
  captainId?: string;
}

export interface LineupTemplate extends Lineup {
  id: string;
  teamId: string;
  name: string;
  updatedAt: number;
}

export interface Goal {
  /** Missing when the goal was an opponent own goal. */
  scorerId?: string;
  assistId?: string;
  ownGoal?: boolean;
}

export interface Result {
  id: string;
  teamId: string;
  opponent: string;
  date: string; // yyyy-mm-dd
  venue: 'Home' | 'Away';
  competition?: string;
  goalsFor: number;
  goalsAgainst: number;
  /** One entry per goal we scored. */
  goals: Goal[];
  /** Players who played. Missing on results saved before this was recorded. */
  playedIds?: string[];
  createdAt: number;
  updatedAt?: number;
}

/** Shape of matches saved by the earlier live-tracking version, kept so they can be converted. */
interface LegacyMatch {
  id: string;
  opponent: string;
  date: string;
  venue: 'Home' | 'Away';
  competition?: string;
  status: string;
  events: { type: string; playerId?: string; assistId?: string; ownGoal?: boolean; t: number }[];
  createdAt: number;
}

type TeamlessResult = Omit<Result, 'teamId'>;

export function resultFromLegacy(m: LegacyMatch): TeamlessResult | undefined {
  if (m.status === 'setup') return undefined;
  const events = [...m.events].sort((a, b) => a.t - b.t);
  const goals = events
    .filter((e) => e.type === 'goal')
    .map((e) => ({ scorerId: e.ownGoal ? undefined : e.playerId, assistId: e.assistId, ownGoal: e.ownGoal || undefined }));
  return {
    id: m.id,
    opponent: m.opponent,
    date: m.date,
    venue: m.venue,
    competition: m.competition,
    goalsFor: goals.length,
    goalsAgainst: events.filter((e) => e.type === 'goal_against').length,
    goals,
    createdAt: m.createdAt,
  };
}

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export const db = new Dexie('soccer-lineup') as Dexie & {
  teams: EntityTable<Team, 'id'>;
  players: EntityTable<Player, 'id'>;
  lineups: EntityTable<LineupTemplate, 'id'>;
  results: EntityTable<Result, 'id'>;
};

db.version(1).stores({
  players: 'id, name, number, active',
  lineups: 'id, name, updatedAt',
  matches: 'id, date, status',
});

// Version 2 replaces live-tracked matches with simple results.
db.version(2)
  .stores({ results: 'id, date', matches: null })
  .upgrade(async (tx) => {
    const old = (await tx.table('matches').toArray()) as LegacyMatch[];
    const results = old.map(resultFromLegacy).filter((r): r is TeamlessResult => !!r);
    await tx.table('results').bulkAdd(results);
  });

const DEFAULT_TEAM_NAME = 'My team';

// Version 3 adds teams. Everything saved before then moves into one team.
db.version(3)
  .stores({
    teams: 'id, name',
    players: 'id, teamId, name, number, active',
    lineups: 'id, teamId, name, updatedAt',
    results: 'id, teamId, date',
  })
  .upgrade(async (tx) => {
    const teamId = uid();
    await tx.table('teams').add({ id: teamId, name: DEFAULT_TEAM_NAME, createdAt: Date.now() });
    for (const name of ['players', 'lineups', 'results']) {
      await tx.table(name).toCollection().modify({ teamId });
    }
  });

db.on('populate', (tx) => {
  tx.table('teams').add({ id: uid(), name: DEFAULT_TEAM_NAME, createdAt: Date.now() });
});

export async function exportData() {
  const [teams, players, lineups, results] = await Promise.all([
    db.teams.toArray(),
    db.players.toArray(),
    db.lineups.toArray(),
    db.results.toArray(),
  ]);
  return { app: 'soccer-lineup', version: 3, exportedAt: new Date().toISOString(), teams, players, lineups, results };
}

type Teamless<T> = Omit<T, 'teamId'> & { teamId?: string };

export interface Backup {
  exportedAt?: string;
  teams: Team[];
  players: Player[];
  lineups: LineupTemplate[];
  results: Result[];
}

/** Checks a backup file and converts older formats, so it can be previewed before restoring. */
export function parseBackup(data: unknown): Backup {
  const d = data as {
    app?: string;
    exportedAt?: string;
    teams?: Team[];
    players?: Teamless<Player>[];
    lineups?: Teamless<LineupTemplate>[];
    results?: Teamless<Result>[];
    matches?: LegacyMatch[];
  };
  const isList = (v: unknown) => v === undefined || Array.isArray(v);
  if (d?.app !== 'soccer-lineup' || !Array.isArray(d.players) || ![d.teams, d.lineups, d.results, d.matches].every(isList)) {
    throw new Error('This file is not a Soccer Line-up backup.');
  }
  // Backups from before teams existed go into a single team.
  const teams = d.teams?.length ? d.teams : [{ id: uid(), name: DEFAULT_TEAM_NAME, createdAt: Date.now() }];
  const withTeam = <T,>(rows: Teamless<T>[]) => rows.map((r) => ({ ...r, teamId: r.teamId ?? teams[0].id }) as T);
  // Backups from the live-tracking version hold matches instead of results.
  const results = d.results ?? (d.matches ?? []).map(resultFromLegacy).filter((r): r is TeamlessResult => !!r);
  return {
    exportedAt: d.exportedAt,
    teams,
    players: withTeam<Player>(d.players),
    lineups: withTeam<LineupTemplate>(d.lineups ?? []),
    results: withTeam<Result>(results),
  };
}

/**
 * Restores a backup. "merge" adds the chosen teams from the backup and keeps everything else on the device
 * (items in both are replaced by the backup's copy). "replace" wipes the device and loads the whole backup.
 * Returns the id of a restored team to switch to.
 */
export async function restoreBackup(backup: Backup, mode: 'merge' | 'replace', teamIds = backup.teams.map((t) => t.id)) {
  const keep = new Set(mode === 'replace' ? backup.teams.map((t) => t.id) : teamIds);
  const pick = <T extends { teamId: string }>(rows: T[]) => rows.filter((r) => keep.has(r.teamId));
  const teams = backup.teams.filter((t) => keep.has(t.id));
  if (!teams.length) throw new Error('Choose at least one team to restore.');
  await db.transaction('rw', [db.teams, db.players, db.lineups, db.results], async () => {
    if (mode === 'replace') {
      await Promise.all([db.teams.clear(), db.players.clear(), db.lineups.clear(), db.results.clear()]);
    }
    await db.teams.bulkPut(teams);
    await db.players.bulkPut(pick(backup.players));
    await db.lineups.bulkPut(pick(backup.lineups));
    await db.results.bulkPut(pick(backup.results));
  });
  return teams[0].id;
}
