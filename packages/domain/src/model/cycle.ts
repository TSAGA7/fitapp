import { z } from 'zod';
import { LocalDateSchema } from './common';

/**
 * How the menstrual cycle is tracked. It lives inside the profile record, so it travels with every backup and import.
 * "dates": the phase is worked out from the first day of the last period and the cycle length.
 * "manual": the user only says whether the period is going on right now.
 */
export const CycleMode = z.enum(['dates', 'manual']);
export type CycleMode = z.infer<typeof CycleMode>;

export const CycleSettings = z.object({
  enabled: z.boolean(),
  mode: CycleMode,
  /** First day of the most recent period (mode "dates"). */
  lastPeriodStart: LocalDateSchema.nullable(),
  /** Typical cycle length, first day to the day before the next first day. */
  cycleLengthDays: z.number().int().min(21).max(45),
  /** How many days the period itself usually lasts. */
  periodLengthDays: z.number().int().min(2).max(10),
  /** Mode "manual": the period is going on now, since this day. */
  manualSince: LocalDateSchema.nullable(),
  /** First days of earlier periods (newest last), to learn the real cycle length. */
  history: z.array(LocalDateSchema).max(24),
});
export type CycleSettings = z.infer<typeof CycleSettings>;

export const DEFAULT_CYCLE: CycleSettings = { enabled: false, mode: 'dates', lastPeriodStart: null, cycleLengthDays: 28, periodLengthDays: 5, manualSince: null, history: [] };

/** How the body feels today, asked once a day. */
export const Feeling = z.enum(['good', 'ok', 'bad']);
export type Feeling = z.infer<typeof Feeling>;

export const Symptom = z.enum(['cramps', 'fatigue', 'headache', 'bloating', 'mood', 'back_pain']);
export type Symptom = z.infer<typeof Symptom>;
