import { z } from 'zod';
import { entityBase } from './common';
import { EquipmentCategory, EquipmentLoadType } from './enums';

const key = z.string().regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores only');

/** Content of a catalog item (seed JSON or user-created). */
export const EquipmentDefinition = z.object({
  key,
  name: z.string().min(1).max(120),
  category: EquipmentCategory,
  loadType: EquipmentLoadType,
  /** Smallest weight increment on this equipment, kg. null = not applicable. */
  defaultStepKg: z.number().positive().nullable(),
});
export type EquipmentDefinition = z.infer<typeof EquipmentDefinition>;

export const Equipment = z.object({
  ...entityBase,
  ...EquipmentDefinition.shape,
  origin: z.enum(['seed', 'custom']),
});
export type Equipment = z.infer<typeof Equipment>;

export const UserEquipment = z.object({
  ...entityBase,
  equipmentId: z.string().min(1),
  available: z.boolean(),
  stepKg: z.number().positive().nullable(),
  minKg: z.number().min(0).nullable(),
  maxKg: z.number().positive().nullable(),
});
export type UserEquipment = z.infer<typeof UserEquipment>;
