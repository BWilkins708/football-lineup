import type { Position } from './db';

export interface Slot {
  label: string;
  role: Position;
  /** Percent across the pitch, 0 = left touchline. */
  x: number;
  /** Percent up the pitch, 0 = own goal line. */
  y: number;
}

const GK: Slot = { label: 'GK', role: 'GK', x: 50, y: 6 };

function row(labels: string[], role: Position, y: number, spread = 80): Slot[] {
  const n = labels.length;
  return labels.map((label, i) => ({
    label,
    role,
    y,
    x: n === 1 ? 50 : 50 - spread / 2 + (spread / (n - 1)) * i,
  }));
}

const ELEVEN: Record<string, Slot[]> = {
  '4-4-2': [GK, ...row(['LB', 'CB', 'CB', 'RB'], 'DEF', 24), ...row(['LM', 'CM', 'CM', 'RM'], 'MID', 50), ...row(['ST', 'ST'], 'FWD', 76, 30)],
  '4-3-3': [GK, ...row(['LB', 'CB', 'CB', 'RB'], 'DEF', 24), ...row(['CM', 'CM', 'CM'], 'MID', 48, 50), ...row(['LW', 'ST', 'RW'], 'FWD', 76, 70)],
  '4-2-3-1': [GK, ...row(['LB', 'CB', 'CB', 'RB'], 'DEF', 22), ...row(['DM', 'DM'], 'MID', 40, 34), ...row(['LAM', 'CAM', 'RAM'], 'MID', 60, 70), ...row(['ST'], 'FWD', 80)],
  '4-1-4-1': [GK, ...row(['LB', 'CB', 'CB', 'RB'], 'DEF', 22), ...row(['DM'], 'MID', 38), ...row(['LM', 'CM', 'CM', 'RM'], 'MID', 56), ...row(['ST'], 'FWD', 80)],
  '3-5-2': [GK, ...row(['CB', 'CB', 'CB'], 'DEF', 22, 56), ...row(['LWB', 'CM', 'CM', 'CM', 'RWB'], 'MID', 50, 88), ...row(['ST', 'ST'], 'FWD', 77, 30)],
  '3-4-3': [GK, ...row(['CB', 'CB', 'CB'], 'DEF', 22, 56), ...row(['LM', 'CM', 'CM', 'RM'], 'MID', 48), ...row(['LW', 'ST', 'RW'], 'FWD', 76, 70)],
  '5-3-2': [GK, ...row(['LWB', 'CB', 'CB', 'CB', 'RWB'], 'DEF', 24, 88), ...row(['CM', 'CM', 'CM'], 'MID', 50, 50), ...row(['ST', 'ST'], 'FWD', 76, 30)],
  '5-4-1': [GK, ...row(['LWB', 'CB', 'CB', 'CB', 'RWB'], 'DEF', 22, 88), ...row(['LM', 'CM', 'CM', 'RM'], 'MID', 48), ...row(['ST'], 'FWD', 76)],
};

const LABELS: Record<Position, string[][]> = {
  GK: [],
  DEF: [[], ['CB'], ['LB', 'RB'], ['LB', 'CB', 'RB']],
  MID: [[], ['CM'], ['LM', 'RM'], ['LM', 'CM', 'RM']],
  FWD: [[], ['ST'], ['ST', 'ST'], ['LW', 'ST', 'RW']],
};

/** Builds a small-sided formation from its name, e.g. "2-3-1": defenders, midfield lines, forwards. */
function smallSided(name: string): Slot[] {
  const lines = name.split('-').map(Number);
  const slots = [GK];
  lines.forEach((n, i) => {
    const role: Position = i === 0 ? 'DEF' : i === lines.length - 1 ? 'FWD' : 'MID';
    const y = 24 + ((76 - 24) / (lines.length - 1)) * i;
    let labels = LABELS[role][n];
    // With two midfield lines, single players are a holding and an attacking midfielder.
    if (role === 'MID' && n === 1 && lines.length > 3) labels = [i === 1 ? 'DM' : 'AM'];
    slots.push(...row(labels, role, y, n === 2 ? 50 : 64));
  });
  return slots;
}

export const TEAM_SIZES = [5, 6, 7, 11] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

const SMALL: Record<number, string[]> = {
  5: ['1-2-1', '2-2', '2-1-1', '1-1-2', '3-1'],
  6: ['2-1-2', '2-2-1', '3-1-1', '1-3-1', '3-2'],
  7: ['2-3-1', '3-2-1', '3-1-2', '2-1-2-1', '1-3-2', '3-3'],
};

export const FORMATIONS: Record<string, Slot[]> = {
  ...Object.fromEntries(Object.values(SMALL).flat().map((f) => [f, smallSided(f)])),
  ...ELEVEN,
};

/** Formations for each team size, default first. */
export const FORMATIONS_BY_SIZE: Record<TeamSize, string[]> = {
  5: SMALL[5],
  6: SMALL[6],
  7: SMALL[7],
  11: Object.keys(ELEVEN),
};

export const sizeOf = (formation: string): TeamSize => slotsFor(formation).length as TeamSize;

export const slotsFor = (formation: string) => FORMATIONS[formation] ?? FORMATIONS['4-4-2'];
