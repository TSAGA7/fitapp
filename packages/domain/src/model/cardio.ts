import { z } from 'zod';
import { entityBase, LocalDateSchema } from './common';

/** Cardio machines of a gym. */
export const CardioMachine = z.enum(['treadmill', 'bike', 'elliptical', 'rower', 'stair_climber', 'air_bike', 'ski_erg']);
export type CardioMachine = z.infer<typeof CardioMachine>;
export const CARDIO_MACHINES = CardioMachine.options;

/** A cardio session on a machine. Not a part of the lifting program: it has its own fields (speed, incline, level, distance). */
export const CardioSession = z.object({
  ...entityBase,
  date: LocalDateSchema,
  machine: CardioMachine,
  durationMin: z.number().min(1).max(600),
  /** Treadmill / bike speed, km/h. */
  speedKmh: z.number().min(0).max(40).nullable(),
  /** Treadmill (and some ellipticals) incline, %. */
  inclinePct: z.number().min(0).max(40).nullable(),
  /** Resistance or level shown on the machine. */
  level: z.number().min(0).max(100).nullable(),
  distanceKm: z.number().min(0).max(500).nullable(),
  avgHeartRate: z.number().int().min(30).max(240).nullable(),
  /** How hard it felt, 1 (very light) to 10 (maximum). */
  effort: z.number().int().min(1).max(10).nullable(),
  note: z.string().max(500).nullable(),
});
export type CardioSession = z.infer<typeof CardioSession>;
