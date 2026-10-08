import { z } from 'zod';
import { entityBase, LocalDateSchema } from './common';
import { FocusArea, GoalStatus, GoalType } from './enums';

export const Goal = z.object({
  ...entityBase,
  type: GoalType,
  /** 1 = main goal. */
  priority: z.number().int().min(1).max(5),
  status: GoalStatus,
  startedOn: LocalDateSchema,
  endedOn: LocalDateSchema.nullable(),
  targetWeightKg: z.number().positive().nullable(),
  targetWaistCm: z.number().positive().nullable(),
  /** Zones to emphasise (weight 1-3). Not queried separately, so embedded. */
  focus: z.array(z.object({ area: FocusArea, weight: z.number().int().min(1).max(3) })),
});
export type Goal = z.infer<typeof Goal>;
