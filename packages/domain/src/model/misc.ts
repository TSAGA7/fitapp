import { z } from 'zod';
import { entityBase, LocalDateSchema } from './common';

/** Rebuildable cache of weekly aggregates; safe to delete and recompute. */
export const WeeklySummary = z.object({
  ...entityBase,
  weekStart: LocalDateSchema,
  data: z.record(z.string(), z.unknown()),
});
export type WeeklySummary = z.infer<typeof WeeklySummary>;

/** Reserved for the photo feature; not exposed in V1.0. */
export const ProgressPhoto = z.object({
  ...entityBase,
  takenOn: LocalDateSchema,
  angle: z.enum(['front', 'side', 'back']),
  blobKey: z.string().min(1),
  note: z.string().max(500).nullable(),
});
export type ProgressPhoto = z.infer<typeof ProgressPhoto>;
