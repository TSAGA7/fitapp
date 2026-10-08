import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createLocalStorage } from './storage';

describe('default browser environment (no IndexedDB injected)', () => {
  it('opens the database through the global indexedDB, like a real browser', async () => {
    const s = await createLocalStorage({ name: 'global-env' });
    await s.repos.dailyLogs.put({ id: 'd1', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', deletedAt: null, deviceId: s.deviceId, date: '2026-10-01', waterMl: 250, note: null });
    expect((await s.repos.dailyLogs.getByDate('2026-10-01'))?.waterMl).toBe(250);
    s.close();
  });
});
