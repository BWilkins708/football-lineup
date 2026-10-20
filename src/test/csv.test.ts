import { describe, expect, it } from 'vitest';
import type { Player, Result } from '../db';
import { playerStatsCsv, resultsCsv, toCsv } from '../csv';

describe('csv', () => {
  it('quotes cells with commas, quotes and new lines', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'x\ny', undefined, 3]])).toBe('a,"b,c","say ""hi""","x\ny",,3\r\n');
  });

  const players: Player[] = [
    { id: 'a', teamId: 't', name: 'Sam Carter', number: 9, positions: ['FWD'], active: true, createdAt: 0 },
    { id: 'b', teamId: 't', name: 'Jo Reid', number: 4, positions: ['DEF'], active: true, createdAt: 0 },
  ];
  const results: Result[] = [{
    id: 'r', teamId: 't', opponent: 'Rovers', date: '2025-09-06', venue: 'Away', goalsFor: 2, goalsAgainst: 0,
    goals: [{ scorerId: 'a', assistId: 'b' }, { ownGoal: true }], playedIds: ['a', 'b'], createdAt: 0,
  }];

  it('exports player stats ordered by shirt number', () => {
    expect(playerStatsCsv(players, results).split('\r\n')).toEqual([
      'Number,Name,Positions,Games played,Goals,Assists,Clean sheets',
      '4,Jo Reid,DEF,1,0,1,1',
      '9,Sam Carter,FWD,1,1,0,0',
      '',
    ]);
  });

  it('exports results with scorers, assists and who played', () => {
    expect(resultsCsv(results, players).split('\r\n')[1]).toBe('2025-09-06,Rovers,Away,,W,2,0,Sam Carter; Own goal,Jo Reid,Sam Carter; Jo Reid');
  });
});
