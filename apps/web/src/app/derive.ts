import { buildBodyweightWorkout, sumMacros, type WorkoutTemplate, type Equipment, type Exercise, type Food, type FoodLog, type Macros, type MealSlot, type PainEvent, type PlanFood, type PlannedItem, type SafetyContext, type UserFood } from '@fitapp/domain';
import type { Snapshot } from './snapshot';

export const SLOT_ORDER: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function userFoodOf(userFoods: readonly UserFood[], foodId: string): UserFood | undefined {
  return userFoods.find((u) => u.foodId === foodId);
}

/** Foods the generator may use, with the user's preferences applied. */
export function planFoods(foods: readonly Food[], userFoods: readonly UserFood[]): PlanFood[] {
  return foods
    .filter((f) => f.deletedAt === null)
    .map((f) => {
      const u = userFoodOf(userFoods, f.id);
      return {
        id: f.id,
        name: f.name,
        category: f.category,
        basis: f.basis,
        per100: f.per100,
        unit: f.unit,
        gramsPerPiece: f.gramsPerPiece,
        preference: u?.preference ?? 'ok',
        availability: u?.availability ?? 'always',
        excluded: u?.excluded ?? false,
        maxPerDayG: u?.maxPerDayG ?? null,
        autoPlan: f.autoPlan !== false,
      };
    });
}

export function availableEquipmentKeys(equipment: readonly Equipment[], userEquipment: readonly { equipmentId: string; available: boolean }[]): Set<string> {
  const off = new Set(userEquipment.filter((u) => !u.available).map((u) => u.equipmentId));
  return new Set(equipment.filter((e) => e.deletedAt === null && !off.has(e.id)).map((e) => e.id));
}

export function safetyContext(s: Pick<Snapshot, 'injuries' | 'painEvents' | 'equipment' | 'userEquipment' | 'profile' | 'userExercises'>, now: string): SafetyContext {
  return {
    injuries: s.injuries.filter((i) => i.deletedAt === null && i.resolvedOn === null),
    painEvents: s.painEvents.filter((e): e is PainEvent => e.deletedAt === null),
    availableEquipment: availableEquipmentKeys(s.equipment, s.userEquipment),
    experience: s.profile?.experience ?? 'intermediate',
    now,
    liked: new Set(s.userExercises.filter((u) => u.deletedAt === null && u.preference === 'like').map((u) => u.exerciseId)),
    disliked: new Set(s.userExercises.filter((u) => u.deletedAt === null && u.preference === 'dislike').map((u) => u.exerciseId)),
  };
}

export const eatenOf = (logs: readonly FoodLog[]): Macros => sumMacros(logs.filter((l) => l.entryType !== 'skipped_planned').map((l) => l.macros));
export const plannedOf = (items: readonly PlannedItem[]): Macros => sumMacros(items.map((i) => i.plannedMacros));

export function itemsOnDate(s: Pick<Snapshot, 'mealWeeks'>, date: string): PlannedItem[] {
  return s.mealWeeks.flatMap((w) => w.items).filter((i) => i.date === date && i.deletedAt === null);
}
export function logsOnDate(s: Pick<Snapshot, 'foodLogs'>, date: string): FoodLog[] {
  return s.foodLogs.filter((l) => l.date === date && l.deletedAt === null);
}

export const foodName = (foods: readonly Food[], id: string): string => foods.find((f) => f.id === id)?.name ?? id;
export const exerciseName = (exercises: readonly Exercise[], id: string): string => exercises.find((e) => e.id === id)?.name ?? id;

export interface ResolvedEquipment {
  equipmentId: string | null;
  stepKg: number;
  minKg: number | null;
  maxKg: number | null;
}

/** Which equipment the exercise is done on now and its weight grid (0 step = no external load). */
export function resolveEquipment(ex: Pick<Exercise, 'equipmentRequirements' | 'loadUnit' | 'progressionType'>, equipment: readonly Equipment[], userEquipment: readonly { equipmentId: string; available: boolean; stepKg: number | null; minKg: number | null; maxKg: number | null }[]): ResolvedEquipment {
  if (ex.loadUnit === 'bodyweight' || ex.loadUnit === 'seconds' || ex.progressionType !== 'double') return { equipmentId: null, stepKg: 0, minKg: null, maxKg: null };
  const off = new Set(userEquipment.filter((u) => !u.available).map((u) => u.equipmentId));
  const group = ex.equipmentRequirements.find((g) => g.every((k) => !off.has(k))) ?? ex.equipmentRequirements[0] ?? [];
  const main = group.map((k) => equipment.find((e) => e.id === k)).find((e) => e && e.defaultStepKg !== null && e.loadType !== 'none' && e.loadType !== 'bodyweight');
  if (!main) return { equipmentId: null, stepKg: 2.5, minKg: null, maxKg: null };
  const u = userEquipment.find((x) => x.equipmentId === main.id);
  return { equipmentId: main.id, stepKg: u?.stepKg ?? main.defaultStepKg ?? 2.5, minKg: u?.minKg ?? null, maxKg: u?.maxKg ?? null };
}

/** The workout "own bodyweight" for the current constraints (nothing is saved). */
export function bodyweightPlan(s: Pick<Snapshot, 'exercises' | 'injuries' | 'painEvents' | 'equipment' | 'userEquipment' | 'profile' | 'userExercises'>, now: string, homeEquipment: readonly string[] = []): WorkoutTemplate {
  return buildBodyweightWorkout({ exercises: s.exercises.filter((e) => e.deletedAt === null), ctx: safetyContext(s, now), homeEquipment });
}
