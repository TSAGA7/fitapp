import { z } from 'zod';
import { entityBase, LocalDateSchema } from './common';

const num = (min: number, max: number) => z.number().min(min).max(max).nullable();

/** Arms, trunk and legs of a segmental analysis: kilograms and percent of the norm. */
export const InBodySegments = z.object({
  rightArm: z.object({ kg: num(0, 100), pct: num(0, 1000) }),
  leftArm: z.object({ kg: num(0, 100), pct: num(0, 1000) }),
  trunk: z.object({ kg: num(0, 150), pct: num(0, 1000) }),
  rightLeg: z.object({ kg: num(0, 100), pct: num(0, 1000) }),
  leftLeg: z.object({ kg: num(0, 100), pct: num(0, 1000) }),
});
export type InBodySegments = z.infer<typeof InBodySegments>;
export type InBodySegmentKey = keyof InBodySegments;

/**
 * One InBody body composition test (scanned from the QR code of the printout or typed in).
 * Any value can be missing: the printout of another model may not have it.
 */
export const InBodyTest = z.object({
  ...entityBase,
  measuredOn: LocalDateSchema,
  /** Time of the test on the device, HH:MM. */
  measuredAt: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  /** Model of the device ("570"), when known from the QR code. */
  device: z.string().max(20).nullable(),
  source: z.enum(['qr', 'manual']),
  weightKg: z.number().min(20).max(400),
  skeletalMuscleKg: num(5, 150),
  bodyFatKg: num(0, 250),
  bodyFatPct: num(1, 80),
  totalBodyWaterL: num(5, 150),
  intracellularWaterL: num(2, 100),
  extracellularWaterL: num(2, 100),
  proteinKg: num(1, 50),
  mineralsKg: num(0.5, 20),
  fatFreeMassKg: num(10, 250),
  softLeanMassKg: num(10, 250),
  bmi: num(8, 90),
  score: num(0, 150),
  bmrKcal: num(500, 5000),
  visceralFatLevel: num(0, 30),
  waistHipRatio: num(0.4, 2),
  ecwRatio: num(0.2, 0.6),
  idealWeightKg: num(20, 300),
  weightControlKg: num(-200, 200),
  fatControlKg: num(-200, 200),
  muscleControlKg: num(-200, 200),
  bodyCellMassKg: num(5, 150),
  armCircumferenceCm: num(10, 80),
  armMuscleCircumferenceCm: num(10, 80),
  boneMineralKg: num(0.5, 15),
  smi: num(2, 20),
  leanSegments: InBodySegments.nullable(),
  fatSegments: InBodySegments.nullable(),
  note: z.string().max(500).nullable(),
});
export type InBodyTest = z.infer<typeof InBodyTest>;
/** What a test holds besides the record fields: what the QR parser and the form produce. */
export type InBodyValues = Omit<InBodyTest, keyof typeof entityBase>;
