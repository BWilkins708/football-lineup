import type { Match, MatchEvent, Player } from './db';

export interface PlayerMatchStats {
  playerId: string;
  started: boolean;
  appeared: boolean;
  seconds: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  yellows: number;
  reds: number;
  cleanSheet: boolean;
}

export interface PlayerSeasonStats extends Omit<PlayerMatchStats, 'started' | 'appeared' | 'cleanSheet'> {
  apps: number;
  starts: number;
  cleanSheets: number;
}

/** Current running time of the match clock, in seconds. */
export function elapsed(match: Match, now = Date.now()) {
  const c = match.clock;
  const live = c.running && c.startedAt ? (now - c.startedAt) / 1000 : 0;
  return c.elapsedBefore + live;
}

/** Minute shown to the user for a running time, e.g. 47 in the second half. */
export function displayMinute(match: Match, t: number, period: 1 | 2) {
  if (period === 2 && match.clock.secondHalfStart !== undefined) {
    return match.halfLength + Math.floor((t - match.clock.secondHalfStart) / 60) + 1;
  }
  return Math.floor(t / 60) + 1;
}

export function formatMinute(match: Match, e: Pick<MatchEvent, 't' | 'period'>) {
  const m = displayMinute(match, e.t, e.period);
  const cap = e.period === 1 ? match.halfLength : match.halfLength * 2;
  return m > cap ? `${cap}+${m - cap}'` : `${m}'`;
}

export function formatClock(match: Match, t: number) {
  const base = match.status === 'second' || match.status === 'finished'
    ? match.halfLength * 60 + (t - (match.clock.secondHalfStart ?? 0))
    : t;
  const s = Math.max(0, Math.floor(base));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function score(match: Match) {
  let us = 0;
  let them = 0;
  for (const e of match.events) {
    if (e.type === 'goal') us++;
    if (e.type === 'goal_against') them++;
  }
  return { us, them };
}

export function starters(match: Match) {
  return Object.values(match.lineup.slots).filter((id): id is string => !!id);
}

/** Players currently on the pitch, after subs and red cards. */
export function onPitch(match: Match) {
  const on = new Set(starters(match));
  for (const e of [...match.events].sort((a, b) => a.t - b.t)) {
    if (e.type === 'sub') {
      if (e.outId) on.delete(e.outId);
      if (e.inId) on.add(e.inId);
    }
    if (e.type === 'red' && e.playerId) on.delete(e.playerId);
  }
  return on;
}

export function matchPlayerStats(match: Match, now = Date.now()): Map<string, PlayerMatchStats> {
  const map = new Map<string, PlayerMatchStats>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) {
      s = { playerId: id, started: false, appeared: false, seconds: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, yellows: 0, reds: 0, cleanSheet: false };
      map.set(id, s);
    }
    return s;
  };

  const end = match.status === 'setup' ? 0 : elapsed(match, now);
  const onSince = new Map<string, number>();
  for (const id of starters(match)) {
    const s = get(id);
    s.started = true;
    s.appeared = match.status !== 'setup';
    onSince.set(id, 0);
  }

  const goOff = (id: string, t: number) => {
    const from = onSince.get(id);
    if (from !== undefined) {
      get(id).seconds += Math.max(0, t - from);
      onSince.delete(id);
    }
  };

  for (const e of [...match.events].sort((a, b) => a.t - b.t)) {
    switch (e.type) {
      case 'goal':
        if (e.playerId && !e.ownGoal) get(e.playerId).goals++;
        if (e.assistId) get(e.assistId).assists++;
        if (e.playerId && !e.ownGoal) { get(e.playerId).shots++; get(e.playerId).shotsOnTarget++; }
        break;
      case 'shot':
        if (e.playerId) get(e.playerId).shots++;
        break;
      case 'shot_on_target':
        if (e.playerId) { get(e.playerId).shots++; get(e.playerId).shotsOnTarget++; }
        break;
      case 'yellow':
        if (e.playerId) get(e.playerId).yellows++;
        break;
      case 'red':
        if (e.playerId) { get(e.playerId).reds++; goOff(e.playerId, e.t); }
        break;
      case 'sub':
        if (e.outId) goOff(e.outId, e.t);
        if (e.inId) { const s = get(e.inId); s.appeared = true; onSince.set(e.inId, e.t); }
        break;
    }
  }
  for (const id of [...onSince.keys()]) goOff(id, end);

  if (match.status === 'finished' && score(match).them === 0) {
    // Two-thirds of the match, i.e. 60 minutes of a 90-minute game.
    const threshold = match.halfLength * 2 * 60 * (2 / 3);
    for (const s of map.values()) if (s.seconds >= threshold) s.cleanSheet = true;
  }
  return map;
}

export function seasonStats(players: Player[], matches: Match[]): Map<string, PlayerSeasonStats> {
  const out = new Map<string, PlayerSeasonStats>();
  for (const p of players) {
    out.set(p.id, { playerId: p.id, apps: 0, starts: 0, seconds: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, yellows: 0, reds: 0, cleanSheets: 0 });
  }
  for (const m of matches) {
    if (m.status === 'setup') continue;
    for (const s of matchPlayerStats(m).values()) {
      const agg = out.get(s.playerId);
      if (!agg) continue;
      if (s.appeared) agg.apps++;
      if (s.started) agg.starts++;
      agg.seconds += s.seconds;
      agg.goals += s.goals;
      agg.assists += s.assists;
      agg.shots += s.shots;
      agg.shotsOnTarget += s.shotsOnTarget;
      agg.yellows += s.yellows;
      agg.reds += s.reds;
      if (s.cleanSheet) agg.cleanSheets++;
    }
  }
  return out;
}

export const mins = (seconds: number) => Math.round(seconds / 60);
