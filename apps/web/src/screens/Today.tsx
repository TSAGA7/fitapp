import { useEffect, useState } from 'react';
import { diffDays } from '@fitapp/domain';
import { addWater, ensureSessions, startWorkout } from '../actions';
import { eatenOf, itemsOnDate, logsOnDate, plannedOf } from '../app/derive';
import { useCommand } from '../app/useCommand';
import { useData } from '../app/DataContext';
import { fmt, formatDay, GOAL_LABELS, initials, kg, plural, signed } from '../app/format';
import { getDisplayName } from '../app/prefs';
import { go } from '../app/router';
import { Button, Card, EmptyState, Icon, IconButton, ListItem, ProgressBar, Sparkline } from '../ui';
import { useBodyweightMode } from '../app/prefs';
import { BodyweightCard, BodyweightToggle } from './BodyweightMode';
import { GoalExplainSheet } from './GoalExplain';
import { AddMeasurementSheet, AddWeightSheet } from './shared';

const NBSP = '\u00a0';

export function Today() {
  const { snapshot: s, act } = useData();
  const [weightOpen, setWeightOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const name = getDisplayName();
  const bodyweight = useBodyweightMode();
  const w = s.weight;
  const { run, banner, busy } = useCommand();
  useEffect(() => {
    if (s.activeVersion) void run((d) => ensureSessions(d));
  }, [s.activeVersion?.id, s.today]);
  const targets = s.activeVersion?.nutrition ?? s.targets?.targets;
  const todaySession = s.plannedSessions.find((p) => p.deletedAt === null && p.plannedDate === s.today && p.status === 'planned');
  const todayLabel = todaySession ? s.activeVersion?.training.workouts.find((x) => x.key === todaySession.workoutKey)?.label : undefined;
  const eatenToday = eatenOf(logsOnDate(s, s.today));
  const plannedToday = plannedOf(itemsOnDate(s, s.today));

  const delta =
    w.monthChangeKg !== null
      ? `${signed(w.monthChangeKg)}${NBSP}кг за 30 дней`
      : w.sinceStartKg !== null
        ? `${signed(w.sinceStartKg)}${NBSP}кг за ${w.sinceStartDays}${NBSP}дн.`
        : w.count > 0
          ? 'Динамика появится после недели записей'
          : null;

  const target = s.primaryGoal?.targetWeightKg ?? null;
  const start = s.weightPoints[0]?.kg ?? null;
  const goalProgress = target !== null && start !== null && w.currentKg !== null && start !== target ? (start - w.currentKg) / (start - target) : null;

  const lastWorkout = s.workouts[0];
  const food = s.foodDays[0];
  const lastMeasure = Object.values(s.series).flatMap((list) => list ?? []).map((p) => p.date).sort().pop();
  const measureAge = lastMeasure ? diffDays(lastMeasure, s.today) : null;
  const spark = s.weightPoints.slice(-30).map((p) => p.kg);

  return (
    <main className="screen">
      <section className="hero" aria-label="Сводка">
        <div className="row" style={{ position: 'relative', zIndex: 1 }}>
          <span className="avatar" aria-hidden="true">{initials(name)}</span>
          <div className="grow">
            <div className="greet">Привет,</div>
            <div className="t-h2">{name || 'добро пожаловать'}</div>
          </div>
          <span className="greet">{formatDay(s.today)}</span>
        </div>
        <div style={{ marginTop: 20, position: 'relative', zIndex: 1 }}>
          <div className="greet">Текущий вес</div>
          {w.currentKg !== null ? (
            <>
              <div className="big">{fmt(w.currentKg)}<small>кг</small></div>
              {delta && <div className="delta">{delta}</div>}
            </>
          ) : (
            <div className="t-h3" style={{ marginTop: 6 }}>Запиши первый вес</div>
          )}
          {goalProgress !== null && target !== null && w.currentKg !== null && (
            <div style={{ marginTop: 14 }}>
              <ProgressBar value={goalProgress} onDark label="Прогресс к цели" />
              <div className="greet" style={{ marginTop: 6 }}>
                {goalProgress >= 1 ? `Цель ${kg(target)} достигнута` : `Цель ${kg(target)} · осталось ${kg(Math.abs(w.currentKg - target))}`}
              </div>
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Button variant="on-dark" size="sm" icon="plus" onClick={() => setWeightOpen(true)}>Записать вес</Button>
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <div className="s-l"><span className="dot" style={{ background: '#16a34a' }} />Среднее 7 дн</div>
            <div className="s-v">{w.avg7 !== null ? kg(w.avg7) : '—'}</div>
          </div>
          <div>
            <div className="s-l"><span className="dot" style={{ background: '#f59e0b' }} />Среднее 30 дн</div>
            <div className="s-v">{w.avg30 !== null ? kg(w.avg30) : '—'}</div>
          </div>
          <div>
            <div className="s-l"><span className="dot" style={{ background: '#a78bfa' }} />Темп в неделю</div>
            <div className="s-v">{w.rateKgPerWeek !== null && w.rateReliable ? `${signed(w.rateKgPerWeek)}${NBSP}кг` : '—'}</div>
          </div>
        </div>
      </section>

      {banner}
      {s.activeVersion && !bodyweight && <BodyweightToggle />}
      {bodyweight && s.activeVersion && <BodyweightCard />}
      {!bodyweight && todaySession && (
        <Card>
          <div className="stack">
            <div className="row between"><div className="t-caption">Тренировка сегодня</div>{s.openSession?.plannedSessionId === todaySession.id && <span className="t-small">идёт</span>}</div>
            <div className="t-h2">{todayLabel ?? 'Тренировка'}</div>
            <Button icon="play" disabled={busy} onClick={async () => { const id = await run((d) => startWorkout(d, todaySession.id)); if (id) go(`workout/${id}`); }}>{s.openSession?.plannedSessionId === todaySession.id ? 'Продолжить' : 'Начать'}</Button>
          </div>
        </Card>
      )}
      {!bodyweight && !todaySession && s.activeVersion && !lastWorkoutToday(s) && <ListItem icon="calendar" title="Сегодня отдых" subtitle="Следующую тренировку смотри на вкладке «Тренировки»" onClick={() => go('training')} />}
      {targets && (plannedToday.kcal > 0 || eatenToday.kcal > 0) && (
        <Card onClick={() => go('nutrition')}>
          <div className="row between">
            <div>
              <div className="t-caption">Питание сегодня</div>
              <div className="t-h2">{fmt(eatenToday.kcal, 0)} из {fmt(targets.kcal, 0)} ккал</div>
            </div>
            <Icon name="chevronRight" size={18} />
          </div>
          <div style={{ marginTop: 10 }}><ProgressBar value={targets.kcal > 0 ? eatenToday.kcal / targets.kcal : 0} label="Калории сегодня" /></div>
          <div className="t-small" style={{ marginTop: 6 }}>Белок {fmt(eatenToday.proteinG, 0)} из {fmt(targets.proteinG, 0)} г</div>
        </Card>
      )}
      {lastWorkout ? (
        <ListItem icon="training" lime title="Последняя тренировка" subtitle={`${formatDay(lastWorkout.date)} · ${lastWorkout.exercises} ${plural(lastWorkout.exercises, ['упражнение', 'упражнения', 'упражнений'])} · ${lastWorkout.sets} ${plural(lastWorkout.sets, ['подход', 'подхода', 'подходов'])}`} onClick={() => go('training')} />
      ) : (
        <Card flat>
          <EmptyState icon="training" title="Программа тренировок появится здесь" text="Пока можно загрузить историю тренировок из Excel или резервной копии." action={<Button variant="secondary" size="sm" icon="upload" onClick={() => go('profile/data')}>Загрузить историю</Button>} />
        </Card>
      )}

      {food ? (
        <Card onClick={() => go('nutrition')}>
          <div className="row between">
            <div>
              <div className="t-caption">Питание · {formatDay(food.date)}</div>
              <div className="t-h2">{fmt(food.kcal, 0)} ккал</div>
            </div>
            <Icon name="chevronRight" size={18} />
          </div>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <div><span className="dot" style={{ background: '#16a34a' }} /> <span className="t-small">Белки</span><div style={{ fontWeight: 700 }}>{fmt(food.proteinG, 0)} г</div></div>
            <div><span className="dot" style={{ background: '#f59e0b' }} /> <span className="t-small">Жиры</span><div style={{ fontWeight: 700 }}>{fmt(food.fatG, 0)} г</div></div>
            <div><span className="dot" style={{ background: '#a78bfa' }} /> <span className="t-small">Углеводы</span><div style={{ fontWeight: 700 }}>{fmt(food.carbG, 0)} г</div></div>
          </div>
        </Card>
      ) : (
        <ListItem icon="nutrition" title="Питание" subtitle="Рацион и цели по КБЖУ появятся здесь" onClick={() => go('nutrition')} />
      )}

      {spark.length >= 2 && w.currentKg !== null && (
        <Card onClick={() => go('progress/weight')}>
          <div className="row between">
            <div>
              <div className="t-caption">Вес</div>
              <div className="t-h2">{kg(w.currentKg)}</div>
              {delta && <div className="t-small">{delta}</div>}
            </div>
            <div style={{ width: '45%' }}><Sparkline values={spark} /></div>
          </div>
        </Card>
      )}

      <Card>
        <div className="row between">
          <div className="row">
            <span className="li-icon lime"><Icon name="drop" /></span>
            <div>
              <div className="t-caption">Вода сегодня</div>
              <div className="t-h3">{fmt(s.waterMl / 1000, 2)}{NBSP}л{targets ? <span className="t-small"> из ~{fmt(targets.waterMl / 1000, 1)}{NBSP}л</span> : null}</div>
            </div>
          </div>
          <div className="row">
            <IconButton icon="minus" label="Убрать 250 мл" disabled={s.waterMl === 0} onClick={() => void act((d) => addWater(d, s.today, -250))} />
            <IconButton icon="plus" label="Добавить 250 мл" onClick={() => void act((d) => addWater(d, s.today, 250))} />
          </div>
        </div>
        <p className="t-small" style={{ marginTop: 10 }}>Ориентир, не норма: ~33 мл на кг веса. Для сравнения, у национальных академий США (2004) около 3 л напитков в сутки для мужчин и 2,2 л для женщин, ещё ~20% воды приходит с едой. Пей по жажде; в жару и в дни тренировок обычно больше.</p>
      </Card>

      {(measureAge === null || measureAge > 14) && (
        <ListItem icon="ruler" title={measureAge === null ? 'Добавь замеры' : 'Пора обновить замеры'} subtitle={measureAge === null ? 'Грудь, талия, бицепс, бедро: так видно прогресс, который не показывают весы' : `Последний замер ${measureAge}${NBSP}${plural(measureAge, ['день', 'дня', 'дней'])} назад`} onClick={() => setMeasureOpen(true)} />
      )}
      {s.primaryGoal && (
        <Card>
          <div className="stack">
            <div className="row between">
              <div>
                <div className="t-caption">Моя цель</div>
                <div className="t-h3">{GOAL_LABELS[s.primaryGoal.type].title}</div>
              </div>
              <Button size="sm" variant="text" onClick={() => go('profile/goals')}>Изменить</Button>
            </div>
            <p className="t-small">{GOAL_LABELS[s.primaryGoal.type].text}</p>
            <Button variant="secondary" icon="info" onClick={() => setExplainOpen(true)}>Почему такие калории и тренировки</Button>
          </div>
        </Card>
      )}
      {s.primaryGoal && <GoalExplainSheet open={explainOpen} goal={s.primaryGoal.type} onClose={() => setExplainOpen(false)} />}
      <AddWeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
      <AddMeasurementSheet open={measureOpen} onClose={() => setMeasureOpen(false)} />
    </main>
  );
}

function lastWorkoutToday(s: { workouts: { date: string }[]; today: string }): boolean {
  return s.workouts[0]?.date === s.today;
}
