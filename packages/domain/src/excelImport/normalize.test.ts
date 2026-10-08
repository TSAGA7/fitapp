import { describe, expect, it } from 'vitest';
import { ENTITY_SCHEMAS } from '../model';
import { progressionKey } from '../util/progressionKey';
import { normalizeWorkbook } from './normalize';
import { buildMatcher, inferTraits } from './exerciseMatch';
import { DAILY_TOTAL_FOOD_ID, type ExerciseRef, type RawCell, type RawWorkbook } from './types';

const ex = (key: string, name: string, min = 8, max = 10, origin: 'seed' | 'custom' = 'seed'): ExerciseRef => ({ id: key, key, name, origin, defaultRepRange: { min, max } });
const EXERCISES: ExerciseRef[] = [
  ex('leg_press', 'Жим платформы ногами', 10, 12),
  ex('smith_squat', 'Присед в Смите (ноги чуть вперёд)', 10, 12),
  ex('chest_press_machine_seated', 'Жим в тренажёре сидя (грудь)'),
  ex('lat_pulldown_neutral', 'Тяга верхнего блока (узкий/нейтральный хват)'),
];
function counter() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}
const ctx = (over: Partial<Parameters<typeof normalizeWorkbook>[1]> = {}) => ({
  now: '2026-10-01T08:00:00Z',
  deviceId: 'dev-1',
  ids: counter(),
  exercises: EXERCISES,
  hasDailyTotalFood: false,
  ...over,
});
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const TRAINING_HEADER = ['Дата', 'Тренировка', 'Упражнение', 'Подход №', 'Вес, кг', 'Повторения', 'RIR', 'Тип подхода', 'Комментарий'];
const NUTRITION_HEADER = ['Дата', 'Вес утром, кг', 'Ккал', 'Белок, г', 'Жиры, г', 'Углеводы, г', 'Клетчатка, г', 'Вода, л', 'Комментарий'];
const wb = (...sheets: Array<[string, RawCell[][]]>): RawWorkbook => ({ sheets: sheets.map(([name, rows]) => ({ name, rows })) });
const training = (...rows: RawCell[][]) => wb(['Тренировки', [['Журнал'], [], TRAINING_HEADER, ...rows]]);

describe('sheet detection', () => {
  it('finds the header below title rows and reports the mapping', () => {
    const r = normalizeWorkbook(training([d('2026-07-23'), 'Грудь', 'Жим сидя в тренажере', 1, 35, 8, null, 'Рабочий', null]), ctx());
    const s = r.sheets[0]!;
    expect(s.kind).toBe('training');
    expect(s.headerRow).toBe(3);
    expect(s.columns?.exercise).toBe('Упражнение');
    expect(s.rowsAccepted).toBe(1);
  });
  it('reports an unknown sheet instead of failing', () => {
    const r = normalizeWorkbook(wb(['Заметки', [['Купить протеин']]], ['Тренировки', [TRAINING_HEADER]]), ctx());
    expect(r.sheets[0]).toMatchObject({ name: 'Заметки', kind: 'unrecognized' });
    expect(r.sheets[0]?.note).toContain('пропущен');
    expect(r.sheets[1]?.kind).toBe('training');
  });
  it('understands another header spelling', () => {
    const rows: RawCell[][] = [['Date', 'Exercise', 'Set #', 'Вес', 'Повт.', 'RIR', 'Тип'], [d('2026-08-01'), 'Жим платформы ногами', 1, '80', 12, 2, '']];
    const r = normalizeWorkbook(wb(['Log', rows]), ctx());
    expect(r.counts.setLogs).toBe(1);
  });
  it('does not take computed columns for input columns', () => {
    const header = ['Дата', 'Упражнение', 'Повторения', 'Объём, кг×повт.', 'Оценка подхода'];
    const r = normalizeWorkbook(wb(['T', [header, [d('2026-08-01'), 'Жим платформы ногами', 12, 960, 'В диапазоне']]]), ctx());
    expect(Object.keys(r.sheets[0]!.columns ?? {})).toEqual(['date', 'exercise', 'reps']);
  });
});

describe('helper sheets of the tracker workbook', () => {
  it('are reported and never imported, even if they look like a data table', () => {
    const calc: RawCell[][] = [['Дата', 'Вес', 'Ккал'], [d('2026-09-29'), 82.5, 2180]];
    const r = normalizeWorkbook(wb(['Расчёты', calc], ['Питание', [NUTRITION_HEADER, [d('2026-09-29'), 82.5, 2180, 165, 70, 225, 30, 2.8, null]]]), ctx());
    expect(r.sheets[0]).toMatchObject({ name: 'Расчёты', kind: 'unrecognized' });
    expect(r.sheets[0]?.note).toContain('Служебный лист');
    expect(r.counts.bodyMetrics).toBe(1);
    expect(r.rejected).toEqual([]);
  });
});

describe('training rows', () => {
  it('maps catalog names and aliases, keeps the data of every set', () => {
    const r = normalizeWorkbook(
      training(
        [d('2026-07-23'), 'Грудь', 'Жим сидя в тренажере', 1, 30, 15, null, 'Разминка', null],
        [d('2026-07-23'), 'Грудь', 'Жим сидя в тренажере', 2, 35, 8, null, 'Рабочий', 'тяжело'],
        [d('2026-07-23'), 'Грудь', 'Жим сидя в тренажере', 3, 35, 8, null, '', null],
        [d('2026-06-20'), 'Ноги', 'Жим платформы ногами', 1, 70, 15, null, 'Рабочий', null],
      ),
      ctx(),
    );
    expect(r.counts).toMatchObject({ workoutSessions: 2, sessionExercises: 2, setLogs: 4, customExercises: 0 });
    const sets = r.bundle.setLogs;
    expect(sets.map((s) => s.exerciseId)).toEqual(['leg_press', 'chest_press_machine_seated', 'chest_press_machine_seated', 'chest_press_machine_seated']);
    expect(sets.map((s) => s.setType)).toEqual(['working', 'warmup', 'working', 'working']);
    expect(sets[1]?.note).toBe(null);
    expect(sets.find((s) => s.note === 'тяжело')?.actualWeightKg).toBe(35);
    expect(r.dateRange).toEqual({ from: '2026-06-20', to: '2026-07-23' });
    const res = r.exerciseResolutions.find((x) => x.sourceName === 'Жим сидя в тренажере');
    expect(res?.resolved?.via).toBe('alias');
  });

  it('imports sets without RIR as imported sets with RIR null: it is never invented', () => {
    const r = normalizeWorkbook(training([d('2026-07-23'), '', 'Жим платформы ногами', 1, 70, 15, null, 'Рабочий', null]), ctx());
    const s = r.bundle.setLogs[0]!;
    expect(s.source).toBe('import');
    expect(s.actualRir).toBeNull();
    expect(s.setType).toBe('working');
    expect(r.counts.setLogsWithoutRir).toBe(1);
    expect(r.bundle.workoutSessions[0]?.versionId).toBe('imported_history');
    expect(r.bundle.workoutSessions[0]?.status).toBe('completed');
  });
  it('keeps a real RIR when the file has one (4+ becomes 4)', () => {
    const r = normalizeWorkbook(training([d('2026-07-23'), '', 'Жим платформы ногами', 1, 70, 15, '4+', 'Рабочий', null], [d('2026-07-23'), '', 'Жим платформы ногами', 2, 70, 14, 2, 'Рабочий', null]), ctx());
    expect(r.bundle.setLogs.map((s) => s.actualRir)).toEqual([4, 2]);
  });
  it('uses the default rep range of the catalog exercise as the progression context', () => {
    const r = normalizeWorkbook(training([d('2026-07-23'), '', 'Жим платформы ногами', 1, 70, 15, null, '', null]), ctx());
    expect(r.bundle.setLogs[0]?.contextKey).toBe(progressionKey({ exerciseId: 'leg_press', variantKey: 'default', repMin: 10, repMax: 12 }));
  });
  it('numbers sets when the column is empty and keeps explicit numbers', () => {
    const r = normalizeWorkbook(
      training(
        [d('2026-07-23'), '', 'Жим платформы ногами', null, 70, 15, null, '', null],
        [d('2026-07-23'), '', 'Жим платформы ногами', null, 70, 14, null, '', null],
        [d('2026-07-23'), '', 'Жим платформы ногами', 5, 70, 13, null, '', null],
        [d('2026-07-23'), '', 'Жим платформы ногами', null, 70, 12, null, '', null],
      ),
      ctx(),
    );
    expect(r.bundle.setLogs.map((s) => s.setNo)).toEqual([1, 2, 5, 6]);
  });
  it('accepts decimal commas, units and text numbers', () => {
    const r = normalizeWorkbook(training(['23.07.2026', '', 'Жим платформы ногами', '1', '82,5 кг', '10', '2', '', null]), ctx());
    expect(r.bundle.setLogs[0]).toMatchObject({ actualWeightKg: 82.5, actualReps: 10, actualRir: 2 });
  });
  it('groups one session per day with the labels in its note', () => {
    const r = normalizeWorkbook(
      training(
        [d('2026-07-23'), 'Грудь', 'Жим платформы ногами', 1, 70, 15, null, '', null],
        [d('2026-07-23'), 'Ноги', 'Присед в Смитте', 1, 30, 15, null, '', null],
      ),
      ctx(),
    );
    expect(r.counts.workoutSessions).toBe(1);
    expect(r.bundle.workoutSessions[0]?.note).toContain('Грудь, Ноги');
    expect(r.bundle.sessionExercises.map((e) => e.position)).toEqual([1, 2]);
  });
  it('every produced entity passes its domain schema', () => {
    const r = normalizeWorkbook(
      wb(
        ['Тренировки', [TRAINING_HEADER, [d('2026-07-23'), 'Грудь', 'Баттерфляй (тренажер)', 1, 45, 8, null, '', null], [d('2026-07-23'), 'Грудь', 'Жим платформы ногами', 1, 45, 8, null, '', null]]],
        ['Питание', [NUTRITION_HEADER, [d('2026-07-23'), 82.5, 2180, 165, 70, 225, 30, 2.8, 'ок']]],
      ),
      ctx(),
    );
    const b = r.bundle;
    const check = (store: keyof typeof ENTITY_SCHEMAS, rows: unknown[]) => rows.forEach((x) => expect(ENTITY_SCHEMAS[store].safeParse(x).success).toBe(true));
    check('exercises', b.exercises);
    check('foods', b.foods);
    check('workoutSessions', b.workoutSessions);
    check('sessionExercises', b.sessionExercises);
    check('setLogs', b.setLogs);
    check('bodyMetrics', b.bodyMetrics);
    check('foodLogs', b.foodLogs);
    check('dailyLogs', b.dailyLogs);
  });
});

describe('rejected rows are reported separately and never break the import', () => {
  const rows = [
    [d('2026-08-01'), '', 'Жим платформы ногами', 1, 80, 12, 2, 'Рабочий', null], // ok
    ['31.02.2026', '', 'Жим платформы ногами', 1, 80, 12, null, '', null],
    [d('2026-08-01'), '', '', 1, 50, 10, null, '', null],
    [d('2026-08-01'), '', 'Жим платформы ногами', 2, -5, 10, null, '', null],
    [d('2026-08-01'), '', 'Жим платформы ногами', 3, 20, 'много', null, '', null],
    [d('2026-08-01'), '', 'Жим платформы ногами', 4, 20, 10, 9, '', null],
    [d('2026-08-01'), '', 'Жим платформы ногами', 5, 20, 10, null, 'Супер', null],
    [d('2026-08-01'), '', 'Жим платформы ногами', 6, 20, 3.5, null, '', null],
    [d('2026-08-01'), '', 'Жим платформы ногами', 7, 20, null, null, '', null],
    [d('2026-08-01'), '', 'Жим платформы ногами', 1, 80, 12, 2, 'Рабочий', null], // duplicate of set 1
    [null, null, null, null, null, null, null, null, null], // blank
    [d('2026-08-03'), '', 'Йога', 1, 0, 30, null, '', null], // unknown, no tags
  ] as RawCell[][];
  const r = normalizeWorkbook(training(...rows), ctx());

  it('imports the valid row only', () => {
    expect(r.counts.setLogs).toBe(1);
  });
  it('lists every problem with the Excel row number and a reason', () => {
    const byRow = new Map(r.rejected.map((x) => [x.rowNumber, x]));
    expect(byRow.get(5)?.reasons[0]).toContain('Не удалось прочитать дату');
    expect(byRow.get(6)?.reasons).toContain('Не указано упражнение');
    expect(byRow.get(7)?.reasons[0]).toContain('Вес «-5» вне допустимого диапазона');
    expect(byRow.get(8)?.reasons[0]).toContain('«много» должны быть целым числом');
    expect(byRow.get(9)?.reasons[0]).toContain('RIR «9» вне диапазона');
    expect(byRow.get(10)?.reasons[0]).toContain('Тип подхода «Супер» не распознан');
    expect(byRow.get(11)?.reasons[0]).toContain('целым числом');
    expect(byRow.get(12)?.reasons).toContain('Повторения не указаны');
    expect(byRow.get(13)).toMatchObject({ category: 'duplicate' });
    expect(byRow.get(13)?.reasons[0]).toContain('строке 4');
    expect(byRow.get(15)).toMatchObject({ category: 'unmapped' });
    expect(r.rejected.every((x) => x.values.length > 0 && x.sheet === 'Тренировки')).toBe(true);
  });
  it('blank rows are counted but not reported as errors', () => {
    expect(r.sheets[0]?.rowsBlank).toBe(1);
    expect(r.rejected.some((x) => x.rowNumber === 14)).toBe(false);
  });
});

describe('unknown exercises and decisions', () => {
  const rows = [
    [d('2026-07-16'), '', 'Подъемы гантелей в стороны', 1, 12.5, 15, null, '', null],
    [d('2026-07-16'), '', 'Подъемы гантелей в стороны', 2, 15, 8, null, '', null],
    [d('2026-07-16'), '', 'Йога', 1, 0, 30, null, '', null],
  ] as RawCell[][];
  it('creates a custom exercise by default only when the tags can be inferred, and says so', () => {
    const r = normalizeWorkbook(training(...rows), ctx());
    expect(r.counts.customExercises).toBe(1);
    const created = r.bundle.exercises[0]!;
    expect(created).toMatchObject({ name: 'Подъемы гантелей в стороны', origin: 'custom', movementPattern: 'lateral_raise', loadUnit: 'kg_per_hand' });
    expect(created.cues[0]).toContain('не проверены');
    expect(created.jointStress).toEqual({});
    const lateral = r.exerciseResolutions.find((x) => x.sourceName.startsWith('Подъемы'))!;
    expect(lateral).toMatchObject({ decisionIsDefault: true, decision: { kind: 'create' }, rowCount: 2 });
    const yoga = r.exerciseResolutions.find((x) => x.sourceName === 'Йога')!;
    expect(yoga).toMatchObject({ inferred: null, decision: { kind: 'skip' } });
    expect(r.counts.setLogs).toBe(2);
    expect(r.rejected.filter((x) => x.category === 'unmapped')).toHaveLength(1);
    expect(r.bundle.setLogs[0]?.exerciseId).toBe(created.id);
  });
  it('lets the user skip, map to an existing exercise, or (not) force creation', () => {
    const lateral = 'подъемы гантелей в стороны';
    const skip = normalizeWorkbook(training(...rows), ctx({ decisions: { [lateral]: { kind: 'skip' } } }));
    expect(skip.counts).toMatchObject({ setLogs: 0, customExercises: 0 });
    expect(skip.rejected.filter((x) => x.category === 'unmapped')).toHaveLength(3);
    const mapped = normalizeWorkbook(training(...rows), ctx({ decisions: { [lateral]: { kind: 'use', exerciseId: 'leg_press' } } }));
    expect(mapped.bundle.setLogs.map((s) => s.exerciseId)).toEqual(['leg_press', 'leg_press']);
    expect(mapped.exerciseResolutions[0]?.decisionIsDefault).toBe(false);
    const bad = normalizeWorkbook(training(...rows), ctx({ decisions: { [lateral]: { kind: 'use', exerciseId: 'ghost' } } }));
    expect(bad.counts.setLogs).toBe(0);
    expect(bad.warnings.join(' ')).toContain('несуществующее');
    const force = normalizeWorkbook(training(...rows), ctx({ decisions: { йога: { kind: 'create' } } }));
    expect(force.warnings.join(' ')).toContain('нельзя создать упражнение без понятных тегов');
  });
  it('offers suggestions for near names and reuses an existing custom exercise on re-import', () => {
    const near = normalizeWorkbook(training([d('2026-08-01'), '', 'Жим ногами в платформе', 1, 70, 15, null, '', null]), ctx());
    expect(near.exerciseResolutions[0]?.suggestions.map((s) => s.exerciseId)).toContain('leg_press');
    const existing = ex('imp_1', 'Подъемы гантелей в стороны', 8, 12, 'custom');
    const again = normalizeWorkbook(training(...rows), ctx({ exercises: [...EXERCISES, existing] }));
    expect(again.counts.customExercises).toBe(0);
    expect(again.exerciseResolutions[0]?.resolved?.via).toBe('existing');
    expect(again.bundle.setLogs[0]?.exerciseId).toBe('imp_1');
  });
  it('infers tags from Russian names', () => {
    expect(inferTraits('Сгибание рук с гантелями стоя')?.movementPattern).toBe('elbow_flexion');
    expect(inferTraits('Французский жим')?.movementPattern).toBe('elbow_extension');
    expect(inferTraits('Разгибание с верхнего блока (канат)')?.movementPattern).toBe('elbow_extension');
    expect(inferTraits('Сидя на задний пучок')?.movementPattern).toBe('rear_delt_fly');
    expect(inferTraits('Жим лежа')?.movementPattern).toBe('horizontal_push');
    expect(inferTraits('Жим гантелей сидя на скамье 60°')?.movementPattern).toBe('vertical_push');
    expect(inferTraits('Подъемы вверх сидя в тренажере')?.movementPattern).toBe('vertical_push');
    expect(inferTraits('Румынская тяга')?.movementPattern).toBe('hinge');
    expect(inferTraits('Medball slams')).toBeNull();
  });
  it('matcher: exact name without brackets, aliases, and no false positives', () => {
    const m = buildMatcher(EXERCISES);
    expect(m.match('Присед в Смите')?.exerciseId).toBe('smith_squat');
    expect(m.match('Присед в Смитте')?.via).toBe('alias');
    expect(m.match('жим платформы ногами (тренажёр)')?.exerciseId).toBe('leg_press');
    expect(m.match('Жим лежа')).toBeNull();
  });
});

describe('nutrition rows', () => {
  const sheet = (...rows: RawCell[][]) => wb(['Питание', [['Сводка'], NUTRITION_HEADER, ...rows]]);
  it('weight -> body metric, totals -> one day entry with its own calculation basis, water -> daily log', () => {
    const r = normalizeWorkbook(sheet([d('2026-09-29'), 82.5, 2180, 165, 70, 225, 30, 2.8, 'норм']), ctx());
    expect(r.counts).toMatchObject({ bodyMetrics: 1, foodLogs: 1, dailyLogs: 1 });
    expect(r.bundle.bodyMetrics[0]).toMatchObject({ type: 'weight', unit: 'kg', value: 82.5, measuredOn: '2026-09-29' });
    const log = r.bundle.foodLogs[0]!;
    expect(log.macros).toEqual({ kcal: 2180, proteinG: 165, fatG: 70, carbG: 225, fiberG: 30 });
    expect(log.entryType).toBe('unplanned');
    expect(log.snapshot.foodId).toBe(DAILY_TOTAL_FOOD_ID);
    expect(log.snapshot.dataSource.note).toContain('Excel');
    expect(r.bundle.foods).toHaveLength(1);
    expect(r.bundle.dailyLogs[0]).toMatchObject({ waterMl: 2800, note: 'норм' });
    expect(r.warnings.join(' ')).toContain('Дневные итоги');
  });
  it('does not create the placeholder food again if it exists', () => {
    const r = normalizeWorkbook(sheet([d('2026-09-29'), 82.5, 2180, 165, 70, 225, 30, 2.8, null]), ctx({ hasDailyTotalFood: true }));
    expect(r.bundle.foods).toHaveLength(0);
  });
  it('a weight-only row imports only the weight; empty rows with just a date are blank', () => {
    const r = normalizeWorkbook(sheet([d('2026-09-29'), 82.5, null, null, null, null, null, null, null], [d('2026-09-30'), null, null, null, null, null, null, null, null]), ctx());
    expect(r.counts).toMatchObject({ bodyMetrics: 1, foodLogs: 0, dailyLogs: 0 });
    expect(r.sheets[0]).toMatchObject({ rowsBlank: 1, rowsAccepted: 1, rowsRejected: 0 });
  });
  it('rejects only the bad part of a row and keeps the rest', () => {
    const r = normalizeWorkbook(sheet([d('2026-09-29'), 'abc', 2180, 165, 70, 225, null, 2.8, null], [d('2026-09-30'), 82, 2000, 150, null, 200, null, null, null]), ctx());
    expect(r.counts).toMatchObject({ bodyMetrics: 1, foodLogs: 1, dailyLogs: 1 });
    const rej = r.rejected;
    expect(rej.find((x) => x.rowNumber === 3 && x.part === 'weight')?.reasons[0]).toContain('«abc» не число');
    expect(rej.find((x) => x.rowNumber === 4 && x.part === 'nutrition')?.reasons[0]).toContain('жиры');
    expect(r.warnings.join(' ')).toContain('Клетчатка не указана');
  });
  it('rejects wrong ranges, repeated dates and unreadable dates', () => {
    const r = normalizeWorkbook(
      sheet(
        [d('2026-09-29'), 20, 99999, 1, 1, 1, 1, 99, null],
        [d('2026-09-29'), 82, null, null, null, null, null, null, null],
        ['давно', 82, null, null, null, null, null, null, null],
      ),
      ctx(),
    );
    expect(r.counts).toMatchObject({ bodyMetrics: 0, foodLogs: 0, dailyLogs: 0 });
    expect(r.rejected.map((x) => x.category)).toEqual(expect.arrayContaining(['invalid', 'duplicate']));
    expect(r.rejected.some((x) => x.reasons[0]?.includes('вне диапазона 30–300'))).toBe(true);
    expect(r.rejected.some((x) => x.reasons[0]?.includes('Калории'))).toBe(true);
    expect(r.rejected.some((x) => x.part === 'water')).toBe(true);
  });
  it('water in a millilitres column stays in millilitres', () => {
    const header = ['Дата', 'Вес', 'Вода, мл'];
    const r = normalizeWorkbook(wb(['Питание', [header, [d('2026-09-29'), 82, 2500]]]), ctx());
    expect(r.bundle.dailyLogs[0]?.waterMl).toBe(2500);
  });
});

describe('determinism', () => {
  it('the same input and ids give the same result, and the input is not modified', () => {
    const input = training([d('2026-07-23'), '', 'Жим платформы ногами', 1, 70, 15, null, '', null]);
    const frozen = JSON.stringify(input);
    const a = normalizeWorkbook(input, ctx());
    const b = normalizeWorkbook(input, ctx());
    expect(a).toEqual(b);
    expect(JSON.stringify(input)).toBe(frozen);
  });
  it('an empty workbook is not an error', () => {
    const r = normalizeWorkbook({ sheets: [] }, ctx());
    expect(r.counts.setLogs).toBe(0);
    expect(r.dateRange).toBeNull();
  });
});
