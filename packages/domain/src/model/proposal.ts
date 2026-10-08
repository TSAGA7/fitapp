import { z } from 'zod';
import { entityBase, IsoDateTime, NutritionTargets } from './common';
import { ProposalOrigin, ProposalStatus } from './enums';
import { PlannedExercise } from './program';

const key = z.string().regex(/^[a-z0-9_]+$/);

export const TrainingPlanOp = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('replace_exercise'),
    workoutKey: key,
    plannedExerciseKey: key,
    withExerciseId: z.string().min(1),
    withVariantKey: z.string().min(1),
  }),
  z.object({
    op: z.literal('set_prescription'),
    workoutKey: key,
    plannedExerciseKey: key,
    sets: z.number().int().min(1).max(10).optional(),
    repMin: z.number().int().min(1).optional(),
    repMax: z.number().int().min(1).optional(),
    restSec: z.number().int().min(0).max(600).optional(),
  }),
  z.object({ op: z.literal('add_exercise'), workoutKey: key, exercise: PlannedExercise }),
  z.object({ op: z.literal('remove_exercise'), workoutKey: key, plannedExerciseKey: key }),
]);
export type TrainingPlanOp = z.infer<typeof TrainingPlanOp>;

export const ProposalPayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('nutrition_targets'), targets: NutritionTargets }),
  z.object({ kind: z.literal('training_plan_edit'), ops: z.array(TrainingPlanOp).min(1) }),
]);
export type ProposalPayload = z.infer<typeof ProposalPayload>;

export const ValidationIssue = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().nullable(),
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

/**
 * context -> source (engine now, AI later) -> JSON -> Zod -> domain validator
 * -> draft -> user approval -> new version. A proposal never edits data itself.
 */
export const Proposal = z.object({
  ...entityBase,
  source: ProposalOrigin,
  baseVersionId: z.string().min(1),
  payload: ProposalPayload,
  reasonCode: z.string().min(1),
  reasonText: z.string().min(1).max(500),
  evidence: z.record(z.string(), z.unknown()),
  validation: z.object({ ok: z.boolean(), issues: z.array(ValidationIssue) }),
  status: ProposalStatus,
  decidedAt: IsoDateTime.nullable(),
});
export type Proposal = z.infer<typeof Proposal>;
