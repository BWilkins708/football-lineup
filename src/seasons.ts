import type { Result } from './db';

/** Most leagues start in August; teams can change this in settings. */
export const DEFAULT_SEASON_START = 8;

export const ALL_SEASONS = 'all';

// en-CA formats as yyyy-mm-dd in the device's local time zone.
export const today = () => new Date().toLocaleDateString('en-CA');

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The season a yyyy-mm-dd date falls in, named by the year it starts, e.g. "2025". */
export function seasonOf(date: string, startMonth = DEFAULT_SEASON_START): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return String(month >= startMonth ? year : year - 1);
}

/** "2025/26" for a season spanning two years, or "2025" when it starts in January. */
export function seasonLabel(season: string, startMonth = DEFAULT_SEASON_START): string {
  if (season === ALL_SEASONS) return 'All seasons';
  if (startMonth === 1) return season;
  return `${season}/${String(Number(season) + 1).slice(2)}`;
}

/** Seasons that have results, plus the current one, newest first. */
export function seasonOptions(results: Pick<Result, 'date'>[], startMonth: number, today: string): string[] {
  const seasons = new Set([seasonOf(today, startMonth), ...results.map((r) => seasonOf(r.date, startMonth))]);
  return [...seasons].sort((a, b) => b.localeCompare(a));
}

export function inSeason<T extends Pick<Result, 'date'>>(results: T[], season: string, startMonth: number): T[] {
  if (season === ALL_SEASONS) return results;
  return results.filter((r) => seasonOf(r.date, startMonth) === season);
}
