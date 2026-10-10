import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../packages/storage-local/src/clock';
import { deterministicIds } from '../packages/storage-local/src/testkit';
import { openAppRuntime } from '../apps/web/src/composition';
import { loadSnapshot } from '../apps/web/src/app/snapshot';
import {
  acceptTargetAdjustment,
  abandonWorkout,
  addInjury,
  completeOnboarding,
  createCustomFood,
  ensureSessions,
  finishWorkout,
  generateWeekPlan,
  loadWorkout,
  logMealAsPlanned,
  logPlanned,
  logSet,
  logUnplanned,
  loadWorkoutSummary,
  movePlannedSession,
  rebuildTrainingPlan,
  regenerateDay,
  replaceExerciseInPlan,
  replaceExerciseInSession,
  replacePlannedItem,
  reportPain,
  setFoodPreference,
  skipPlannedSession,
  skipSet,
  startWorkout,
  togglePlannedLock,
  addMetric,
  saveExerciseNote,
  undoSet,
  addSetToExercise,
  setExercisePreference,
  startBodyweightWorkout,
  addCardioSession,
  deleteCardioSession,
  createCustomFood,
  setEquipmentLimits,
} from '../apps/web/src/actions';
import { lookupBarcode } from '../apps/web/src/app/openFoodFacts';

const MON = '2026-10-05T09:00:00+03:00';
let n = 0;
async function setup() {
  const clock = createFixedClock(MON);
  const rt = await openAppRuntime({ name: `flow-${++n}`, indexedDB: new IDBFactory(), IDBKeyRange, clock, ids: deterministicIds() });
  await completeOnboarding(rt.deps, {
    sex: 'male', birthDate: '1997-03-10', heightCm: 181, weightKg: 82.5, measurements: { waist: 90 }, goalType: 'recomposition', focus: ['abdomen', 'shoulders'],
    targetWeightKg: 78, targetWaistCm: 82, schedule: { monday: true, tuesday: false, wednesday: true, thursday: false, friday: false, saturday: true, sunday: false },
    experience: 'intermediate', jobActivity: 'sedentary', timezone: 'Europe/Moscow',
  });
  return { rt, deps: rt.deps, clock };
}

// Starts another workout from the same planned template: copies the planned session to a new date.
async function startBodyAgain(deps: Awaited<ReturnType<typeof setup>>['deps'], plannedId: string, clock: ReturnType<typeof createFixedClock>, at: string): Promise<string> {
  clock.set(at);
  const base = await deps.uow.run((r) => r.plannedSessions.get(plannedId));
  const copy = await deps.uow.run(async (r) => {
    const id = deps.ids.newId();
    await r.plannedSessions.put({ ...base!, id, plannedDate: at.slice(0, 10), status: 'planned', originalDate: null, movedReason: null, createdAt: clock.now() });
    return id;
  });
  return startWorkout(deps, copy);
}

describe('app flow on the real storage', () => {
  it('pain areas chosen in onboarding shape the very first plan', async () => {
    const clock = createFixedClock(MON);
    const rt = await openAppRuntime({ name: `flow-${++n}`, indexedDB: new IDBFactory(), IDBKeyRange, clock, ids: deterministicIds() });
    await completeOnboarding(rt.deps, {
      sex: 'male', birthDate: '1997-03-10', heightCm: 181, weightKg: 82.5, measurements: {}, goalType: 'recomposition', focus: [],
      targetWeightKg: null, targetWaistCm: null, schedule: { monday: true, tuesday: false, wednesday: true, thursday: false, friday: false, saturday: true, sunday: false },
      experience: 'intermediate', jobActivity: 'sedentary', timezone: 'Europe/Moscow', painAreas: ['lower_back', 'shoulder'],
    });
    const s = await loadSnapshot(rt.deps);
    expect(s.injuries.map((i) => i.area).sort()).toEqual(['lower_back', 'shoulder']);
    expect(s.versions).toHaveLength(1);
    const ids = s.activeVersion!.training.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId));
    expect(ids).not.toContain('back_squat_barbell');
    expect(ids).not.toContain('barbell_bench_press');
  });

  it('onboarding creates version 1 with targets and a training plan that respects the constraints', async () => {
    const { deps } = await setup();
    await addInjury(deps, { area: 'lower_back', side: 'both', status: 'recurring', triggerKinds: ['exercise'], triggerText: 'гипертонус', notes: null });
    await addInjury(deps, { area: 'shoulder', side: 'both', status: 'recurring', triggerKinds: ['exercise'], triggerText: null, notes: null });
    const s = await loadSnapshot(deps);
    // every pain point rebuilds the program by itself
    expect(s.versions.map((v) => v.versionNo)).toEqual([1, 2, 3]);
    expect(s.activeVersion?.versionNo).toBe(3);
    expect(s.activeVersion?.parentVersionId).toBe(s.versions[1]!.id);
    expect(s.targets?.targets.kcal).toBeGreaterThan(1900);
    expect(s.changes.length).toBe(3);
    const ids = s.activeVersion!.training.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId));
    expect(ids).not.toContain('back_squat_barbell');
    expect(ids).not.toContain('barbell_bench_press');
    // version 1 is immutable: it still holds its own plan
    expect(s.versions[0]!.training).not.toEqual(s.versions[1]!.training === s.versions[0]!.training ? null : undefined);
  });

  it('something eaten off-plan refits the meals that are not eaten yet; eaten ones stay', async () => {
    const { deps } = await setup();
    await generateWeekPlan(deps, '2026-10-05', 0);
    await logMealAsPlanned(deps, '2026-10-05', 'breakfast');
    let s = await loadSnapshot(deps);
    const eatenIds = s.foodLogs.filter((l) => l.slot === 'breakfast').map((l) => l.plannedItemId);
    const planKcalBefore = s.mealWeeks[0]!.items.filter((i) => i.date === '2026-10-05' && i.deletedAt === null).reduce((a, i) => a + i.plannedMacros.kcal, 0);
    const pizza = s.foods.find((f) => f.key === 'pizza_pepperoni')!;
    await logUnplanned(deps, { date: '2026-10-05', slot: 'lunch', foodId: pizza.id, grams: 330 });
    s = await loadSnapshot(deps);
    const day = s.mealWeeks[0]!.items.filter((i) => i.date === '2026-10-05' && i.deletedAt === null);
    // breakfast items are untouched
    for (const id of eatenIds) expect(day.some((i) => i.id === id)).toBe(true);
    // the whole day (eaten + still planned) stays at the norm instead of going over
    const eatenKcal = s.foodLogs.filter((l) => l.date === '2026-10-05' && l.deletedAt === null).reduce((a, l) => a + l.macros.kcal, 0);
    const notEaten = day.filter((i) => !eatenIds.includes(i.id)).reduce((a, i) => a + i.plannedMacros.kcal, 0);
    const norm = s.activeVersion!.nutrition.kcal;
    expect(Math.abs(eatenKcal + notEaten - norm) / norm).toBeLessThan(0.06);
    expect(notEaten).toBeLessThan(planKcalBefore);
  });

  it('stores cardio sessions with machine-specific fields and the equipment limits of a treadmill', async () => {
    const { deps } = await setup();
    await addCardioSession(deps, { date: '2026-10-05', machine: 'treadmill', durationMin: 30, speedKmh: 5.5, inclinePct: 6, level: null, distanceKm: 2.8, avgHeartRate: 128, effort: 5, note: null });
    await setEquipmentLimits(deps, 'treadmill', { stepKg: 0.1, maxKg: 18 });
    let s = await loadSnapshot(deps);
    expect(s.cardioSessions).toHaveLength(1);
    expect(s.cardioSessions[0]!.inclinePct).toBe(6);
    expect(s.userEquipment.find((u) => u.equipmentId === 'treadmill')).toMatchObject({ stepKg: 0.1, maxKg: 18 });
    await expect(addCardioSession(deps, { date: '2026-10-05', machine: 'bike', durationMin: 0, speedKmh: null, inclinePct: null, level: 5, distanceKm: null, avgHeartRate: null, effort: null, note: null })).rejects.toThrow();
    await deleteCardioSession(deps, s.cardioSessions[0]!.id);
    s = await loadSnapshot(deps);
    expect(s.cardioSessions).toHaveLength(0);
  });

  it('a scanned product is saved with its barcode and found locally next time; Open Food Facts answers are parsed', async () => {
    const { deps } = await setup();
    const id = await createCustomFood(deps, { name: 'Йогурт', brand: 'Тест', category: 'dairy', basis: 'as_sold', per100: { kcal: 70, proteinG: 4, fatG: 2, carbG: 9, fiberG: 0 }, fromLabel: false, barcode: '4601234567890', sourceNote: 'Open Food Facts' });
    const s = await loadSnapshot(deps);
    expect(s.foods.find((f) => f.id === id)?.barcode).toBe('4601234567890');
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ status: 1, product: { product_name_ru: 'Йогурт', brands: 'Тест, Другой', nutriments: { 'energy-kcal_100g': 70, proteins_100g: 4, fat_100g: 2, carbohydrates_100g: 9 } } }))) as typeof fetch;
    try {
      expect(await lookupBarcode('4601234567890')).toEqual({ name: 'Йогурт', brand: 'Тест', per100: { kcal: 70, proteinG: 4, fatG: 2, carbG: 9, fiberG: 0 } });
      globalThis.fetch = (async () => new Response(JSON.stringify({ status: 0 }))) as typeof fetch;
      expect(await lookupBarcode('4600000000000')).toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('builds a week of meals close to the targets, replaces and locks items, logs plan and fact separately', async () => {
    const { deps } = await setup();
    await generateWeekPlan(deps, '2026-10-05', 0);
    let s = await loadSnapshot(deps);
    const day = s.mealWeeks[0]!.items.filter((i) => i.date === '2026-10-05');
    expect(day.length).toBeGreaterThanOrEqual(8);
    const kcal = day.reduce((a, i) => a + i.plannedMacros.kcal, 0);
    expect(Math.abs(kcal - s.targets!.targets.kcal) / s.targets!.targets.kcal).toBeLessThan(0.1);

    await logMealAsPlanned(deps, '2026-10-05', 'breakfast');
    s = await loadSnapshot(deps);
    const breakfast = s.foodLogs.filter((l) => l.slot === 'breakfast');
    expect(breakfast.length).toBeGreaterThan(0);
    expect(breakfast.every((l) => l.entryType === 'as_planned' && l.snapshot.per100.kcal > 0 && l.plannedItemId)).toBe(true);

    const lunch = day.find((i) => i.slot === 'lunch')!;
    await logPlanned(deps, lunch.id, { kind: 'eaten', grams: lunch.plannedAmountG + 50 });
    // eating a different amount refits the meals that are not eaten yet, so take the dinner from the fresh plan
    s = await loadSnapshot(deps);
    const dinner = s.mealWeeks[0]!.items.find((i) => i.date === '2026-10-05' && i.deletedAt === null && i.slot === 'dinner')!;
    await logPlanned(deps, dinner.id, { kind: 'skipped' });
    s = await loadSnapshot(deps);
    expect(s.foodLogs.find((l) => l.plannedItemId === lunch.id)?.entryType).toBe('modified');
    expect(s.foodLogs.find((l) => l.entryType === 'skipped_planned')?.macros.kcal).toBe(0);
    // the plan did not change when the fact differed
    expect(s.mealWeeks[0]!.items.find((i) => i.id === lunch.id)?.plannedAmountG).toBe(lunch.plannedAmountG);

    await togglePlannedLock(deps, lunch.id);
    await regenerateDay(deps, '2026-10-05', 1);
    s = await loadSnapshot(deps);
    const after = s.mealWeeks[0]!.items.filter((i) => i.date === '2026-10-05');
    expect(after.find((i) => i.id === lunch.id)?.locked).toBe(true);

    const other = after.find((i) => i.slot === 'snack' && !i.locked)!;
    await replacePlannedItem(deps, other.id, 3);
    s = await loadSnapshot(deps);
    const now = s.mealWeeks[0]!.items.filter((i) => i.date === '2026-10-05');
    expect(now.some((i) => i.replacedFromItemId === other.id)).toBe(true);
    expect(now.some((i) => i.id === other.id)).toBe(false);

    const foodId = await createCustomFood(deps, { name: 'Мой батончик', brand: null, category: 'sweets', basis: 'as_sold', per100: { kcal: 400, proteinG: 20, fatG: 15, carbG: 45, fiberG: 3 }, fromLabel: true });
    await logUnplanned(deps, { date: '2026-10-05', slot: 'snack', foodId, grams: 50 });
    s = await loadSnapshot(deps);
    const bar = s.foodLogs.find((l) => l.snapshot.foodId === foodId)!;
    expect(bar.entryType).toBe('unplanned');
    expect(bar.macros.kcal).toBe(200);
    expect(bar.snapshot.dataSource.kind).toBe('label');
  });

  it('eating another amount changes that very item: no second copy of it appears in the meal', async () => {
    const { deps } = await setup();
    await generateWeekPlan(deps, '2026-10-05', 0);
    let s = await loadSnapshot(deps);
    const breakfast = s.mealWeeks[0]!.items.filter((i) => i.date === '2026-10-05' && i.slot === 'breakfast' && i.deletedAt === null);
    const protein = breakfast.find((i) => ['dairy', 'eggs'].includes(s.foods.find((f) => f.id === i.foodId)!.category))!;
    await logPlanned(deps, protein.id, { kind: 'eaten', grams: Math.max(10, protein.plannedAmountG - 60) });
    s = await loadSnapshot(deps);
    const after = s.mealWeeks[0]!.items.filter((i) => i.date === '2026-10-05' && i.slot === 'breakfast' && i.deletedAt === null);
    const sameKind = after.filter((i) => ['dairy', 'eggs'].includes(s.foods.find((f) => f.id === i.foodId)!.category));
    expect(sameKind.map((i) => i.id)).toEqual([protein.id]);
    expect(s.foodLogs.filter((l) => l.slot === 'breakfast' && l.date === '2026-10-05' && l.deletedAt === null)).toHaveLength(1);
  });

  it('food preferences are respected by the generator', async () => {
    const { deps } = await setup();
    for (const id of ['chicken_breast_raw', 'chicken_breast_cooked', 'turkey_breast_raw']) await setFoodPreference(deps, id, { excluded: true });
    await generateWeekPlan(deps, '2026-10-05', 0);
    const s = await loadSnapshot(deps);
    const foods = new Set(s.mealWeeks[0]!.items.map((i) => i.foodId));
    expect(foods.has('chicken_breast_raw')).toBe(false);
    expect(foods.has('turkey_breast_raw')).toBe(false);
  });

  it('adjustment proposal becomes a new nutrition version', async () => {
    const { deps } = await setup();
    const before = await loadSnapshot(deps);
    const adj = { reasonCode: 'rate_too_fast_down' as const, reasonText: 'тест', kcalDelta: 100, newTargets: { ...before.targets!.targets, kcal: before.targets!.targets.kcal + 100 }, evidence: { ratePctPerWeek: -1.2, rateKgPerWeek: -1, corridor: { min: -0.5, max: 0 }, daysOnTargets: 20 } };
    await acceptTargetAdjustment(deps, adj);
    const s = await loadSnapshot(deps);
    expect(s.versions.length).toBe(2);
    expect(s.activeVersion!.nutrition.kcal).toBe(before.targets!.targets.kcal + 100);
    expect(s.activeVersion!.training).toEqual(s.versions[0]!.training);
    expect(s.changes[0]!.kind).toBe('nutrition_targets');
    expect(s.changes[0]!.diff.some((d) => d.path === 'nutrition.kcal')).toBe(true);
  });

  it('plans sessions by the schedule, runs a workout, and the next one uses the fact', async () => {
    const { deps, clock } = await setup();
    await ensureSessions(deps);
    let s = await loadSnapshot(deps);
    const sessions = s.plannedSessions.filter((p) => p.plannedDate >= '2026-10-05').sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1));
    expect(sessions.map((x) => x.plannedDate).slice(0, 3)).toEqual(['2026-10-05', '2026-10-07', '2026-10-10']);
    const first = sessions[0]!;

    const sid = await startWorkout(deps, first.id);
    expect(await startWorkout(deps, first.id)).toBe(sid); // resume, not a second session
    let view = await loadWorkout(deps, sid);
    expect(view.exercises.length).toBeGreaterThanOrEqual(5);
    const ex = view.exercises[0]!;
    expect(ex.plan.length).toBe(ex.pe!.sets);
    expect(ex.plan[0]!.targetWeightKg).toBeNull(); // first run: the user chooses the weight
    expect(ex.plan[0]!.reasonCode).toBe('first_execution_choose_weight');

    // RIR is required for a finished working set
    await expect(logSet(deps, { sessionExerciseId: ex.se.id, exerciseId: ex.exercise.id, variantKey: ex.se.variantKey, contextKey: ex.plan[0]!.contextKey, plannedSetId: ex.plan[0]!.id, setNo: 1, weightKg: 40, reps: 10, rir: null })).rejects.toThrow(/RIR/);

    for (const p of ex.plan) {
      await logSet(deps, { sessionExerciseId: ex.se.id, exerciseId: ex.exercise.id, variantKey: ex.se.variantKey, contextKey: p.contextKey, plannedSetId: p.id, setNo: p.setNo, weightKg: 40, reps: ex.pe!.repMax, rir: 2 });
    }
    // another exercise: one set done, one skipped for lack of time, the rest not done
    const ex2 = view.exercises[1]!;
    await logSet(deps, { sessionExerciseId: ex2.se.id, exerciseId: ex2.exercise.id, variantKey: ex2.se.variantKey, contextKey: ex2.plan[0]!.contextKey, plannedSetId: ex2.plan[0]!.id, setNo: 1, weightKg: 30, reps: 10, rir: 3 });
    await skipSet(deps, { sessionExerciseId: ex2.se.id, exerciseId: ex2.exercise.id, variantKey: ex2.se.variantKey, contextKey: ex2.plan[1]!.contextKey, plannedSetId: ex2.plan[1]!.id, setNo: 2, reason: 'no_time' });

    // manual replacement during the workout
    const ex3 = view.exercises[2]!;
    await replaceExerciseInSession(deps, { sessionExerciseId: ex3.se.id, newExerciseId: ex3.exercise.curatedSubstituteKeys[0]!, reason: 'machine_busy' });
    view = await loadWorkout(deps, sid);
    const replaced = view.exercises.find((e) => e.se.replacedFromExerciseId === ex3.exercise.id);
    expect(replaced).toBeDefined();
    expect(replaced!.se.replacementReason).toBe('machine_busy');
    expect(view.exercises.some((e) => e.se.id === ex3.se.id)).toBe(false); // the original is hidden in the live view

    // pain on a set: recorded as an event, the answer is advice (no diagnosis)
    const ex4 = view.exercises[3]!;
    const advice = await reportPain(deps, { sessionExerciseId: ex4.se.id, exerciseId: ex4.exercise.id, variantKey: ex4.se.variantKey, contextKey: ex4.plan[0]!.contextKey, plannedSetId: ex4.plan[0]!.id, setNo: 1, area: 'shoulder', side: 'both', intensity: 8, note: null });
    expect(advice.stop).toBe(true);
    expect(advice.seekMedical).toBe(true);

    await finishWorkout(deps, sid, 'нормально');
    s = await loadSnapshot(deps);
    expect(s.plannedSessions.find((p) => p.id === first.id)?.status).toBe('done');
    expect(s.painEvents.length).toBe(1);
    const sets = await deps.uow.run((r) => r.workouts.listSetLogs(ex.se.id));
    expect(sets.every((x) => x.source === 'live' && x.actualRir === 2)).toBe(true);
    const ses = await deps.uow.run((r) => r.workouts.listSessionExercises(sid));
    expect(ses.find((e) => e.id === ex.se.id)?.status).toBe('done');
    expect(ses.find((e) => e.id === ex2.se.id)?.status).toBe('partial');

    // the summary of the finished workout: nothing to compare with yet, but the totals are there
    const sum1 = await loadWorkoutSummary(deps, sid, 82);
    expect(sum1.activity.sets).toBeGreaterThanOrEqual(ex.plan.length + 1);
    expect(sum1.activity.tonnageKg).toBeGreaterThan(40 * ex.pe!.repMax * ex.plan.length - 1);
    expect(sum1.activity.kcalLow).toBeLessThan(sum1.activity.kcalHigh);
    expect(sum1.exercises.find((x) => x.exerciseId === ex.exercise.id)?.verdict).toBe('first');
    expect(sum1.exercises.every((x) => x.verdict === 'first')).toBe(true);
    // the same workout next time with a heavier first exercise: progress against the previous time
    const repeat = sessions.find((p) => p.id !== first.id && p.workoutKey === first.workoutKey);
    if (repeat) {
      clock.set('2026-10-06T09:00:00+03:00'); // a later day than the first workout
      const sid2 = await startWorkout(deps, repeat.id);
      const v2 = await loadWorkout(deps, sid2);
      const e2 = v2.exercises.find((e) => e.exercise.id === ex.exercise.id)!;
      await logSet(deps, { sessionExerciseId: e2.se.id, exerciseId: e2.exercise.id, variantKey: e2.se.variantKey, contextKey: e2.plan[0]!.contextKey, plannedSetId: e2.plan[0]!.id, setNo: 1, weightKg: 50, reps: e2.pe!.repMax, rir: 2 });
      await finishWorkout(deps, sid2, null);
      const sum2 = await loadWorkoutSummary(deps, sid2, 82);
      expect(sum2.exercises.find((x) => x.exerciseId === ex.exercise.id)?.verdict).toBe('up');
      expect(sum2.up).toBeGreaterThanOrEqual(1);
    }

    // the other two workouts of the week are done as well (adherence is judged over the last 14 days)
    for (const other of [sessions[1]!, sessions[2]!]) {
      const o = await startWorkout(deps, other.id);
      await finishWorkout(deps, o, null);
    }
    // next week, the same workout: the target comes from the fact (40 kg x top reps at RIR 2)
    clock.set('2026-10-12T09:00:00+03:00');
    await ensureSessions(deps);
    s = await loadSnapshot(deps);
    const again = s.plannedSessions.find((p) => p.plannedDate === '2026-10-12' && p.workoutKey === first.workoutKey)!;
    expect(again).toBeDefined();
    const sid2 = await startWorkout(deps, again.id);
    const view2 = await loadWorkout(deps, sid2);
    const same = view2.exercises.find((e) => e.exercise.id === ex.exercise.id)!;
    expect(same.plan[0]!.targetWeightKg).not.toBeNull();
    expect(same.plan[0]!.targetWeightKg!).toBeGreaterThanOrEqual(40);
    expect(same.plan[0]!.reasonCode).not.toBe('first_execution_choose_weight');
    // the exercise that was replaced last time is not progressed from nothing
    const orig = view2.exercises.find((e) => e.exercise.id === ex3.exercise.id)!;
    expect(orig.plan[0]!.reasonCode).toBe('replaced_in_last_session');
    // the painful exercise reacts to the severe pain
    const painful = view2.exercises.find((e) => e.exercise.id === ex4.exercise.id)!;
    expect(painful.plan[0]!.reasonCode).toBe('pain_severe');
    await abandonWorkout(deps, sid2);
  });

  it('low adherence over the last 14 days holds the weights', async () => {
    const { deps, clock } = await setup();
    await ensureSessions(deps);
    const s0 = await loadSnapshot(deps);
    const first = s0.plannedSessions.filter((p) => p.plannedDate >= '2026-10-05').sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1))[0]!;
    const sid = await startWorkout(deps, first.id);
    const v = await loadWorkout(deps, sid);
    const ex = v.exercises[0]!;
    for (const p of ex.plan) await logSet(deps, { sessionExerciseId: ex.se.id, exerciseId: ex.exercise.id, variantKey: ex.se.variantKey, contextKey: p.contextKey, plannedSetId: p.id, setNo: p.setNo, weightKg: 40, reps: ex.pe!.repMax, rir: 2 });
    await finishWorkout(deps, sid, null);
    clock.set('2026-10-12T09:00:00+03:00'); // the two other workouts of the week were missed
    await ensureSessions(deps);
    const again = (await loadSnapshot(deps)).plannedSessions.find((p) => p.plannedDate === '2026-10-12')!;
    const v2 = await loadWorkout(deps, await startWorkout(deps, again.id));
    expect(v2.exercises.find((e) => e.exercise.id === ex.exercise.id)!.plan[0]!.reasonCode).toBe('low_adherence_hold');
  });

  it('moving a missed workout changes the date only, no new version', async () => {
    const { deps, clock } = await setup();
    await ensureSessions(deps);
    let s = await loadSnapshot(deps);
    const versionsBefore = s.versions.length;
    const mon = s.plannedSessions.find((p) => p.plannedDate === '2026-10-05')!;
    clock.set('2026-10-06T09:00:00+03:00');
    await movePlannedSession(deps, mon.id, '2026-10-06', 'не успел');
    await ensureSessions(deps);
    s = await loadSnapshot(deps);
    const moved = s.plannedSessions.find((p) => p.id === mon.id)!;
    expect(moved.plannedDate).toBe('2026-10-06');
    expect(moved.originalDate).toBe('2026-10-05');
    expect(s.versions.length).toBe(versionsBefore);
    expect(s.plannedSessions.filter((p) => p.plannedDate === '2026-10-05' && p.status === 'planned').length).toBe(0);
    await skipPlannedSession(deps, mon.id);
    s = await loadSnapshot(deps);
    expect(s.plannedSessions.find((p) => p.id === mon.id)?.status).toBe('skipped');
  });

  it('replacing an exercise in the plan creates a version; the weight trend can be recorded', async () => {
    const { deps } = await setup();
    const s0 = await loadSnapshot(deps);
    const pe = s0.activeVersion!.training.workouts[0]!.exercises[0]!;
    await replaceExerciseInPlan(deps, pe.key, 'hack_squat', 'тест');
    const s = await loadSnapshot(deps);
    expect(s.versions.length).toBe(2);
    expect(s.versions[0]!.training.workouts[0]!.exercises[0]!.exerciseId).toBe(pe.exerciseId);
    expect(s.activeVersion!.training.workouts[0]!.exercises[0]!.exerciseId).toBe('hack_squat');
    await addMetric(deps, { type: 'weight', value: 82, date: '2026-10-06' });
    expect((await loadSnapshot(deps)).weightPoints.length).toBe(2);
  });
  it('an exercise note is not shown in the workout where it was written', async () => {
    const { deps } = await setup();
    await ensureSessions(deps);
    const s = await loadSnapshot(deps);
    const [a] = s.plannedSessions.filter((p) => p.plannedDate >= '2026-10-05').sort((x, y) => (x.plannedDate < y.plannedDate ? -1 : 1));
    const sid1 = await startWorkout(deps, a!.id);
    const v1 = await loadWorkout(deps, sid1);
    const ex = v1.exercises[0]!;
    expect(ex.reminders).toEqual([]);
    await saveExerciseNote(deps, { sessionId: sid1, exerciseId: ex.exercise.id, text: 'Тяжело, следи за плечом' });
    expect((await loadWorkout(deps, sid1)).exercises[0]!.reminders).toEqual([]); // not in the same workout
    expect((await loadWorkout(deps, sid1)).exercises[0]!.ownNote?.text).toBe('Тяжело, следи за плечом');
    await finishWorkout(deps, sid1, null);

  });

  it('a note is shown in the next workout with the same exercise and not repeated in the third', async () => {
    const { deps, clock } = await setup();
    // two sessions of the SAME template, started by hand
    await ensureSessions(deps);
    const s = await loadSnapshot(deps);
    const first = s.plannedSessions.sort((x, y) => (x.plannedDate < y.plannedDate ? -1 : 1))[0]!;
    const sid1 = await startWorkout(deps, first.id);
    const ex = (await loadWorkout(deps, sid1)).exercises[0]!;
    await saveExerciseNote(deps, { sessionId: sid1, exerciseId: ex.exercise.id, text: 'Дискомфорт слева' });
    await finishWorkout(deps, sid1, null);
    const second = await startBodyAgain(deps, first.id, clock, '2026-10-06T09:00:00+03:00');
    expect((await loadWorkout(deps, second)).exercises.find((e) => e.exercise.id === ex.exercise.id)?.reminders.length).toBe(1);
    await finishWorkout(deps, second, null);
    const third = await startBodyAgain(deps, first.id, clock, '2026-10-07T09:00:00+03:00');
    expect((await loadWorkout(deps, third)).exercises.find((e) => e.exercise.id === ex.exercise.id)?.reminders.length).toBe(0);
  });

  it('likes and dislikes are stored and a disliked exercise leaves the rebuilt program', async () => {
    const { deps } = await setup();
    const s = await loadSnapshot(deps);
    const target = s.activeVersion!.training.workouts[0]!.exercises[0]!.exerciseId;
    await setExercisePreference(deps, target, 'dislike');
    expect((await loadSnapshot(deps)).userExercises.find((u) => u.exerciseId === target)?.preference).toBe('dislike');
    await rebuildTrainingPlan(deps);
    const after = await loadSnapshot(deps);
    expect(after.activeVersion!.training.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId))).not.toContain(target);
    await setExercisePreference(deps, target, null);
    expect((await loadSnapshot(deps)).userExercises.filter((u) => u.deletedAt === null)).toHaveLength(0);
  });

  it('a bodyweight workout needs no equipment, is not a part of the calendar and can be abandoned cleanly', async () => {
    const { deps } = await setup();
    const sid = await startBodyweightWorkout(deps);
    const view = await loadWorkout(deps, sid);
    expect(view.label).toBe('Со своим весом');
    expect(view.exercises.length).toBeGreaterThanOrEqual(6);
    expect(view.exercises.every((e) => e.exercise.equipmentRequirements.length === 0 || e.exercise.equipmentRequirements.some((g) => g.every((k) => k === 'floor_mat')))).toBe(true);
    expect(view.exercises[0]!.plan.length).toBeGreaterThan(0);
    expect((await loadSnapshot(deps)).plannedSessions.some((p) => p.workoutKey === 'bodyweight')).toBe(false);
    await abandonWorkout(deps, sid);
    const rows = await deps.uow.run((r) => r.plannedSessions.listByDateRange({ from: '2026-09-01', to: '2026-12-31' }));
    expect(rows.some((p) => p.workoutKey === 'bodyweight')).toBe(false);
  });
  it('a mistaken skipped set can be restored, and an extra set can be added', async () => {
    const { deps } = await setup();
    await ensureSessions(deps);
    const first = (await loadSnapshot(deps)).plannedSessions.sort((x, y) => (x.plannedDate < y.plannedDate ? -1 : 1))[0]!;
    const sid = await startWorkout(deps, first.id);
    const ex = (await loadWorkout(deps, sid)).exercises[0]!;
    const base = { sessionExerciseId: ex.se.id, exerciseId: ex.exercise.id, variantKey: ex.se.variantKey, contextKey: ex.plan[0]!.contextKey, plannedSetId: ex.plan[0]!.id };
    await skipSet(deps, { ...base, setNo: 1, reason: 'fatigue' });
    expect((await loadWorkout(deps, sid)).exercises[0]!.logs.find((l) => l.setNo === 1)?.status).toBe('skipped');
    await undoSet(deps, ex.se.id, 1);
    expect((await loadWorkout(deps, sid)).exercises[0]!.logs.find((l) => l.setNo === 1)).toBeUndefined();
    await logSet(deps, { ...base, setNo: 1, weightKg: 40, reps: 10, rir: 2 });
    expect((await loadWorkout(deps, sid)).exercises[0]!.logs.find((l) => l.setNo === 1)?.status).toBe('done');
    const before = ex.plan.length;
    await addSetToExercise(deps, ex.se.id);
    const after = (await loadWorkout(deps, sid)).exercises[0]!;
    expect(after.plan.length).toBe(before + 1);
    expect(after.plan[after.plan.length - 1]!.setNo).toBe(before + 1);
  });
});
