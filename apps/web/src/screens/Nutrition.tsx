import { useEffect, useMemo, useState } from 'react';
import { addDays, counterpart, dateRange, diffDays, macrosForAmount, SLOT_LABEL, startOfWeek, suggestTargetAdjustment, sumMacros, weekdayOf, type Food, type FoodCategory, type MealSlot, type PlannedItem } from '@fitapp/domain';
import {
  acceptTargetAdjustment,
  addPlannedItem,
  clearMealLogs,
  createCustomFood,
  deleteCustomFood,
  dishPer100,
  saveDish,
  updateCustomFood,
  createProgram,
  generateWeekPlan,
  logMealAsPlanned,
  logPlanned,
  logUnplanned,
  recalculateTargets,
  setManualNutrition,
  applyDietMode,
  regenerateDay,
  regenerateMeal,
  removePlannedItem,
  replacePlannedItem,
  setLogAmount,
  setPlannedAmount,
  togglePlannedLock,
  undoLog,
} from '../actions';
import { useData } from '../app/DataContext';
import { eatenOf, foodName, itemsOnDate, logsOnDate, plannedOf, SLOT_ORDER, userFoodOf } from '../app/derive';
import { fmt, formatDateShort, formatDay, GOAL_LABELS, WEEKDAY_SHORT } from '../app/format';
import { goalNutritionText } from './GoalExplain';
import { useCommand } from '../app/useCommand';
import { setManualTargets, useManualTargets, useVacationMode } from '../app/prefs';
import type { FoodLog } from '@fitapp/domain';
import { Badge, Button, Card, Chip, EmptyState, Icon, IconButton, LineChart, ListItem, ProgressBar, ProgressRing, Segmented, SelectField, Sheet, Switch, TextField, type ChartSeries } from '../ui';
import { isBarcode, lookupBarcode } from '../app/openFoodFacts';
import { BarcodeScanner } from './BarcodeScan';
import { parseDecimal, ScreenHeader } from './shared';

type View = 'day' | 'week' | 'month';
const variation = (): number => Math.floor(Date.now() / 1000) % 1_000_000;

export function Nutrition() {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(s.today);
  const targets = s.activeVersion?.nutrition ?? s.targets?.targets;

  if (!s.activeVersion || !targets) {
    return (
      <main className="screen">
        <ScreenHeader title="Питание" />
        {banner}
        <Card flat>
          <EmptyState
            icon="nutrition"
            title="Составим рацион под тебя"
            text="По росту, весу, возрасту, цели и тренировкам посчитаю калории и БЖУ и разложу их по приёмам пищи."
            action={<Button icon="check" disabled={busy} onClick={() => void run((d) => createProgram(d))}>Создать программу</Button>}
          />
        </Card>
      </main>
    );
  }

  return (
    <main className="screen">
      <ScreenHeader title="Питание" />
      <Segmented<View> label="Период" value={view} onChange={setView} options={[{ value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]} />
      {banner}
      {view === 'day' && <DayView date={date} setDate={setDate} />}
      {view === 'week' && <WeekView date={date} setDate={setDate} openDay={() => setView('day')} />}
      {view === 'month' && <MonthView />}
    </main>
  );
}

// ------------------------------------------------------------------ day

function DayView({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const targets = (s.activeVersion?.nutrition ?? s.targets?.targets)!;
  const items = itemsOnDate(s, date);
  const logs = logsOnDate(s, date);
  const eaten = eatenOf(logs);
  // The day as it will be: what was really eaten plus what is still planned.
  const planned = sumMacros([eaten, plannedOf(items.filter((i) => !logs.some((l) => l.plannedItemId === i.id)))]);
  const vacation = useVacationMode();
  const manual = useManualTargets();
  const [normOpen, setNormOpen] = useState(false);
  const [slotForAdd, setSlotForAdd] = useState<{ slot: MealSlot; scan: boolean } | null>(null);
  const [itemSheet, setItemSheet] = useState<PlannedItem | null>(null);
  const [logSheet, setLogSheet] = useState<FoodLog | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const adjustment = useMemo(
    () =>
      !manual && s.primaryGoal && s.profile && s.activeVersion
        ? suggestTargetAdjustment({ goal: s.primaryGoal.type, sex: s.profile.sex, targets, weight: s.weight, daysOnTargets: diffDays(s.activeVersion.effectiveFrom, s.today) })
        : null,
    [s, targets, manual],
  );

  const remaining = targets.kcal - eaten.kcal;
  const logOf = (itemId: string) => logs.find((l) => l.plannedItemId === itemId);
  const isPast = date < s.today;

  return (
    <>
      <DayNav date={date} setDate={setDate} today={s.today} />
      {banner}
      {vacation && <Card flat><p className="t-small">Режим «Отпуск»: это особый рацион питания, подобранный специально для тебя 🫶🏼</p></Card>}
      {adjustment && !dismissed && (
        <Card>
          <div className="stack">
            <div className="row"><Badge tone="warning">Предложение</Badge><span className="t-caption">{adjustment.kcalDelta > 0 ? '+' : ''}{adjustment.kcalDelta} ккал</span></div>
            <p className="t-body">{adjustment.reasonText}</p>
            <div className="row">
              <Button size="sm" disabled={busy} onClick={() => void run((d) => acceptTargetAdjustment(d, adjustment))}>Принять</Button>
              <Button size="sm" variant="text" onClick={() => setDismissed(true)}>Не сейчас</Button>
            </div>
          </div>
        </Card>
      )}

      <Card onClick={() => setNormOpen(true)}>
        <div className="row" style={{ gap: 18 }}>
          <ProgressRing value={targets.kcal > 0 ? eaten.kcal / targets.kcal : 0} size={140} stroke={11}>
            <div className="ring-num">{fmt(Math.abs(remaining), 0)}</div>
            <div className="ring-cap">{remaining >= 0 ? 'ккал осталось' : 'ккал сверх'}</div>
          </ProgressRing>
          <div className="grow stack">
            <Macro label="Белки" eaten={eaten.proteinG} target={targets.proteinG} color="#16a34a" />
            <Macro label="Жиры" eaten={eaten.fatG} target={targets.fatG} color="#f59e0b" />
            <Macro label="Углеводы" eaten={eaten.carbG} target={targets.carbG} color="#a78bfa" />
          </div>
        </div>
        <div className="row between" style={{ marginTop: 12 }}>
          <span className="t-small">Съедено {fmt(eaten.kcal, 0)} из нормы {fmt(targets.kcal, 0)} ккал{manual ? ' · вручную' : ''}</span>
          {items.length > 0 && <span className="t-small">Рацион {fmt(planned.kcal, 0)} ккал</span>}
        </div>
        <div className="row" style={{ marginTop: 8 }}><span className="t-small" style={{ color: 'var(--primary)', fontWeight: 600 }}>Норма и почему такая · изменить</span><Icon name="chevronRight" size={14} /></div>
        {items.length > 0 && Math.abs(planned.kcal - targets.kcal) > targets.kcal * 0.03 && (
          <p className="t-small" style={{ marginTop: 6 }}>Норма — сколько нужно на день по твоей цели. Рацион — то, что составлено из продуктов: сейчас он {planned.kcal < targets.kcal ? 'меньше' : 'больше'} нормы на {fmt(Math.abs(targets.kcal - planned.kcal), 0)} ккал. Нажми «Переделать» у приёма пищи или пересобери день, чтобы подогнать.</p>
        )}
      </Card>

      {items.length === 0 && !isPast && (
        <Card flat>
          <EmptyState icon="leaf" title="На этот день рациона ещё нет" text="Составлю рацион на неделю из твоих продуктов под норму калорий и БЖУ." action={<Button icon="check" disabled={busy} onClick={() => void run((d) => generateWeekPlan(d, startOfWeek(date, s.profile?.weekStartsOn ?? 'monday'), variation()))}>Составить рацион на неделю</Button>} />
        </Card>
      )}

      {SLOT_ORDER.map((slot) => {
        const slotItems = items.filter((i) => i.slot === slot);
        const itemIds = new Set(items.map((i) => i.id));
        const slotLogs = logs.filter((l) => l.slot === slot);
        // Entries that are not tied to a plan item (added by hand, or whose plan item was replaced).
        const loose = slotLogs.filter((l) => l.plannedItemId === null || !itemIds.has(l.plannedItemId));
        const plan = sumMacros(slotItems.map((i) => i.plannedMacros));
        const fact = eatenOf(slotLogs);
        const allDone = slotItems.length > 0 && slotItems.every((i) => logOf(i.id));
        return (
          <section key={slot} aria-label={SLOT_LABEL[slot]} className="stack">
            <div className="section-title">
              <h2 className="t-h3">{SLOT_LABEL[slot]}</h2>
              <span className="t-small">{slotItems.length > 0 || slotLogs.length > 0 ? `${fmt(fact.kcal, 0)} / ${fmt(plan.kcal, 0)} ккал` : ''}</span>
            </div>
            {(slotItems.length > 0 || slotLogs.length > 0) && (
              <div className="macro-strip" aria-label={`БЖУ: ${SLOT_LABEL[slot]}`}>
                <MacroLine label="План" m={plan} muted />
                <MacroLine label="Съедено" m={fact} />
              </div>
            )}
            {slotItems.map((i) => {
              const log = logOf(i.id);
              const name = foodName(s.foods, i.foodId);
              const subtitle = log
                ? log.entryType === 'skipped_planned'
                  ? 'Пропущено'
                  : log.entryType === 'modified'
                    ? `Съедено ${fmt(log.actualAmountG, 0)} г вместо ${fmt(i.plannedAmountG, 0)} г`
                    : `${fmt(i.plannedAmountG, 0)} г · съедено`
                : `${fmt(i.plannedAmountG, 0)} г · Б ${fmt(i.plannedMacros.proteinG, 0)} Ж ${fmt(i.plannedMacros.fatG, 0)} У ${fmt(i.plannedMacros.carbG, 0)}`;
              return (
                <ListItem
                  key={i.id}
                  icon={log ? (log.entryType === 'skipped_planned' ? 'close' : 'check') : i.locked ? 'shield' : 'nutrition'}
                  lime={!!log && log.entryType !== 'skipped_planned'}
                  title={name}
                  subtitle={subtitle}
                  trailing={<span className="t-small">{fmt(log && log.entryType !== 'skipped_planned' ? log.macros.kcal : i.plannedMacros.kcal, 0)}</span>}
                  onClick={() => setItemSheet(i)}
                />
              );
            })}
            {loose.map((l) => (
              <ListItem key={l.id} icon="check" lime title={l.snapshot.foodName} subtitle={`${l.plannedItemId === null ? 'Съедено не по плану' : 'Из прежнего плана'} · ${fmt(l.actualAmountG, 0)} г · Б ${fmt(l.macros.proteinG, 0)} Ж ${fmt(l.macros.fatG, 0)} У ${fmt(l.macros.carbG, 0)}`} trailing={<span className="t-small">{fmt(l.macros.kcal, 0)}</span>} onClick={() => setLogSheet(l)} />
            ))}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => setSlotForAdd({ slot, scan: false })}>Добавить еду</Button>
              {slotItems.length > 0 && !allDone && <Button size="sm" variant="secondary" icon="check" disabled={busy} onClick={() => void run((d) => logMealAsPlanned(d, date, slot))}>Съел всё</Button>}
              {slotLogs.length > 0 && <Button size="sm" variant="text" disabled={busy} onClick={() => void run((d) => clearMealLogs(d, date, slot))}>Сбросить отметки</Button>}
              {!isPast && <Button size="sm" variant="text" disabled={busy} onClick={() => void run((d) => regenerateMeal(d, date, slot, variation()))}>Переделать</Button>}
            </div>
            {slotLogs.length > 0 && <p className="t-small">«Переделать» не трогает то, что ты уже съел. Нажми на строку, чтобы изменить граммы или убрать отметку.</p>}
          </section>
        );
      })}

      {!isPast && <Button variant="secondary" block icon="scan" onClick={() => setSlotForAdd({ slot: 'snack', scan: true })}>Сканировать штрих-код</Button>}
      {!isPast && items.length > 0 && (
        <Button variant="secondary" block icon="history" disabled={busy} onClick={() => void run((d) => regenerateDay(d, date, variation()))}>Переделать день</Button>
      )}
      <NormSheet open={normOpen} onClose={() => setNormOpen(false)} current={targets} manual={manual} />

      <AddFoodSheet open={slotForAdd !== null} slot={slotForAdd?.slot ?? 'snack'} startScan={slotForAdd?.scan ?? false} date={date} onClose={() => setSlotForAdd(null)} />
      <ItemSheet item={itemSheet} onClose={() => setItemSheet(null)} />
      <LogSheet log={logSheet} onClose={() => setLogSheet(null)} />
    </>
  );
}

function MacroLine({ label, m, muted }: { label: string; m: { proteinG: number; fatG: number; carbG: number }; muted?: boolean }) {
  return (
    <div className={`macro-line ${muted ? 'muted' : ''}`}>
      <span className="ml-label">{label}</span>
      <span><i className="dot" style={{ background: '#16a34a' }} /> Б {fmt(m.proteinG, 0)}</span>
      <span><i className="dot" style={{ background: '#f59e0b' }} /> Ж {fmt(m.fatG, 0)}</span>
      <span><i className="dot" style={{ background: '#a78bfa' }} /> У {fmt(m.carbG, 0)}</span>
    </div>
  );
}

/** Small / medium / large for foods people do not weigh (banana, apple, cucumber...): one tap fills in the grams. */
function PortionChips({ portions, grams, onPick }: { portions: { small: number; medium: number; large: number } | undefined; grams: number; onPick: (g: number) => void }) {
  if (!portions) return null;
  const sizes: ReadonlyArray<[string, number]> = [['Маленький', portions.small], ['Средний', portions.medium], ['Большой', portions.large]];
  return (
    <div className="stack tight">
      <div className="t-caption">Не взвешивал? Выбери размер</div>
      <div className="chips" role="group" aria-label="Размер порции">
        {sizes.map(([label, g]) => (
          <Chip key={label} pressed={Math.round(grams) === g} onClick={() => onPick(g)}>{label} · {g} г</Chip>
        ))}
      </div>
    </div>
  );
}

const OTHER_FORM: Record<string, string> = { raw: 'сырого', cooked: 'готового', as_sold: 'как на упаковке' };

/** Raw <-> cooked converter: how much the same amount weighs in the other form (dry buckwheat <-> boiled), with a switch to enter it that way. */
function ConvertHint({ food, grams, onSwitch }: { food: Food; grams: number; onSwitch?: (other: Food, grams: number) => void }) {
  const { snapshot: s } = useData();
  const pair = counterpart(food, s.foods.filter((f) => f.deletedAt === null));
  if (!pair || !(grams > 0)) return null;
  const dry = pair.food.basis === 'raw' && (pair.food.category === 'grains' || pair.food.category === 'legumes');
  const label = dry ? 'сухого' : (OTHER_FORM[pair.food.basis] ?? '');
  const other = Math.round(pair.toOtherGrams(grams));
  return (
    <div className="note convert-hint">
      <span>{fmt(grams, 0)} г {food.basis === 'cooked' ? 'готового' : dry ? 'сухого' : 'сырого'} продукта ≈ <b>{other} г</b> {label}. Готовое и сырое весят по-разному, калории те же.</span>
      {onSwitch && <Button variant="text" size="sm" icon="swap" onClick={() => onSwitch(pair.food, other)}>Ввести вес {label}</Button>}
    </div>
  );
}

function LogSheet({ log, onClose }: { log: FoodLog | null; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const [grams, setGrams] = useState('');
  if (!log) return null;
  const g = parseDecimal(grams);
  const logFood = s.foods.find((f) => f.id === log.snapshot.foodId);
  const done = async (fn: Parameters<typeof ok>[0]) => {
    if (await ok(fn)) {
      setGrams('');
      onClose();
    }
  };
  return (
    <Sheet open title={log.snapshot.foodName} onClose={onClose}>
      <div className="stack">
        {banner}
        <p className="t-small">Записано: {fmt(log.actualAmountG, 0)} г · {fmt(log.macros.kcal, 0)} ккал · Б {fmt(log.macros.proteinG, 0)} Ж {fmt(log.macros.fatG, 0)} У {fmt(log.macros.carbG, 0)}</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="grow"><TextField label="Правильное количество" unit="г" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} /></div>
          <Button variant="secondary" disabled={busy || !(g > 0)} onClick={() => void done((d) => setLogAmount(d, log.id, g))}>Изменить</Button>
        </div>
        <PortionChips portions={logFood?.portions} grams={g} onPick={(v) => setGrams(String(v))} />
        <Button block variant="danger" icon="trash" disabled={busy} onClick={() => void done((d) => undoLog(d, log.id))}>Удалить запись</Button>
      </div>
    </Sheet>
  );
}

function Macro({ label, eaten, target, color }: { label: string; eaten: number; target: number; color: string }) {
  return (
    <div>
      <div className="row between">
        <span className="t-small"><span className="dot" style={{ background: color }} /> {label}</span>
        <span className="t-small">{fmt(eaten, 0)} / {fmt(target, 0)} г</span>
      </div>
      <ProgressBar value={target > 0 ? eaten / target : 0} label={label} />
    </div>
  );
}

function DayNav({ date, setDate, today }: { date: string; setDate: (d: string) => void; today: string }) {
  return (
    <div className="row between">
      <IconButton icon="chevronLeft" label="Предыдущий день" tone="ghost" onClick={() => setDate(addDays(date, -1))} />
      <div style={{ textAlign: 'center' }}>
        <div className="t-h3">{date === today ? 'Сегодня' : formatDay(date)}</div>
        <div className="t-small">{WEEKDAY_SHORT[weekdayOf(date)]}, {formatDay(date)}</div>
      </div>
      <IconButton icon="chevronRight" label="Следующий день" tone="ghost" onClick={() => setDate(addDays(date, 1))} />
    </div>
  );
}

function ItemSheet({ item, onClose }: { item: PlannedItem | null; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const [grams, setGrams] = useState('');
  if (!item) return null;
  const food = s.foods.find((f) => f.id === item.foodId);
  const log = logsOnDate(s, item.date).find((l) => l.plannedItemId === item.id);
  const done = async (fn: Parameters<typeof ok>[0]) => {
    if (await ok(fn)) onClose();
  };
  const g = parseDecimal(grams);
  return (
    <Sheet open title={food?.name ?? 'Продукт'} onClose={onClose}>
      <div className="stack">
        {banner}
        <p className="t-small">План: {fmt(item.plannedAmountG, 0)} г · {fmt(item.plannedMacros.kcal, 0)} ккал · Б {fmt(item.plannedMacros.proteinG, 0)} Ж {fmt(item.plannedMacros.fatG, 0)} У {fmt(item.plannedMacros.carbG, 0)}</p>
        {food && <p className="t-small">{food.basis === 'raw' ? 'Вес сырого продукта' : food.basis === 'cooked' ? 'Вес готового продукта' : 'Вес как на упаковке'}</p>}
        {log && <p className="t-small">Сейчас: {log.entryType === 'skipped_planned' ? 'пропущено' : `съедено ${fmt(log.actualAmountG, 0)} г`}</p>}
        <Button block icon="check" disabled={busy} onClick={() => void done((d) => logPlanned(d, item.id, { kind: 'eaten' }))}>Съел как в плане</Button>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="grow"><TextField label="Съел другое количество" unit="г" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} /></div>
          <Button variant="secondary" disabled={busy || !(g > 0)} onClick={() => void done((d) => logPlanned(d, item.id, { kind: 'eaten', grams: g }))}>Записать</Button>
        </div>
        <PortionChips portions={food?.portions} grams={g} onPick={(v) => setGrams(String(v))} />
        {food && <ConvertHint food={food as Food} grams={g > 0 ? g : item.plannedAmountG} />}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button variant="secondary" disabled={busy} onClick={() => void done((d) => logPlanned(d, item.id, { kind: 'skipped' }))}>Пропустил</Button>
          {log && <Button variant="secondary" icon="close" disabled={busy} onClick={() => void done((d) => undoLog(d, log.id))}>Убрать отметку</Button>}
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button size="sm" variant="text" disabled={busy} onClick={() => void done((d) => replacePlannedItem(d, item.id, variation()))}>Заменить продукт</Button>
          <Button size="sm" variant="text" disabled={busy} onClick={() => void done((d) => togglePlannedLock(d, item.id))}>{item.locked ? 'Открепить' : 'Закрепить'}</Button>
          <Button size="sm" variant="text" disabled={busy || !(g > 0)} onClick={() => void done((d) => setPlannedAmount(d, item.id, g))}>Изменить план на {Number.isFinite(g) && g > 0 ? `${fmt(g, 0)} г` : 'введённое'}</Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => void done((d) => removePlannedItem(d, item.id))}>Убрать из плана</Button>
        </div>
        <p className="t-small">Закреплённые продукты не меняются при «Переделать».</p>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ adding food

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  meat: 'Мясо', poultry: 'Птица', sausages: 'Колбасы и сосиски', fish: 'Рыба', seafood: 'Морепродукты', eggs: 'Яйца', dairy: 'Молочное', cheese: 'Сыры', grains: 'Крупы и макароны', legumes: 'Бобовые', vegetables: 'Овощи', fruits: 'Фрукты', nuts_seeds: 'Орехи и семена', fats_oils: 'Масла и жиры', bread_bakery: 'Хлеб и выпечка', canned: 'Консервы', sauces: 'Соусы и приправы', snacks: 'Снеки и чипсы', sweets: 'Сладкое', drinks: 'Напитки', supplements: 'Спортпит и добавки', semi_finished: 'Полуфабрикаты и пельмени', soups: 'Супы', ready_meals: 'Готовые блюда', fast_food: 'Фастфуд и рестораны', other: 'Другое',
};

function AddFoodSheet({ open, slot, startScan, date, onClose }: { open: boolean; slot: MealSlot; startScan: boolean; date: string; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { ok, run, banner, busy } = useCommand();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<FoodCategory | 'all'>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const [grams, setGrams] = useState('100');
  const [mode, setMode] = useState<'eaten' | 'plan'>('eaten');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dishing, setDishing] = useState<'new' | 'edit' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [slotSel, setSlotSel] = useState<MealSlot>(slot);
  useEffect(() => {
    if (open) {
      setSlotSel(slot);
      setScanning(startScan);
    }
  }, [open, slot, startScan]);

  const onCode = async (code: string) => {
    setScanning(false);
    setScanNote(null);
    const local = s.foods.find((f) => f.deletedAt === null && f.barcode === code);
    if (local) {
      setPicked(local.id);
      setGrams(local.gramsPerPiece ? String(local.gramsPerPiece) : '100');
      return;
    }
    setLooking(true);
    try {
      const found = await lookupBarcode(code);
      if (found) {
        const id = await run((d) => createCustomFood(d, { name: found.name, brand: found.brand, category: 'other', basis: 'as_sold', per100: found.per100, fromLabel: false, barcode: code, sourceNote: 'Open Food Facts: данные пользователей, сверь с упаковкой' }));
        if (id) {
          setPicked(id);
          setGrams('100');
          setScanNote('Нашёл в Open Food Facts. Это данные пользователей: сверь с упаковкой.');
        }
        return;
      }
      setScanNote('Этого штрих-кода нет в базе. Введи цифры с упаковки один раз, и в следующий раз продукт найдётся сразу.');
    } catch {
      setScanNote('Нет сети для поиска. Введи цифры с упаковки один раз, и в следующий раз продукт найдётся без интернета.');
    } finally {
      setLooking(false);
    }
    setBarcode(code);
    setCreating(true);
  };

  const foods = useMemo(() => {
    const q = query.trim().toLowerCase();
    return s.foods
      .filter((f) => f.deletedAt === null && !userFoodOf(s.userFoods, f.id)?.excluded && (cat === 'all' || f.category === cat) && (q === '' || f.name.toLowerCase().includes(q)))
      .sort((a, b) => (a.origin === b.origin ? a.name.localeCompare(b.name, 'ru') : a.origin === 'custom' ? -1 : 1))
      .slice(0, cat === 'all' ? 40 : 120);
  }, [s.foods, s.userFoods, query, cat]);
  const presentCategories = useMemo(() => {
    const have = new Set(s.foods.filter((f) => f.deletedAt === null).map((f) => f.category));
    return (Object.keys(CATEGORY_LABELS) as FoodCategory[]).filter((k) => have.has(k));
  }, [s.foods]);
  const food = s.foods.find((f) => f.id === picked);
  const g = parseDecimal(grams);
  const preview = food && g > 0 ? macrosForAmount(food.per100, g) : null;
  const close = () => {
    setPicked(null);
    setQuery('');
    setCat('all');
    setCreating(false);
    setEditing(false);
    setDishing(null);
    setConfirmDelete(false);
    setScanning(false);
    setScanNote(null);
    setBarcode(null);
    onClose();
  };

  return (
    <Sheet open={open} title="Добавить еду" onClose={close}>
      <div className="stack">
        {banner}
        {scanNote && <div className="note">{scanNote}</div>}
        {looking ? (
          <p className="t-body">Ищу продукт по штрих-коду…</p>
        ) : scanning ? (
          <BarcodeScanner onCode={(c) => void onCode(c)} onCancel={() => setScanning(false)} />
        ) : dishing ? (
          <DishForm
            initial={dishing === 'edit' ? food : undefined}
            onCancel={() => setDishing(null)}
            onSaved={(id, totalG) => { setDishing(null); setPicked(id); setGrams(String(totalG)); }}
          />
        ) : editing && food ? (
          <CustomFoodForm
            initial={food}
            onCancel={() => setEditing(false)}
            onCreated={() => setEditing(false)}
          />
        ) : creating ? (
          <CustomFoodForm
            barcode={barcode}
            onCancel={() => { setCreating(false); setBarcode(null); }}
            onCreated={(id) => {
              setCreating(false);
              setPicked(id);
            }}
          />
        ) : !food ? (
          <>
            <div className="add-row">
              <Button variant="secondary" size="sm" block icon="scan" onClick={() => setScanning(true)}>Сканировать штрих-код</Button>
              <Button variant="secondary" size="sm" block icon="plus" onClick={() => setCreating(true)}>Добавить свой продукт</Button>
            </div>
            <Button variant="secondary" size="sm" block icon="plus" onClick={() => setDishing('new')}>Создать блюдо из ингредиентов</Button>
            <TextField label="Поиск продукта" className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например, гречка" />
            <div className="cat-chips" role="group" aria-label="Категория">
              <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>Все</button>
              {presentCategories.map((k) => <button key={k} type="button" className="chip" aria-pressed={cat === k} onClick={() => setCat(k)}>{CATEGORY_LABELS[k]}</button>)}
            </div>
            <div className="list">
              {foods.map((f) => (
                <ListItem key={f.id} title={f.name} subtitle={`${CATEGORY_LABELS[f.category]} · ${fmt(f.per100.kcal, 0)} ккал/100 г`} onClick={() => { setPicked(f.id); setGrams(f.gramsPerPiece ? String(f.gramsPerPiece) : '100'); }} />
              ))}
              {foods.length === 0 && <div className="empty-hint"><span className="eh-ic" aria-hidden="true">🔍</span><span className="eh-t">Ничего не найдено</span><span className="eh-s">Попробуй другое название или добавь свой продукт</span></div>}
            </div>
          </>
        ) : (
          <>
            <div className="t-h3">{food.name}</div>
            <p className="t-small">{food.basis === 'raw' ? 'Вес сырого продукта' : food.basis === 'cooked' ? 'Вес готового продукта' : 'Вес как на упаковке'}</p>
            <TextField label="Количество" unit="г" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
            <PortionChips portions={food.portions} grams={g} onPick={(v) => setGrams(String(v))} />
            <ConvertHint food={food} grams={g} onSwitch={(other, v) => { setPicked(other.id); setGrams(String(v)); }} />
            {preview && <p className="t-body">{fmt(preview.kcal, 0)} ккал · Б {fmt(preview.proteinG, 0)} Ж {fmt(preview.fatG, 0)} У {fmt(preview.carbG, 0)}</p>}
            <div className="t-caption">Какой приём пищи</div>
            <Segmented<MealSlot> value={slotSel} onChange={setSlotSel} options={SLOT_ORDER.map((k) => ({ value: k, label: SLOT_LABEL[k] }))} label="Приём пищи" small />
            <Segmented<'eaten' | 'plan'> value={mode} onChange={setMode} options={[{ value: 'eaten', label: 'Я съел' }, { value: 'plan', label: 'В план' }]} label="Куда записать" />
            <div className="row">
              <Button variant="text" onClick={() => setPicked(null)}>Назад</Button>
              <Button
                disabled={busy || !(g > 0)}
                onClick={async () => {
                  const done = await ok((d) => (mode === 'eaten' ? logUnplanned(d, { date, slot: slotSel, foodId: food.id, grams: g }) : addPlannedItem(d, { date, slot: slotSel, foodId: food.id, grams: g })));
                  if (done) close();
                }}
              >
                Добавить
              </Button>
            </div>
            {food.origin === 'custom' && (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <Button variant="text" size="sm" icon="edit" onClick={() => (food.recipe ? setDishing('edit') : setEditing(true))}>{food.recipe ? 'Изменить блюдо' : 'Изменить продукт'}</Button>
                {!confirmDelete ? (
                  <Button variant="text" size="sm" icon="trash" onClick={() => setConfirmDelete(true)}>Удалить</Button>
                ) : (
                  <Button variant="danger" size="sm" icon="trash" disabled={busy} onClick={async () => { if (await ok((d) => deleteCustomFood(d, food.id))) { setConfirmDelete(false); setPicked(null); } }}>Точно удалить?</Button>
                )}
              </div>
            )}
            {mode === 'eaten' && <p className="t-small">Остальные приёмы пищи, которые ты ещё не отметил, пересчитаются так, чтобы день закончился на норме. Уже съеденное не меняется.</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}

function CustomFoodForm({ barcode, initial, onCancel, onCreated }: { barcode?: string | null; initial?: Food; onCancel: () => void; onCreated: (id: string) => void }) {
  const { run, ok, banner, busy } = useCommand();
  const txt = (v: number | undefined): string => (v === undefined ? '' : String(v).replace('.', ','));
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<FoodCategory>(initial?.category ?? 'other');
  const [basis, setBasis] = useState<'as_sold' | 'raw' | 'cooked'>(initial?.basis ?? 'as_sold');
  const [kcal, setKcal] = useState(txt(initial?.per100.kcal));
  const [p, setP] = useState(txt(initial?.per100.proteinG));
  const [f, setF] = useState(txt(initial?.per100.fatG));
  const [c, setC] = useState(txt(initial?.per100.carbG));
  const [fiber, setFiber] = useState(txt(initial?.per100.fiberG));
  const [label, setLabel] = useState(initial ? initial.dataSource.kind === 'label' : true);
  const num = (v: string): number => (v.trim() === '' ? 0 : parseDecimal(v));
  const valid = name.trim().length > 0 && [kcal, p, f, c].every((v) => Number.isFinite(num(v)) && num(v) >= 0) && num(p) + num(f) + num(c) <= 100;
  return (
    <div className="stack">
      {banner}
      <TextField label="Название" value={name} onChange={(e) => setName(e.target.value)} />
      <SelectField label="Категория" value={category} onChange={(e) => setCategory(e.target.value as FoodCategory)}>
        {(Object.keys(CATEGORY_LABELS) as FoodCategory[]).map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}
      </SelectField>
      <SelectField label="Что означает вес" value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)} hint="Сырой, готовый или как на упаковке: цифры на 100 г относятся к этому виду.">
        <option value="as_sold">Как на упаковке</option>
        <option value="raw">Сырой</option>
        <option value="cooked">Готовый</option>
      </SelectField>
      <div className="grid-2">
        <TextField label="Ккал на 100 г" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        <TextField label="Белки, г" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
        <TextField label="Жиры, г" inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} />
        <TextField label="Углеводы, г" inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} />
        <TextField label="Клетчатка, г" inputMode="decimal" value={fiber} onChange={(e) => setFiber(e.target.value)} />
      </div>
      <label className="row"><input type="checkbox" checked={label} onChange={(e) => setLabel(e.target.checked)} /> <span className="t-small">Цифры взяты с упаковки</span></label>
      <div className="row">
        <Button variant="text" onClick={onCancel}>Отмена</Button>
        <Button
          disabled={busy || !valid}
          onClick={async () => {
            const per100 = { kcal: num(kcal), proteinG: num(p), fatG: num(f), carbG: num(c), fiberG: num(fiber) };
            if (initial) {
              if (await ok((d) => updateCustomFood(d, initial.id, { name, brand: initial.brand, category, basis, per100, fromLabel: label }))) onCreated(initial.id);
              return;
            }
            const id = await run((d) => createCustomFood(d, { name, brand: null, category, basis, per100, fromLabel: label, barcode: barcode && isBarcode(barcode) ? barcode : null }));
            if (id) onCreated(id);
          }}
        >
          Сохранить
        </Button>
      </div>
    </div>
  );
}

/** A dish from the user's own ingredients ("blini with cheese and mushrooms", "PP shawarma"): the numbers are calculated from the list. */
function DishForm({ initial, onCancel, onSaved }: { initial?: Food; onCancel: () => void; onSaved: (id: string, totalG: number) => void }) {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const [name, setName] = useState(initial?.name ?? '');
  const [items, setItems] = useState<Array<{ foodId: string; grams: string }>>(initial?.recipe ? initial.recipe.items.map((i) => ({ foodId: i.foodId, grams: String(i.grams) })) : []);
  const [totalText, setTotalText] = useState(initial?.recipe ? String(initial.recipe.totalG) : '');
  const [query, setQuery] = useState('');
  const foods = s.foods.filter((f) => f.deletedAt === null && !f.recipe);
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === '' ? [] : foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, foods]);
  const parsed = items.map((i) => ({ foodId: i.foodId, grams: parseDecimal(i.grams) })).filter((i) => i.grams > 0);
  const total = totalText.trim() === '' ? null : parseDecimal(totalText);
  const calc = dishPer100(foods, parsed, total !== null && total > 0 ? total : null);
  const sum = parsed.reduce((a, i) => a + i.grams, 0);
  const valid = name.trim().length > 0 && parsed.length > 0 && calc !== undefined;
  return (
    <div className="stack">
      {banner}
      <TextField label="Название блюда" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, блины с сыром и грибами" />
      <div className="t-caption">Вес указывай в том виде, в котором используешь ингредиент: сухой, сырой, варёный, жареный и так далее. Вид подписан у каждого поля.</div>
      <div className="list">
        {items.map((it, idx) => {
          const f = foods.find((x) => x.id === it.foodId);
          return (
            <div key={`${it.foodId}-${idx}`} className="row" style={{ alignItems: 'flex-end' }}>
              <div className="grow">
                <TextField label={f ? `${f.name} · ${f.basis === 'raw' ? 'сырой' : f.basis === 'cooked' ? 'готовый' : 'как на упаковке'}` : 'Продукт'} unit="г" inputMode="decimal" value={it.grams} onChange={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, grams: e.target.value } : x)))} />
              </div>
              <IconButton icon="trash" label="Убрать ингредиент" tone="ghost" onClick={() => setItems(items.filter((_, j) => j !== idx))} />
            </div>
          );
        })}
      </div>
      <TextField label="Найти ингредиент" className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например, творог" />
      {hits.length > 0 && (
        <div className="list">
          {hits.map((f) => <ListItem key={f.id} title={f.name} subtitle={`${fmt(f.per100.kcal, 0)} ккал/100 г`} onClick={() => { setItems([...items, { foodId: f.id, grams: f.gramsPerPiece ? String(f.gramsPerPiece) : '100' }]); setQuery(''); }} />)}
        </div>
      )}
      <TextField label="Вес готового блюда (необязательно)" unit="г" inputMode="decimal" value={totalText} onChange={(e) => setTotalText(e.target.value)} hint={`Если оставить пустым, возьмём сумму ингредиентов: ${fmt(sum, 0)} г. При готовке вес меняется, взвесь результат, если хочешь точнее.`} />
      {calc && (
        <p className="t-body">
          Всё блюдо ({fmt(calc.totalG, 0)} г): {fmt((calc.per100.kcal * calc.totalG) / 100, 0)} ккал · Б {fmt((calc.per100.proteinG * calc.totalG) / 100, 0)} Ж {fmt((calc.per100.fatG * calc.totalG) / 100, 0)} У {fmt((calc.per100.carbG * calc.totalG) / 100, 0)}
          <br />
          На 100 г: {fmt(calc.per100.kcal, 0)} ккал
        </p>
      )}
      <div className="row">
        <Button variant="text" onClick={onCancel}>Отмена</Button>
        <Button
          disabled={busy || !valid}
          onClick={async () => {
            let saved: string | undefined;
            if (await ok(async (d) => { saved = await saveDish(d, { id: initial?.id, name, items: parsed, totalG: total !== null && total > 0 ? total : null }); })) if (saved && calc) onSaved(saved, Math.round(calc.totalG));
          }}
        >
          Сохранить блюдо
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ week

function WeekView({ date, setDate, openDay }: { date: string; setDate: (d: string) => void; openDay: () => void }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const targets = (s.activeVersion?.nutrition ?? s.targets?.targets)!;
  const weekStart = startOfWeek(date, s.profile?.weekStartsOn ?? 'monday');
  const days = dateRange(weekStart, addDays(weekStart, 6));
  const hasPlan = days.some((d) => itemsOnDate(s, d).length > 0);
  return (
    <>
      <div className="row between">
        <IconButton icon="chevronLeft" label="Предыдущая неделя" tone="ghost" onClick={() => setDate(addDays(weekStart, -7))} />
        <div className="t-h3">{formatDateShort(weekStart)} — {formatDateShort(addDays(weekStart, 6))}</div>
        <IconButton icon="chevronRight" label="Следующая неделя" tone="ghost" onClick={() => setDate(addDays(weekStart, 7))} />
      </div>
      {banner}
      <div className="list">
        {days.map((d) => {
          const items = itemsOnDate(s, d);
          const logs = logsOnDate(s, d);
          const plan = plannedOf(items);
          const fact = eatenOf(logs);
          return (
            <ListItem
              key={d}
              icon={d === s.today ? 'target' : 'calendar'}
              lime={d === s.today}
              title={`${WEEKDAY_SHORT[weekdayOf(d)]}, ${formatDateShort(d)}`}
              subtitle={items.length > 0 ? `План ${fmt(plan.kcal, 0)} · Б ${fmt(plan.proteinG, 0)} Ж ${fmt(plan.fatG, 0)} У ${fmt(plan.carbG, 0)}` : 'Рациона нет'}
              trailing={logs.length > 0 ? <span className="t-small">{fmt(fact.kcal, 0)} факт</span> : undefined}
              onClick={() => {
                setDate(d);
                openDay();
              }}
            />
          );
        })}
      </div>
      <Button block icon="history" disabled={busy || addDays(weekStart, 6) < s.today} onClick={() => void run((d) => generateWeekPlan(d, weekStart, variation()))}>
        {hasPlan ? 'Переделать неделю' : 'Составить рацион на неделю'}
      </Button>
      <p className="t-small">Норма: {fmt(targets.kcal, 0)} ккал · Б {fmt(targets.proteinG, 0)} Ж {fmt(targets.fatG, 0)} У {fmt(targets.carbG, 0)}. Закреплённые продукты и прошедшие дни не меняются.</p>
    </>
  );
}

// ------------------------------------------------------------------ month

function MonthView() {
  const { snapshot: s } = useData();
  const targets = (s.activeVersion?.nutrition ?? s.targets?.targets)!;
  const from = addDays(s.today, -29);
  const days = s.foodDays.filter((d) => d.date >= from && d.date <= s.today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (days.length === 0) {
    return <Card flat><EmptyState icon="flame" title="Пока нет записей за месяц" text="Отмечай съеденное в дневнике или загрузи историю из Excel." /></Card>;
  }
  const avg = (k: 'kcal' | 'proteinG' | 'fatG' | 'carbG') => days.reduce((a, d) => a + d[k], 0) / days.length;
  const inRange = days.filter((d) => Math.abs(d.kcal - targets.kcal) / targets.kcal <= 0.1).length;
  const series: ChartSeries[] = [
    { id: 'kcal', label: 'Съедено', color: '#065f46', area: true, dots: true, points: days.map((d) => ({ date: d.date, value: Math.round(d.kcal) })) },
    { id: 'target', label: 'Норма', color: '#a3e635', faint: true, points: [from, s.today].map((d) => ({ date: d, value: targets.kcal })) },
  ];
  return (
    <>
      <Card>
        <div className="t-caption">Калории за 30 дней</div>
        <LineChart series={series} formatY={(v) => fmt(v, 0)} formatX={formatDateShort} ariaLabel="Калории по дням" />
      </Card>
      <div className="grid-2">
        <Card><div className="t-caption">Среднее в день</div><div className="t-h2">{fmt(avg('kcal'), 0)} ккал</div></Card>
        <Card><div className="t-caption">В пределах ±10% нормы</div><div className="t-h2">{inRange} из {days.length}</div></Card>
        <Card><div className="t-caption">Белок, среднее</div><div className="t-h2">{fmt(avg('proteinG'), 0)} г</div></Card>
        <Card><div className="t-caption">Дней с записями</div><div className="t-h2">{days.length}</div></Card>
      </div>
      <p className="t-small"><Icon name="info" size={14} /> Дни, в которых записано только часть еды, занижают среднее.</p>
    </>
  );
}

type NormMode = 'macros' | 'kcal';

/**
 * The day's norm: why it is what it is for the chosen goal, and a "Вручную" switch to type your own (for example what a coach dictated).
 * Coaches name the norm in one of two ways, so there are two input modes: grams of protein / fat / carbs (calories are worked out),
 * or calories plus protein and fat (carbs fill the rest).
 */
function NormSheet({ open, onClose, current, manual }: { open: boolean; onClose: () => void; current: { kcal: number; proteinG: number; fatG: number; carbG: number }; manual: boolean }) {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const init = () => ({ kcal: String(Math.round(current.kcal)), p: String(Math.round(current.proteinG)), f: String(Math.round(current.fatG)), c: String(Math.round(current.carbG)) });
  const [on, setOn] = useState(manual);
  const [mode, setMode] = useState<NormMode>('macros');
  const [v, setV] = useState(init);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setV(init()); setErr(null); setMode('macros'); setOn(manual); } }, [open]);
  const goal = s.primaryGoal?.type ?? null;
  const why = goal ? goalNutritionText(goal) : null;
  const p = parseDecimal(v.p);
  const f = parseDecimal(v.f);
  const kcalIn = parseDecimal(v.kcal);
  const cIn = parseDecimal(v.c);
  const okNum = (x: number) => Number.isFinite(x) && x >= 0;
  // what is saved, depending on the mode
  const kcal = mode === 'macros' ? (okNum(p) && okNum(f) && okNum(cIn) ? Math.round(p * 4 + f * 9 + cIn * 4) : NaN) : kcalIn;
  const carbs = mode === 'kcal' ? (okNum(kcalIn) && okNum(p) && okNum(f) ? Math.round((kcalIn - p * 4 - f * 9) / 4) : NaN) : cIn;
  const share = (g: number, k: number) => (Number.isFinite(g) && Number.isFinite(kcal) && kcal > 0 ? Math.round((g * k * 100) / kcal) : null);
  const sh = { p: share(p, 4), f: share(f, 9), c: share(carbs, 4) };
  const rebuild = (d: Parameters<Parameters<typeof ok>[0]>[0]) => applyDietMode(d, Math.floor(Date.now() / 1000) % 1_000_000);
  const save = async () => {
    if (!on) {
      // back to the automatic norm (or just a fresh calculation by the latest weight)
      const done = await ok(async (d) => { await recalculateTargets(d); await rebuild(d); });
      if (done) { setManualTargets(false); onClose(); }
      return;
    }
    if (![p, f].every(okNum) || !okNum(carbs) || !Number.isFinite(kcal)) return setErr(mode === 'kcal' && Number.isFinite(carbs) && carbs < 0 ? 'Белок и жиры уже превышают калории: углеводов не остаётся. Проверь числа' : 'Заполни все поля числами');
    if (kcal < 800 || kcal > 8000) return setErr('Калории должны быть от 800 до 8000');
    setErr(null);
    const done = await ok(async (d) => {
      await setManualNutrition(d, { kcal, proteinG: p, fatG: f, carbG: carbs });
      await rebuild(d);
    });
    if (done) { setManualTargets(true); onClose(); }
  };
  return (
    <Sheet open={open} title="Норма на день" onClose={onClose}>
      <div className="stack-lg">
        <Card flat>
          <div className="stack">
            <div className="t-h3">{fmt(current.kcal, 0)} ккал · Б {fmt(current.proteinG, 0)} · Ж {fmt(current.fatG, 0)} · У {fmt(current.carbG, 0)}</div>
            <div className="t-caption">{manual ? 'Сейчас задана вручную' : 'Рассчитана автоматически'}</div>
          </div>
        </Card>
        <div className="stack">
          <div className="t-h3">Почему такая норма{goal ? ` (цель: ${GOAL_LABELS[goal].title.toLowerCase()})` : ''}</div>
          {why ? (
            <>
              <p className="t-small"><b>Калории.</b> Расход за день по формуле Миффлина — Сан-Жеора, умноженный на активность. {why.calories}</p>
              <p className="t-small"><b>Белок.</b> {why.protein}</p>
            </>
          ) : <p className="t-small">Задай цель в профиле, и здесь появится объяснение.</p>}
          <p className="t-small"><b>Жиры и углеводы.</b> Жиры: не меньше 0,8 г на кг и не меньше 25% калорий, они нужны для гормонов. Углеводы занимают всё остальное: это топливо для тренировок.</p>
        </div>
        <Switch checked={on} onChange={setOn} label="Вручную" hint="Ввести свои ккал и БЖУ, например от тренера. Рацион подстроится." />
        {on && (
          <>
            <div className="field">
              <span className="lbl">Как тебе назвали норму (Б, Ж, У: белки, жиры, углеводы)</span>
              <Segmented<NormMode> label="Способ ввода" options={[{ value: 'macros', label: 'Б, Ж, У' }, { value: 'kcal', label: 'Ккал, Б, Ж' }]} value={mode} onChange={setMode} />
            </div>
            {mode === 'kcal' && <TextField label="Калории" unit="ккал" inputMode="numeric" value={v.kcal} onChange={(e) => setV({ ...v, kcal: e.target.value })} />}
            <div className="grid-3">
              <TextField label="Белки" unit="г" inputMode="decimal" value={v.p} onChange={(e) => setV({ ...v, p: e.target.value })} />
              <TextField label="Жиры" unit="г" inputMode="decimal" value={v.f} onChange={(e) => setV({ ...v, f: e.target.value })} />
              {mode === 'macros' ? <TextField label="Углеводы" unit="г" inputMode="decimal" value={v.c} onChange={(e) => setV({ ...v, c: e.target.value })} /> : <TextField label="Углеводы (по остатку)" unit="г" value={Number.isFinite(carbs) && carbs >= 0 ? String(carbs) : '—'} readOnly />}
            </div>
            <Card flat>
              <div className="t-h3">{Number.isFinite(kcal) ? `${fmt(kcal, 0)} ккал в день` : 'Заполни поля'}</div>
              {sh.p !== null && sh.f !== null && sh.c !== null && <p className="t-small">Доля калорий: белки {sh.p}%, жиры {sh.f}%, углеводы {sh.c}%.</p>}
            </Card>
          </>
        )}
        {!on && manual && <p className="t-small">После сохранения вернётся автоматический расчёт по цели и текущему весу.</p>}
        {err && <div className="errbox" role="alert">{err}</div>}
        {banner}
        <Button block disabled={busy} onClick={() => void save()}>{on ? 'Сохранить и пересобрать рацион' : manual ? 'Вернуть автоматический расчёт' : 'Пересчитать по текущему весу'}</Button>
      </div>
    </Sheet>
  );
}
