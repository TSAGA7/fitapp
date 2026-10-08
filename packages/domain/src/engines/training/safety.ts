import type { BodyArea as BodyBodyArea, Exercise, Experience, Injury, PainEvent } from '../../model';

export type SafetyStatus = 'recommended' | 'caution' | 'avoid' | 'unavailable';

export interface SafetyContext {
  injuries: readonly Pick<Injury, 'area' | 'status'>[];
  painEvents: readonly Pick<PainEvent, 'exerciseId' | 'occurredAt' | 'intensity' | 'area'>[];
  /** Keys of equipment the user has. */
  availableEquipment: ReadonlySet<string>;
  experience: Experience;
  /** Today's instant (ISO) to judge how recent the pain events are. */
  now: string;
}

export interface ExerciseAssessment {
  exerciseId: string;
  status: SafetyStatus;
  /** Rough comparative score: lower is calmer for the user's constraints. Not medical. */
  risk: number;
  /** Why the exercise is not recommended (shown in the "not used" table). */
  reasons: string[];
  /** Conditions for doing it safely (shown for "caution"). */
  conditions: string[];
}

const AREA_WEIGHT: Record<Injury['status'], number> = { active: 3, recurring: 2, past: 1 };
const SPINE: readonly BodyBodyArea[] = ['lower_back', 'upper_back'];
const AREA_LABEL: Partial<Record<BodyBodyArea, string>> = {
  lower_back: 'поясница', upper_back: 'верх спины', shoulder: 'плечо', knee: 'колено', elbow: 'локоть', wrist: 'запястье', hip: 'таз/бедро', neck: 'шея', ankle: 'голеностоп',
};
const PAIN_WINDOW_DAYS = 28;
const SEVERE = 7;

/** Is the equipment requirement of an exercise met (any-of groups of all-of keys; empty = no equipment). */
export function equipmentAvailable(ex: Pick<Exercise, 'equipmentRequirements'>, have: ReadonlySet<string>): boolean {
  if (ex.equipmentRequirements.length === 0) return true;
  return ex.equipmentRequirements.some((group) => group.every((k) => have.has(k)));
}

const daysBetween = (a: string, b: string): number => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/**
 * Rates an exercise for THIS user's declared constraints. Painful areas are hints for ranking and warnings,
 * never a diagnosis; "avoid" means "not recommended", the user can still add the exercise manually.
 */
export function assessExercise(ex: Exercise, ctx: SafetyContext): ExerciseAssessment {
  const reasons: string[] = [];
  const conditions: string[] = [];
  if (!equipmentAvailable(ex, ctx.availableEquipment)) {
    return { exerciseId: ex.id, status: 'unavailable', risk: 99, reasons: ['Нет нужного оборудования'], conditions };
  }
  let risk = 0;
  let hardAvoid = false;
  const areas = new Map<BodyBodyArea, number>();
  for (const inj of ctx.injuries) areas.set(inj.area, Math.max(areas.get(inj.area) ?? 0, AREA_WEIGHT[inj.status]));

  for (const [area, w] of areas) {
    const label = AREA_LABEL[area] ?? area;
    let stress = ex.jointStress[area] ?? 0;
    if (SPINE.includes(area)) stress = Math.max(stress, ex.axialLoad);
    if (area === 'shoulder' && ex.rangeOfMotion === 'deep_stretch') stress += 1;
    if (area === 'lower_back' && ex.stabilityRequirement >= 3 && ex.axialLoad >= 1) stress += 1;
    risk += w * stress;
    if (w >= 2 && stress >= 3) {
      hardAvoid = true;
      reasons.push(`Высокая нагрузка на область «${label}» при вашей отмеченной чувствительности`);
    } else if (stress >= 2 && w >= 2) {
      conditions.push(`Следите за областью «${label}»: ${ex.painSensitiveAreas.find((p) => p.area === area)?.note ?? 'умеренная нагрузка, контролируйте технику'}`);
    }
    for (const p of ex.painSensitiveAreas) {
      if (p.area === area && w >= 2 && stress >= 1 && !conditions.some((c) => c.includes(p.note))) conditions.push(p.note);
    }
  }

  let recentPain = 0;
  let severePain = false;
  for (const e of ctx.painEvents) {
    if (e.exerciseId !== ex.id) continue;
    if (daysBetween(e.occurredAt, ctx.now) > PAIN_WINDOW_DAYS) continue;
    recentPain++;
    if ((e.intensity ?? 0) >= SEVERE) severePain = true;
  }
  if (severePain) {
    hardAvoid = true;
    reasons.push('Недавно была сильная боль в этом упражнении');
  } else if (recentPain > 0) {
    risk += recentPain * 2;
    conditions.push(`Недавно отмечена боль в этом упражнении (${recentPain} раз за 28 дней): уменьшите вес или замените`);
  }

  // Beginners should not get high-skill movements by default.
  if (ctx.experience === 'beginner' && ex.skillLevel >= 3) {
    risk += 2;
    conditions.push('Сложное по технике: начните с лёгкого веса или выберите тренажёр');
  }

  const status: SafetyStatus = hardAvoid || risk >= 8 ? 'avoid' : risk >= 3 || conditions.length > 0 ? 'caution' : 'recommended';
  if (status === 'avoid' && reasons.length === 0) reasons.push('Суммарная нагрузка на отмеченные области выше, чем у более контролируемых вариантов');
  return { exerciseId: ex.id, status, risk, reasons, conditions };
}

export interface RankedSubstitute {
  exercise: Exercise;
  assessment: ExerciseAssessment;
  score: number;
  curated: boolean;
}

/** Allowed replacements for an exercise, best first: curated ones, then the same movement or muscle. */
export function rankSubstitutes(original: Exercise, catalog: readonly Exercise[], ctx: SafetyContext, limit = 8): RankedSubstitute[] {
  const out: RankedSubstitute[] = [];
  for (const ex of catalog) {
    if (ex.id === original.id || ex.deletedAt !== null) continue;
    const assessment = assessExercise(ex, ctx);
    if (assessment.status === 'unavailable' || assessment.status === 'avoid') continue;
    const curated = original.curatedSubstituteKeys.includes(ex.id) || ex.curatedSubstituteKeys.includes(original.id);
    const samePattern = ex.movementPattern === original.movementPattern;
    const overlap = ex.primaryMuscles.filter((m) => original.primaryMuscles.includes(m)).length;
    if (!curated && !samePattern && overlap === 0) continue;
    const score = (curated ? 10 : 0) + (samePattern ? 4 : 0) + overlap * 3 - assessment.risk * 0.5 - (assessment.status === 'caution' ? 1 : 0);
    out.push({ exercise: ex, assessment, score, curated });
  }
  return out.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name, 'ru')).slice(0, limit);
}
