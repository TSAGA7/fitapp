import { useEffect, useMemo, useState } from 'react';
import { autoWorkoutName, type CustomWorkout, type Exercise, type PlannedSession } from '@fitapp/domain';
import { customDefaults, saveCustomWorkout, startCustomWorkout } from '../actions';
import { useData } from '../app/DataContext';
import { formatDateShort, plural } from '../app/format';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Badge, Button, Card, Chip, EmptyState, Icon, IconButton, Sheet, TextField } from '../ui';
import { ExercisePickerSheet } from './ExercisePicker';

const exWord = (n: number) => `${n} ${plural(n, ['упражнение', 'упражнения', 'упражнений'])}`;

/**
 * «Собрать тренировку» as a cart: exercises are ticked in the catalog, «Готово» saves the workout
 * (sets, reps and rest from the catalog, the name made from the exercises unless one is typed).
 */
export function BuildCartSheet({ open, title = 'Собрать тренировку', doneLabel = 'Готово', onClose, onSaved }: { open: boolean; title?: string; doneLabel?: string; onClose: () => void; onSaved: (id: string) => void | Promise<void> }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const [cart, setCart] = useState<string[]>([]);
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) {
      setCart([]);
      setName('');
    }
  }, [open]);
  const byId = useMemo(() => new Map(s.exercises.map((e) => [e.id, e])), [s.exercises]);
  const added = useMemo(() => new Map(cart.map((id) => [id, 1])), [cart]);
  const picked = cart.map((id) => byId.get(id)).filter((e): e is Exercise => !!e);
  const auto = autoWorkoutName(picked.map((e) => ({ name: e.name, primaryMuscles: e.primaryMuscles })));
  const done = async () => {
    const id = await run((d) => saveCustomWorkout(d, { id: null, name, exercises: picked.map((e) => customDefaults(e)) }));
    if (id) await onSaved(id);
  };
  return (
    <ExercisePickerSheet
      open={open}
      title={title}
      added={added}
      onPick={(e) => setCart((c) => (c.includes(e.id) || c.length >= 20 ? c : [...c, e.id]))}
      onRemove={(e) => setCart((c) => c.filter((x) => x !== e.id))}
      onClose={onClose}
      header={
        <>
          <TextField label="Название (необязательно)" placeholder={cart.length ? auto : 'Придумается само по упражнениям'} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          {s.customWorkouts.length > 0 && (
            <div className="stack tight">
              <span className="t-small">Добавить из своих — все упражнения тренировки разом:</span>
              <div className="chips">
                {s.customWorkouts.map((w) => (
                  <Chip key={w.id} pressed={false} onClick={() => setCart((c) => [...c, ...w.exercises.map((e) => e.exerciseId).filter((id, i, a) => byId.has(id) && !c.includes(id) && a.indexOf(id) === i)].slice(0, 20))}>+ {w.name}</Chip>
                ))}
              </div>
            </div>
          )}
        </>
      }
      footer={
        <>
          {banner}
          {picked.length > 0 && <p className="t-small">{picked.map((e) => e.name).join(' · ')}</p>}
          <Button block icon="check" disabled={busy || picked.length === 0} onClick={() => void done()}>{picked.length === 0 ? 'Выбери упражнения' : `${doneLabel} · ${exWord(picked.length)}`}</Button>
        </>
      }
    />
  );
}

/** One saved own workout: start (or continue) in one tap, edit in the builder. */
function OwnWorkoutCard({ w, highlight, busy, onStart }: { w: CustomWorkout; highlight: boolean; busy: boolean; onStart: (w: CustomWorkout, openId: string | null) => void }) {
  const { snapshot: s } = useData();
  const running = s.workouts.find((x) => x.inProgress && x.customWorkoutId === w.id);
  const names = w.exercises.map((e) => s.exercises.find((x) => x.id === e.exerciseId)?.name).filter(Boolean) as string[];
  return (
    <Card className={highlight ? 'own-new' : ''} id={`own-${w.id}`}>
      <div className="stack tight">
        <div className="row between">
          <div className="grow">
            <div className="t-h3">{w.name}</div>
            <div className="t-small">{exWord(w.exercises.length)} · {running ? 'идёт сейчас' : w.lastUsedOn ? `последний раз ${formatDateShort(w.lastUsedOn)}` : 'ещё не делал'}</div>
          </div>
          {highlight && <Badge>Новая</Badge>}
          <IconButton icon="edit" label={`Изменить: ${w.name}`} tone="ghost" onClick={() => go(`training/builder/${w.id}`)} />
        </div>
        <p className="t-small">{names.slice(0, 4).join(', ')}{names.length > 4 ? ` и ещё ${names.length - 4}` : ''}</p>
        <Button size="sm" icon="play" disabled={busy} onClick={() => onStart(w, running?.id ?? null)}>{running ? 'Продолжить' : 'Начать'}</Button>
      </div>
    </Card>
  );
}

/**
 * The training tab in «Своя программа» mode: «Собрать тренировку», «Добавить из своих» and the own workouts (what was done is in «История»).
 * The program is on pause and is never changed.
 */
export function OwnModeView() {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const [building, setBuilding] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const start = async (w: CustomWorkout, openId: string | null) => {
    if (openId) return go(`workout/${openId}`);
    const sid = await run((d) => startCustomWorkout(d, w.id));
    if (sid) go(`workout/${sid}`);
  };
  useEffect(() => {
    if (fresh) setTimeout(() => document.getElementById(`own-${fresh}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
  }, [fresh]);
  return (
    <>
      <Button block icon="plus" onClick={() => setBuilding(true)}>Собрать тренировку</Button>
      {s.customWorkouts.length > 0 && <Button block variant="secondary" icon="history" onClick={() => setChoosing(true)}>Добавить из своих</Button>}
      {banner}
      <div className="section-title"><h2 className="t-h3">Мои тренировки</h2></div>
      {s.customWorkouts.length === 0 ? (
        <Card flat><EmptyState icon="training" title="Пока нет своих тренировок" text="Нажми «Собрать тренировку», отметь упражнения и нажми «Готово». Хватит и одного упражнения." /></Card>
      ) : (
        <div className="stack">
          {s.customWorkouts.map((w) => <OwnWorkoutCard key={w.id} w={w} highlight={w.id === fresh} busy={busy} onStart={(x, openId) => void start(x, openId)} />)}
        </div>
      )}
      <BuildCartSheet open={building} onClose={() => setBuilding(false)} onSaved={(id) => { setBuilding(false); setFresh(id); }} />
      <OwnWorkoutsSheet open={choosing} onClose={() => setChoosing(false)} />
    </>
  );
}

/**
 * Own workouts from the program mode. With `replaces` it puts an own workout in place of that program
 * workout: when it is finished, the program one is marked done with a note («Заменена своей»).
 */
export function OwnWorkoutsSheet({ open, replaces, label, onClose }: { open: boolean; replaces?: PlannedSession | null; label?: string; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const [building, setBuilding] = useState(false);
  if (!open) return null;
  const begin = async (id: string, openId: string | null) => {
    if (openId && !replaces) {
      onClose();
      return go(`workout/${openId}`);
    }
    const sid = await run((d) => startCustomWorkout(d, id, replaces ? { replaces: replaces.id } : {}));
    if (sid) {
      onClose();
      go(`workout/${sid}`);
    }
  };
  return (
    <>
      <Sheet open={!building} title={replaces ? 'Своя вместо программы' : 'Свои тренировки'} onClose={onClose}>
        <div className="stack">
          <p className="t-small">{replaces ? `Вместо «${label ?? 'тренировки программы'}». Когда закончишь свою, тренировка программы отметится выполненной с пометкой «своя». Программа не меняется.` : 'Тренировки не по программе: собери, сохрани и повторяй. Программа и календарь не меняются, веса считаются по той же истории.'}</p>
          {banner}
          <Button block icon="plus" onClick={() => setBuilding(true)}>Собрать тренировку</Button>
          {s.customWorkouts.length > 0 ? (
            <div className="list">
              {s.customWorkouts.map((w) => {
                const running = s.workouts.find((x) => x.inProgress && x.customWorkoutId === w.id);
                return (
                  <div key={w.id} className="list-item pick-row own-row">
                    <button type="button" className="pick-main" disabled={busy} onClick={() => void begin(w.id, running?.id ?? null)}>
                      <span className="li-title">{w.name}</span>
                      <span className="li-sub">{exWord(w.exercises.length)} · {running ? 'идёт сейчас' : w.lastUsedOn ? `последний раз ${formatDateShort(w.lastUsedOn)}` : 'ещё не делал'}</span>
                    </button>
                    <IconButton icon="edit" label={`Изменить: ${w.name}`} tone="ghost" onClick={() => { onClose(); go(`training/builder/${w.id}`); }} />
                    <button type="button" className="pick-add" aria-label={`${running && !replaces ? 'Продолжить' : 'Начать'}: ${w.name}`} disabled={busy} onClick={() => void begin(w.id, running?.id ?? null)}><Icon name="play" size={18} /></button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="note">Своих тренировок пока нет.</p>
          )}
        </div>
      </Sheet>
      <BuildCartSheet
        open={building}
        doneLabel={replaces ? 'Готово, начать' : 'Готово'}
        onClose={() => setBuilding(false)}
        onSaved={async (id) => {
          setBuilding(false);
          if (replaces) await begin(id, null);
        }}
      />
    </>
  );
}
