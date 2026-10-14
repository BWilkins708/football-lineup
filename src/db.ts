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

export type EventType =
  | 'goal'
  | 'goal_against'
  | 'shot'
  | 'shot_on_target'
  | 'yellow'
  | 'red'
  | 'sub'
  | 'injury';

export interface MatchEvent {
  id: string;
  type: EventType;
  /** Running match time in seconds when the event happened. */
  t: number;
  period: 1 | 2;
  playerId?: string;
  assistId?: string;
  /** For subs: the player coming off. */
  outId?: string;
  /** For subs: the player coming on. */
  inId?: string;
  ownGoal?: boolean;
  penalty?: boolean;
}

export type MatchStatus = 'setup' | 'first' | 'halftime' | 'second' | 'finished';

export interface Match {
  id: string;
  opponent: string;
  date: string; // yyyy-mm-dd
  venue: 'Home' | 'Away';
  competition?: string;
  halfLength: number; // minutes
  lineup: Lineup;
  status: MatchStatus;
  clock: {
    running: boolean;
    startedAt?: number; // epoch ms when the clock last started
    elapsedBefore: number; // seconds accumulated before startedAt
    secondHalfStart?: number; // running seconds at 2nd-half kick off
  };
  events: MatchEvent[];
  createdAt: number;
}

export const db = new Dexie('soccer-lineup') as Dexie & {
  players: EntityTable<Player, 'id'>;
  lineups: EntityTable<LineupTemplate, 'id'>;
  matches: EntityTable<Match, 'id'>;
};

db.version(1).stores({
  players: 'id, name, number, active',
  lineups: 'id, name, updatedAt',
  matches: 'id, date, status',
});

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export async function exportData() {
  const [players, lineups, matches] = await Promise.all([
    db.players.toArray(),
    db.lineups.toArray(),
    db.matches.toArray(),
  ]);
  return { app: 'soccer-lineup', version: 1, exportedAt: new Date().toISOString(), players, lineups, matches };
}

export async function importData(data: unknown) {
  const d = data as { app?: string; players?: Player[]; lineups?: LineupTemplate[]; matches?: Match[] };
  if (d?.app !== 'soccer-lineup' || !Array.isArray(d.players)) {
    throw new Error('This file is not a Soccer Line-up backup.');
  }
  await db.transaction('rw', db.players, db.lineups, db.matches, async () => {
    await Promise.all([db.players.clear(), db.lineups.clear(), db.matches.clear()]);
    await db.players.bulkAdd(d.players ?? []);
    await db.lineups.bulkAdd(d.lineups ?? []);
    await db.matches.bulkAdd(d.matches ?? []);
  });
}
