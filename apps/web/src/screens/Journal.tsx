import { useState } from 'react';
import { addToJournal, startCustomWorkout } from '../actions';
import { useData } from '../app/DataContext';
import { plural } from '../app/format';
import { setOwnMode } from '../app/prefs';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Button, Card, Chip } from '../ui';
import { ExercisePickerSheet } from './ExercisePicker';

/**
 * «Своя программа»: the training tab as a plain workout journal. «Добавить упражнение» puts the exercise
 * into today's workout (it is started on the first one), sets are added by hand as they are done.
 * The program is on pause and is never changed; the weights are still suggested from the history.
 */
export function JournalCard({ onOwnList }: { onOwnList?: () => void }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const [picking, setPicking] = useState(false);
  const open = s.openSession;
  const current = open ? s.workouts.find((w) => w.id === open.id) : undefined;
  const doneToday = s.workouts.filter((w) => w.completed && w.date === s.today && w.sets > 0);
  const add = async (exerciseId: string) => {
    const r = await run((d) => addToJournal(d, exerciseId));
    setPicking(false);
    if (r) {
      go(`workout/${r.sessionId}/${r.sessionExerciseId}`);
    }
  };
  const repeat = async (id: string) => {
    const sid = await run((d) => startCustomWorkout(d, id));
    if (sid) go(`workout/${sid}`);
  };
  return (
    <Card>
      <div className="stack">
        <div className="row between">
          <div className="t-caption">Режим «Своя программа»</div>
          <Button size="sm" variant="text" onClick={() => setOwnMode(false)}>Вернуться к программе</Button>
        </div>
        <div className="t-h3">Журнал тренировок</div>
        <p className="t-small">Программа на паузе и не меняется. Добавляй упражнения и подходы сам — всё записывается как обычная тренировка: в историю, прогресс и тоннаж. Вес подскажу по прошлым разам.</p>
        {open && (
          <div className="stack tight">
            <div className="t-body"><b>Сейчас идёт тренировка</b>{current ? ` · ${current.exercises} ${plural(current.exercises, ['упражнение', 'упражнения', 'упражнений'])}, ${current.sets} ${plural(current.sets, ['подход', 'подхода', 'подходов'])}` : ''}</div>
            {current && current.names.length > 0 && <p className="t-small">{current.names.join(', ')}</p>}
          </div>
        )}
        {!open && doneToday.length > 0 && <p className="t-small">Сегодня уже записано: {doneToday.map((w) => w.title ?? w.names.slice(0, 2).join(', ')).join('; ')}. Новое упражнение начнёт ещё одну тренировку.</p>}
        {banner}
        <Button block icon="plus" disabled={busy} onClick={() => setPicking(true)}>Добавить упражнение</Button>
        {open && <Button block variant="secondary" icon="play" onClick={() => go(`workout/${open.id}`)}>Открыть тренировку</Button>}
        {!open && s.customWorkouts.length > 0 && (
          <div className="stack tight">
            <div className="t-caption">Повторить сохранённую</div>
            <div className="chips" role="group" aria-label="Свои тренировки">
              {s.customWorkouts.slice(0, 6).map((w) => <Chip key={w.id} pressed={false} disabled={busy} onClick={() => void repeat(w.id)}>{w.name}</Chip>)}
            </div>
          </div>
        )}
        {onOwnList && <Button block variant="text" onClick={onOwnList}>Свои тренировки и конструктор</Button>}
      </div>
      <ExercisePickerSheet open={picking} title={open ? 'Добавить в тренировку' : 'Первое упражнение'} onPick={(e) => { if (!busy) void add(e.id); }} onClose={() => setPicking(false)} />
    </Card>
  );
}
