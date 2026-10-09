import type { AppDeps } from '@fitapp/application';
import { CardioSession, createBase, type CardioMachine } from '@fitapp/domain';

export interface CardioInput {
  date: string;
  machine: CardioMachine;
  durationMin: number;
  speedKmh: number | null;
  inclinePct: number | null;
  level: number | null;
  distanceKm: number | null;
  avgHeartRate: number | null;
  effort: number | null;
  note: string | null;
}

/** Saves a cardio session (it is validated by the schema, so a nonsense value never reaches the storage). */
export async function addCardioSession(deps: AppDeps, input: CardioInput): Promise<void> {
  const session = CardioSession.parse({ ...createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId), ...input });
  await deps.uow.run((r) => r.cardioSessions.put(session));
}

export async function deleteCardioSession(deps: AppDeps, id: string): Promise<void> {
  await deps.uow.run((r) => r.cardioSessions.softDelete(id));
}
