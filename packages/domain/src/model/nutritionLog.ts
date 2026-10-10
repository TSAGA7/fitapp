import { z } from 'zod';
import { entityBase, LocalDateSchema, Macros } from './common';
import { Feeling, Symptom } from './cycle';
import { FoodBasis, FoodLogEntryType, MealPlanStatus, MealSlot } from './enums';
import { FoodDataSource, Per100 } from './food';

/**
 * Everything the calculation of an entry was based on. Stored with each
 * diary entry so that history does not change when a food is edited later.
 */
export const NutritionSnapshot = z.object({
  foodId: z.string().min(1),
  foodName: z.string().min(1),
  basis: FoodBasis,
  per100: Per100,
  gramsPerPiece: z.number().positive().nullable(),
  /** Set when the amount was converted between cooked and raw weight. */
  yieldFactorUsed: z.number().positive().nullable(),
  /** The basis the user typed the amount in. */
  enteredBasis: FoodBasis,
  dataSource: FoodDataSource,
});
export type NutritionSnapshot = z.infer<typeof NutritionSnapshot>;

export const MealPlan = z.object({
  ...entityBase,
  weekStart: LocalDateSchema,
  versionId: z.string().min(1),
  status: MealPlanStatus,
  generatedBy: z.enum(['engine', 'user', 'ai']),
  /** Seed of the deterministic generator, so a plan can be reproduced. */
  generatorSeed: z.string().nullable(),
});
export type MealPlan = z.infer<typeof MealPlan>;

/** PLAN. The day is derived from `date`; no separate day entity. */
export const PlannedItem = z.object({
  ...entityBase,
  planId: z.string().min(1),
  date: LocalDateSchema,
  slot: MealSlot,
  foodId: z.string().min(1),
  plannedAmountG: z.number().positive(),
  plannedMacros: Macros,
  locked: z.boolean(),
  replacedFromItemId: z.string().nullable(),
});
export type PlannedItem = z.infer<typeof PlannedItem>;

/** FACT. Separate from the plan: it can follow it, differ from it, or have no plan at all. */
export const FoodLog = z
  .object({
    ...entityBase,
    date: LocalDateSchema,
    slot: MealSlot,
    entryType: FoodLogEntryType,
    plannedItemId: z.string().nullable(),
    actualAmountG: z.number().min(0),
    snapshot: NutritionSnapshot,
    macros: Macros,
    note: z.string().max(500).nullable(),
  })
  .superRefine((l, ctx) => {
    if (l.entryType === 'skipped_planned') {
      if (l.plannedItemId === null) ctx.addIssue({ code: 'custom', path: ['plannedItemId'], message: 'A skipped entry must reference a plan item' });
      if (l.actualAmountG !== 0) ctx.addIssue({ code: 'custom', path: ['actualAmountG'], message: 'A skipped entry has zero amount' });
    } else if (l.actualAmountG <= 0) {
      ctx.addIssue({ code: 'custom', path: ['actualAmountG'], message: 'Amount must be positive' });
    }
    if (l.entryType === 'unplanned' && l.plannedItemId !== null) {
      ctx.addIssue({ code: 'custom', path: ['plannedItemId'], message: 'An unplanned entry has no plan item' });
    }
  });
export type FoodLog = z.infer<typeof FoodLog>;

export const DailyLog = z.object({
  ...entityBase,
  date: LocalDateSchema,
  waterMl: z.number().min(0).nullable(),
  note: z.string().max(1000).nullable(),
  /** How the body felt that day and what bothered (cycle tracking). Optional for old records. */
  feeling: Feeling.nullable().optional(),
  symptoms: z.array(Symptom).max(6).optional(),
});
export type DailyLog = z.infer<typeof DailyLog>;
