import { z } from 'zod';
import { entityBase, IsoDateTime, LocalDateSchema } from './common';
import { BodyArea, InjuryStatus, Side, TriggerKind } from './enums';

/**
 * Self-reported pain point / past injury. This is a constraint factor for
 * exercise selection, NOT a medical record and never a diagnosis.
 */
export const Injury = z.object({
  ...entityBase,
  area: BodyArea,
  side: Side,
  status: InjuryStatus,
  triggerKinds: z.array(TriggerKind),
  triggerText: z.string().max(500).nullable(),
  notes: z.string().max(2000).nullable(),
  resolvedOn: LocalDateSchema.nullable(),
});
export type Injury = z.infer<typeof Injury>;

/**
 * A pain event is a fact ("hurt during this exercise"). It never blocks an
 * exercise by itself: it triggers a warning, safe alternatives and, if it
 * repeats, a proposal to replace the exercise.
 */
export const PainEvent = z.object({
  ...entityBase,
  occurredAt: IsoDateTime,
  area: BodyArea,
  side: Side,
  intensity: z.number().int().min(0).max(10).nullable(),
  injuryId: z.string().nullable(),
  exerciseId: z.string().nullable(),
  sessionExerciseId: z.string().nullable(),
  note: z.string().max(1000).nullable(),
});
export type PainEvent = z.infer<typeof PainEvent>;
