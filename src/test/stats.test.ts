import { describe, expect, it } from 'vitest';
import type { Player, Result } from '../db';
import { opponentRecords, record, seasonStats } from '../stats';

const player = (id: string, pos: Player['positions'] = ['MID']): Player =>
  ({ id, teamId: 't', name: `Player ${id}`, positions: pos, active: true, createdAt: 0 });

const result = (r: Partial<Result>): Result => ({
  id: Math.random().toString(),
  teamId: 't',
  opponent: 'Rovers',
  date: '2025-09-06',
  venue: 'Home',
  goalsFor: 0,
  goalsAgainst: 0,
  goals: [],
  createdAt: 0,
  ...r,
});

describe('seasonStats', () => {
  const gk = player('gk', ['GK']);
  const mid = player('mid');
  const results = [
    result({ goalsFor: 2, goalsAgainst: 0, goals: [{ scorerId: 'mid', assistId: 'gk' }, { ownGoal: true }], playedIds: ['gk', 'mid'] }),
    result({ goalsFor: 1, goalsAgainst: 1, goals: [{ scorerId: 'mid' }], playedIds: ['mid'] }),
    // Saved before "who played" existed: no appearances, but goals still count.
    result({ goalsFor: 1, goalsAgainst: 3, goals: [{ scorerId: 'mid' }] }),
  ];
  const stats = seasonStats([gk, mid], results);

  it('counts appearances, goals and assists', () => {
    expect(stats.get('mid')).toMatchObject({ apps: 2, goals: 3, assists: 0 });
    expect(stats.get('gk')).toMatchObject({ apps: 1, goals: 0, assists: 1 });
  });

  it('gives clean sheets only to keepers and defenders who played', () => {
    expect(stats.get('gk')!.cleanSheets).toBe(1);
    expect(stats.get('mid')!.cleanSheets).toBe(0);
  });

  it('ignores own goals and players no longer in the squad', () => {
    const s = seasonStats([mid], [result({ goals: [{ ownGoal: true }, { scorerId: 'gone' }], playedIds: ['gone', 'mid', 'mid'] })]);
    expect(s.get('mid')).toMatchObject({ apps: 1, goals: 0 });
  });
});

describe('record', () => {
  it('totals wins, draws, losses, goals and clean sheets', () => {
    const rec = record([result({ goalsFor: 3 }), result({ goalsFor: 1, goalsAgainst: 1 }), result({ goalsAgainst: 2 })]);
    expect(rec).toEqual({ W: 1, D: 1, L: 1, gf: 4, ga: 3, cleanSheets: 1 });
  });
});

describe('opponentRecords', () => {
  it('groups opponents ignoring case and spacing, most played first', () => {
    const recs = opponentRecords([
      result({ opponent: 'rovers ', goalsFor: 2, date: '2025-09-01' }),
      result({ opponent: 'Rovers', goalsAgainst: 1, date: '2025-10-01' }),
      result({ opponent: 'City', goalsFor: 1, goalsAgainst: 1 }),
    ]);
    expect(recs).toEqual([
      { opponent: 'Rovers', played: 2, W: 1, D: 0, L: 1, gf: 2, ga: 1 },
      { opponent: 'City', played: 1, W: 0, D: 1, L: 0, gf: 1, ga: 1 },
    ]);
  });
});
