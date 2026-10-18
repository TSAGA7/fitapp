import type { AppDeps } from '@fitapp/application';
import { createBase, type OwnSchedule, type Weekday } from '@fitapp/domain';

/** Own program planned ahead («Тренировки → Своя»): one active plan, built from own workouts. */
const baseOf = (deps: AppDeps) => createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId);

export interface OwnScheduleInput {
  startOn: string;
  weeks: number;
  weekdays: Weekday[];
  rotation: string[];
}

async function activeOf(list: OwnSchedule[]): Promise<OwnSchedule | undefined> {
  return list.filter((x) => x.deletedAt === null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** Creates the plan or changes the active one. Hand changes of days that are still in the plan are kept. */
export async function saveOwnSchedule(deps: AppDeps, input: OwnScheduleInput): Promise<string> {
  if (input.weekdays.length === 0) throw new Error('Выбери хотя бы один день недели');
  if (input.rotation.length === 0) throw new Error('Выбери хотя бы одну свою тренировку');
  return deps.uow.run(async (r) => {
    for (const id of input.rotation) {
      const cw = await r.customWorkouts.get(id);
      if (!cw || cw.deletedAt !== null) throw new Error('Одна из тренировок удалена — выбери заново');
    }
    const cur = await activeOf(await r.ownSchedules.listAll());
    const row: OwnSchedule = cur
      ? { ...cur, startOn: input.startOn, weeks: input.weeks, weekdays: input.weekdays, rotation: input.rotation }
      : { ...baseOf(deps), startOn: input.startOn, weeks: input.weeks, weekdays: input.weekdays, rotation: input.rotation, overrides: [] };
    await r.ownSchedules.put(row);
    return row.id;
  });
}

/** Changes one day: another own workout, rest (null), or back to the plan (undefined). */
export async function setOwnScheduleDay(deps: AppDeps, date: string, customWorkoutId: string | null | undefined): Promise<void> {
  await deps.uow.run(async (r) => {
    const cur = await activeOf(await r.ownSchedules.listAll());
    if (!cur) throw new Error('План не найден');
    const overrides = cur.overrides.filter((o) => o.date !== date);
    if (customWorkoutId !== undefined) overrides.push({ date, customWorkoutId });
    overrides.sort((a, b) => a.date.localeCompare(b.date));
    await r.ownSchedules.put({ ...cur, overrides: overrides.slice(-400) });
  });
}

/** Removes the plan. Done workouts stay in the history; own workouts stay in the builder. */
export async function deleteOwnSchedule(deps: AppDeps): Promise<void> {
  await deps.uow.run(async (r) => {
    for (const s of (await r.ownSchedules.listAll()).filter((x) => x.deletedAt === null)) await r.ownSchedules.softDelete(s.id);
  });
}
