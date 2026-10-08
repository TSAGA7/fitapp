import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nextPrescription, type SessionResult, type SetResult } from '@fitapp/domain';
import { loadSeedCatalog } from '@fitapp/seed';
import { META_KEYS } from '../constants';
import { ConfirmationRequiredError, ExcelReadError, StalePreviewError } from '../errors';
import { getMeta } from '../meta';
import type { LocalStorage } from '../storage';
import { builders, makeStorage } from '../testkit';

const fixture = (name: string): ArrayBuffer => {
  const buf = readFileSync(new URL(`../../test-fixtures/${name}`, import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
const confirm = { confirmed: true };
const counts = async (s: LocalStorage) => Object.fromEntries(await Promise.all(s.db.tables.map(async (t) => [t.name, await t.count()])));

async function ready() {
  const x = await makeStorage();
  await x.s.installSeed(loadSeedCatalog());
  return x;
}

describe('Excel -> normalization -> preview (real tracker workbook with the athlete history)', () => {
  it('recognizes the sheets and imports the history; problems are listed separately', async () => {
    const { s } = await ready();
    const p = await s.excelImport.preview(fixture('tracker-with-history.xlsx'));
    const n = p.normalization;
    const kinds = Object.fromEntries(n.sheets.map((x) => [x.name, x.kind]));
    expect(kinds['Тренировки']).toBe('training');
    expect(kinds['Питание']).toBe('nutrition');
    expect(kinds['Расчёты']).toBe('unrecognized');
    expect(n.sheets.find((x) => x.name === 'Тренировки')?.headerRow).toBe(5);
    expect(n.sheets.find((x) => x.name === 'Питание')?.headerRow).toBe(13);

    expect(p.counts.workoutSessions).toBe(6);
    expect(n.dateRange?.from).toBe('2026-06-20');
    expect(p.counts.setLogs).toBe(102);
    expect(p.counts.setLogsWithoutRir).toBe(101); // the only set without RIR that is not a working set is the warm-up
    expect(p.counts.bodyMetrics).toBe(5);
    expect(p.counts.foodLogs).toBe(5);
    expect(p.counts.dailyLogs).toBe(5);
    expect(p.skippedExisting).toEqual({ setLogs: 0, weights: 0, foodDays: 0, dailyLogs: 0 });

    const reasons = n.rejected.map((r) => `${r.sheet}:${r.category}:${r.reasons[0]}`);
    expect(reasons.filter((r) => r.includes('должны быть целым числом'))).toHaveLength(2); // 63,5 x 3,5 and 40 x 1,5
    expect(reasons.some((r) => r.includes('Повторения не указаны'))).toBe(true);
    expect(reasons.some((r) => r.includes('Не удалось прочитать дату «31.02.2026»'))).toBe(true);
    expect(reasons.some((r) => r.includes('Питание') && r.includes('«abc» не число'))).toBe(true);
    expect(n.rejected.filter((r) => r.category === 'unmapped').map((r) => r.values.join(' '))[0]).toContain('Йога');
    expect(n.rejected).toHaveLength(6);

    const byName = Object.fromEntries(n.exerciseResolutions.map((r) => [r.sourceName, r]));
    expect(byName['Присед в Смитте']?.resolved).toMatchObject({ exerciseId: 'smith_squat', via: 'alias' });
    expect(byName['Жим платформы ногами']?.resolved).toMatchObject({ exerciseId: 'leg_press' });
    expect(byName['Тяга с верхнего блока узким хватом']?.resolved).toMatchObject({ exerciseId: 'lat_pulldown_neutral' });
    expect(byName['Молот']?.decision.kind).toBe('create');
    expect(byName['Йога']?.decision.kind).toBe('skip');
    expect(p.counts.customExercises).toBe(n.exerciseResolutions.filter((r) => r.decision.kind === 'create').length);
  });

  it('the preview does not change the database', async () => {
    const { s } = await ready();
    const before = await counts(s);
    await s.excelImport.preview(fixture('tracker-with-history.xlsx'));
    expect(await counts(s)).toEqual(before);
  });

  it('applying without explicit confirmation is refused and writes nothing', async () => {
    const { s } = await ready();
    const p = await s.excelImport.preview(fixture('tracker-with-history.xlsx'));
    const before = await counts(s);
    await expect(s.excelImport.apply(p, { confirmed: false })).rejects.toBeInstanceOf(ConfirmationRequiredError);
    await expect(s.excelImport.apply(p, undefined as never)).rejects.toBeInstanceOf(ConfirmationRequiredError);
    expect(await counts(s)).toEqual(before);
  });
});

describe('confirmation -> import', () => {
  it('writes exactly what the preview promised; imported sets keep RIR empty and are marked as imported', async () => {
    const { s } = await ready();
    const p = await s.excelImport.preview(fixture('tracker-with-history.xlsx'));
    const r = await s.excelImport.apply(p, confirm);
    expect(r.created).toEqual(p.counts);
    expect(await s.db.setLogs.count()).toBe(102);
    expect(await s.db.workoutSessions.count()).toBe(6);
    const sets = await s.db.setLogs.toArray();
    expect(sets.every((x) => x.source === 'import')).toBe(true);
    expect(sets.every((x) => x.actualRir === null)).toBe(true);
    expect(sets.filter((x) => x.setType === 'warmup')).toHaveLength(1);
    expect((await s.db.workoutSessions.toArray()).every((x) => x.versionId === 'imported_history' && x.status === 'completed')).toBe(true);
    expect(await s.db.bodyMetrics.count()).toBe(5);
    expect((await s.repos.metrics.listByType('weight')).map((m) => m.value)).toEqual([82.5, 82.3, 82.6, 82.2, 82.1]);
    expect(await s.db.foodLogs.count()).toBe(5);
    expect((await s.db.foodLogs.toArray())[0]?.macros.proteinG).toBe(165);
    expect((await s.db.foods.get('imported_daily_total'))?.name).toContain('Дневной итог');
    expect((await s.repos.dailyLogs.getByDate('2026-09-29'))?.waterMl).toBe(2800);
    const custom = (await s.db.exercises.toArray()).filter((e) => e.origin === 'custom');
    expect(custom.length).toBe(p.counts.customExercises);
    expect(custom.every((e) => e.cues[0]?.includes('не проверены'))).toBe(true);
    expect(((await getMeta(s.db, META_KEYS.importLog)) as Array<{ kind: string }>)[0]?.kind).toBe('excel');
  });

  it('the history is available for progression under the catalog rep range of the exercise', async () => {
    const { s } = await ready();
    await s.excelImport.apply(await s.excelImport.preview(fixture('tracker-with-history.xlsx')), confirm);
    const history = await s.repos.workouts.listSetLogsByContext('leg_press::default::10-12');
    expect(history).toHaveLength(4);
    expect(history.map((h) => h.actualWeightKg)).toEqual([70, 70, 70, 70]);
    expect(history[0]?.completedAt).toBe('2026-06-20T12:00:00Z');
  });

  it('imported sets without RIR never raise the weight: nextPrescription asks for RIR (rir_missing)', async () => {
    const { s } = await ready();
    await s.excelImport.apply(await s.excelImport.preview(fixture('tracker-with-history.xlsx')), confirm);
    const sets = await s.repos.workouts.listSetLogsByContext('leg_press::default::10-12');
    const result: SessionResult = {
      date: '2026-06-20',
      kind: 'normal',
      plannedSets: 4,
      repRange: { min: 10, max: 12 },
      repMaxTarget: 12,
      rirTarget: { min: 2, max: 3 },
      sets: sets.map<SetResult>((x) => ({ setNo: x.setNo, weightKg: x.actualWeightKg, reps: x.actualReps, rir: x.actualRir, status: x.status, skipReason: x.skipReason, painFlag: x.painFlag })),
      replaced: null,
    };
    const next = nextPrescription({
      forDate: '2026-06-25',
      plan: { repMin: 10, repMax: 12, rirTarget: { min: 2, max: 3 }, sets: 4, restSec: 150, stepKg: 5, minKg: null, maxKg: null, startWeightKg: null },
      exercise: { axialLoad: 0 },
      history: [result],
      painEvents: [],
      adherence14d: null,
      lastDeload: null,
    });
    expect(next.reasonCode).toBe('rir_missing');
    expect(next.decision).toBe('hold');
    expect(next.weightKg).toBe(70);
  });

  it('a preview built on older data is refused after the data changed', async () => {
    const { s } = await ready();
    const p = await s.excelImport.preview(fixture('tracker-with-history.xlsx'));
    await s.repos.metrics.put(builders(s).metric('weight', 99, '2026-01-01'));
    const before = await counts(s);
    await expect(s.excelImport.apply(p, confirm)).rejects.toBeInstanceOf(StalePreviewError);
    expect(await counts(s)).toEqual(before);
  });
});

describe('existing data is never overwritten or duplicated', () => {
  it('importing the same file again adds nothing', async () => {
    const { s } = await ready();
    await s.excelImport.apply(await s.excelImport.preview(fixture('tracker-with-history.xlsx')), confirm);
    const before = await counts(s);
    const again = await s.excelImport.preview(fixture('tracker-with-history.xlsx'));
    expect(again.counts).toMatchObject({ setLogs: 0, workoutSessions: 0, sessionExercises: 0, bodyMetrics: 0, foodLogs: 0, dailyLogs: 0, customExercises: 0 });
    expect(again.skippedExisting).toEqual({ setLogs: 102, weights: 5, foodDays: 5, dailyLogs: 5 });
    await s.excelImport.apply(again, confirm);
    const after = await counts(s);
    expect({ ...after, appMeta: 0 }).toEqual({ ...before, appMeta: 0 });
  });

  it('an existing weight of the same day is kept; days that already have food logs get no daily total', async () => {
    const { s } = await ready();
    const b = builders(s);
    await s.repos.metrics.put(b.metric('weight', 99, '2026-09-29'));
    await s.repos.foodLogs.put(b.foodLog('2026-09-30'));
    await s.repos.dailyLogs.put({ ...b.dailyLog('2026-10-01'), waterMl: 1000 });
    const p = await s.excelImport.preview(fixture('tracker-with-history.xlsx'));
    expect(p.skippedExisting).toMatchObject({ weights: 1, foodDays: 1, dailyLogs: 1 });
    expect(p.counts).toMatchObject({ bodyMetrics: 4, foodLogs: 4, dailyLogs: 4 });
    await s.excelImport.apply(p, confirm);
    expect((await s.repos.metrics.listByType('weight', { from: '2026-09-29', to: '2026-09-29' }))[0]?.value).toBe(99);
    expect((await s.repos.dailyLogs.getByDate('2026-10-01'))?.waterMl).toBe(1000);
    expect(await s.repos.foodLogs.listByDateRange({ from: '2026-09-30', to: '2026-09-30' })).toHaveLength(1);
  });

  it('a set that is already recorded (same exercise, day and set number) is skipped; the rest is imported', async () => {
    const { s } = await ready();
    const b = builders(s);
    const sess = { ...b.workoutSession('2026-06-20T08:00:00.000Z'), status: 'completed' as const };
    const se = b.sessionExercise(sess.id, 1, 'leg_press');
    await s.repos.workouts.putSession(sess);
    await s.repos.workouts.putSessionExercise(se);
    await s.repos.workouts.putSetLog(b.setLog(se.id, 1, '2026-06-20T08:05:00.000Z'));
    const p = await s.excelImport.preview(fixture('tracker-with-history.xlsx'));
    expect(p.skippedExisting.setLogs).toBe(1);
    expect(p.counts.setLogs).toBe(101);
    await s.excelImport.apply(p, confirm);
    const legPress = await s.repos.workouts.listSetLogsByExercise('leg_press');
    expect(legPress).toHaveLength(4);
    expect(legPress.filter((x) => x.source === 'live')).toHaveLength(1);
    expect(legPress.find((x) => x.source === 'live')?.actualRir).toBe(2);
  });
});

describe('decisions about unknown exercises', () => {
  it('the preview is rebuilt with the user choices; skipped rows move to the separate list', async () => {
    const { s } = await ready();
    const file = fixture('tracker-with-history.xlsx');
    const base = await s.excelImport.preview(file);
    const molot = base.normalization.exerciseResolutions.find((r) => r.sourceName === 'Молот')!;
    const skipped = await s.excelImport.preview(file, { [molot.normalized]: { kind: 'skip' } });
    expect(skipped.counts.setLogs).toBe(base.counts.setLogs - 4);
    expect(skipped.counts.customExercises).toBe(base.counts.customExercises - 1);
    expect(skipped.normalization.rejected.filter((r) => r.category === 'unmapped')).toHaveLength(base.normalization.rejected.filter((r) => r.category === 'unmapped').length + 4);
    const mapped = await s.excelImport.preview(file, { [molot.normalized]: { kind: 'use', exerciseId: 'leg_extension' } });
    expect(mapped.counts.setLogs).toBe(base.counts.setLogs);
    expect(mapped.counts.customExercises).toBe(base.counts.customExercises - 1);
    await s.excelImport.apply(mapped, confirm);
    expect((await s.repos.workouts.listSetLogsByExercise('leg_extension')).length).toBe(4 + 4);
  });
  it('a re-import reuses custom exercises created earlier instead of creating copies', async () => {
    const { s } = await ready();
    await s.excelImport.apply(await s.excelImport.preview(fixture('tracker-with-history.xlsx')), confirm);
    const customBefore = (await s.db.exercises.toArray()).filter((e) => e.origin === 'custom').length;
    const again = await s.excelImport.preview(fixture('tracker-with-history.xlsx'));
    expect(again.normalization.exerciseResolutions.filter((r) => r.resolved?.via === 'existing').length).toBe(customBefore);
    expect(again.counts.customExercises).toBe(0);
  });
});

describe('messy workbook: other layout, bad rows, an unknown sheet', () => {
  it('imports what is valid, lists what is not, and never fails', async () => {
    const { s } = await ready();
    const p = await s.excelImport.preview(fixture('messy.xlsx'));
    const n = p.normalization;
    expect(n.sheets.map((x) => [x.name, x.kind])).toEqual([['Заметки', 'unrecognized'], ['Тренировки', 'training']]);
    expect(n.sheets[1]?.headerRow).toBe(2);
    expect(p.counts.setLogs).toBe(2);
    const sets = n.bundle.setLogs;
    expect(sets.map((x) => [x.actualWeightKg, x.actualReps, x.actualRir])).toEqual([[80, 12, 2], [82.5, 10, 4]]);
    const cats = n.rejected.map((r) => r.category);
    expect(cats.filter((c) => c === 'duplicate')).toHaveLength(1);
    expect(cats.filter((c) => c === 'unmapped')).toHaveLength(1);
    expect(n.rejected.map((r) => r.reasons.join(' | '))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Не указано упражнение'),
        expect.stringContaining('Вес «-5» вне допустимого диапазона'),
        expect.stringContaining('«много» должны быть целым числом'),
        expect.stringContaining('RIR «9» вне диапазона'),
        expect.stringContaining('Тип подхода «Супер» не распознан'),
      ]),
    );
    const before = await counts(s);
    await s.excelImport.apply(p, confirm);
    expect(await s.db.setLogs.count()).toBe(2);
    expect(before.setLogs).toBe(0);
  });
  it('a custom exercise is not created for a name without clear tags', async () => {
    const { s } = await ready();
    const p = await s.excelImport.preview(fixture('messy.xlsx'));
    const medball = p.normalization.exerciseResolutions.find((r) => r.sourceName === 'Medball slams');
    expect(medball).toMatchObject({ inferred: null, decision: { kind: 'skip' } });
    expect(p.counts.customExercises).toBe(0); // "Румынская тяга" has clear tags, but all its rows are invalid, so nothing is created for it
  });
});

describe('unreadable files', () => {
  it('give a clear error instead of crashing', async () => {
    const { s } = await ready();
    await expect(s.excelImport.preview(new TextEncoder().encode('это не excel').buffer as ArrayBuffer)).rejects.toBeInstanceOf(ExcelReadError);
    await expect(s.excelImport.preview(new ArrayBuffer(0))).rejects.toBeInstanceOf(ExcelReadError);
  });
});
