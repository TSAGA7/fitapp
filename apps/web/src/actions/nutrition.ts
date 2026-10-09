import type { AppDeps } from '@fitapp/application';
import {
  addDays,
  buildSnapshot,
  createBase,
  generateDayPlan,
  macrosForAmount,
  replaceFood,
  startOfWeek,
  ZERO_MACROS,
  type Availability,
  type Food,
  type FoodBasis,
  type FoodCategory,
  type FoodLog,
  type Macros,
  type MealSlot,
  type PlanLine,
  type PlannedItem,
  type Preference,
  type Repositories,
} from '@fitapp/domain';
import { planFoods } from '../app/derive';

const baseOf = (deps: AppDeps) => createBase(deps.ids.newId(), deps.clock.now(), deps.deviceId);

async function context(r: Repositories, deps: AppDeps) {
  const profile = await r.profile.get();
  const tz = profile?.timezone ?? 'UTC';
  const today = deps.clock.today(tz);
  const program = await r.programs.getProgram();
  const version = program?.activeVersionId ? await r.programs.getVersion(program.activeVersionId) : undefined;
  const targets = version?.nutrition ?? (await r.nutritionTargets.activeOn(today))?.targets;
  if (!targets || !version) throw new Error('Сначала создайте программу');
  const foods = planFoods(await r.foods.listAll(), await r.userFoods.listAll());
  return { profile, today, version, targets, foods, weekStartsOn: profile?.weekStartsOn ?? 'monday' };
}

const toLine = (i: PlannedItem): PlanLine => ({ slot: i.slot, foodId: i.foodId, grams: i.plannedAmountG, macros: i.plannedMacros, locked: i.locked });

function toItem(deps: AppDeps, planId: string, date: string, line: PlanLine, replacedFrom: string | null = null): PlannedItem {
  return { ...baseOf(deps), planId, date, slot: line.slot, foodId: line.foodId, plannedAmountG: line.grams, plannedMacros: line.macros, locked: line.locked ?? false, replacedFromItemId: replacedFrom };
}

async function ensurePlan(r: Repositories, deps: AppDeps, weekStart: string, versionId: string, seed: string) {
  const existing = await r.mealPlans.getByWeek(weekStart);
  if (existing) return existing;
  const plan = { ...baseOf(deps), weekStart, versionId, status: 'active' as const, generatedBy: 'engine' as const, generatorSeed: seed };
  await r.mealPlans.put(plan);
  return plan;
}

async function fillDay(r: Repositories, deps: AppDeps, c: Awaited<ReturnType<typeof context>>, date: string, variation: number, slots?: readonly MealSlot[], avoid?: ReadonlySet<string>) {
  const weekStart = startOfWeek(date, c.weekStartsOn);
  const plan = await ensurePlan(r, deps, weekStart, c.version.id, String(variation));
  const items = (await r.mealPlans.listItems(plan.id)).filter((i) => i.date === date && i.deletedAt === null);
  // Eaten (or skipped) items are facts: "redo" never touches them. What was really eaten counts with its REAL amount.
  const dayLogs = (await r.foodLogs.listAll()).filter((l) => l.date === date && l.deletedAt === null);
  const logOfItem = new Map<string, FoodLog>();
  for (const l of dayLogs) if (l.plannedItemId !== null) logOfItem.set(l.plannedItemId, l);
  const isKept = (i: PlannedItem): boolean => i.locked || logOfItem.has(i.id) || (slots !== undefined && !slots.includes(i.slot));
  // A meal is fixed only when ALL its items are kept; a meal with some eaten items is rebuilt around them.
  const slotDone = (slot: MealSlot): boolean => items.filter((i) => i.slot === slot).every(isKept);
  const protectedLines: PlanLine[] = [];
  const partialLines: PlanLine[] = [];
  for (const i of items.filter(isKept)) {
    const log = logOfItem.get(i.id);
    const line: PlanLine | undefined = log === undefined ? toLine(i) : log.entryType === 'skipped_planned' ? undefined : { slot: i.slot, foodId: i.foodId, grams: log.actualAmountG, macros: log.macros, locked: true };
    if (!line) continue;
    if (slotDone(i.slot)) protectedLines.push({ ...line, locked: true });
    else partialLines.push({ ...line, locked: false });
  }
  // Things eaten outside the plan use up the day's targets too: the meals that are not eaten yet are fitted to what remains.
  const outside = dayLogs.filter((l) => l.plannedItemId === null && l.entryType !== 'skipped_planned');
  const used = outside.reduce((a, l) => ({ kcal: a.kcal + l.macros.kcal, proteinG: a.proteinG + l.macros.proteinG, fatG: a.fatG + l.macros.fatG, carbG: a.carbG + l.macros.carbG, fiberG: a.fiberG + l.macros.fiberG }), { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0 });
  const left = (n: number, u: number) => Math.max(0, n - u);
  const targets = { ...c.targets, kcal: left(c.targets.kcal, used.kcal), proteinG: left(c.targets.proteinG, used.proteinG), fatG: left(c.targets.fatG, used.fatG), carbG: left(c.targets.carbG, used.carbG), fiberG: left(c.targets.fiberG, used.fiberG) };
  const result = generateDayPlan({ targets, foods: c.foods, seed: `${date}|${variation}`, locked: protectedLines, keepLines: partialLines, slots, avoidFoodIds: avoid });
  const keepIds = new Set(items.filter(isKept).map((i) => i.id));
  const fixedLines = [...protectedLines, ...partialLines];
  const now = deps.clock.now();
  const removed = items.filter((i) => !keepIds.has(i.id)).map((i) => ({ ...i, deletedAt: now }));
  const fresh = result.lines.filter((l) => !fixedLines.some((p) => p.slot === l.slot && p.foodId === l.foodId && p.grams === l.grams && p.macros === l.macros)).map((l) => toItem(deps, plan.id, date, l));
  await r.mealPlans.putItems([...removed, ...fresh]);
}

/**
 * After something was eaten differently from the plan: the meals that are not eaten yet are refitted so the day ends at its norm.
 * Only today and future days that already have a plan; eaten marks and locked items stay as they are.
 */
async function rebalanceDay(r: Repositories, deps: AppDeps, date: string): Promise<void> {
  const profile = await r.profile.get();
  const program = await r.programs.getProgram();
  if (!profile || !program?.activeVersionId) return;
  if (date < deps.clock.today(profile.timezone)) return;
  const plan = await r.mealPlans.getByWeek(startOfWeek(date, profile.weekStartsOn));
  if (!plan || !(await r.mealPlans.listItems(plan.id)).some((i) => i.date === date && i.deletedAt === null)) return;
  await fillDay(r, deps, await context(r, deps), date, Number(plan.generatorSeed) || 0);
}

/** Builds (or rebuilds) the meal plan for the days of a week that are not in the past. Locked items are kept. */
export async function generateWeekPlan(deps: AppDeps, weekStart: string, variation: number): Promise<void> {
  await deps.uow.run(async (r) => {
    const c = await context(r, deps);
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      if (date < c.today) continue;
      await fillDay(r, deps, c, date, variation);
    }
  });
}

export async function regenerateDay(deps: AppDeps, date: string, variation: number): Promise<void> {
  await deps.uow.run(async (r) => fillDay(r, deps, await context(r, deps), date, variation));
}

export async function regenerateMeal(deps: AppDeps, date: string, slot: MealSlot, variation: number): Promise<void> {
  await deps.uow.run(async (r) => {
    const c = await context(r, deps);
    const plan = await r.mealPlans.getByWeek(startOfWeek(date, c.weekStartsOn));
    const current = plan ? (await r.mealPlans.listItems(plan.id)).filter((i) => i.date === date && i.slot === slot && !i.locked) : [];
    await fillDay(r, deps, c, date, variation, [slot], new Set(current.map((i) => i.foodId)));
  });
}

/** "Replace this product": another food of the same kind with the amount that keeps the protein or energy. */
export async function replacePlannedItem(deps: AppDeps, itemId: string, variation: number): Promise<void> {
  await deps.uow.run(async (r) => {
    const c = await context(r, deps);
    const found = await findItem(r, c, itemId);
    if (!found) return;
    const next = replaceFood(toLine(found), c.foods, `${found.date}|${variation}`);
    if (!next) throw new Error('Нет подходящей замены среди ваших продуктов');
    await r.mealPlans.putItems([{ ...found, deletedAt: deps.clock.now() }, toItem(deps, found.planId, found.date, next, found.id)]);
  });
}

async function findItem(r: Repositories, c: Awaited<ReturnType<typeof context>>, itemId: string): Promise<PlannedItem | undefined> {
  for (let w = -4; w <= 3; w++) {
    const plan = await r.mealPlans.getByWeek(startOfWeek(addDays(c.today, w * 7), c.weekStartsOn));
    const item = plan ? (await r.mealPlans.listItems(plan.id)).find((i) => i.id === itemId) : undefined;
    if (item) return item;
  }
  return undefined;
}

export async function setPlannedAmount(deps: AppDeps, itemId: string, grams: number): Promise<void> {
  await deps.uow.run(async (r) => {
    const c = await context(r, deps);
    const item = await findItem(r, c, itemId);
    const food = c.foods.find((f) => f.id === item?.foodId);
    if (!item || !food || !(grams > 0)) return;
    await r.mealPlans.putItems([{ ...item, plannedAmountG: grams, plannedMacros: macrosForAmount(food.per100, grams) }]);
  });
}

export async function togglePlannedLock(deps: AppDeps, itemId: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const item = await findItem(r, await context(r, deps), itemId);
    if (item) await r.mealPlans.putItems([{ ...item, locked: !item.locked }]);
  });
}

export async function removePlannedItem(deps: AppDeps, itemId: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const item = await findItem(r, await context(r, deps), itemId);
    if (item) await r.mealPlans.putItems([{ ...item, deletedAt: deps.clock.now() }]);
  });
}

export async function addPlannedItem(deps: AppDeps, input: { date: string; slot: MealSlot; foodId: string; grams: number }): Promise<void> {
  await deps.uow.run(async (r) => {
    const c = await context(r, deps);
    const food = c.foods.find((f) => f.id === input.foodId);
    if (!food || !(input.grams > 0)) throw new Error('Выберите продукт и количество');
    const plan = await ensurePlan(r, deps, startOfWeek(input.date, c.weekStartsOn), c.version.id, 'manual');
    await r.mealPlans.putItems([toItem(deps, plan.id, input.date, { slot: input.slot, foodId: food.id, grams: input.grams, macros: macrosForAmount(food.per100, input.grams), locked: true })]);
  });
}

// ---------------------------------------------------------------- the diary (fact)

async function foodById(r: Repositories, id: string): Promise<Food> {
  const f = await r.foods.get(id);
  if (!f) throw new Error('Продукт не найден');
  return f;
}

function makeLog(deps: AppDeps, food: Food, input: { date: string; slot: MealSlot; grams: number; entryType: FoodLog['entryType']; plannedItemId: string | null; enteredBasis?: FoodBasis }): FoodLog {
  const skipped = input.entryType === 'skipped_planned';
  const grams = skipped ? 0 : input.grams;
  return {
    ...baseOf(deps),
    date: input.date,
    slot: input.slot,
    entryType: input.entryType,
    plannedItemId: input.plannedItemId,
    actualAmountG: grams,
    snapshot: buildSnapshot(food, input.enteredBasis ?? food.basis),
    macros: skipped ? ZERO_MACROS : macrosForAmount(food.per100, grams),
    note: null,
  };
}

/** Marks a planned item as eaten (with the real amount) or skipped. The plan itself is not changed: plan and fact are separate. */
export async function logPlanned(deps: AppDeps, itemId: string, outcome: { kind: 'eaten'; grams?: number } | { kind: 'skipped' }): Promise<void> {
  await deps.uow.run(async (r) => {
    const c = await context(r, deps);
    const item = await findItem(r, c, itemId);
    if (!item) return;
    for (const old of await r.foodLogs.listByPlannedItem(item.id)) await r.foodLogs.softDelete(old.id);
    const food = await foodById(r, item.foodId);
    if (outcome.kind === 'skipped') {
      await r.foodLogs.put(makeLog(deps, food, { date: item.date, slot: item.slot, grams: 0, entryType: 'skipped_planned', plannedItemId: item.id }));
      await rebalanceDay(r, deps, item.date);
      return;
    }
    const grams = outcome.grams ?? item.plannedAmountG;
    await r.foodLogs.put(makeLog(deps, food, { date: item.date, slot: item.slot, grams, entryType: grams === item.plannedAmountG ? 'as_planned' : 'modified', plannedItemId: item.id }));
    if (grams !== item.plannedAmountG) await rebalanceDay(r, deps, item.date);
  });
}

export async function undoLog(deps: AppDeps, logId: string): Promise<void> {
  await deps.uow.run(async (r) => {
    const log = (await r.foodLogs.listAll()).find((l) => l.id === logId);
    await r.foodLogs.softDelete(logId);
    if (log && (log.plannedItemId === null || log.entryType === 'skipped_planned' || log.entryType === 'modified')) await rebalanceDay(r, deps, log.date);
  });
}

/** Changes the eaten amount of an entry that was not in the plan. */
export async function setLogAmount(deps: AppDeps, logId: string, grams: number): Promise<void> {
  await deps.uow.run(async (r) => {
    if (!(grams > 0)) throw new Error('Укажите количество в граммах');
    const log = (await r.foodLogs.listAll()).find((l) => l.id === logId);
    if (!log) return;
    await r.foodLogs.put({ ...log, actualAmountG: grams, macros: macrosForAmount(log.snapshot.per100, grams) });
    if (log.plannedItemId === null) await rebalanceDay(r, deps, log.date);
  });
}

/** Clears all marks of a meal: planned items become "not eaten yet", unplanned entries are removed. */
export async function clearMealLogs(deps: AppDeps, date: string, slot: MealSlot): Promise<void> {
  await deps.uow.run(async (r) => {
    for (const l of (await r.foodLogs.listAll()).filter((x) => x.date === date && x.slot === slot && x.deletedAt === null)) await r.foodLogs.softDelete(l.id);
  });
}

/** Something eaten that was not in the plan. */
export async function logUnplanned(deps: AppDeps, input: { date: string; slot: MealSlot; foodId: string; grams: number }): Promise<void> {
  await deps.uow.run(async (r) => {
    if (!(input.grams > 0)) throw new Error('Укажите количество в граммах');
    const food = await foodById(r, input.foodId);
    await r.foodLogs.put(makeLog(deps, food, { ...input, entryType: 'unplanned', plannedItemId: null }));
    await rebalanceDay(r, deps, input.date);
  });
}

/** Marks every planned item of a meal as eaten as planned. */
export async function logMealAsPlanned(deps: AppDeps, date: string, slot: MealSlot): Promise<void> {
  await deps.uow.run(async (r) => {
    const c = await context(r, deps);
    const plan = await r.mealPlans.getByWeek(startOfWeek(date, c.weekStartsOn));
    const items = plan ? (await r.mealPlans.listItems(plan.id)).filter((i) => i.date === date && i.slot === slot) : [];
    for (const item of items) {
      if ((await r.foodLogs.listByPlannedItem(item.id)).length > 0) continue;
      const food = await foodById(r, item.foodId);
      await r.foodLogs.put(makeLog(deps, food, { date, slot, grams: item.plannedAmountG, entryType: 'as_planned', plannedItemId: item.id }));
    }
  });
}

// ---------------------------------------------------------------- my foods

export interface CustomFoodInput {
  name: string;
  brand: string | null;
  category: FoodCategory;
  basis: FoodBasis;
  per100: Macros;
  /** The source of the numbers, for honesty in the diary. */
  fromLabel: boolean;
  /** EAN/UPC from the scanner; the same product is found locally next time. */
  barcode?: string | null;
  /** Where the numbers came from when it is not the label or the user (e.g. Open Food Facts). */
  sourceNote?: string;
}

export async function createCustomFood(deps: AppDeps, input: CustomFoodInput): Promise<string> {
  const id = deps.ids.newId();
  await deps.uow.run((r) =>
    r.foods.put({
      ...createBase(id, deps.clock.now(), deps.deviceId),
      key: `custom_${id.replace(/-/g, '').slice(0, 16)}`,
      name: input.name.trim(),
      autoPlan: true,
      brand: input.brand?.trim() || null,
      barcode: input.barcode ?? null,
      category: input.category,
      basis: input.basis,
      unit: 'g',
      gramsPerPiece: null,
      per100: input.per100,
      variantGroup: null,
      yieldFactor: null,
      dataSource: { kind: input.fromLabel ? 'label' : 'user', note: input.sourceNote ?? (input.fromLabel ? 'С упаковки' : 'Введено пользователем') },
      origin: 'custom',
    }),
  );
  return id;
}

export async function setFoodPreference(deps: AppDeps, foodId: string, patch: Partial<{ preference: Preference; availability: Availability; excluded: boolean; maxPerDayG: number | null }>): Promise<void> {
  await deps.uow.run(async (r) => {
    const current = (await r.userFoods.listAll()).find((u) => u.foodId === foodId);
    if (current) await r.userFoods.put({ ...current, ...patch });
    else await r.userFoods.put({ ...baseOf(deps), foodId, preference: 'ok', availability: 'always', maxPerDayG: null, excluded: false, ...patch });
  });
}
