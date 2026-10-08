import { STORE_NAMES, type StoreName } from '../model';
import { IMMUTABLE_STORES, SINGLETON_STORES } from './backup';

export type ConflictPolicy = 'keep_existing' | 'overwrite_if_newer' | 'overwrite_all';

export interface ConflictInfo {
  store: StoreName;
  id: string;
  kind: 'differs' | 'singleton_other_id' | 'immutable';
  incomingUpdatedAt: string;
  existingUpdatedAt: string;
  differingFields: string[];
  resolution: 'keep_existing' | 'overwrite';
  reason: string;
}

export type ExistingRows = Record<StoreName, Map<string, Record<string, unknown>>>;

export interface BackupImportPlan {
  policy: ConflictPolicy;
  toInsert: Record<StoreName, Array<Record<string, unknown>>>;
  toUpdate: Record<StoreName, Array<Record<string, unknown>>>;
  /** Singleton stores: the existing live row is marked deleted and the incoming one inserted. */
  replaceSingletons: Array<{ store: StoreName; existingId: string; incomingId: string }>;
  identical: Record<StoreName, number>;
  conflicts: ConflictInfo[];
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

const perStore = <T>(make: () => T): Record<StoreName, T> =>
  Object.fromEntries(STORE_NAMES.map((n) => [n, make()])) as unknown as Record<StoreName, T>;

export function emptyExistingRows(): ExistingRows {
  return perStore(() => new Map<string, Record<string, unknown>>());
}

const differing = (a: Record<string, unknown>, b: Record<string, unknown>): string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => stableStringify(a[k]) !== stableStringify(b[k])).sort();

/**
 * Decides what an import would do. Nothing is written here and nothing is overwritten
 * unless the chosen policy says so: by default existing data wins.
 */
export function planBackupImport(
  valid: Record<StoreName, Array<Record<string, unknown>>>,
  existing: ExistingRows,
  policy: ConflictPolicy = 'keep_existing',
): BackupImportPlan {
  const plan: BackupImportPlan = {
    policy,
    toInsert: perStore(() => []),
    toUpdate: perStore(() => []),
    replaceSingletons: [],
    identical: perStore(() => 0),
    conflicts: [],
  };

  for (const store of STORE_NAMES) {
    const existingMap = existing[store];
    for (const incoming of valid[store] ?? []) {
      const id = incoming.id as string;
      const current = existingMap.get(id);

      if (!current) {
        // A different id in a singleton store means a second profile/program: a conflict, not an insert.
        if (SINGLETON_STORES.includes(store) && incoming.deletedAt === null) {
          const live = [...existingMap.values()].find((r) => r.deletedAt === null);
          if (live) {
            const newer = String(incoming.updatedAt) > String(live.updatedAt);
            const overwrite = policy === 'overwrite_all' || (policy === 'overwrite_if_newer' && newer);
            plan.conflicts.push({
              store,
              id,
              kind: 'singleton_other_id',
              incomingUpdatedAt: String(incoming.updatedAt),
              existingUpdatedAt: String(live.updatedAt),
              differingFields: differing(incoming, live),
              resolution: overwrite ? 'overwrite' : 'keep_existing',
              reason: overwrite ? 'Существующая запись помечается удалённой, добавляется запись из файла' : 'В приложении уже есть своя запись, она сохранена',
            });
            if (overwrite) {
              plan.replaceSingletons.push({ store, existingId: live.id as string, incomingId: id });
              plan.toInsert[store].push(incoming);
            }
            continue;
          }
        }
        plan.toInsert[store].push(incoming);
        continue;
      }

      if (stableStringify(incoming) === stableStringify(current)) {
        plan.identical[store]++;
        continue;
      }
      const base = {
        store,
        id,
        incomingUpdatedAt: String(incoming.updatedAt),
        existingUpdatedAt: String(current.updatedAt),
        differingFields: differing(incoming, current),
      };
      if (IMMUTABLE_STORES.includes(store)) {
        plan.conflicts.push({ ...base, kind: 'immutable', resolution: 'keep_existing', reason: 'Версии программы неизменяемы: сохранена существующая' });
        continue;
      }
      const newer = String(incoming.updatedAt) > String(current.updatedAt);
      const overwrite = policy === 'overwrite_all' || (policy === 'overwrite_if_newer' && newer);
      plan.conflicts.push({
        ...base,
        kind: 'differs',
        resolution: overwrite ? 'overwrite' : 'keep_existing',
        reason: overwrite
          ? 'Запись в приложении будет заменена записью из файла'
          : policy === 'overwrite_if_newer'
            ? 'Запись в приложении новее или такая же, она сохранена'
            : 'Существующая запись сохранена',
      });
      if (overwrite) plan.toUpdate[store].push(incoming);
    }
  }
  return plan;
}

export interface ReferenceRule {
  store: StoreName;
  /** Dotted path to the field with the referenced id. */
  field: string;
  target: StoreName;
}

export const REFERENCE_RULES: readonly ReferenceRule[] = [
  { store: 'setLogs', field: 'sessionExerciseId', target: 'sessionExercises' },
  { store: 'setLogs', field: 'plannedSetId', target: 'plannedSets' },
  { store: 'setLogs', field: 'exerciseId', target: 'exercises' },
  { store: 'sessionExercises', field: 'sessionId', target: 'workoutSessions' },
  { store: 'sessionExercises', field: 'exerciseId', target: 'exercises' },
  { store: 'workoutSessions', field: 'versionId', target: 'programVersions' },
  { store: 'plannedSessions', field: 'versionId', target: 'programVersions' },
  { store: 'plannedSets', field: 'plannedSessionId', target: 'plannedSessions' },
  { store: 'plannedSets', field: 'exerciseId', target: 'exercises' },
  { store: 'plannedItems', field: 'planId', target: 'mealPlans' },
  { store: 'plannedItems', field: 'foodId', target: 'foods' },
  { store: 'mealPlans', field: 'versionId', target: 'programVersions' },
  { store: 'foodLogs', field: 'plannedItemId', target: 'plannedItems' },
  { store: 'foodLogs', field: 'snapshot.foodId', target: 'foods' },
  { store: 'userFoods', field: 'foodId', target: 'foods' },
  { store: 'userEquipment', field: 'equipmentId', target: 'equipment' },
  { store: 'programVersions', field: 'programId', target: 'programs' },
  { store: 'planChanges', field: 'toVersionId', target: 'programVersions' },
  { store: 'proposals', field: 'baseVersionId', target: 'programVersions' },
];

/** Sentinel version id of workout sessions imported from old records (there is no program version for them). */
export const IMPORTED_HISTORY_VERSION_ID = 'imported_history';

export interface DanglingReference {
  store: StoreName;
  id: string;
  field: string;
  target: StoreName;
  missingId: string;
}

const getPath = (obj: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj);

/** Warns about records that would point to something that does not exist after the import. */
export function findDanglingReferences(
  incoming: Record<StoreName, Array<Record<string, unknown>>>,
  existingIds: Record<StoreName, Set<string>>,
): DanglingReference[] {
  const out: DanglingReference[] = [];
  const known = (store: StoreName, id: string): boolean =>
    existingIds[store].has(id) || (incoming[store] ?? []).some((r) => r.id === id);
  for (const rule of REFERENCE_RULES) {
    for (const rec of incoming[rule.store] ?? []) {
      const ref = getPath(rec, rule.field);
      if (typeof ref !== 'string' || ref === '') continue;
      if (ref === IMPORTED_HISTORY_VERSION_ID) continue;
      if (!known(rule.target, ref)) out.push({ store: rule.store, id: rec.id as string, field: rule.field, target: rule.target, missingId: ref });
    }
  }
  return out;
}

