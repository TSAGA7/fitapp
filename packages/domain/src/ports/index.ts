/**
 * Ports: interfaces the domain/application layers need from the outside
 * world. Adapters (storage-local now; Supabase, AI, barcode later) implement
 * them. No business logic lives here.
 */
import type {
  BodyMetric,
  DailyLog,
  Equipment,
  Exercise,
  Food,
  FoodLog,
  Goal,
  Injury,
  MealPlan,
  MetricType,
  NutritionTargetsRecord,
  PainEvent,
  PlanChange,
  PlannedItem,
  PlannedSession,
  PlannedSet,
  Profile,
  Program,
  ProgramVersion,
  Proposal,
  SessionExercise,
  SetLog,
  StoreName,
  UserEquipment,
  UserFood,
  UserExercise,
  CardioSession,
  MealTemplate,
  ExerciseNote,
  WeeklySummary,
  WorkoutSession,
} from '../model';
import type { LocalDate } from '../util/localDate';

export interface Clock {
  /** Current instant, ISO 8601 with offset. */
  now(): string;
  today(timeZone: string): LocalDate;
}

export interface IdGenerator {
  /** UUID v7. */
  newId(): string;
}

/**
 * Base repository. The ADAPTER sets `updatedAt` on every write and
 * implements soft delete, so use cases cannot forget it.
 */
export interface Repo<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  put(entity: T): Promise<void>;
  putMany(entities: readonly T[]): Promise<void>;
  /** Marks deleted (sets deletedAt); reads skip deleted records by default. */
  softDelete(id: string): Promise<void>;
  listAll(): Promise<T[]>;
}

export interface DateRange {
  from: LocalDate;
  to: LocalDate;
}

export interface ProfileRepo {
  get(): Promise<Profile | undefined>;
  save(profile: Profile): Promise<void>;
}
export type GoalRepo = Repo<Goal>;
export interface MetricsRepo extends Repo<BodyMetric> {
  listByType(type: MetricType, range?: DateRange): Promise<BodyMetric[]>;
}
export type InjuryRepo = Repo<Injury>;
export interface PainEventRepo extends Repo<PainEvent> {
  listByExercise(exerciseId: string): Promise<PainEvent[]>;
}
export type EquipmentRepo = Repo<Equipment>;
export type UserEquipmentRepo = Repo<UserEquipment>;
export type ExerciseRepo = Repo<Exercise>;
export interface FoodRepo extends Repo<Food> {
  findByBarcode(barcode: string): Promise<Food | undefined>;
}
export type UserFoodRepo = Repo<UserFood>;
export type UserExerciseRepo = Repo<UserExercise>;
export type CardioSessionRepo = Repo<CardioSession>;
export type MealTemplateRepo = Repo<MealTemplate>;
export type ExerciseNoteRepo = Repo<ExerciseNote>;
export interface NutritionTargetsRepo extends Repo<NutritionTargetsRecord> {
  activeOn(date: LocalDate): Promise<NutritionTargetsRecord | undefined>;
}
export interface MealPlanRepo extends Repo<MealPlan> {
  getByWeek(weekStart: LocalDate): Promise<MealPlan | undefined>;
  listItems(planId: string): Promise<PlannedItem[]>;
  putItems(items: readonly PlannedItem[]): Promise<void>;
}
export interface FoodLogRepo extends Repo<FoodLog> {
  listByDateRange(range: DateRange): Promise<FoodLog[]>;
  listByPlannedItem(plannedItemId: string): Promise<FoodLog[]>;
}
export interface DailyLogRepo extends Repo<DailyLog> {
  getByDate(date: LocalDate): Promise<DailyLog | undefined>;
}
export interface ProgramRepo {
  getProgram(): Promise<Program | undefined>;
  saveProgram(program: Program): Promise<void>;
  getVersion(id: string): Promise<ProgramVersion | undefined>;
  listVersions(): Promise<ProgramVersion[]>;
  /** Versions are immutable: only insertion is allowed. */
  addVersion(version: ProgramVersion): Promise<void>;
  addChange(change: PlanChange): Promise<void>;
  listChanges(): Promise<PlanChange[]>;
}
export interface ProposalRepo extends Repo<Proposal> {
  listByStatus(status: Proposal['status']): Promise<Proposal[]>;
}
export interface PlannedSessionRepo extends Repo<PlannedSession> {
  listByDateRange(range: DateRange): Promise<PlannedSession[]>;
  listSets(plannedSessionId: string): Promise<PlannedSet[]>;
  putSets(sets: readonly PlannedSet[]): Promise<void>;
}
export interface WorkoutRepo {
  getSession(id: string): Promise<WorkoutSession | undefined>;
  putSession(session: WorkoutSession): Promise<void>;
  listSessions(range?: DateRange): Promise<WorkoutSession[]>;
  putSessionExercise(entity: SessionExercise): Promise<void>;
  listSessionExercises(sessionId: string): Promise<SessionExercise[]>;
  putSetLog(entity: SetLog): Promise<void>;
  listSetLogs(sessionExerciseId: string): Promise<SetLog[]>;
  /** Removes a set record entered by mistake (soft delete). */
  softDeleteSetLog(id: string): Promise<void>;
  /** History for progression: all fact sets of one prescription context, oldest first. */
  listSetLogsByContext(contextKey: string): Promise<SetLog[]>;
  listSetLogsByExercise(exerciseId: string): Promise<SetLog[]>;
}
export interface SummaryRepo extends Repo<WeeklySummary> {
  getByWeek(weekStart: LocalDate): Promise<WeeklySummary | undefined>;
}

/** All repositories reachable inside one atomic transaction. */
export interface Repositories {
  profile: ProfileRepo;
  goals: GoalRepo;
  metrics: MetricsRepo;
  injuries: InjuryRepo;
  painEvents: PainEventRepo;
  equipment: EquipmentRepo;
  userEquipment: UserEquipmentRepo;
  exercises: ExerciseRepo;
  userExercises: UserExerciseRepo;
  cardioSessions: CardioSessionRepo;
  exerciseNotes: ExerciseNoteRepo;
  foods: FoodRepo;
  userFoods: UserFoodRepo;
  nutritionTargets: NutritionTargetsRepo;
  mealPlans: MealPlanRepo;
  foodLogs: FoodLogRepo;
  dailyLogs: DailyLogRepo;
  mealTemplates: MealTemplateRepo;
  programs: ProgramRepo;
  proposals: ProposalRepo;
  plannedSessions: PlannedSessionRepo;
  workouts: WorkoutRepo;
  summaries: SummaryRepo;
}

/** Atomic multi-repository transaction (Dexie transaction now; SQL later). */
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}

/** Who the data belongs to. Local user now; Supabase Auth later. */
export interface IdentityPort {
  currentUser(): Promise<{ id: string; kind: 'local' | 'remote' }>;
}

/** A pointer to a changed record, found by `updatedAt` (deletes via `deletedAt`). */
export interface ChangeRef {
  store: StoreName;
  id: string;
  updatedAt: string;
  deleted: boolean;
}
export interface ChangeFeed {
  changedSince(since: string | null): Promise<ChangeRef[]>;
}
/**
 * Sync with a remote store. Not implemented in V1.0. NOTE: last-write-wins is
 * not universally safe: when a second device appears, the conflict strategy
 * must be reviewed (append-only logs merge by union; plans need explicit rules).
 */
export interface SyncPort {
  pull(since: string | null): Promise<{ records: unknown[]; cursor: string }>;
  push(changes: readonly ChangeRef[]): Promise<void>;
}

export interface ProposalDraft {
  source: Proposal['source'];
  baseVersionId: string;
  payload: unknown;
  reasonCode: string;
  reasonText: string;
  evidence: Record<string, unknown>;
}
/**
 * Source of proposals. V1.0: deterministic engines. Later: AI. Whatever the
 * source, the output goes through Zod and the domain validator, and becomes
 * a draft; it never writes to the database itself.
 */
export interface ProposalSource {
  readonly id: string;
  propose(context: unknown): Promise<ProposalDraft[]>;
}

export interface FoodLookupPort {
  findByBarcode(barcode: string): Promise<Food | undefined>;
  search(query: string, limit: number): Promise<Food[]>;
}

/** Binary data without DOM types: the domain stays free of browser APIs. */
export interface StoredBlob {
  data: Uint8Array;
  mimeType: string;
}
export interface BlobStorePort {
  put(key: string, blob: StoredBlob): Promise<void>;
  get(key: string): Promise<StoredBlob | undefined>;
  delete(key: string): Promise<void>;
}

export * from './services';
