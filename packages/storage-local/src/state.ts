import { STORE_NAMES, type StoreName } from '@fitapp/domain';
import type { AppDatabase } from './schema';

/** A cheap fingerprint of the database (row count and latest change per store). */
export async function computeStateToken(db: AppDatabase, stores: readonly StoreName[] = STORE_NAMES): Promise<string> {
  const parts: string[] = [];
  for (const s of stores) {
    const table = db.table(s);
    const count = await table.count();
    const last = count > 0 ? ((await table.orderBy('updatedAt').last()) as { updatedAt?: string } | undefined) : undefined;
    parts.push(`${s}:${count}:${last?.updatedAt ?? ''}`);
  }
  return parts.join('|');
}
