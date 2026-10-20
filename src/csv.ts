import type { Player, Result } from './db';
import { outcome, seasonStats } from './stats';

type Cell = string | number | undefined;

const cell = (v: Cell) => {
  const s = v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

export function playerStatsCsv(players: Player[], results: Result[]) {
  const stats = seasonStats(players, results);
  const rows = players
    .map((p) => ({ p, s: stats.get(p.id)! }))
    .filter(({ p, s }) => p.active || s.apps || s.goals || s.assists)
    .sort((a, b) => (a.p.number ?? 999) - (b.p.number ?? 999) || a.p.name.localeCompare(b.p.name));
  return toCsv([
    ['Number', 'Name', 'Positions', 'Games played', 'Goals', 'Assists', 'Clean sheets'],
    ...rows.map(({ p, s }) => [p.number, p.name, p.positions.join(' / '), s.apps, s.goals, s.assists, s.cleanSheets]),
  ]);
}

export function resultsCsv(results: Result[], players: Player[]) {
  const name = (id?: string) => (id ? players.find((p) => p.id === id)?.name ?? 'Unknown' : '');
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));
  return toCsv([
    ['Date', 'Opponent', 'Venue', 'Competition', 'Result', 'Goals for', 'Goals against', 'Scorers', 'Assists', 'Played'],
    ...sorted.map((r) => [
      r.date,
      r.opponent,
      r.venue,
      r.competition,
      outcome(r),
      r.goalsFor,
      r.goalsAgainst,
      r.goals.map((g) => (g.ownGoal ? 'Own goal' : name(g.scorerId) || 'Unknown')).join('; '),
      r.goals.map((g) => name(g.assistId)).filter(Boolean).join('; '),
      (r.playedIds ?? []).map(name).join('; '),
    ]),
  ]);
}
