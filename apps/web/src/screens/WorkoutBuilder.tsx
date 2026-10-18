import { useMemo, useState } from 'react';
import { autoWorkoutName, type CustomWorkoutExercise, type Exercise } from '@fitapp/domain';
import { customDefaults, deleteCustomWorkout, saveCustomWorkout, startCustomWorkout } from '../actions';
import { useData } from '../app/DataContext';
import { plural } from '../app/format';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Button, Card, EmptyState, Icon, IconButton, TextField } from '../ui';
import { ExerciseInfoSheet } from './ExerciseInfo';
import { ExercisePickerSheet } from './ExercisePicker';
import { ScreenHeader } from './shared';

interface Row {
  uid: number;
  exerciseId: string;
  sets: number;
  repMin: string;
  repMax: string;
  restSec: number;
}

const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const toRow = (e: CustomWorkoutExercise, uid: number): Row => ({ uid, exerciseId: e.exerciseId, sets: e.sets, repMin: String(e.repMin), repMax: String(e.repMax), restSec: e.restSec });
const digits = (v: string): string => v.replace(/\D/g, '').slice(0, 3);

/** Checks the rows and turns them into what is saved; the first problem is returned as text. */
function toExercises(rows: readonly Row[], nameOf: (id: string) => string): { exercises: CustomWorkoutExercise[]; problem: string | null } {
  const exercises: CustomWorkoutExercise[] = [];
  for (const r of rows) {
    const min = Number.parseInt(r.repMin, 10);
    const max = r.repMax.trim() === '' ? min : Number.parseInt(r.repMax, 10);
    if (!(min >= 1) || !(max >= 1)) return { exercises, problem: `${nameOf(r.exerciseId)}: укажи повторения` };
    if (max < min) return { exercises, problem: `${nameOf(r.exerciseId)}: «до» меньше, чем «от»` };
    exercises.push({ exerciseId: r.exerciseId, sets: r.sets, repMin: min, repMax: max, restSec: r.restSec });
  }
  return { exercises, problem: null };
}

/**
 * The workout builder: an own workout from scratch (name, exercises, sets, reps, rest), saved to be repeated.
 * Weights are not typed here: at the start they come from the history of each exercise, like in the program.
 */
export function WorkoutBuilder({ id, back = 'training' }: { id: string | null; /** Where «Сохранить», delete and the back arrow lead. */ back?: string }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const existing = id ? s.customWorkouts.find((w) => w.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() => (existing?.exercises ?? []).map((e, i) => toRow(e, i + 1)));
  const [nextUid, setNextUid] = useState((existing?.exercises.length ?? 0) + 1);
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState<Exercise | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const byId = useMemo(() => new Map(s.exercises.map((e) => [e.id, e])), [s.exercises]);
  const added = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.exerciseId, (m.get(r.exerciseId) ?? 0) + 1);
    return m;
  }, [rows]);

  if (id && !existing) {
    return (
      <main className="screen">
        <ScreenHeader title="Своя тренировка" back="training" />
        <Card flat><EmptyState icon="training" title="Тренировка не найдена" text="Возможно, её удалили." action={<Button onClick={() => go('training')}>К тренировкам</Button>} /></Card>
      </main>
    );
  }

  const nameOf = (exerciseId: string) => byId.get(exerciseId)?.name ?? 'Упражнение';
  const patch = (uid: number, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.uid === uid ? { ...r, ...p } : r)));
  const move = (index: number, delta: number) =>
    setRows((cur) => {
      const to = index + delta;
      if (to < 0 || to >= cur.length) return cur;
      const next = [...cur];
      const [row] = next.splice(index, 1);
      next.splice(to, 0, row as Row);
      return next;
    });
  const add = (e: Exercise) => {
    if (rows.length >= 20) {
      setProblem('Не больше 20 упражнений в одной тренировке');
      return;
    }
    setRows((cur) => [...cur, toRow(customDefaults(e), nextUid)]);
    setNextUid((n) => n + 1);
    setProblem(null);
  };

  const save = async (andStart: boolean) => {
    const { exercises, problem: p } = toExercises(rows, nameOf);
    if (exercises.length === 0 && !p) return setProblem('Добавь хотя бы одно упражнение');
    if (p) return setProblem(p);
    setProblem(null);
    const savedId = await run((d) => saveCustomWorkout(d, { id: existing?.id ?? null, name, exercises }));
    if (!savedId) return;
    if (!andStart) {
      go(back);
      return;
    }
    const sessionId = await run((d) => startCustomWorkout(d, savedId));
    if (sessionId) go(`workout/${sessionId}`);
  };

  const totalSets = rows.reduce((n, r) => n + r.sets, 0);
  return (
    <main className="screen">
      <ScreenHeader title={existing ? 'Изменить тренировку' : 'Конструктор тренировки'} back={back} />
      <p className="t-small">Собери тренировку как тебе нужно и сохрани: потом её можно повторять в один тап. Программа и календарь не меняются, а веса подставятся из истории каждого упражнения.</p>
      <TextField label="Название (необязательно)" placeholder={rows.length ? autoWorkoutName(rows.map((r) => byId.get(r.exerciseId)).filter((e): e is Exercise => !!e).map((e) => ({ name: e.name, primaryMuscles: e.primaryMuscles }))) : 'Придумается само по упражнениям'} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />

      {rows.length === 0 ? (
        <Card flat><EmptyState icon="training" title="Пока пусто" text="Добавь упражнения из каталога: подходы, повторения и отдых подставятся сами, их можно поменять." /></Card>
      ) : (
        <div className="stack">
          <div className="t-small">{rows.length} {plural(rows.length, ['упражнение', 'упражнения', 'упражнений'])} · {totalSets} {plural(totalSets, ['подход', 'подхода', 'подходов'])}</div>
          {rows.map((r, i) => {
            const ex = byId.get(r.exerciseId);
            const timed = ex?.loadUnit === 'seconds' || ex?.progressionType === 'time';
            return (
              <Card key={r.uid}>
                <div className="bld-ex">
                  <div className="bld-head">
                    <span className="bld-no" aria-hidden="true">{i + 1}</span>
                    <button type="button" className="pick-main" aria-label={`Техника: ${nameOf(r.exerciseId)}`} onClick={() => ex && setInfo(ex)}>
                      <span className="li-title">{nameOf(r.exerciseId)}</span>
                      <span className="li-sub">Техника <Icon name="info" size={12} /></span>
                    </button>
                    <span className="bld-tools">
                      <IconButton icon="arrowUp" label="Выше" tone="ghost" disabled={i === 0} onClick={() => move(i, -1)} />
                      <IconButton icon="arrowDown" label="Ниже" tone="ghost" disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
                      <IconButton icon="trash" label={`Убрать: ${nameOf(r.exerciseId)}`} tone="ghost" onClick={() => setRows((cur) => cur.filter((x) => x.uid !== r.uid))} />
                    </span>
                  </div>
                  <div className="grid-2">
                    <div>
                      <div className="t-caption">Подходы</div>
                      <div className="bld-step">
                        <IconButton icon="minus" label="Меньше подходов" disabled={r.sets <= 1} onClick={() => patch(r.uid, { sets: Math.max(1, r.sets - 1) })} />
                        <span className="bld-val" aria-live="polite">{r.sets}</span>
                        <IconButton icon="plus" label="Больше подходов" disabled={r.sets >= 10} onClick={() => patch(r.uid, { sets: Math.min(10, r.sets + 1) })} />
                      </div>
                    </div>
                    <div>
                      <div className="t-caption">Отдых</div>
                      <div className="bld-step">
                        <IconButton icon="minus" label="Меньше отдыха" disabled={r.restSec <= 15} onClick={() => patch(r.uid, { restSec: Math.max(15, r.restSec - 15) })} />
                        <span className="bld-val" aria-live="polite">{clock(r.restSec)}</span>
                        <IconButton icon="plus" label="Больше отдыха" disabled={r.restSec >= 600} onClick={() => patch(r.uid, { restSec: Math.min(600, r.restSec + 15) })} />
                      </div>
                    </div>
                  </div>
                  <div className="grid-2">
                    <TextField label={timed ? 'Секунд, от' : 'Повторений, от'} inputMode="numeric" value={r.repMin} onChange={(e) => patch(r.uid, { repMin: digits(e.target.value) })} />
                    <TextField label="до" inputMode="numeric" value={r.repMax} onChange={(e) => patch(r.uid, { repMax: digits(e.target.value) })} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Button block variant="secondary" icon="plus" onClick={() => setPicking(true)}>Добавить упражнение</Button>
      {problem && <div className="errbox" role="alert">{problem}</div>}
      {banner}
      <Button block icon="play" disabled={busy} onClick={() => void save(true)}>Сохранить и начать</Button>
      <Button block variant="secondary" icon="check" disabled={busy} onClick={() => void save(false)}>Сохранить</Button>
      {existing && (confirmDelete ? (
        <div className="row">
          <Button block variant="danger" icon="trash" disabled={busy} onClick={async () => { if (await run((d) => deleteCustomWorkout(d, existing.id).then(() => true))) go(back); }}>Да, удалить</Button>
          <Button block variant="secondary" onClick={() => setConfirmDelete(false)}>Отмена</Button>
        </div>
      ) : (
        <Button block variant="text" icon="trash" onClick={() => setConfirmDelete(true)}>Удалить тренировку</Button>
      ))}
      {existing && <p className="t-small">Сделанные по ней тренировки останутся в истории.</p>}

      <ExercisePickerSheet open={picking} title="Добавить упражнение" added={added} onPick={add} onClose={() => setPicking(false)} />
      <ExerciseInfoSheet exercise={info} onClose={() => setInfo(null)} />
    </main>
  );
}
