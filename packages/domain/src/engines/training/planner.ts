import type { Exercise, FocusArea, GoalType, MovementPattern, MuscleGroup, PlannedExercise, TrainingPlanSnapshot, WorkoutTemplate } from '../../model';
import type { LocalDate } from '../../util/localDate';
import { assessExercise, rankSubstitutes, type ExerciseAssessment, type SafetyContext } from './safety';

interface Slot {
  patterns: readonly MovementPattern[];
  /** Compound lifts are preferred for this slot. */
  compound?: boolean;
  /** Cardio-like and timed items are not picked for ordinary slots. */
  allowTime?: boolean;
}

const S = (patterns: MovementPattern[], compound = false, allowTime = false): Slot => ({ patterns, compound, allowTime });
const SQUAT = S(['squat'], true);
const LUNGE = S(['lunge', 'squat'], true);
const HINGE = S(['hip_extension', 'hinge'], true);
const HPUSH = S(['horizontal_push'], true);
const VPUSH = S(['vertical_push'], true);
const HPULL = S(['horizontal_pull'], true);
const VPULL = S(['vertical_pull'], true);
const FLY = S(['chest_fly']);
const LAT = S(['lateral_raise']);
const REAR = S(['rear_delt_fly']);
const CURL = S(['elbow_flexion']);
const TRI = S(['elbow_extension']);
const KNEE_FLEX = S(['knee_flexion']);
const KNEE_EXT = S(['knee_extension']);
const CALF = S(['calf_raise']);
const CORE_A = S(['core_antiextension', 'core_antirotation'], false, true);
const CORE_B = S(['core_antirotation', 'core_flexion'], false, true);

interface TemplateDef {
  key: string;
  label: string;
  slots: Slot[];
}

const TEMPLATES: Record<number, TemplateDef[]> = {
  1: [{ key: 'a', label: 'Всё тело', slots: [SQUAT, HPUSH, VPULL, KNEE_FLEX, LAT, CORE_A] }],
  2: [
    { key: 'a', label: 'Всё тело A', slots: [SQUAT, HPUSH, HPULL, KNEE_FLEX, LAT, CORE_A] },
    { key: 'b', label: 'Всё тело B', slots: [HINGE, VPUSH, VPULL, FLY, CURL, TRI] },
  ],
  3: [
    { key: 'a', label: 'Ноги и толкающие', slots: [SQUAT, HPUSH, VPULL, KNEE_FLEX, TRI, CORE_A] },
    { key: 'b', label: 'Верх тела', slots: [VPUSH, HPULL, FLY, LAT, CURL, REAR] },
    { key: 'c', label: 'Ноги и тяга', slots: [HINGE, LUNGE, VPULL, KNEE_EXT, CALF, CORE_B] },
  ],
  4: [
    { key: 'a', label: 'Верх A', slots: [HPUSH, HPULL, VPUSH, VPULL, LAT, TRI] },
    { key: 'b', label: 'Низ A', slots: [SQUAT, HINGE, KNEE_FLEX, CALF, CORE_A] },
    { key: 'c', label: 'Верх B', slots: [HPUSH, VPULL, HPULL, FLY, CURL, REAR] },
    { key: 'd', label: 'Низ B', slots: [LUNGE, HINGE, KNEE_EXT, KNEE_FLEX, CALF, CORE_B] },
  ],
  5: [
    { key: 'a', label: 'Верх A', slots: [HPUSH, HPULL, VPUSH, VPULL, LAT, TRI] },
    { key: 'b', label: 'Низ A', slots: [SQUAT, HINGE, KNEE_FLEX, CALF, CORE_A] },
    { key: 'c', label: 'Жимы', slots: [HPUSH, VPUSH, FLY, LAT, TRI] },
    { key: 'd', label: 'Тяги', slots: [VPULL, HPULL, REAR, CURL, CORE_B] },
    { key: 'e', label: 'Низ B', slots: [LUNGE, HINGE, KNEE_EXT, KNEE_FLEX, CALF] },
  ],
  6: [
    { key: 'a', label: 'Жимы A', slots: [HPUSH, VPUSH, FLY, LAT, TRI] },
    { key: 'b', label: 'Тяги A', slots: [VPULL, HPULL, REAR, CURL, CORE_A] },
    { key: 'c', label: 'Ноги A', slots: [SQUAT, HINGE, KNEE_FLEX, CALF] },
    { key: 'd', label: 'Жимы B', slots: [HPUSH, VPUSH, FLY, LAT, TRI] },
    { key: 'e', label: 'Тяги B', slots: [VPULL, HPULL, REAR, CURL, CORE_B] },
    { key: 'f', label: 'Ноги B', slots: [LUNGE, HINGE, KNEE_EXT, KNEE_FLEX, CALF] },
  ],
};

const FOCUS_SLOTS: Record<FocusArea, Slot[]> = {
  shoulders: [LAT, REAR],
  arms: [CURL, TRI],
  chest: [FLY],
  back: [REAR, VPULL],
  legs: [KNEE_EXT, CALF],
  glutes: [HINGE],
  abdomen: [CORE_A],
  lower_abdomen: [CORE_B],
};

const MUSCLE_RU: Partial<Record<MuscleGroup, string>> = {
  chest: 'грудь', lats: 'спина', upper_back: 'спина', front_delts: 'плечи', side_delts: 'плечи', rear_delts: 'плечи', biceps: 'бицепс', triceps: 'трицепс',
  quads: 'ноги', hamstrings: 'ноги', glutes: 'ягодицы', calves: 'икры', abs: 'пресс', obliques: 'корпус',
};

export interface PlanBuildInput {
  exercises: readonly Exercise[];
  ctx: SafetyContext;
  daysPerWeek: number;
  goal: GoalType;
  focus: readonly FocusArea[];
  startsOn: LocalDate;
}

export interface ExcludedExercise {
  exercise: Exercise;
  reasons: string[];
  /** Best allowed replacement. */
  replacement: Exercise | null;
}
export interface CautionExercise {
  exercise: Exercise;
  conditions: string[];
}

export interface PlanBuildResult {
  plan: TrainingPlanSnapshot;
  /** Why each exercise was chosen, by the key of the planned exercise. */
  rationale: Record<string, string>;
  /** "Exercises I will NOT use" with reasons and replacements. */
  excluded: ExcludedExercise[];
  /** "Use with care" with the conditions. */
  cautions: CautionExercise[];
  /** Explanations for the whole plan. */
  notes: string[];
}

const isTimedOrCardio = (e: Exercise): boolean => e.progressionType === 'time';

function chooseExercise(
  slot: Slot,
  catalog: readonly Exercise[],
  assessments: ReadonlyMap<string, ExerciseAssessment>,
  usedHere: ReadonlySet<string>,
  usedAnywhere: ReadonlySet<string>,
  ctx: SafetyContext,
): Exercise | undefined {
  const cautiousSpine = ctx.injuries.some((i) => i.area === 'lower_back' || i.area === 'upper_back');
  const cautiousShoulder = ctx.injuries.some((i) => i.area === 'shoulder');
  let best: { ex: Exercise; score: number } | undefined;
  for (const ex of catalog) {
    if (!slot.patterns.includes(ex.movementPattern) || usedHere.has(ex.id) || ex.deletedAt !== null) continue;
    if (isTimedOrCardio(ex) && !slot.allowTime) continue;
    if (ex.key === 'incline_walk' || ex.key === 'bike_steady') continue;
    const a = assessments.get(ex.id);
    if (!a || a.status === 'unavailable' || a.status === 'avoid') continue;
    if (ctx.experience === 'beginner' && ex.skillLevel >= 3) continue;
    let score = 0;
    if (slot.compound && ex.isCompound) score += 3;
    score -= a.risk;
    if (a.status === 'caution') score -= 1;
    if (!usedAnywhere.has(ex.id)) score += 2;
    if (ex.stabilityRequirement === 0 && (ctx.experience === 'beginner' || cautiousSpine)) score += 1;
    if (cautiousShoulder && (ex.jointStress.shoulder ?? 0) <= 1) score += 1;
    // First pattern in the slot is the preferred one.
    score -= slot.patterns.indexOf(ex.movementPattern) * 0.5;
    if (!best || score > best.score) best = { ex, score };
  }
  return best?.ex;
}

function whyChosen(ex: Exercise, ctx: SafetyContext, a: ExerciseAssessment, alternativesAvoided: string[]): string {
  const parts: string[] = [];
  if (ex.isCompound && ctx.injuries.some((i) => i.area === 'lower_back' || i.area === 'upper_back') && ex.axialLoad <= 1) parts.push('малая осевая нагрузка на позвоночник');
  if (ex.isCompound && ctx.injuries.some((i) => i.area === 'shoulder') && (ex.jointStress.shoulder ?? 0) <= 1) parts.push('щадящая позиция плеча');
  if (ex.stabilityRequirement === 0) parts.push('опора/тренажёр: проще контролировать технику');
  if (ex.isCompound) parts.push('многосуставное, даёт основной стимул');
  if (parts.length === 0) parts.push('подходит под цель и оборудование');
  if (alternativesAvoided.length > 0) parts.push(`вместо «${alternativesAvoided[0]}», которое для вас рискованнее`);
  if (a.status === 'caution') parts.push('с осторожностью: ' + (a.conditions[0] ?? 'следите за техникой'));
  return parts.join('; ');
}

/**
 * Builds a training plan for the chosen training days: the template is picked by the number of days,
 * every slot gets the best exercise that is available and calm enough for the user's declared constraints.
 * Deterministic: the same input gives the same plan.
 */
export function buildTrainingPlan(input: PlanBuildInput): PlanBuildResult {
  const days = Math.min(6, Math.max(1, input.daysPerWeek));
  const templates = TEMPLATES[days] as TemplateDef[];
  const catalog = input.exercises.filter((e) => e.deletedAt === null);
  const assessments = new Map(catalog.map((e) => [e.id, assessExercise(e, input.ctx)]));
  const hasConstraints = input.ctx.injuries.some((i) => i.status !== 'past') || input.ctx.experience === 'beginner';

  const rationale: Record<string, string> = {};
  const usedAnywhere = new Set<string>();
  const workouts: WorkoutTemplate[] = [];
  const slotLists: Slot[][] = templates.map((t) => [...t.slots]);

  // Focus areas add one accessory to the workout that has the fewest exercises and does not have that movement yet.
  const topFocus = input.focus.slice(0, 2);
  for (const f of topFocus) {
    for (const slot of FOCUS_SLOTS[f]) {
      const order = slotLists.map((s, i) => ({ i, n: s.length })).sort((a, b) => a.n - b.n || a.i - b.i);
      const target = order.find((o) => o.n < 8 && !(slotLists[o.i] as Slot[]).some((s) => s.patterns[0] === slot.patterns[0]));
      if (target) (slotLists[target.i] as Slot[]).push(slot);
    }
  }

  templates.forEach((t, wi) => {
    const usedHere = new Set<string>();
    const exercises: PlannedExercise[] = [];
    const muscles: MuscleGroup[] = [];
    (slotLists[wi] as Slot[]).forEach((slot) => {
      const ex = chooseExercise(slot, catalog, assessments, usedHere, usedAnywhere, input.ctx);
      if (!ex) return;
      usedHere.add(ex.id);
      usedAnywhere.add(ex.id);
      const a = assessments.get(ex.id) as ExerciseAssessment;
      const position = exercises.length + 1;
      const key = `${t.key}_${position}_${ex.key}`;
      const careful = a.status === 'caution' || ex.axialLoad >= 2 || (ex.jointStress.shoulder ?? 0) >= 2;
      const adaptRir = { min: 2, max: 3 };
      const mainRir = careful ? { min: 2, max: 3 } : { min: 1, max: 2 };
      const avoided = catalog
        .filter((c) => c.movementPattern === ex.movementPattern && c.id !== ex.id && assessments.get(c.id)?.status === 'avoid' && c.isCompound && c.primaryMuscles.some((m) => ex.primaryMuscles.includes(m)))
        .map((c) => c.name);
      exercises.push({
        key,
        exerciseId: ex.id,
        variantKey: 'default',
        position,
        sets: Math.min(ex.defaultSets, ex.isCompound ? 4 : 3),
        repMin: ex.defaultRepRange.min,
        repMax: ex.defaultRepRange.max,
        rirAdaptation: adaptRir,
        rirMain: mainRir,
        restSec: ex.defaultRestSec,
        startWeightKg: null,
        progression: { type: ex.progressionType, stepKg: null },
      });
      rationale[key] = whyChosen(ex, input.ctx, a, avoided);
      muscles.push(...ex.primaryMuscles);
    });
    const names = [...new Set(muscles.map((m) => MUSCLE_RU[m]).filter((x): x is string => !!x))].slice(0, 3);
    workouts.push({
      key: t.key,
      label: `${t.label}${names.length ? ` · ${names.join(', ')}` : ''}`.slice(0, 60),
      focus: [...new Set(input.focus)].slice(0, 3),
      exercises,
    });
  });

  const adaptationWeeks = hasConstraints ? 4 : 3;
  const plan: TrainingPlanSnapshot = {
    workouts: workouts.filter((w) => w.exercises.length > 0),
    rotation: workouts.filter((w) => w.exercises.length > 0).map((w) => w.key),
    adaptationWeeks,
    startsOn: input.startsOn,
  };

  const excluded: ExcludedExercise[] = [];
  const cautions: CautionExercise[] = [];
  for (const ex of catalog) {
    const a = assessments.get(ex.id) as ExerciseAssessment;
    if (a.status === 'avoid') {
      const sub = rankSubstitutes(ex, catalog, input.ctx, 1)[0];
      excluded.push({ exercise: ex, reasons: a.reasons, replacement: sub?.exercise ?? null });
    } else if (a.status === 'caution' && a.conditions.length > 0 && ex.isCompound) {
      cautions.push({ exercise: ex, conditions: a.conditions });
    }
  }

  const notes = [
    `Первые ${adaptationWeeks} нед. — адаптация: запас 2–3 повторения (RIR 2–3), без отказа.`,
    'Приоритет: техника → контроль → переносимость → прогрессия веса.',
    'Боль в суставе — не «жжение мышцы»: упражнение прекращается, предлагается замена; при повторении — обратиться к врачу.',
  ];
  if (input.ctx.injuries.some((i) => i.area === 'lower_back')) notes.push('Учтена чувствительность поясницы: тяжёлая осевая нагрузка и сильное сгибание под весом не назначаются.');
  if (input.ctx.injuries.some((i) => i.area === 'shoulder')) notes.push('Учтено плечо: нейтральный хват, тренажёры и ограниченная амплитуда предпочтительнее штанги.');

  return { plan, rationale, excluded, cautions, notes };
}
