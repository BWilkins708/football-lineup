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

export const FORMATIONS: Record<string, Slot[]> = {
  '4-4-2': [GK, ...row(['LB', 'CB', 'CB', 'RB'], 'DEF', 24), ...row(['LM', 'CM', 'CM', 'RM'], 'MID', 50), ...row(['ST', 'ST'], 'FWD', 76, 30)],
  '4-3-3': [GK, ...row(['LB', 'CB', 'CB', 'RB'], 'DEF', 24), ...row(['CM', 'CM', 'CM'], 'MID', 48, 50), ...row(['LW', 'ST', 'RW'], 'FWD', 76, 70)],
  '4-2-3-1': [GK, ...row(['LB', 'CB', 'CB', 'RB'], 'DEF', 22), ...row(['DM', 'DM'], 'MID', 40, 34), ...row(['LAM', 'CAM', 'RAM'], 'MID', 60, 70), ...row(['ST'], 'FWD', 80)],
  '4-1-4-1': [GK, ...row(['LB', 'CB', 'CB', 'RB'], 'DEF', 22), ...row(['DM'], 'MID', 38), ...row(['LM', 'CM', 'CM', 'RM'], 'MID', 56), ...row(['ST'], 'FWD', 80)],
  '3-5-2': [GK, ...row(['CB', 'CB', 'CB'], 'DEF', 22, 56), ...row(['LWB', 'CM', 'CM', 'CM', 'RWB'], 'MID', 50, 88), ...row(['ST', 'ST'], 'FWD', 77, 30)],
  '3-4-3': [GK, ...row(['CB', 'CB', 'CB'], 'DEF', 22, 56), ...row(['LM', 'CM', 'CM', 'RM'], 'MID', 48), ...row(['LW', 'ST', 'RW'], 'FWD', 76, 70)],
  '5-3-2': [GK, ...row(['LWB', 'CB', 'CB', 'CB', 'RWB'], 'DEF', 24, 88), ...row(['CM', 'CM', 'CM'], 'MID', 50, 50), ...row(['ST', 'ST'], 'FWD', 76, 30)],
  '5-4-1': [GK, ...row(['LWB', 'CB', 'CB', 'CB', 'RWB'], 'DEF', 22, 88), ...row(['LM', 'CM', 'CM', 'RM'], 'MID', 48), ...row(['ST'], 'FWD', 76)],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

export const slotsFor = (formation: string) => FORMATIONS[formation] ?? FORMATIONS['4-4-2'];
