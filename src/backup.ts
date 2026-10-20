import { db, exportData } from './db';
import { shareFile } from './share';

const LAST_BACKUP = 'lastBackupAt';
const SNOOZE_UNTIL = 'backupSnoozeUntil';

const DAY = 24 * 60 * 60 * 1000;
/** How long after a backup to start reminding again, if anything has changed. */
export const REMIND_AFTER_DAYS = 14;

const read = (key: string) => {
  try {
    return Number(localStorage.getItem(key)) || undefined;
  } catch {
    return undefined;
  }
};

const write = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Without storage the reminder just shows again next time.
  }
};

/** Window event fired after a backup is saved, so the reminder can hide. */
export const BACKED_UP = 'backup-saved';

export const lastBackupAt = () => read(LAST_BACKUP);

/** Hides the reminder for a few days. */
export const snoozeBackup = (days = 3) => write(SNOOZE_UNTIL, Date.now() + days * DAY);

/** Saves a backup of every team to the phone (share sheet) or downloads it. */
export async function backUpNow() {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const saved = await shareFile(blob, `soccer-lineup-backup-${new Date().toLocaleDateString('en-CA')}.json`, 'Soccer Line-up backup');
  if (saved) {
    write(LAST_BACKUP, Date.now());
    window.dispatchEvent(new Event(BACKED_UP));
  }
  return saved;
}

/**
 * Whether to nudge the coach to back up: there is something worth keeping, it has changed since the last
 * backup, and the last backup is old (or never happened).
 */
export function needsBackup(
  { lastBackup, snoozeUntil, latestChange, results, players }:
  { lastBackup?: number; snoozeUntil?: number; latestChange: number; results: number; players: number },
  now = Date.now(),
) {
  if (snoozeUntil && snoozeUntil > now) return false;
  if (results === 0 && players < 5) return false;
  if (!lastBackup) return true;
  return latestChange > lastBackup && now - lastBackup > REMIND_AFTER_DAYS * DAY;
}

/** Reads what the reminder needs from the database. */
export async function backupStatus() {
  const [results, players, lineups] = await Promise.all([db.results.toArray(), db.players.toArray(), db.lineups.toArray()]);
  const latestChange = Math.max(
    0,
    ...results.map((r) => r.updatedAt ?? r.createdAt),
    ...players.map((p) => p.createdAt),
    ...lineups.map((l) => l.updatedAt),
  );
  return { lastBackup: lastBackupAt(), snoozeUntil: read(SNOOZE_UNTIL), latestChange, results: results.length, players: players.length };
}
