import {
  DAILY_TOTAL_FOOD_ID,
  normalizeWorkbook,
  toLocalDate,
  type Clock,
  type Confirmation,
  type ExcelImportBundle,
  type ExcelImportCounts,
  type ExcelImportPreview,
  type ExcelImportResult,
  type ExcelImportService,
  type ExerciseDecision,
  type ExerciseRef,
  type IdGenerator,
  type RawWorkbook,
} from '@fitapp/domain';
import { ConfirmationRequiredError, StalePreviewError } from '../errors';
import { appendImportLog } from '../meta';
import type { AppDatabase } from '../schema';
import { computeStateToken } from '../state';
import { readXlsxToRaw } from './readXlsx';

const AFFECTED = ['exercises', 'foods', 'workoutSessions', 'sessionExercises', 'setLogs', 'bodyMetrics', 'foodLogs', 'dailyLogs'] as const;

export function countBundle(b: ExcelImportBundle): ExcelImportCounts {
  return {
    workoutSessions: b.workoutSessions.length,
    sessionExercises: b.sessionExercises.length,
    setLogs: b.setLogs.length,
    setLogsWithoutRir: b.setLogs.filter((s) => s.actualRir === null && s.setType === 'working').length,
    customExercises: b.exercises.length,
    bodyMetrics: b.bodyMetrics.length,
    foodLogs: b.foodLogs.length,
    dailyLogs: b.dailyLogs.length,
  };
}

export class LocalExcelImportService implements ExcelImportService {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly deviceId: string,
    private readonly readWorkbook: (data: ArrayBuffer) => Promise<RawWorkbook> = readXlsxToRaw,
  ) {}

  private async exerciseRefs(): Promise<ExerciseRef[]> {
    const rows = (await this.db.exercises.toArray()).filter((e) => e.deletedAt === null);
    return rows.map((e) => ({ id: e.id, key: e.key, name: e.name, origin: e.origin, defaultRepRange: e.defaultRepRange }));
  }

  /** Excel -> normalization -> comparison with existing data. Writes nothing. */
  async preview(file: ArrayBuffer, decisions?: Record<string, ExerciseDecision>): Promise<ExcelImportPreview> {
    const raw = await this.readWorkbook(file);
    return this.previewWorkbook(raw, decisions);
  }

  async previewWorkbook(raw: RawWorkbook, decisions?: Record<string, ExerciseDecision>): Promise<ExcelImportPreview> {
    const stateToken = await computeStateToken(this.db, AFFECTED);
    const normalization = normalizeWorkbook(raw, {
      now: this.clock.now(),
      deviceId: this.deviceId,
      ids: this.ids,
      exercises: await this.exerciseRefs(),
      hasDailyTotalFood: (await this.db.foods.get(DAILY_TOTAL_FOOD_ID)) !== undefined,
      decisions,
    });
    const { bundle, skipped } = await this.withoutExisting(normalization.bundle);
    return {
      normalization: { ...normalization, bundle },
      counts: countBundle(bundle),
      skippedExisting: skipped,
      stateToken,
    };
  }

  /** Removes what is already in the database (by natural key): existing data is never overwritten. */
  private async withoutExisting(b: ExcelImportBundle): Promise<{ bundle: ExcelImportBundle; skipped: ExcelImportPreview['skippedExisting'] }> {
    const profile = (await this.db.profile.toArray()).find((p) => p.deletedAt === null);
    const tz = profile?.timezone;
    const dateOf = (startedAt: string) => (tz ? toLocalDate(startedAt, tz) : startedAt.slice(0, 10));

    // sets
    const existingSetKeys = new Set<string>();
    for (const exId of new Set(b.setLogs.map((s) => s.exerciseId))) {
      const sets = (await this.db.setLogs.where('exerciseId').equals(exId).toArray()).filter((s) => s.deletedAt === null);
      const seRows = await this.db.sessionExercises.bulkGet([...new Set(sets.map((s) => s.sessionExerciseId))]);
      const seMap = new Map(seRows.filter((r) => r).map((r) => [r!.id, r!]));
      const sessRows = await this.db.workoutSessions.bulkGet([...new Set([...seMap.values()].map((r) => r.sessionId))]);
      const sessMap = new Map(sessRows.filter((r) => r).map((r) => [r!.id, r!]));
      for (const s of sets) {
        const sess = sessMap.get(seMap.get(s.sessionExerciseId)?.sessionId ?? '');
        if (sess) existingSetKeys.add(`${exId}|${dateOf(sess.startedAt)}|${s.setType === 'warmup' ? 'w' : 'k'}|${s.setNo}`);
      }
    }
    const sessionDate = new Map(b.workoutSessions.map((s) => [s.id, s.startedAt.slice(0, 10)]));
    const seInfo = new Map(b.sessionExercises.map((e) => [e.id, e]));
    const setLogs = b.setLogs.filter((s) => {
      const se = seInfo.get(s.sessionExerciseId);
      const date = se ? sessionDate.get(se.sessionId) : undefined;
      return !existingSetKeys.has(`${s.exerciseId}|${date}|${s.setType === 'warmup' ? 'w' : 'k'}|${s.setNo}`);
    });
    const keptSE = new Set(setLogs.map((s) => s.sessionExerciseId));
    const sessionExercises = b.sessionExercises.filter((e) => keptSE.has(e.id));
    const keptSessions = new Set(sessionExercises.map((e) => e.sessionId));
    const workoutSessions = b.workoutSessions.filter((s) => keptSessions.has(s.id));

    // weights, food days, water
    const existingWeights = new Set<string>();
    for (const m of b.bodyMetrics) {
      const rows = await this.db.bodyMetrics.where('[type+measuredOn]').equals(['weight', m.measuredOn]).toArray();
      if (rows.some((r) => r.deletedAt === null)) existingWeights.add(m.measuredOn);
    }
    const bodyMetrics = b.bodyMetrics.filter((m) => !existingWeights.has(m.measuredOn));

    const foodDays = new Set<string>();
    for (const l of b.foodLogs) {
      const rows = await this.db.foodLogs.where('date').equals(l.date).toArray();
      if (rows.some((r) => r.deletedAt === null)) foodDays.add(l.date);
    }
    const foodLogs = b.foodLogs.filter((l) => !foodDays.has(l.date));

    const waterDays = new Set<string>();
    for (const l of b.dailyLogs) {
      const rows = await this.db.dailyLogs.where('date').equals(l.date).toArray();
      if (rows.some((r) => r.deletedAt === null)) waterDays.add(l.date);
    }
    const dailyLogs = b.dailyLogs.filter((l) => !waterDays.has(l.date));

    return {
      bundle: {
        exercises: b.exercises,
        foods: foodLogs.length > 0 ? b.foods : [],
        workoutSessions,
        sessionExercises,
        setLogs,
        bodyMetrics,
        foodLogs,
        dailyLogs,
      },
      skipped: {
        setLogs: b.setLogs.length - setLogs.length,
        weights: b.bodyMetrics.length - bodyMetrics.length,
        foodDays: b.foodLogs.length - foodLogs.length,
        dailyLogs: b.dailyLogs.length - dailyLogs.length,
      },
    };
  }

  /** Writes the confirmed preview in one transaction. Only adds records: nothing existing is replaced. */
  async apply(preview: ExcelImportPreview, confirmation: Confirmation): Promise<ExcelImportResult> {
    if (!confirmation || confirmation.confirmed !== true) throw new ConfirmationRequiredError();
    const b = preview.normalization.bundle;
    await this.db.transaction('rw', this.db.tables, async () => {
      if ((await computeStateToken(this.db, AFFECTED)) !== preview.stateToken) throw new StalePreviewError();
      if (b.exercises.length) await this.db.exercises.bulkAdd(b.exercises);
      for (const f of b.foods) if (!(await this.db.foods.get(f.id))) await this.db.foods.add(f);
      if (b.workoutSessions.length) await this.db.workoutSessions.bulkAdd(b.workoutSessions);
      if (b.sessionExercises.length) await this.db.sessionExercises.bulkAdd(b.sessionExercises);
      if (b.setLogs.length) await this.db.setLogs.bulkAdd(b.setLogs);
      if (b.bodyMetrics.length) await this.db.bodyMetrics.bulkAdd(b.bodyMetrics);
      if (b.foodLogs.length) await this.db.foodLogs.bulkAdd(b.foodLogs);
      if (b.dailyLogs.length) await this.db.dailyLogs.bulkAdd(b.dailyLogs);
      await appendImportLog(this.db, { at: this.clock.now(), kind: 'excel', summary: { ...preview.counts } });
    });
    return { created: preview.counts };
  }
}
