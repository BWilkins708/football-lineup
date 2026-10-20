import type { Player, Result } from './db';

export interface PlayerStats {
  playerId: string;
  /** Games the player is recorded as playing in. */
  apps: number;
  goals: number;
  assists: number;
  /** Games played without conceding, counted for goalkeepers and defenders. */
  cleanSheets: number;
}

export type Outcome = 'W' | 'D' | 'L';

export const outcome = (r: Result): Outcome =>
  r.goalsFor > r.goalsAgainst ? 'W' : r.goalsFor < r.goalsAgainst ? 'L' : 'D';

export function record(results: Result[]) {
  const rec = { W: 0, D: 0, L: 0, gf: 0, ga: 0, cleanSheets: 0 };
  for (const r of results) {
    rec[outcome(r)]++;
    rec.gf += r.goalsFor;
    rec.ga += r.goalsAgainst;
    if (r.goalsAgainst === 0) rec.cleanSheets++;
  }
  return rec;
}

/** Clean sheets go to players whose main position is in goal or defence. */
export const earnsCleanSheets = (p: Player) => p.positions[0] === 'GK' || p.positions[0] === 'DEF';

export function seasonStats(players: Player[], results: Result[]): Map<string, PlayerStats> {
  const out = new Map(players.map((p) => [p.id, { playerId: p.id, apps: 0, goals: 0, assists: 0, cleanSheets: 0 }]));
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const r of results) {
    for (const id of new Set(r.playedIds ?? [])) {
      const s = out.get(id);
      if (!s) continue;
      s.apps++;
      if (r.goalsAgainst === 0 && earnsCleanSheets(byId.get(id)!)) s.cleanSheets++;
    }
    for (const g of r.goals) {
      if (g.scorerId && !g.ownGoal) {
        const s = out.get(g.scorerId);
        if (s) s.goals++;
      }
      if (g.assistId) {
        const s = out.get(g.assistId);
        if (s) s.assists++;
      }
    }
  }
  return out;
}

export interface OpponentRecord {
  opponent: string;
  played: number;
  W: number;
  D: number;
  L: number;
  gf: number;
  ga: number;
}

/** Record against each opponent, most played first. Names match ignoring case and extra spaces. */
export function opponentRecords(results: Result[]): OpponentRecord[] {
  const groups = new Map<string, Result[]>();
  for (const r of results) {
    const key = r.opponent.trim().replace(/\s+/g, ' ').toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((rs) => {
      // Show the most recent spelling of the name.
      const latest = [...rs].sort((a, b) => b.date.localeCompare(a.date))[0];
      const { W, D, L, gf, ga } = record(rs);
      return { opponent: latest.opponent.trim(), played: rs.length, W, D, L, gf, ga };
    })
    .sort((a, b) => b.played - a.played || a.opponent.localeCompare(b.opponent));
}

/** "Reid 2, Brown (OG)" style summary of who scored. */
export function scorerSummary(r: Result, byId: Map<string, Player>) {
  const counts = new Map<string, number>();
  for (const g of r.goals) {
    const name = g.ownGoal ? 'Own goal' : g.scorerId ? lastName(byId.get(g.scorerId)?.name) : 'Unknown';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, n]) => (n > 1 ? `${name} ${n}` : name)).join(', ');
}

const lastName = (name = 'Unknown') => name.trim().split(/\s+/).pop()!;
