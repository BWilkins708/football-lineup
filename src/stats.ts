import type { Player, Result } from './db';

export interface PlayerStats {
  playerId: string;
  goals: number;
  assists: number;
}

export type Outcome = 'W' | 'D' | 'L';

export const outcome = (r: Result): Outcome =>
  r.goalsFor > r.goalsAgainst ? 'W' : r.goalsFor < r.goalsAgainst ? 'L' : 'D';

export function record(results: Result[]) {
  const rec = { W: 0, D: 0, L: 0, gf: 0, ga: 0 };
  for (const r of results) {
    rec[outcome(r)]++;
    rec.gf += r.goalsFor;
    rec.ga += r.goalsAgainst;
  }
  return rec;
}

export function seasonStats(players: Player[], results: Result[]): Map<string, PlayerStats> {
  const out = new Map(players.map((p) => [p.id, { playerId: p.id, goals: 0, assists: 0 }]));
  for (const r of results) {
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
