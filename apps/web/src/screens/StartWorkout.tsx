import { useMemo, useState } from 'react';
import { addDays, ownScheduleDays, weekdayOf, type PlannedSession } from '@fitapp/domain';
import { startBodyweightWorkout, startCustomWorkout, startWorkout } from '../actions';
import { useData } from '../app/DataContext';
import { formatDateShort, plural, WEEKDAY_SHORT } from '../app/format';
import { go } from '../app/router';
import { useBodyweightMode, useHomeEquipment, useOwnMode } from '../app/prefs';
import { useCommand } from '../app/useCommand';
import { Button, Icon, ListItem, Sheet } from '../ui';
import { OwnWorkoutsSheet } from './OwnMode';
import { useDayStatus } from './OwnPlan';

const exWord = (n: number) => `${n} ${plural(n, ['упражнение', 'упражнения', 'упражнений'])}`;

/**
 * «Начать тренировку» at the top of «Тренировки»: one button, and the choice opens after the tap —
 * from the program, or an empty one built on the go. Workouts started and not finished are listed
 * there too, so one left with «Назад» is always one tap away.
 */
export function StartWorkoutButton() {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const [choosing, setChoosing] = useState(false);
  const [fromPlan, setFromPlan] = useState(false);
  const running = s.workouts.filter((w) => w.inProgress);
  const titleOf = (w: (typeof running)[number]): string => {
    if (w.title) return w.exercises === 0 ? 'Тренировка по ходу' : w.title;
    const ps = w.plannedSessionId ? s.plannedSessions.find((p) => p.id === w.plannedSessionId) : undefined;
    if (ps) return s.activeVersion?.training.workouts.find((t) => t.key === ps.workoutKey)?.label ?? 'Тренировка';
    return 'Тренировка дома';
  };
  const onTheGo = async () => {
    const id = await run((d) => startCustomWorkout(d, null));
    if (id) {
      setChoosing(false);
      go(`workout/${id}`);
    }
  };
  return (
    <>
      <Button block icon="play" onClick={() => setChoosing(true)}>Начать тренировку</Button>
      <Sheet open={choosing && !fromPlan} title="Начать тренировку" onClose={() => setChoosing(false)}>
        <div className="stack">
          {banner}
          {running.length > 0 && (
            <>
              <span className="t-caption">Не закончены — продолжить</span>
              <div className="list">
                {running.map((w) => (
                  <ListItem
                    key={w.id}
                    icon="history"
                    title={titleOf(w)}
                    subtitle={`${w.date === s.today ? 'Сегодня' : `${WEEKDAY_SHORT[weekdayOf(w.date)]}, ${formatDateShort(w.date)}`} · ${w.exercises === 0 ? 'упражнений пока нет' : exWord(w.exercises)}`}
                    onClick={() => { setChoosing(false); go(`workout/${w.id}`); }}
                  />
                ))}
              </div>
              <span className="t-caption">Новая</span>
            </>
          )}
          <button type="button" className="plan-pick" disabled={busy} onClick={() => setFromPlan(true)}>
            <Icon name="calendar" size={22} />
            <span className="grow">
              <span className="li-title">Из программы</span>
              <span className="li-sub">Тренировка по плану: упражнения, подходы и веса уже расписаны.</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </button>
          <button type="button" className="plan-pick" disabled={busy} onClick={() => void onTheGo()}>
            <Icon name="plus" size={22} />
            <span className="grow">
              <span className="li-title">Собрать по ходу</span>
              <span className="li-sub">Пустая тренировка: добавляешь упражнения по факту, вес подставится из истории.</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </button>
          <p className="t-small">Выйдешь «Назад» — тренировка сохранится, вернуться к ней можно здесь же, через «Начать тренировку».</p>
        </div>
      </Sheet>
      <FromPlanSheet open={choosing && fromPlan} onBack={() => setFromPlan(false)} onClose={() => { setFromPlan(false); setChoosing(false); }} />
    </>
  );
}

/** «Из программы»: what the current mode plans (gym program, home workout or own plan), nearest first. */
function FromPlanSheet({ open, onBack, onClose }: { open: boolean; onBack: () => void; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const own = useOwnMode();
  const home = useBodyweightMode();
  const have = useHomeEquipment();
  const { stateOf, runningId } = useDayStatus();
  const [ownList, setOwnList] = useState(false);
  const version = s.activeVersion;
  const labelOf = (key: string) => version?.training.workouts.find((w) => w.key === key)?.label ?? 'Тренировка';
  const dayLabel = (d: string) => (d === s.today ? 'Сегодня' : `${WEEKDAY_SHORT[weekdayOf(d)]}, ${formatDateShort(d)}`);
  const program = useMemo(
    () => s.plannedSessions.filter((p) => p.deletedAt === null && p.status === 'planned' && p.plannedDate >= addDays(s.today, -3)).sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1)).slice(0, 4),
    [s.plannedSessions, s.today],
  );
  const ownDays = useMemo(
    () => (s.ownSchedule ? ownScheduleDays(s.ownSchedule) : []).filter((d) => d.customWorkoutId !== null && d.date >= addDays(s.today, -3) && stateOf(d) !== 'done').slice(0, 4),
    [s.ownSchedule, s.today, stateOf],
  );
  const openSession = (id: string | null | undefined) => {
    if (!id) return;
    onClose();
    go(`workout/${id}`);
  };
  const startProgram = async (p: PlannedSession) => {
    if (s.openSession?.plannedSessionId === p.id) return openSession(s.openSession.id);
    openSession(await run((d) => startWorkout(d, p.id)));
  };
  if (!open) return null;
  return (
    <>
      <Sheet open={!ownList} title="Из программы" onClose={onClose}>
        <div className="stack">
          {banner}
          {home && !own && (
            <ListItem icon="play" title="Тренировка дома" subtitle="Сегодняшняя тренировка под домашнее оборудование" disabled={busy} onClick={() => void run((d) => startBodyweightWorkout(d, have)).then(openSession)} />
          )}
          {own && (ownDays.length > 0 ? (
            <div className="list">
              {ownDays.map((d) => {
                const cw = s.customWorkouts.find((w) => w.id === d.customWorkoutId);
                const r = runningId(d);
                return (
                  <ListItem
                    key={d.date}
                    icon={d.date === s.today ? 'target' : 'calendar'}
                    lime={d.date === s.today}
                    title={cw?.name ?? 'Тренировка удалена'}
                    subtitle={`${dayLabel(d.date)}${cw ? ` · ${exWord(cw.exercises.length)}` : ''}`}
                    trailing={<span className="t-small">{r ? 'Продолжить' : 'Начать'}</span>}
                    disabled={busy || !cw}
                    onClick={() => (r ? openSession(r) : void run((x) => startCustomWorkout(x, d.customWorkoutId)).then(openSession))}
                  />
                );
              })}
            </div>
          ) : (
            <p className="note">В своём плане ближайших тренировок нет.</p>
          ))}
          {!own && !home && (program.length > 0 ? (
            <div className="list">
              {program.map((p) => (
                <ListItem
                  key={p.id}
                  icon={p.plannedDate === s.today ? 'target' : 'calendar'}
                  lime={p.plannedDate === s.today}
                  title={labelOf(p.workoutKey)}
                  subtitle={`${dayLabel(p.plannedDate)}${p.plannedDate < s.today ? ' · пропущена' : ''}`}
                  trailing={<span className="t-small">{s.openSession?.plannedSessionId === p.id ? 'Продолжить' : 'Начать'}</span>}
                  disabled={busy}
                  onClick={() => void startProgram(p)}
                />
              ))}
            </div>
          ) : (
            <p className="note">Ближайших тренировок в программе нет.</p>
          ))}
          {s.customWorkouts.length > 0 && <Button block variant="secondary" icon="training" onClick={() => setOwnList(true)}>Свои сохранённые тренировки</Button>}
          <Button block variant="text" onClick={onBack}>Назад</Button>
        </div>
      </Sheet>
      <OwnWorkoutsSheet open={ownList} onClose={() => { setOwnList(false); onClose(); }} />
    </>
  );
}
