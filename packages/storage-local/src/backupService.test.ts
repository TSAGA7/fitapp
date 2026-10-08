import { describe, expect, it, vi } from 'vitest';
import { loadSeedCatalog } from '@fitapp/seed';
import { META_KEYS } from './constants';
import { ConfirmationRequiredError, InvalidBackupError, StalePreviewError } from './errors';
import { getMeta } from './meta';
import type { LocalStorage } from './storage';
import { builders, makeStorage } from './testkit';

async function populate(s: LocalStorage) {
  const b = builders(s);
  const profile = b.profile();
  await s.repos.profile.save(profile);
  await s.repos.goals.put(b.goal());
  const kept = b.metric('waist', 94, '2026-10-01');
  const deleted = b.metric('waist', 95, '2026-09-20');
  await s.repos.metrics.putMany([kept, deleted, b.metric('weight', 82.5)]);
  await s.repos.metrics.softDelete(deleted.id);
  await s.repos.exercises.put(b.exercise());
  const v1 = b.programVersion(1);
  await s.repos.programs.addVersion(v1);
  const plan = { ...b.mealPlan(), versionId: v1.id };
  await s.repos.mealPlans.put(plan);
  const item = b.plannedItem(plan.id);
  await s.repos.mealPlans.putItems([item]);
  await s.repos.foodLogs.put(b.foodLog('2026-09-28', item.id));
  await s.repos.programs.saveProgram({ ...b.program(), activeVersionId: v1.id });
  await s.repos.programs.addChange(b.planChange(v1.id));
  const sess = { ...b.workoutSession(), versionId: v1.id };
  const se = b.sessionExercise(sess.id);
  await s.repos.workouts.putSession(sess);
  await s.repos.workouts.putSessionExercise(se);
  await s.repos.workouts.putSetLog(b.setLog(se.id));
  return { profile, kept, deleted, v1 };
}

async function pair() {
  const a = await makeStorage();
  const b = await makeStorage();
  await a.s.installSeed(loadSeedCatalog());
  await b.s.installSeed(loadSeedCatalog());
  return { a, b };
}
const counts = async (s: LocalStorage) => Object.fromEntries(await Promise.all(s.db.tables.map(async (t) => [t.name, await t.count()])));
const confirm = { confirmed: true };

describe('export', () => {
  it('contains the user data and deletion markers, not the bundled catalog', async () => {
    const { a } = await pair();
    await populate(a.s);
    const file = JSON.parse(await a.s.backup.exportJson());
    expect(file).toMatchObject({ format: 'fitapp-backup', formatVersion: 1, schemaVersion: 1, deviceId: a.s.deviceId });
    expect(file.stores.bodyMetrics).toHaveLength(3);
    expect(file.stores.bodyMetrics.filter((m: { deletedAt: string | null }) => m.deletedAt !== null)).toHaveLength(1);
    expect(file.stores.exercises).toHaveLength(1);
    expect(file.stores.exercises[0].origin).toBe('custom');
    expect(file.stores.equipment).toEqual([]);
    expect(file.stores.foods).toEqual([]);
    expect(file.stores.setLogs).toHaveLength(1);
    expect(file.stores.programVersions).toHaveLength(1);
    expect(Object.keys(file.stores)).toHaveLength(26);
    expect(await getMeta(a.s.db, META_KEYS.lastBackupAt)).toBe(file.createdAt);
  });
  it('an empty database exports a valid empty file', async () => {
    const { a, b } = await pair();
    const preview = await b.s.backup.previewImport(await a.s.backup.exportJson());
    expect(preview.validation.ok).toBe(true);
    expect(preview.validation.invalid).toEqual([]);
  });
});

describe('round trip', () => {
  it('restores everything into an empty app and the data is identical', async () => {
    const { a, b } = await pair();
    const original = await populate(a.s);
    const json = await a.s.backup.exportJson();
    const preview = await b.s.backup.previewImport(json);
    expect(preview.dangling).toEqual([]);
    expect(preview.conflicts).toEqual([]);
    const result = await b.s.backup.applyImport(preview, confirm);
    expect(result.inserted).toBeGreaterThan(10);
    expect(result.updated).toBe(0);
    expect((await b.s.repos.profile.get())?.id).toBe(original.profile.id);
    expect(await b.s.repos.metrics.listByType('waist')).toHaveLength(1);
    expect(await b.s.db.bodyMetrics.get(original.deleted.id)).toMatchObject({ deletedAt: expect.any(String) });
    expect((await b.s.repos.programs.getVersion(original.v1.id))?.reasonSummary).toBe('Тест');
    expect((await b.s.repos.programs.getProgram())?.activeVersionId).toBe(original.v1.id);
    expect(await counts(b.s)).toEqual(await counts(a.s));
    for (const table of a.s.db.tables.filter((t) => !['appMeta', 'syncState'].includes(t.name))) {
      expect(await b.s.db.table(table.name).toArray()).toEqual(await table.toArray());
    }
    expect(((await getMeta(b.s.db, META_KEYS.importLog)) as Array<{ kind: string }>)[0]?.kind).toBe('backup');
  });
  it('importing the same file again changes nothing (identical records are skipped)', async () => {
    const { a, b } = await pair();
    await populate(a.s);
    const json = await a.s.backup.exportJson();
    await b.s.backup.applyImport(await b.s.backup.previewImport(json), confirm);
    const before = await counts(b.s);
    const second = await b.s.backup.previewImport(json);
    expect(second.conflicts).toEqual([]);
    const r = await b.s.backup.applyImport(second, confirm);
    expect(r).toMatchObject({ inserted: 0, updated: 0, keptExisting: 0 });
    expect(r.skippedIdentical).toBeGreaterThan(10);
    expect(await counts(b.s)).toEqual({ ...before, appMeta: before.appMeta });
  });
});

describe('preview first, nothing changes before confirmation', () => {
  it('the preview does not write', async () => {
    const { a, b } = await pair();
    await populate(a.s);
    const before = await counts(b.s);
    const preview = await b.s.backup.previewImport(await a.s.backup.exportJson());
    expect(preview.plan.toInsert.setLogs).toHaveLength(1);
    expect(await counts(b.s)).toEqual(before);
  });
  it('applying without an explicit confirmation is refused', async () => {
    const { a, b } = await pair();
    await populate(a.s);
    const preview = await b.s.backup.previewImport(await a.s.backup.exportJson());
    const before = await counts(b.s);
    await expect(b.s.backup.applyImport(preview, { confirmed: false })).rejects.toBeInstanceOf(ConfirmationRequiredError);
    await expect(b.s.backup.applyImport(preview, undefined as never)).rejects.toBeInstanceOf(ConfirmationRequiredError);
    expect(await counts(b.s)).toEqual(before);
  });
  it('a preview built on older data is refused after the data changed', async () => {
    const { a, b } = await pair();
    await populate(a.s);
    const preview = await b.s.backup.previewImport(await a.s.backup.exportJson());
    await b.s.repos.goals.put(builders(b.s).goal());
    const before = await counts(b.s);
    await expect(b.s.backup.applyImport(preview, confirm)).rejects.toBeInstanceOf(StalePreviewError);
    expect(await counts(b.s)).toEqual(before);
  });
});

describe('bad files', () => {
  it('broken JSON, a foreign file and a newer schema cannot be applied', async () => {
    const { b } = await pair();
    const broken = await b.s.backup.previewImport('{oops');
    expect(broken.validation.ok).toBe(false);
    expect(broken.validation.errors[0]).toContain('не является корректным JSON');
    await expect(b.s.backup.applyImport(broken, confirm)).rejects.toBeInstanceOf(InvalidBackupError);
    expect((await b.s.backup.previewImport('{"hello":1}')).validation.errors[0]).toContain('не файл резервной копии');
    const { a } = await pair();
    const file = JSON.parse(await a.s.backup.exportJson());
    const newer = await b.s.backup.previewImport(JSON.stringify({ ...file, schemaVersion: 5 }));
    expect(newer.validation.ok).toBe(false);
    await expect(b.s.backup.applyImport(newer, confirm)).rejects.toBeInstanceOf(InvalidBackupError);
  });
  it('invalid records are listed separately, unknown stores are reported, the rest is imported', async () => {
    const { a, b } = await pair();
    await populate(a.s);
    const file = JSON.parse(await a.s.backup.exportJson());
    file.stores.bodyMetrics[0].unit = 'lb';
    file.stores.dailyLogs.push({ junk: true });
    file.stores.futureStore = [1, 2, 3];
    const preview = await b.s.backup.previewImport(JSON.stringify(file));
    expect(preview.validation.ok).toBe(true);
    expect(preview.validation.invalid.map((i) => i.store).sort()).toEqual(['bodyMetrics', 'dailyLogs']);
    expect(preview.validation.unknownStores).toEqual([{ store: 'futureStore', count: 3 }]);
    await b.s.backup.applyImport(preview, confirm);
    expect(await b.s.db.bodyMetrics.count()).toBe(2);
    expect(await b.s.db.dailyLogs.count()).toBe(0);
  });
  it('warns about references that would point nowhere', async () => {
    const a = await makeStorage();
    const b = await makeStorage(); // no catalog installed in b
    await populate(a.s);
    const preview = await b.s.backup.previewImport(await a.s.backup.exportJson());
    expect(preview.dangling.length).toBeGreaterThan(0);
    expect(preview.dangling.some((d) => d.target === 'foods' && d.missingId === 'egg')).toBe(true);
  });
});

describe('existing data is not overwritten silently', () => {
  async function conflict() {
    const { a, b } = await pair();
    const orig = await populate(a.s);
    const json = await a.s.backup.exportJson();
    await b.s.backup.applyImport(await b.s.backup.previewImport(json), confirm);
    // the user keeps working in b: the record changes there
    b.clock.set('2026-10-05T08:00:00.000Z');
    await b.s.repos.metrics.put({ ...orig.kept, value: 90 });
    return { a, b, json, orig };
  }
  it('by default the app version wins and the conflict is listed', async () => {
    const { b, json, orig } = await conflict();
    const preview = await b.s.backup.previewImport(json);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0]).toMatchObject({ store: 'bodyMetrics', id: orig.kept.id, resolution: 'keep_existing' });
    const r = await b.s.backup.applyImport(preview, confirm);
    expect(r).toMatchObject({ inserted: 0, updated: 0, keptExisting: 1 });
    expect((await b.s.db.bodyMetrics.get(orig.kept.id))?.value).toBe(90);
  });
  it('overwrite_if_newer keeps a newer local record; overwrite_all replaces it, only when asked', async () => {
    const { b, json, orig } = await conflict();
    const newer = await b.s.backup.previewImport(json, 'overwrite_if_newer');
    expect(newer.conflicts[0]?.resolution).toBe('keep_existing');
    await b.s.backup.applyImport(newer, confirm);
    expect((await b.s.db.bodyMetrics.get(orig.kept.id))?.value).toBe(90);
    const all = await b.s.backup.previewImport(json, 'overwrite_all');
    expect(all.conflicts[0]?.resolution).toBe('overwrite');
    const r = await b.s.backup.applyImport(all, confirm);
    expect(r.updated).toBe(1);
    expect((await b.s.db.bodyMetrics.get(orig.kept.id))?.value).toBe(94);
  });
  it('a program version is never overwritten, whatever the policy', async () => {
    const { a, b } = await pair();
    const orig = await populate(a.s);
    const file = JSON.parse(await a.s.backup.exportJson());
    await b.s.backup.applyImport(await b.s.backup.previewImport(JSON.stringify(file)), confirm);
    file.stores.programVersions[0].reasonSummary = 'Подмена';
    const preview = await b.s.backup.previewImport(JSON.stringify(file), 'overwrite_all');
    expect(preview.conflicts.find((c) => c.kind === 'immutable')).toBeDefined();
    await b.s.backup.applyImport(preview, confirm);
    expect((await b.s.repos.programs.getVersion(orig.v1.id))?.reasonSummary).toBe('Тест');
  });
  it('a profile from the file does not become a second profile', async () => {
    const { a, b } = await pair();
    await populate(a.s);
    const mine = { ...builders(b.s).profile(), id: 'my-own', heightCm: 175 };
    await b.s.repos.profile.save(mine);
    const json = await a.s.backup.exportJson();
    const keep = await b.s.backup.previewImport(json);
    expect(keep.conflicts.find((c) => c.kind === 'singleton_other_id')?.resolution).toBe('keep_existing');
    await b.s.backup.applyImport(keep, confirm);
    expect((await b.s.repos.profile.get())?.id).toBe('my-own');
    const replace = await b.s.backup.previewImport(json, 'overwrite_all');
    await b.s.backup.applyImport(replace, confirm);
    expect((await b.s.repos.profile.get())?.heightCm).toBe(181);
    expect((await b.s.db.profile.get('my-own'))?.deletedAt).not.toBeNull();
  });
});

describe('atomicity', () => {
  it('if a write fails halfway, nothing is imported', async () => {
    const { a, b } = await pair();
    await populate(a.s);
    const preview = await b.s.backup.previewImport(await a.s.backup.exportJson());
    const spy = vi.spyOn(b.s.db.table('programVersions'), 'bulkAdd').mockRejectedValue(new Error('диск переполнен'));
    const before = await counts(b.s);
    await expect(b.s.backup.applyImport(preview, confirm)).rejects.toThrow('диск переполнен');
    spy.mockRestore();
    expect(await counts(b.s)).toEqual(before);
    // and a retry works
    const retry = await b.s.backup.previewImport(await a.s.backup.exportJson());
    await b.s.backup.applyImport(retry, confirm);
    expect(await b.s.db.setLogs.count()).toBe(1);
  });
});
