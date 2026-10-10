import { describe, expect, it } from 'vitest';
import { loadSeedCatalog } from '../../../../seed/src';
const rawSeedCatalog = loadSeedCatalog();
import { createBase, type Exercise, type TrainingSchedule } from '../../model';
import { buildTrainingPlan } from './planner';
import { assessExercise, equipmentAvailable, rankSubstitutes, type SafetyContext } from './safety';
import { scheduleWindow, suggestMoveDate, workoutKeyForDate } from './week';

const NOW = '2026-10-08T10:00:00+03:00';
const catalog: Exercise[] = rawSeedCatalog.exercises.map((d) => ({ ...createBase(d.key, NOW, 'dev'), ...d, origin: 'seed' as const }));
const byKey = (k: string) => catalog.find((e) => e.key === k) as Exercise;
const allEquipment = new Set(rawSeedCatalog.equipment.map((e) => e.key));
const ctx = (over: Partial<SafetyContext> = {}): SafetyContext => ({
  injuries: [{ area: 'lower_back', status: 'recurring' }, { area: 'shoulder', status: 'recurring' }],
  painEvents: [],
  availableEquipment: allEquipment,
  experience: 'intermediate',
  now: NOW,
  ...over,
});
const sched = (days: string[]): TrainingSchedule => ({ monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false, ...Object.fromEntries(days.map((d) => [d, true])) }) as TrainingSchedule;

describe('catalog', () => {
  it('has at least 80 exercises, all with curated substitutes', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(80);
    expect(catalog.filter((e) => e.curatedSubstituteKeys.length === 0)).toEqual([]);
  });
});

describe('exercise safety', () => {
  it('marks heavy spine and shoulder lifts as not recommended for a sensitive back and shoulder', () => {
    for (const k of ['back_squat_barbell', 'conventional_deadlift', 'barbell_bench_press', 'ohp_barbell', 'barbell_row']) {
      expect(assessExercise(byKey(k), ctx()).status, k).toBe('avoid');
    }
  });
  it('keeps machines and supported variants recommended', () => {
    for (const k of ['leg_press', 'chest_press_machine_seated', 'lat_pulldown_neutral', 'cable_row_neutral', 'chest_supported_row_machine']) {
      expect(['recommended', 'caution'], k).toContain(assessExercise(byKey(k), ctx()).status);
    }
  });
  it('without constraints a barbell lift is not "avoid"', () => {
    expect(assessExercise(byKey('barbell_bench_press'), ctx({ injuries: [] })).status).not.toBe('avoid');
  });
  it('reports missing equipment', () => {
    const have = new Set(['dumbbells']);
    expect(equipmentAvailable(byKey('leg_press'), have)).toBe(false);
    expect(assessExercise(byKey('leg_press'), ctx({ availableEquipment: have })).status).toBe('unavailable');
  });
  it('a recent severe pain event turns an exercise to avoid, an older one does not', () => {
    const recent = { exerciseId: 'leg_press', occurredAt: '2026-10-01T10:00:00+03:00', intensity: 8, area: 'knee' as const };
    expect(assessExercise(byKey('leg_press'), ctx({ injuries: [], painEvents: [recent] })).status).toBe('avoid');
    const old = { ...recent, occurredAt: '2026-08-01T10:00:00+03:00' };
    expect(assessExercise(byKey('leg_press'), ctx({ injuries: [], painEvents: [old] })).status).toBe('recommended');
  });
  it('ranks curated, allowed substitutes first and never offers an avoided or unavailable one', () => {
    const subs = rankSubstitutes(byKey('chest_press_machine_seated'), catalog, ctx());
    expect(subs.length).toBeGreaterThan(2);
    expect(subs[0]!.curated).toBe(true);
    expect(subs.map((s) => s.exercise.key)).not.toContain('barbell_bench_press');
    const none = rankSubstitutes(byKey('leg_press'), catalog, ctx({ availableEquipment: new Set(['dumbbells']) }));
    for (const s of none) expect(s.assessment.status).not.toBe('unavailable');
  });
});

describe('training plan', () => {
  const build = (days: number, over: Partial<Parameters<typeof buildTrainingPlan>[0]> = {}) =>
    buildTrainingPlan({ exercises: catalog, ctx: ctx(), daysPerWeek: days, goal: 'recomposition', focus: ['abdomen', 'shoulders'], startsOn: '2026-10-12', ...over });

  it('builds a workout per rotation slot for every day count', () => {
    for (let d = 1; d <= 6; d++) {
      const r = build(d);
      expect(r.plan.workouts.length).toBe(d);
      expect(r.plan.rotation.length).toBe(d);
      for (const w of r.plan.workouts) {
        expect(w.exercises.length).toBeGreaterThanOrEqual(4);
        expect(w.exercises.length).toBeLessThanOrEqual(9);
      }
    }
  });
  it('is deterministic', () => {
    expect(build(3)).toEqual(build(3));
  });
  it('does not put an avoided exercise into the plan and explains the exclusions', () => {
    const r = build(3);
    const used = new Set(r.plan.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)));
    expect(used.has('back_squat_barbell')).toBe(false);
    expect(used.has('conventional_deadlift')).toBe(false);
    expect(used.has('barbell_bench_press')).toBe(false);
    const row = r.excluded.find((x) => x.exercise.key === 'barbell_bench_press');
    expect(row).toBeDefined();
    expect(row!.reasons.length).toBeGreaterThan(0);
    expect(row!.replacement).not.toBeNull();
  });
  it('uses only available equipment', () => {
    const have = new Set(['dumbbells', 'adjustable_bench', 'flat_bench', 'single_cable', 'pullup_bar']);
    const r = build(3, { ctx: ctx({ availableEquipment: have }) });
    for (const w of r.plan.workouts) for (const e of w.exercises) expect(equipmentAvailable(byKey(e.exerciseId), have), e.exerciseId).toBe(true);
  });
  it('adaptation RIR is 2-3 and careful lifts keep 2-3 in the main phase', () => {
    const r = build(3);
    for (const w of r.plan.workouts) for (const e of w.exercises) {
      expect(e.rirAdaptation).toEqual({ min: 2, max: 3 });
      expect(e.rirMain.min).toBeGreaterThanOrEqual(1);
    }
    expect(r.plan.adaptationWeeks).toBeGreaterThanOrEqual(3);
  });
  it('adds focus accessories (core for the abdomen focus)', () => {
    const r = build(3, { focus: ['abdomen'] });
    const core = r.plan.workouts.flatMap((w) => w.exercises).filter((e) => byKey(e.exerciseId).movementPattern.startsWith('core'));
    expect(core.length).toBeGreaterThanOrEqual(2);
  });
  it('gives a reason for every exercise', () => {
    const r = build(4);
    for (const w of r.plan.workouts) for (const e of w.exercises) expect(r.rationale[e.key]).toBeTruthy();
  });
  it('plan passes the ProgramVersion schema parts (keys are valid)', () => {
    const r = build(5);
    for (const w of r.plan.workouts) {
      expect(w.key).toMatch(/^[a-z0-9_]+$/);
      for (const e of w.exercises) expect(e.key).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe('week schedule', () => {
  const plan = { rotation: ['a', 'b', 'c'], startsOn: '2026-10-05' };
  const s = sched(['monday', 'wednesday', 'saturday']);
  it('rotates workouts over training days since the start', () => {
    expect(workoutKeyForDate(plan, s, '2026-10-05')).toBe('a');
    expect(workoutKeyForDate(plan, s, '2026-10-07')).toBe('b');
    expect(workoutKeyForDate(plan, s, '2026-10-10')).toBe('c');
    expect(workoutKeyForDate(plan, s, '2026-10-12')).toBe('a');
    expect(workoutKeyForDate(plan, s, '2026-10-06')).toBeNull();
    expect(workoutKeyForDate(plan, s, '2026-10-02')).toBeNull();
  });
  it('lists a window', () => {
    expect(scheduleWindow(plan, s, '2026-10-05', 7).map((x) => x.workoutKey)).toEqual(['a', 'b', 'c']);
  });
  it('suggests a free day to move a missed workout', () => {
    expect(suggestMoveDate('2026-10-05', s, new Set(['2026-10-07']), '2026-10-06')).toBe('2026-10-06');
    expect(suggestMoveDate('2026-10-05', s, new Set(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']), '2026-10-06')).toBeNull();
  });
});

import { diffNutrition, diffTraining, inAdaptation } from './diff';
describe('diff', () => {
  const a = buildTrainingPlan({ exercises: catalog, ctx: ctx(), daysPerWeek: 3, goal: 'recomposition', focus: [], startsOn: '2026-10-12' }).plan;
  it('is empty for equal plans and lists a swapped exercise', () => {
    expect(diffTraining(a, a)).toEqual([]);
    const b = structuredClone(a);
    b.workouts[0]!.exercises[0]!.exerciseId = 'hack_squat';
    b.workouts[0]!.exercises[1]!.sets = 4;
    const d = diffTraining(a, b);
    expect(d.map((x) => x.path.split('.').pop())).toEqual(['exerciseId', 'sets']);
  });
  it('lists changed nutrition numbers only', () => {
    const t = { kcal: 2000, proteinG: 150, fatG: 70, carbG: 200, fiberG: 28, waterMl: 2500 };
    expect(diffNutrition(t, { ...t, kcal: 2100, carbG: 225 }).map((x) => x.path)).toEqual(['nutrition.kcal', 'nutrition.carbG']);
  });
  it('knows the adaptation window', () => {
    expect(inAdaptation({ adaptationWeeks: 3, startsOn: '2026-10-12' }, '2026-10-30')).toBe(true);
    expect(inAdaptation({ adaptationWeeks: 3, startsOn: '2026-10-12' }, '2026-11-02')).toBe(false);
  });
});

import { adviseOnPain } from './pain';
describe('pain advice', () => {
  const now = '2026-10-08T10:00:00+03:00';
  it('always stops; strong pain and repeated pain suggest a doctor', () => {
    const first = adviseOnPain({ area: 'shoulder', intensity: 3, now, history: [], exerciseId: 'x' });
    expect(first.stop).toBe(true);
    expect(first.seekMedical).toBe(false);
    expect(adviseOnPain({ area: 'shoulder', intensity: 8, now, history: [], exerciseId: 'x' }).seekMedical).toBe(true);
    const hist = [{ occurredAt: '2026-10-01T10:00:00+03:00', area: 'shoulder' as const, exerciseId: 'x', intensity: 3 }, { occurredAt: '2026-10-05T10:00:00+03:00', area: 'shoulder' as const, exerciseId: 'x', intensity: 2 }];
    expect(adviseOnPain({ area: 'shoulder', intensity: 2, now, history: hist, exerciseId: 'x' }).seekMedical).toBe(true);
    expect(adviseOnPain({ area: 'knee', intensity: 2, now, history: hist, exerciseId: 'y' }).seekMedical).toBe(false);
  });
});

import { buildBodyweightWorkout, isBodyweightOnly } from './bodyweight';
import { REST_FINISH_MESSAGE, REST_PHRASES, restCue, suggestRestSeconds, type RestInput } from './rest';

describe('likes and dislikes', () => {
  it('a disliked exercise is not chosen by the planner and ranks last among substitutes', () => {
    const base = buildTrainingPlan({ exercises: catalog, ctx: ctx(), daysPerWeek: 3, goal: 'fat_loss', focus: [], startsOn: '2026-10-08' });
    const firstId = base.plan.workouts[0]?.exercises[0]?.exerciseId as string;
    const again = buildTrainingPlan({ exercises: catalog, ctx: ctx({ disliked: new Set([firstId]) }), daysPerWeek: 3, goal: 'fat_loss', focus: [], startsOn: '2026-10-08' });
    expect(again.plan.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId))).not.toContain(firstId);
  });
  it('a liked substitute is ranked above an equal one', () => {
    const original = byKey('hack_squat');
    const plain = rankSubstitutes(original, catalog, ctx(), 20);
    const target = plain[plain.length - 1] as (typeof plain)[number];
    const boosted = rankSubstitutes(original, catalog, ctx({ liked: new Set([target.exercise.id]) }), 20);
    expect(boosted.findIndex((x) => x.exercise.id === target.exercise.id)).toBeLessThan(plain.length - 1);
  });
});

describe('vacuum and breathing in the plan', () => {
  const plan = (goal: 'fat_loss' | 'muscle_gain', focus: ('abdomen' | 'legs')[]) => buildTrainingPlan({ exercises: catalog, ctx: ctx(), daysPerWeek: 3, goal, focus, startsOn: '2026-10-08' });
  it('fat loss with abdomen focus: each workout starts with a transversus activation', () => {
    const r = plan('fat_loss', ['abdomen']);
    for (const w of r.plan.workouts) {
      const first = catalog.find((e) => e.id === w.exercises[0]?.exerciseId) as Exercise;
      expect(['vacuum_standing', 'vacuum_lying', 'breathing_90_90'], w.key).toContain(first.key);
      expect(w.exercises[0]?.progression.type).toBe('time');
    }
    expect(r.notes.join(' ')).toContain('поперечной');
  });
  it('other goals and ordinary core slots never get vacuum exercises', () => {
    const r = plan('muscle_gain', ['abdomen']);
    const keys = r.plan.workouts.flatMap((w) => w.exercises.map((e) => catalog.find((c) => c.id === e.exerciseId)?.key as string));
    expect(keys.some((k) => k.startsWith('vacuum') || k === 'breathing_90_90')).toBe(false);
    const fat = plan('fat_loss', ['legs']);
    expect(fat.plan.workouts.flatMap((w) => w.exercises.map((e) => catalog.find((c) => c.id === e.exerciseId)?.key as string)).some((k) => k.startsWith('vacuum'))).toBe(false);
  });
});

describe('bodyweight workout', () => {
  it('uses no equipment, includes a squat, a push and core work, and respects dislikes', () => {
    const w = buildBodyweightWorkout({ exercises: catalog, ctx: ctx({ availableEquipment: new Set() }) });
    const items = w.exercises.map((e) => catalog.find((c) => c.id === e.exerciseId) as Exercise);
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every((e) => isBodyweightOnly(e))).toBe(true);
    expect(items.map((e) => e.movementPattern)).toEqual(expect.arrayContaining(['squat', 'horizontal_push', 'core_antiextension']));
    const noSquat = buildBodyweightWorkout({ exercises: catalog, ctx: ctx({ disliked: new Set(['bodyweight_squat']) }) });
    expect(noSquat.exercises.map((e) => e.exerciseId)).not.toContain('bodyweight_squat');
  });
});

describe('rest suggestion', () => {
  const input = (over: Partial<RestInput> = {}): RestInput => ({ baseSec: 120, isCompound: true, light: false, setNo: 1, reps: 10, rir: 2, repMin: 8, targetRir: { min: 2, max: 3 }, daysSinceLast: 4, trend: null, ...over });
  it('keeps the program rest for an ordinary set', () => expect(suggestRestSeconds(input())).toMatchObject({ seconds: 120, reason: 'по программе' }));
  it('a hard set and a long break lengthen the rest, good dynamics shorten it', () => {
    expect(suggestRestSeconds(input({ rir: 0 })).seconds).toBeGreaterThan(120);
    expect(suggestRestSeconds(input({ daysSinceLast: 60 })).seconds).toBeGreaterThan(suggestRestSeconds(input({ daysSinceLast: 25 })).seconds);
    expect(suggestRestSeconds(input({ trend: 'up' })).seconds).toBeLessThan(120);
    expect(suggestRestSeconds(input({ rir: 5 })).seconds).toBeLessThan(120);
  });
  it('is rounded to 5 s and clamped; light work stays short', () => {
    const a = suggestRestSeconds(input({ baseSec: 600, rir: 0, daysSinceLast: 90, setNo: 4 }));
    expect(a.seconds).toBe(300);
    expect(suggestRestSeconds(input({ baseSec: 90, light: true, isCompound: false })).seconds).toBeLessThanOrEqual(60);
    expect(suggestRestSeconds(input({ baseSec: 137 })).seconds % 5).toBe(0);
  });
  it('cues: 7 s, 5 s, last second', () => {
    expect(restCue(30)).toBeNull();
    expect(restCue(7)).toBe('Настраивайся на следующий подход');
    expect(restCue(6)).toBe('Настраивайся на следующий подход');
    expect(restCue(5)).toBe('Сделай глубокий вдох и выдох');
    expect(restCue(2)).toBe('Сделай глубокий вдох и выдох');
    expect(REST_PHRASES).toContain(restCue(1, () => 0.5) as never);
    expect(restCue(0, () => 0)).toBe(REST_PHRASES[0]);
    expect(REST_PHRASES).toHaveLength(11);
    expect(REST_FINISH_MESSAGE).toBe('Ты просто босс! Ты просто начальник!');
  });
});

describe('abs in every workout and likes', () => {
  const input = { exercises: catalog, ctx: ctx(), daysPerWeek: 3, goal: 'recomposition' as const, focus: [] as never[], startsOn: '2026-10-08' };
  const coreCount = (w: { exercises: { exerciseId: string }[] }) => w.exercises.filter((e) => catalog.find((c) => c.id === e.exerciseId)?.movementPattern.startsWith('core_')).length;
  it('adds up to two core exercises to every workout when asked, for any goal', () => {
    const plain = buildTrainingPlan(input).plan;
    const withAbs = buildTrainingPlan({ ...input, absEveryWorkout: true }).plan;
    expect(withAbs.absEveryWorkout).toBe(true);
    expect(plain.absEveryWorkout).toBeUndefined();
    for (const w of withAbs.workouts) expect(coreCount(w)).toBeGreaterThanOrEqual(2);
    expect(withAbs.workouts.reduce((a, w) => a + coreCount(w), 0)).toBeGreaterThan(plain.workouts.reduce((a, w) => a + coreCount(w), 0));
  });
  it('puts one timed cardio exercise at the end of every workout when asked', () => {
    const plan = buildTrainingPlan({ ...input, cardioEveryWorkout: true }).plan;
    expect(plan.cardioEveryWorkout).toBe(true);
    for (const w of plan.workouts) {
      const last = w.exercises[w.exercises.length - 1];
      const ex = catalog.find((c) => c.id === last?.exerciseId);
      expect(['incline_walk', 'bike_steady']).toContain(ex?.key);
      expect(last?.sets).toBe(1);
    }
    expect(buildTrainingPlan(input).plan.cardioEveryWorkout).toBeUndefined();
  });
  it('a liked exercise that the pain points removed can come back', () => {
    const idsOf = (liked?: Set<string>) => buildTrainingPlan({ ...input, ctx: ctx({ liked }) }).plan.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId));
    const base = new Set(idsOf());
    const removed = catalog.filter((e) => e.isCompound && assessExercise(e, ctx()).status === 'avoid');
    expect(removed.length).toBeGreaterThan(0);
    const comeBack = removed.filter((e) => !base.has(e.id) && idsOf(new Set([e.id])).includes(e.id));
    expect(comeBack.length).toBeGreaterThan(0);
  });
});

import { compareProgress, estimateWorkout, sessionElapsedSec, summarizeWorkout } from './activity';

describe('workout activity', () => {
  const squat = { compound: true, timed: false, sets: [{ weightKg: 80, reps: 10 }, { weightKg: 80, reps: 10 }, { weightKg: 80, reps: 8 }] };
  const curl = { compound: false, timed: false, sets: [{ weightKg: 15, reps: 12 }, { weightKg: 15, reps: 10 }] };
  it('estimates active kcal as a range around a believable value and counts tonnage', () => {
    const e = estimateWorkout({ bodyWeightKg: 82, exercises: [squat, curl], elapsedSec: 45 * 60 });
    expect(e.tonnageKg).toBe(80 * 28 + 15 * 22);
    expect(e.sets).toBe(5);
    expect(e.kcalMid).toBeGreaterThan(100);
    expect(e.kcalMid).toBeLessThan(300);
    expect(e.kcalLow).toBeLessThan(e.kcalMid);
    expect(e.kcalHigh).toBeGreaterThan(e.kcalMid);
    expect(e.kcalHigh / e.kcalLow).toBeGreaterThan(1.5);
    expect(e.workSec + e.restSec).toBe(e.elapsedSec);
  });
  it('more work and a heavier body give more kcal; a longer rest adds only a little', () => {
    const base = estimateWorkout({ bodyWeightKg: 70, exercises: [squat], elapsedSec: 1800 }).kcalMid;
    expect(estimateWorkout({ bodyWeightKg: 90, exercises: [squat], elapsedSec: 1800 }).kcalMid).toBeGreaterThan(base);
    expect(estimateWorkout({ bodyWeightKg: 70, exercises: [squat, curl], elapsedSec: 1800 }).kcalMid).toBeGreaterThan(base);
    expect(estimateWorkout({ bodyWeightKg: 70, exercises: [squat], elapsedSec: 3600 }).kcalMid - base).toBeLessThan(base);
  });
  it('treats timed work as seconds and never counts its tonnage', () => {
    const e = estimateWorkout({ bodyWeightKg: 80, exercises: [{ compound: false, timed: true, sets: [{ weightKg: null, reps: 30 }, { weightKg: null, reps: 30 }] }], elapsedSec: 0 });
    expect(e.workSec).toBe(60);
    expect(e.tonnageKg).toBe(0);
  });
  it('a forgotten open app and a long break do not inflate the time', () => {
    const start = Date.parse('2026-10-10T10:00:00Z');
    const min = 60_000;
    const done = [start + 10 * min, start + 14 * min, start + 17 * min];
    // lead-in capped at 3 min, gaps as they were, then 5 minutes of rest allowed while live
    expect(sessionElapsedSec({ startedAtMs: start, completedAtMs: done, endedAtMs: null, nowMs: start + 5 * 3600_000 })).toBe((3 + 4 + 3 + 5) * 60);
    expect(sessionElapsedSec({ startedAtMs: start, completedAtMs: done, endedAtMs: start + 3 * 3600_000, nowMs: start + 4 * 3600_000 })).toBe((3 + 4 + 3 + 2) * 60);
    // a break of an hour between two sets counts as 8 minutes
    expect(sessionElapsedSec({ startedAtMs: start, completedAtMs: [start + min, start + 61 * min], endedAtMs: start + 62 * min, nowMs: start + 62 * min })).toBe((1 + 8 + 1) * 60);
    expect(sessionElapsedSec({ startedAtMs: start, completedAtMs: [], endedAtMs: null, nowMs: start + 90_000 })).toBe(90);
    expect(sessionElapsedSec({ startedAtMs: start, completedAtMs: [], endedAtMs: null, nowMs: start + 3 * 3600_000 })).toBe(180);
  });
  it('compares with the previous time: up, down, same, first', () => {
    expect(compareProgress({ weightKg: 62.5, reps: 8 }, { weightKg: 60, reps: 8 })?.verdict).toBe('up');
    expect(compareProgress({ weightKg: 57.5, reps: 8 }, { weightKg: 60, reps: 8 })?.verdict).toBe('down');
    expect(compareProgress({ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 })?.verdict).toBe('same');
    expect(compareProgress({ weightKg: 60, reps: 8 }, null)?.verdict).toBe('first');
    expect(compareProgress({ weightKg: null, reps: 14 }, { weightKg: null, reps: 12 })?.verdict).toBe('up');
    expect(compareProgress(null, null)).toBeNull();
    // the same weight with more reps is progress too
    expect(compareProgress({ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 8 })?.verdict).toBe('up');
  });
  it('summarises a workout: verdict per exercise, counts, skips exercises without sets', () => {
    const s = summarizeWorkout({
      bodyWeightKg: 82,
      elapsedSec: 3000,
      exercises: [
        { ...squat, exerciseId: 'a', name: 'Присед', previousBest: { weightKg: 75, reps: 10 } },
        { ...curl, exerciseId: 'b', name: 'Бицепс', previousBest: { weightKg: 17.5, reps: 12 } },
        { compound: false, timed: false, sets: [], exerciseId: 'c', name: 'Пропущено', previousBest: null },
        { compound: true, timed: false, sets: [{ weightKg: 40, reps: 10 }], exerciseId: 'd', name: 'Новое', previousBest: null },
      ],
    });
    expect(s.exercises.map((x) => [x.name, x.verdict])).toEqual([['Присед', 'up'], ['Бицепс', 'down'], ['Новое', 'first']]);
    expect([s.up, s.down, s.same, s.first]).toEqual([1, 1, 0, 1]);
  });
});
