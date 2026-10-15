import Dexie, { type EntityTable } from 'dexie';

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Foot = 'Left' | 'Right' | 'Both';

export interface Player {
  id: string;
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

export function resultFromLegacy(m: LegacyMatch): Result | undefined {
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

export const db = new Dexie('soccer-lineup') as Dexie & {
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
    const results = old.map(resultFromLegacy).filter((r): r is Result => !!r);
    await tx.table('results').bulkAdd(results);
  });

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export async function exportData() {
  const [players, lineups, results] = await Promise.all([
    db.players.toArray(),
    db.lineups.toArray(),
    db.results.toArray(),
  ]);
  return { app: 'soccer-lineup', version: 2, exportedAt: new Date().toISOString(), players, lineups, results };
}

export async function importData(data: unknown) {
  const d = data as { app?: string; players?: Player[]; lineups?: LineupTemplate[]; results?: Result[]; matches?: LegacyMatch[] };
  if (d?.app !== 'soccer-lineup' || !Array.isArray(d.players)) {
    throw new Error('This file is not a Soccer Line-up backup.');
  }
  // Backups from the live-tracking version hold matches instead of results.
  const results = d.results ?? (d.matches ?? []).map(resultFromLegacy).filter((r): r is Result => !!r);
  await db.transaction('rw', db.players, db.lineups, db.results, async () => {
    await Promise.all([db.players.clear(), db.lineups.clear(), db.results.clear()]);
    await db.players.bulkAdd(d.players ?? []);
    await db.lineups.bulkAdd(d.lineups ?? []);
    await db.results.bulkAdd(results);
  });
}
