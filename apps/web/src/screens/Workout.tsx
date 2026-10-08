import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rankSubstitutes, type BodyArea, type PainAdvice, type ReplacementReason, type Side } from '@fitapp/domain';
import { abandonWorkout, finishWorkout, loadWorkout, logSet, reportPain, replaceExerciseInSession, skipSet, undoSet, type WorkoutExerciseView, type WorkoutView } from '../actions';
import { useData } from '../app/DataContext';
import { safetyContext } from '../app/derive';
import { fmt } from '../app/format';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Badge, Button, Card, Chip, Icon, IconButton, ListItem, ProgressBar, Sheet, TextField } from '../ui';
import { parseDecimal } from './shared';

const AREA_LABELS: Record<BodyArea, string> = { shoulder: 'Плечо', elbow: 'Локоть', wrist: 'Запястье', neck: 'Шея', upper_back: 'Верх спины', lower_back: 'Поясница', hip: 'Таз', knee: 'Колено', ankle: 'Голеностоп', other: 'Другое' };
const SIDE_LABELS: Record<Side, string> = { left: 'Слева', right: 'Справа', both: 'Обе' };
const REASON_LABELS: Record<ReplacementReason, string> = { machine_busy: 'Тренажёр занят', equipment_unavailable: 'Нет оборудования', discomfort: 'Дискомфорт', preference: 'Хочу другое' };
const RIR_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [{ value: 0, label: '0' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4+' }];

export function Workout({ sessionId }: { sessionId: string }) {
  const { act } = useData();
  const { run, ok, banner, busy } = useCommand();
  const [view, setView] = useState<WorkoutView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);

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

  const mutate = async (fn: Parameters<typeof ok>[0], rest?: number | null) => {
    if (await ok(fn)) {
      if (rest) setRestEnd(Date.now() + rest * 1000);
      await reload();
    }
  };

  return (
    <main className="screen workout">
      <header className="screen-head">
        <div className="back">
          <IconButton icon="chevronLeft" label="К тренировкам" tone="ghost" onClick={() => go('training')} />
          <h1 className="t-h2">{view.label}</h1>
        </div>
        {readOnly ? <Badge tone="neutral">{view.session.status === 'completed' ? 'Завершена' : 'Прервана'}</Badge> : <Badge>{doneSets}/{totalSets}</Badge>}
      </header>
      <ProgressBar value={totalSets > 0 ? doneSets / totalSets : 0} label="Прогресс тренировки" />
      {banner}
      {restEnd !== null && <RestTimer endsAt={restEnd} onDone={() => setRestEnd(null)} />}

      {view.exercises.map((ev) => (
        <ExerciseCard key={ev.se.id} ev={ev} readOnly={readOnly} busy={busy} mutate={mutate} run={run} reload={reload} />
      ))}

      {!readOnly && (
        <div className="stack">
          <Button block icon="check" onClick={() => setFinishing(true)}>Завершить тренировку</Button>
          <Button block variant="text" disabled={busy} onClick={async () => { if (await ok((d) => abandonWorkout(d, sessionId))) go('training'); }}>Прервать без сохранения итогов</Button>
        </div>
      )}
      {readOnly && <Button block variant="secondary" onClick={() => go('training')}>К тренировкам</Button>}
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} doneSets={doneSets} totalSets={totalSets} onFinish={async (note) => { if (await ok((d) => finishWorkout(d, sessionId, note))) go('training'); }} />
    </main>
  );
}

function RestTimer({ endsAt, onDone }: { endsAt: number; onDone: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  useEffect(() => {
    if (left === 0) onDone();
  }, [left, onDone]);
  return (
    <Card flat>
      <div className="row between">
        <span className="row"><Icon name="clock" size={18} /> <span className="t-body">Отдых {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></span>
        <Button size="sm" variant="text" onClick={onDone}>Пропустить</Button>
      </div>
    </Card>
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
  mutate: (fn: Parameters<ReturnType<typeof useCommand>['ok']>[0], rest?: number | null) => Promise<void>;
  run: ReturnType<typeof useCommand>['run'];
  reload: () => Promise<void>;
}

function ExerciseCard({ ev, readOnly, busy, mutate, run }: CardProps) {
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
    setRir(null);
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

  const restSec = target?.restSec ?? 90;

  return (
    <Card>
      <div className="stack">
        <div className="row between">
          <div>
            <div className="t-h3">{exercise.name}</div>
            {se.replacedFromExerciseId && <div className="t-small">Замена в этой тренировке</div>}
          </div>
          {se.status === 'done' && <Badge>Готово</Badge>}
        </div>
        {ev.reasonText && <p className="t-small"><Icon name="info" size={14} /> {ev.reasonText}</p>}

        <div className="list">
          {plan.map((p) => {
            const l = logOf(p.setNo);
            const current = !readOnly && p.setNo === nextNo;
            return (
              <div key={p.id} className="set-row" aria-current={current ? 'step' : undefined}>
                <span className="t-caption">Подход {p.setNo}</span>
                <span className="t-small">{p.targetWeightKg === null ? 'без веса' : `${fmt(p.targetWeightKg, 2)} кг`} × {p.repMin === p.repMax ? p.repMin : `${p.repMin}–${p.repMax}`}, запас {p.targetRir.min}–{p.targetRir.max}</span>
                {l && l.status === 'done' && (
                  <span className="row">
                    <b className="t-body">{l.actualWeightKg === null ? '' : `${fmt(l.actualWeightKg, 2)} × `}{l.actualReps} · RIR {l.actualRir}</b>
                    {!readOnly && <IconButton icon="close" label="Отменить подход" tone="ghost" onClick={() => void mutate((d) => undoSet(d, se.id, p.setNo))} />}
                  </span>
                )}
                {l && l.status === 'skipped' && <Badge tone={l.skipReason === 'pain' ? 'danger' : 'neutral'}>{l.skipReason === 'pain' ? 'Боль' : 'Пропущен'}</Badge>}
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
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <IconButton icon="minus" label="Меньше веса" onClick={() => bump(-step)} />
              <div className="grow"><TextField label="Вес" unit="кг" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
              <IconButton icon="plus" label="Больше веса" onClick={() => bump(step)} />
            </div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <IconButton icon="minus" label="Меньше повторений" onClick={() => setReps(String(Math.max(1, (Number.isFinite(r) ? r : 1) - 1)))} />
              <div className="grow"><TextField label="Повторения" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} /></div>
              <IconButton icon="plus" label="Больше повторений" onClick={() => setReps(String((Number.isFinite(r) ? r : 0) + 1))} />
            </div>
            <div>
              <div className="t-caption">Сколько повторений ещё мог бы сделать (RIR)</div>
              <div className="chips" role="group" aria-label="RIR">
                {RIR_OPTIONS.map((o) => <Chip key={o.value} pressed={rir === o.value} onClick={() => setRir(o.value)}>{o.label}</Chip>)}
              </div>
            </div>
            <Button block icon="check" disabled={!canLog} onClick={() => void mutate((d) => logSet(d, { ...base, setNo: nextNo, weightKg: w, reps: r, rir, restSec }), restSec)}>Записать подход</Button>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button size="sm" variant="text" icon="skip" disabled={busy} onClick={() => void mutate((d) => skipSet(d, { ...base, setNo: nextNo, reason: 'fatigue' }))}>Пропустить подход</Button>
              <Button size="sm" variant="text" icon="alert" onClick={() => setPainOpen(true)}>Боль</Button>
              <Button size="sm" variant="text" icon="swap" onClick={() => setSwapOpen(true)}>Заменить</Button>
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
