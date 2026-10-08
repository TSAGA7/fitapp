import { describe, expect, it } from 'vitest';
import {
  BodyMetric,
  ENTITY_SCHEMAS,
  FoodDefinition,
  FoodLog,
  Profile,
  ProgramVersion,
  Proposal,
  SessionExercise,
  SetLog,
  STORE_NAMES,
  TrainingPlanOp,
  createBase,
  markDeleted,
  touch,
  trainingDays,
} from './index';
import * as fx from './fixtures';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => schema.safeParse(v).success;

describe('registry', () => {
  it('registers every store with a schema', () => {
    expect(STORE_NAMES.length).toBe(26);
    for (const name of STORE_NAMES) expect(ENTITY_SCHEMAS[name]).toBeDefined();
  });
});

describe('entity base helpers', () => {
  it('touch and markDeleted only change timestamps', () => {
    const b = createBase('id-1', fx.NOW, 'd');
    const later = '2026-10-02T08:00:00+02:00';
    expect(touch(b, later)).toEqual({ ...b, updatedAt: later });
    expect(markDeleted(b, later)).toEqual({ ...b, updatedAt: later, deletedAt: later });
  });
});

describe('Profile', () => {
  it('accepts a profile with a weekday training schedule', () => {
    expect(ok(Profile, fx.profile)).toBe(true);
    expect(trainingDays(fx.profile.trainingSchedule)).toEqual(['monday', 'wednesday', 'saturday']);
  });
  it('requires at least one and at most six training days', () => {
    const none = { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false };
    const all = { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true };
    expect(ok(Profile, { ...fx.profile, trainingSchedule: none })).toBe(false);
    expect(ok(Profile, { ...fx.profile, trainingSchedule: all })).toBe(false);
  });
  it('rejects an impossible birth date', () => {
    expect(ok(Profile, { ...fx.profile, birthDate: '1997-02-31' })).toBe(false);
  });
});

describe('BodyMetric', () => {
  it('accepts a matching unit and rejects a wrong one', () => {
    expect(ok(BodyMetric, fx.metric)).toBe(true);
    expect(ok(BodyMetric, { ...fx.metric, unit: 'kg' })).toBe(false);
    expect(ok(BodyMetric, { ...fx.metric, type: 'weight', unit: 'kg', value: 82.5 })).toBe(true);
  });
  it('rejects non-positive values', () => {
    expect(ok(BodyMetric, { ...fx.metric, value: 0 })).toBe(false);
  });
});

describe('FoodDefinition', () => {
  const food = {
    key: 'rice_cooked',
    name: 'Рис варёный',
    brand: null,
    barcode: null,
    category: 'grains' as const,
    basis: 'cooked' as const,
    unit: 'g' as const,
    gramsPerPiece: null,
    per100: fx.macros,
    variantGroup: 'rice',
    yieldFactor: 2.8,
    dataSource: fx.dataSource,
  };
  it('accepts a cooked food with a yield factor and a group', () => {
    expect(ok(FoodDefinition, food)).toBe(true);
  });
  it('rejects a yield factor on a raw food or without a group', () => {
    expect(ok(FoodDefinition, { ...food, basis: 'raw' })).toBe(false);
    expect(ok(FoodDefinition, { ...food, variantGroup: null })).toBe(false);
  });
  it('requires gramsPerPiece for piece units', () => {
    expect(ok(FoodDefinition, { ...food, basis: 'raw', yieldFactor: null, variantGroup: null, unit: 'piece' })).toBe(false);
  });
});

describe('FoodLog (fact)', () => {
  it('keeps the calculation snapshot and accepts a modified entry', () => {
    expect(ok(FoodLog, fx.foodLog)).toBe(true);
  });
  it('a skipped planned item has zero amount and references the plan', () => {
    expect(ok(FoodLog, { ...fx.foodLog, entryType: 'skipped_planned', actualAmountG: 0 })).toBe(true);
    expect(ok(FoodLog, { ...fx.foodLog, entryType: 'skipped_planned', actualAmountG: 50 })).toBe(false);
    expect(ok(FoodLog, { ...fx.foodLog, entryType: 'skipped_planned', actualAmountG: 0, plannedItemId: null })).toBe(false);
  });
  it('an unplanned entry has no plan item', () => {
    expect(ok(FoodLog, { ...fx.foodLog, entryType: 'unplanned', plannedItemId: 'x' })).toBe(false);
    expect(ok(FoodLog, { ...fx.foodLog, entryType: 'unplanned', plannedItemId: null })).toBe(true);
  });
});

describe('SetLog (fact)', () => {
  it('requires RIR for a finished working set', () => {
    expect(ok(SetLog, fx.setLog)).toBe(true);
    expect(ok(SetLog, { ...fx.setLog, actualRir: null })).toBe(false);
    expect(ok(SetLog, { ...fx.setLog, setType: 'warmup', actualRir: null })).toBe(true);
  });
  it('live is the default source, and a live working set still needs RIR', () => {
    const parsed = SetLog.parse(fx.setLog);
    expect(parsed.source).toBe('live');
    expect(ok(SetLog, { ...fx.setLog, source: 'live', actualRir: null })).toBe(false);
  });
  it('an imported working set may have no RIR (it is never invented); other rules still apply', () => {
    const imported = { ...fx.setLog, source: 'import' as const, actualRir: null };
    expect(ok(SetLog, imported)).toBe(true);
    expect(ok(SetLog, { ...imported, actualReps: null })).toBe(false);
    expect(ok(SetLog, { ...imported, source: 'cloud' })).toBe(false);
    expect(ok(SetLog, { ...imported, actualRir: 2 })).toBe(true);
  });
  it('stores RIR 0-4 where 4 means "4 or more"', () => {
    expect(ok(SetLog, { ...fx.setLog, actualRir: 4 })).toBe(true);
    expect(ok(SetLog, { ...fx.setLog, actualRir: 5 })).toBe(false);
    expect(ok(SetLog, { ...fx.setLog, actualRir: -1 })).toBe(false);
  });
  it('a skipped set needs a reason, and "pain" needs the pain flag', () => {
    const skipped = { ...fx.setLog, status: 'skipped' as const, actualReps: null, actualRir: null, actualWeightKg: null, completedAt: null };
    expect(ok(SetLog, skipped)).toBe(false);
    expect(ok(SetLog, { ...skipped, skipReason: 'fatigue' })).toBe(true);
    expect(ok(SetLog, { ...skipped, skipReason: 'pain', painFlag: false })).toBe(false);
    expect(ok(SetLog, { ...skipped, skipReason: 'pain', painFlag: true })).toBe(true);
  });
});

describe('SessionExercise', () => {
  it('a manual replacement needs both the original exercise and a reason', () => {
    expect(ok(SessionExercise, fx.sessionExercise)).toBe(true);
    expect(ok(SessionExercise, { ...fx.sessionExercise, replacedFromExerciseId: 'smith_squat' })).toBe(false);
    expect(
      ok(SessionExercise, { ...fx.sessionExercise, replacedFromExerciseId: 'smith_squat', replacementReason: 'machine_busy' }),
    ).toBe(true);
  });
});

describe('ProgramVersion and proposals', () => {
  it('accepts an immutable snapshot of nutrition and training', () => {
    expect(ok(ProgramVersion, fx.programVersion)).toBe(true);
  });
  it('rejects an inverted RIR range', () => {
    const bad = structuredClone(fx.programVersion);
    bad.training.workouts[0]!.exercises[0]!.rirMain = { min: 3, max: 1 };
    expect(ok(ProgramVersion, bad)).toBe(false);
  });
  it('validates proposal payloads by kind', () => {
    const proposal = {
      ...fx.base('pr-1'),
      source: 'engine',
      baseVersionId: 'v1',
      payload: { kind: 'nutrition_targets', targets: { ...fx.macros, kcal: 2050, waterMl: 2800 } },
      reasonCode: 'weight_flat',
      reasonText: 'Вес не менялся 3 недели → калории −150',
      evidence: { avg7Now: 82.4, avg7Prev: 82.4 },
      validation: { ok: true, issues: [] },
      status: 'draft',
      decidedAt: null,
    };
    expect(ok(Proposal, proposal)).toBe(true);
    expect(ok(Proposal, { ...proposal, payload: { kind: 'nutrition_targets' } })).toBe(false);
    expect(ok(Proposal, { ...proposal, payload: { kind: 'unknown' } })).toBe(false);
  });
  it('models an exercise replacement as a plan operation', () => {
    const op = { op: 'replace_exercise', workoutKey: 'a', plannedExerciseKey: 'a_leg_press', withExerciseId: 'goblet_squat_db', withVariantKey: 'default' };
    expect(ok(TrainingPlanOp, op)).toBe(true);
    expect(ok(TrainingPlanOp, { ...op, withExerciseId: undefined })).toBe(false);
  });
});
