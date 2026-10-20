import { describe, expect, it } from 'vitest';
import { ALL_SEASONS, inSeason, seasonLabel, seasonOf, seasonOptions } from '../seasons';

describe('seasons', () => {
  it('splits an August-start season across two years', () => {
    expect(seasonOf('2025-08-01')).toBe('2025');
    expect(seasonOf('2026-05-30')).toBe('2025');
    expect(seasonOf('2025-07-31')).toBe('2024');
    expect(seasonLabel('2025')).toBe('2025/26');
  });

  it('uses the calendar year when the season starts in January', () => {
    expect(seasonOf('2025-12-31', 1)).toBe('2025');
    expect(seasonOf('2026-01-01', 1)).toBe('2026');
    expect(seasonLabel('2026', 1)).toBe('2026');
  });

  it('lists seasons with results plus the current one, newest first', () => {
    expect(seasonOptions([{ date: '2023-09-01' }, { date: '2024-03-01' }], 8, '2025-10-20')).toEqual(['2025', '2023']);
  });

  it('filters results to a season, or keeps them all', () => {
    const rs = [{ date: '2025-09-01' }, { date: '2024-09-01' }];
    expect(inSeason(rs, '2025', 8)).toEqual([{ date: '2025-09-01' }]);
    expect(inSeason(rs, ALL_SEASONS, 8)).toBe(rs);
  });
});
