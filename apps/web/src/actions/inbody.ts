import type { AppDeps } from '@fitapp/application';
import { createBase, EXPECTED_UNIT, InBodyTest, type InBodyValues } from '@fitapp/domain';

/**
 * Saves an InBody test (new, or changes one with id). A new test also records the weight and the body fat
 * of that day in «Замеры и вес», so the charts and the norm see them.
 */
export async function saveInBodyTest(deps: AppDeps, input: { id: string | null; values: InBodyValues }): Promise<string> {
  return deps.uow.run(async (r) => {
    const old = input.id ? await r.inbodyTests.get(input.id) : undefined;
    if (input.id && !old) throw new Error('Тест не найден');
    const base = old ?? createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId);
    const row = InBodyTest.parse({ ...base, ...input.values });
    await r.inbodyTests.put(row);
    if (!old) {
      const same = (await r.metrics.listAll()).filter((m) => m.deletedAt === null && m.measuredOn === row.measuredOn);
      const add = async (type: 'weight' | 'body_fat', value: number | null) => {
        if (value === null || same.some((m) => m.type === type && Math.abs(m.value - value) < 0.05)) return;
        await r.metrics.put({ ...createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId), type, value, unit: EXPECTED_UNIT[type], measuredOn: row.measuredOn, note: 'InBody' });
      };
      await add('weight', row.weightKg);
      await add('body_fat', row.bodyFatPct);
    }
    return row.id;
  });
}

export async function deleteInBodyTest(deps: AppDeps, id: string): Promise<void> {
  await deps.uow.run((r) => r.inbodyTests.softDelete(id));
}
