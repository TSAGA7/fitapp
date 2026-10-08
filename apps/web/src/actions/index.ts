import type { AppDeps } from '@fitapp/application';
import { EXPECTED_UNIT, createBase, type BodyArea, type Experience, type FocusArea, type Goal, type GoalType, type JobActivity, type MetricType, type Profile, type Sex, type TrainingSchedule } from '@fitapp/domain';
import { PROFILE_ID } from '../composition';
import { createProgram } from './program';

export * from './program';
export * from './nutrition';
export * from './workout';
export * from './health';

/**
 * Commands of the screens (presentation layer). Each one writes through the repositories of the
 * AppDeps in one transaction; the repositories validate every record with the domain schemas.
 */
const base = (deps: AppDeps) => createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId);
const today = (deps: AppDeps, tz: string) => deps.clock.today(tz);

export interface OnboardingInput {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  /** Optional measurements by type (cm). */
  measurements: Partial<Record<MetricType, number>>;
  goalType: GoalType;
  focus: FocusArea[];
  targetWeightKg: number | null;
  targetWaistCm: number | null;
  schedule: TrainingSchedule;
  experience: Experience;
  jobActivity: JobActivity;
  timezone: string;
  /** Areas that bother the user: only hints for choosing exercises, never a diagnosis. */
  painAreas?: BodyArea[];
}

const focusWeights = (areas: FocusArea[]): Goal['focus'] => areas.map((area, i) => ({ area, weight: Math.max(1, 3 - i) }));

export async function completeOnboarding(deps: AppDeps, i: OnboardingInput): Promise<void> {
  const day = today(deps, i.timezone);
  await deps.uow.run(async (r) => {
    await r.profile.save({
      ...createBase(PROFILE_ID, deps.clock.now(), deps.deviceId),
      sex: i.sex,
      birthDate: i.birthDate,
      heightCm: i.heightCm,
      timezone: i.timezone,
      locale: 'ru',
      units: 'metric',
      weekStartsOn: 'monday',
      experience: i.experience,
      jobActivity: i.jobActivity,
      trainingSchedule: i.schedule,
    });
    await r.goals.put({
      ...base(deps),
      type: i.goalType,
      priority: 1,
      status: 'active',
      startedOn: day,
      endedOn: null,
      targetWeightKg: i.targetWeightKg,
      targetWaistCm: i.targetWaistCm,
      focus: focusWeights(i.focus),
    });
    const entries: Array<[MetricType, number]> = [['weight', i.weightKg], ...(Object.entries(i.measurements) as Array<[MetricType, number]>)];
    for (const [type, value] of entries) {
      if (!Number.isFinite(value) || value <= 0) continue;
      await r.metrics.put({ ...base(deps), type, value, unit: EXPECTED_UNIT[type], measuredOn: day, note: null });
    }
    for (const area of i.painAreas ?? []) {
      await r.injuries.put({ ...base(deps), area, side: 'both', status: 'recurring', triggerKinds: [], triggerText: null, notes: null, resolvedOn: null });
    }
  });
  // The first program (targets + training plan) is built right away from what was just entered.
  try {
    await createProgram(deps);
  } catch {
    // The profile is saved anyway; the program can be created later from the Nutrition or Training tab.
  }
}

export type ProfilePatch = Partial<Pick<Profile, 'sex' | 'birthDate' | 'heightCm' | 'timezone' | 'experience' | 'jobActivity' | 'trainingSchedule'>>;

export async function updateProfile(deps: AppDeps, patch: ProfilePatch): Promise<void> {
  await deps.uow.run(async (r) => {
    const current = await r.profile.get();
    if (!current) throw new Error('Профиль ещё не создан');
    await r.profile.save({ ...current, ...patch });
  });
}

export interface GoalInput {
  type: GoalType;
  targetWeightKg: number | null;
  targetWaistCm: number | null;
  focus: FocusArea[];
}

/** Same goal type: update it. Another type: the old goal is archived (history is kept) and a new one starts. */
export async function saveGoal(deps: AppDeps, input: GoalInput, timezone: string): Promise<void> {
  const day = today(deps, timezone);
  await deps.uow.run(async (r) => {
    const active = (await r.goals.listAll()).filter((g) => g.status === 'active').sort((a, b) => a.priority - b.priority)[0];
    const fields = { targetWeightKg: input.targetWeightKg, targetWaistCm: input.targetWaistCm, focus: focusWeights(input.focus) };
    if (active && active.type === input.type) {
      await r.goals.put({ ...active, ...fields });
      return;
    }
    if (active) await r.goals.put({ ...active, status: 'archived', endedOn: day });
    await r.goals.put({ ...base(deps), type: input.type, priority: 1, status: 'active', startedOn: day, endedOn: null, ...fields });
  });
}

export async function addMetric(deps: AppDeps, input: { type: MetricType; value: number; date: string; note?: string | null }): Promise<void> {
  await deps.uow.run((r) => r.metrics.put({ ...base(deps), type: input.type, value: input.value, unit: EXPECTED_UNIT[input.type], measuredOn: input.date, note: input.note ?? null }));
}

export async function deleteMetric(deps: AppDeps, id: string): Promise<void> {
  await deps.uow.run((r) => r.metrics.softDelete(id));
}

/** Adds (or removes, with a negative number) water for a day; never below zero. */
export async function addWater(deps: AppDeps, date: string, deltaMl: number): Promise<void> {
  await deps.uow.run(async (r) => {
    const current = await r.dailyLogs.getByDate(date);
    const next = Math.max(0, (current?.waterMl ?? 0) + deltaMl);
    if (current) await r.dailyLogs.put({ ...current, waterMl: next });
    else await r.dailyLogs.put({ ...base(deps), date, waterMl: next, note: null });
  });
}
