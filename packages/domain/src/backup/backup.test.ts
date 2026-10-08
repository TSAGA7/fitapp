import { describe, expect, it } from 'vitest';
import { STORE_NAMES } from '../model';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, buildBackup, parseJson, validateBackup } from './backup';
import { IMPORTED_HISTORY_VERSION_ID, emptyExistingRows, findDanglingReferences, planBackupImport, stableStringify } from './importPlan';

const NOW = '2026-10-01T08:00:00+02:00';
const LATER = '2026-10-02T08:00:00+02:00';
const base = (id: string, updatedAt = NOW) => ({ id, createdAt: NOW, updatedAt, deletedAt: null, deviceId: 'd' });
const metric = (id: string, over: Record<string, unknown> = {}) => ({ ...base(id), type: 'weight', value: 82.5, unit: 'kg', measuredOn: '2026-10-01', note: null, ...over });
const goal = (id: string) => ({ ...base(id), type: 'fat_loss', priority: 1, status: 'active', startedOn: '2026-10-01', endedOn: null, targetWeightKg: 77, targetWaistCm: null, focus: [] });
const emptyStores = () => ({}) as Parameters<typeof planBackupImport>[0];
const rows = (partial: Record<string, Array<Record<string, unknown>>>) => {
  const out = Object.fromEntries(STORE_NAMES.map((n) => [n, []])) as unknown as Parameters<typeof planBackupImport>[0];
  for (const [k, v] of Object.entries(partial)) (out as Record<string, unknown>)[k] = v;
  return out;
};
const file = (stores: Record<string, unknown[]>, over: Record<string, unknown> = {}) => ({
  format: BACKUP_FORMAT,
  formatVersion: BACKUP_FORMAT_VERSION,
  schemaVersion: 1,
  createdAt: NOW,
  deviceId: 'dev-a',
  stores,
  ...over,
});

describe('buildBackup', () => {
  it('contains every store, the format and the versions', () => {
    const b = buildBackup({ createdAt: NOW, deviceId: 'dev-a', stores: { bodyMetrics: [metric('m1')] } });
    expect(b.format).toBe('fitapp-backup');
    expect(Object.keys(b.stores).sort()).toEqual([...STORE_NAMES].sort());
    expect(b.stores.bodyMetrics).toHaveLength(1);
    expect(b.stores.goals).toEqual([]);
  });
});

describe('validateBackup', () => {
  it('accepts a complete file and counts the records', () => {
    const v = validateBackup(buildBackup({ createdAt: NOW, deviceId: 'dev-a', stores: { bodyMetrics: [metric('m1'), metric('m2')], goals: [goal('g1')] } }));
    expect(v.ok).toBe(true);
    expect(v.counts.bodyMetrics).toEqual({ total: 2, valid: 2, invalid: 0 });
    expect(v.records.goals).toHaveLength(1);
    expect(v.invalid).toEqual([]);
  });
  it('rejects things that are not a Fitapp backup', () => {
    expect(validateBackup(undefined).errors[0]).toContain('не файл резервной копии');
    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    expect(validateBackup(file({}, { createdAt: 'вчера' })).errors[0]).toContain('Повреждён заголовок');
  });
  it('blocks a backup from a newer format or a newer schema', () => {
    expect(validateBackup(file({}, { formatVersion: 99 })).errors[0]).toContain('новее');
    expect(validateBackup(file({}, { schemaVersion: 99 })).errors[0]).toContain('Схема данных');
    expect(validateBackup(file({}, { schemaVersion: 99 })).ok).toBe(false);
  });
  it('shows invalid records separately and still accepts the valid ones', () => {
    const v = validateBackup(file({ bodyMetrics: [metric('m1'), metric('m2', { unit: 'cm' }), { nonsense: true }, metric('m1')] }));
    expect(v.ok).toBe(true);
    expect(v.counts.bodyMetrics).toEqual({ total: 4, valid: 1, invalid: 3 });
    expect(v.invalid.map((i) => i.index)).toEqual([1, 2, 3]);
    expect(v.invalid[0]?.messages[0]).toContain('unit');
    expect(v.invalid[1]?.id).toBeNull();
    expect(v.invalid[2]?.messages[0]).toContain('повтор внутри файла');
  });
  it('reports unknown stores without failing', () => {
    const v = validateBackup(file({ futureThing: [1, 2], goals: [] }));
    expect(v.ok).toBe(true);
    expect(v.unknownStores).toEqual([{ store: 'futureThing', count: 2 }]);
  });
  it('parseJson explains broken JSON', () => {
    const r = parseJson('{oops');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('не является корректным JSON');
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });
});

describe('planBackupImport (nothing is overwritten silently)', () => {
  it('inserts everything into an empty database', () => {
    const plan = planBackupImport(rows({ bodyMetrics: [metric('m1'), metric('m2')] }), emptyExistingRows());
    expect(plan.toInsert.bodyMetrics).toHaveLength(2);
    expect(plan.conflicts).toEqual([]);
  });
  it('identical records are skipped, not rewritten', () => {
    const ex = emptyExistingRows();
    ex.bodyMetrics.set('m1', metric('m1'));
    const plan = planBackupImport(rows({ bodyMetrics: [metric('m1')] }), ex);
    expect(plan.identical.bodyMetrics).toBe(1);
    expect(plan.toInsert.bodyMetrics).toEqual([]);
    expect(plan.toUpdate.bodyMetrics).toEqual([]);
  });
  const differing = () => {
    const ex = emptyExistingRows();
    ex.bodyMetrics.set('m1', metric('m1', { value: 80 }));
    return ex;
  };
  it('by default existing data wins and the conflict is listed', () => {
    const plan = planBackupImport(rows({ bodyMetrics: [metric('m1', { value: 90, updatedAt: LATER })] }), differing());
    expect(plan.toUpdate.bodyMetrics).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({ kind: 'differs', resolution: 'keep_existing', differingFields: ['updatedAt', 'value'] });
  });
  it('overwrite_if_newer replaces only older records', () => {
    const newer = planBackupImport(rows({ bodyMetrics: [metric('m1', { value: 90, updatedAt: LATER })] }), differing(), 'overwrite_if_newer');
    expect(newer.toUpdate.bodyMetrics).toHaveLength(1);
    expect(newer.conflicts[0]?.resolution).toBe('overwrite');
    const older = planBackupImport(rows({ bodyMetrics: [metric('m1', { value: 90, updatedAt: '2026-09-01T00:00:00+02:00' })] }), differing(), 'overwrite_if_newer');
    expect(older.toUpdate.bodyMetrics).toEqual([]);
    expect(older.conflicts[0]?.resolution).toBe('keep_existing');
  });
  it('overwrite_all replaces the record, but never a program version', () => {
    const all = planBackupImport(rows({ bodyMetrics: [metric('m1', { value: 90 })] }), differing(), 'overwrite_all');
    expect(all.toUpdate.bodyMetrics).toHaveLength(1);
    const ex = emptyExistingRows();
    ex.programVersions.set('v1', { ...base('v1'), reasonSummary: 'a' });
    const v = planBackupImport(rows({ programVersions: [{ ...base('v1'), reasonSummary: 'b' }] }), ex, 'overwrite_all');
    expect(v.toUpdate.programVersions).toEqual([]);
    expect(v.conflicts[0]).toMatchObject({ kind: 'immutable', resolution: 'keep_existing' });
  });
  it('a second profile with another id does not become a second live profile', () => {
    const ex = emptyExistingRows();
    ex.profile.set('me', { ...base('me'), sex: 'male' });
    const incoming = { ...base('other', LATER), sex: 'female' };
    const keep = planBackupImport(rows({ profile: [incoming] }), ex);
    expect(keep.toInsert.profile).toEqual([]);
    expect(keep.conflicts[0]).toMatchObject({ kind: 'singleton_other_id', resolution: 'keep_existing' });
    const replace = planBackupImport(rows({ profile: [incoming] }), ex, 'overwrite_all');
    expect(replace.replaceSingletons).toEqual([{ store: 'profile', existingId: 'me', incomingId: 'other' }]);
    expect(replace.toInsert.profile).toHaveLength(1);
    const newerOnly = planBackupImport(rows({ profile: [{ ...incoming, updatedAt: '2020-01-01T00:00:00+02:00' }] }), ex, 'overwrite_if_newer');
    expect(newerOnly.replaceSingletons).toEqual([]);
  });
  it('stableStringify ignores key order', () => {
    expect(stableStringify({ a: 1, b: { c: [1, 2], d: null } })).toBe(stableStringify({ b: { d: null, c: [1, 2] }, a: 1 }));
    expect(stableStringify({ a: undefined, b: 1 })).toBe(stableStringify({ b: 1 }));
  });
  it('handles missing stores in the input', () => {
    expect(() => planBackupImport(emptyStores(), emptyExistingRows())).not.toThrow();
  });
});

describe('findDanglingReferences', () => {
  const ids = () => Object.fromEntries(STORE_NAMES.map((n) => [n, new Set<string>()])) as unknown as Parameters<typeof findDanglingReferences>[1];
  it('warns about records pointing to something that will not exist', () => {
    const inc = rows({ setLogs: [{ id: 's1', sessionExerciseId: 'se-missing', exerciseId: 'leg_press', plannedSetId: null }] });
    const d = findDanglingReferences(inc, ids());
    expect(d.map((x) => `${x.field}->${x.target}`)).toEqual(['sessionExerciseId->sessionExercises', 'exerciseId->exercises']);
  });
  it('accepts references that are in the file or already in the database', () => {
    const inc = rows({
      setLogs: [{ id: 's1', sessionExerciseId: 'se1', exerciseId: 'leg_press', plannedSetId: null }],
      sessionExercises: [{ id: 'se1', sessionId: 'w1', exerciseId: 'leg_press' }],
      workoutSessions: [{ id: 'w1', versionId: IMPORTED_HISTORY_VERSION_ID }],
    });
    const existing = ids();
    existing.exercises.add('leg_press');
    expect(findDanglingReferences(inc, existing)).toEqual([]);
  });
  it('follows nested paths (the food of a diary entry)', () => {
    const inc = rows({ foodLogs: [{ id: 'f1', plannedItemId: null, snapshot: { foodId: 'ghost' } }] });
    expect(findDanglingReferences(inc, ids())[0]).toMatchObject({ field: 'snapshot.foodId', target: 'foods', missingId: 'ghost' });
  });
});
