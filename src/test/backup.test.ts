import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, exportData, parseBackup, restoreBackup } from '../db';
import { needsBackup } from '../backup';

const DAY = 24 * 60 * 60 * 1000;

async function seed() {
  await Promise.all([db.teams.clear(), db.players.clear(), db.lineups.clear(), db.results.clear()]);
  await db.teams.bulkAdd([{ id: 'a', name: 'Under 10s', createdAt: 1 }, { id: 'b', name: 'Sunday XI', createdAt: 2 }]);
  await db.players.bulkAdd([
    { id: 'pa', teamId: 'a', name: 'Sam', positions: [], active: true, createdAt: 1 },
    { id: 'pb', teamId: 'b', name: 'Jo', positions: [], active: true, createdAt: 1 },
  ]);
}

describe('restoring a backup', () => {
  beforeEach(seed);

  it('rejects files that are not backups', () => {
    expect(() => parseBackup({ hello: 1 })).toThrow('not a Soccer Line-up backup');
    expect(() => parseBackup({ app: 'soccer-lineup', players: [], results: 'nope' })).toThrow();
  });

  it('merges chosen teams and keeps everything else on the phone', async () => {
    const backup = parseBackup(await exportData());
    await db.players.update('pa', { name: 'Changed' });
    await db.teams.add({ id: 'c', name: 'New team', createdAt: 3 });

    await restoreBackup(backup, 'merge', ['a']);

    expect((await db.players.get('pa'))!.name).toBe('Sam');
    expect(await db.teams.get('c')).toBeDefined();
    expect(await db.teams.count()).toBe(3);
  });

  it('replaces everything when asked', async () => {
    const backup = parseBackup(await exportData());
    await db.teams.add({ id: 'c', name: 'New team', createdAt: 3 });
    await restoreBackup(backup, 'replace');
    expect((await db.teams.toArray()).map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('puts backups from before teams existed into one team', () => {
    const backup = parseBackup({ app: 'soccer-lineup', players: [{ id: 'x', name: 'Old', positions: [], active: true, createdAt: 0 }] });
    expect(backup.teams).toHaveLength(1);
    expect(backup.players[0].teamId).toBe(backup.teams[0].id);
  });
});

describe('backup reminder', () => {
  const now = 100 * DAY;
  const base = { latestChange: now - DAY, results: 3, players: 10 };

  it('waits until there is something worth keeping', () => {
    expect(needsBackup({ ...base, results: 0, players: 2 }, now)).toBe(false);
    expect(needsBackup(base, now)).toBe(true);
  });

  it('reminds again only after two weeks with new changes', () => {
    expect(needsBackup({ ...base, lastBackup: now - 3 * DAY }, now)).toBe(false);
    expect(needsBackup({ ...base, lastBackup: now - 20 * DAY }, now)).toBe(true);
    expect(needsBackup({ ...base, lastBackup: now - 20 * DAY, latestChange: now - 21 * DAY }, now)).toBe(false);
  });

  it('stays quiet while snoozed', () => {
    expect(needsBackup({ ...base, snoozeUntil: now + DAY }, now)).toBe(false);
  });
});
