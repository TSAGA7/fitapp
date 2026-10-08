import type { AppDeps } from '@fitapp/application';
import {
  adviseOnPain,
  buildDeloadPrescription,
  createBase,
  inAdaptation,
  nextPrescription,
  progressionKey,
  scheduleWindow,
  toLocalDate,
  addDays,
  type BodyArea,
  type Exercise,
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
} from '@fitapp/domain';
import { resolveEquipment } from '../app/derive';

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
    const existing = await r.plannedSessions.listByDateRange({ from: addDays(today, -60), to: addDays(today, horizon + 7) });
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
  const recent = await r.plannedSessions.listByDateRange({ from: addDays(today, -14), to: addDays(today, -1) });
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
}
export interface WorkoutView {
  session: WorkoutSession;
  plannedSession: PlannedSession | undefined;
  version: ProgramVersion | undefined;
  label: string;
  exercises: WorkoutExerciseView[];
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
      });
    }
    return { session, plannedSession: ps, version, label: template?.label ?? 'Тренировка', exercises };
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

export async function undoSet(deps: AppDeps, sessionExerciseId: string, setNo: number, setType: SetType = 'working'): Promise<void> {
  await deps.uow.run(async (r) => {
    const existing = (await r.workouts.listSetLogs(sessionExerciseId)).find((s) => s.setNo === setNo && s.setType === setType);
    if (!existing) return;
    // Set logs are append-only records; "undo" turns the entry into a skipped one the user can redo.
    await r.workouts.putSetLog({ ...existing, status: 'skipped', skipReason: 'other', actualReps: null, actualRir: null, actualWeightKg: null, completedAt: deps.clock.now() });
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
    }
  });
}

export async function abandonWorkout(deps: AppDeps, sessionId: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const session = await r.workouts.getSession(sessionId);
    if (session) await r.workouts.putSession({ ...session, status: 'abandoned', endedAt: deps.clock.now() });
  });
}
