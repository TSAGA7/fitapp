import {
  BodyMetric,
  DailyLog,
  Exercise,
  Food,
  FoodLog,
  SessionExercise,
  SetLog,
  WorkoutSession,
  createBase,
} from '../model';
import { IMPORTED_HISTORY_VERSION_ID } from '../backup/importPlan';
import { progressionKey } from '../util/progressionKey';
import { cellText, isEmptyCell, normalizeText, parseExcelDate, parseInteger, parseNumber, parseRir, shortHash } from './cells';
import { TRACKER_HELPER_SHEETS, detectSheet } from './columns';
import { buildMatcher, inferTraits } from './exerciseMatch';
import {
  DAILY_TOTAL_FOOD_ID,
  type ExcelImportBundle,
  type ExcelNormalization,
  type ExcelNormalizeContext,
  type ExerciseDecision,
  type ExerciseRef,
  type ExerciseResolution,
  type InferredExercise,
  type RawCell,
  type RawSheet,
  type RawWorkbook,
  type RejectedRow,
  type SheetReport,
} from './types';
import type { SheetLayout } from './columns';

type SetType = 'warmup' | 'working' | 'drop';

interface ParsedSet {
  sheet: string;
  rowNumber: number;
  date: string;
  label: string | null;
  exerciseName: string;
  exerciseKey: string;
  setNo: number | null;
  weight: number | null;
  reps: number;
  rir: number | null;
  type: SetType;
  comment: string | null;
  values: string[];
}

const TYPE_WORKING = new Set(['', 'рабочий', 'рабочая', 'рабочие', 'working', 'work']);
const TYPE_WARMUP = new Set(['разминка', 'разминочный', 'warmup', 'warm up']);
const TYPE_DROP = new Set(['дроп', 'дропсет', 'дроп сет', 'drop']);

function parseType(c: RawCell): SetType | null {
  const n = normalizeText(cellText(c));
  if (TYPE_WORKING.has(n)) return 'working';
  if (TYPE_WARMUP.has(n)) return 'warmup';
  if (TYPE_DROP.has(n)) return 'drop';
  return null;
}

const cell = (row: readonly RawCell[], layout: SheetLayout, field: string): RawCell =>
  layout.columns[field] === undefined ? undefined : row[layout.columns[field] as number];

const displayValues = (row: readonly RawCell[], layout: SheetLayout): string[] =>
  Object.keys(layout.columns).map((f) => `${layout.headers[f]}: ${cellText(row[layout.columns[f] as number])}`);

function emptyBundle(): ExcelImportBundle {
  return { exercises: [], foods: [], workoutSessions: [], sessionExercises: [], setLogs: [], bodyMetrics: [], foodLogs: [], dailyLogs: [] };
}

/**
 * Excel -> normalization. Pure: reads nothing but the rows it is given and writes nothing.
 * Everything that cannot be used goes to `rejected` (never silently dropped, never fatal).
 */
export function normalizeWorkbook(raw: RawWorkbook, ctx: ExcelNormalizeContext): ExcelNormalization {
  const rejected: RejectedRow[] = [];
  const warnings: string[] = [];
  const reports: SheetReport[] = [];
  const parsedSets: ParsedSet[] = [];
  const bundle = emptyBundle();
  const dates: string[] = [];

  const nutritionSheets: Array<{ sheet: RawSheet; layout: SheetLayout; report: SheetReport }> = [];

  // 1. Sheets and rows ---------------------------------------------------------------------------
  for (const sheet of raw.sheets) {
    if (TRACKER_HELPER_SHEETS.has(normalizeText(sheet.name))) {
      reports.push({
        name: sheet.name,
        kind: 'unrecognized',
        headerRow: null,
        columns: null,
        rowsTotal: 0,
        rowsBlank: 0,
        rowsAccepted: 0,
        rowsRejected: 0,
        note: 'Служебный лист трекера (расчёты и справочники): не импортируется',
      });
      continue;
    }
    const layout = detectSheet(sheet);
    const report: SheetReport = {
      name: sheet.name,
      kind: layout?.kind ?? 'unrecognized',
      headerRow: layout ? layout.headerIndex + 1 : null,
      columns: layout ? layout.headers : null,
      rowsTotal: 0,
      rowsBlank: 0,
      rowsAccepted: 0,
      rowsRejected: 0,
      note: layout ? null : 'Не найден заголовок таблицы с нужными столбцами — лист пропущен',
    };
    reports.push(report);
    if (!layout) continue;
    if (layout.kind === 'nutrition') {
      nutritionSheets.push({ sheet, layout, report });
      continue;
    }
    for (let i = layout.headerIndex + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i] ?? [];
      const rowNumber = i + 1;
      const key = ['date', 'exercise', 'setNo', 'weight', 'reps', 'rir'] as const;
      if (key.every((f) => isEmptyCell(cell(row, layout, f)))) {
        report.rowsBlank++;
        continue;
      }
      report.rowsTotal++;
      const reasons: string[] = [];
      const date = parseExcelDate(cell(row, layout, 'date'));
      if (!date.ok) reasons.push(date.error);
      const exerciseName = cellText(cell(row, layout, 'exercise'));
      if (exerciseName === '') reasons.push('Не указано упражнение');
      const weightRaw = parseNumber(cell(row, layout, 'weight'));
      let weight: number | null = null;
      if (!weightRaw.ok) reasons.push(`Вес «${cellText(cell(row, layout, 'weight'))}» не число`);
      else if (weightRaw.value !== null && (weightRaw.value < 0 || weightRaw.value > 1000)) reasons.push(`Вес «${weightRaw.value}» вне допустимого диапазона`);
      else weight = weightRaw.value;
      const repsCell = cell(row, layout, 'reps');
      const repsRaw = parseInteger(repsCell);
      let reps = 0;
      if (isEmptyCell(repsCell)) reasons.push('Повторения не указаны');
      else if (!repsRaw.ok) reasons.push(`Повторения «${cellText(repsCell)}» должны быть целым числом`);
      else if (repsRaw.value === null || repsRaw.value < 1 || repsRaw.value > 200) reasons.push(`Повторения «${cellText(repsCell)}» вне допустимого диапазона`);
      else reps = repsRaw.value;
      const rir = parseRir(cell(row, layout, 'rir'));
      if (!rir.ok) reasons.push(rir.error);
      const setNo = parseInteger(cell(row, layout, 'setNo'));
      if (!setNo.ok) reasons.push(`Номер подхода «${cellText(cell(row, layout, 'setNo'))}» должен быть целым числом`);
      else if (setNo.value !== null && setNo.value < 1) reasons.push('Номер подхода должен быть не меньше 1');
      const type = parseType(cell(row, layout, 'type'));
      if (type === null) reasons.push(`Тип подхода «${cellText(cell(row, layout, 'type'))}» не распознан`);

      if (reasons.length > 0 || !date.ok || !rir.ok || !setNo.ok || type === null) {
        rejected.push({ sheet: sheet.name, rowNumber, part: 'training', category: 'invalid', reasons, values: displayValues(row, layout) });
        report.rowsRejected++;
        continue;
      }
      parsedSets.push({
        sheet: sheet.name,
        rowNumber,
        date: date.value,
        label: cellText(cell(row, layout, 'workout')) || null,
        exerciseName,
        exerciseKey: normalizeText(exerciseName),
        setNo: setNo.value,
        weight,
        reps,
        rir: rir.value,
        type,
        comment: cellText(cell(row, layout, 'comment')) || null,
        values: displayValues(row, layout),
      });
    }
  }

  // 2. Duplicates and set numbers ---------------------------------------------------------------
  const used = new Map<string, Map<number, number>>();
  const lastNo = new Map<string, number>();
  const sets: Array<ParsedSet & { no: number }> = [];
  const reportOf = (name: string) => reports.find((r) => r.name === name) as SheetReport;
  for (const s of parsedSets) {
    const k = `${s.date}|${s.exerciseKey}|${s.type === 'warmup' ? 'w' : 'k'}`;
    const taken = used.get(k) ?? new Map<number, number>();
    used.set(k, taken);
    let no = s.setNo;
    if (no !== null) {
      const prev = taken.get(no);
      if (prev !== undefined) {
        rejected.push({ sheet: s.sheet, rowNumber: s.rowNumber, part: 'training', category: 'duplicate', reasons: [`Дубликат подхода №${no} (уже есть в строке ${prev})`], values: s.values });
        reportOf(s.sheet).rowsRejected++;
        continue;
      }
    } else {
      no = (lastNo.get(k) ?? 0) + 1;
      while (taken.has(no)) no++;
    }
    taken.set(no, s.rowNumber);
    lastNo.set(k, Math.max(lastNo.get(k) ?? 0, no));
    sets.push({ ...s, no });
  }

  // 3. Exercise resolution ----------------------------------------------------------------------
  const matcher = buildMatcher(ctx.exercises);
  const refById = new Map<string, ExerciseRef>(ctx.exercises.map((e) => [e.id, e]));
  const names = new Map<string, { source: string; count: number }>();
  for (const s of sets) {
    const e = names.get(s.exerciseKey);
    if (e) e.count++;
    else names.set(s.exerciseKey, { source: s.exerciseName, count: 1 });
  }
  const resolutions: ExerciseResolution[] = [];
  const effective = new Map<string, { exerciseId: string; range: { min: number; max: number } }>();
  const decisions = ctx.decisions ?? {};
  for (const [norm, { source, count }] of names) {
    const resolved = matcher.match(source);
    const inferred: InferredExercise | null = resolved ? null : inferTraits(source);
    const suggestions = resolved ? [] : matcher.suggest(source, 3);
    const defaultDecision: ExerciseDecision = resolved ? { kind: 'use', exerciseId: resolved.exerciseId } : inferred ? { kind: 'create' } : { kind: 'skip' };
    let decision: ExerciseDecision = decisions[norm] ?? defaultDecision;
    let isDefault = decisions[norm] === undefined;
    if (decision.kind === 'use' && !refById.has(decision.exerciseId)) {
      warnings.push(`Для «${source}» выбрано несуществующее упражнение — строки пропущены`);
      decision = { kind: 'skip' };
      isDefault = false;
    }
    if (decision.kind === 'create') {
      if (!inferred) {
        warnings.push(`«${source}»: нельзя создать упражнение без понятных тегов — строки пропущены`);
        decision = { kind: 'skip' };
      } else {
        const exId = ctx.ids.newId();
        const custom = Exercise.safeParse({
          ...createBase(exId, ctx.now, ctx.deviceId),
          key: `imp_${shortHash(norm)}`,
          name: source.trim().slice(0, 160),
          movementPattern: inferred.movementPattern,
          primaryMuscles: inferred.primaryMuscles,
          secondaryMuscles: inferred.secondaryMuscles,
          isCompound: inferred.isCompound,
          jointStress: {},
          axialLoad: 0,
          stabilityRequirement: 0,
          rangeOfMotion: 'medium',
          painSensitiveAreas: [],
          equipmentRequirements: [],
          skillLevel: 1,
          progressionType: 'double',
          loadUnit: inferred.loadUnit,
          defaultSets: 3,
          defaultRepRange: { min: 8, max: 12 },
          defaultRestSec: 120,
          cues: ['Импорт из Excel: теги определены по названию и не проверены — проверь их.'],
          curatedSubstituteKeys: [],
          variants: [],
          origin: 'custom',
        });
        if (custom.success) {
          bundle.exercises.push(custom.data);
          effective.set(norm, { exerciseId: exId, range: { min: 8, max: 12 } });
        } else {
          warnings.push(`«${source}»: не удалось создать упражнение (${custom.error.issues[0]?.message ?? ''})`);
          decision = { kind: 'skip' };
        }
      }
    }
    if (decision.kind === 'use') {
      const ref = refById.get(decision.exerciseId) as ExerciseRef;
      effective.set(norm, { exerciseId: ref.id, range: ref.defaultRepRange });
    }
    resolutions.push({
      sourceName: source,
      normalized: norm,
      rowCount: count,
      resolved: resolved ? { exerciseId: resolved.exerciseId, name: resolved.name, via: resolved.via } : null,
      inferred,
      suggestions,
      decision,
      decisionIsDefault: isDefault,
    });
  }

  // 4. Entities for sets, sessions ------------------------------------------------------------------
  const accepted: Array<{ s: ParsedSet & { no: number }; setLog: SetLog; exerciseId: string }> = [];
  for (const s of sets) {
    const eff = effective.get(s.exerciseKey);
    if (!eff) {
      rejected.push({
        sheet: s.sheet,
        rowNumber: s.rowNumber,
        part: 'training',
        category: 'unmapped',
        reasons: [`Упражнение «${s.exerciseName}» не сопоставлено — строка пропущена`],
        values: s.values,
      });
      reportOf(s.sheet).rowsRejected++;
      continue;
    }
    const at = `${s.date}T12:00:00Z`;
    const parsed = SetLog.safeParse({
      ...createBase(ctx.ids.newId(), ctx.now, ctx.deviceId),
      sessionExerciseId: 'pending',
      plannedSetId: null,
      exerciseId: eff.exerciseId,
      variantKey: 'default',
      contextKey: progressionKey({ exerciseId: eff.exerciseId, variantKey: 'default', repMin: eff.range.min, repMax: eff.range.max }),
      setNo: s.no,
      setType: s.type,
      status: 'done',
      skipReason: null,
      painFlag: false,
      actualWeightKg: s.weight,
      actualReps: s.reps,
      actualRir: s.rir,
      restSec: null,
      note: s.comment ? s.comment.slice(0, 1000) : null,
      completedAt: at,
      source: 'import',
    });
    if (!parsed.success) {
      rejected.push({ sheet: s.sheet, rowNumber: s.rowNumber, part: 'training', category: 'invalid', reasons: [`Не прошла проверку: ${parsed.error.issues[0]?.message ?? ''}`], values: s.values });
      reportOf(s.sheet).rowsRejected++;
      continue;
    }
    accepted.push({ s, setLog: parsed.data, exerciseId: eff.exerciseId });
    reportOf(s.sheet).rowsAccepted++;
  }

  const sessionByDate = new Map<string, string>();
  const labelsByDate = new Map<string, Set<string>>();
  const sessionExerciseByKey = new Map<string, string>();
  const positionByDate = new Map<string, number>();
  for (const { s } of accepted) {
    if (s.label) labelsByDate.set(s.date, (labelsByDate.get(s.date) ?? new Set()).add(s.label));
  }
  const orderedDates = [...new Set(accepted.map((a) => a.s.date))].sort();
  for (const date of orderedDates) {
    const id = ctx.ids.newId();
    sessionByDate.set(date, id);
    const labels = [...(labelsByDate.get(date) ?? [])].join(', ');
    bundle.workoutSessions.push(
      WorkoutSession.parse({
        ...createBase(id, ctx.now, ctx.deviceId),
        plannedSessionId: null,
        versionId: IMPORTED_HISTORY_VERSION_ID,
        startedAt: `${date}T12:00:00Z`,
        endedAt: null,
        status: 'completed',
        note: `Импорт из Excel${labels ? ` · ${labels}` : ''}`.slice(0, 1000),
      }),
    );
    dates.push(date);
  }
  for (const a of accepted.sort((x, y) => (x.s.date < y.s.date ? -1 : x.s.date > y.s.date ? 1 : 0))) {
    const sessionId = sessionByDate.get(a.s.date) as string;
    const k = `${a.s.date}|${a.exerciseId}`;
    let seId = sessionExerciseByKey.get(k);
    if (!seId) {
      seId = ctx.ids.newId();
      sessionExerciseByKey.set(k, seId);
      const position = (positionByDate.get(a.s.date) ?? 0) + 1;
      positionByDate.set(a.s.date, position);
      bundle.sessionExercises.push(
        SessionExercise.parse({
          ...createBase(seId, ctx.now, ctx.deviceId),
          sessionId,
          exerciseId: a.exerciseId,
          variantKey: 'default',
          plannedExerciseKey: null,
          position,
          replacedFromExerciseId: null,
          replacementReason: null,
          status: 'done',
          skipReason: null,
          note: null,
        }),
      );
    }
    bundle.setLogs.push(SetLog.parse({ ...a.setLog, sessionExerciseId: seId }));
  }

  // 5. Nutrition sheets ---------------------------------------------------------------------------
  const seenDays = new Map<string, number>();
  let fiberMissing = 0;
  for (const { sheet, layout, report } of nutritionSheets) {
    const waterInMl = /мл|ml/i.test(layout.headers.water ?? '');
    for (let i = layout.headerIndex + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i] ?? [];
      const rowNumber = i + 1;
      const fields = ['weight', 'kcal', 'protein', 'fat', 'carb', 'fiber', 'water'] as const;
      if (fields.every((f) => isEmptyCell(cell(row, layout, f)))) {
        report.rowsBlank++;
        continue;
      }
      report.rowsTotal++;
      const values = displayValues(row, layout);
      const reject = (part: RejectedRow['part'], reasons: string[], category: RejectedRow['category'] = 'invalid') => {
        rejected.push({ sheet: sheet.name, rowNumber, part, category, reasons, values });
        rowRejected = true;
      };
      let rowRejected = false;
      let rowAccepted = false;
      const date = parseExcelDate(cell(row, layout, 'date'));
      if (!date.ok) {
        reject('nutrition', [date.error]);
        report.rowsRejected++;
        continue;
      }
      const dup = seenDays.get(date.value);
      if (dup !== undefined) {
        reject('nutrition', [`Дата ${date.value} уже есть в строке ${dup}`], 'duplicate');
        report.rowsRejected++;
        continue;
      }
      seenDays.set(date.value, rowNumber);
      const comment = cellText(cell(row, layout, 'comment')) || null;

      // weight
      const w = parseNumber(cell(row, layout, 'weight'));
      if (!isEmptyCell(cell(row, layout, 'weight'))) {
        if (!w.ok || w.value === null) reject('weight', [`Вес «${cellText(cell(row, layout, 'weight'))}» не число`]);
        else if (w.value < 30 || w.value > 300) reject('weight', [`Вес «${w.value}» вне диапазона 30–300 кг`]);
        else {
          bundle.bodyMetrics.push(
            BodyMetric.parse({ ...createBase(ctx.ids.newId(), ctx.now, ctx.deviceId), type: 'weight', value: w.value, unit: 'kg', measuredOn: date.value, note: null }),
          );
          dates.push(date.value);
          rowAccepted = true;
        }
      }

      // day totals
      const kcalCell = cell(row, layout, 'kcal');
      const macroFields = ['protein', 'fat', 'carb'] as const;
      const anyNutrition = [kcalCell, ...macroFields.map((f) => cell(row, layout, f))].some((c) => !isEmptyCell(c));
      if (anyNutrition) {
        const reasons: string[] = [];
        const k = parseNumber(kcalCell);
        if (isEmptyCell(kcalCell)) reasons.push('Не указаны калории');
        else if (!k.ok || k.value === null || k.value <= 0 || k.value > 10000) reasons.push(`Калории «${cellText(kcalCell)}» некорректны`);
        const m: Record<string, number> = {};
        for (const f of macroFields) {
          const c = cell(row, layout, f);
          const label = { protein: 'белок', fat: 'жиры', carb: 'углеводы' }[f];
          const p = parseNumber(c);
          if (isEmptyCell(c)) reasons.push(`Не указан показатель: ${label}`);
          else if (!p.ok || p.value === null || p.value < 0 || p.value > 1000) reasons.push(`Показатель «${label}» («${cellText(c)}») некорректен`);
          else m[f] = p.value;
        }
        const fiberCell = cell(row, layout, 'fiber');
        const fb = parseNumber(fiberCell);
        let fiber = 0;
        if (!isEmptyCell(fiberCell)) {
          if (!fb.ok || fb.value === null || fb.value < 0 || fb.value > 300) reasons.push(`Клетчатка «${cellText(fiberCell)}» некорректна`);
          else fiber = fb.value;
        }
        if (reasons.length > 0 || !k.ok || k.value === null) {
          reject('nutrition', reasons);
        } else {
          if (isEmptyCell(fiberCell)) fiberMissing++;
          const totals = { kcal: k.value, proteinG: m.protein as number, fatG: m.fat as number, carbG: m.carb as number, fiberG: fiber };
          const amount = 1000;
          const per100 = Object.fromEntries(Object.entries(totals).map(([key, v]) => [key, (v * 100) / amount])) as typeof totals;
          const log = FoodLog.safeParse({
            ...createBase(ctx.ids.newId(), ctx.now, ctx.deviceId),
            date: date.value,
            slot: 'snack',
            entryType: 'unplanned',
            plannedItemId: null,
            actualAmountG: amount,
            snapshot: {
              foodId: DAILY_TOTAL_FOOD_ID,
              foodName: 'Дневной итог (импорт из Excel)',
              basis: 'as_sold',
              per100,
              gramsPerPiece: null,
              yieldFactorUsed: null,
              enteredBasis: 'as_sold',
              dataSource: { kind: 'user', note: 'Дневной итог из Excel; приём пищи не указан' },
            },
            macros: totals,
            note: comment ? comment.slice(0, 500) : null,
          });
          if (log.success) {
            bundle.foodLogs.push(log.data);
            dates.push(date.value);
            rowAccepted = true;
          } else {
            reject('nutrition', [`Не прошла проверку: ${log.error.issues[0]?.message ?? ''}`]);
          }
        }
      }

      // water / note
      const waterCell = cell(row, layout, 'water');
      if (!isEmptyCell(waterCell)) {
        const v = parseNumber(waterCell);
        const ml = v.ok && v.value !== null ? (waterInMl ? v.value : v.value * 1000) : NaN;
        if (!Number.isFinite(ml) || ml < 0 || ml > 15000) {
          reject('water', [`Вода «${cellText(waterCell)}» некорректна`]);
        } else {
          bundle.dailyLogs.push(
            DailyLog.parse({ ...createBase(ctx.ids.newId(), ctx.now, ctx.deviceId), date: date.value, waterMl: Math.round(ml), note: comment ? comment.slice(0, 1000) : null }),
          );
          dates.push(date.value);
          rowAccepted = true;
        }
      }
      if (rowAccepted) report.rowsAccepted++;
      if (rowRejected) report.rowsRejected++;
    }
  }
  if (bundle.foodLogs.length > 0 && !ctx.hasDailyTotalFood) {
    bundle.foods.push(
      Food.parse({
        ...createBase(DAILY_TOTAL_FOOD_ID, ctx.now, ctx.deviceId),
        key: DAILY_TOTAL_FOOD_ID,
        name: 'Дневной итог (импорт из Excel)',
        brand: null,
        barcode: null,
        category: 'other',
        basis: 'as_sold',
        unit: 'g',
        gramsPerPiece: null,
        per100: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0 },
        variantGroup: null,
        yieldFactor: null,
        dataSource: { kind: 'user', note: 'Служебная запись: дневные итоги, импортированные из Excel' },
        origin: 'custom',
      }),
    );
  }
  if (fiberMissing > 0) warnings.push(`Клетчатка не указана в ${fiberMissing} днях — записана как 0`);
  if (bundle.foodLogs.length > 0) warnings.push('Дневные итоги питания импортируются одной записью в день (приём пищи не указан).');

  const sorted = [...dates].sort();
  return {
    sheets: reports,
    rejected,
    exerciseResolutions: resolutions,
    bundle,
    counts: {
      workoutSessions: bundle.workoutSessions.length,
      sessionExercises: bundle.sessionExercises.length,
      setLogs: bundle.setLogs.length,
      setLogsWithoutRir: bundle.setLogs.filter((x) => x.actualRir === null && x.setType === 'working').length,
      customExercises: bundle.exercises.length,
      bodyMetrics: bundle.bodyMetrics.length,
      foodLogs: bundle.foodLogs.length,
      dailyLogs: bundle.dailyLogs.length,
    },
    dateRange: sorted.length > 0 ? { from: sorted[0] as string, to: sorted[sorted.length - 1] as string } : null,
    warnings,
  };
}
