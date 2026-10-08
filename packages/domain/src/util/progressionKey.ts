import { z } from 'zod';

/**
 * Progression history is not tied to exerciseId alone: the same exercise done
 * in another variant (angle, one/two dumbbells), rep range or on different
 * equipment is a different "prescription context" with its own history.
 */
export const ProgressionContext = z
  .object({
    exerciseId: z.string().min(1),
    variantKey: z.string().min(1).default('default'),
    repMin: z.number().int().min(1),
    repMax: z.number().int().min(1),
    equipmentId: z.string().min(1).nullable().default(null),
  })
  .refine((c) => c.repMin <= c.repMax, 'repMin must be <= repMax');
export type ProgressionContext = z.input<typeof ProgressionContext>;

export function progressionKey(input: ProgressionContext): string {
  const c = ProgressionContext.parse(input);
  const base = `${c.exerciseId}::${c.variantKey}::${c.repMin}-${c.repMax}`;
  return c.equipmentId ? `${base}::eq=${c.equipmentId}` : base;
}
