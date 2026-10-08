import { z } from 'zod';
import { entityBase, LocalDateSchema } from './common';
import { MetricType, MetricUnit } from './enums';

export const EXPECTED_UNIT: Record<z.infer<typeof MetricType>, z.infer<typeof MetricUnit>> = {
  weight: 'kg',
  body_fat: 'percent',
  chest: 'cm',
  waist: 'cm',
  hips: 'cm',
  neck: 'cm',
  shoulders: 'cm',
  biceps_left: 'cm',
  biceps_right: 'cm',
  thigh_left: 'cm',
  thigh_right: 'cm',
  calf_left: 'cm',
  calf_right: 'cm',
};

/** One measurement. History = new rows; old rows are never overwritten. */
export const BodyMetric = z
  .object({
    ...entityBase,
    type: MetricType,
    value: z.number().positive(),
    unit: MetricUnit,
    measuredOn: LocalDateSchema,
    note: z.string().max(500).nullable(),
  })
  .superRefine((m, ctx) => {
    if (m.unit !== EXPECTED_UNIT[m.type]) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: `Unit for ${m.type} must be ${EXPECTED_UNIT[m.type]}` });
    }
    if (m.type === 'body_fat' && m.value > 70) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Body fat percent is out of range' });
    }
  });
export type BodyMetric = z.infer<typeof BodyMetric>;
