import { z } from 'zod';
import { isLocalDate } from '../util/localDate';

export const LocalDateSchema = z.string().refine(isLocalDate, 'Expected a calendar date YYYY-MM-DD');
export const IsoDateTime = z.string().datetime({ offset: true });

/**
 * Entity ids are UUID v7 for user data (generated on the device, sortable by
 * time) and stable slugs ("ex_leg_press") for seed catalog items.
 */
export const EntityId = z.string().min(1).max(120);

/**
 * RIR as stored: 0, 1, 2, 3 or 4, where 4 means "4 or more reps in reserve".
 */
export const Rir = z.number().int().min(0).max(4);
export const RirRange = z
  .object({ min: Rir, max: Rir })
  .refine((r) => r.min <= r.max, 'RIR min must be <= max');

export const entityBase = {
  id: EntityId,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** Soft delete: kept so that a future sync can propagate the deletion. */
  deletedAt: IsoDateTime.nullable(),
  deviceId: z.string().min(1),
};
export type EntityBase = {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deviceId: string;
};

export function createBase(id: string, now: string, deviceId: string): EntityBase {
  return { id, createdAt: now, updatedAt: now, deletedAt: null, deviceId };
}

export function touch<T extends EntityBase>(entity: T, now: string): T {
  return { ...entity, updatedAt: now };
}

export function markDeleted<T extends EntityBase>(entity: T, now: string): T {
  return { ...entity, updatedAt: now, deletedAt: now };
}

export const Macros = z.object({
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  fatG: z.number().min(0),
  carbG: z.number().min(0),
  fiberG: z.number().min(0),
});
export type Macros = z.infer<typeof Macros>;

export const NutritionTargets = Macros.extend({
  waterMl: z.number().min(0),
});
export type NutritionTargets = z.infer<typeof NutritionTargets>;
