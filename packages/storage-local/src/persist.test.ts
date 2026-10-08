import { describe, expect, it } from 'vitest';
import { requestPersistentStorage } from './persist';

describe('navigator.storage.persist()', () => {
  it('asks the browser and reports the answer with usage', async () => {
    let asked = 0;
    const status = await requestPersistentStorage({
      persisted: async () => false,
      persist: async () => {
        asked++;
        return true;
      },
      estimate: async () => ({ usage: 1024, quota: 1_000_000 }),
    });
    expect(asked).toBe(1);
    expect(status).toEqual({ supported: true, persisted: true, requested: true, usageBytes: 1024, quotaBytes: 1_000_000, error: null });
  });
  it('does not ask again if the data is already persistent', async () => {
    let asked = 0;
    const status = await requestPersistentStorage({
      persisted: async () => true,
      persist: async () => {
        asked++;
        return true;
      },
    });
    expect(asked).toBe(0);
    expect(status).toMatchObject({ supported: true, persisted: true, requested: false });
  });
  it('reports a refusal without failing', async () => {
    const status = await requestPersistentStorage({ persisted: async () => false, persist: async () => false });
    expect(status).toMatchObject({ supported: true, persisted: false, requested: true, error: null });
  });
  it('works when the browser has no support or throws', async () => {
    expect(await requestPersistentStorage({})).toMatchObject({ supported: false, persisted: false });
    expect(await requestPersistentStorage(undefined)).toMatchObject({ supported: false });
    const err = await requestPersistentStorage({
      persist: async () => {
        throw new Error('нет доступа');
      },
    });
    expect(err).toMatchObject({ supported: true, persisted: false, error: 'нет доступа' });
  });
});
