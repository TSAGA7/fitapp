import type { AppDeps } from '@fitapp/application';
import {
  ageYears,
  assessExercise,
  buildTrainingPlan,
  computeTargets,
  createBase,
  diffNutrition,
  diffTraining,
  suggestTargetAdjustment,
  toWeightPoints,
  trainingDays,
  type Exercise,
  type NutritionTargets,
  type PlanChange,
  type PlanBuildResult,
  type Repositories,
  type TargetAdjustment,
  type TrainingPlanSnapshot,
  type VersionSource,
} from '@fitapp/domain';
import { availableEquipmentKeys } from '../app/derive';

const baseOf = (deps: AppDeps) => createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId);

interface Meta {
  source: VersionSource;
  reasonCode: string;
  reasonText: string;
  evidence?: Record<string, unknown>;
}

/** Every catalog equipment is available by default ("full gym"); the user switches items off in the profile. */
async function ensureUserEquipment(r: Repositories, deps: AppDeps): Promise<void> {
  const have = new Set((await r.userEquipment.listAll()).map((u) => u.equipmentId));
  const missing = (await r.equipment.listAll()).filter((e) => !have.has(e.id));
  if (missing.length > 0) {
    await r.userEquipment.putMany(missing.map((e) => ({ ...baseOf(deps), equipmentId: e.id, available: true, stepKg: null, minKg: null, maxKg: null })));
  }
}

/**
 * Creates the NEXT immutable version of the program (a change never edits a version), records the accepted change
 * with its evidence, and keeps the nutrition target history in step with the versions.
 */
async function writeVersion(r: Repositories, deps: AppDeps, today: string, patch: { nutrition?: NutritionTargets; training?: TrainingPlanSnapshot }, meta: Meta): Promise<string> {
  const program = await r.programs.getProgram();
  const versions = await r.programs.listVersions();
  const active = versions.find((v) => v.id === program?.activeVersionId);
  const nutrition = patch.nutrition ?? active?.nutrition;
  const training = patch.training ?? active?.training;
  if (!nutrition || !training) throw new Error('Для первой версии нужны и питание, и тренировки');
  const versionId = deps.ids.newId();
  const programId = program?.id ?? deps.ids.newId();
  const versionNo = versions.reduce((m, v) => Math.max(m, v.versionNo), 0) + 1;
  await r.programs.addVersion({
    ...createBase(versionId, deps.clock.now(), deps.deviceId),
    programId,
    versionNo,
    parentVersionId: active?.id ?? null,
    source: meta.source,
    reasonSummary: meta.reasonText.slice(0, 500),
    effectiveFrom: today,
    nutrition,
    training,
  });
  await r.programs.saveProgram({ ...(program ?? createBase(programId, deps.clock.now(), deps.deviceId)), activeVersionId: versionId });

  const kind: PlanChange['kind'] = !active ? 'initial' : patch.training ? 'training_plan_edit' : 'nutrition_targets';
  await r.programs.addChange({
    ...baseOf(deps),
    fromVersionId: active?.id ?? null,
    toVersionId: versionId,
    kind,
    reasonCode: meta.reasonCode,
    reasonText: meta.reasonText.slice(0, 500),
    evidence: meta.evidence ?? {},
    diff: [...(patch.nutrition ? diffNutrition(active?.nutrition ?? null, nutrition) : []), ...(patch.training ? diffTraining(active?.training ?? null, training) : [])],
    source: meta.source,
  });

  if (patch.nutrition) {
    const current = await r.nutritionTargets.activeOn(today);
    if (current) {
      if (current.validFrom >= today) await r.nutritionTargets.softDelete(current.id);
      else await r.nutritionTargets.put({ ...current, validTo: previousDay(today) });
    }
    await r.nutritionTargets.put({ ...baseOf(deps), validFrom: today, validTo: null, targets: nutrition, versionId });
  }
  return versionId;
}

function previousDay(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface BuildContext {
  today: string;
  result: PlanBuildResult;
  targets: NutritionTargets;
  notes: string[];
}

async function gather(r: Repositories, deps: AppDeps) {
  const profile = await r.profile.get();
  if (!profile) throw new Error('Сначала заполните профиль');
  const goal = (await r.goals.listAll()).filter((g) => g.status === 'active').sort((a, b) => a.priority - b.priority)[0];
  if (!goal) throw new Error('Сначала выберите цель');
  const weights = toWeightPoints(await r.metrics.listAll());
  const weight = weights[weights.length - 1];
  if (!weight) throw new Error('Сначала запишите вес');
  await ensureUserEquipment(r, deps);
  const equipment = await r.equipment.listAll();
  const userEquipment = await r.userEquipment.listAll();
  const exercises = await r.exercises.listAll();
  const injuries = (await r.injuries.listAll()).filter((i) => i.resolvedOn === null);
  const painEvents = await r.painEvents.listAll();
  const prefs = (await r.userExercises.listAll()).filter((u) => u.deletedAt === null);
  const liked = new Set(prefs.filter((u) => u.preference === 'like').map((u) => u.exerciseId));
  const disliked = new Set(prefs.filter((u) => u.preference === 'dislike').map((u) => u.exerciseId));
  const today = deps.clock.today(profile.timezone);
  const absEvery = (await activeTraining(r))?.absEveryWorkout === true;
  return { profile, goal, weight, equipment, userEquipment, exercises, injuries, painEvents, liked, disliked, today, absEvery };
}

function buildPlan(g: Awaited<ReturnType<typeof gather>>, deps: AppDeps): PlanBuildResult {
  const days = trainingDays(g.profile.trainingSchedule).length;
  return buildTrainingPlan({
    exercises: g.exercises as Exercise[],
    ctx: {
      injuries: g.injuries,
      painEvents: g.painEvents,
      availableEquipment: availableEquipmentKeys(g.equipment, g.userEquipment),
      experience: g.profile.experience,
      now: deps.clock.now(),
      liked: g.liked,
      disliked: g.disliked,
    },
    daysPerWeek: days,
    goal: g.goal.type,
    focus: [...g.goal.focus].sort((a, b) => b.weight - a.weight).map((f) => f.area),
    startsOn: g.today,
    absEveryWorkout: g.absEvery,
  });
}

function buildTargets(g: Awaited<ReturnType<typeof gather>>) {
  return computeTargets({
    sex: g.profile.sex,
    ageYears: ageYears(g.profile.birthDate, g.today),
    heightCm: g.profile.heightCm,
    weightKg: g.weight.kg,
    jobActivity: g.profile.jobActivity,
    trainingsPerWeek: trainingDays(g.profile.trainingSchedule).length,
    goal: g.goal.type,
  });
}

/** First version of the program: daily targets + a weekly training plan built from the profile, goal and constraints. */
export async function createProgram(deps: AppDeps): Promise<void> {
  await deps.uow.run(async (r) => {
    const g = await gather(r, deps);
    if ((await r.programs.getProgram())?.activeVersionId) return;
    const energy = buildTargets(g);
    const plan = buildPlan(g, deps);
    await writeVersion(r, deps, g.today, { nutrition: energy.targets, training: plan.plan }, {
      source: 'initial',
      reasonCode: 'initial',
      reasonText: 'Первая программа по профилю, цели и ограничениям',
      evidence: { weightKg: g.weight.kg, bmr: energy.bmr, tdee: energy.tdee, notes: energy.notes },
    });
  });
}

/** "Переделать программу": rebuilds the training plan for the current injuries, equipment and schedule as a NEW version. */
export async function rebuildTrainingPlan(deps: AppDeps, reason = 'Пересборка по текущим ограничениям, оборудованию и расписанию'): Promise<void> {
  await deps.uow.run(async (r) => {
    const g = await gather(r, deps);
    const plan = buildPlan(g, deps);
    await writeVersion(r, deps, g.today, { training: plan.plan }, { source: 'user', reasonCode: 'rebuild_training', reasonText: reason });
  });
}

const planKey = (t: TrainingPlanSnapshot): string => JSON.stringify(t.workouts.map((w) => [w.key, w.exercises.map((e) => e.exerciseId)]));

async function activeTraining(r: Repositories): Promise<TrainingPlanSnapshot | undefined> {
  const program = await r.programs.getProgram();
  const version = program?.activeVersionId ? await r.programs.getVersion(program.activeVersionId) : undefined;
  return version?.training;
}

/** Rebuilds the program after the constraints changed (pain points, likes), but only if the exercise list really differs. Returns whether a new version was written. */
export async function rebuildTrainingIfChanged(deps: AppDeps, reason: string): Promise<boolean> {
  return deps.uow.run(async (r) => {
    const current = await activeTraining(r);
    if (!current) return false;
    const g = await gather(r, deps);
    const plan = buildPlan(g, deps);
    if (planKey(plan.plan) === planKey(current)) return false;
    await writeVersion(r, deps, g.today, { training: plan.plan }, { source: 'user', reasonCode: 'rebuild_training', reasonText: reason });
    return true;
  });
}

/** After a like/dislike: the program is rebuilt only when it matters (a liked exercise that the pain points had removed, or a disliked one that is in the plan). */
export async function rebuildForPreference(deps: AppDeps, exerciseId: string, preference: 'like' | 'dislike' | null): Promise<boolean> {
  if (preference === null) return false;
  const relevant = await deps.uow.run(async (r) => {
    const current = await activeTraining(r);
    if (!current) return false;
    if (preference === 'dislike') return current.workouts.some((w) => w.exercises.some((e) => e.exerciseId === exerciseId));
    const g = await gather(r, deps);
    const ex = g.exercises.find((e) => e.id === exerciseId);
    if (!ex) return false;
    const without = new Set(g.liked);
    without.delete(exerciseId);
    const a = assessExercise(ex as Exercise, { injuries: g.injuries, painEvents: g.painEvents, availableEquipment: availableEquipmentKeys(g.equipment, g.userEquipment), experience: g.profile.experience, now: deps.clock.now(), liked: without, disliked: g.disliked });
    return a.status === 'avoid';
  });
  if (!relevant) return false;
  return rebuildTrainingIfChanged(deps, preference === 'like' ? 'Упражнение возвращено в программу лайком' : 'Упражнение убрано из программы: не нравится');
}

/** "Add abs to every workout" on/off: writes a new program version. */
export async function setAbsEveryWorkout(deps: AppDeps, on: boolean): Promise<void> {
  await deps.uow.run(async (r) => {
    const g = await gather(r, deps);
    const plan = buildPlan({ ...g, absEvery: on }, deps);
    await writeVersion(r, deps, g.today, { training: plan.plan }, { source: 'user', reasonCode: 'abs_every_workout', reasonText: on ? 'Пресс добавлен в каждую тренировку' : 'Пресс больше не добавляется в каждую тренировку' });
  });
}

/** The user types the daily norm by hand (for example dictated by a coach): a new program version, water and fibre are kept. */
export async function setManualNutrition(deps: AppDeps, v: { kcal: number; proteinG: number; fatG: number; carbG: number }): Promise<void> {
  await deps.uow.run(async (r) => {
    const profile = await r.profile.get();
    const today = deps.clock.today(profile?.timezone ?? 'UTC');
    const program = await r.programs.getProgram();
    const active = program?.activeVersionId ? await r.programs.getVersion(program.activeVersionId) : undefined;
    const base = active?.nutrition ?? (await r.nutritionTargets.activeOn(today))?.targets;
    if (!base) throw new Error('Сначала создайте программу');
    const next = { ...base, kcal: Math.round(v.kcal), proteinG: Math.round(v.proteinG), fatG: Math.round(v.fatG), carbG: Math.round(v.carbG) };
    await writeVersion(r, deps, today, { nutrition: next }, { source: 'user', reasonCode: 'manual_targets', reasonText: `Норма задана вручную: ${next.kcal} ккал, Б ${next.proteinG} / Ж ${next.fatG} / У ${next.carbG}` });
  });
}

/** Recalculates daily targets from the latest weight and activity as a NEW version. */
export async function recalculateTargets(deps: AppDeps): Promise<void> {
  await deps.uow.run(async (r) => {
    const g = await gather(r, deps);
    const energy = buildTargets(g);
    await writeVersion(r, deps, g.today, { nutrition: energy.targets }, {
      source: 'user',
      reasonCode: 'recalculate_targets',
      reasonText: `Пересчёт нормы по весу ${g.weight.kg.toString().replace('.', ',')} кг`,
      evidence: { weightKg: g.weight.kg, bmr: energy.bmr, tdee: energy.tdee },
    });
  });
}

/** The user accepts the engine's proposal to change calories after looking at the real weight trend. */
export async function acceptTargetAdjustment(deps: AppDeps, adj: TargetAdjustment): Promise<void> {
  await deps.uow.run(async (r) => {
    const profile = await r.profile.get();
    const today = deps.clock.today(profile?.timezone ?? 'UTC');
    await writeVersion(r, deps, today, { nutrition: adj.newTargets }, { source: 'engine', reasonCode: adj.reasonCode, reasonText: adj.reasonText, evidence: adj.evidence });
  });
}

/** Replaces an exercise in the plan for good (a new version). During a workout a replacement is only for that session. */
export async function replaceExerciseInPlan(deps: AppDeps, plannedKey: string, newExerciseId: string, reason: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const profile = await r.profile.get();
    const today = deps.clock.today(profile?.timezone ?? 'UTC');
    const program = await r.programs.getProgram();
    const active = program?.activeVersionId ? await r.programs.getVersion(program.activeVersionId) : undefined;
    if (!active) throw new Error('Программы ещё нет');
    const ex = await r.exercises.get(newExerciseId);
    if (!ex) throw new Error('Упражнение не найдено');
    const training: TrainingPlanSnapshot = structuredClone(active.training);
    let found = false;
    for (const w of training.workouts) {
      const pe = w.exercises.find((e) => e.key === plannedKey);
      if (!pe) continue;
      pe.exerciseId = ex.id;
      pe.variantKey = 'default';
      pe.repMin = ex.defaultRepRange.min;
      pe.repMax = ex.defaultRepRange.max;
      pe.restSec = ex.defaultRestSec;
      pe.progression = { type: ex.progressionType, stepKg: null };
      pe.startWeightKg = null;
      found = true;
    }
    if (!found) throw new Error('Упражнения нет в программе');
    await writeVersion(r, deps, today, { training }, { source: 'user', reasonCode: 'replace_exercise', reasonText: reason || `Замена упражнения на «${ex.name}»` });
  });
}

/** Weight trend check: the engine's proposal, or null when nothing should change. */
export { suggestTargetAdjustment };
