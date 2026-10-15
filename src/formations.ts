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
  DEF: [[], ['CB'], ['LB', 'RB'], ['LB', 'CB', 'RB'], ['LB', 'CB', 'CB', 'RB'], ['LWB', 'CB', 'CB', 'CB', 'RWB']],
  MID: [[], ['CM'], ['LM', 'RM'], ['LM', 'CM', 'RM'], ['LM', 'CM', 'CM', 'RM'], ['LM', 'CM', 'CM', 'CM', 'RM'], ['LM', 'CM', 'CM', 'CM', 'CM', 'RM']],
  FWD: [[], ['ST'], ['ST', 'ST'], ['LW', 'ST', 'RW'], ['LW', 'ST', 'ST', 'RW'], ['LW', 'ST', 'ST', 'ST', 'RW']],
};

/** Labels for midfield lines when there is more than one, from deepest to most advanced. */
const DEEP_MID = [[], ['DM'], ['DM', 'DM'], ['DM', 'DM', 'DM']];
const ATTACKING_MID = [[], ['AM'], ['LAM', 'RAM'], ['LAM', 'CAM', 'RAM'], ['LAM', 'AM', 'AM', 'RAM']];

/** Builds the layout for any formation from its name, e.g. "4-1-2-1-2": defenders, midfield lines, forwards. */
function build(name: string): Slot[] {
  const lines = name.split('-').map(Number);
  const slots = [GK];
  const midLines = lines.length - 2;
  lines.forEach((n, i) => {
    const role: Position = i === 0 ? 'DEF' : i === lines.length - 1 ? 'FWD' : 'MID';
    const y = 24 + ((78 - 24) / (lines.length - 1)) * i;
    let labels = LABELS[role][n] ?? Array(n).fill(role);
    if (role === 'MID' && midLines > 1) {
      if (i === 1 && DEEP_MID[n]) labels = DEEP_MID[n];
      else if (i === lines.length - 2 && ATTACKING_MID[n]) labels = ATTACKING_MID[n];
    }
    const spread = n === 2 ? (role === 'FWD' ? 30 : 50) : n === 3 ? 64 : n === 4 ? 80 : 88;
    slots.push(...row(labels, role, y, spread));
  });
  return slots;
}

export const TEAM_SIZES = [5, 6, 7, 9, 11] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

/** Formations offered for each team size, most common first. */
export const FORMATIONS_BY_SIZE: Record<TeamSize, string[]> = {
  5: ['1-2-1', '2-2', '2-1-1', '1-1-2', '3-1', '1-3'],
  6: ['2-1-2', '2-2-1', '3-1-1', '1-3-1', '3-2', '2-3', '1-2-2', '2-1-1-1', '1-2-1-1'],
  7: ['2-3-1', '3-2-1', '3-1-2', '2-1-2-1', '1-3-2', '3-3', '2-2-2', '3-1-1-1', '1-2-3', '2-4'],
  9: ['3-3-2', '3-2-3', '2-4-2', '3-4-1', '4-3-1', '3-1-3-1', '2-3-2-1', '3-2-2-1', '4-2-2', '2-3-3', '3-1-2-2'],
  11: [
    '4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '4-4-1-1', '4-3-2-1', '4-1-2-1-2', '4-2-2-2', '4-3-1-2', '4-5-1',
    '4-1-3-2', '4-2-1-3', '4-2-4',
    '3-5-2', '3-4-3', '3-4-1-2', '3-4-2-1', '3-1-4-2', '3-5-1-1', '3-3-3-1', '3-2-4-1', '3-6-1',
    '5-3-2', '5-4-1', '5-2-3', '5-2-1-2', '5-3-1-1',
  ],
};

/** Players per side for a formation: the outfield lines plus the goalkeeper. */
export const sizeOf = (formation: string): TeamSize =>
  (formation.split('-').reduce((sum, n) => sum + Number(n), 0) + 1) as TeamSize;

/** Checks a typed formation like "4-1-2-1-2" for a team size; returns an error message or undefined. */
export function validateFormation(formation: string, size: TeamSize): string | undefined {
  if (!/^[1-6](-[1-6]){1,4}$/.test(formation)) {
    return 'Use 2 to 5 numbers from 1 to 6 separated by dashes, e.g. 4-1-2-1-2.';
  }
  const outfield = size - 1;
  if (sizeOf(formation) !== size) return `The numbers must add up to ${outfield} outfield players for ${size}-a-side.`;
  return undefined;
}

const cache = new Map<string, Slot[]>(Object.entries(ELEVEN));

export const slotsFor = (formation: string) => {
  let slots = cache.get(formation);
  if (!slots) {
    slots = /^[1-6](-[1-6]){1,4}$/.test(formation) ? build(formation) : ELEVEN['4-4-2'];
    cache.set(formation, slots);
  }
  return slots;
};
