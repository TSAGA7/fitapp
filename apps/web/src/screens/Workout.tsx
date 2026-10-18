import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REST_FINISH_MESSAGE, REST_PHRASES, rankSubstitutes, restCue, suggestRestSeconds, warmupSets, type WarmupPosition, type BodyArea, type PainAdvice, type ReplacementReason, type Side } from '@fitapp/domain';
import { abandonWorkout, addExerciseToSession, addSetToExercise, removeLastSet, canRemoveFromSession, removeExerciseFromSession, saveSessionAsCustomWorkout, changeExerciseVariant, finishWorkout, loadWorkout, logSet, reportPain, replaceExerciseInSession, saveExerciseNote, skipSet, undoSet, type WorkoutExerciseView, type WorkoutView } from '../actions';
import { useData } from '../app/DataContext';
import { safetyContext } from '../app/derive';
import { fmt, fromLift, liftUnit, plural, toLift } from '../app/format';
import { getRestTimer, getWeightUnit, setWeightUnit, useWeightUnit, useWorkoutLayout, type WeightUnit } from '../app/prefs';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Badge, Button, Card, Chip, EmptyState, Icon, IconButton, ListItem, ProgressBar, Sheet, StepperField, TextField } from '../ui';
import { ThemeSheet } from './ThemePicker';
import { ExerciseInfoSheet } from './ExerciseInfo';
import { ExercisePickerSheet } from './ExercisePicker';
import { TvaGuideBody } from './TvaGuide';
import { parseDecimal } from './shared';
import { ActivityBar, WorkoutSummaryCard } from './WorkoutActivity';
import { useActivityBar } from '../app/prefs';

/** Progression notes worth showing during the set (pain, a layoff, the first time); the rest is noise mid-workout. */
const SHOWN_REASONS = /^(pain_|layoff_|first_execution|deload)/;
const VACUUM_KEYS = new Set(['vacuum_standing', 'vacuum_quadruped', 'vacuum_lying', 'breathing_90_90']);

interface RestState {
  endsAt: number;
  total: number;
  reason: string;
  /** What comes after the rest: «Жим платформы · подход 3». */
  next: string;
  phrase: number;
  /** Seconds left while the timer is paused, otherwise null. */
  pausedLeft: number | null;
}

const AREA_LABELS: Record<BodyArea, string> = { shoulder: 'Плечо', elbow: 'Локоть', wrist: 'Запястье', neck: 'Шея', upper_back: 'Верх спины', lower_back: 'Поясница', hip: 'Таз', knee: 'Колено', ankle: 'Голеностоп', other: 'Другое' };
const SIDE_LABELS: Record<Side, string> = { left: 'Слева', right: 'Справа', both: 'Обе' };
const REASON_LABELS: Record<ReplacementReason, string> = { machine_busy: 'Тренажёр занят', equipment_unavailable: 'Нет оборудования', discomfort: 'Дискомфорт', preference: 'Хочу другое' };
const RIR_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [{ value: 0, label: '0' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4+' }];

export function Workout({ sessionId, focus }: { sessionId: string; /** Exercise to open first (just added from the journal). */ focus?: string }) {
  const { act } = useData();
  const { run, ok, banner, busy } = useCommand();
  const [view, setView] = useState<WorkoutView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  // The bottom bar («Перерыв») belongs to one open exercise: the one touched last, otherwise the first open one.
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const barOn = useActivityBar();
  const layout = useWorkoutLayout();
  const [exPick, setExPick] = useState(false);
  // Exercise blocks: any number can be open at once. The first unfinished one (from the top) is open at the start; a finished one folds and the next opens.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const settledRef = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    if (!view) return;
    // An exercise is finished when all its planned sets are recorded or skipped (own workouts too: one more set is added by hand).
    const finished = new Map(view.exercises.map((e) => [e.se.id, e.plan.length > 0 && settledSets(e) >= e.plan.length]));
    const prev = settledRef.current;
    settledRef.current = finished;
    if (prev === null) {
      if (focus && view.exercises.some((e) => e.se.id === focus)) {
        setOpenIds(new Set([focus]));
        setTimeout(() => document.getElementById(`ex-${focus}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
        return;
      }
      // Open the first exercise that is not done yet (in an own workout: its planned sets not all logged), from the top.
      const first = view.exercises.find((e) => !finished.get(e.se.id)) ?? view.exercises[0];
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
  const toggle = (id: string) => setOpenIds((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else { n.add(id); setActiveId(id); } return n; });

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
  const openList = view.exercises.filter((e) => openIds.has(e.se.id)).map((e) => e.se.id);
  const focusMode = layout === 'focus' && view.exercises.length > 0;
  const focusEv = focusMode ? (view.exercises.find((e) => e.se.id === (activeId && openIds.has(activeId) ? activeId : openList[0])) ?? view.exercises.find((e) => !(e.plan.length > 0 && settledSets(e) >= e.plan.length)) ?? view.exercises[0]) : undefined;
  const dockOwner = readOnly ? null : focusEv ? focusEv.se.id : activeId && openIds.has(activeId) ? activeId : (openList[0] ?? null);
  const pickExercise = (id: string) => { setOpenIds(new Set([id])); setActiveId(id); setExPick(false); window.scrollTo({ top: 0 }); };

  const mutate = async (fn: Parameters<typeof ok>[0], restSec?: number | null, reason = '', next = '') => {
    if (await ok(fn)) {
      if (restSec && getRestTimer()) setRest({ endsAt: Date.now() + restSec * 1000, total: restSec, reason, next, phrase: Math.floor(Math.random() * REST_PHRASES.length), pausedLeft: null });
      await reload();
    }
  };

  if (celebrate) {
    return (
      <main className="screen workout">
        <WorkoutSummaryCard sessionId={sessionId} title={REST_FINISH_MESSAGE} />
        <p className="t-body" style={{ textAlign: 'center' }}>Записано: {doneSets} из {totalSets} подходов.</p>
        {doneSets > 0 && <Button block variant="secondary" icon="history" onClick={() => setSaveOpen(true)}>{view.customWorkoutId ? 'Обновить или сохранить как свою' : 'Сохранить как свою, чтобы повторять'}</Button>}
        <Button block onClick={() => go('training')}>К тренировкам</Button>
        <SaveOwnSheet open={saveOpen} view={view} onClose={() => setSaveOpen(false)} />
      </main>
    );
  }

  return (
    <main className={`screen workout wk ${rest !== null ? 'has-rest' : ''} ${dockOwner ? 'has-dock' : ''}`}>
      <header className="wk-top">
        <IconButton icon="chevronLeft" label="К тренировкам" className="wk-round" onClick={() => go('training')} />
        <div className="wk-top-end">
          <IconButton icon="palette" label="Оформление" className="wk-round" onClick={() => setThemeOpen(true)} />
          {readOnly
            ? <span className="wk-pill">{view.session.status === 'completed' ? 'Завершена' : 'Прервана'}</span>
            : <span className="wk-pill" aria-label={`Выполнено ${doneSets} из ${totalSets} подходов`}><b>{doneSets}</b>/{totalSets} подх.</span>}
        </div>
      </header>
      <div className="wk-hero">
        <h1 className="wk-title">{view.label}</h1>
        {!readOnly && totalSets > 0 && <p className="wk-sub">{doneSets === 0 ? `${view.exercises.length} ${plural(view.exercises.length, ['упражнение', 'упражнения', 'упражнений'])} · ${totalSets} ${plural(totalSets, ['подход', 'подхода', 'подходов'])}` : doneSets >= totalSets ? 'Все запланированные подходы сделаны' : `Сделано ${doneSets} из ${totalSets} подходов`}</p>}
        {!readOnly && <ProgressBar value={totalSets > 0 ? doneSets / totalSets : 0} label="Прогресс тренировки" />}
      </div>
      {barOn && !readOnly && <ActivityBar view={view} doneSets={doneSets} totalSets={totalSets} />}
      {readOnly && view.session.status === 'completed' && <WorkoutSummaryCard sessionId={sessionId} />}
      {banner}

      {view.exercises.length === 0 && (
        <Card flat><EmptyState icon="training" title={readOnly ? 'Упражнений не было' : 'Добавь первое упражнение'} text={readOnly ? undefined : 'Выбирай упражнения по ходу тренировки: вес подставится из истории, подходы и повторения можно поменять.'} /></Card>
      )}
      {focusMode && focusEv && (
        <button type="button" className="wk-ex-select" aria-haspopup="dialog" onClick={() => setExPick(true)}>
          <span className="wk-num">{view.exercises.indexOf(focusEv) + 1}</span>
          <span className="grow">
            <span className="wk-ex-select-l">Упражнение {view.exercises.indexOf(focusEv) + 1} из {view.exercises.length}</span>
            <span className="wk-ex-select-v">{focusEv.exercise.name}</span>
          </span>
          <Icon name="chevronDown" size={22} />
        </button>
      )}
      {(focusMode ? view.exercises.filter((e) => e === focusEv) : view.exercises).map((ev) => ({ ev, idx: view.exercises.indexOf(ev) })).map(({ ev, idx }) => (
        <ExerciseCard key={ev.se.id} focusMode={focusMode} index={idx + 1} ev={ev} warmPosition={warmPositionOf(view.exercises, idx)} readOnly={readOnly} busy={busy} mutate={mutate} run={run} reload={reload} open={focusMode || openIds.has(ev.se.id)} onToggle={() => toggle(ev.se.id)} removable={!readOnly && canRemoveFromSession(ev, view.custom)} journal={view.custom} dock={ev.se.id === dockOwner ? dock : null} onActivate={() => setActiveId(ev.se.id)} />
      ))}

      {!readOnly && !focusMode && <Button block variant="secondary" icon="plus" onClick={() => setPicking(true)}>Добавить упражнение</Button>}
      {!readOnly && (
        <div className="wk-finish">
          <Button block icon="check" onClick={() => setFinishing(true)}>Завершить тренировку</Button>
          <Button block variant="text" disabled={busy} onClick={async () => { if (await ok((d) => abandonWorkout(d, sessionId))) go('training'); }}>Прервать без сохранения итогов</Button>
        </div>
      )}
      {readOnly && view.session.status === 'completed' && doneSets > 0 && <Button block variant="secondary" icon="history" onClick={() => setSaveOpen(true)}>Сохранить как свою, чтобы повторять</Button>}
      {readOnly && <Button block variant="secondary" onClick={() => go('training')}>К тренировкам</Button>}
      <SaveOwnSheet open={saveOpen} view={view} onClose={() => setSaveOpen(false)} />
      <ExercisePickerSheet
        open={picking}
        title="Добавить в тренировку"
        added={new Map(view.exercises.map((e) => [e.exercise.id, view.exercises.filter((x) => x.exercise.id === e.exercise.id).length]))}
        onPick={async (e) => {
          if (busy) return;
          const id = await run((d) => addExerciseToSession(d, { sessionId, exerciseId: e.id, sets: view.custom ? 1 : undefined }));
          if (id) {
            await reload();
            setOpenIds((cur) => (focusMode ? new Set([id]) : new Set([...cur, id])));
            if (focusMode) { setActiveId(id); setPicking(false); }
            if (view.custom) {
              setPicking(false);
              setTimeout(() => document.getElementById(`ex-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
            }
          }
        }}
        onClose={() => setPicking(false)}
      />
      {rest !== null && <RestPanel rest={rest} onChange={setRest} onDone={() => setRest(null)} />}
      <ThemeSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
      <Sheet open={exPick} title="Упражнения" onClose={() => setExPick(false)}>
        <div className="list">
          {view.exercises.map((e, i) => {
            const done = e.plan.length > 0 && settledSets(e) >= e.plan.length;
            return (
              <button key={e.se.id} type="button" className={`plan-pick ${focusEv === e ? 'on' : ''}`} aria-pressed={focusEv === e} onClick={() => pickExercise(e.se.id)}>
                <span className="wk-num">{done ? <Icon name="check" size={15} strokeWidth={2.8} /> : i + 1}</span>
                <span className="grow"><span className="li-title">{e.exercise.name}</span><span className="li-sub">{done ? 'Готово' : `${settledSets(e)} из ${e.plan.length} подходов`}</span></span>
              </button>
            );
          })}
          {!readOnly && <Button block variant="secondary" icon="plus" onClick={() => { setExPick(false); setPicking(true); }}>Добавить упражнение</Button>}
        </div>
      </Sheet>
      {!readOnly && <div className="wk-dock" ref={setDock} />}
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} doneSets={doneSets} totalSets={totalSets} onFinish={async (note) => { if (await ok((d) => finishWorkout(d, sessionId, note))) { setFinishing(false); setRest(null); setCelebrate(true); } }} />
    </main>
  );
}

const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

const REST_PRESETS = [30, 60, 90, 120, 180, 240, 300] as const;

/** Kilograms or pounds for the weights of this workout (some gyms label plates in lb). Stored weights stay in kg. */
function UnitSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const unit = useWeightUnit();
  const pick = (u: WeightUnit) => { setWeightUnit(u); onClose(); };
  return (
    <Sheet open={open} title="Единицы веса" onClose={onClose}>
      <div className="stack">
        <div className="chips" role="group" aria-label="Единицы веса">
          <Chip pressed={unit === 'kg'} onClick={() => pick('kg')}>Килограммы (кг)</Chip>
          <Chip pressed={unit === 'lb'} onClick={() => pick('lb')}>Фунты (lb)</Chip>
        </div>
        <p className="t-small">Выбери то, что написано на тренажёре или блинах. Меняется только показ и ввод весов в тренировках и силовой статистике: вес тела остаётся в килограммах, а записи хранятся в килограммах и пересчитываются сами (1 кг ≈ 2,2 lb).</p>
      </div>
    </Sheet>
  );
}

/** Type in any rest time. The recommended one stays one tap away: people differ in fitness, so it is advice, not a rule. */
function RestEditSheet({ open, current, recommended, onClose, onPick }: { open: boolean; current: number; recommended: number; onClose: () => void; onPick: (sec: number) => void }) {
  const [min, setMin] = useState('');
  const [sec, setSec] = useState('');
  useEffect(() => {
    if (open) {
      setMin(String(Math.floor(current / 60)));
      setSec(String(current % 60));
    }
  }, [open, current]);
  const total = (Number.parseInt(min || '0', 10) || 0) * 60 + (Number.parseInt(sec || '0', 10) || 0);
  const valid = total >= 10 && total <= 1800;
  return (
    <Sheet open={open} title="Сколько отдыхать" onClose={onClose}>
      <div className="stack">
        <div className="grid-2">
          <TextField label="Минуты" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          <TextField label="Секунды" inputMode="numeric" value={sec} onChange={(e) => setSec(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </div>
        <div className="chips" role="group" aria-label="Быстрый выбор">
          {REST_PRESETS.map((p) => <Chip key={p} pressed={total === p} onClick={() => { setMin(String(Math.floor(p / 60))); setSec(String(p % 60)); }}>{clock(p)}</Chip>)}
        </div>
        {!valid && <p className="t-small">Укажи время от 0:10 до 30:00.</p>}
        <Button block disabled={!valid} onClick={() => onPick(total)}>Готово · {clock(valid ? total : current)}</Button>
        <Button block variant="secondary" onClick={() => onPick(recommended)}>Вернуть рекомендуемое · {clock(recommended)}</Button>
        <p className="t-small">Рекомендуемое время учитывает упражнение, подход, запас повторений и твою историю. Если оно кажется долгим, сократи.</p>
      </div>
    </Sheet>
  );
}

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
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={`rest-float wk-rest ${left === 0 ? 'over' : ''} ${paused ? 'paused' : ''}`} role="timer" aria-live="off">
      <div className="wk-rest-cap">Таймер</div>
      <div className="wk-rest-time" aria-label={`Осталось ${clock(left)}`}>{mm}:{ss}</div>
      <div className="rest-cue" role="status" aria-live="polite">{cue ?? '\u00a0'}</div>
      <div className="wk-rest-ctrl">
        <button type="button" className="wk-rc" aria-label="Свернуть" onClick={() => setMini(true)}><Icon name="chevronDown" size={20} /></button>
        <button type="button" className="wk-rc" aria-label="Минус 15 секунд" onClick={() => adjust(-15)}>−15</button>
        <button type="button" className="wk-rc-main" aria-label={paused ? 'Продолжить' : 'Пауза'} onClick={toggle} style={{ ['--p' as string]: `${rest.total > 0 ? Math.min(1, Math.max(0, 1 - left / rest.total)) * 360 : 360}deg` }}>
          <span className="wk-rc-core"><Icon name={paused ? 'play' : 'pause'} size={26} strokeWidth={2.6} /></span>
        </button>
        <button type="button" className="wk-rc" aria-label="Плюс 15 секунд" onClick={() => adjust(15)}>+15</button>
        <button type="button" className="wk-rc ok" aria-label="Завершить перерыв" onClick={onDone}><Icon name="check" size={20} strokeWidth={2.6} /></button>
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

/** Where the exercise stands for warming up: the first loaded one of the workout, another one, or one whose main muscle is already warm. */
function warmPositionOf(list: readonly WorkoutExerciseView[], idx: number): WarmupPosition {
  const loaded = (e: WorkoutExerciseView) => e.exercise.loadUnit.startsWith('kg') && (e.plan[0]?.targetWeightKg ?? 0) > 0;
  const earlier = list.slice(0, idx).filter(loaded);
  if (earlier.length === 0) return 'first';
  const mine = new Set(list[idx]!.exercise.primaryMuscles);
  return earlier.some((e) => e.exercise.primaryMuscles.some((m) => mine.has(m))) ? 'repeat' : 'later';
}

interface CardProps {
  index: number;
  /** «Фокус»: the only card on screen, chosen in the list above; no fold header, fewer tools. */
  focusMode?: boolean;
  ev: WorkoutExerciseView;
  warmPosition: WarmupPosition;
  readOnly: boolean;
  busy: boolean;
  mutate: (fn: Parameters<ReturnType<typeof useCommand>['ok']>[0], rest?: number | null, reason?: string, next?: string) => Promise<void>;
  /** The bottom bar to render «Перерыв» into, when this exercise owns it. */
  dock?: HTMLElement | null;
  onActivate?: () => void;
  run: ReturnType<typeof useCommand>['run'];
  reload: () => Promise<void>;
  open: boolean;
  onToggle: () => void;
  /** Added by hand (or in an own workout) and nothing recorded yet: can be taken out. */
  removable?: boolean;
  /** Journal style (own workout): sets are added by hand, logging after the last one adds a new one. */
  journal?: boolean;
}

/** A short ramp of lighter sets before the first working set. Logged as warm-ups: they never count as work or move the progression. */
function WarmupBlock({ ev, position, busy, mutate, contextKey }: { ev: WorkoutExerciseView; position: WarmupPosition; busy: boolean; mutate: CardProps['mutate']; contextKey: string }) {
  const { se, exercise, plan, logs } = ev;
  if (!exercise.loadUnit.startsWith('kg')) return null;
  const workingKg = plan[0]?.targetWeightKg ?? 0;
  const sets = warmupSets({ workingKg, compound: exercise.isCompound, position, grid: { stepKg: ev.stepKg > 0 ? ev.stepKg : 2.5, minKg: ev.minKg, maxKg: ev.maxKg } });
  if (sets.length === 0) return null;
  const done = (no: number) => logs.find((l) => l.setType === 'warmup' && l.setNo === no && l.status === 'done');
  return (
    <div className="wk-panel wk-warm" role="group" aria-label="Разминка">
      <div className="wk-panel-title">Разминка перед рабочими подходами</div>
      {sets.map((w, i) => {
        const no = i + 1;
        const d = done(no);
        return (
          <div key={no} className={`wk-row ${d ? 'done' : ''}`}>
            <span className="wk-num">{no}</span>
            <span className="wk-row-text">
              <b>Разминка {no}</b>
              <span className="t-small">{fmt(toLift(w.weightKg), 2)} {liftUnit()} × {w.reps}</span>
            </span>
            <button
              type="button"
              className="wk-did"
              aria-pressed={d ? true : false}
              aria-label={d ? `Разминка ${no} сделана. Отменить` : `Разминка ${no}: сделал`}
              disabled={busy}
              onClick={() => void (d
                ? mutate((x) => undoSet(x, se.id, no, 'warmup'))
                : mutate((x) => logSet(x, { sessionExerciseId: se.id, exerciseId: exercise.id, variantKey: se.variantKey, contextKey, plannedSetId: null, setNo: no, setType: 'warmup', weightKg: w.weightKg, reps: w.reps, rir: null, restSec: null })))}
            >
              Сделал <span className="wk-did-mark"><Icon name="check" size={13} strokeWidth={3} /></span>
            </button>
          </div>
        );
      })}
      <p className="wk-note"><Icon name="info" size={14} /> Лёгкие подходы без отказа и без записи запаса: на прогрессию и тоннаж они не влияют.</p>
    </div>
  );
}

/** Sets of the plan that are settled (done or skipped): the exercise is finished when all of them are. */
export const settledSets = (ev: WorkoutExerciseView): number => ev.plan.filter((p) => ev.logs.some((l) => l.setType === 'working' && l.setNo === p.setNo)).length;

function ExerciseCard({ focusMode = false, index, ev, warmPosition, readOnly, busy, mutate, run, open, onToggle, removable, journal, dock, onActivate }: CardProps) {
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
    setWeight(w === null ? '' : fmt(toLift(w), 2));
    setReps(String(target?.repMax ?? 10));
    setRir(exercise.progressionType === 'time' ? 3 : null);
  }, [nextNo, target?.id]);

  const [painOpen, setPainOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [advice, setAdvice] = useState<PainAdvice | null>(null);

  const lb = getWeightUnit() === 'lb';
  const stepKg = ev.stepKg > 0 ? ev.stepKg : 2.5;
  // the plus/minus step in the shown unit: the machine's step in kg, or a round 2,5 / 5 lb
  const step = lb ? Math.max(2.5, Math.round(toLift(stepKg) / 2.5) * 2.5) : stepKg;
  const wShown = weight.trim() === '' ? null : parseDecimal(weight);
  const w = wShown === null ? null : Math.round(fromLift(wShown) * 1000) / 1000;
  const r = parseDecimal(reps);
  const bump = (delta: number) => {
    const cur = wShown ?? 0;
    let next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    if (ev.maxKg !== null) next = Math.min(next, toLift(ev.maxKg));
    setWeight(fmt(next, 2));
  };
  const canLog = !readOnly && !busy && rir !== null && Number.isFinite(r) && r >= 1 && (weight.trim() === '' || (w !== null && Number.isFinite(w) && w >= 0));
  const base = { sessionExerciseId: se.id, exerciseId: exercise.id, variantKey: se.variantKey, contextKey, plannedSetId: target?.id ?? null };

  /** Records the set; in a journal a set after the last planned one first becomes a planned set of its own. */
  const record = async (d: Parameters<Parameters<CardProps['mutate']>[0]>[0], rest: number | null) => {
    const extra = journal === true && nextNo > plan.length;
    if (extra) await addSetToExercise(d, se.id);
    await logSet(d, { ...base, plannedSetId: extra ? null : base.plannedSetId, setNo: nextNo, weightKg: w, reps: r, rir, restSec: rest });
  };
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
  const [restEditOpen, setRestEditOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  useWeightUnit();
  const [noteOpen, setNoteOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const unit = timed ? ' с' : '';
  const settled = settledSets(ev);
  const allSettled = plan.length > 0 && settled >= plan.length;
  const doneCount = working.filter((l) => l.status === 'done').length;
  const headline = allSettled
    ? 'Все подходы выполнены'
    : `${se.replacedFromExerciseId ? 'Замена · ' : ''}Подход ${nextNo}: ${target ? (target.targetWeightKg === null || exercise.loadUnit === 'seconds' ? (timed ? 'удержание' : 'без веса') : `${fmt(toLift(target.targetWeightKg), 2)} ${liftUnit()}`) : ''} × ${target ? (target.repMin === target.repMax ? target.repMin : `${target.repMin}–${target.repMax}`) : ''}${unit}`;

  const factText = (l: (typeof working)[number]): string => `${l.actualWeightKg === null ? '' : `${fmt(toLift(l.actualWeightKg), 2)} × `}${l.actualReps}${unit} · RIR ${l.actualRir}`;
  const hasCurrent = !readOnly && nextNo <= plan.length;
  const layout = useWorkoutLayout();
  // Sets are swiped only while there is a set to do; a finished exercise is easier to read as a list.
  const carousel = layout === 'focus' && hasCurrent;
  const lastPlanNo = plan.length > 0 ? (plan[plan.length - 1] as (typeof plan)[number]).setNo : 0;
  const canRemoveLast = !readOnly && plan.length > 1 && !logOf(lastPlanNo);
  const nextLabel = journal || nextNo < plan.length ? `${exercise.name} · подход ${nextNo + 1}` : 'следующее упражнение';

  // «Фокус»: the sets are slides; the current one is brought into view whenever it changes.
  const setsRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const goSlide = (i: number) => {
    const el = setsRef.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (el && child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };
  const onSetsScroll = () => {
    const el = setsRef.current;
    if (el && el.clientWidth > 0) setSlide(Math.round(el.scrollLeft / el.clientWidth));
  };
  useEffect(() => {
    if (!carousel || !open) return;
    const i = Math.max(0, Math.min(plan.length - 1, (hasCurrent ? nextNo : plan.length) - 1));
    const t = setTimeout(() => goSlide(i), 60);
    return () => clearTimeout(t);
  }, [carousel, open, nextNo, plan.length]);

  // The editor of the next set: it opens inside that set's row.
  const editor = readOnly ? null : (
    <div className="wk-editor">
      {exercise.loadUnit !== 'seconds' && (
        <StepperField
          label={exercise.loadUnit === 'bodyweight' ? 'Доп. вес (необязательно)' : 'Вес'}
          labelIcon="training"
          unit={<button type="button" className="rest-edit" aria-label={`Единицы веса: ${liftUnit()}. Изменить`} onClick={() => setUnitOpen(true)}>{liftUnit()}</button>}
          value={weight}
          onChange={setWeight}
          onStep={(dir) => bump(dir * step)}
          decLabel="Меньше веса"
          incLabel="Больше веса"
        />
      )}
      <StepperField
        label={timed ? 'Секунды' : 'Повторения'}
        labelIcon={timed ? 'clock' : 'repeat'}
        inputMode="numeric"
        value={reps}
        onChange={setReps}
        onStep={(dir) => setReps(String(dir < 0 ? Math.max(1, (Number.isFinite(r) ? r : 1) - 1) : (Number.isFinite(r) ? r : 0) + 1))}
        decLabel={timed ? 'Меньше секунд' : 'Меньше повторений'}
        incLabel={timed ? 'Больше секунд' : 'Больше повторений'}
      />
      <div className="rir-block">
        <div className="t-caption">Сколько повторений ещё мог бы сделать (RIR)</div>
        <div className="chips wk-rir" role="group" aria-label="RIR">
          {RIR_OPTIONS.map((o) => <Chip key={o.value} pressed={rir === o.value} onClick={() => setRir(o.value)}>{o.label}</Chip>)}
        </div>
        {rir === null && <p className="t-small">Выбери запас — без него подход не записать.</p>}
      </div>
    </div>
  );

  return (
    <Card id={`ex-${se.id}`} className={`ex-acc wk-ex ${focusMode ? 'focus' : ''} ${open ? 'open' : ''} ${allSettled && !journal ? 'is-done' : ''} ${dock ? 'is-active' : ''}`} onPointerDownCapture={onActivate} onFocusCapture={onActivate}>
      {!focusMode && <button type="button" className="ex-head" aria-expanded={open} onClick={onToggle}>
        <span className="wk-num wk-ex-num" aria-hidden="true">{allSettled && !journal ? <Icon name="check" size={16} strokeWidth={2.6} /> : index}</span>
        <span className="ex-title">
          <span className="wk-ex-name">{exercise.name}</span>
          <span className="wk-ex-line">{headline}</span>
        </span>
        {journal ? <Badge tone={doneCount > 0 ? 'default' : 'neutral'}>{doneCount} подх.</Badge> : allSettled ? <Badge>Готово</Badge> : <Badge tone="neutral">{settled}/{plan.length}</Badge>}
        <span className="ex-chev" aria-hidden="true"><Icon name="chevronDown" size={20} /></span>
      </button>}
      <div className="ex-body" hidden={!open}>
        {ev.reasonText && SHOWN_REASONS.test(ev.reasonCode ?? '') && !(ev.reasonCode === 'first_execution_choose_weight' && (exercise.loadUnit === 'seconds' || exercise.loadUnit === 'bodyweight')) && <p className="wk-note"><Icon name="info" size={14} /> {ev.reasonText}</p>}
        {ev.reminders.map((n) => (
          <div key={n.id} className="note-reminder" role="note">
            <b className="t-caption">Заметка с прошлого раза</b>
            <div className="t-body">{n.text}</div>
          </div>
        ))}
        {ev.ownNote && <p className="wk-note"><Icon name="edit" size={14} /> {ev.ownNote.text}</p>}
        {hasCurrent && target && (
          <div className="wk-stats" role="group" aria-label="План подхода">
            <div className="wk-stat wide"><span className="wk-stat-l">{timed ? 'Подх. × сек' : 'Подх. × повт'}</span><span className="wk-stat-v">{plan.length} × {target.repMin === target.repMax ? target.repMin : `${target.repMin}–${target.repMax}`}</span></div>
            <div className="wk-stat"><span className="wk-stat-l">Вес</span><span className="wk-stat-v">{target.targetWeightKg === null || exercise.loadUnit === 'seconds' ? (exercise.loadUnit === 'bodyweight' ? 'свой' : '—') : `${fmt(toLift(target.targetWeightKg), 2)}`}<small>{target.targetWeightKg !== null && exercise.loadUnit !== 'seconds' ? ` ${liftUnit()}` : ''}</small></span></div>
            <div className="wk-stat"><span className="wk-stat-l">Запас</span><span className="wk-stat-v">{target.targetRir.min}–{target.targetRir.max}</span></div>
            <button type="button" className="wk-stat edit" aria-label={`Отдых ${clock(restSec)}. Изменить`} onClick={() => setRestEditOpen(true)}>
              <span className="wk-stat-l">Отдых <Icon name="edit" size={12} /></span>
              <span className="wk-stat-v">{clock(restSec)}</span>
            </button>
          </div>
        )}
        {exercise.variants.length > 1 && (
          <div className="var-pick">
            <div className="t-caption">Хват / вариант{working.length > 0 || readOnly ? '' : ' (до первого подхода)'}</div>
            <div className="chips wk-variants" role="group" aria-label="Вариант упражнения">
              {exercise.variants.map((v) => (
                <Chip key={v.key} pressed={se.variantKey === v.key} disabled={se.variantKey !== v.key && (readOnly || working.length > 0)} onClick={() => { if (!readOnly && working.length === 0 && !busy && se.variantKey !== v.key) void mutate((d) => changeExerciseVariant(d, { sessionExerciseId: se.id, variantKey: v.key })); }}>{v.label}</Chip>
              ))}
            </div>
            {exercise.variants.find((v) => v.key === se.variantKey)?.note && <p className="t-small">{exercise.variants.find((v) => v.key === se.variantKey)?.note}</p>}
          </div>
        )}

        {!readOnly && working.length === 0 && (
          <WarmupBlock ev={ev} position={warmPosition} busy={busy} mutate={mutate} contextKey={contextKey} />
        )}

        <div className={`wk-sets ${carousel ? 'focus' : ''}`} ref={setsRef} onScroll={carousel ? onSetsScroll : undefined}>
          {plan.map((p) => {
            const l = logOf(p.setNo);
            const current = !readOnly && p.setNo === nextNo;
            const state = l ? (l.status === 'done' ? 'done' : 'skipped') : current ? 'current' : 'pending';
            return (
              <div key={p.id} className={`wk-set ${state}`} aria-current={current ? 'step' : undefined}>
                <div className="wk-set-head">
                  <span className="wk-num">{state === 'done' ? <Icon name="check" size={15} strokeWidth={2.8} /> : p.setNo}</span>
                  <span className="wk-row-text">
                    <b>Подход {p.setNo}{focusMode ? ` из ${plan.length}` : ''}</b>
                    {/* In a journal a recorded set shows only what was done: the suggestion is noise there. */}
                    {state === 'done' && <span className="wk-fact">{factText(l!)}</span>}
                  </span>
                  {state === 'done' && !readOnly && <IconButton icon="close" label={`Отменить подход ${p.setNo}`} tone="ghost" onClick={() => void mutate((d) => undoSet(d, se.id, p.setNo))} />}
                  {state === 'skipped' && (
                    <span className="row">
                      <Badge tone={l!.skipReason === 'pain' ? 'danger' : 'neutral'}>{l!.skipReason === 'pain' ? 'Боль' : 'Пропущен'}</Badge>
                      {!readOnly && <Button size="sm" variant="text" disabled={busy} onClick={() => void mutate((d) => undoSet(d, se.id, p.setNo))}>Вернуть</Button>}
                    </span>
                  )}
                  {state === 'current' && <span className="wk-now">сейчас</span>}
                  {canRemoveLast && p.setNo === lastPlanNo && <IconButton icon="trash" label={`Убрать подход ${p.setNo}`} tone="ghost" disabled={busy} onClick={() => void mutate((d) => removeLastSet(d, se.id))} />}
                </div>
                {state === 'pending' && carousel && <p className="wk-wait">Откроется после подхода {nextNo}</p>}
                {current && editor}
              </div>
            );
          })}
          {working.filter((l) => l.setNo > plan.length && l.status === 'done').map((l) => (
            <div key={l.id} className="wk-set done">
              <div className="wk-set-head">
                <span className="wk-num"><Icon name="check" size={15} strokeWidth={2.8} /></span>
                <span className="wk-row-text"><b>Доп. подход {l.setNo}</b><span className="wk-fact">{factText(l)}</span></span>
              </div>
            </div>
          ))}
        </div>
        {carousel && plan.length > 1 && (
          <div className="wk-dots" role="tablist" aria-label="Подходы">
            {plan.map((p, i) => <button key={p.id} type="button" role="tab" aria-selected={slide === i} aria-label={`Подход ${p.setNo}`} className={logOf(p.setNo) ? 'done' : ''} onClick={() => goSlide(i)} />)}
          </div>
        )}

        {!readOnly && (
          <div className="wk-actions">
            {focusMode ? (
              <div className="wk-tools three">
                <button type="button" className="wk-tool" onClick={() => setInfoOpen(true)}><Icon name="info" size={18} /><span>Техника</span></button>
                <button type="button" className="wk-tool" onClick={() => setSwapOpen(true)}><Icon name="swap" size={18} /><span>Заменить</span></button>
                <button type="button" className="wk-tool danger" onClick={() => setPainOpen(true)}><Icon name="alert" size={18} /><span>Боль</span></button>
              </div>
            ) : (<>
            <div className="wk-tools">
              {hasCurrent && <button type="button" className="wk-tool" disabled={busy} onClick={() => void mutate((d) => skipSet(d, { ...base, setNo: nextNo, reason: 'fatigue' }))}><Icon name="skip" size={18} /><span>Пропустить подход</span></button>}
              <button type="button" className="wk-tool" disabled={busy} onClick={() => void mutate((d) => addSetToExercise(d, se.id))}><Icon name="plus" size={18} /><span>Добавить подход</span></button>
              <button type="button" className="wk-tool" onClick={() => setSwapOpen(true)}><Icon name="swap" size={18} /><span>Заменить</span></button>
              <button type="button" className="wk-tool danger" onClick={() => setPainOpen(true)}><Icon name="alert" size={18} /><span>Боль</span></button>
            </div>
            <div className="wk-links">
              <Button size="sm" variant="text" icon="info" onClick={() => setInfoOpen(true)}>Техника</Button>
              <Button size="sm" variant="text" icon="edit" onClick={() => setNoteOpen(true)}>Заметка</Button>
              {VACUUM_KEYS.has(exercise.key) && <Button size="sm" variant="text" icon="info" onClick={() => setGuideOpen(true)}>Как это работает</Button>}
              {removable && <Button size="sm" variant="text" icon="trash" disabled={busy} onClick={() => void mutate((d) => removeExerciseFromSession(d, se.id))}>Убрать</Button>}
            </div>
            </>)}
          </div>
        )}
      </div>

      {dock && open && hasCurrent && createPortal(
        <div className="wk-dock-in">
          <button type="button" className="wk-dock-main" disabled={!canLog} onClick={() => void mutate((d) => record(d, restSec), restSec, restOverride === null ? suggestion.reason : 'вручную', nextLabel)}>
            <Icon name="clock" size={22} />
            <span className="wk-dock-text">
              <b>Перерыв · {clock(restSec)}</b>
              <small>{rir === null ? 'Выбери запас (RIR)' : `${exercise.name} · ${nextNo <= plan.length || journal ? `подход ${nextNo}` : 'доп. подход'}`}</small>
            </span>
          </button>
          <button type="button" className="wk-dock-alt" disabled={!canLog} onClick={() => void mutate((d) => record(d, null))}>
            Без отдыха
          </button>
        </div>,
        dock,
      )}
      <UnitSheet open={unitOpen} onClose={() => setUnitOpen(false)} />
      <RestEditSheet open={restEditOpen} current={restSec} recommended={suggestion.seconds} onClose={() => setRestEditOpen(false)} onPick={(sec) => { setRestOverride(sec === suggestion.seconds ? null : sec); setRestEditOpen(false); }} />
      {infoOpen && <ExerciseInfoSheet exercise={exercise} onClose={() => setInfoOpen(false)} />}
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

/** Saves what was done as an own workout (or updates the one it was started from), to repeat it later. */
function SaveOwnSheet({ open, view, onClose }: { open: boolean; view: WorkoutView; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const source = view.customWorkoutId ? s.customWorkouts.find((w) => w.id === view.customWorkoutId) : undefined;
  const [name, setName] = useState('');
  const [savedAs, setSavedAs] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName(source || view.custom ? '' : view.label);
      setSavedAs(null);
    }
  }, [open]);
  const save = async (replaceId: string | null, as: string) => {
    const id = await run((d) => saveSessionAsCustomWorkout(d, { sessionId: view.session.id, name: as, replaceId }));
    if (id) setSavedAs(as.trim());
  };
  return (
    <Sheet open={open} title="Своя тренировка" onClose={onClose}>
      <div className="stack">
        {savedAs !== null ? (
          <>
            <p className="t-body">Сохранено{savedAs ? `: «${savedAs}»` : ''}. Она в «Тренировки → Своя» и в «Свои тренировки».</p>
            <Button block onClick={onClose}>Готово</Button>
          </>
        ) : (
          <>
            <p className="t-small">Сохранятся упражнения с записанными подходами: столько подходов, сколько сделано, с теми же повторениями и отдыхом. Потом её можно повторять и менять в конструкторе.</p>
            {banner}
            {source && <Button block icon="check" disabled={busy} onClick={() => void save(source.id, source.name)}>Обновить «{source.name}»</Button>}
            <TextField label={source ? 'Или сохранить как новую (название необязательно)' : 'Название (необязательно)'} placeholder="Придумается само по упражнениям" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <Button block variant={source ? 'secondary' : 'primary'} icon="plus" disabled={busy} onClick={() => void save(null, name)}>Сохранить как новую</Button>
          </>
        )}
      </div>
    </Sheet>
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
