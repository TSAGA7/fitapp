import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createBase, type Exercise, type Profile, type ProgramVersion } from '@fitapp/domain';
import { createFixedClock } from './clock';
import { PROFILE_ID, PROGRAM_ID } from './constants';
import { createUuidV7Generator } from './ids';
import { createLocalStorage, type CreateStorageOptions, type LocalStorage } from './storage';

export const T0 = '2026-10-01T08:00:00.000Z';
export type FixedClock = ReturnType<typeof createFixedClock>;

export function deterministicIds() {
  let ms = 1_790_000_000_000;
  let seed = 7;
  return createUuidV7Generator({
    nowMs: () => ms++,
    randomBytes: (n) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        out[i] = seed >>> 24;
      }
      return out;
    },
  });
}

let counter = 0;
export async function makeStorage(over: Partial<CreateStorageOptions> = {}): Promise<{ s: LocalStorage; clock: FixedClock }> {
  const clock = (over.clock as FixedClock | undefined) ?? createFixedClock(T0);
  const s = await createLocalStorage({
    name: `test-${++counter}`,
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    clock,
    ids: deterministicIds(),
    ...over,
  });
  return { s, clock };
}

const macros = { kcal: 100, proteinG: 10, fatG: 2, carbG: 15, fiberG: 3 };

/** Valid sample entities for every repository. */
export function builders(s: LocalStorage) {
  const base = (id?: string) => createBase(id ?? s.ids.newId(), s.clock.now(), s.deviceId);
  const targets = { ...macros, kcal: 2200, waterMl: 2800 };
  const exercise = (over: Partial<Exercise> = {}): Exercise => ({
    ...base(),
    key: 'my_exercise',
    name: 'Моё упражнение',
    movementPattern: 'squat',
    primaryMuscles: ['quads'],
    secondaryMuscles: [],
    isCompound: true,
    jointStress: { knee: 1 },
    axialLoad: 0,
    stabilityRequirement: 0,
    rangeOfMotion: 'medium',
    painSensitiveAreas: [],
    equipmentRequirements: [],
    skillLevel: 1,
    progressionType: 'double',
    loadUnit: 'kg_total',
    defaultSets: 3,
    defaultRepRange: { min: 8, max: 12 },
    defaultRestSec: 120,
    cues: [],
    curatedSubstituteKeys: [],
    variants: [],
    origin: 'custom',
    ...over,
  });
  return {
    base,
    exercise,
    profile: (): Profile => ({
      ...base(PROFILE_ID),
      sex: 'male',
      birthDate: '1997-05-12',
      heightCm: 181,
      timezone: 'Europe/Amsterdam',
      locale: 'ru',
      units: 'metric',
      weekStartsOn: 'monday',
      experience: 'intermediate',
      jobActivity: 'sedentary',
      trainingSchedule: { monday: true, tuesday: false, wednesday: true, thursday: false, friday: false, saturday: true, sunday: false },
    }),
    goal: () => ({ ...base(), type: 'fat_loss' as const, priority: 1, status: 'active' as const, startedOn: '2026-10-01', endedOn: null, targetWeightKg: 77, targetWaistCm: null, focus: [{ area: 'abdomen' as const, weight: 3 }] }),
    metric: (type: 'weight' | 'waist' = 'weight', value = 82.5, measuredOn = '2026-10-01') => ({
      ...base(),
      type,
      value,
      unit: type === 'weight' ? ('kg' as const) : ('cm' as const),
      measuredOn,
      note: null,
    }),
    injury: () => ({ ...base(), area: 'knee' as const, side: 'left' as const, status: 'recurring' as const, triggerKinds: ['movement' as const], triggerText: null, notes: null, resolvedOn: null }),
    painEvent: (exerciseId = 'leg_press') => ({ ...base(), occurredAt: s.clock.now(), area: 'shoulder' as const, side: 'both' as const, intensity: 3, injuryId: null, exerciseId, sessionExerciseId: null, note: null }),
    equipment: () => ({ ...base(), key: 'my_machine', name: 'Мой тренажёр', category: 'machines' as const, loadType: 'stack' as const, defaultStepKg: 2.5, origin: 'custom' as const }),
    userEquipment: () => ({ ...base(), equipmentId: 'leg_press', available: true, stepKg: 5, minKg: null, maxKg: null }),
    food: (barcode: string | null = null) => ({
      ...base(),
      key: 'my_food',
      name: 'Моя еда',
      brand: null,
      barcode,
      category: 'other' as const,
      basis: 'as_sold' as const,
      unit: 'g' as const,
      gramsPerPiece: null,
      per100: macros,
      variantGroup: null,
      yieldFactor: null,
      dataSource: { kind: 'user' as const, note: null },
      autoPlan: true,
      origin: 'custom' as const,
    }),
    userExercise: () => ({ ...base(), exerciseId: 'leg_press', preference: 'like' as const }),
    cardioSession: () => ({ ...base(), date: '2026-10-09', machine: 'treadmill' as const, durationMin: 30, speedKmh: 5.5, inclinePct: 6, level: null, distanceKm: 2.8, avgHeartRate: 128, effort: 5, note: null }),
    exerciseNote: () => ({ ...base(), exerciseId: 'leg_press', text: 'Тяжело, следи за плечом', sessionId: 's1', shownInSessionId: null }),
    userFood: () => ({ ...base(), foodId: 'egg', preference: 'like' as const, availability: 'always' as const, maxPerDayG: null, excluded: false }),
    targets: (validFrom = '2026-10-01', validTo: string | null = null) => ({ ...base(), validFrom, validTo, targets, versionId: null }),
    mealPlan: (weekStart = '2026-09-28', status: 'draft' | 'active' | 'archived' = 'active') => ({ ...base(), weekStart, versionId: 'v1', status, generatedBy: 'engine' as const, generatorSeed: null }),
    plannedItem: (planId: string, date = '2026-09-28') => ({ ...base(), planId, date, slot: 'lunch' as const, foodId: 'egg', plannedAmountG: 110, plannedMacros: macros, locked: false, replacedFromItemId: null }),
    foodLog: (date = '2026-10-01', plannedItemId: string | null = null) => ({
      ...base(),
      date,
      slot: 'lunch' as const,
      entryType: plannedItemId ? ('modified' as const) : ('unplanned' as const),
      plannedItemId,
      actualAmountG: 150,
      snapshot: { foodId: 'egg', foodName: 'Яйцо', basis: 'raw' as const, per100: macros, gramsPerPiece: 55, yieldFactorUsed: null, enteredBasis: 'raw' as const, dataSource: { kind: 'estimate' as const, note: null } },
      macros,
      note: null,
    }),
    dailyLog: (date = '2026-10-01') => ({ ...base(), date, waterMl: 2500, note: null }),
    program: () => ({ ...base(PROGRAM_ID), activeVersionId: null }),
    programVersion: (versionNo = 1, parentVersionId: string | null = null, id?: string): ProgramVersion => ({
      ...base(id),
      programId: PROGRAM_ID,
      versionNo,
      parentVersionId,
      source: versionNo === 1 ? 'initial' : 'engine',
      reasonSummary: 'Тест',
      effectiveFrom: '2026-10-01',
      nutrition: targets,
      training: {
        workouts: [{ key: 'a', label: 'A', focus: ['legs'], exercises: [{ key: 'a_leg_press', exerciseId: 'leg_press', variantKey: 'default', position: 1, sets: 3, repMin: 10, repMax: 12, rirAdaptation: { min: 2, max: 3 }, rirMain: { min: 1, max: 2 }, restSec: 150, startWeightKg: 80, progression: { type: 'double', stepKg: 5 } }] }],
        rotation: ['a'],
        adaptationWeeks: 3,
        startsOn: '2026-10-01',
      },
    }),
    planChange: (toVersionId: string) => ({ ...base(), fromVersionId: null, toVersionId, kind: 'initial' as const, reasonCode: 'initial', reasonText: 'Первая программа', evidence: {}, diff: [], source: 'initial' as const }),
    proposal: (status: 'draft' | 'accepted' = 'draft') => ({
      ...base(),
      source: 'engine' as const,
      baseVersionId: 'v1',
      payload: { kind: 'nutrition_targets' as const, targets },
      reasonCode: 'weight_flat',
      reasonText: 'Вес не менялся 3 недели',
      evidence: { avg7: 82.4 },
      validation: { ok: true, issues: [] },
      status,
      decidedAt: null,
    }),
    plannedSession: (plannedDate = '2026-10-05') => ({ ...base(), versionId: 'v1', workoutKey: 'a', plannedDate, status: 'planned' as const, originalDate: null, movedReason: null }),
    plannedSet: (plannedSessionId: string, setNo = 1) => ({ ...base(), plannedSessionId, plannedExerciseKey: 'a_leg_press', exerciseId: 'leg_press', variantKey: 'default', contextKey: 'leg_press::default::10-12', setNo, targetWeightKg: 80, repMin: 10, repMax: 12, targetRir: { min: 2, max: 3 }, restSec: 150, reasonCode: 'start', reasonText: 'Стартовый вес' }),
    workoutSession: (startedAt = '2026-10-05T10:00:00.000Z') => ({ ...base(), plannedSessionId: null, versionId: 'v1', startedAt, endedAt: null, status: 'in_progress' as const, note: null }),
    sessionExercise: (sessionId: string, position = 1, exerciseId = 'leg_press') => ({ ...base(), sessionId, exerciseId, variantKey: 'default', plannedExerciseKey: null, position, replacedFromExerciseId: null, replacementReason: null, status: 'planned' as const, skipReason: null, note: null }),
    setLog: (sessionExerciseId: string, setNo = 1, completedAt: string | null = '2026-10-05T10:05:00.000Z', contextKey = 'leg_press::default::10-12', exerciseId = 'leg_press') => ({
      ...base(),
      sessionExerciseId,
      plannedSetId: null,
      exerciseId,
      variantKey: 'default',
      contextKey,
      setNo,
      setType: 'working' as const,
      status: 'done' as const,
      skipReason: null,
      painFlag: false,
      actualWeightKg: 80,
      actualReps: 10,
      actualRir: 2,
      restSec: 120,
      note: null,
      completedAt,
      source: 'live' as const,
    }),
    summary: (weekStart = '2026-09-28') => ({ ...base(), weekStart, data: { avgWeight: 82.4 } }),
  };
}
