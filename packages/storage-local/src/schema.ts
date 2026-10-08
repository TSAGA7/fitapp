import Dexie, { type Table, type Transaction } from 'dexie';
import type { z } from 'zod';
import type { ENTITY_SCHEMAS } from '@fitapp/domain';

/**
 * Index definitions. Primary key is always `id`; every store also has `updatedAt` so that a
 * change feed can find what changed. Each entry of MIGRATIONS lists only the changes of that version.
 */
export const STORES_V1: Record<string, string> = {
  profile: 'id, updatedAt',
  goals: 'id, status, updatedAt',
  bodyMetrics: 'id, [type+measuredOn], measuredOn, updatedAt',
  injuries: 'id, area, status, updatedAt',
  painEvents: 'id, exerciseId, occurredAt, updatedAt',
  equipment: 'id, origin, updatedAt',
  userEquipment: 'id, equipmentId, updatedAt',
  exercises: 'id, origin, updatedAt',
  foods: 'id, barcode, origin, updatedAt',
  userFoods: 'id, foodId, updatedAt',
  nutritionTargets: 'id, validFrom, updatedAt',
  mealPlans: 'id, weekStart, status, updatedAt',
  plannedItems: 'id, planId, date, [planId+date], updatedAt',
  foodLogs: 'id, date, plannedItemId, [date+slot], updatedAt',
  dailyLogs: 'id, date, updatedAt',
  programs: 'id, updatedAt',
  programVersions: 'id, programId, versionNo, updatedAt',
  planChanges: 'id, toVersionId, createdAt, updatedAt',
  proposals: 'id, status, baseVersionId, updatedAt',
  plannedSessions: 'id, plannedDate, versionId, status, updatedAt',
  plannedSets: 'id, plannedSessionId, contextKey, updatedAt',
  workoutSessions: 'id, startedAt, status, plannedSessionId, updatedAt',
  sessionExercises: 'id, sessionId, exerciseId, updatedAt',
  setLogs: 'id, sessionExerciseId, contextKey, exerciseId, completedAt, source, updatedAt',
  weeklySummaries: 'id, weekStart, updatedAt',
  progressPhotos: 'id, takenOn, updatedAt',
  // Not user entities:
  appMeta: 'key',
  syncState: 'store',
};

export interface Migration {
  /** Application schema version (must match SCHEMA_VERSION of the domain for the last entry). */
  version: number;
  description: string;
  /** Tables added or changed in this version (null deletes a table). */
  stores: Record<string, string | null>;
  upgrade?: (tx: Transaction) => Promise<void> | void;
}

export const STORES_V2: Record<string, string> = {
  userExercises: 'id, exerciseId, updatedAt',
  exerciseNotes: 'id, exerciseId, sessionId, updatedAt',
};

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, description: 'Initial schema', stores: STORES_V1 },
  { version: 2, description: 'Exercise likes and notes', stores: STORES_V2 },
];

export const LATEST_VERSION = (MIGRATIONS[MIGRATIONS.length - 1] as Migration).version;

type EntityTables = { [K in keyof typeof ENTITY_SCHEMAS]: Table<z.infer<(typeof ENTITY_SCHEMAS)[K]>, string> };

export interface MetaRow {
  key: string;
  value: unknown;
}
export interface SyncRow {
  store: string;
  cursor: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AppDatabase extends EntityTables {
  appMeta: Table<MetaRow, string>;
  syncState: Table<SyncRow, string>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AppDatabase extends Dexie {}
