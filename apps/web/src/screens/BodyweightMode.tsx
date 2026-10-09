import { useMemo } from 'react';
import { startBodyweightWorkout } from '../actions';
import { useData } from '../app/DataContext';
import { bodyweightPlan, exerciseName } from '../app/derive';
import { setBodyweightMode, useBodyweightMode } from '../app/prefs';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Button, Card, Chip } from '../ui';

/** Status switch: while it is on, the workout of the day is "со своим весом"; the program itself is untouched. */
export function BodyweightToggle() {
  const on = useBodyweightMode();
  return (
    <div className="chips" role="group" aria-label="Режим тренировки">
      <Chip pressed={on} onClick={() => setBodyweightMode(!on)}>Со своим весом</Chip>
    </div>
  );
}

/** The bodyweight workout of the day: replaces the program workout while the status is on. */
export function BodyweightCard() {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const plan = useMemo(() => bodyweightPlan(s, `${s.today}T12:00:00.000Z`), [s]);
  const open = s.openSession;
  return (
    <Card>
      <div className="stack">
        <div className="row between">
          <div className="t-caption">Режим «Со своим весом»</div>
          <Button size="sm" variant="text" onClick={() => setBodyweightMode(false)}>Выключить</Button>
        </div>
        <div className="t-h3">Тренировка без оборудования</div>
        <p className="t-small">Программа на паузе. Когда выключишь режим, вернётся ровно та тренировка, которая была запланирована. Вес и прогрессия по основной программе не меняются.</p>
        <ol className="t-body">
          {plan.exercises.map((e) => <li key={e.key}>{exerciseName(s.exercises, e.exerciseId)}</li>)}
        </ol>
        {banner}
        {open ? (
          <Button icon="play" onClick={() => go(`workout/${open.id}`)}>Продолжить начатую тренировку</Button>
        ) : (
          <Button icon="play" disabled={busy || plan.exercises.length === 0} onClick={async () => { const id = await run((d) => startBodyweightWorkout(d)); if (id) go(`workout/${id}`); }}>Начать</Button>
        )}
      </div>
    </Card>
  );
}
