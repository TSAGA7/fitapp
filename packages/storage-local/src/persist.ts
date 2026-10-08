export interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

export interface PersistenceStatus {
  supported: boolean;
  /** The browser promised not to evict the data. */
  persisted: boolean;
  /** A request was made during this call. */
  requested: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  error: string | null;
}

/**
 * Asks the browser to keep the data (navigator.storage.persist()). The answer is not guaranteed:
 * on iOS an installed home-screen app is the most reliable, so backups still matter.
 */
export async function requestPersistentStorage(
  manager: StorageManagerLike | undefined = (globalThis as { navigator?: { storage?: StorageManagerLike } }).navigator?.storage,
): Promise<PersistenceStatus> {
  const status: PersistenceStatus = { supported: false, persisted: false, requested: false, usageBytes: null, quotaBytes: null, error: null };
  if (!manager || typeof manager.persist !== 'function') return status;
  status.supported = true;
  try {
    status.persisted = typeof manager.persisted === 'function' ? await manager.persisted() : false;
    if (!status.persisted) {
      status.requested = true;
      status.persisted = await manager.persist();
    }
    if (typeof manager.estimate === 'function') {
      const e = await manager.estimate();
      status.usageBytes = e.usage ?? null;
      status.quotaBytes = e.quota ?? null;
    }
  } catch (e) {
    status.error = (e as Error).message;
  }
  return status;
}
