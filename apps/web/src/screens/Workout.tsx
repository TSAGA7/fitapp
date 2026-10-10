import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REST_FINISH_MESSAGE, REST_PHRASES, rankSubstitutes, restCue, suggestRestSeconds, type BodyArea, type PainAdvice, type ReplacementReason, type Side } from '@fitapp/domain';
import { abandonWorkout, addSetToExercise, finishWorkout, loadWorkout, logSet, reportPain, replaceExerciseInSession, saveExerciseNote, skipSet, undoSet, type WorkoutExerciseView, type WorkoutView } from '../actions';
import { useData } from '../app/DataContext';
import { safetyContext } from '../app/derive';
import { fmt } from '../app/format';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Badge, Button, Card, Chip, Icon, IconButton, ListItem, ProgressBar, Sheet, TextField } from '../ui';
import { TvaGuideBody } from './TvaGuide';
import { parseDecimal } from './shared';
import { ActivityBar, WorkoutSummaryCard } from './WorkoutActivity';
import { useActivityBar } from '../app/prefs';

const VACUUM_KEYS = new Set(['vacuum_standing', 'vacuum_quadruped', 'vacuum_lying', 'breathing_90_90']);

interface RestState {
  endsAt: number;
  total: number;
  reason: string;
  phrase: number;
  /** Seconds left while the timer is paused, otherwise null. */
  pausedLeft: number | null;
}

const AREA_LABELS: Record<BodyArea, string> = { shoulder: 'Плечо', elbow: 'Локоть', wrist: 'Запястье', neck: 'Шея', upper_back: 'Верх спины', lower_back: 'Поясница', hip: 'Таз', knee: 'Колено', ankle: 'Голеностоп', other: 'Другое' };
const SIDE_LABELS: Record<Side, string> = { left: 'Слева', right: 'Справа', both: 'Обе' };
const REASON_LABELS: Record<ReplacementReason, string> = { machine_busy: 'Тренажёр занят', equipment_unavailable: 'Нет оборудования', discomfort: 'Дискомфорт', preference: 'Хочу другое' };
const RIR_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [{ value: 0, label: '0' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4+' }];

export function Workout({ sessionId }: { sessionId: string }) {
  const { act } = useData();
  const { run, ok, banner, busy } = useCommand();
  const [view, setView] = useState<WorkoutView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const barOn = useActivityBar();
  // Exercise blocks: any number can be open at once. The first unfinished one is open at the start; a finished one folds and the next opens.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const settledRef = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    if (!view) return;
    const finished = new Map(view.exercises.map((e) => [e.se.id, e.plan.length > 0 && settledSets(e) >= e.plan.length]));
    const prev = settledRef.current;
    settledRef.current = finished;
    if (prev === null) {
      const first = view.exercises.find((e) => !finished.get(e.se.id));
      if (first) setOpenIds(new Set([first.se.id]));
      return;
    }
    const justDone = view.exercises.filter((e) => finished.get(e.se.id) && prev.get(e.se.id) === false);
    if (justDone.length === 0) return;
    setOpenIds((cur) => {
      const next = new Set(cur);
      for (const e of justDone) next.delete(e.se.id);
      const after = view.exercises.slice(view.exercises.indexOf(justDone[justDone.length - 1] as WorkoutExerciseView) + 1).find((e) => !finished.get(e.se.id)) ?? view.exercises.find((e) => !finished.get(e.se.id));
      if (after) next.add(after.se.id);
      return next;
    });
  }, [view]);
  const toggle = (id: string) => setOpenIds((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const reload = useCallback(async () => {
    try {
      setView(await act((d) => loadWorkout(d, sessionId)));
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    }
  }, [act, sessionId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (failed) return <main className="screen"><div className="errbox" role="alert">{failed}</div><Button onClick={() => go('training')}>К тренировкам</Button></main>;
  if (!view) return <main className="screen" aria-busy="true"><p className="note">Загружаю тренировку…</p></main>;

  const totalSets = view.exercises.reduce((n, e) => n + Math.max(e.plan.length, 0), 0);
  const doneSets = view.exercises.reduce((n, e) => n + e.logs.filter((l) => l.setType === 'working' && l.status !== 'skipped').length, 0);
  const readOnly = view.session.status !== 'in_progress';

  const mutate = async (fn: Parameters<typeof ok>[0], restSec?: number | null, reason = '') => {
    if (await ok(fn)) {
      if (restSec) setRest({ endsAt: Date.now() + restSec * 1000, total: restSec, reason, phrase: Math.floor(Math.random() * REST_PHRASES.length), pausedLeft: null });
      await reload();
    }
  };

  if (celebrate) {
    return (
      <main className="screen workout">
        <WorkoutSummaryCard sessionId={sessionId} title={REST_FINISH_MESSAGE} />
        <p className="t-body" style={{ textAlign: 'center' }}>Записано: {doneSets} из {totalSets} подходов.</p>
        <Button block onClick={() => go('training')}>К тренировкам</Button>
      </main>
    );
  }

  return (
    <main className={`screen workout ${rest !== null ? 'has-rest' : ''}`}>
      <header className="screen-head">
        <div className="back">
          <IconButton icon="chevronLeft" label="К тренировкам" tone="ghost" onClick={() => go('training')} />
          <h1 className="t-h2">{view.label}</h1>
        </div>
        {readOnly ? <Badge tone="neutral">{view.session.status === 'completed' ? 'Завершена' : 'Прервана'}</Badge> : <Badge>{doneSets}/{totalSets}</Badge>}
      </header>
      <ProgressBar value={totalSets > 0 ? doneSets / totalSets : 0} label="Прогресс тренировки" />
      {barOn && !readOnly && <ActivityBar view={view} doneSets={doneSets} totalSets={totalSets} />}
      {readOnly && view.session.status === 'completed' && <WorkoutSummaryCard sessionId={sessionId} />}
      {banner}

      {view.exercises.map((ev) => (
        <ExerciseCard key={ev.se.id} ev={ev} readOnly={readOnly} busy={busy} mutate={mutate} run={run} reload={reload} open={openIds.has(ev.se.id)} onToggle={() => toggle(ev.se.id)} />
      ))}

      {!readOnly && (
        <div className="stack">
          <Button block icon="check" onClick={() => setFinishing(true)}>Завершить тренировку</Button>
          <Button block variant="text" disabled={busy} onClick={async () => { if (await ok((d) => abandonWorkout(d, sessionId))) go('training'); }}>Прервать без сохранения итогов</Button>
        </div>
      )}
      {readOnly && <Button block variant="secondary" onClick={() => go('training')}>К тренировкам</Button>}
      {rest !== null && <RestPanel rest={rest} onChange={setRest} onDone={() => setRest(null)} />}
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} doneSets={doneSets} totalSets={totalSets} onFinish={async (note) => { if (await ok((d) => finishWorkout(d, sessionId, note))) { setFinishing(false); setRest(null); setCelebrate(true); } }} />
    </main>
  );
}

const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** Rest countdown as a window over the exercises (it can be folded to a small pill): cues at 7 s and 5 s, a random phrase on the last second; can be paused. */
function RestPanel({ rest, onChange, onDone }: { rest: RestState; onChange: (r: RestState) => void; onDone: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [mini, setMini] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const paused = rest.pausedLeft !== null;
  const left = paused ? (rest.pausedLeft as number) : Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
  const cue = paused ? 'Пауза' : restCue(left, () => (rest.phrase + 0.5) / REST_PHRASES.length);
  const adjust = (delta: number) => {
    if (paused) onChange({ ...rest, pausedLeft: Math.max(1, left + delta), total: Math.max(15, rest.total + delta) });
    else onChange({ ...rest, endsAt: Math.max(Date.now() + 1000, rest.endsAt + delta * 1000), total: Math.max(15, rest.total + delta) });
  };
  const toggle = () => (paused ? onChange({ ...rest, pausedLeft: null, endsAt: Date.now() + left * 1000 }) : onChange({ ...rest, pausedLeft: left }));
  if (mini) {
    return (
      <button type="button" className="rest-float rest-mini" role="timer" aria-live="off" aria-label={`Перерыв, осталось ${clock(left)}. Развернуть`} onClick={() => setMini(false)}>
        <Icon name="clock" size={18} />
        <span className="rest-mini-time">{clock(left)}</span>
        <span className="t-small">{paused ? 'пауза' : left === 0 ? 'пора!' : 'перерыв'}</span>
      </button>
    );
  }
  return (
    <div className="rest-float" role="timer" aria-live="off">
      <div className="rest-top">
        <span className="row"><Icon name="clock" size={18} /> <span className="t-caption">Перерыв{rest.reason ? ` · ${rest.reason}` : ''}</span></span>
        <Button size="sm" variant="text" onClick={() => setMini(true)}>Свернуть</Button>
      </div>
      <div className="rest-main">
        <div className="rest-time" aria-label={`Осталось ${clock(left)}`}>{clock(left)}</div>
        <div className="rest-adjust">
          <Button size="sm" variant="secondary" onClick={() => adjust(-15)}>−15 с</Button>
          <Button size="sm" variant="secondary" onClick={() => adjust(15)}>+15 с</Button>
        </div>
      </div>
      <ProgressBar value={rest.total > 0 ? 1 - left / rest.total : 1} label="Прогресс перерыва" />
      <div className="rest-cue t-h3" role="status" aria-live="polite">{cue ?? (left === 0 ? 'Пора!' : '\u00a0')}</div>
      <div className="row">
        <Button block variant="secondary" icon={paused ? 'play' : 'clock'} onClick={toggle}>{paused ? 'Продолжить' : 'Пауза'}</Button>
        <Button block onClick={onDone}>Завершить</Button>
      </div>
    </div>
  );
}

function FinishSheet({ open, onClose, doneSets, totalSets, onFinish }: { open: boolean; onClose: () => void; doneSets: number; totalSets: number; onFinish: (note: string | null) => Promise<void> }) {
  const [note, setNote] = useState('');
  return (
    <Sheet open={open} title="Завершить тренировку" onClose={onClose}>
      <div className="stack">
        <p className="t-body">Выполнено {doneSets} из {totalSets} рабочих подходов. Следующий вес рассчитается по фактическим данным, а не по плану.</p>
        <TextField label="Заметка (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button block onClick={() => void onFinish(note.trim() || null)}>Сохранить и завершить</Button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ exercise card

interface CardProps {
  ev: WorkoutExerciseView;
  readOnly: boolean;
  busy: boolean;
  mutate: (fn: Parameters<ReturnType<typeof useCommand>['ok']>[0], rest?: number | null, reason?: string) => Promise<void>;
  run: ReturnType<typeof useCommand>['run'];
  reload: () => Promise<void>;
  open: boolean;
  onToggle: () => void;
}

/** Sets of the plan that are settled (done or skipped): the exercise is finished when all of them are. */
export const settledSets = (ev: WorkoutExerciseView): number => ev.plan.filter((p) => ev.logs.some((l) => l.setType === 'working' && l.setNo === p.setNo)).length;

function ExerciseCard({ ev, readOnly, busy, mutate, run, open, onToggle }: CardProps) {
  const { snapshot: s } = useData();
  const { se, exercise, plan, logs } = ev;
  const working = logs.filter((l) => l.setType === 'working');
  const logOf = (setNo: number) => working.find((l) => l.setNo === setNo);
  const nextNo = useMemo(() => {
    for (let i = 1; i <= plan.length; i++) if (!logOf(i)) return i;
    return plan.length + 1;
  }, [plan.length, logs]);
  const target = plan.find((p) => p.setNo === nextNo) ?? plan[plan.length - 1];
  const contextKey = plan[0]?.contextKey ?? target?.contextKey ?? `${exercise.id}::${se.variantKey}`;

  const [weight, setWeight] = useState<string>('');
  const [reps, setReps] = useState<string>('');
  const [rir, setRir] = useState<number | null>(null);
  const lastNo = useRef(0);
  // Fill the editor with the prescription of the next set whenever the set changes.
  useEffect(() => {
    if (lastNo.current === nextNo) return;
    lastNo.current = nextNo;
    const prev = logOf(nextNo - 1);
    const w = prev?.actualWeightKg ?? target?.targetWeightKg ?? null;
    setWeight(w === null ? '' : fmt(w, 2));
    setReps(String(target?.repMax ?? 10));
    setRir(exercise.progressionType === 'time' ? 3 : null);
  }, [nextNo, target?.id]);

  const [painOpen, setPainOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [advice, setAdvice] = useState<PainAdvice | null>(null);

  const step = ev.stepKg > 0 ? ev.stepKg : 2.5;
  const w = weight.trim() === '' ? null : parseDecimal(weight);
  const r = parseDecimal(reps);
  const bump = (delta: number) => {
    const cur = w ?? 0;
    let next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    if (ev.maxKg !== null) next = Math.min(next, ev.maxKg);
    setWeight(fmt(next, 2));
  };
  const canLog = !readOnly && !busy && rir !== null && Number.isFinite(r) && r >= 1 && (weight.trim() === '' || (w !== null && Number.isFinite(w) && w >= 0));
  const base = { sessionExerciseId: se.id, exerciseId: exercise.id, variantKey: se.variantKey, contextKey, plannedSetId: target?.id ?? null };

  const [restOverride, setRestOverride] = useState<number | null>(null);
  useEffect(() => setRestOverride(null), [nextNo]);
  const timed = exercise.progressionType === 'time';
  const suggestion = suggestRestSeconds({
    baseSec: target?.restSec ?? exercise.defaultRestSec,
    isCompound: exercise.isCompound,
    light: timed || (exercise.loadUnit === 'bodyweight' && !exercise.isCompound),
    setNo: nextNo,
    reps: Number.isFinite(r) ? r : 0,
    rir,
    repMin: target?.repMin ?? 1,
    targetRir: target?.targetRir ?? { min: 2, max: 3 },
    daysSinceLast: ev.daysSinceLast,
    trend: ev.trend,
  });
  const restSec = restOverride ?? suggestion.seconds;
  const [noteOpen, setNoteOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const unit = timed ? ' с' : '';
  const settled = settledSets(ev);
  const allSettled = plan.length > 0 && settled >= plan.length;
  const headline = allSettled
    ? 'Все подходы выполнены'
    : `${se.replacedFromExerciseId ? 'Замена · ' : ''}Подход ${nextNo}: ${target ? (target.targetWeightKg === null || exercise.loadUnit === 'seconds' ? (timed ? 'удержание' : 'без веса') : `${fmt(target.targetWeightKg, 2)} кг`) : ''} × ${target ? (target.repMin === target.repMax ? target.repMin : `${target.repMin}–${target.repMax}`) : ''}${unit}`;

  return (
    <Card className={`ex-acc ${open ? 'open' : ''}`}>
      <button type="button" className="ex-head" aria-expanded={open} onClick={onToggle}>
        <span className="ex-title">
          <span className="t-h3">{exercise.name}</span>
          <span className="t-small">{headline}</span>
        </span>
        {allSettled ? <Badge>Готово</Badge> : <Badge tone="neutral">{settled}/{plan.length}</Badge>}
        <span className="ex-chev" aria-hidden="true"><Icon name="chevronRight" size={20} /></span>
      </button>
      <div className="stack ex-body" hidden={!open}>
        {ev.reasonText && !(ev.reasonCode === 'first_execution_choose_weight' && (exercise.loadUnit === 'seconds' || exercise.loadUnit === 'bodyweight')) && <p className="t-small"><Icon name="info" size={14} /> {ev.reasonText}</p>}
        {ev.reminders.map((n) => (
          <div key={n.id} className="note-reminder" role="note">
            <b className="t-caption">Заметка с прошлого раза</b>
            <div className="t-body">{n.text}</div>
          </div>
        ))}
        {ev.ownNote && <p className="t-small"><Icon name="edit" size={14} /> {ev.ownNote.text}</p>}

        <div className="list">
          {plan.map((p) => {
            const l = logOf(p.setNo);
            const current = !readOnly && p.setNo === nextNo;
            return (
              <div key={p.id} className="set-row" aria-current={current ? 'step' : undefined}>
                <span className="t-caption">Подход {p.setNo}</span>
                <span className="t-small">{p.targetWeightKg === null || exercise.loadUnit === 'seconds' ? (timed ? 'удержание' : 'без веса') : `${fmt(p.targetWeightKg, 2)} кг`} × {p.repMin === p.repMax ? p.repMin : `${p.repMin}–${p.repMax}`}{unit}, запас {p.targetRir.min}–{p.targetRir.max}</span>
                {l && l.status === 'done' && (
                  <span className="row">
                    <b className="t-body">{l.actualWeightKg === null ? '' : `${fmt(l.actualWeightKg, 2)} × `}{l.actualReps}{unit} · RIR {l.actualRir}</b>
                    {!readOnly && <IconButton icon="close" label="Отменить подход" tone="ghost" onClick={() => void mutate((d) => undoSet(d, se.id, p.setNo))} />}
                  </span>
                )}
                {l && l.status === 'skipped' && (
                  <span className="row">
                    <Badge tone={l.skipReason === 'pain' ? 'danger' : 'neutral'}>{l.skipReason === 'pain' ? 'Боль' : 'Пропущен'}</Badge>
                    {!readOnly && <Button size="sm" variant="text" icon="swap" disabled={busy} onClick={() => void mutate((d) => undoSet(d, se.id, p.setNo))}>Вернуть</Button>}
                  </span>
                )}
              </div>
            );
          })}
          {working.filter((l) => l.setNo > plan.length && l.status === 'done').map((l) => (
            <div key={l.id} className="set-row"><span className="t-caption">Доп. {l.setNo}</span><b className="t-body">{l.actualWeightKg === null ? '' : `${fmt(l.actualWeightKg, 2)} × `}{l.actualReps} · RIR {l.actualRir}</b></div>
          ))}
        </div>

        {!readOnly && (
          <div className="stack">
            <div className="t-caption">{nextNo <= plan.length ? `Подход ${nextNo}` : 'Дополнительный подход'}</div>
            {exercise.loadUnit !== 'seconds' && (
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <IconButton icon="minus" label="Меньше веса" onClick={() => bump(-step)} />
                <div className="grow"><TextField label={exercise.loadUnit === 'bodyweight' ? 'Доп. вес (необязательно)' : 'Вес'} unit="кг" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
                <IconButton icon="plus" label="Больше веса" onClick={() => bump(step)} />
              </div>
            )}
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <IconButton icon="minus" label="Меньше повторений" onClick={() => setReps(String(Math.max(1, (Number.isFinite(r) ? r : 1) - 1)))} />
              <div className="grow"><TextField label={timed ? 'Секунды' : 'Повторения'} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} /></div>
              <IconButton icon="plus" label="Больше повторений" onClick={() => setReps(String((Number.isFinite(r) ? r : 0) + 1))} />
            </div>
            <div className="rir-block">
              <div className="t-caption">Сколько повторений ещё мог бы сделать (RIR)</div>
              <div className="chips" role="group" aria-label="RIR">
                {RIR_OPTIONS.map((o) => <Chip key={o.value} pressed={rir === o.value} onClick={() => setRir(o.value)}>{o.label}</Chip>)}
              </div>
            </div>
            <div className="row between rest-pick">
              <span className="t-small">Перерыв {clock(restSec)}{restOverride === null ? ` · ${suggestion.reason}` : ' · вручную'}</span>
              <span className="row">
                <IconButton icon="minus" label="Меньше отдыха" tone="ghost" onClick={() => setRestOverride(Math.max(15, restSec - 15))} />
                <IconButton icon="plus" label="Больше отдыха" tone="ghost" onClick={() => setRestOverride(Math.min(600, restSec + 15))} />
              </span>
            </div>
            <Button block icon="clock" disabled={!canLog} onClick={() => void mutate((d) => logSet(d, { ...base, setNo: nextNo, weightKg: w, reps: r, rir, restSec }), restSec, restOverride === null ? suggestion.reason : 'вручную')}>Перерыв · {clock(restSec)}</Button>
            <Button block variant="text" disabled={!canLog} onClick={() => void mutate((d) => logSet(d, { ...base, setNo: nextNo, weightKg: w, reps: r, rir, restSec: null }))}>Записать без перерыва</Button>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button size="sm" variant="text" icon="skip" disabled={busy} onClick={() => void mutate((d) => skipSet(d, { ...base, setNo: nextNo, reason: 'fatigue' }))}>Пропустить подход</Button>
              <Button size="sm" variant="text" icon="alert" onClick={() => setPainOpen(true)}>Боль</Button>
              <Button size="sm" variant="text" icon="plus" disabled={busy} onClick={() => void mutate((d) => addSetToExercise(d, se.id))}>Добавить подход</Button>
              <Button size="sm" variant="text" icon="swap" onClick={() => setSwapOpen(true)}>Заменить</Button>
              <Button size="sm" variant="text" icon="edit" onClick={() => setNoteOpen(true)}>Заметка</Button>
              {VACUUM_KEYS.has(exercise.key) && <Button size="sm" variant="text" icon="info" onClick={() => setGuideOpen(true)}>Как это работает</Button>}
            </div>
          </div>
        )}
      </div>

      <PainSheet
        open={painOpen}
        advice={advice}
        onClose={() => { setPainOpen(false); setAdvice(null); }}
        onSubmit={async (area, side, intensity, note) => {
          const a = await run((d) => reportPain(d, { ...base, setNo: nextNo, area, side, intensity, note }));
          if (a) setAdvice(a);
        }}
        onReplace={() => { setPainOpen(false); setAdvice(null); setSwapOpen(true); }}
        onAfter={() => void mutate(async () => undefined)}
      />
      <NoteSheet
        open={noteOpen}
        title={exercise.name}
        initial={ev.ownNote?.text ?? ''}
        onClose={() => setNoteOpen(false)}
        onSave={async (text) => { setNoteOpen(false); await mutate((d) => saveExerciseNote(d, { sessionId: se.sessionId, exerciseId: exercise.id, text })); }}
      />
      <Sheet open={guideOpen} title="Поперечная мышца живота" onClose={() => setGuideOpen(false)}><TvaGuideBody /></Sheet>
      <SwapSheet
        open={swapOpen}
        ev={ev}
        ctxNow={s.today}
        onClose={() => setSwapOpen(false)}
        onPick={async (newExerciseId, reason) => { setSwapOpen(false); await mutate((d) => replaceExerciseInSession(d, { sessionExerciseId: se.id, newExerciseId, reason })); }}
      />
    </Card>
  );
}

function NoteSheet({ open, title, initial, onClose, onSave }: { open: boolean; title: string; initial: string; onClose: () => void; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(initial);
  useEffect(() => { if (open) setText(initial); }, [open, initial]);
  return (
    <Sheet open={open} title={`Заметка: ${title}`} onClose={onClose}>
      <div className="stack">
        <p className="t-small">Например: «тяжело, лёгкий дискомфорт, следи за плечом». Напоминание появится один раз — на следующей тренировке с этим упражнением.</p>
        <TextField label="Заметка" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
        <Button block onClick={() => void onSave(text)}>Сохранить</Button>
        {initial && <Button block variant="text" onClick={() => void onSave('')}>Удалить заметку</Button>}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ pain & swap

function PainSheet({ open, advice, onClose, onSubmit, onReplace, onAfter }: { open: boolean; advice: PainAdvice | null; onClose: () => void; onSubmit: (area: BodyArea, side: Side, intensity: number | null, note: string | null) => Promise<void>; onReplace: () => void; onAfter: () => void }) {
  const [area, setArea] = useState<BodyArea | null>(null);
  const [side, setSide] = useState<Side>('both');
  const [intensity, setIntensity] = useState<number | null>(null);
  return (
    <Sheet open={open} title={advice ? advice.headline : 'Появилась боль?'} onClose={() => { onClose(); if (advice) onAfter(); }}>
      <div className="stack">
        {advice ? (
          <>
            <ul className="t-body">{advice.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            {advice.seekMedical && <div className="errbox" role="alert">Покажись врачу или физиотерапевту. Приложение не ставит диагнозы.</div>}
            <Button block icon="swap" onClick={() => { onReplace(); onAfter(); }}>Подобрать замену</Button>
            <Button block variant="secondary" onClick={() => { onClose(); onAfter(); }}>Закрыть</Button>
          </>
        ) : (
          <>
            <p className="t-small">Мышечное жжение и усталость — не боль в суставе. Если болит сустав или спина, останови движение.</p>
            <div className="chips" role="group" aria-label="Где болит">
              {(Object.keys(AREA_LABELS) as BodyArea[]).map((a) => <Chip key={a} pressed={area === a} onClick={() => setArea(a)}>{AREA_LABELS[a]}</Chip>)}
            </div>
            <div className="chips" role="group" aria-label="Сторона">
              {(Object.keys(SIDE_LABELS) as Side[]).map((x) => <Chip key={x} pressed={side === x} onClick={() => setSide(x)}>{SIDE_LABELS[x]}</Chip>)}
            </div>
            <div>
              <div className="t-caption">Сила боли, 1–10 (если знаешь)</div>
              <div className="chips" role="group" aria-label="Сила боли">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <Chip key={n} pressed={intensity === n} onClick={() => setIntensity(intensity === n ? null : n)}>{n}</Chip>)}
              </div>
            </div>
            <Button block variant="danger" disabled={area === null} onClick={() => void onSubmit(area as BodyArea, side, intensity, null)}>Записать и остановить упражнение</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function SwapSheet({ open, ev, ctxNow, onClose, onPick }: { open: boolean; ev: WorkoutExerciseView; ctxNow: string; onClose: () => void; onPick: (exerciseId: string, reason: ReplacementReason) => Promise<void> }) {
  const { snapshot: s } = useData();
  const [reason, setReason] = useState<ReplacementReason>('machine_busy');
  if (!open) return null;
  const subs = rankSubstitutes(ev.exercise, s.exercises.filter((e) => e.deletedAt === null), safetyContext(s, `${ctxNow}T12:00:00.000Z`), 10);
  return (
    <Sheet open title={`Заменить: ${ev.exercise.name}`} onClose={onClose}>
      <div className="stack">
        <div className="chips" role="group" aria-label="Причина">
          {(Object.keys(REASON_LABELS) as ReplacementReason[]).map((k) => <Chip key={k} pressed={reason === k} onClick={() => setReason(k)}>{REASON_LABELS[k]}</Chip>)}
        </div>
        <p className="t-small">Замена действует только в этой тренировке, программа не меняется. Вес для нового упражнения рассчитается с калибровочного подхода.</p>
        <div className="list">
          {subs.map((x) => (
            <ListItem key={x.exercise.id} icon={x.assessment.status === 'caution' ? 'alert' : 'training'} title={x.exercise.name} subtitle={x.assessment.status === 'caution' ? `Осторожно: ${x.assessment.conditions[0] ?? 'следи за техникой'}` : x.curated ? 'Рекомендованная замена' : 'Похожее движение'} onClick={() => void onPick(x.exercise.id, reason)} />
          ))}
          {subs.length === 0 && <p className="note">Подходящих замен не найдено.</p>}
        </div>
      </div>
    </Sheet>
  );
}
