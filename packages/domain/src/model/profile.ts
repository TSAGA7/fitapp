import { z } from 'zod';
import { entityBase, LocalDateSchema } from './common';
import { CycleSettings } from './cycle';
import { Experience, JobActivity, Sex, UnitSystem } from './enums';
import { WEEKDAYS, WeekdaySchema, type Weekday } from './weekday';

/** Concrete training days, e.g. Monday / Wednesday / Saturday. */
export const TrainingSchedule = z
  .object({
    monday: z.boolean(),
    tuesday: z.boolean(),
    wednesday: z.boolean(),
    thursday: z.boolean(),
    friday: z.boolean(),
    saturday: z.boolean(),
    sunday: z.boolean(),
  })
  .refine((s) => {
    const n = WEEKDAYS.filter((d) => s[d]).length;
    return n >= 1 && n <= 6;
  }, 'Choose from 1 to 6 training days');
export type TrainingSchedule = z.infer<typeof TrainingSchedule>;

export function trainingDays(schedule: TrainingSchedule): Weekday[] {
  return WEEKDAYS.filter((d) => schedule[d]);
}

export const Profile = z.object({
  ...entityBase,
  sex: Sex,
  /** Age is derived from the birth date, never stored. */
  birthDate: LocalDateSchema,
  heightCm: z.number().min(100).max(250),
  timezone: z.string().min(1),
  locale: z.string().min(2),
  units: UnitSystem,
  weekStartsOn: WeekdaySchema,
  experience: Experience,
  jobActivity: JobActivity,
  /** The number of sessions per week is the count of true days (see trainingDays). */
  trainingSchedule: TrainingSchedule,
  /** Menstrual cycle tracking (women who turned it on). Optional: old records and backups simply do not have it. */
  cycle: CycleSettings.optional(),
});
export type Profile = z.infer<typeof Profile>;
