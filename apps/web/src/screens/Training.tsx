import { useEffect, useMemo, useState } from 'react';
import { addDays, assessExercise, WEEKDAYS, inAdaptation, rankSubstitutes, suggestMoveDate, weekdayOf, type Exercise, type PlannedSession, type WorkoutTemplate } from '@fitapp/domain';
import { createProgram, ensureSessions, movePlannedSession, rebuildTrainingPlan, replaceExerciseInPlan, skipPlannedSession, startWorkout } from '../actions';
import { useData } from '../app/DataContext';
import { exerciseName, safetyContext } from '../app/derive';
import { formatDay, formatDateShort, plural, WEEKDAY_SHORT } from '../app/format';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Badge, Button, Card, Chip, EmptyState, Icon, ListItem, Segmented, Sheet } from '../ui';
import { useBodyweightMode, useVacationMode } from '../app/prefs';
import { BodyweightCard, BodyweightToggle } from './BodyweightMode';
import { CardioSheet } from './Cardio';
import { ScreenHeader } from './shared';

type View = 'week' | 'month' | 'program' | 'history';

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function Training() {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const [view, setView] = useState<View>('week');
  const bodyweight = useBodyweightMode();
  const [cardioOpen, setCardioOpen] = useState(false);
  const vacation = useVacationMode();

  // The calendar is derived from the active version: keep the next two weeks created.
  useEffect(() => {
    if (s.activeVersion) void run((d) => ensureSessions(d));
  }, [s.activeVersion?.id, s.profile?.updatedAt, s.today]);

  if (vacation) {
    return (
      <main className="screen vac-screen">
        <ScreenHeader title="Тренировки" />
        <div className="vac-center">
          <Card flat>
            <div className="vac-note"><span className="vac-emoji" aria-hidden="true">🍻</span><p className="t-h3">Разве эта вкладка похожа на барное меню? Иди отдыхай!</p></div>
          </Card>
        </div>
      </main>
    );
  }
  if (!s.activeVersion) {
    return (
      <main className="screen">
        <ScreenHeader title="Тренировки" />
        {banner}
        <Card flat>
          <EmptyState
            icon="training"
            title="Составим программу тренировок"
            text="С учётом твоих дней, оборудования, спины и плеча: без тяжёлой осевой нагрузки и с понятными заменами."
            action={<Button icon="check" disabled={busy} onClick={() => void run((d) => createProgram(d))}>Создать программу</Button>}
          />
        </Card>
        <History />
      </main>
    );
  }
  return (
    <main className="screen">
      <ScreenHeader title="Тренировки" />
      <div className="chips" role="group" aria-label="Режим тренировки"><BodyweightToggle /><Chip pressed={false} onClick={() => setCardioOpen(true)}>Кардио</Chip></div>
      <CardioSheet open={cardioOpen} onClose={() => setCardioOpen(false)} />
      <Segmented<View> label="Раздел" value={view} onChange={setView} options={[{ value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }, { value: 'program', label: 'Программа' }, { value: 'history', label: 'История' }]} />
      {banner}
      {view === 'week' && (bodyweight ? <BodyweightCard /> : <Week />)}
      {view === 'month' && <MonthView />}
      {view === 'program' && <ProgramView />}
      {view === 'history' && <History />}
    </main>
  );
}

// ------------------------------------------------------------------ week

function Week() {
  const { snapshot: s } = useData();
  const { run, ok, banner, busy } = useCommand();
  const version = s.activeVersion!;
  const [moving, setMoving] = useState<PlannedSession | null>(null);
  const [preview, setPreview] = useState<PlannedSession | null>(null);
  const sessions = useMemo(
    () => s.plannedSessions.filter((p) => p.deletedAt === null && p.plannedDate >= addDays(s.today, -7) && p.status !== 'moved').sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1)),
    [s.plannedSessions, s.today],
  );
  const labelOf = (key: string) => version.training.workouts.find((w) => w.key === key)?.label ?? 'Тренировка';
  const adaptation = inAdaptation(version.training, s.today);
  const open = s.openSession;

  const begin = async (id: string, deload = false) => {
    const sessionId = await run((d) => startWorkout(d, id, { deload }));
    if (sessionId) go(`workout/${sessionId}`);
  };

  return (
    <>
      {banner}
      {adaptation && (
        <Card flat>
          <div className="row"><Badge tone="warning">Адаптация</Badge><span className="t-small">Первые {version.training.adaptationWeeks} нед.: запас 2–3 повторения, без отказа.</span></div>
        </Card>
      )}
      {open && (
        <Card>
          <div className="stack">
            <div className="t-h3">Тренировка не закончена</div>
            <Button icon="play" onClick={() => go(`workout/${open.id}`)}>Продолжить</Button>
          </div>
        </Card>
      )}
      {sessions.length === 0 && <p className="note">Ближайших тренировок нет. Проверь дни тренировок в профиле.</p>}
      <div className="stack">
        {sessions.map((p) => {
          const missed = p.status === 'planned' && p.plannedDate < s.today;
          const isToday = p.plannedDate === s.today;
          const started = s.openSession?.plannedSessionId === p.id;
          return (
            <Card key={p.id} flat={p.status !== 'planned' || missed}>
              <div className="stack">
                <button type="button" className="session-head" aria-label={`${labelOf(p.workoutKey)}: что в тренировке`} onClick={() => setPreview(p)}>
                  <span className="sh-text">
                    <span className="t-h3">{labelOf(p.workoutKey)}</span>
                    <span className="t-small">{isToday ? 'Сегодня' : `${WEEKDAY_SHORT[weekdayOf(p.plannedDate)]}, ${formatDateShort(p.plannedDate)}`}{p.originalDate ? ` · перенесено с ${formatDateShort(p.originalDate)}` : ''}</span>
                  </span>
                  {p.status === 'done' && <Badge>Выполнено</Badge>}
                  {p.status === 'skipped' && <Badge tone="neutral">Пропущено</Badge>}
                  {missed && <Badge tone="warning">Пропущено?</Badge>}
                  <Icon name="chevronRight" size={20} />
                </button>
                {p.status === 'planned' && (
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    {(isToday || missed || started) && <Button size="sm" icon="play" disabled={busy} onClick={() => void begin(p.id)}>{started ? 'Продолжить' : 'Начать'}</Button>}
                    {!isToday && !missed && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void begin(p.id)}>Начать сегодня</Button>}
                    <Button size="sm" variant="secondary" icon="calendar" onClick={() => setMoving(p)}>Перенести</Button>
                    {(isToday || missed) && <Button size="sm" variant="text" disabled={busy} onClick={() => void begin(p.id, true)}>Лёгкая</Button>}
                    <Button size="sm" variant="text" disabled={busy} onClick={() => void run((d) => skipPlannedSession(d, p.id))}>Пропустить</Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <PreviewSheet session={preview} label={preview ? labelOf(preview.workoutKey) : ''} onClose={() => setPreview(null)} onStart={preview && preview.status === 'planned' ? () => { const id = preview.id; setPreview(null); void begin(id); } : undefined} />
      <MoveSheet session={moving} onClose={() => setMoving(null)} onMove={async (date, reason) => { if (moving && (await ok((d) => movePlannedSession(d, moving.id, date, reason)))) setMoving(null); }} />
    </>
  );
}

/** What is in the workout: the exercises with sets and reps, before it is started. */
function PreviewSheet({ session, label, onClose, onStart }: { session: PlannedSession | null; label: string; onClose: () => void; onStart?: () => void }) {
  const { snapshot: s } = useData();
  if (!session) return null;
  const workout = s.activeVersion?.training.workouts.find((w) => w.key === session.workoutKey);
  const ctx = safetyContext(s, new Date().toISOString());
  return (
    <Sheet open title={label} onClose={onClose}>
      <div className="stack">
        <p className="t-small">{WEEKDAY_SHORT[weekdayOf(session.plannedDate)]}, {formatDateShort(session.plannedDate)} · {workout?.exercises.length ?? 0} {plural(workout?.exercises.length ?? 0, ['упражнение', 'упражнения', 'упражнений'])}</p>
        <div className="list">
          {(workout?.exercises ?? []).map((pe, i) => {
            const ex = s.exercises.find((e) => e.id === pe.exerciseId);
            const a = ex ? assessExercise(ex, ctx) : null;
            const timed = ex?.progressionType === 'time';
            return (
              <ListItem
                key={pe.key}
                icon={a?.status === 'caution' ? 'alert' : 'training'}
                title={`${i + 1}. ${ex?.name ?? pe.exerciseId}`}
                subtitle={`${pe.sets} × ${pe.repMin === pe.repMax ? pe.repMin : `${pe.repMin}–${pe.repMax}`}${timed ? ' с' : ''}${a?.status === 'caution' ? ' · осторожно' : ''}`}
              />
            );
          })}
          {!workout && <p className="note">Состав этой тренировки не найден в программе.</p>}
        </div>
        {onStart && <Button block icon="play" onClick={onStart}>Начать сегодня</Button>}
      </div>
    </Sheet>
  );
}

function MoveSheet({ session, onClose, onMove }: { session: PlannedSession | null; onClose: () => void; onMove: (date: string, reason: string) => Promise<void> }) {
  const { snapshot: s } = useData();
  if (!session || !s.profile) return null;
  const occupied = new Set(s.plannedSessions.filter((p) => p.deletedAt === null && p.status === 'planned' && p.id !== session.id).map((p) => p.plannedDate));
  const suggestion = suggestMoveDate(session.plannedDate, s.profile.trainingSchedule, occupied, s.today);
  const options = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(s.today, i)).filter((d) => d !== session.plannedDate);
  return (
    <Sheet open title="Перенести тренировку" onClose={onClose}>
      <div className="stack">
        <p className="t-small">Меняется только дата. Версия программы остаётся прежней.</p>
        {suggestion && <Button block icon="calendar" onClick={() => void onMove(suggestion, 'Пропущена, перенос на ближайший свободный день')}>Предложение: {WEEKDAY_SHORT[weekdayOf(suggestion)]}, {formatDateShort(suggestion)}</Button>}
        <div className="list">
          {options.map((d) => (
            <ListItem key={d} icon={occupied.has(d) ? 'alert' : 'calendar'} title={`${WEEKDAY_SHORT[weekdayOf(d)]}, ${formatDateShort(d)}`} subtitle={occupied.has(d) ? 'Уже есть тренировка' : d === s.today ? 'Сегодня' : undefined} onClick={() => void onMove(d, 'Перенос вручную')} />
          ))}
        </div>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ program

function ProgramView() {
  const { snapshot: s } = useData();
  const { run, ok, banner, busy } = useCommand();
  const version = s.activeVersion!;
  const [swap, setSwap] = useState<{ workout: WorkoutTemplate; index: number } | null>(null);
  const ctx = useMemo(() => safetyContext(s, new Date().toISOString()), [s]);
  const catalog = s.exercises.filter((e) => e.deletedAt === null);
  const assessments = useMemo(() => catalog.map((e) => ({ e, a: assessExercise(e, ctx) })), [catalog, ctx]);
  const avoided = assessments.filter((x) => x.a.status === 'avoid' && x.a.reasons.length > 0).sort((a, b) => b.a.risk - a.a.risk);
  const used = new Set(version.training.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)));
  const cautious = assessments.filter((x) => x.a.status === 'caution' && used.has(x.e.id));
  const [showAvoid, setShowAvoid] = useState(false);

  return (
    <>
      {banner}
      <Card flat>
        <div className="stack">
          <div className="row between"><div className="t-h3">Версия {version.versionNo}</div><Badge>{version.training.workouts.length} {plural(version.training.workouts.length, ['тренировка', 'тренировки', 'тренировок'])}</Badge></div>
          <p className="t-small">{version.reasonSummary}</p>
          <p className="t-small">Приоритет: техника → контроль → переносимость → вес. Безопасно не значит легко: нагрузка растёт постепенно.</p>
        </div>
      </Card>

      {version.training.workouts.map((w) => (
        <section key={w.key} className="stack" aria-label={w.label}>
          <div className="section-title"><h2 className="t-h3">{w.label}</h2></div>
          <div className="list">
            {w.exercises.map((pe, index) => {
              const ex = s.exercises.find((e) => e.id === pe.exerciseId);
              const a = ex ? assessExercise(ex, ctx) : null;
              return (
                <ListItem
                  key={pe.key}
                  icon={a?.status === 'caution' ? 'alert' : 'training'}
                  title={ex?.name ?? pe.exerciseId}
                  subtitle={`${pe.sets} × ${pe.repMin}–${pe.repMax} · запас ${pe.rirAdaptation.min}–${pe.rirAdaptation.max} → ${pe.rirMain.min}–${pe.rirMain.max}${a?.status === 'caution' ? ' · осторожно' : ''}`}
                  trailing={<Icon name="swap" size={18} />}
                  onClick={() => setSwap({ workout: w, index })}
                />
              );
            })}
          </div>
        </section>
      ))}

      {cautious.length > 0 && (
        <Card>
          <div className="stack">
            <div className="t-h3">Можно, но с осторожностью</div>
            {cautious.map(({ e, a }) => (
              <div key={e.id}>
                <div className="t-body"><b>{e.name}</b></div>
                <ul className="t-small">{a.conditions.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="stack">
          <div className="row between"><div className="t-h3">Не используем</div><Button size="sm" variant="text" onClick={() => setShowAvoid(!showAvoid)}>{showAvoid ? 'Скрыть' : `Показать (${avoided.length})`}</Button></div>
          {showAvoid && avoided.map(({ e, a }) => (
            <div key={e.id}>
              <div className="t-body"><b>{e.name}</b></div>
              <div className="t-small">{a.reasons.join('; ')}</div>
              <div className="t-small">Вместо: {e.curatedSubstituteKeys.slice(0, 2).map((k) => exerciseName(s.exercises, k)).join(', ') || 'подходящая замена из каталога'}</div>
            </div>
          ))}
          {!showAvoid && <p className="t-small">Упражнения, которые не подходят твоим ограничениям, и чем их заменить.</p>}
        </div>
      </Card>

      <Button block variant="secondary" icon="history" disabled={busy} onClick={() => void run((d) => rebuildTrainingPlan(d))}>Пересобрать программу</Button>
      <p className="t-small">Новая версия создаётся только при изменении программы. Перенос тренировок и «лёгкая» тренировка версию не меняют.</p>

      <SwapSheet
        target={swap}
        catalog={catalog}
        onClose={() => setSwap(null)}
        onPick={async (exerciseId) => {
          if (swap && (await ok((d) => replaceExerciseInPlan(d, swap.workout.exercises[swap.index]!.key, exerciseId, 'Замена упражнения в программе')))) setSwap(null);
        }}
      />
    </>
  );
}

function SwapSheet({ target, catalog, onClose, onPick }: { target: { workout: WorkoutTemplate; index: number } | null; catalog: Exercise[]; onClose: () => void; onPick: (exerciseId: string) => Promise<void> }) {
  const { snapshot: s } = useData();
  if (!target) return null;
  const pe = target.workout.exercises[target.index]!;
  const original = catalog.find((e) => e.id === pe.exerciseId);
  if (!original) return null;
  const subs = rankSubstitutes(original, catalog, safetyContext(s, new Date().toISOString()), 10);
  return (
    <Sheet open title={`Заменить: ${original.name}`} onClose={onClose}>
      <div className="stack">
        <p className="t-small">Показаны только допустимые варианты. Замена создаёт новую версию программы с записью причины.</p>
        <div className="list">
          {subs.map((x) => (
            <ListItem key={x.exercise.id} icon={x.assessment.status === 'caution' ? 'alert' : 'training'} title={x.exercise.name} subtitle={x.assessment.status === 'caution' ? `Осторожно: ${x.assessment.conditions[0] ?? 'следи за техникой'}` : x.curated ? 'Рекомендованная замена' : 'Похожее движение'} onClick={() => void onPick(x.exercise.id)} />
          ))}
          {subs.length === 0 && <p className="note">Подходящих замен не найдено.</p>}
        </div>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ history

function History() {
  const { snapshot: s } = useData();
  return (
    <>
      <div className="section-title"><h2 className="t-h3">История тренировок</h2></div>
      {s.workouts.length === 0 ? (
        <>
          <p className="note">Тренировок пока нет. Они появятся здесь после первой записанной тренировки.</p>
        </>
      ) : (
        <div className="list">
          {s.workouts.slice(0, 30).map((w) => (
            <ListItem key={w.id} icon="history" title={formatDay(w.date)} subtitle={`${w.names.slice(0, 3).join(', ')}${w.names.length > 3 ? ` и ещё ${w.names.length - 3}` : ''}`} trailing={`${w.sets} ${plural(w.sets, ['подход', 'подхода', 'подходов'])}`} onClick={() => go(`workout/${w.id}`)} />
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ month

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Month calendar: tap a day to see what was done or planned. */
function MonthView() {
  const { snapshot: s } = useData();
  const version = s.activeVersion!;
  const [ym, setYm] = useState(() => ({ y: Number(s.today.slice(0, 4)), m: Number(s.today.slice(5, 7)) }));
  const [picked, setPicked] = useState<string>(s.today);
  const first = `${ym.y}-${pad2(ym.m)}-01`;
  const daysIn = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
  const offset = WEEKDAYS.indexOf(weekdayOf(first));
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${ym.y}-${pad2(ym.m)}-${pad2(i + 1)}`)];
  const done = useMemo(() => new Map(s.workouts.map((w) => [w.date, w])), [s.workouts]);
  const planned = useMemo(() => new Map(s.plannedSessions.filter((p) => p.deletedAt === null && p.status === 'planned').map((p) => [p.plannedDate, p])), [s.plannedSessions]);
  const shift = (d: number) => setYm((c) => { const t = c.y * 12 + (c.m - 1) + d; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; });
  const labelOf = (key: string) => version.training.workouts.find((w) => w.key === key)?.label ?? 'Тренировка';
  const day = done.get(picked);
  const plan = planned.get(picked);
  return (
    <>
      <Card>
        <div className="stack">
          <div className="row between">
            <Button size="sm" variant="text" aria-label="Предыдущий месяц" onClick={() => shift(-1)}>←</Button>
            <div className="t-h3">{MONTH_NAMES[ym.m - 1]} {ym.y}</div>
            <Button size="sm" variant="text" aria-label="Следующий месяц" onClick={() => shift(1)}>→</Button>
          </div>
          <div className="cal-grid" role="grid" aria-label="Календарь тренировок">
            {WEEKDAYS.map((w) => <span key={w} className="t-caption cal-head">{WEEKDAY_SHORT[w]}</span>)}
            {cells.map((date, i) =>
              date ? (
                <button key={date} type="button" className="cal-day" aria-pressed={picked === date} data-today={date === s.today} data-done={done.has(date)} data-planned={planned.has(date)} aria-label={formatDateShort(date)} onClick={() => setPicked(date)}>
                  {Number(date.slice(8))}
                </button>
              ) : (
                <span key={`e${i}`} />
              ),
            )}
          </div>
          <div className="row t-caption"><span className="cal-dot done" /> сделано <span className="cal-dot planned" /> запланировано</div>
        </div>
      </Card>
      <Card flat>
        <div className="stack">
          <div className="t-h3">{formatDay(picked)}</div>
          {day && <ListItem icon="history" title="Тренировка выполнена" subtitle={day.names.slice(0, 4).join(', ')} trailing={`${day.sets} подх.`} onClick={() => go(`workout/${day.id}`)} />}
          {plan && <ListItem icon="calendar" title={labelOf(plan.workoutKey)} subtitle="Запланировано" onClick={() => go('training')} />}
          {!day && !plan && <p className="note">В этот день тренировки нет.</p>}
        </div>
      </Card>
    </>
  );
}
