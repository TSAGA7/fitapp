import type { AppDeps } from '@fitapp/application';
import {
  addDays,
  analyzeWeight,
  strengthByExercise,
  muscleVolume,
  type MuscleVolume,
  toLocalDate,
  toMetricSeries,
  toWeightPoints,
  startOfWeek,
  type BodyMetric,
  type Equipment,
  type Feeling,
  type Symptom,
  type Exercise,
  type ExerciseStrength,
  type Food,
  type FoodLog,
  type Goal,
  type Injury,
  type MealPlan,
  type MealTemplate,
  type CustomWorkout,
  customWorkoutIdOf,
  autoWorkoutName,
  isAdHocWorkoutKey,
  isCustomWorkoutKey,
  type NutritionTargetsRecord,
  type PainEvent,
  type PlanChange,
  type PlannedItem,
  type PlannedSession,
  type Program,
  type ProgramVersion,
  type UserEquipment,
  type UserFood,
  type UserExercise,
  type CardioSession,
  type ExerciseNote,
  type WorkoutSession,
  type LocalDate,
  type MetricPoint,
  type MetricType,
  type OwnSchedule,
  type Profile,
  type StrengthRow,
  type WeightPoint,
  type WeightTrend,
} from '@fitapp/domain';

export interface WorkoutSummary {
  id: string;
  date: LocalDate;
  exercises: number;
  sets: number;
  names: string[];
  note: string | null;
  /** Only a finished workout counts as "worked out today". */
  completed: boolean;
  /** Sum of weight x reps of the done working sets, kg. */
  tonnageKg: number;
  /** Name of the own workout it was (from «Свои тренировки»), otherwise null. */
  title: string | null;
  /** The saved own workout it was started from, if it still exists. */
  customWorkoutId: string | null;
  /** Started and not finished yet. */
  inProgress: boolean;
}
export interface FoodDay {
  date: LocalDate;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
}

/** Everything the screens show, read in one pass and prepared by the domain analysis functions. */
export interface Snapshot {
  today: LocalDate;
  timezone: string;
  profile: Profile | undefined;
  goals: Goal[];
  primaryGoal: Goal | undefined;
  metrics: BodyMetric[];
  weightPoints: WeightPoint[];
  weight: WeightTrend;
  series: Partial<Record<MetricType, MetricPoint[]>>;
  strength: ExerciseStrength[];
  /** Sets per muscle over the last 7 days and the 7 before. */
  muscleVolume: MuscleVolume[];
  exerciseNames: Record<string, string>;
  workouts: WorkoutSummary[];
  foodDays: FoodDay[];
  waterMl: number;
  /** How the body feels today (cycle tracking), if the user said. */
  feeling: Feeling | null;
  symptoms: Symptom[];
  exercises: Exercise[];
  equipment: Equipment[];
  userEquipment: UserEquipment[];
  injuries: Injury[];
  painEvents: PainEvent[];
  foods: Food[];
  userFoods: UserFood[];
  userExercises: UserExercise[];
  cardioSessions: CardioSession[];
  mealTemplates: MealTemplate[];
  /** Own workouts from the builder, most used first. */
  customWorkouts: CustomWorkout[];
  /** The own program planned ahead, if there is one. */
  ownSchedule: OwnSchedule | undefined;
  exerciseNotes: ExerciseNote[];
  foodLogs: FoodLog[];
  program: Program | undefined;
  versions: ProgramVersion[];
  activeVersion: ProgramVersion | undefined;
  changes: PlanChange[];
  targets: NutritionTargetsRecord | undefined;
  mealWeeks: MealWeek[];
  plannedSessions: PlannedSession[];
  openSession: WorkoutSession | undefined;
}

export interface MealWeek {
  plan: MealPlan;
  items: PlannedItem[];
}

const browserZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export async function loadSnapshot(deps: AppDeps): Promise<Snapshot> {
  return deps.uow.run(async (r) => {
    const profile = await r.profile.get();
    const timezone = profile?.timezone ?? browserZone();
    const today = deps.clock.today(timezone);
    const goals = (await r.goals.listAll()).filter((g) => g.status === 'active').sort((a, b) => a.priority - b.priority);
    const metrics = await r.metrics.listAll();
    const exercises = await r.exercises.listAll();
    const exerciseNames = Object.fromEntries(exercises.map((e) => [e.id, e.name]));
    const muscleMap = new Map(exercises.map((e) => [e.id, e]));

    const customWorkouts = (await r.customWorkouts.listAll()).filter((t) => t.deletedAt === null).sort((a, b) => (b.lastUsedOn ?? '').localeCompare(a.lastUsedOn ?? '') || b.useCount - a.useCount || a.name.localeCompare(b.name, 'ru'));
    const ownSchedule = (await r.ownSchedules.listAll()).filter((x) => x.deletedAt === null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const customNames = new Map((await r.customWorkouts.listAll()).map((t) => [t.id, t.name]));
    const customSessions = new Map(
      (await r.plannedSessions.listByDateRange({ from: '2000-01-01', to: addDays(today, 60) })).filter((p) => isCustomWorkoutKey(p.workoutKey)).map((p) => [p.id, p.workoutKey]),
    );
    /** Own workout behind a session: its saved id and its name (an unsaved one is named after its exercises). */
    const ownOf = (plannedSessionId: string | null, exerciseIds: readonly string[]): { title: string | null; customWorkoutId: string | null } => {
      const key = plannedSessionId ? customSessions.get(plannedSessionId) : undefined;
      if (key === undefined) return { title: null, customWorkoutId: null };
      const id = customWorkoutIdOf(key);
      const saved = id ? customNames.get(id) : undefined;
      if (saved) return { title: saved, customWorkoutId: id };
      const list = exerciseIds.map((x) => muscleMap.get(x)).filter((e): e is Exercise => !!e).map((e) => ({ name: e.name, primaryMuscles: e.primaryMuscles }));
      return { title: autoWorkoutName(list), customWorkoutId: null };
    };
    const sessions = (await r.workouts.listSessions()).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 400);
    const rows: StrengthRow[] = [];
    const workouts: WorkoutSummary[] = [];
    for (const s of sessions) {
      const date = toLocalDate(s.startedAt, timezone);
      const ses = await r.workouts.listSessionExercises(s.id);
      let setCount = 0;
      let tonnage = 0;
      for (const se of ses) {
        for (const set of await r.workouts.listSetLogs(se.id)) {
          if (set.status !== 'done' || set.actualReps === null) continue;
          setCount++;
          if (set.setType !== 'warmup') tonnage += (set.actualWeightKg ?? 0) * set.actualReps;
          rows.push({ exerciseId: se.exerciseId, date, weightKg: set.actualWeightKg, reps: set.actualReps, setType: set.setType });
        }
      }
      if (workouts.length < 120) {
        workouts.push({ id: s.id, date, exercises: ses.length, sets: setCount, names: ses.map((e) => exerciseNames[e.exerciseId] ?? e.exerciseId), note: s.note, completed: s.status === 'completed', inProgress: s.status === 'in_progress', tonnageKg: Math.round(tonnage), ...ownOf(s.plannedSessionId, ses.map((e) => e.exerciseId)) });
      }
    }

    const logs = await r.foodLogs.listByDateRange({ from: addDays(today, -90), to: addDays(today, 1) });
    const byDay = new Map<string, FoodDay>();
    for (const l of logs) {
      const d = byDay.get(l.date) ?? { date: l.date, kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
      d.kcal += l.macros.kcal;
      d.proteinG += l.macros.proteinG;
      d.fatG += l.macros.fatG;
      d.carbG += l.macros.carbG;
      byDay.set(l.date, d);
    }
    const foodDays = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    const water = await r.dailyLogs.getByDate(today);
    const startWeek = profile?.weekStartsOn ?? 'monday';
    const program = await r.programs.getProgram();
    const versions = (await r.programs.listVersions()).sort((a, b) => a.versionNo - b.versionNo);
    const activeVersion = versions.find((v) => v.id === program?.activeVersionId);
    const mealWeeks: MealWeek[] = [];
    for (let w = -4; w <= 3; w++) {
      const weekStart = startOfWeek(addDays(today, w * 7), startWeek);
      const plan = await r.mealPlans.getByWeek(weekStart);
      if (plan && !mealWeeks.some((m) => m.plan.id === plan.id)) mealWeeks.push({ plan, items: await r.mealPlans.listItems(plan.id) });
    }
    const allSessions = await r.workouts.listSessions();
    const weightPoints = toWeightPoints(metrics);

    return {
      today,
      timezone,
      profile,
      goals,
      primaryGoal: goals[0],
      metrics,
      weightPoints,
      weight: analyzeWeight(weightPoints),
      series: toMetricSeries(metrics),
      strength: strengthByExercise(rows),
      muscleVolume: muscleVolume(rows, (id) => { const e = muscleMap.get(id); return e ? { primary: e.primaryMuscles, secondary: e.secondaryMuscles } : undefined; }, today),
      exerciseNames,
      workouts,
      foodDays,
      waterMl: water?.waterMl ?? 0,
      feeling: water?.feeling ?? null,
      symptoms: water?.symptoms ?? [],
      exercises,
      equipment: await r.equipment.listAll(),
      userEquipment: await r.userEquipment.listAll(),
      injuries: await r.injuries.listAll(),
      painEvents: await r.painEvents.listAll(),
      foods: await r.foods.listAll(),
      userFoods: await r.userFoods.listAll(),
      userExercises: await r.userExercises.listAll(),
      customWorkouts,
      ownSchedule,
      mealTemplates: (await r.mealTemplates.listAll()).filter((t) => t.deletedAt === null).sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name)),
      cardioSessions: (await r.cardioSessions.listAll()).filter((c) => c.deletedAt === null).sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)),
      exerciseNotes: await r.exerciseNotes.listAll(),
      foodLogs: logs,
      program,
      versions,
      activeVersion,
      changes: (await r.programs.listChanges()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      targets: await r.nutritionTargets.activeOn(today),
      mealWeeks,
      plannedSessions: (await r.plannedSessions.listByDateRange({ from: addDays(today, -30), to: addDays(today, 28) })).filter((p) => !isAdHocWorkoutKey(p.workoutKey)),
      openSession: allSessions.find((x) => x.status === 'in_progress'),
    };
  });
}
