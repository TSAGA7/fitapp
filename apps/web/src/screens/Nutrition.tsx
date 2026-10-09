import { useMemo, useState } from 'react';
import { addDays, dateRange, diffDays, macrosForAmount, SLOT_LABEL, startOfWeek, suggestTargetAdjustment, sumMacros, weekdayOf, type FoodCategory, type MealSlot, type PlannedItem } from '@fitapp/domain';
import {
  acceptTargetAdjustment,
  addPlannedItem,
  clearMealLogs,
  createCustomFood,
  createProgram,
  generateWeekPlan,
  logMealAsPlanned,
  logPlanned,
  logUnplanned,
  recalculateTargets,
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
import { fmt, formatDateShort, formatDay, WEEKDAY_SHORT } from '../app/format';
import { useCommand } from '../app/useCommand';
import type { FoodLog } from '@fitapp/domain';
import { Badge, Button, Card, EmptyState, Icon, IconButton, LineChart, ListItem, ProgressBar, ProgressRing, Segmented, SelectField, Sheet, TextField, type ChartSeries } from '../ui';
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
  const planned = plannedOf(items);
  const [slotForAdd, setSlotForAdd] = useState<MealSlot | null>(null);
  const [itemSheet, setItemSheet] = useState<PlannedItem | null>(null);
  const [logSheet, setLogSheet] = useState<FoodLog | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const adjustment = useMemo(
    () =>
      s.primaryGoal && s.profile && s.activeVersion
        ? suggestTargetAdjustment({ goal: s.primaryGoal.type, sex: s.profile.sex, targets, weight: s.weight, daysOnTargets: diffDays(s.activeVersion.effectiveFrom, s.today) })
        : null,
    [s, targets],
  );

  const remaining = targets.kcal - eaten.kcal;
  const logOf = (itemId: string) => logs.find((l) => l.plannedItemId === itemId);
  const isPast = date < s.today;

  return (
    <>
      <DayNav date={date} setDate={setDate} today={s.today} />
      {banner}
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

      <Card>
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
          <span className="t-small">Съедено {fmt(eaten.kcal, 0)} из нормы {fmt(targets.kcal, 0)} ккал</span>
          {items.length > 0 && <span className="t-small">Рацион {fmt(planned.kcal, 0)} ккал</span>}
        </div>
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
              <ListItem key={l.id} icon="plus" lime title={l.snapshot.foodName} subtitle={`${l.plannedItemId === null ? 'Не по плану' : 'Из прежнего плана'} · ${fmt(l.actualAmountG, 0)} г · Б ${fmt(l.macros.proteinG, 0)} Ж ${fmt(l.macros.fatG, 0)} У ${fmt(l.macros.carbG, 0)}`} trailing={<span className="t-small">{fmt(l.macros.kcal, 0)}</span>} onClick={() => setLogSheet(l)} />
            ))}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => setSlotForAdd(slot)}>Добавить еду</Button>
              {slotItems.length > 0 && !allDone && <Button size="sm" variant="secondary" icon="check" disabled={busy} onClick={() => void run((d) => logMealAsPlanned(d, date, slot))}>Съел всё</Button>}
              {slotLogs.length > 0 && <Button size="sm" variant="text" disabled={busy} onClick={() => void run((d) => clearMealLogs(d, date, slot))}>Сбросить отметки</Button>}
              {!isPast && <Button size="sm" variant="text" disabled={busy} onClick={() => void run((d) => regenerateMeal(d, date, slot, variation()))}>Переделать</Button>}
            </div>
            {slotLogs.length > 0 && <p className="t-small">«Переделать» не трогает то, что ты уже съел. Нажми на строку, чтобы изменить граммы или убрать отметку.</p>}
          </section>
        );
      })}

      {!isPast && items.length > 0 && (
        <Button variant="secondary" block icon="history" disabled={busy} onClick={() => void run((d) => regenerateDay(d, date, variation()))}>Переделать день</Button>
      )}
      <Button variant="text" onClick={() => void run((d) => recalculateTargets(d))} disabled={busy}>Пересчитать норму по текущему весу</Button>

      <AddFoodSheet open={slotForAdd !== null} slot={slotForAdd ?? 'snack'} date={date} onClose={() => setSlotForAdd(null)} />
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

function LogSheet({ log, onClose }: { log: FoodLog | null; onClose: () => void }) {
  const { ok, banner, busy } = useCommand();
  const [grams, setGrams] = useState('');
  if (!log) return null;
  const g = parseDecimal(grams);
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
  meat: 'Мясо', poultry: 'Птица', fish: 'Рыба', eggs: 'Яйца', dairy: 'Молочное', grains: 'Крупы и макароны', legumes: 'Бобовые', vegetables: 'Овощи', fruits: 'Фрукты', nuts_seeds: 'Орехи и семена', fats_oils: 'Масла и жиры', bread_bakery: 'Хлеб', sweets: 'Сладкое', drinks: 'Напитки', supplements: 'Добавки', ready_meals: 'Готовые блюда', other: 'Другое',
};

function AddFoodSheet({ open, slot, date, onClose }: { open: boolean; slot: MealSlot; date: string; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [grams, setGrams] = useState('100');
  const [mode, setMode] = useState<'eaten' | 'plan'>('eaten');
  const [creating, setCreating] = useState(false);

  const foods = useMemo(() => {
    const q = query.trim().toLowerCase();
    return s.foods
      .filter((f) => f.deletedAt === null && !userFoodOf(s.userFoods, f.id)?.excluded && (q === '' || f.name.toLowerCase().includes(q)))
      .sort((a, b) => (a.origin === b.origin ? a.name.localeCompare(b.name, 'ru') : a.origin === 'custom' ? -1 : 1))
      .slice(0, 40);
  }, [s.foods, s.userFoods, query]);
  const food = s.foods.find((f) => f.id === picked);
  const g = parseDecimal(grams);
  const preview = food && g > 0 ? macrosForAmount(food.per100, g) : null;
  const close = () => {
    setPicked(null);
    setQuery('');
    setCreating(false);
    onClose();
  };

  return (
    <Sheet open={open} title={`${SLOT_LABEL[slot]}: добавить еду`} onClose={close}>
      <div className="stack">
        {banner}
        {creating ? (
          <CustomFoodForm
            onCancel={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              setPicked(id);
            }}
          />
        ) : !food ? (
          <>
            <TextField label="Поиск продукта" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например, гречка" autoFocus />
            <div className="list">
              {foods.map((f) => (
                <ListItem key={f.id} title={f.name} subtitle={`${CATEGORY_LABELS[f.category]} · ${fmt(f.per100.kcal, 0)} ккал/100 г`} onClick={() => { setPicked(f.id); setGrams(f.gramsPerPiece ? String(f.gramsPerPiece) : '100'); }} />
              ))}
              {foods.length === 0 && <p className="note">Ничего не найдено.</p>}
            </div>
            <Button variant="secondary" icon="plus" onClick={() => setCreating(true)}>Добавить свой продукт</Button>
          </>
        ) : (
          <>
            <div className="t-h3">{food.name}</div>
            <p className="t-small">{food.basis === 'raw' ? 'Вес сырого продукта' : food.basis === 'cooked' ? 'Вес готового продукта' : 'Вес как на упаковке'}</p>
            <TextField label="Количество" unit="г" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
            {preview && <p className="t-body">{fmt(preview.kcal, 0)} ккал · Б {fmt(preview.proteinG, 0)} Ж {fmt(preview.fatG, 0)} У {fmt(preview.carbG, 0)}</p>}
            <Segmented<'eaten' | 'plan'> value={mode} onChange={setMode} options={[{ value: 'eaten', label: 'Я съел' }, { value: 'plan', label: 'В план' }]} label="Куда записать" />
            <div className="row">
              <Button variant="text" onClick={() => setPicked(null)}>Назад</Button>
              <Button
                disabled={busy || !(g > 0)}
                onClick={async () => {
                  const done = await ok((d) => (mode === 'eaten' ? logUnplanned(d, { date, slot, foodId: food.id, grams: g }) : addPlannedItem(d, { date, slot, foodId: food.id, grams: g })));
                  if (done) close();
                }}
              >
                Добавить
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function CustomFoodForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const { run, banner, busy } = useCommand();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FoodCategory>('other');
  const [basis, setBasis] = useState<'as_sold' | 'raw' | 'cooked'>('as_sold');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [f, setF] = useState('');
  const [c, setC] = useState('');
  const [fiber, setFiber] = useState('');
  const [label, setLabel] = useState(true);
  const num = (v: string): number => (v.trim() === '' ? 0 : parseDecimal(v));
  const valid = name.trim().length > 0 && [kcal, p, f, c].every((v) => Number.isFinite(num(v)) && num(v) >= 0) && num(p) + num(f) + num(c) <= 100;
  return (
    <div className="stack">
      {banner}
      <TextField label="Название" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
            const id = await run((d) => createCustomFood(d, { name, brand: null, category, basis, per100: { kcal: num(kcal), proteinG: num(p), fatG: num(f), carbG: num(c), fiberG: num(fiber) }, fromLabel: label }));
            if (id) onCreated(id);
          }}
        >
          Сохранить
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
