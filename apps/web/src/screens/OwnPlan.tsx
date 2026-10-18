import { useMemo, useState } from 'react';
import { addDays, ownScheduleDays, startOfWeek, trainingDays, weekdayOf, WEEKDAYS, type CustomWorkout, type OwnScheduleDay, type Weekday } from '@fitapp/domain';
import { deleteOwnSchedule, saveOwnSchedule, setOwnScheduleDay, startCustomWorkout } from '../actions';
import { useData } from '../app/DataContext';
import { formatDateShort, plural, WEEKDAY_SHORT } from '../app/format';
import { go } from '../app/router';
import { setOwnMode } from '../app/prefs';
import { useCommand } from '../app/useCommand';
import { Badge, Button, Card, Chip, EmptyState, Icon, Sheet, SwipeToDelete } from '../ui';
import { BuildCartSheet } from './OwnMode';
import { DateField, ScreenHeader } from './shared';

const exWord = (n: number) => `${n} ${plural(n, ['упражнение', 'упражнения', 'упражнений'])}`;
const WEEK_OPTIONS = [4, 6, 8, 12, 16, 24] as const;
const weekLabel = (w: number) => (w === 4 ? '4 нед · месяц' : `${w} нед`);

type DayState = 'done' | 'running' | 'today' | 'missed' | 'ahead' | 'rest';

/** Done / running own workouts by date, to mark the planned days. */
function useDayStatus() {
  const { snapshot: s } = useData();
  return useMemo(() => {
    const done = new Map<string, Set<string>>();
    const running = new Map<string, string>(); // date+workout -> session id
    for (const w of s.workouts) {
      if (!w.customWorkoutId) continue;
      if (w.completed) {
        const set = done.get(w.date) ?? new Set<string>();
        set.add(w.customWorkoutId);
        done.set(w.date, set);
      } else if (w.inProgress) running.set(`${w.date}|${w.customWorkoutId}`, w.id);
    }
    const stateOf = (d: OwnScheduleDay): DayState => {
      if (d.customWorkoutId === null) return 'rest';
      if (done.get(d.date)?.has(d.customWorkoutId)) return 'done';
      if (running.has(`${d.date}|${d.customWorkoutId}`)) return 'running';
      if (d.date === s.today) return 'today';
      return d.date < s.today ? 'missed' : 'ahead';
    };
    const doneId = (d: OwnScheduleDay): string | null => (d.customWorkoutId ? s.workouts.find((w) => w.completed && w.date === d.date && w.customWorkoutId === d.customWorkoutId)?.id ?? null : null);
    return { stateOf, doneId, runningId: (d: OwnScheduleDay) => (d.customWorkoutId ? running.get(`${d.date}|${d.customWorkoutId}`) ?? null : null) };
  }, [s.workouts, s.today]);
}

const STATE_BADGE: Record<DayState, { text: string; tone: 'default' | 'neutral' | 'warning' | 'danger' } | null> = {
  done: { text: 'Сделано', tone: 'default' },
  running: { text: 'Идёт', tone: 'warning' },
  today: { text: 'Сегодня', tone: 'warning' },
  missed: { text: 'Пропущено', tone: 'neutral' },
  ahead: null,
  rest: null,
};

/**
 * «Тренировки → Своя»: the own program planned weeks ahead from the workouts of the builder.
 * The plan only arranges own workouts on days; the main program stays as it is.
 */
export function OwnPlanSection() {
  const { snapshot: s } = useData();
  const [editing, setEditing] = useState(false);
  if (s.customWorkouts.length === 0) {
    return (
      <Card flat>
        <EmptyState
          icon="training"
          title="Сначала собери свои тренировки"
          text="В «Профиль → Конструктор тренировок» вбей свои тренировки: упражнения, подходы, повторения. Потом здесь распишешь их по дням на месяц и дальше."
          action={<Button icon="plus" onClick={() => go('profile/builder')}>Открыть конструктор</Button>}
        />
      </Card>
    );
  }
  if (!s.ownSchedule || editing) return <OwnPlanForm onDone={() => setEditing(false)} canCancel={!!s.ownSchedule} />;
  return <OwnPlanView onEdit={() => setEditing(true)} />;
}

function OwnPlanForm({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const cur = s.ownSchedule;
  const alive = new Set(s.customWorkouts.map((w) => w.id));
  const [startOn, setStartOn] = useState(cur?.startOn ?? s.today);
  const [weeks, setWeeks] = useState<number>(cur?.weeks ?? 4);
  const [days, setDays] = useState<Weekday[]>(cur?.weekdays ?? (s.profile ? trainingDays(s.profile.trainingSchedule) : ['monday', 'wednesday', 'friday']));
  const [rotation, setRotation] = useState<string[]>((cur?.rotation ?? []).filter((id) => alive.has(id)));
  const nameOf = (id: string) => s.customWorkouts.find((w) => w.id === id)?.name ?? '—';
  const toggleDay = (d: Weekday) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : WEEKDAYS.filter((y) => y === d || x.includes(y))));
  const toggleW = (id: string) => setRotation((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const ready = !!startOn && days.length > 0 && rotation.length > 0;
  const preview = ready ? ownScheduleDays({ startOn, weeks, weekdays: days, rotation, overrides: [] }) : [];
  const save = async () => {
    if (await run((d) => saveOwnSchedule(d, { startOn, weeks, weekdays: days, rotation }).then(() => true))) onDone();
  };
  return (
    <Card>
      <div className="stack">
        <div className="t-h3">{cur ? 'Изменить свою программу' : 'Запланировать свою программу'}</div>
        <p className="t-small">Свои тренировки пойдут по очереди в выбранные дни. Любой день потом можно поменять или сделать отдыхом.</p>
        <DateField label="Начало" value={startOn} onChange={setStartOn} />
        <div className="field">
          <span className="lbl">На сколько вперёд</span>
          <div className="chips" role="group" aria-label="Длительность">
            {WEEK_OPTIONS.map((w) => <Chip key={w} pressed={weeks === w} onClick={() => setWeeks(w)}>{weekLabel(w)}</Chip>)}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Дни тренировок</span>
          <div className="chips plan-days" role="group" aria-label="Дни недели">
            {WEEKDAYS.map((d) => <Chip key={d} pressed={days.includes(d)} onClick={() => toggleDay(d)}>{WEEKDAY_SHORT[d]}</Chip>)}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Тренировки по очереди</span>
          <span className="hint">Нажимай в том порядке, в каком они должны идти.</span>
          <div className="list">
            {s.customWorkouts.map((w) => {
              const pos = rotation.indexOf(w.id);
              return (
                <button key={w.id} type="button" className={`plan-pick ${pos >= 0 ? 'on' : ''}`} aria-pressed={pos >= 0} onClick={() => toggleW(w.id)}>
                  <span className="wk-num">{pos >= 0 ? pos + 1 : ''}</span>
                  <span className="grow"><span className="li-title">{w.name}</span><span className="li-sub">{exWord(w.exercises.length)}</span></span>
                </button>
              );
            })}
          </div>
        </div>
        {preview.length > 0 && (
          <p className="t-small">
            {preview.length} {plural(preview.length, ['тренировка', 'тренировки', 'тренировок'])} до {formatDateShort(addDays(startOn, weeks * 7 - 1))}. Первые: {preview.slice(0, 3).map((d) => `${WEEKDAY_SHORT[weekdayOf(d.date)]} ${formatDateShort(d.date)} — ${nameOf(d.customWorkoutId as string)}`).join('; ')}.
          </p>
        )}
        {banner}
        <Button block icon="check" disabled={busy || !ready} onClick={() => void save()}>{ready ? 'Сохранить план' : rotation.length === 0 ? 'Выбери тренировки' : 'Выбери дни'}</Button>
        {canCancel && <Button block variant="text" onClick={onDone}>Отмена</Button>}
      </div>
    </Card>
  );
}

function OwnPlanView({ onEdit }: { onEdit: () => void }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const plan = s.ownSchedule!;
  const { stateOf, runningId } = useDayStatus();
  const [day, setDay] = useState<OwnScheduleDay | null>(null);
  const [all, setAll] = useState(false);
  const [past, setPast] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const byId = useMemo(() => new Map(s.customWorkouts.map((w) => [w.id, w])), [s.customWorkouts]);
  const days = useMemo(() => ownScheduleDays(plan), [plan]);
  const end = addDays(plan.startOn, plan.weeks * 7 - 1);
  const workDays = days.filter((d) => d.customWorkoutId !== null);
  const doneCount = workDays.filter((d) => stateOf(d) === 'done').length;
  const today = days.find((d) => d.date === s.today);
  const upcoming = days.filter((d) => d.date > s.today);
  const before = days.filter((d) => d.date < s.today);
  // weeks of the plan, counted from its start
  const weekNo = (date: string) => Math.floor((Date.parse(date) - Date.parse(plan.startOn)) / 86400000 / 7) + 1;
  const shownUpcoming = all ? upcoming : upcoming.filter((d) => d.date <= addDays(s.today, 14));
  const start = async (d: OwnScheduleDay) => {
    if (!d.customWorkoutId) return;
    const open = runningId(d);
    if (open) return go(`workout/${open}`);
    const sid = await run((x) => startCustomWorkout(x, d.customWorkoutId));
    if (sid) go(`workout/${sid}`);
  };
  const renderRows = (list: OwnScheduleDay[]) => {
    const groups: Array<{ week: number; items: OwnScheduleDay[] }> = [];
    for (const d of list) {
      const w = weekNo(d.date);
      const g = groups[groups.length - 1];
      if (g && g.week === w) g.items.push(d);
      else groups.push({ week: w, items: [d] });
    }
    return groups.map((g) => (
      <div key={g.week} className="stack tight">
        <div className="t-caption">Неделя {g.week} из {plan.weeks}</div>
        <div className="list">
          {g.items.map((d) => {
            const st = stateOf(d);
            const w = d.customWorkoutId ? byId.get(d.customWorkoutId) : undefined;
            const b = STATE_BADGE[st];
            return (
              <button key={d.date} type="button" className={`plan-day ${st}`} onClick={() => setDay(d)}>
                <span className="plan-date"><b>{WEEKDAY_SHORT[weekdayOf(d.date)]}</b><span>{formatDateShort(d.date)}</span></span>
                <span className="grow">
                  <span className="li-title">{d.customWorkoutId === null ? 'Отдых' : w?.name ?? 'Тренировка удалена'}</span>
                  {w && <span className="li-sub">{exWord(w.exercises.length)}{d.changed ? ' · изменено' : ''}</span>}
                </span>
                {b && <Badge tone={b.tone}>{b.text}</Badge>}
                <Icon name="chevronRight" size={18} />
              </button>
            );
          })}
        </div>
      </div>
    ));
  };
  const todayW = today?.customWorkoutId ? byId.get(today.customWorkoutId) : undefined;
  const todayState = today ? stateOf(today) : null;
  return (
    <>
      <Card>
        <div className="stack">
          <div className="row between">
            <div className="grow">
              <div className="t-small">Своя программа · {formatDateShort(plan.startOn)} — {formatDateShort(end)}</div>
              <div className="t-h3">{plan.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ')} · {plan.weeks} нед</div>
            </div>
            <Badge>{doneCount}/{workDays.length}</Badge>
          </div>
          <div className="pbar" role="progressbar" aria-label="Выполнено тренировок" aria-valuenow={doneCount} aria-valuemax={workDays.length}><i style={{ width: `${workDays.length ? (doneCount / workDays.length) * 100 : 0}%` }} /></div>
          {s.today > end ? (
            <p className="t-body">План закончился. Продли его или составь новый.</p>
          ) : today && todayW ? (
            <div className="plan-today">
              <div className="t-small">Сегодня</div>
              <div className="t-h3">{todayW.name}</div>
              <div className="t-small">{exWord(todayW.exercises.length)}</div>
              {todayState === 'done' ? <Badge>Сделано</Badge> : <Button block icon="play" disabled={busy} onClick={() => void start(today)}>{todayState === 'running' ? 'Продолжить' : 'Начать'}</Button>}
            </div>
          ) : (
            <p className="t-body">Сегодня по плану отдых{upcoming[0]?.customWorkoutId ? `. Дальше: ${formatDateShort(upcoming[0].date)} — ${byId.get(upcoming[0].customWorkoutId)?.name ?? ''}` : ''}.</p>
          )}
          {banner}
          <div className="row">
            <Button block size="sm" variant="secondary" icon="edit" onClick={onEdit}>{s.today > end ? 'Продлить' : 'Изменить'}</Button>
            <Button block size="sm" variant="secondary" icon="training" onClick={() => go('profile/builder')}>Конструктор</Button>
          </div>
        </div>
      </Card>

      {shownUpcoming.length > 0 && <div className="section-title"><h2 className="t-h3">Расписание</h2><span className="t-caption">нажми на день, чтобы поменять</span></div>}
      {renderRows(shownUpcoming)}
      {!all && upcoming.length > shownUpcoming.length && <Button block variant="text" onClick={() => setAll(true)}>Показать весь план · ещё {upcoming.length - shownUpcoming.length} {plural(upcoming.length - shownUpcoming.length, ['день', 'дня', 'дней'])}</Button>}
      {before.length > 0 && <Button block variant="text" onClick={() => setPast((x) => !x)}>{past ? 'Скрыть прошедшие' : `Прошедшие дни · ${before.length}`}</Button>}
      {past && renderRows(before)}

      {confirm ? (
        <div className="row">
          <Button block variant="danger" icon="trash" disabled={busy} onClick={async () => { if (await run((d) => deleteOwnSchedule(d).then(() => true))) setConfirm(false); }}>Да, удалить план</Button>
          <Button block variant="secondary" onClick={() => setConfirm(false)}>Отмена</Button>
        </div>
      ) : (
        <Button block variant="text" icon="trash" onClick={() => setConfirm(true)}>Удалить план</Button>
      )}
      <p className="t-small">Сделанные тренировки останутся в истории, свои тренировки — в конструкторе.</p>

      <DaySheet day={day} onClose={() => setDay(null)} onStart={(d) => { setDay(null); void start(d); }} state={day ? stateOf(day) : null} workouts={s.customWorkouts} />
    </>
  );
}

/** One day of the plan: put another own workout, make it rest, or put it back as planned. */
function DaySheet({ day, state, workouts, onClose, onStart }: { day: OwnScheduleDay | null; state: DayState | null; workouts: CustomWorkout[]; onClose: () => void; onStart: (d: OwnScheduleDay) => void }) {
  const { run, banner, busy } = useCommand();
  if (!day) return null;
  const set = async (id: string | null | undefined) => {
    if (await run((d) => setOwnScheduleDay(d, day.date, id).then(() => true))) onClose();
  };
  const canStart = day.customWorkoutId !== null && (state === 'today' || state === 'running' || state === 'missed');
  return (
    <Sheet open title={`${WEEKDAY_SHORT[weekdayOf(day.date)]}, ${formatDateShort(day.date)}`} onClose={onClose}>
      <div className="stack">
        {banner}
        {canStart && <Button block icon="play" disabled={busy} onClick={() => onStart(day)}>{state === 'running' ? 'Продолжить' : state === 'missed' ? 'Сделать сегодня' : 'Начать'}</Button>}
        {state === 'done' && <p className="t-body">Эта тренировка уже сделана.</p>}
        <div className="t-caption">Поставить на этот день</div>
        <div className="chips" role="group" aria-label="Тренировка дня">
          {workouts.map((w) => <Chip key={w.id} pressed={day.customWorkoutId === w.id} disabled={busy} onClick={() => void set(w.id)}>{w.name}</Chip>)}
          <Chip pressed={day.customWorkoutId === null} disabled={busy} onClick={() => void set(null)}>Отдых</Chip>
        </div>
        {day.changed && <Button block variant="secondary" disabled={busy} onClick={() => void set(undefined)}>Вернуть как в плане</Button>}
        <p className="t-small">Меняется только этот день. Очерёдность остальных не сдвигается.</p>
      </div>
    </Sheet>
  );
}

/** «Профиль → Конструктор тренировок»: own workouts are typed in here, then planned in «Тренировки → Своя». */
export function ConstructorScreen() {
  const { snapshot: s } = useData();
  const [cart, setCart] = useState(false);
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Конструктор тренировок" back="profile" />
      <p className="t-small">Вбей свои тренировки: упражнения, подходы, повторения, отдых. Веса подставятся из истории. Потом во вкладке «Тренировки» в режиме «Своя» их можно расписать по дням на месяц и дальше.</p>
      <Button block icon="plus" onClick={() => go('profile/builder/new')}>Новая тренировка</Button>
      <Button block variant="secondary" icon="basket" onClick={() => setCart(true)}>Быстро: отметить упражнения в каталоге</Button>
      <div className="section-title"><h2 className="t-h3">Мои тренировки</h2>{s.customWorkouts.length > 0 && <span className="t-caption">{s.customWorkouts.length}</span>}</div>
      {s.customWorkouts.length === 0 ? (
        <Card flat><EmptyState icon="training" title="Пока пусто" text="Создай первую тренировку — хватит и одного упражнения." /></Card>
      ) : (
        <div className="list">
          {s.customWorkouts.map((w) => {
            const names = w.exercises.map((e) => s.exercises.find((x) => x.id === e.exerciseId)?.name).filter(Boolean) as string[];
            const sets = w.exercises.reduce((n, e) => n + e.sets, 0);
            return (
              <button key={w.id} type="button" className="list-item cw-item" onClick={() => go(`profile/builder/${w.id}`)}>
                <span className="li-icon"><Icon name="training" /></span>
                <span className="grow">
                  <span className="li-title">{w.name}</span>
                  <span className="li-sub">{exWord(w.exercises.length)} · {sets} {plural(sets, ['подход', 'подхода', 'подходов'])}</span>
                  <span className="li-sub">{names.slice(0, 3).join(', ')}{names.length > 3 ? ` и ещё ${names.length - 3}` : ''}</span>
                </span>
                <Icon name="edit" size={18} />
              </button>
            );
          })}
        </div>
      )}
      {s.customWorkouts.length > 0 && (
        <Card flat>
          <div className="stack">
            <div className="li-title">{s.ownSchedule ? 'Своя программа уже расписана' : 'Расписать по дням'}</div>
            <p className="t-small">{s.ownSchedule ? 'Посмотреть и поменять дни можно во вкладке «Тренировки» → «Своя».' : 'Выбери дни недели и срок — тренировки пойдут по очереди.'}</p>
            <Button block icon="calendar" onClick={() => { setOwnMode(true); go('training'); }}>{s.ownSchedule ? 'Открыть план' : 'Запланировать'}</Button>
          </div>
        </Card>
      )}
      <BuildCartSheet open={cart} onClose={() => setCart(false)} onSaved={() => setCart(false)} />
    </main>
  );
}

/**
 * «Тренировки → Своя → Неделя»: the planned own workouts of this week and the next one.
 * Tap — start at once (or continue / open what was done); swipe left — take it off (the day becomes rest).
 * The plan itself is set up in «Программа».
 */
export function OwnWeek({ onProgram }: { onProgram: () => void }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const { stateOf, runningId, doneId } = useDayStatus();
  const byId = useMemo(() => new Map(s.customWorkouts.map((w) => [w.id, w])), [s.customWorkouts]);
  const plan = s.ownSchedule;
  const days = useMemo(() => (plan ? ownScheduleDays(plan) : []), [plan]);
  if (!plan) {
    return (
      <Card flat>
        <EmptyState
          icon="calendar"
          title="Своих тренировок на неделю пока нет"
          text={s.customWorkouts.length === 0 ? 'Сначала собери тренировки в «Профиль → Конструктор тренировок», потом распиши их во вкладке «Программа».' : 'Распиши свои тренировки по дням во вкладке «Программа» — они появятся здесь.'}
          action={s.customWorkouts.length === 0 ? <Button icon="plus" onClick={() => go('profile/builder')}>Открыть конструктор</Button> : <Button icon="calendar" onClick={onProgram}>Составить план</Button>}
        />
      </Card>
    );
  }
  const mon = startOfWeek(s.today);
  const weeks: Array<{ title: string; items: OwnScheduleDay[] }> = [
    { title: 'Эта неделя', items: days.filter((d) => d.date >= mon && d.date <= addDays(mon, 6) && d.customWorkoutId !== null) },
    { title: 'Следующая неделя', items: days.filter((d) => d.date > addDays(mon, 6) && d.date <= addDays(mon, 13) && d.customWorkoutId !== null) },
  ];
  const open = async (d: OwnScheduleDay) => {
    const st = stateOf(d);
    if (st === 'done') { const id = doneId(d); if (id) go(`workout/${id}`); return; }
    const r = runningId(d);
    if (r) return go(`workout/${r}`);
    const sid = await run((x) => startCustomWorkout(x, d.customWorkoutId));
    if (sid) go(`workout/${sid}`);
  };
  return (
    <>
      {banner}
      {weeks.map((w) => (
        <div key={w.title} className="stack tight">
          <div className="section-title"><h2 className="t-h3">{w.title}</h2></div>
          {w.items.length === 0 ? (
            <p className="note">{w.title === 'Эта неделя' ? 'На этой неделе тренировок по плану нет.' : 'На следующей неделе тренировок по плану нет.'}</p>
          ) : (
            <div className="list">
              {w.items.map((d) => {
                const st = stateOf(d);
                const cw = byId.get(d.customWorkoutId as string);
                const b = STATE_BADGE[st];
                const action = st === 'done' ? 'Открыть' : st === 'running' ? 'Продолжить' : 'Начать';
                return (
                  <SwipeToDelete key={d.date} label={`Убрать: ${cw?.name ?? 'тренировка'}, ${formatDateShort(d.date)}`} disabled={busy || st === 'done' || st === 'running'} onDelete={() => void run((x) => setOwnScheduleDay(x, d.date, null))}>
                    <button type="button" className={`plan-day ${st}`} disabled={busy || !cw} onClick={() => void open(d)} aria-label={`${action}: ${cw?.name ?? ''}, ${formatDateShort(d.date)}`}>
                      <span className="plan-date"><b>{WEEKDAY_SHORT[weekdayOf(d.date)]}</b><span>{formatDateShort(d.date)}</span></span>
                      <span className="grow">
                        <span className="li-title">{cw?.name ?? 'Тренировка удалена'}</span>
                        {cw && <span className="li-sub">{exWord(cw.exercises.length)}</span>}
                      </span>
                      {b && <Badge tone={b.tone}>{b.text}</Badge>}
                      <span className="plan-go" aria-hidden="true"><Icon name={st === 'done' ? 'chevronRight' : 'play'} size={16} /></span>
                    </button>
                  </SwipeToDelete>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <p className="t-small">Нажми на тренировку — она сразу начнётся. Свайп влево — убрать её из плана (день станет отдыхом). Вернуть или поменять день — во вкладке «Программа».</p>
    </>
  );
}

/** Own plan days by date for the month calendar: the workout name and the day. */
export function useOwnPlanByDate(): Map<string, OwnScheduleDay & { name: string }> {
  const { snapshot: s } = useData();
  return useMemo(() => {
    const m = new Map<string, OwnScheduleDay & { name: string }>();
    if (!s.ownSchedule) return m;
    for (const d of ownScheduleDays(s.ownSchedule)) {
      if (d.customWorkoutId === null) continue;
      m.set(d.date, { ...d, name: s.customWorkouts.find((w) => w.id === d.customWorkoutId)?.name ?? 'Своя тренировка' });
    }
    return m;
  }, [s.ownSchedule, s.customWorkouts]);
}
