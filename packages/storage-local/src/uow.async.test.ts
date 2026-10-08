import { describe, expect, it } from 'vitest';
import { makeStorage } from './testkit';

describe('unit of work with nested async helpers', () => {
  it('does not commit early when a helper returns a repository promise and the work ends with a read', async () => {
    const { s } = await makeStorage();
    const helper = async (r: Parameters<Parameters<typeof s.uow.run>[0]>[0]) => {
      const p = await r.programs.getProgram();
      return p?.activeVersionId ? r.programs.getVersion(p.activeVersionId) : undefined;
    };
    await expect(
      s.uow.run(async (r) => {
        await r.profile.get();
        await helper(r);
        await r.equipment.listAll();
      }),
    ).resolves.toBeUndefined();
  });

  it('rolls everything back when the work throws after several awaits', async () => {
    const { s } = await makeStorage();
    const before = (await s.uow.run((r) => r.goals.listAll())).length;
    await expect(
      s.uow.run(async (r) => {
        await r.goals.put({ id: 'g1', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', deletedAt: null, deviceId: 'd', type: 'recomposition', priority: 1, status: 'active', startedOn: '2026-10-01', endedOn: null, targetWeightKg: null, targetWaistCm: null, focus: [] });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await s.uow.run((r) => r.goals.listAll())).length).toBe(before);
  });
});
