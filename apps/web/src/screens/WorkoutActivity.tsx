import { useEffect, useMemo, useState } from 'react';
import { estimateWorkout, sessionElapsedSec, KCAL_SPREAD, NET_MET, SEC_PER_REP, type ActivityEstimate, type ActivityExercise, type BestSet, type ProgressVerdict, type WorkoutSummary } from '@fitapp/domain';
import { loadWorkoutSummary, type WorkoutView } from '../actions';
import { useData } from '../app/DataContext';
import { fmt } from '../app/format';
import { Button, Card, Icon, Sheet } from '../ui';

const clock = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const minutes = (sec: number): string => `${Math.max(1, Math.round(sec / 60))} мин`;
export const kcalRange = (a: Pick<ActivityEstimate, 'kcalLow' | 'kcalHigh'>): string => `≈ ${a.kcalLow}–${a.kcalHigh}`;
const thousands = (n: number): string => n.toLocaleString('ru-RU').replace(/\s/g, ' ');

/** Body weight for the estimate: the latest weigh-in, otherwise a neutral default. */
export function useBodyWeight(): number {
  const { snapshot: s } = useData();
  return s.weight.avg7 ?? s.weight.currentKg ?? 75;
}

const isTimed = (e: WorkoutView['exercises'][number]['exercise']): boolean => e.loadUnit === 'seconds' || e.progressionType === 'time';

/** The inputs of the estimate, taken from what has been logged so far in an open workout. */
function fromView(view: WorkoutView): { exercises: ActivityExercise[]; completedAtMs: number[] } {
  const exercises: ActivityExercise[] = [];
  const completedAtMs: number[] = [];
  for (const ev of view.exercises) {
    const done = ev.logs.filter((l) => l.status === 'done' && l.setType === 'working' && (l.actualReps ?? 0) > 0);
    for (const l of done) if (l.completedAt) completedAtMs.push(Date.parse(l.completedAt));
    exercises.push({ compound: ev.exercise.isCompound, timed: isTimed(ev.exercise), sets: done.map((l) => ({ weightKg: l.actualWeightKg, reps: l.actualReps ?? 0 })) });
  }
  return { exercises, completedAtMs };
}

export function KcalInfoSheet({ open, onClose, bodyKg }: { open: boolean; onClose: () => void; bodyKg: number }) {
  return (
    <Sheet open={open} title="Как считаются калории" onClose={onClose}>
      <div className="stack">
        <p className="t-body">Это приблизительная оценка активных калорий, то есть сверх того, что тело тратит в покое. Поэтому показан диапазон: у конкретного человека формула ошибается примерно на ±{Math.round(KCAL_SPREAD * 100)}%.</p>
        <p className="t-body"><b>Как считаем.</b> Берём время работы и время пауз между подходами. Один повтор занимает около {SEC_PER_REP} секунд. Каждое занятие умножаем на его интенсивность (MET, из справочника физической активности) и на твой вес ({fmt(bodyKg, 1)} кг):</p>
        <ul className="t-small">
          <li>базовое упражнение (присед, жим, тяга): +{NET_MET.compound} MET сверх покоя;</li>
          <li>изолирующее (сгибания, разгибания): +{NET_MET.isolation} MET;</li>
          <li>удержание и кардио: +{NET_MET.timed} MET;</li>
          <li>пауза между подходами: +{NET_MET.rest} MET.</li>
        </ul>
        <p className="t-small">Килограммы на штанге почти не меняют расход, поэтому тоннаж показан отдельно, как мера прогресса. Время считается до последнего записанного подхода плюс короткий отдых, чтобы забытое открытое приложение не накручивало минуты.</p>
        <div className="note">Эти калории <b>не уменьшают</b> и не увеличивают твою норму питания и рацион. Они показаны только для наглядности: ты работаешь, а цифры это видят.</div>
        <Button block onClick={onClose}>Понятно</Button>
      </div>
    </Sheet>
  );
}

/** Live bar over an open workout: time, sets, tonnage and the kcal range. It can be switched off in the profile. */
export function ActivityBar({ view, doneSets, totalSets }: { view: WorkoutView; doneSets: number; totalSets: number }) {
  const bodyKg = useBodyWeight();
  const [now, setNow] = useState(Date.now());
  const [info, setInfo] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const a = useMemo(() => {
    const { exercises, completedAtMs } = fromView(view);
    const elapsedSec = sessionElapsedSec({ startedAtMs: Date.parse(view.session.startedAt), completedAtMs, endedAtMs: null, nowMs: now });
    return estimateWorkout({ bodyWeightKg: bodyKg, exercises, elapsedSec });
  }, [view, bodyKg, now]);
  return (
    <>
      <div className="act-bar" role="group" aria-label="Активность на тренировке">
        <div className="act-cell"><span className="act-v">{clock(a.elapsedSec)}</span><span className="act-l">время</span></div>
        <div className="act-cell"><span className="act-v">{doneSets}/{totalSets}</span><span className="act-l">подходы</span></div>
        <div className="act-cell"><span className="act-v">{a.tonnageKg > 0 ? thousands(a.tonnageKg) : '0'}</span><span className="act-l">тоннаж, кг</span></div>
        <button type="button" className="act-cell act-kcal" aria-label="Как считаются калории" onClick={() => setInfo(true)}>
          <span className="act-v">{a.sets > 0 ? kcalRange(a) : '—'}</span>
          <span className="act-l">ккал <Icon name="info" size={12} /></span>
        </button>
      </div>
      <KcalInfoSheet open={info} onClose={() => setInfo(false)} bodyKg={bodyKg} />
    </>
  );
}

const VERDICT: Record<ProgressVerdict, { label: string; mark: string; tone: string }> = {
  up: { label: 'Прогресс', mark: '▲', tone: 'up' },
  same: { label: 'Без изменений', mark: '●', tone: 'same' },
  down: { label: 'Ниже, чем в прошлый раз', mark: '▼', tone: 'down' },
  first: { label: 'Первый раз', mark: '★', tone: 'first' },
};

const setText = (b: BestSet, timed: boolean): string => (timed ? `${b.reps} с` : b.weightKg !== null && b.weightKg > 0 ? `${fmt(b.weightKg, 2)} × ${b.reps}` : `${b.reps} повт.`);

/** After "Завершить" (and when an old workout is opened): totals and, per exercise, progress or regress against the previous time. */
export function WorkoutSummaryCard({ sessionId, title }: { sessionId: string; title?: string }) {
  const { act } = useData();
  const bodyKg = useBodyWeight();
  const [sum, setSum] = useState<(WorkoutSummary & { startedAt: string }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [info, setInfo] = useState(false);
  useEffect(() => {
    let live = true;
    act((d) => loadWorkoutSummary(d, sessionId, bodyKg))
      .then((r) => live && setSum(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // the summary is computed once per workout; the body weight only scales the estimate
  }, [sessionId]);
  if (failed) return null;
  if (!sum) return <p className="note" role="status" aria-busy="true">Подвожу итоги…</p>;
  const a = sum.activity;
  const groups: ProgressVerdict[] = ['up', 'down', 'same', 'first'];
  return (
    <div className="stack">
      {title && <div className="rest-boss t-h2" role="status">{title}</div>}
      <Card>
        <div className="stack">
          <div className="sum-grid">
            <div className="sum-tile"><span className="sum-v">{minutes(a.elapsedSec)}</span><span className="sum-l">время</span></div>
            <div className="sum-tile"><span className="sum-v">{a.sets}</span><span className="sum-l">подходов</span></div>
            <div className="sum-tile"><span className="sum-v">{thousands(a.tonnageKg)}</span><span className="sum-l">тоннаж, кг</span></div>
            <button type="button" className="sum-tile sum-kcal" onClick={() => setInfo(true)} aria-label="Как считаются калории">
              <span className="sum-v">{a.sets > 0 ? kcalRange(a) : '—'}</span>
              <span className="sum-l">ккал, примерно <Icon name="info" size={12} /></span>
            </button>
          </div>
          <p className="t-small">Калории показаны для наглядности и никак не связаны с питанием: ни норму, ни рацион они не меняют.</p>
        </div>
      </Card>
      {sum.exercises.length > 0 && (
        <Card>
          <div className="stack">
            <div className="t-h3">Что с прошлым разом</div>
            <p className="t-small">{sum.up > 0 ? `Прогресс в ${sum.up} из ${sum.exercises.length}` : 'Прогресса по весу и повторениям сегодня нет'}{sum.down > 0 ? `, ниже прошлого в ${sum.down}` : ''}.</p>
            {groups.map((g) => {
              const rows = sum.exercises.filter((x) => x.verdict === g);
              if (rows.length === 0) return null;
              return (
                <div key={g} className="stack">
                  <div className={`sum-group ${VERDICT[g].tone}`}><span aria-hidden="true">{VERDICT[g].mark}</span> {VERDICT[g].label}</div>
                  {rows.map((x) => (
                    <div key={x.exerciseId} className="sum-row">
                      <span className="sum-name">{x.name}</span>
                      <span className="sum-set t-small">
                        {x.previousBest ? `${setText(x.previousBest, x.timed)} → ` : ''}
                        <b>{setText(x.best, x.timed)}</b>
                        {x.deltaPct !== null && x.verdict !== 'same' ? ` (${x.deltaPct > 0 ? '+' : ''}${fmt(x.deltaPct, 1)}%)` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            {sum.down > 0 && <p className="t-small">Небольшие просадки бывают: сон, усталость, другой тренажёр. Одна тренировка ничего не решает, смотри на тренд.</p>}
          </div>
        </Card>
      )}
      <KcalInfoSheet open={info} onClose={() => setInfo(false)} bodyKg={bodyKg} />
    </div>
  );
}
