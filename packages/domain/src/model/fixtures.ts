/** Valid sample records for tests (not exported from the package). */
export const NOW = '2026-10-01T08:00:00+02:00';
export const base = (id: string) => ({ id, createdAt: NOW, updatedAt: NOW, deletedAt: null, deviceId: 'device-1' });

export const macros = { kcal: 100, proteinG: 10, fatG: 2, carbG: 15, fiberG: 3 };
export const dataSource = { kind: 'estimate' as const, note: null };

export const profile = {
  ...base('me'),
  sex: 'male' as const,
  birthDate: '1997-05-12',
  heightCm: 181,
  timezone: 'Europe/Amsterdam',
  locale: 'ru',
  units: 'metric' as const,
  weekStartsOn: 'monday' as const,
  experience: 'intermediate' as const,
  jobActivity: 'sedentary' as const,
  trainingSchedule: { monday: true, tuesday: false, wednesday: true, thursday: false, friday: false, saturday: true, sunday: false },
};

export const snapshot = {
  foodId: 'chicken_breast_raw',
  foodName: 'Куриная грудка (сырая)',
  basis: 'raw' as const,
  per100: macros,
  gramsPerPiece: null,
  yieldFactorUsed: null,
  enteredBasis: 'raw' as const,
  dataSource,
};

export const foodLog = {
  ...base('log-1'),
  date: '2026-10-01',
  slot: 'lunch' as const,
  entryType: 'modified' as const,
  plannedItemId: 'item-1',
  actualAmountG: 180,
  snapshot,
  macros,
  note: null,
};

export const setLog = {
  ...base('set-1'),
  sessionExerciseId: 'se-1',
  plannedSetId: 'ps-1',
  exerciseId: 'chest_press_machine_seated',
  variantKey: 'default',
  contextKey: 'chest_press_machine_seated::default::8-10',
  setNo: 1,
  setType: 'working' as const,
  status: 'done' as const,
  skipReason: null,
  painFlag: false,
  actualWeightKg: 35,
  actualReps: 10,
  actualRir: 2,
  restSec: 120,
  note: null,
  completedAt: NOW,
};

export const metric = {
  ...base('m-1'),
  type: 'waist' as const,
  value: 94,
  unit: 'cm' as const,
  measuredOn: '2026-10-01',
  note: null,
};

export const sessionExercise = {
  ...base('se-1'),
  sessionId: 's-1',
  exerciseId: 'leg_press',
  variantKey: 'default',
  plannedExerciseKey: 'a_leg_press',
  position: 1,
  replacedFromExerciseId: null,
  replacementReason: null,
  status: 'planned' as const,
  skipReason: null,
  note: null,
};

export const plannedExercise = {
  key: 'a_leg_press',
  exerciseId: 'leg_press',
  variantKey: 'default',
  position: 1,
  sets: 3,
  repMin: 10,
  repMax: 12,
  rirAdaptation: { min: 2, max: 3 },
  rirMain: { min: 1, max: 2 },
  restSec: 150,
  startWeightKg: 80,
  progression: { type: 'double' as const, stepKg: 5 },
};

export const programVersion = {
  ...base('v1'),
  programId: 'p1',
  versionNo: 1,
  parentVersionId: null,
  source: 'initial' as const,
  reasonSummary: 'Первая программа',
  effectiveFrom: '2026-10-01',
  nutrition: { ...macros, kcal: 2200, waterMl: 2800 },
  training: {
    workouts: [{ key: 'a', label: 'Тренировка A', focus: ['legs' as const], exercises: [plannedExercise] }],
    rotation: ['a'],
    adaptationWeeks: 3,
    startsOn: '2026-10-01',
  },
};
