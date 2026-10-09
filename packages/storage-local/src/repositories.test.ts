import { describe, expect, it } from 'vitest';
import { ImmutableVersionError, ValidationError } from './errors';
import { builders, makeStorage, T0 } from './testkit';

const LATER = '2026-10-02T09:30:00.000Z';

describe('generic repository behaviour (every repository built on Repo<T>)', () => {
  const cases = [
    ['goals', (b: ReturnType<typeof builders>) => b.goal()],
    ['injuries', (b: ReturnType<typeof builders>) => b.injury()],
    ['painEvents', (b: ReturnType<typeof builders>) => b.painEvent()],
    ['equipment', (b: ReturnType<typeof builders>) => b.equipment()],
    ['userEquipment', (b: ReturnType<typeof builders>) => b.userEquipment()],
    ['exercises', (b: ReturnType<typeof builders>) => b.exercise()],
    ['foods', (b: ReturnType<typeof builders>) => b.food()],
    ['userFoods', (b: ReturnType<typeof builders>) => b.userFood()],
    ['userExercises', (b: ReturnType<typeof builders>) => b.userExercise()],
    ['cardioSessions', (b: ReturnType<typeof builders>) => b.cardioSession()],
    ['exerciseNotes', (b: ReturnType<typeof builders>) => b.exerciseNote()],
    ['metrics', (b: ReturnType<typeof builders>) => b.metric()],
    ['nutritionTargets', (b: ReturnType<typeof builders>) => b.targets()],
    ['mealPlans', (b: ReturnType<typeof builders>) => b.mealPlan()],
    ['foodLogs', (b: ReturnType<typeof builders>) => b.foodLog()],
    ['dailyLogs', (b: ReturnType<typeof builders>) => b.dailyLog()],
    ['proposals', (b: ReturnType<typeof builders>) => b.proposal()],
    ['plannedSessions', (b: ReturnType<typeof builders>) => b.plannedSession()],
    ['summaries', (b: ReturnType<typeof builders>) => b.summary()],
  ] as const;

  for (const [name, make] of cases) {
    it(`${name}: put/get/list, updatedAt is stamped by the adapter, soft delete hides the record`, async () => {
      const { s, clock } = await makeStorage();
      const repo = s.repos[name] as unknown as {
        get(id: string): Promise<{ id: string; updatedAt: string; createdAt: string; deletedAt: string | null } | undefined>;
        put(e: unknown): Promise<void>;
        putMany(e: unknown[]): Promise<void>;
        softDelete(id: string): Promise<void>;
        listAll(): Promise<Array<{ id: string }>>;
      };
      const b = builders(s);
      const entity = make(b);
      clock.set(LATER);
      await repo.put(entity);
      const got = await repo.get(entity.id);
      expect(got?.id).toBe(entity.id);
      expect(got?.createdAt).toBe(T0);
      expect(got?.updatedAt).toBe(LATER);
      expect((await repo.listAll()).map((r) => r.id)).toEqual([entity.id]);

      clock.set('2026-10-03T00:00:00.000Z');
      await repo.softDelete(entity.id);
      expect(await repo.get(entity.id)).toBeUndefined();
      expect(await repo.listAll()).toEqual([]);
      const raw = (await s.db.table(name === 'metrics' ? 'bodyMetrics' : name === 'summaries' ? 'weeklySummaries' : name).get(entity.id)) as { deletedAt: string; updatedAt: string };
      expect(raw.deletedAt).toBe('2026-10-03T00:00:00.000Z');
      expect(raw.updatedAt).toBe('2026-10-03T00:00:00.000Z');
      await repo.softDelete(entity.id); // deleting twice is harmless
      await repo.softDelete('no-such-id');
    });

    it(`${name}: an invalid record is rejected and nothing is stored; putMany is all or nothing`, async () => {
      const { s } = await makeStorage();
      const repo = s.repos[name] as unknown as { put(e: unknown): Promise<void>; putMany(e: unknown[]): Promise<void>; listAll(): Promise<unknown[]> };
      const b = builders(s);
      const good = make(b);
      const bad = { ...make(b), createdAt: 'not a date' };
      await expect(repo.put(bad)).rejects.toBeInstanceOf(ValidationError);
      await expect(repo.putMany([good, bad])).rejects.toBeInstanceOf(ValidationError);
      expect(await repo.listAll()).toEqual([]);
      await repo.putMany([good]);
      expect(await repo.listAll()).toHaveLength(1);
    });
  }
});

describe('queries', () => {
  it('profile: one live profile, save replaces it', async () => {
    const { s, clock } = await makeStorage();
    expect(await s.repos.profile.get()).toBeUndefined();
    const p = builders(s).profile();
    await s.repos.profile.save(p);
    clock.set(LATER);
    await s.repos.profile.save({ ...p, heightCm: 182 });
    expect((await s.repos.profile.get())?.heightCm).toBe(182);
    expect(await s.db.profile.count()).toBe(1);
  });
  it('metrics: by type and date range (inclusive), history is kept', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    for (const [d, v] of [['2026-10-01', 94], ['2026-10-15', 92], ['2026-11-01', 89]] as const) await s.repos.metrics.put(b.metric('waist', v, d));
    await s.repos.metrics.put(b.metric('weight', 82.5, '2026-10-01'));
    const all = await s.repos.metrics.listByType('waist');
    expect(all.map((m) => m.value)).toEqual([94, 92, 89]);
    expect((await s.repos.metrics.listByType('waist', { from: '2026-10-15', to: '2026-10-31' })).map((m) => m.value)).toEqual([92]);
    expect(await s.repos.metrics.listByType('weight')).toHaveLength(1);
    const gone = all[1]!;
    await s.repos.metrics.softDelete(gone.id);
    expect((await s.repos.metrics.listByType('waist')).map((m) => m.value)).toEqual([94, 89]);
  });
  it('painEvents by exercise; foods by barcode', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    await s.repos.painEvents.put(b.painEvent('leg_press'));
    await s.repos.painEvents.put(b.painEvent('db_incline_press_30'));
    expect(await s.repos.painEvents.listByExercise('leg_press')).toHaveLength(1);
    const f = b.food('4601234567890');
    await s.repos.foods.put(f);
    expect((await s.repos.foods.findByBarcode('4601234567890'))?.id).toBe(f.id);
    expect(await s.repos.foods.findByBarcode('0000000000000')).toBeUndefined();
  });
  it('nutrition targets: the record active on a date', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    const first = b.targets('2026-10-01', '2026-10-14');
    const second = b.targets('2026-10-15', null);
    await s.repos.nutritionTargets.putMany([first, second]);
    expect((await s.repos.nutritionTargets.activeOn('2026-10-10'))?.id).toBe(first.id);
    expect((await s.repos.nutritionTargets.activeOn('2026-10-15'))?.id).toBe(second.id);
    expect((await s.repos.nutritionTargets.activeOn('2026-12-01'))?.id).toBe(second.id);
    expect(await s.repos.nutritionTargets.activeOn('2026-09-01')).toBeUndefined();
  });
  it('meal plans: by week (active first) and their items in date order', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    const draft = b.mealPlan('2026-09-28', 'draft');
    const active = b.mealPlan('2026-09-28', 'active');
    await s.repos.mealPlans.putMany([draft, active, b.mealPlan('2026-10-05', 'archived')]);
    expect((await s.repos.mealPlans.getByWeek('2026-09-28'))?.id).toBe(active.id);
    expect((await s.repos.mealPlans.getByWeek('2026-10-05'))?.status).toBe('archived');
    expect(await s.repos.mealPlans.getByWeek('2026-11-02')).toBeUndefined();
    await s.repos.mealPlans.putItems([b.plannedItem(active.id, '2026-09-30'), b.plannedItem(active.id, '2026-09-28'), b.plannedItem(draft.id)]);
    expect((await s.repos.mealPlans.listItems(active.id)).map((i) => i.date)).toEqual(['2026-09-28', '2026-09-30']);
    await expect(s.repos.mealPlans.putItems([{ ...b.plannedItem(active.id), plannedAmountG: -1 }])).rejects.toBeInstanceOf(ValidationError);
  });
  it('food log: plan and fact are separate records; by date range and by plan item', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    const plan = b.mealPlan();
    const item = b.plannedItem(plan.id);
    await s.repos.mealPlans.put(plan);
    await s.repos.mealPlans.putItems([item]);
    await s.repos.foodLogs.putMany([b.foodLog('2026-09-28', item.id), b.foodLog('2026-09-28', item.id), b.foodLog('2026-09-29'), b.foodLog('2026-10-02')]);
    expect(await s.repos.foodLogs.listByDateRange({ from: '2026-09-28', to: '2026-09-29' })).toHaveLength(3);
    expect(await s.repos.foodLogs.listByPlannedItem(item.id)).toHaveLength(2);
    expect((await s.repos.mealPlans.listItems(plan.id))[0]?.plannedAmountG).toBe(110);
    expect((await s.repos.foodLogs.listByPlannedItem(item.id))[0]?.actualAmountG).toBe(150);
  });
  it('daily log by date; weekly summary by week; proposals by status', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    await s.repos.dailyLogs.put(b.dailyLog('2026-10-01'));
    expect((await s.repos.dailyLogs.getByDate('2026-10-01'))?.waterMl).toBe(2500);
    expect(await s.repos.dailyLogs.getByDate('2026-10-02')).toBeUndefined();
    await s.repos.summaries.put(b.summary('2026-09-28'));
    expect((await s.repos.summaries.getByWeek('2026-09-28'))?.data).toEqual({ avgWeight: 82.4 });
    await s.repos.proposals.putMany([b.proposal('draft'), b.proposal('draft'), b.proposal('accepted')]);
    expect(await s.repos.proposals.listByStatus('draft')).toHaveLength(2);
    expect(await s.repos.proposals.listByStatus('accepted')).toHaveLength(1);
  });
  it('planned sessions by date range, with their planned sets in order', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    const a = b.plannedSession('2026-10-05');
    await s.repos.plannedSessions.putMany([a, b.plannedSession('2026-10-07'), b.plannedSession('2026-10-20')]);
    expect(await s.repos.plannedSessions.listByDateRange({ from: '2026-10-05', to: '2026-10-11' })).toHaveLength(2);
    await s.repos.plannedSessions.putSets([b.plannedSet(a.id, 2), b.plannedSet(a.id, 1)]);
    expect((await s.repos.plannedSessions.listSets(a.id)).map((x) => x.setNo)).toEqual([1, 2]);
  });
});

describe('workouts: sessions, exercises and fact sets', () => {
  it('stores a session with its exercises and sets; history by context is oldest first', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    const w = s.repos.workouts;
    const s1 = b.workoutSession('2026-10-05T10:00:00.000Z');
    const s2 = b.workoutSession('2026-10-12T10:00:00.000Z');
    await w.putSession(s2);
    await w.putSession(s1);
    const e1 = b.sessionExercise(s1.id, 2);
    const e0 = b.sessionExercise(s1.id, 1, 'smith_squat');
    const e2 = b.sessionExercise(s2.id);
    for (const e of [e1, e0, e2]) await w.putSessionExercise(e);
    await w.putSetLog(b.setLog(e2.id, 1, '2026-10-12T10:05:00.000Z'));
    await w.putSetLog(b.setLog(e1.id, 2, '2026-10-05T10:09:00.000Z'));
    await w.putSetLog(b.setLog(e1.id, 1, '2026-10-05T10:05:00.000Z'));
    await w.putSetLog(b.setLog(e0.id, 1, '2026-10-05T10:20:00.000Z', 'smith_squat::default::10-12', 'smith_squat'));

    expect((await w.getSession(s1.id))?.startedAt).toBe(s1.startedAt);
    expect((await w.listSessions()).map((x) => x.id)).toEqual([s1.id, s2.id]);
    expect((await w.listSessions({ from: '2026-10-10', to: '2026-10-31' })).map((x) => x.id)).toEqual([s2.id]);
    expect((await w.listSessionExercises(s1.id)).map((x) => x.position)).toEqual([1, 2]);
    expect((await w.listSetLogs(e1.id)).map((x) => x.setNo)).toEqual([1, 2]);
    const history = await w.listSetLogsByContext('leg_press::default::10-12');
    expect(history.map((x) => x.completedAt)).toEqual(['2026-10-05T10:05:00.000Z', '2026-10-05T10:09:00.000Z', '2026-10-12T10:05:00.000Z']);
    expect(await w.listSetLogsByContext('leg_press::incline::8-10')).toEqual([]);
    expect(await w.listSetLogsByExercise('smith_squat')).toHaveLength(1);
  });
  it('rejects a finished live working set without RIR, accepts an imported one', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    const w = s.repos.workouts;
    const sess = b.workoutSession();
    const se = b.sessionExercise(sess.id);
    await w.putSession(sess);
    await w.putSessionExercise(se);
    await expect(w.putSetLog({ ...b.setLog(se.id), actualRir: null })).rejects.toBeInstanceOf(ValidationError);
    await w.putSetLog({ ...b.setLog(se.id), actualRir: null, source: 'import' });
    expect((await w.listSetLogs(se.id))[0]).toMatchObject({ source: 'import', actualRir: null });
  });
  it('a missing source on write becomes "live"', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    const { source: _omit, ...withoutSource } = b.setLog('se-1');
    void _omit;
    await s.repos.workouts.putSetLog(withoutSource as never);
    expect((await s.db.setLogs.toArray())[0]?.source).toBe('live');
  });
});

describe('program versions are immutable', () => {
  it('stores versions in order, never rewrites one, and keeps the change log', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    const p = s.repos.programs;
    expect(await p.getProgram()).toBeUndefined();
    const v1 = b.programVersion(1);
    const v2 = b.programVersion(2, v1.id);
    await p.addVersion(v2);
    await p.addVersion(v1);
    await p.saveProgram({ ...b.program(), activeVersionId: v2.id });
    expect((await p.listVersions()).map((v) => v.versionNo)).toEqual([1, 2]);
    expect((await p.getProgram())?.activeVersionId).toBe(v2.id);
    expect((await p.getVersion(v1.id))?.reasonSummary).toBe('Тест');
    await expect(p.addVersion({ ...v1, reasonSummary: 'Подмена' })).rejects.toBeInstanceOf(ImmutableVersionError);
    expect((await p.getVersion(v1.id))?.reasonSummary).toBe('Тест');
    await p.addChange(b.planChange(v1.id));
    await p.addChange(b.planChange(v2.id));
    expect(await p.listChanges()).toHaveLength(2);
  });
});

describe('unit of work', () => {
  it('commits writes to several repositories together', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    await s.uow.run(async (r) => {
      await r.metrics.put(b.metric());
      await r.dailyLogs.put(b.dailyLog());
    });
    expect(await s.db.bodyMetrics.count()).toBe(1);
    expect(await s.db.dailyLogs.count()).toBe(1);
  });
  it('rolls everything back when the work fails', async () => {
    const { s } = await makeStorage();
    const b = builders(s);
    await expect(
      s.uow.run(async (r) => {
        await r.metrics.put(b.metric());
        await r.dailyLogs.put(b.dailyLog());
        await r.dailyLogs.put({ ...b.dailyLog('2026-10-02'), waterMl: -5 }); // invalid -> throws
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await s.db.bodyMetrics.count()).toBe(0);
    expect(await s.db.dailyLogs.count()).toBe(0);
  });
  it('returns the value of the work', async () => {
    const { s } = await makeStorage();
    expect(await s.uow.run(async (r) => (await r.goals.listAll()).length)).toBe(0);
  });
});

describe('change feed', () => {
  it('lists changed records since a moment, including deletions', async () => {
    const { s, clock } = await makeStorage();
    const b = builders(s);
    const m1 = b.metric('weight', 82, '2026-10-01');
    await s.repos.metrics.put(m1);
    clock.set('2026-10-02T08:00:00.000Z');
    const m2 = b.metric('weight', 81.8, '2026-10-02');
    await s.repos.metrics.put(m2);
    await s.repos.dailyLogs.put(b.dailyLog());
    expect((await s.changeFeed.changedSince(null)).length).toBe(3);
    const since = await s.changeFeed.changedSince('2026-10-01T12:00:00.000Z');
    expect(since.map((c) => c.store).sort()).toEqual(['bodyMetrics', 'dailyLogs']);
    clock.set('2026-10-03T08:00:00.000Z');
    await s.repos.metrics.softDelete(m1.id);
    const later = await s.changeFeed.changedSince('2026-10-02T12:00:00.000Z');
    expect(later).toEqual([{ store: 'bodyMetrics', id: m1.id, updatedAt: '2026-10-03T08:00:00.000Z', deleted: true }]);
    expect(await s.changeFeed.changedSince('2030-01-01T00:00:00.000Z')).toEqual([]);
  });
});
