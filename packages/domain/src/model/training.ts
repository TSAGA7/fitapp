import { z } from 'zod';
import { entityBase, IsoDateTime, LocalDateSchema, Rir, RirRange } from './common';
import {
  PlannedSessionStatus,
  ReplacementReason,
  SessionExerciseStatus,
  SessionStatus,
  SetStatus,
  SetType,
  SkipReason,
} from './enums';

/** Moving a missed workout changes the date only; it never creates a new program version. */
export const PlannedSession = z.object({
  ...entityBase,
  versionId: z.string().min(1),
  workoutKey: z.string().min(1),
  plannedDate: LocalDateSchema,
  status: PlannedSessionStatus,
  originalDate: LocalDateSchema.nullable(),
  movedReason: z.string().max(300).nullable(),
});
export type PlannedSession = z.infer<typeof PlannedSession>;

/** PLAN for one set, produced for a concrete session (with the reason for the numbers). */
export const PlannedSet = z.object({
  ...entityBase,
  plannedSessionId: z.string().min(1),
  plannedExerciseKey: z.string().min(1),
  exerciseId: z.string().min(1),
  variantKey: z.string().min(1),
  contextKey: z.string().min(1),
  setNo: z.number().int().min(1),
  targetWeightKg: z.number().min(0).nullable(),
  repMin: z.number().int().min(1),
  repMax: z.number().int().min(1),
  targetRir: RirRange,
  restSec: z.number().int().min(0),
  reasonCode: z.string().min(1),
  reasonText: z.string().min(1).max(500),
});
export type PlannedSet = z.infer<typeof PlannedSet>;

export const WorkoutSession = z.object({
  ...entityBase,
  plannedSessionId: z.string().nullable(),
  versionId: z.string().min(1),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.nullable(),
  status: SessionStatus,
  note: z.string().max(1000).nullable(),
});
export type WorkoutSession = z.infer<typeof WorkoutSession>;

export const SessionExercise = z
  .object({
    ...entityBase,
    sessionId: z.string().min(1),
    exerciseId: z.string().min(1),
    variantKey: z.string().min(1),
    plannedExerciseKey: z.string().nullable(),
    position: z.number().int().min(1),
    replacedFromExerciseId: z.string().nullable(),
    replacementReason: ReplacementReason.nullable(),
    status: SessionExerciseStatus,
    skipReason: SkipReason.nullable(),
    note: z.string().max(1000).nullable(),
  })
  .superRefine((e, ctx) => {
    if ((e.replacedFromExerciseId === null) !== (e.replacementReason === null)) {
      ctx.addIssue({ code: 'custom', path: ['replacementReason'], message: 'A replacement needs both the original exercise and a reason' });
    }
  });
export type SessionExercise = z.infer<typeof SessionExercise>;

/** Where a fact set comes from. It is only the origin of the data and is never a progression signal. */
export const SetSource = z.enum(['live', 'import']);
export type SetSource = z.infer<typeof SetSource>;

/**
 * FACT for one set. For `live` sets RIR is required when a working set is finished (the progression
 * algorithm uses it). Sets imported from old records (`import`) may have no RIR: it is never invented.
 */
export const SetLog = z
  .object({
    ...entityBase,
    sessionExerciseId: z.string().min(1),
    plannedSetId: z.string().nullable(),
    exerciseId: z.string().min(1),
    variantKey: z.string().min(1),
    /** progressionKey(exercise, variant, rep range, equipment) of the prescription. */
    contextKey: z.string().min(1),
    setNo: z.number().int().min(1),
    setType: SetType,
    status: SetStatus,
    skipReason: SkipReason.nullable(),
    painFlag: z.boolean(),
    actualWeightKg: z.number().min(0).nullable(),
    actualReps: z.number().int().min(0).nullable(),
    actualRir: Rir.nullable(),
    restSec: z.number().int().min(0).nullable(),
    note: z.string().max(1000).nullable(),
    completedAt: IsoDateTime.nullable(),
    source: SetSource.default('live'),
  })
  .superRefine((s, ctx) => {
    if (s.status === 'done') {
      if (s.actualReps === null || s.actualReps < 1) ctx.addIssue({ code: 'custom', path: ['actualReps'], message: 'A finished set needs reps' });
      if (s.source === 'live' && s.setType === 'working' && s.actualRir === null) {
        ctx.addIssue({ code: 'custom', path: ['actualRir'], message: 'RIR is required for a finished working set' });
      }
    }
    if (s.status === 'skipped' && s.skipReason === null) {
      ctx.addIssue({ code: 'custom', path: ['skipReason'], message: 'A skipped set needs a reason' });
    }
    if (s.skipReason === 'pain' && !s.painFlag) {
      ctx.addIssue({ code: 'custom', path: ['painFlag'], message: 'Skip reason "pain" requires painFlag' });
    }
  });
export type SetLog = z.infer<typeof SetLog>;
