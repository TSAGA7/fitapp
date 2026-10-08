import type { AppDeps } from '@fitapp/application';
import { createBase, type BodyArea, type InjuryStatus, type Side, type TriggerKind } from '@fitapp/domain';

const baseOf = (deps: AppDeps) => createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId);

export interface InjuryInput {
  area: BodyArea;
  side: Side;
  status: InjuryStatus;
  triggerKinds: TriggerKind[];
  triggerText: string | null;
  notes: string | null;
}

/** A self-reported pain point. It only steers the choice of exercises; it is not a diagnosis. */
export async function addInjury(deps: AppDeps, input: InjuryInput): Promise<void> {
  await deps.uow.run((r) => r.injuries.put({ ...baseOf(deps), ...input, resolvedOn: null }));
}

export async function updateInjury(deps: AppDeps, id: string, patch: Partial<InjuryInput>): Promise<void> {
  await deps.uow.run(async (r) => {
    const current = await r.injuries.get(id);
    if (current) await r.injuries.put({ ...current, ...patch });
  });
}

export async function resolveInjury(deps: AppDeps, id: string, today: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const current = await r.injuries.get(id);
    if (current) await r.injuries.put({ ...current, status: 'past', resolvedOn: today });
  });
}

export async function deleteInjury(deps: AppDeps, id: string): Promise<void> {
  await deps.uow.run((r) => r.injuries.softDelete(id));
}

export async function setEquipmentAvailable(deps: AppDeps, equipmentId: string, available: boolean): Promise<void> {
  await deps.uow.run(async (r) => {
    const current = (await r.userEquipment.listAll()).find((u) => u.equipmentId === equipmentId);
    if (current) await r.userEquipment.put({ ...current, available });
    else await r.userEquipment.put({ ...baseOf(deps), equipmentId, available, stepKg: null, minKg: null, maxKg: null });
  });
}

/** The smallest weight step of a machine in the user's gym (it differs between gyms). */
export async function setEquipmentStep(deps: AppDeps, equipmentId: string, stepKg: number | null): Promise<void> {
  await deps.uow.run(async (r) => {
    const current = (await r.userEquipment.listAll()).find((u) => u.equipmentId === equipmentId);
    if (current) await r.userEquipment.put({ ...current, stepKg });
    else await r.userEquipment.put({ ...baseOf(deps), equipmentId, available: true, stepKg, minKg: null, maxKg: null });
  });
}
