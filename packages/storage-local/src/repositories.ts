import type { Table } from 'dexie';
import type { ZodTypeAny } from 'zod';
import {
  ENTITY_SCHEMAS,
  type BodyMetric,
  type DailyLog,
  type DateRange,
  type Food,
  type FoodLog,
  type LocalDate,
  type MealPlan,
  type NutritionTargetsRecord,
  type PainEvent,
  type PlanChange,
  type PlannedItem,
  type PlannedSession,
  type PlannedSet,
  type Profile,
  type Program,
  type ProgramVersion,
  type Proposal,
  type Repo,
  type Repositories,
  type SessionExercise,
  type SetLog,
  type StoreName,
  type WeeklySummary,
  type WorkoutSession,
} from '@fitapp/domain';
import { ImmutableVersionError, ValidationError } from './errors';
import type { AppDatabase } from './schema';

type Live = { id: string; deletedAt: string | null; updatedAt: string };

/** Validates against the domain schema and stamps `updatedAt`. Anything invalid is rejected before it is stored. */
function stamp<T extends Live>(schema: ZodTypeAny, store: StoreName, now: () => string, entity: T): T {
  const parsed = schema.safeParse({ ...entity, updatedAt: now() });
  if (!parsed.success) {
    throw new ValidationError(
      store,
      typeof entity.id === 'string' ? entity.id : null,
      parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(запись)'}: ${i.message}`),
    );
  }
  return parsed.data as T;
}

const alive = <T extends Live>(rows: T[]): T[] => rows.filter((r) => r.deletedAt === null);

class CoreRepo<T extends Live> implements Repo<T> {
  constructor(
    protected readonly table: Table<T, string>,
    protected readonly store: StoreName,
    protected readonly now: () => string,
  ) {}

  protected stamp(entity: T): T {
    return stamp(ENTITY_SCHEMAS[this.store], this.store, this.now, entity);
  }
  async get(id: string): Promise<T | undefined> {
    const row = await this.table.get(id);
    return row && row.deletedAt === null ? row : undefined;
  }
  async put(entity: T): Promise<void> {
    await this.table.put(this.stamp(entity));
  }
  async putMany(entities: readonly T[]): Promise<void> {
    const stamped = entities.map((e) => this.stamp(e)); // all or nothing: validation happens first
    await this.table.bulkPut(stamped);
  }
  async softDelete(id: string): Promise<void> {
    const row = await this.table.get(id);
    if (!row || row.deletedAt !== null) return;
    const at = this.now();
    await this.table.put({ ...row, updatedAt: at, deletedAt: at });
  }
  async listAll(): Promise<T[]> {
    return alive(await this.table.toArray());
  }
}

const range = (r?: DateRange) => ({ lo: r?.from ?? '', hi: r?.to ?? '\uffff' });

export function createRepositories(db: AppDatabase, now: () => string): Repositories {
  const core = <K extends StoreName>(name: K) => new CoreRepo(db.table(name) as unknown as Table<Live & Record<string, unknown>, string>, name, now);

  class MetricsRepo extends CoreRepo<BodyMetric> {
    async listByType(type: BodyMetric['type'], r?: DateRange): Promise<BodyMetric[]> {
      const { lo, hi } = range(r);
      const rows = await this.table.where('[type+measuredOn]').between([type, lo], [type, hi], true, true).toArray();
      return alive(rows);
    }
  }
  class PainEventRepo extends CoreRepo<PainEvent> {
    async listByExercise(exerciseId: string): Promise<PainEvent[]> {
      return alive(await this.table.where('exerciseId').equals(exerciseId).toArray());
    }
  }
  class FoodRepo extends CoreRepo<Food> {
    async findByBarcode(barcode: string): Promise<Food | undefined> {
      return alive(await this.table.where('barcode').equals(barcode).toArray())[0];
    }
  }
  class TargetsRepo extends CoreRepo<NutritionTargetsRecord> {
    async activeOn(date: LocalDate): Promise<NutritionTargetsRecord | undefined> {
      const rows = alive(await this.table.where('validFrom').belowOrEqual(date).toArray()).filter((r) => r.validTo === null || r.validTo >= date);
      return rows.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
    }
  }
  class MealPlanRepo extends CoreRepo<MealPlan> {
    constructor(
      table: Table<MealPlan, string>,
      private readonly items: Table<PlannedItem, string>,
    ) {
      super(table, 'mealPlans', now);
    }
    async getByWeek(weekStart: LocalDate): Promise<MealPlan | undefined> {
      const rows = alive(await this.table.where('weekStart').equals(weekStart).toArray());
      const rank = (p: MealPlan) => (p.status === 'active' ? 0 : p.status === 'draft' ? 1 : 2);
      return rows.sort((a, b) => rank(a) - rank(b) || (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    }
    async listItems(planId: string): Promise<PlannedItem[]> {
      const rows = alive(await this.items.where('planId').equals(planId).toArray());
      return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
    }
    async putItems(items: readonly PlannedItem[]): Promise<void> {
      const stamped = items.map((i) => stamp(ENTITY_SCHEMAS.plannedItems, 'plannedItems', now, i));
      await this.items.bulkPut(stamped);
    }
  }
  class FoodLogRepo extends CoreRepo<FoodLog> {
    async listByDateRange(r: DateRange): Promise<FoodLog[]> {
      return alive(await this.table.where('date').between(r.from, r.to, true, true).toArray());
    }
    async listByPlannedItem(plannedItemId: string): Promise<FoodLog[]> {
      return alive(await this.table.where('plannedItemId').equals(plannedItemId).toArray());
    }
  }
  class DailyLogRepo extends CoreRepo<DailyLog> {
    async getByDate(date: LocalDate): Promise<DailyLog | undefined> {
      return alive(await this.table.where('date').equals(date).toArray())[0];
    }
  }
  class ProposalRepo extends CoreRepo<Proposal> {
    async listByStatus(status: Proposal['status']): Promise<Proposal[]> {
      return alive(await this.table.where('status').equals(status).toArray());
    }
  }
  class SummaryRepo extends CoreRepo<WeeklySummary> {
    async getByWeek(weekStart: LocalDate): Promise<WeeklySummary | undefined> {
      return alive(await this.table.where('weekStart').equals(weekStart).toArray())[0];
    }
  }
  class PlannedSessionRepo extends CoreRepo<PlannedSession> {
    constructor(
      table: Table<PlannedSession, string>,
      private readonly sets: Table<PlannedSet, string>,
    ) {
      super(table, 'plannedSessions', now);
    }
    async listByDateRange(r: DateRange): Promise<PlannedSession[]> {
      return alive(await this.table.where('plannedDate').between(r.from, r.to, true, true).toArray());
    }
    async listSets(plannedSessionId: string): Promise<PlannedSet[]> {
      return alive(await this.sets.where('plannedSessionId').equals(plannedSessionId).toArray()).sort((a, b) => a.setNo - b.setNo);
    }
    async putSets(sets: readonly PlannedSet[]): Promise<void> {
      await this.sets.bulkPut(sets.map((s) => stamp(ENTITY_SCHEMAS.plannedSets, 'plannedSets', now, s)));
    }
  }

  const sessions = db.workoutSessions as unknown as Table<WorkoutSession, string>;
  const sessionExercises = db.sessionExercises as unknown as Table<SessionExercise, string>;
  const setLogs = db.setLogs as unknown as Table<SetLog, string>;
  const byTime = (a: SetLog, b: SetLog) => {
    const ta = a.completedAt ?? a.createdAt;
    const tb = b.completedAt ?? b.createdAt;
    return ta < tb ? -1 : ta > tb ? 1 : a.setNo - b.setNo || (a.createdAt < b.createdAt ? -1 : 1);
  };
  const workouts = {
    async getSession(id: string) {
      const row = await sessions.get(id);
      return row && row.deletedAt === null ? row : undefined;
    },
    async putSession(session: WorkoutSession) {
      await sessions.put(stamp(ENTITY_SCHEMAS.workoutSessions, 'workoutSessions', now, session));
    },
    async listSessions(r?: DateRange) {
      const rows = r ? await sessions.where('startedAt').between(r.from, `${r.to}\uffff`, true, true).toArray() : await sessions.orderBy('startedAt').toArray();
      return alive(rows);
    },
    async putSessionExercise(entity: SessionExercise) {
      await sessionExercises.put(stamp(ENTITY_SCHEMAS.sessionExercises, 'sessionExercises', now, entity));
    },
    async listSessionExercises(sessionId: string) {
      return alive(await sessionExercises.where('sessionId').equals(sessionId).toArray()).sort((a, b) => a.position - b.position);
    },
    async putSetLog(entity: SetLog) {
      await setLogs.put(stamp(ENTITY_SCHEMAS.setLogs, 'setLogs', now, entity));
    },
    async softDeleteSetLog(id: string) {
      const row = await setLogs.get(id);
      if (row && row.deletedAt === null) await setLogs.put(stamp(ENTITY_SCHEMAS.setLogs, 'setLogs', now, { ...row, deletedAt: now() }));
    },
    async listSetLogs(sessionExerciseId: string) {
      return alive(await setLogs.where('sessionExerciseId').equals(sessionExerciseId).toArray()).sort((a, b) => a.setNo - b.setNo);
    },
    async listSetLogsByContext(contextKey: string) {
      return alive(await setLogs.where('contextKey').equals(contextKey).toArray()).sort(byTime);
    },
    async listSetLogsByExercise(exerciseId: string) {
      return alive(await setLogs.where('exerciseId').equals(exerciseId).toArray()).sort(byTime);
    },
  };

  const programs = db.programs as unknown as Table<Program, string>;
  const versions = db.programVersions as unknown as Table<ProgramVersion, string>;
  const changes = db.planChanges as unknown as Table<PlanChange, string>;
  const programRepo = {
    async getProgram() {
      return alive(await programs.toArray())[0];
    },
    async saveProgram(program: Program) {
      await programs.put(stamp(ENTITY_SCHEMAS.programs, 'programs', now, program));
    },
    async getVersion(id: string) {
      const row = await versions.get(id);
      return row && row.deletedAt === null ? row : undefined;
    },
    async listVersions() {
      return alive(await versions.orderBy('versionNo').toArray());
    },
    async addVersion(version: ProgramVersion) {
      if (await versions.get(version.id)) throw new ImmutableVersionError(version.id);
      await versions.add(stamp(ENTITY_SCHEMAS.programVersions, 'programVersions', now, version));
    },
    async addChange(change: PlanChange) {
      await changes.add(stamp(ENTITY_SCHEMAS.planChanges, 'planChanges', now, change));
    },
    async listChanges() {
      return alive(await changes.orderBy('createdAt').toArray());
    },
  };

  const profileTable = db.profile as unknown as Table<Profile, string>;
  const profile = {
    async get() {
      return alive(await profileTable.toArray())[0];
    },
    async save(p: Profile) {
      await profileTable.put(stamp(ENTITY_SCHEMAS.profile, 'profile', now, p));
    },
  };

  return {
    profile,
    goals: core('goals') as never,
    metrics: new MetricsRepo(db.bodyMetrics as never, 'bodyMetrics', now),
    injuries: core('injuries') as never,
    painEvents: new PainEventRepo(db.painEvents as never, 'painEvents', now),
    equipment: core('equipment') as never,
    userEquipment: core('userEquipment') as never,
    exercises: core('exercises') as never,
    userExercises: core('userExercises') as never,
    exerciseNotes: core('exerciseNotes') as never,
    foods: new FoodRepo(db.foods as never, 'foods', now),
    userFoods: core('userFoods') as never,
    nutritionTargets: new TargetsRepo(db.nutritionTargets as never, 'nutritionTargets', now),
    mealPlans: new MealPlanRepo(db.mealPlans as never, db.plannedItems as never),
    foodLogs: new FoodLogRepo(db.foodLogs as never, 'foodLogs', now),
    dailyLogs: new DailyLogRepo(db.dailyLogs as never, 'dailyLogs', now),
    programs: programRepo,
    proposals: new ProposalRepo(db.proposals as never, 'proposals', now),
    plannedSessions: new PlannedSessionRepo(db.plannedSessions as never, db.plannedSets as never),
    workouts,
    summaries: new SummaryRepo(db.weeklySummaries as never, 'weeklySummaries', now),
  };
}
