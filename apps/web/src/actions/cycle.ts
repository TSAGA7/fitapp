import type { AppDeps } from '@fitapp/application';
import { createBase, DEFAULT_CYCLE, registerPeriodStart, type CycleSettings, type Feeling, type Symptom } from '@fitapp/domain';

/** Saves the cycle settings into the profile (and so into every backup). */
export async function saveCycle(deps: AppDeps, cycle: CycleSettings): Promise<void> {
  await deps.uow.run(async (r) => {
    const profile = await r.profile.get();
    if (!profile) throw new Error('Профиль ещё не создан');
    await r.profile.save({ ...profile, cycle });
  });
}

/** "The period started": remembers the day, keeps the earlier starts and learns the real cycle length. */
export async function markPeriodStart(deps: AppDeps, date: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const profile = await r.profile.get();
    if (!profile) throw new Error('Профиль ещё не создан');
    await r.profile.save({ ...profile, cycle: registerPeriodStart(profile.cycle ?? DEFAULT_CYCLE, date) });
  });
}

/** How the body feels on a day, and what bothers. Goes into the day's record, so it is in the backup too. */
export async function setFeeling(deps: AppDeps, date: string, feeling: Feeling | null, symptoms: Symptom[]): Promise<void> {
  await deps.uow.run(async (r) => {
    const current = await r.dailyLogs.getByDate(date);
    if (current) await r.dailyLogs.put({ ...current, feeling, symptoms });
    else await r.dailyLogs.put({ ...createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId), date, waterMl: null, note: null, feeling, symptoms });
  });
}
