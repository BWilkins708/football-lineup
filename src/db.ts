import Dexie, { type EntityTable } from 'dexie';

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Foot = 'Left' | 'Right' | 'Both';

export interface Team {
  id: string;
  name: string;
  createdAt: number;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  number?: number;
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
  createdAt: number;
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

export async function importData(data: unknown) {
  const d = data as {
    app?: string;
    teams?: Team[];
    players?: Teamless<Player>[];
    lineups?: Teamless<LineupTemplate>[];
    results?: Teamless<Result>[];
    matches?: LegacyMatch[];
  };
  if (d?.app !== 'soccer-lineup' || !Array.isArray(d.players)) {
    throw new Error('This file is not a Soccer Line-up backup.');
  }
  // Backups from before teams existed go into a single team.
  const teams = d.teams?.length ? d.teams : [{ id: uid(), name: DEFAULT_TEAM_NAME, createdAt: Date.now() }];
  const withTeam = <T,>(rows: Teamless<T>[]) => rows.map((r) => ({ ...r, teamId: r.teamId ?? teams[0].id }) as T);
  // Backups from the live-tracking version hold matches instead of results.
  const results = d.results ?? (d.matches ?? []).map(resultFromLegacy).filter((r): r is TeamlessResult => !!r);
  await db.transaction('rw', [db.teams, db.players, db.lineups, db.results], async () => {
    await Promise.all([db.teams.clear(), db.players.clear(), db.lineups.clear(), db.results.clear()]);
    await db.teams.bulkAdd(teams);
    await db.players.bulkAdd(withTeam<Player>(d.players ?? []));
    await db.lineups.bulkAdd(withTeam<LineupTemplate>(d.lineups ?? []));
    await db.results.bulkAdd(withTeam<Result>(results));
  });
  return teams[0].id;
}
