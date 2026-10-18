import type { AppDeps } from '@fitapp/application';
import {
  adviseOnPain,
  bestSet,
  sessionElapsedSec,
  summarizeWorkout,
  type SummaryExerciseInput,
  type WorkoutSummary,
  buildDeloadPrescription,
  evaluateDeloadSuggestion,
  createBase,
  inAdaptation,
  nextPrescription,
  progressionKey,
  scheduleWindow,
  toLocalDate,
  addDays,
  type BodyArea,
  type DeloadSuggestion,
  type Exercise,
  type ExerciseNote,
  type RestTrend,
  buildBodyweightWorkout,
  type NextPrescription,
  type PainAdvice,
  type PlannedExercise,
  type PlannedSession,
  type PlannedSet,
  type ProgramVersion,
  type ReplacementReason,
  type Repositories,
  type SessionExercise,
  type SessionResult,
  type SetLog,
  type SetResult,
  type SetType,
  type SkipReason,
  type WorkoutSession,
  type Side,
  type CustomWorkout,
  type CustomWorkoutExercise,
  BODYWEIGHT_WORKOUT_KEY,
  customWorkoutIdOf,
  customWorkoutKey,
  isAdHocWorkoutKey,
  isCustomWorkoutKey,
  autoWorkoutName,
  uniqueName,
  REPLACED_BY_OWN,
} from '@fitapp/domain';
import { resolveEquipment, safetyContext } from '../app/derive';
import { rebuildForPreference } from './program';

const baseOf = (deps: AppDeps) => createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId);
const CALIBRATION_CODES = new Set(['first_execution', 'first_execution_choose_weight', 'layoff_calibrate']);

async function activeVersion(r: Repositories): Promise<ProgramVersion | undefined> {
  const p = await r.programs.getProgram();
  return p?.activeVersionId ? r.programs.getVersion(p.activeVersionId) : undefined;
}

// ---------------------------------------------------------------- the calendar

/** Creates the planned sessions of the next two weeks from the active version and the training days. Idempotent. */
export async function ensureSessions(deps: AppDeps): Promise<void> {
  await deps.uow.run(async (r) => {
    const profile = await r.profile.get();
    const version = await activeVersion(r);
    if (!profile || !version) return;
    const today = deps.clock.today(profile.timezone);
    const horizon = 14;
    // Workouts outside the program (at home, my own) never take or free a slot of the calendar.
    const existing = (await r.plannedSessions.listByDateRange({ from: addDays(today, -60), to: addDays(today, horizon + 7) })).filter((s) => !isAdHocWorkoutKey(s.workoutKey));
    const movedFrom = new Set(existing.filter((s) => s.originalDate !== null).map((s) => s.originalDate as string));
    const slots = scheduleWindow(version.training, profile.trainingSchedule, today, horizon);
    for (const slot of slots) {
      const same = existing.find((s) => s.plannedDate === slot.date && s.originalDate === null);
      if (same) {
        // The version changed and nothing was done yet: the session follows the new version.
        if (same.status === 'planned' && (same.versionId !== version.id || same.workoutKey !== slot.workoutKey)) {
          await r.plannedSessions.put({ ...same, versionId: version.id, workoutKey: slot.workoutKey });
        }
        continue;
      }
      if (movedFrom.has(slot.date)) continue;
      await r.plannedSessions.put({ ...baseOf(deps), versionId: version.id, workoutKey: slot.workoutKey, plannedDate: slot.date, status: 'planned', originalDate: null, movedReason: null });
    }
    // Planned sessions on days that are no longer training days and have not been started are dropped.
    for (const s of existing) {
      if (s.status !== 'planned' || s.plannedDate < today || s.originalDate !== null) continue;
      if (!slots.some((x) => x.date === s.plannedDate)) {
        const started = (await r.workouts.listSessions()).some((w) => w.plannedSessionId === s.id);
        if (!started) await r.plannedSessions.softDelete(s.id);
      }
    }
  });
}

export async function skipPlannedSession(deps: AppDeps, id: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const s = await r.plannedSessions.get(id);
    if (s) await r.plannedSessions.put({ ...s, status: 'skipped' });
  });
}

/** Moves a missed or planned workout to another date. Only the date changes: no new program version. */
export async function movePlannedSession(deps: AppDeps, id: string, newDate: string, reason: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const s = await r.plannedSessions.get(id);
    if (!s) return;
    await r.plannedSessions.put({ ...s, plannedDate: newDate, originalDate: s.originalDate ?? s.plannedDate, movedReason: reason || null, status: 'planned' });
  });
}

// ---------------------------------------------------------------- progression input

interface HistoryEntry {
  session: WorkoutSession;
  exercises: SessionExercise[];
  sets: Map<string, SetLog[]>;
  planned: PlannedSet[];
}

async function loadHistory(r: Repositories, excludeSessionId: string | null): Promise<HistoryEntry[]> {
  const sessions = (await r.workouts.listSessions()).filter((s) => s.status === 'completed' && s.id !== excludeSessionId).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 60);
  const out: HistoryEntry[] = [];
  for (const session of sessions) {
    const exercises = await r.workouts.listSessionExercises(session.id);
    const sets = new Map<string, SetLog[]>();
    for (const e of exercises) sets.set(e.id, await r.workouts.listSetLogs(e.id));
    const planned = session.plannedSessionId ? await r.plannedSessions.listSets(session.plannedSessionId) : [];
    out.push({ session, exercises, sets, planned });
  }
  return out;
}

const toSetResult = (s: SetLog): SetResult => ({ setNo: s.setNo, weightKg: s.actualWeightKg, reps: s.actualReps, rir: s.actualRir, status: s.status, skipReason: s.skipReason, painFlag: s.painFlag });

function sessionResults(history: readonly HistoryEntry[], exercise: Exercise, contextKey: string, pe: Pick<PlannedExercise, 'repMin' | 'repMax' | 'rirMain'>, tz: string): SessionResult[] {
  const out: SessionResult[] = [];
  for (const h of history) {
    const date = toLocalDate(h.session.startedAt, tz);
    for (const se of h.exercises) {
      const logs = (h.sets.get(se.id) ?? []).filter((s) => s.setType === 'working' && s.contextKey === contextKey);
      const planned = h.planned.filter((p) => p.plannedExerciseKey === se.plannedExerciseKey && p.exerciseId === se.exerciseId && p.contextKey === contextKey);
      if (logs.length > 0) {
        const first = planned[0];
        const kind = first && CALIBRATION_CODES.has(first.reasonCode) ? 'calibration' : first?.reasonCode === 'deload_week' ? 'deload' : 'normal';
        out.push({
          date,
          kind,
          plannedSets: Math.max(planned.length, logs.length),
          repRange: { min: pe.repMin, max: pe.repMax },
          repMaxTarget: first?.repMax ?? pe.repMax,
          rirTarget: first?.targetRir ?? pe.rirMain,
          sets: logs.sort((a, b) => a.setNo - b.setNo).map(toSetResult),
          replaced: null,
        });
      } else if (se.replacedFromExerciseId === exercise.id && se.replacementReason) {
        out.push({ date, kind: 'normal', plannedSets: Math.max(1, planned.length), repRange: { min: pe.repMin, max: pe.repMax }, repMaxTarget: pe.repMax, rirTarget: pe.rirMain, sets: [], replaced: { reason: se.replacementReason } });
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

interface Prescribed {
  prescription: NextPrescription;
  contextKey: string;
  stepKg: number;
  minKg: number | null;
  maxKg: number | null;
}

async function prescribe(r: Repositories, deps: AppDeps, ctx: { tz: string; today: string; version: ProgramVersion; history: HistoryEntry[]; adherence: { planned: number; done: number } | null; equipment: Awaited<ReturnType<Repositories['equipment']['listAll']>>; userEquipment: Awaited<ReturnType<Repositories['userEquipment']['listAll']>> }, pe: PlannedExercise, exercise: Exercise, deload: boolean): Promise<Prescribed> {
  const eq = resolveEquipment(exercise, ctx.equipment, ctx.userEquipment);
  const contextKey = progressionKey({ exerciseId: exercise.id, variantKey: pe.variantKey, repMin: pe.repMin, repMax: pe.repMax, equipmentId: eq.equipmentId });
  const adaptation = inAdaptation(ctx.version.training, ctx.today);
  const rirTarget = adaptation ? pe.rirAdaptation : pe.rirMain;
  const stepKg = pe.progression.stepKg ?? eq.stepKg;
  const events = await r.painEvents.listByExercise(exercise.id);
  const prescription = nextPrescription({
    forDate: ctx.today,
    plan: { repMin: pe.repMin, repMax: pe.repMax, rirTarget, sets: pe.sets, restSec: pe.restSec, stepKg: pe.progression.type === 'double' ? stepKg : 0, minKg: eq.minKg, maxKg: eq.maxKg, startWeightKg: pe.startWeightKg },
    exercise: { axialLoad: exercise.axialLoad as 0 | 1 | 2 | 3 },
    history: sessionResults(ctx.history, exercise, contextKey, { repMin: pe.repMin, repMax: pe.repMax, rirMain: rirTarget }, ctx.tz),
    painEvents: events.map((e) => ({ date: toLocalDate(e.occurredAt, ctx.tz), intensity: e.intensity })),
    adherence14d: ctx.adherence,
    lastDeload: null,
  });
  if (deload) {
    const d = buildDeloadPrescription({ weightKg: prescription.weightKg, sets: prescription.sets, rirTarget: prescription.rirTarget, grid: { stepKg, minKg: eq.minKg, maxKg: eq.maxKg } });
    return {
      prescription: { ...prescription, weightKg: d.weightKg, sets: d.sets, rirTarget: d.rirTarget, decision: 'hold', reasonCode: 'hold_build_reps', reasonText: 'Облегчённая тренировка: вес ×0,9, на один подход меньше, запас 3–4 повторения.' },
      contextKey,
      stepKg,
      minKg: eq.minKg,
      maxKg: eq.maxKg,
    };
  }
  return { prescription, contextKey, stepKg, minKg: eq.minKg, maxKg: eq.maxKg };
}

async function createSets(r: Repositories, deps: AppDeps, plannedSessionId: string, key: string, exercise: Exercise, variantKey: string, p: Prescribed, deload: boolean): Promise<void> {
  const sets: PlannedSet[] = [];
  for (let i = 1; i <= p.prescription.sets; i++) {
    sets.push({
      ...baseOf(deps),
      plannedSessionId,
      plannedExerciseKey: key,
      exerciseId: exercise.id,
      variantKey,
      contextKey: p.contextKey,
      setNo: i,
      targetWeightKg: p.prescription.weightKg,
      repMin: p.prescription.repTarget.min,
      repMax: p.prescription.repTarget.max,
      targetRir: p.prescription.rirTarget,
      restSec: p.prescription.restSec,
      reasonCode: deload ? 'deload_week' : p.prescription.reasonCode,
      reasonText: p.prescription.reasonText.slice(0, 500),
    });
  }
  await r.plannedSessions.putSets(sets);
}

async function prescriptionContext(r: Repositories, deps: AppDeps, version: ProgramVersion, excludeSessionId: string | null) {
  const profile = await r.profile.get();
  const tz = profile?.timezone ?? 'UTC';
  const today = deps.clock.today(tz);
  const recent = (await r.plannedSessions.listByDateRange({ from: addDays(today, -14), to: addDays(today, -1) })).filter((s) => !isAdHocWorkoutKey(s.workoutKey));
  const adherence = recent.length > 0 ? { planned: recent.length, done: recent.filter((s) => s.status === 'done').length } : null;
  return { tz, today, version, history: await loadHistory(r, excludeSessionId), adherence, equipment: await r.equipment.listAll(), userEquipment: await r.userEquipment.listAll() };
}

// ---------------------------------------------------------------- start / resume

/** Starts a workout (or resumes the one in progress): prescriptions come from the progression engine and the fact history. */
export async function startWorkout(deps: AppDeps, plannedSessionId: string, options: { deload?: boolean } = {}): Promise<string> {
  return deps.uow.run(async (r) => {
    const ps = await r.plannedSessions.get(plannedSessionId);
    if (!ps) throw new Error('Тренировка не найдена');
    const open = (await r.workouts.listSessions()).find((s) => s.plannedSessionId === ps.id && s.status === 'in_progress');
    if (open) return open.id;
    const version = await r.programs.getVersion(ps.versionId);
    const template = version?.training.workouts.find((w) => w.key === ps.workoutKey);
    if (!version || !template) throw new Error('В программе нет такой тренировки');
    const ctx = await prescriptionContext(r, deps, version, null);
    const sessionId = deps.ids.newId();
    await r.workouts.putSession({ ...createBase(sessionId, deps.clock.now(), deps.deviceId), plannedSessionId: ps.id, versionId: version.id, startedAt: deps.clock.now(), endedAt: null, status: 'in_progress', note: null });
    for (const pe of template.exercises) {
      const exercise = await r.exercises.get(pe.exerciseId);
      if (!exercise) continue;
      const p = await prescribe(r, deps, ctx, pe, exercise, options.deload === true);
      await r.workouts.putSessionExercise({
        ...baseOf(deps),
        sessionId,
        exerciseId: exercise.id,
        variantKey: pe.variantKey,
        plannedExerciseKey: pe.key,
        position: pe.position,
        replacedFromExerciseId: null,
        replacementReason: null,
        status: 'planned',
        skipReason: null,
        note: null,
      });
      await createSets(r, deps, ps.id, pe.key, exercise, pe.variantKey, p, options.deload === true);
    }
    return sessionId;
  });
}

// ---------------------------------------------------------------- the view

export interface WorkoutExerciseView {
  se: SessionExercise;
  exercise: Exercise;
  plan: PlannedSet[];
  logs: SetLog[];
  stepKg: number;
  minKg: number | null;
  maxKg: number | null;
  reasonText: string;
  reasonCode: string;
  pe: PlannedExercise | undefined;
  /** Notes from earlier workouts, shown once (this is the first workout after they were written). */
  reminders: ExerciseNote[];
  /** Note written in THIS workout. */
  ownNote: ExerciseNote | undefined;
  /** For the adaptive rest timer. */
  daysSinceLast: number | null;
  trend: RestTrend | null;
}
export interface WorkoutView {
  session: WorkoutSession;
  plannedSession: PlannedSession | undefined;
  version: ProgramVersion | undefined;
  label: string;
  /** Started from «Свои тренировки» (a saved one or an empty one). */
  custom: boolean;
  /** The saved custom workout this session came from, if it still exists. */
  customWorkoutId: string | null;
  exercises: WorkoutExerciseView[];
}

const BODYWEIGHT_KEY = BODYWEIGHT_WORKOUT_KEY;
const DAY_MS = 86_400_000;

/** Score of a set for comparing sessions: estimated strength for loaded work, reps (or seconds) otherwise. */
const setScore = (l: SetLog): number => (l.actualWeightKg && l.actualWeightKg > 0 ? l.actualWeightKg * (1 + (l.actualReps ?? 0) / 30) : (l.actualReps ?? 0));

/** Reminders (shown once), the note of this workout and the data the rest timer adapts to. */
async function noteAndRestInfo(r: Repositories, deps: AppDeps, session: WorkoutSession, se: SessionExercise, exerciseId: string, notes: readonly ExerciseNote[]) {
  const mine = notes.filter((n) => n.exerciseId === exerciseId);
  const ownNote = mine.find((n) => n.sessionId === session.id);
  const reminders: ExerciseNote[] = [];
  for (const n of mine) {
    if (n.sessionId === session.id) continue;
    if (n.shownInSessionId === null) {
      // Written earlier and not shown yet: this is "the next workout" with the exercise.
      if (n.createdAt >= session.startedAt) continue;
      const shown = { ...n, shownInSessionId: session.id };
      await r.exerciseNotes.put(shown);
      reminders.push(shown);
    } else if (n.shownInSessionId === session.id) reminders.push(n);
  }
  const logs = (await r.workouts.listSetLogsByExercise(exerciseId)).filter((l) => l.status === 'done' && l.setType === 'working' && l.sessionExerciseId !== se.id && (l.completedAt ?? '') < session.startedAt);
  const last = logs.map((l) => l.completedAt ?? '').sort().pop();
  const daysSinceLast = last ? Math.max(0, Math.floor((Date.parse(session.startedAt) - Date.parse(last)) / DAY_MS)) : null;
  const bySession = new Map<string, number>();
  for (const l of logs) bySession.set(l.sessionExerciseId, Math.max(bySession.get(l.sessionExerciseId) ?? 0, setScore(l)));
  const order = [...new Set(logs.sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? -1 : 1)).map((l) => l.sessionExerciseId))].slice(-2);
  let trend: RestTrend | null = null;
  if (order.length === 2) {
    const [a, b] = [bySession.get(order[0] as string) ?? 0, bySession.get(order[1] as string) ?? 0];
    trend = a > 0 && b > a * 1.03 ? 'up' : a > 0 && b < a * 0.97 ? 'down' : 'flat';
  }
  void deps;
  return { reminders, ownNote, daysSinceLast, trend };
}

export async function loadWorkout(deps: AppDeps, sessionId: string): Promise<WorkoutView> {
  return deps.uow.run(async (r) => {
    const session = await r.workouts.getSession(sessionId);
    if (!session) throw new Error('Тренировка не найдена');
    const ps = session.plannedSessionId ? await r.plannedSessions.get(session.plannedSessionId) : undefined;
    const version = await r.programs.getVersion(session.versionId);
    const template = version?.training.workouts.find((w) => w.key === ps?.workoutKey);
    const planned = ps ? await r.plannedSessions.listSets(ps.id) : [];
    const equipment = await r.equipment.listAll();
    const userEquipment = await r.userEquipment.listAll();
    const ses = (await r.workouts.listSessionExercises(sessionId)).sort((a, b) => a.position - b.position);
    const notes = (await r.exerciseNotes.listAll()).filter((n) => n.deletedAt === null);
    const exercises: WorkoutExerciseView[] = [];
    for (const se of ses) {
      if (se.status === 'skipped' && se.replacedFromExerciseId === null && (await r.workouts.listSetLogs(se.id)).length === 0 && ses.some((x) => x.replacedFromExerciseId === se.exerciseId && x.plannedExerciseKey === se.plannedExerciseKey)) continue;
      const exercise = await r.exercises.get(se.exerciseId);
      if (!exercise) continue;
      const plan = planned.filter((p) => p.plannedExerciseKey === se.plannedExerciseKey && p.exerciseId === se.exerciseId).sort((a, b) => a.setNo - b.setNo);
      const eq = resolveEquipment(exercise, equipment, userEquipment);
      const pe = template?.exercises.find((e) => e.key === se.plannedExerciseKey);
      exercises.push({
        se,
        exercise,
        plan,
        logs: (await r.workouts.listSetLogs(se.id)).sort((a, b) => a.setNo - b.setNo),
        stepKg: pe?.progression.stepKg ?? eq.stepKg,
        minKg: eq.minKg,
        maxKg: eq.maxKg,
        reasonText: plan[0]?.reasonText ?? '',
        reasonCode: plan[0]?.reasonCode ?? '',
        pe,
        ...(await noteAndRestInfo(r, deps, session, se, exercise.id, notes)),
      });
    }
    const customId = ps ? customWorkoutIdOf(ps.workoutKey) : null;
    const custom = customId ? await r.customWorkouts.get(customId) : undefined;
    const label = ps?.workoutKey === BODYWEIGHT_KEY ? 'Дома' : ps && isCustomWorkoutKey(ps.workoutKey) ? (custom?.name ?? 'Своя тренировка') : (template?.label ?? 'Тренировка');
    return { session, plannedSession: ps, version, label, custom: ps ? isCustomWorkoutKey(ps.workoutKey) : false, customWorkoutId: custom && custom.deletedAt === null ? custom.id : null, exercises };
  });
}

// ---------------------------------------------------------------- facts

export interface LogSetInput {
  sessionExerciseId: string;
  exerciseId: string;
  variantKey: string;
  contextKey: string;
  plannedSetId: string | null;
  setNo: number;
  setType?: SetType;
  weightKg: number | null;
  reps: number;
  rir: number | null;
  restSec?: number | null;
}

async function upsertLog(r: Repositories, deps: AppDeps, base: Omit<SetLog, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'deviceId'>): Promise<void> {
  const existing = (await r.workouts.listSetLogs(base.sessionExerciseId)).find((s) => s.setNo === base.setNo && s.setType === base.setType);
  await r.workouts.putSetLog(existing ? { ...existing, ...base } : { ...baseOf(deps), ...base });
}

/** Records a finished set. A working set needs RIR: the progression algorithm depends on it. */
export async function logSet(deps: AppDeps, input: LogSetInput): Promise<void> {
  const setType = input.setType ?? 'working';
  if (setType === 'working' && input.rir === null) throw new Error('Укажи, сколько повторений оставалось в запасе (RIR)');
  if (!(input.reps >= 1)) throw new Error('Укажи число повторений');
  await deps.uow.run(async (r) => {
    await upsertLog(r, deps, {
      sessionExerciseId: input.sessionExerciseId,
      plannedSetId: input.plannedSetId,
      exerciseId: input.exerciseId,
      variantKey: input.variantKey,
      contextKey: input.contextKey,
      setNo: input.setNo,
      setType,
      status: 'done',
      skipReason: null,
      painFlag: false,
      actualWeightKg: input.weightKg,
      actualReps: Math.round(input.reps),
      actualRir: setType === 'working' ? input.rir : null,
      restSec: input.restSec ?? null,
      note: null,
      completedAt: deps.clock.now(),
      source: 'live',
    });
  });
}

export async function skipSet(deps: AppDeps, input: Omit<LogSetInput, 'reps' | 'rir' | 'weightKg'> & { reason: SkipReason }): Promise<void> {
  await deps.uow.run((r) =>
    upsertLog(r, deps, {
      sessionExerciseId: input.sessionExerciseId,
      plannedSetId: input.plannedSetId,
      exerciseId: input.exerciseId,
      variantKey: input.variantKey,
      contextKey: input.contextKey,
      setNo: input.setNo,
      setType: input.setType ?? 'working',
      status: 'skipped',
      skipReason: input.reason,
      painFlag: input.reason === 'pain',
      actualWeightKg: null,
      actualReps: null,
      actualRir: null,
      restSec: null,
      note: null,
      completedAt: deps.clock.now(),
      source: 'live',
    }),
  );
}

/** Removes the record of a set (done or skipped by mistake): the set becomes available to be done again. */
export async function undoSet(deps: AppDeps, sessionExerciseId: string, setNo: number, setType: SetType = 'working'): Promise<void> {
  await deps.uow.run(async (r) => {
    const existing = (await r.workouts.listSetLogs(sessionExerciseId)).find((s) => s.setNo === setNo && s.setType === setType);
    if (existing) await r.workouts.softDeleteSetLog(existing.id);
  });
}

/** Adds one more working set to the exercise of this workout (a copy of the last planned set). */
export async function addSetToExercise(deps: AppDeps, sessionExerciseId: string): Promise<void> {
  await deps.uow.run(async (r) => {
    let session: WorkoutSession | undefined;
    let se: SessionExercise | undefined;
    for (const s of await r.workouts.listSessions()) {
      const found = (await r.workouts.listSessionExercises(s.id)).find((e) => e.id === sessionExerciseId);
      if (found) {
        se = found;
        session = s;
        break;
      }
    }
    if (!se || !session?.plannedSessionId) throw new Error('Упражнение не найдено');
    const plan = (await r.plannedSessions.listSets(session.plannedSessionId)).filter((p) => p.plannedExerciseKey === se.plannedExerciseKey && p.exerciseId === se.exerciseId).sort((a, b) => a.setNo - b.setNo);
    const last = plan[plan.length - 1];
    if (!last) throw new Error('У упражнения нет плана подходов');
    const { id: _id, ...rest } = last;
    void _id;
    await r.plannedSessions.putSets([{ ...rest, ...baseOf(deps), setNo: last.setNo + 1 }]);
    if (se.status === 'done') await r.workouts.putSessionExercise({ ...se, status: 'planned' });
  });
}

/** Takes the last planned set off an exercise of a running workout, if nothing is recorded for it (at least one set stays). */
export async function removeLastSet(deps: AppDeps, sessionExerciseId: string): Promise<void> {
  await deps.uow.run(async (r) => {
    let session: WorkoutSession | undefined;
    let se: SessionExercise | undefined;
    for (const s of await r.workouts.listSessions()) {
      const found = (await r.workouts.listSessionExercises(s.id)).find((e) => e.id === sessionExerciseId);
      if (found) {
        se = found;
        session = s;
        break;
      }
    }
    if (!se || !session?.plannedSessionId || session.status !== 'in_progress') throw new Error('Тренировка уже завершена');
    const plan = (await r.plannedSessions.listSets(session.plannedSessionId)).filter((p) => p.plannedExerciseKey === se.plannedExerciseKey && p.exerciseId === se.exerciseId).sort((a, b) => a.setNo - b.setNo);
    const last = plan[plan.length - 1];
    if (!last || plan.length < 2) throw new Error('Один подход должен остаться — можно убрать упражнение целиком');
    const logs = (await r.workouts.listSetLogs(se.id)).filter((l) => l.deletedAt === null && l.setType === 'working' && l.setNo === last.setNo);
    if (logs.length > 0) throw new Error('Этот подход уже записан — сначала отмени запись');
    await r.plannedSessions.putSets([{ ...last, deletedAt: deps.clock.now() }]);
  });
}

export interface PainReport {
  sessionExerciseId: string;
  exerciseId: string;
  variantKey: string;
  contextKey: string;
  plannedSetId: string | null;
  setNo: number;
  area: BodyArea;
  side: Side;
  intensity: number | null;
  note: string | null;
}

/** Pain is recorded as an event and the current set as skipped for pain; the answer is advice, never a diagnosis. */
export async function reportPain(deps: AppDeps, input: PainReport): Promise<PainAdvice> {
  return deps.uow.run(async (r) => {
    const now = deps.clock.now();
    const event = { ...baseOf(deps), occurredAt: now, area: input.area, side: input.side, intensity: input.intensity, injuryId: null, exerciseId: input.exerciseId, sessionExerciseId: input.sessionExerciseId, note: input.note };
    await r.painEvents.put(event);
    await upsertLog(r, deps, {
      sessionExerciseId: input.sessionExerciseId,
      plannedSetId: input.plannedSetId,
      exerciseId: input.exerciseId,
      variantKey: input.variantKey,
      contextKey: input.contextKey,
      setNo: input.setNo,
      setType: 'working',
      status: 'skipped',
      skipReason: 'pain',
      painFlag: true,
      actualWeightKg: null,
      actualReps: null,
      actualRir: null,
      restSec: null,
      note: input.note,
      completedAt: now,
      source: 'live',
    });
    return adviseOnPain({ area: input.area, intensity: input.intensity, now, history: await r.painEvents.listAll(), exerciseId: input.exerciseId });
  });
}

/**
 * Switches the grip / angle (variant) of an exercise in a running workout, before its first set.
 * Every variant has its own progression history, so the target weight is taken from that variant's own results.
 */
export async function changeExerciseVariant(deps: AppDeps, input: { sessionExerciseId: string; variantKey: string }): Promise<void> {
  await deps.uow.run(async (r) => {
    let se: SessionExercise | undefined;
    let session: WorkoutSession | undefined;
    for (const s of await r.workouts.listSessions()) {
      const found = (await r.workouts.listSessionExercises(s.id)).find((e) => e.id === input.sessionExerciseId);
      if (found) {
        se = found;
        session = s;
        break;
      }
    }
    if (!se || !session) throw new Error('Упражнение не найдено');
    if (se.variantKey === input.variantKey) return;
    if ((await r.workouts.listSetLogs(se.id)).length > 0) throw new Error('Хват можно менять только до первого подхода');
    const exercise = await r.exercises.get(se.exerciseId);
    if (!exercise || !exercise.variants.some((v) => v.key === input.variantKey)) throw new Error('Такого варианта нет');
    const version = await r.programs.getVersion(session.versionId);
    if (!version || !session.plannedSessionId) throw new Error('Версия программы не найдена');
    const planned = await r.plannedSessions.listSets(session.plannedSessionId);
    const old = planned.filter((p) => p.plannedExerciseKey === se.plannedExerciseKey && p.exerciseId === se.exerciseId).sort((a, b) => a.setNo - b.setNo);
    const ps = await r.plannedSessions.get(session.plannedSessionId);
    const template = version.training.workouts.find((w) => w.key === ps?.workoutKey);
    const fromProgram = template?.exercises.find((e) => e.key === se.plannedExerciseKey);
    const rir = old[0]?.targetRir ?? { min: 2, max: 3 };
    const pe: PlannedExercise = {
      ...(fromProgram ?? {
        key: se.plannedExerciseKey ?? 'x',
        exerciseId: exercise.id,
        position: se.position,
        sets: old.length || exercise.defaultSets,
        repMin: exercise.defaultRepRange.min,
        repMax: exercise.defaultRepRange.max,
        rirAdaptation: rir,
        rirMain: rir,
        restSec: exercise.defaultRestSec,
        startWeightKg: null,
        progression: { type: exercise.progressionType, stepKg: null },
      }),
      variantKey: input.variantKey,
    };
    const ctx = await prescriptionContext(r, deps, version, session.id);
    const p = await prescribe(r, deps, ctx, pe, exercise, old[0]?.reasonCode === 'deload_week');
    await r.workouts.putSessionExercise({ ...se, variantKey: input.variantKey });
    await r.plannedSessions.putSets(
      old.map((o) => ({
        ...o,
        variantKey: input.variantKey,
        contextKey: p.contextKey,
        targetWeightKg: p.prescription.weightKg,
        repMin: p.prescription.repTarget.min,
        repMax: p.prescription.repTarget.max,
        targetRir: p.prescription.rirTarget,
        reasonCode: o.reasonCode === 'deload_week' ? 'deload_week' : p.prescription.reasonCode,
        reasonText: p.prescription.reasonText.slice(0, 500),
      })),
    );
  });
}

/** Replaces an exercise for THIS session only (the program is not changed). The original stays in the history as replaced. */
export async function replaceExerciseInSession(deps: AppDeps, input: { sessionExerciseId: string; newExerciseId: string; reason: ReplacementReason }): Promise<void> {
  await deps.uow.run(async (r) => {
    const sessions = await r.workouts.listSessions();
    let original: SessionExercise | undefined;
    let session: WorkoutSession | undefined;
    for (const s of sessions) {
      const found = (await r.workouts.listSessionExercises(s.id)).find((e) => e.id === input.sessionExerciseId);
      if (found) {
        original = found;
        session = s;
        break;
      }
    }
    if (!original || !session) throw new Error('Упражнение не найдено');
    const version = await r.programs.getVersion(session.versionId);
    if (!version) throw new Error('Версия программы не найдена');
    const exercise = await r.exercises.get(input.newExerciseId);
    if (!exercise) throw new Error('Упражнение не найдено');
    const ps = session.plannedSessionId ? await r.plannedSessions.listSets(session.plannedSessionId) : [];
    const oldPlan = ps.filter((p) => p.plannedExerciseKey === original.plannedExerciseKey && p.exerciseId === original.exerciseId);
    const sets = oldPlan.length || 3;
    const rir = oldPlan[0]?.targetRir ?? { min: 2, max: 3 };
    const pe: PlannedExercise = {
      key: original.plannedExerciseKey ?? 'x',
      exerciseId: exercise.id,
      variantKey: 'default',
      position: original.position,
      sets,
      repMin: exercise.defaultRepRange.min,
      repMax: exercise.defaultRepRange.max,
      rirAdaptation: rir,
      rirMain: rir,
      restSec: exercise.defaultRestSec,
      startWeightKg: null,
      progression: { type: exercise.progressionType, stepKg: null },
    };
    const ctx = await prescriptionContext(r, deps, version, session.id);
    const p = await prescribe(r, deps, ctx, pe, exercise, false);
    const done = (await r.workouts.listSetLogs(original.id)).some((s) => s.status === 'done');
    await r.workouts.putSessionExercise({ ...original, status: done ? 'partial' : 'skipped', skipReason: done ? null : 'other' });
    await r.workouts.putSessionExercise({
      ...baseOf(deps),
      sessionId: session.id,
      exerciseId: exercise.id,
      variantKey: 'default',
      plannedExerciseKey: original.plannedExerciseKey,
      position: original.position,
      replacedFromExerciseId: original.exerciseId,
      replacementReason: input.reason,
      status: 'planned',
      skipReason: null,
      note: null,
    });
    if (session.plannedSessionId) await createSets(r, deps, session.plannedSessionId, pe.key, exercise, 'default', p, false);
  });
}

export async function finishWorkout(deps: AppDeps, sessionId: string, note: string | null): Promise<void> {
  await deps.uow.run(async (r) => {
    const session = await r.workouts.getSession(sessionId);
    if (!session) return;
    const planned = session.plannedSessionId ? await r.plannedSessions.listSets(session.plannedSessionId) : [];
    for (const se of await r.workouts.listSessionExercises(sessionId)) {
      if (se.status === 'skipped' && se.replacedFromExerciseId === null && se.skipReason) continue;
      const logs = await r.workouts.listSetLogs(se.id);
      const done = logs.filter((s) => s.status === 'done' && s.setType === 'working').length;
      const target = planned.filter((p) => p.plannedExerciseKey === se.plannedExerciseKey && p.exerciseId === se.exerciseId).length;
      const status = done === 0 ? 'skipped' : target > 0 && done < target ? 'partial' : 'done';
      if (se.status !== 'partial' || status !== 'skipped') await r.workouts.putSessionExercise({ ...se, status, skipReason: status === 'skipped' ? (se.skipReason ?? 'other') : null });
    }
    await r.workouts.putSession({ ...session, status: 'completed', endedAt: deps.clock.now(), note: note && note.trim() ? note.trim() : null });
    if (session.plannedSessionId) {
      const ps = await r.plannedSessions.get(session.plannedSessionId);
      if (ps) await r.plannedSessions.put({ ...ps, status: 'done' });
      // An own workout done instead of the program one: the program one counts as done, with a note.
      if (ps && (ps.movedReason ?? '').startsWith(REPLACES_KEY)) {
        const target = await r.plannedSessions.get((ps.movedReason as string).slice(REPLACES_KEY.length));
        if (target && target.status === 'planned') {
          const cwId = customWorkoutIdOf(ps.workoutKey);
          const cw = cwId ? await r.customWorkouts.get(cwId) : undefined;
          await r.plannedSessions.put({ ...target, status: 'done', movedReason: `${REPLACED_BY_OWN}${cw?.name ?? 'своя тренировка'}`.slice(0, 300) });
        }
      }
    }
  });
}

export async function abandonWorkout(deps: AppDeps, sessionId: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const session = await r.workouts.getSession(sessionId);
    if (!session) return;
    await r.workouts.putSession({ ...session, status: 'abandoned', endedAt: deps.clock.now() });
    const ps = session.plannedSessionId ? await r.plannedSessions.get(session.plannedSessionId) : undefined;
    if (ps && isAdHocWorkoutKey(ps.workoutKey)) await r.plannedSessions.softDelete(ps.id);
  });
}

/**
 * Deletes a workout from the history: its sets stop counting in the progression and the tonnage.
 * A program workout goes back to «planned»; an own/bodyweight one disappears from the calendar.
 * Records are soft-deleted, so a backup made before still has them.
 */
export async function deleteWorkout(deps: AppDeps, sessionId: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const session = await r.workouts.getSession(sessionId);
    if (!session) return;
    for (const se of await r.workouts.listSessionExercises(sessionId)) {
      for (const log of await r.workouts.listSetLogs(se.id)) await r.workouts.softDeleteSetLog(log.id);
      await r.workouts.softDeleteSessionExercise(se.id);
    }
    await r.workouts.putSession({ ...session, deletedAt: deps.clock.now() });
    const ps = session.plannedSessionId ? await r.plannedSessions.get(session.plannedSessionId) : undefined;
    if (!ps) return;
    if ((ps.movedReason ?? '').startsWith(REPLACES_KEY)) {
      const target = await r.plannedSessions.get((ps.movedReason as string).slice(REPLACES_KEY.length));
      if (target && target.status === 'done' && (target.movedReason ?? '').startsWith(REPLACED_BY_OWN)) await r.plannedSessions.put({ ...target, status: 'planned', movedReason: null });
    }
    if (isAdHocWorkoutKey(ps.workoutKey)) await r.plannedSessions.softDelete(ps.id);
    else if (ps.status === 'done') await r.plannedSessions.put({ ...ps, status: 'planned' });
  });
}

// ---------------------------------------------------------------- notes, likes, bodyweight

/** A comment on an exercise ("hard, watch the shoulder"). It is shown once, in the next workout with the same exercise. */
export async function saveExerciseNote(deps: AppDeps, input: { sessionId: string; exerciseId: string; text: string }): Promise<void> {
  const text = input.text.trim().slice(0, 500);
  await deps.uow.run(async (r) => {
    const existing = (await r.exerciseNotes.listAll()).find((n) => n.deletedAt === null && n.sessionId === input.sessionId && n.exerciseId === input.exerciseId);
    if (!text) {
      if (existing) await r.exerciseNotes.softDelete(existing.id);
      return;
    }
    if (existing) await r.exerciseNotes.put({ ...existing, text, shownInSessionId: null });
    else await r.exerciseNotes.put({ ...baseOf(deps), exerciseId: input.exerciseId, text, sessionId: input.sessionId, shownInSessionId: null });
  });
}

/** Like / dislike an exercise; null clears the mark. */
export async function setExercisePreference(deps: AppDeps, exerciseId: string, preference: 'like' | 'dislike' | null): Promise<void> {
  await deps.uow.run(async (r) => {
    const existing = (await r.userExercises.listAll()).find((u) => u.deletedAt === null && u.exerciseId === exerciseId);
    if (preference === null) {
      if (existing) await r.userExercises.softDelete(existing.id);
      return;
    }
    if (existing) await r.userExercises.put({ ...existing, preference });
    else await r.userExercises.put({ ...baseOf(deps), exerciseId, preference });
  });
  await rebuildForPreference(deps, exerciseId, preference);
}

/** A workout without equipment (business trip, home). Not a part of the program: the rotation and versions stay untouched. */
export async function startBodyweightWorkout(deps: AppDeps, homeEquipment: readonly string[] = []): Promise<string> {
  return deps.uow.run(async (r) => {
    const profile = await r.profile.get();
    const version = await activeVersion(r);
    if (!profile || !version) throw new Error('Сначала заполните профиль и создайте программу');
    const open = (await r.workouts.listSessions()).find((s) => s.status === 'in_progress');
    if (open) return open.id;
    const injuries = (await r.injuries.listAll()).filter((i) => i.resolvedOn === null);
    const userExercises = await r.userExercises.listAll();
    const ctx = safetyContext(
      { injuries, painEvents: await r.painEvents.listAll(), equipment: await r.equipment.listAll(), userEquipment: await r.userEquipment.listAll(), profile, userExercises },
      deps.clock.now(),
    );
    const template = buildBodyweightWorkout({ exercises: (await r.exercises.listAll()) as Exercise[], ctx, homeEquipment });
    if (template.exercises.length === 0) throw new Error('Не нашлось подходящих упражнений для домашней тренировки');
    const today = deps.clock.today(profile.timezone);
    const ps: PlannedSession = { ...baseOf(deps), versionId: version.id, workoutKey: BODYWEIGHT_KEY, plannedDate: today, status: 'planned', originalDate: null, movedReason: null };
    await r.plannedSessions.put(ps);
    const sessionId = deps.ids.newId();
    await r.workouts.putSession({ ...createBase(sessionId, deps.clock.now(), deps.deviceId), plannedSessionId: ps.id, versionId: version.id, startedAt: deps.clock.now(), endedAt: null, status: 'in_progress', note: null });
    const pctx = await prescriptionContext(r, deps, version, null);
    for (const pe of template.exercises) {
      const exercise = await r.exercises.get(pe.exerciseId);
      if (!exercise) continue;
      const p = await prescribe(r, deps, pctx, pe, exercise, false);
      await r.workouts.putSessionExercise({ ...baseOf(deps), sessionId, exerciseId: exercise.id, variantKey: pe.variantKey, plannedExerciseKey: pe.key, position: pe.position, replacedFromExerciseId: null, replacementReason: null, status: 'planned', skipReason: null, note: null });
      await createSets(r, deps, ps.id, pe.key, exercise, pe.variantKey, p, false);
    }
    return sessionId;
  });
}

// ---------------------------------------------------------------- plateau and deload

export interface TrainingAdvice {
  /** Exercises whose weight and reps have not grown for several sessions. */
  stalled: Array<{ exerciseId: string; name: string }>;
  deload: DeloadSuggestion;
  /** Names of the exercises behind the deload suggestion. */
  deloadNames: string[];
  weeksOfLoad: number;
}

/**
 * Looks at the exercises of the active program and reports a plateau (no growth for several sessions) and whether a lighter week is worth considering.
 * The engine's own signals are used: nothing here is a new rule.
 */
export async function loadTrainingAdvice(deps: AppDeps): Promise<TrainingAdvice | null> {
  return deps.uow.run(async (r) => {
    const version = await activeVersion(r);
    if (!version) return null;
    const ctx = await prescriptionContext(r, deps, version, null);
    if (ctx.history.length < 2) return null;
    const dateOf = (h: HistoryEntry): string => toLocalDate(h.session.startedAt, ctx.tz);
    const lastDate = new Map<string, string>();
    for (const h of ctx.history) for (const se of h.exercises) if (!lastDate.has(se.exerciseId) && (h.sets.get(se.id) ?? []).some((l) => l.status === 'done')) lastDate.set(se.exerciseId, dateOf(h));
    const seen = new Set<string>();
    const items: Array<{ exerciseId: string; lastSessionDate: string; signals: Array<'fatigue' | 'stall'> }> = [];
    const names = new Map<string, string>();
    for (const w of version.training.workouts) {
      for (const pe of w.exercises) {
        if (seen.has(pe.exerciseId) || !lastDate.has(pe.exerciseId)) continue;
        seen.add(pe.exerciseId);
        const exercise = await r.exercises.get(pe.exerciseId);
        if (!exercise) continue;
        names.set(exercise.id, exercise.name);
        const p = await prescribe(r, deps, ctx, pe, exercise, false);
        const codes = p.prescription.signals.map((x) => x.code).filter((c): c is 'fatigue' | 'stall' => c === 'fatigue' || c === 'stall');
        items.push({ exerciseId: exercise.id, lastSessionDate: lastDate.get(pe.exerciseId) as string, signals: codes });
      }
    }
    const sessionDates = ctx.history.map(dateOf);
    const deloadDates = ctx.history.filter((h) => h.planned.some((p) => p.reasonCode === 'deload_week')).map(dateOf);
    const since = deloadDates[0] ?? (sessionDates[sessionDates.length - 1] as string);
    const deload = evaluateDeloadSuggestion({ forDate: ctx.today, continuousLoadSince: since, recentWorkoutDates: sessionDates.slice(0, 2), exercises: items });
    const weeksOfLoad = Math.floor((new Date(ctx.today).getTime() - new Date(since).getTime()) / (7 * 86_400_000));
    return {
      stalled: items.filter((i) => i.signals.includes('stall')).map((i) => ({ exerciseId: i.exerciseId, name: names.get(i.exerciseId) ?? i.exerciseId })),
      deload,
      deloadNames: deload.exerciseIds.map((id) => names.get(id) ?? id),
      weeksOfLoad,
    };
  });
}

// ---------------------------------------------------------------- the summary

const isTimed = (e: Exercise): boolean => e.loadUnit === 'seconds' || e.progressionType === 'time';

/**
 * Summary of a workout (live or finished): active kcal range, tonnage, time and, per exercise, progress against the previous time.
 * The same numbers are shown after "Завершить" whether or not the live activity bar is switched on.
 */
export async function loadWorkoutSummary(deps: AppDeps, sessionId: string, bodyWeightKg: number): Promise<WorkoutSummary & { startedAt: string }> {
  return deps.uow.run(async (r) => {
    const session = await r.workouts.getSession(sessionId);
    if (!session) throw new Error('Тренировка не найдена');
    const inputs: SummaryExerciseInput[] = [];
    const completed: number[] = [];
    for (const se of (await r.workouts.listSessionExercises(sessionId)).sort((a, b) => a.position - b.position)) {
      const exercise = await r.exercises.get(se.exerciseId);
      if (!exercise) continue;
      const logs = (await r.workouts.listSetLogs(se.id)).filter((l) => l.status === 'done' && l.setType === 'working' && (l.actualReps ?? 0) > 0);
      for (const l of logs) if (l.completedAt) completed.push(Date.parse(l.completedAt));
      const earlier = (await r.workouts.listSetLogsByExercise(exercise.id)).filter((l) => l.status === 'done' && l.setType === 'working' && l.sessionExerciseId !== se.id && (l.completedAt ?? '') < session.startedAt && (l.actualReps ?? 0) > 0);
      const last = new Map<string, string>();
      for (const l of earlier) last.set(l.sessionExerciseId, [last.get(l.sessionExerciseId) ?? '', l.completedAt ?? ''].sort().pop() as string);
      const latestGroup = [...last.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1))[0]?.[0];
      const previousBest = latestGroup ? bestSet(earlier.filter((l) => l.sessionExerciseId === latestGroup).map((l) => ({ weightKg: l.actualWeightKg, reps: l.actualReps ?? 0 }))) : null;
      inputs.push({ exerciseId: exercise.id, name: exercise.name, compound: exercise.isCompound, timed: isTimed(exercise), sets: logs.map((l) => ({ weightKg: l.actualWeightKg, reps: l.actualReps ?? 0 })), previousBest });
    }
    const elapsedSec = sessionElapsedSec({ startedAtMs: Date.parse(session.startedAt), completedAtMs: completed, endedAtMs: session.endedAt ? Date.parse(session.endedAt) : null, nowMs: Date.now() });
    return { ...summarizeWorkout({ bodyWeightKg, exercises: inputs, elapsedSec }), startedAt: session.startedAt };
  });
}

// ---------------------------------------------------------------- own workouts (the builder)

/** movedReason of an own workout's session that replaces a program workout: links to that one. */
const REPLACES_KEY = 'replaces:';

const RIR_ADAPTATION = { min: 2, max: 3 };
const RIR_MAIN = { min: 1, max: 2 };
const clampRest = (sec: number): number => Math.min(600, Math.max(15, Math.round(sec)));

/** An exercise of an own workout in the form the progression engine takes: the weight comes from the history, as in the program. */
function plannedFromCustom(exercise: Exercise, e: Pick<CustomWorkoutExercise, 'sets' | 'repMin' | 'repMax' | 'restSec'>, key: string, position: number): PlannedExercise {
  return {
    key,
    exerciseId: exercise.id,
    variantKey: 'default',
    position,
    sets: e.sets,
    repMin: e.repMin,
    repMax: Math.max(e.repMin, e.repMax),
    rirAdaptation: RIR_ADAPTATION,
    rirMain: RIR_MAIN,
    restSec: clampRest(e.restSec),
    startWeightKg: null,
    progression: { type: exercise.progressionType, stepKg: null },
  };
}

/** Defaults of the catalog for an exercise added to an own workout. */
export const customDefaults = (exercise: Pick<Exercise, 'id' | 'defaultSets' | 'defaultRepRange' | 'defaultRestSec'>): CustomWorkoutExercise => ({
  exerciseId: exercise.id,
  sets: Math.min(10, Math.max(1, exercise.defaultSets)),
  repMin: exercise.defaultRepRange.min,
  repMax: Math.max(exercise.defaultRepRange.min, exercise.defaultRepRange.max),
  restSec: clampRest(exercise.defaultRestSec),
});

export interface CustomWorkoutInput {
  /** null creates a new one. */
  id: string | null;
  name: string;
  exercises: CustomWorkoutExercise[];
}

async function putCustomWorkout(r: Repositories, deps: AppDeps, input: CustomWorkoutInput): Promise<string> {
  if (input.exercises.length === 0) throw new Error('Добавь хотя бы одно упражнение');
  if (input.exercises.length > 20) throw new Error('Не больше 20 упражнений в одной тренировке');
  const exercises = input.exercises.map((e) => ({ ...e, repMax: Math.max(e.repMin, e.repMax), restSec: clampRest(e.restSec) }));
  const all = (await r.customWorkouts.listAll()).filter((t) => t.deletedAt === null);
  const existing = input.id ? all.find((t) => t.id === input.id) : undefined;
  if (input.id && !existing) throw new Error('Тренировка не найдена');
  // The name is optional: without one it is made from the exercises; a taken name gets a number.
  let base = input.name.trim().slice(0, 60);
  if (!base) {
    const list: Array<{ name: string; primaryMuscles: Exercise['primaryMuscles'] }> = [];
    for (const e of exercises) {
      const ex = await r.exercises.get(e.exerciseId);
      if (ex) list.push({ name: ex.name, primaryMuscles: ex.primaryMuscles });
    }
    base = autoWorkoutName(list);
  }
  const name = uniqueName(base, all.filter((t) => t.id !== input.id).map((t) => t.name));
  const row: CustomWorkout = existing ? { ...existing, name, exercises } : { ...baseOf(deps), name, exercises, useCount: 0, lastUsedOn: null };
  await r.customWorkouts.put(row);
  return row.id;
}

/** Creates or changes an own workout. The name is optional and unique (a number is added), so the list stays readable. */
export async function saveCustomWorkout(deps: AppDeps, input: CustomWorkoutInput): Promise<string> {
  return deps.uow.run((r) => putCustomWorkout(r, deps, input));
}

/** Deletes an own workout. Workouts already done with it stay in the history. */
export async function deleteCustomWorkout(deps: AppDeps, id: string): Promise<void> {
  await deps.uow.run((r) => r.customWorkouts.softDelete(id));
}

/**
 * Starts an own workout (or an empty one, when id is null: the exercises are added on the go).
 * It is not a part of the program: the calendar, the rotation and the versions stay untouched,
 * but the weights are prescribed from the same history, so the progress carries over both ways.
 */
export async function startCustomWorkout(deps: AppDeps, id: string | null, options: { /** The program workout of the day it replaces: marked done with a note when this one is finished. */ replaces?: string } = {}): Promise<string> {
  return deps.uow.run(async (r) => {
    const profile = await r.profile.get();
    const version = await activeVersion(r);
    if (!profile || !version) throw new Error('Сначала заполни профиль и создай программу');
    const cw = id ? await r.customWorkouts.get(id) : undefined;
    if (id && (!cw || cw.deletedAt !== null)) throw new Error('Тренировка не найдена');
    // Another workout in progress does not block this one. The same own workout already started is resumed.
    if (cw) {
      for (const s of (await r.workouts.listSessions()).filter((x) => x.status === 'in_progress' && x.plannedSessionId)) {
        const ps = await r.plannedSessions.get(s.plannedSessionId as string);
        if (ps && ps.workoutKey === customWorkoutKey(cw.id)) return s.id;
      }
    }
    let replacesNote: string | null = null;
    if (options.replaces) {
      const target = await r.plannedSessions.get(options.replaces);
      if (!target || target.status !== 'planned' || isAdHocWorkoutKey(target.workoutKey)) throw new Error('Эту тренировку программы уже нельзя заменить');
      replacesNote = `${REPLACES_KEY}${target.id}`;
    }
    const today = deps.clock.today(profile.timezone);
    const ps: PlannedSession = { ...baseOf(deps), versionId: version.id, workoutKey: customWorkoutKey(cw ? cw.id : null), plannedDate: today, status: 'planned', originalDate: null, movedReason: replacesNote };
    await r.plannedSessions.put(ps);
    const sessionId = deps.ids.newId();
    await r.workouts.putSession({ ...createBase(sessionId, deps.clock.now(), deps.deviceId), plannedSessionId: ps.id, versionId: version.id, startedAt: deps.clock.now(), endedAt: null, status: 'in_progress', note: null });
    if (cw) {
      const pctx = await prescriptionContext(r, deps, version, null);
      let position = 0;
      for (const e of cw.exercises) {
        const exercise = await r.exercises.get(e.exerciseId);
        if (!exercise || exercise.deletedAt !== null) continue;
        position++;
        const pe = plannedFromCustom(exercise, e, `cw_${position}`, position);
        const p = await prescribe(r, deps, pctx, pe, exercise, false);
        await r.workouts.putSessionExercise({ ...baseOf(deps), sessionId, exerciseId: exercise.id, variantKey: pe.variantKey, plannedExerciseKey: pe.key, position, replacedFromExerciseId: null, replacementReason: null, status: 'planned', skipReason: null, note: null });
        await createSets(r, deps, ps.id, pe.key, exercise, pe.variantKey, p, false);
      }
      await r.customWorkouts.put({ ...cw, useCount: cw.useCount + 1, lastUsedOn: today });
    }
    return sessionId;
  });
}

/** Adds an exercise to a running workout (any: program, home or own). The weight is prescribed from its history. */
export async function addExerciseToSession(deps: AppDeps, input: { sessionId: string; exerciseId: string; /** Journal style: start with this many sets and add more by hand. */ sets?: number }): Promise<string> {
  return deps.uow.run(async (r) => {
    const session = await r.workouts.getSession(input.sessionId);
    if (!session || session.status !== 'in_progress' || !session.plannedSessionId) throw new Error('Тренировка уже завершена');
    const version = await r.programs.getVersion(session.versionId);
    if (!version) throw new Error('Версия программы не найдена');
    const exercise = await r.exercises.get(input.exerciseId);
    if (!exercise || exercise.deletedAt !== null) throw new Error('Упражнение не найдено');
    const ses = await r.workouts.listSessionExercises(session.id);
    const planned = await r.plannedSessions.listSets(session.plannedSessionId);
    const usedKeys = new Set([...planned.map((p) => p.plannedExerciseKey), ...ses.map((e) => e.plannedExerciseKey ?? '')]);
    const position = ses.reduce((m, e) => Math.max(m, e.position), 0) + 1;
    let n = position;
    while (usedKeys.has(`add_${n}`)) n++;
    const def = customDefaults(exercise);
    const pe = plannedFromCustom(exercise, { ...def, sets: input.sets ? Math.min(10, Math.max(1, Math.round(input.sets))) : def.sets }, `add_${n}`, position);
    const deload = planned.length > 0 && planned.every((p) => p.reasonCode === 'deload_week');
    const ctx = await prescriptionContext(r, deps, version, session.id);
    const p = await prescribe(r, deps, ctx, pe, exercise, deload);
    const seId = deps.ids.newId();
    await r.workouts.putSessionExercise({ ...createBase(seId, deps.clock.now(), deps.deviceId), sessionId: session.id, exerciseId: exercise.id, variantKey: pe.variantKey, plannedExerciseKey: pe.key, position, replacedFromExerciseId: null, replacementReason: null, status: 'planned', skipReason: null, note: null });
    await createSets(r, deps, session.plannedSessionId, pe.key, exercise, pe.variantKey, p, deload);
    return seId;
  });
}

/** Can this exercise be taken out of the running workout: added by hand (or in an own workout) and nothing recorded yet. */
export const canRemoveFromSession = (ev: Pick<WorkoutExerciseView, 'se' | 'logs'>, custom: boolean): boolean =>
  ev.logs.length === 0 && ev.se.replacedFromExerciseId === null && (custom || (ev.se.plannedExerciseKey ?? '').startsWith('add_'));

/** Takes an exercise out of the running workout (added by mistake). Only before its first set. */
export async function removeExerciseFromSession(deps: AppDeps, sessionExerciseId: string): Promise<void> {
  await deps.uow.run(async (r) => {
    for (const s of await r.workouts.listSessions()) {
      if (s.status !== 'in_progress') continue;
      const se = (await r.workouts.listSessionExercises(s.id)).find((e) => e.id === sessionExerciseId);
      if (!se) continue;
      if ((await r.workouts.listSetLogs(se.id)).length > 0) throw new Error('В упражнении уже есть записанные подходы');
      await r.workouts.softDeleteSessionExercise(se.id);
      return;
    }
    throw new Error('Упражнение не найдено');
  });
}

/**
 * Saves what was done in a workout as an own workout, to repeat it: the exercises with recorded sets,
 * as many sets as were done, the rep ranges and rests of the plan. With replaceId it updates that one.
 */
export async function saveSessionAsCustomWorkout(deps: AppDeps, input: { sessionId: string; name: string; replaceId: string | null }): Promise<string> {
  return deps.uow.run(async (r) => {
    const session = await r.workouts.getSession(input.sessionId);
    if (!session) throw new Error('Тренировка не найдена');
    const ps = session.plannedSessionId ? await r.plannedSessions.get(session.plannedSessionId) : undefined;
    const planned = ps ? await r.plannedSessions.listSets(ps.id) : [];
    const sourceId = ps ? customWorkoutIdOf(ps.workoutKey) : null;
    const source = sourceId ? await r.customWorkouts.get(sourceId) : undefined;
    const rows: Array<{ e: CustomWorkoutExercise; done: number }> = [];
    for (const se of await r.workouts.listSessionExercises(session.id)) {
      const exercise = await r.exercises.get(se.exerciseId);
      if (!exercise) continue;
      const logs = await r.workouts.listSetLogs(se.id);
      const done = logs.filter((l) => l.status === 'done' && l.setType === 'working').length;
      const plan = planned.filter((p) => p.plannedExerciseKey === se.plannedExerciseKey && p.exerciseId === se.exerciseId);
      if (done === 0 && se.status === 'skipped') continue;
      const fromSource = source?.exercises.find((x) => x.exerciseId === exercise.id);
      const def = customDefaults(exercise);
      rows.push({
        done,
        e: {
          exerciseId: exercise.id,
          sets: Math.min(10, Math.max(1, done || plan.length || def.sets)),
          repMin: fromSource?.repMin ?? plan[0]?.repMin ?? def.repMin,
          repMax: fromSource?.repMax ?? plan[0]?.repMax ?? def.repMax,
          restSec: fromSource?.restSec ?? clampRest(plan[0]?.restSec ?? def.restSec),
        },
      });
    }
    const withWork = rows.some((x) => x.done > 0) ? rows.filter((x) => x.done > 0) : rows;
    const id = await putCustomWorkout(r, deps, { id: input.replaceId, name: input.name, exercises: withWork.map((x) => x.e).slice(0, 20) });
    // An empty or own workout is now "this" saved one: its name shows in the workout and the history.
    if (ps && isCustomWorkoutKey(ps.workoutKey) && (sourceId === null || sourceId === input.replaceId)) await r.plannedSessions.put({ ...ps, workoutKey: customWorkoutKey(id) });
    return id;
  });
}
