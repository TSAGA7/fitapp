import { z } from 'zod';
import { entityBase, LocalDateSchema } from './common';
import { MealSlot } from './enums';

/** A meal the user eats again and again ("my usual breakfast"): a named list of foods with amounts, added to any day in one tap. */
export const MealTemplate = z.object({
  ...entityBase,
  name: z.string().trim().min(1).max(80),
  /** The meal it is usually eaten at (a hint for sorting; it can be added to any meal). */
  slot: MealSlot.nullable(),
  items: z
    .array(z.object({ foodId: z.string().min(1), grams: z.number().positive().max(5000) }))
    .min(1)
    .max(30),
  useCount: z.number().int().min(0),
  lastUsedOn: LocalDateSchema.nullable(),
});
export type MealTemplate = z.infer<typeof MealTemplate>;
