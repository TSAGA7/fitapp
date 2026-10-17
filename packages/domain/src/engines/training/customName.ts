import type { MuscleGroup } from '../../model';

const AREA: Record<MuscleGroup, string> = {
  quads: 'Ноги', hamstrings: 'Ноги', glutes: 'Ноги', adductors: 'Ноги', calves: 'Ноги',
  chest: 'Грудь',
  lats: 'Спина', upper_back: 'Спина', lower_back: 'Спина',
  front_delts: 'Плечи', side_delts: 'Плечи', rear_delts: 'Плечи',
  biceps: 'Руки', triceps: 'Руки', forearms: 'Руки',
  abs: 'Пресс', obliques: 'Пресс',
};

export const DEFAULT_CUSTOM_NAME = 'Своя тренировка';

/**
 * Name of an own workout the user did not name: one exercise gives its own name,
 * several give the body areas they work, most worked first («Ноги + Пресс»).
 */
export function autoWorkoutName(exercises: ReadonlyArray<{ name: string; primaryMuscles: readonly MuscleGroup[] }>): string {
  if (exercises.length === 0) return DEFAULT_CUSTOM_NAME;
  if (exercises.length === 1) return (exercises[0] as { name: string }).name.slice(0, 60);
  const count = new Map<string, number>();
  const order: string[] = [];
  for (const e of exercises) {
    const m = e.primaryMuscles[0];
    const area = m ? AREA[m] : undefined;
    if (!area) continue;
    if (!count.has(area)) order.push(area);
    count.set(area, (count.get(area) ?? 0) + 1);
  }
  if (order.length === 0) return DEFAULT_CUSTOM_NAME;
  return order.sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || order.indexOf(a) - order.indexOf(b)).slice(0, 3).join(' + ');
}

/** A name not taken yet: «Ноги», «Ноги 2», «Ноги 3»… */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  const b = base.trim().slice(0, 56) || DEFAULT_CUSTOM_NAME;
  if (!used.has(b.toLowerCase())) return b;
  for (let i = 2; ; i++) if (!used.has(`${b} ${i}`.toLowerCase())) return `${b} ${i}`;
}

/** Marker in movedReason of a program session that was replaced by an own workout. */
export const REPLACED_BY_OWN = 'Заменена своей: ';
export const isReplacedByOwn = (movedReason: string | null): boolean => (movedReason ?? '').startsWith(REPLACED_BY_OWN);
