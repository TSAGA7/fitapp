import { useState } from 'react';
import { addDays, compareMonths, movingAverage, planStreakWeeks, summarizeSeries, trainingDays, trainingLevel, type MetricType, type VolumeLevel, type WeightPoint } from '@fitapp/domain';
import { deleteMetric } from '../actions';
import { useData } from '../app/DataContext';
import { BODY_MEASUREMENTS, cm, deltaTone, fmt, formatDateLong, formatDateShort, formatDay, kg, METRIC_LABELS, signedKg, liftKg, liftNum, liftSigned, liftUnit, toLift, wnum, wUnit, MUSCLE_LABELS, plural, signed } from '../app/format';
import { getWeightUnit } from '../app/prefs';
import { go } from '../app/router';
import { Button, Card, EmptyState, Icon, IconButton, LineChart, ListItem, MetricCard, Segmented, type ChartSeries } from '../ui';
import { AddMeasurementSheet, AddWeightSheet, ScreenHeader } from './shared';

const NBSP = '\u00a0';
type Tab = 'weight' | 'measurements' | 'strength' | 'analytics';
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'weight', label: 'Вес' },
  { value: 'measurements', label: 'Замеры' },
  { value: 'strength', label: 'Сила' },
  { value: 'analytics', label: 'Аналитика' },
];

export function Progress({ route }: { route: string[] }) {
  const tab: Tab = route[1] === 'measurements' || route[1] === 'strength' || route[1] === 'analytics' ? route[1] : 'weight';
  const detail = route[2] ? decodeURIComponent(route[2]) : null;
  if (tab === 'measurements' && detail) return <MeasurementDetail type={detail as MetricType} />;
  if (tab === 'strength' && detail) return <StrengthDetail exerciseId={detail} />;
  return (
    <main className="screen">
      <ScreenHeader title="Прогресс" />
      <Segmented options={TABS} value={tab} onChange={(v) => go(`progress/${v}`)} label="Раздел прогресса" />
      {tab === 'weight' && <WeightTab />}
      {tab === 'measurements' && <MeasurementsTab />}
      {tab === 'strength' && <StrengthTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </main>
  );
}

type Range = 30 | 90 | 0;

function WeightTab() {
  const { snapshot: s, act } = useData();
  const [range, setRange] = useState<Range>(90);
  const [open, setOpen] = useState(false);
  const w = s.weight;
  if (w.currentKg === null) {
    return (
      <>
        <Card flat>
          <EmptyState icon="scale" title="Записей веса пока нет" text="Записывай вес по утрам: мы покажем среднее и динамику, а не случайные скачки." action={<Button icon="plus" onClick={() => setOpen(true)}>Записать вес</Button>} />
        </Card>
        <AddWeightSheet open={open} onClose={() => setOpen(false)} />
      </>
    );
  }
  const from = range === 0 || !w.asOf ? null : addDays(w.asOf, -range);
  const inRange = (p: WeightPoint) => (from === null ? true : p.date >= from);
  const raw = s.weightPoints.filter(inRange);
  const avg = movingAverage(s.weightPoints, 7).filter(inRange);
  const series: ChartSeries[] = [
    { id: 'avg', label: 'Среднее за 7 дней', color: '#16a34a', area: true, width: 3, points: avg.map((p) => ({ date: p.date, value: p.kg })) },
    { id: 'raw', label: 'Вес', color: '#86c9a5', width: 1.5, dots: true, faint: true, points: raw.map((p) => ({ date: p.date, value: p.kg })) },
  ];
  const delta =
    w.monthChangeKg !== null ? `${signedKg(w.monthChangeKg)} · за 30 дней` : w.sinceStartKg !== null ? `${signedKg(w.sinceStartKg)} · за ${w.sinceStartDays}${NBSP}дн.` : 'Динамика появится после недели записей';
  const goingDown = s.primaryGoal?.targetWeightKg != null && w.currentKg > s.primaryGoal.targetWeightKg;
  const change = w.monthChangeKg ?? w.sinceStartKg;
  const tone = change === null || change === 0 ? 'flat' : (change < 0) === goingDown ? 'good' : 'flat';
  const history = [...s.metrics].filter((m) => m.type === 'weight').sort((a, b) => (a.measuredOn < b.measuredOn ? 1 : a.measuredOn > b.measuredOn ? -1 : a.createdAt < b.createdAt ? 1 : -1)).slice(0, 10);

  return (
    <>
      <Card>
        <div className="t-num">{wnum(w.currentKg)}<span className="t-h3 muted"> {wUnit()}</span></div>
        <div className={`t-caption tone-${tone}`} style={{ marginTop: 2 }}>{delta}</div>
        <div className="range" style={{ margin: '12px 0 4px' }} role="group" aria-label="Период графика">
          {([[30, '30 дн'], [90, '90 дн'], [0, 'Всё']] as Array<[Range, string]>).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={range === v} onClick={() => setRange(v)}>{label}</button>
          ))}
        </div>
        <LineChart series={series} ariaLabel="График веса" formatY={(v) => fmt(v, 0)} formatX={formatDateShort} formatTip={(p) => `${fmt(p.value)} ${wUnit()} · ${formatDateShort(p.date)}`} />
        <div className="note" style={{ marginTop: 4 }}>Линия: среднее за 7 дней. Точки: отдельные взвешивания.</div>
      </Card>
      <div className="grid-2">
        <MetricCard icon="scale" label="Среднее 7 дн" value={w.avg7 !== null ? kg(w.avg7) : '—'} delta={w.weekChangeKg !== null ? `${signedKg(w.weekChangeKg)} к прошлой неделе` : undefined} />
        <MetricCard icon="scale" label="Среднее 30 дн" value={w.avg30 !== null ? kg(w.avg30) : '—'} />
        <MetricCard icon="trendDown" label="Темп в неделю" value={w.rateKgPerWeek !== null && w.rateReliable ? signedKg(w.rateKgPerWeek) : '—'} delta={!w.rateReliable ? 'Нужно 4+ записи за неделю' : undefined} />
        <MetricCard icon="calendar" label="Записей" value={String(w.count)} delta={w.asOf ? `Последняя ${formatDay(w.asOf)}` : undefined} />
      </div>
      <Button block icon="plus" onClick={() => setOpen(true)}>Записать вес</Button>
      <div className="section-title"><h2 className="t-h3">Последние записи</h2></div>
      <Card flat>
        {history.map((m) => (
          <div className="hist" key={m.id}>
            <span className="grow">{formatDateLong(m.measuredOn)}</span>
            <strong>{kg(m.value)}</strong>
            <IconButton icon="trash" label={`Удалить запись от ${formatDay(m.measuredOn)}`} tone="ghost" onClick={() => void act((d) => deleteMetric(d, m.id))} />
          </div>
        ))}
      </Card>
      <AddWeightSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MeasurementsTab() {
  const { snapshot: s } = useData();
  const [open, setOpen] = useState(false);
  const goal = s.primaryGoal?.type;
  const present = BODY_MEASUREMENTS.filter((t) => (s.series[t]?.length ?? 0) > 0);
  return (
    <>
      {present.length === 0 ? (
        <Card flat>
          <EmptyState icon="ruler" title="Замеров пока нет" text="Грудь, талия, бицепс и бедро показывают изменения, которых не видно на весах." action={<Button icon="plus" onClick={() => setOpen(true)}>Добавить замер</Button>} />
        </Card>
      ) : (
        <>
          <div className="grid-2">
            {present.map((t) => {
              const sum = summarizeSeries(s.series[t]);
              const tone = deltaTone(t, sum.deltaPrevious, goal);
              return (
                <MetricCard key={t} icon="ruler" label={METRIC_LABELS[t]} value={cm(sum.latest!.value)} tone={tone} tint delta={sum.deltaPrevious !== null ? `${signed(sum.deltaPrevious)}${NBSP}см` : 'Первый замер'} onClick={() => go(`progress/measurements/${t}`)} />
              );
            })}
          </div>
          <Button block variant="secondary" icon="plus" onClick={() => setOpen(true)}>Добавить замер</Button>
        </>
      )}
      <AddMeasurementSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MeasurementDetail({ type }: { type: MetricType }) {
  const { snapshot: s, act } = useData();
  const [open, setOpen] = useState(false);
  const list = s.series[type] ?? [];
  const sum = summarizeSeries(list);
  const tone = deltaTone(type, sum.deltaFirst, s.primaryGoal?.type);
  const history = [...s.metrics].filter((m) => m.type === type).sort((a, b) => (a.measuredOn < b.measuredOn ? 1 : a.measuredOn > b.measuredOn ? -1 : 1)).slice(0, 20);
  return (
    <main className="screen">
      <ScreenHeader title={METRIC_LABELS[type] ?? 'Замер'} back="progress/measurements" />
      {sum.latest ? (
        <Card>
          <div className="t-num">{fmt(sum.latest.value)}<span className="t-h3 muted"> см</span></div>
          {sum.deltaFirst !== null && <div className={`t-caption tone-${tone}`}>{signed(sum.deltaFirst)}{NBSP}см с {formatDateLong(sum.first!.date)}</div>}
          {list.length >= 2 ? (
            <div style={{ marginTop: 10 }}>
              <LineChart ariaLabel={`График: ${METRIC_LABELS[type]}`} series={[{ id: 'v', label: METRIC_LABELS[type], color: '#16a34a', area: true, dots: true, points: list.map((p) => ({ date: p.date, value: p.value })) }]} formatY={(v) => fmt(v, 0)} formatX={formatDateShort} formatTip={(p) => `${fmt(p.value)} см · ${formatDateShort(p.date)}`} />
            </div>
          ) : (
            <p className="note" style={{ marginTop: 8 }}>График появится после второго замера.</p>
          )}
        </Card>
      ) : (
        <EmptyState icon="ruler" title="Замеров пока нет" />
      )}
      <Button block icon="plus" onClick={() => setOpen(true)}>Добавить замер</Button>
      <Card flat>
        {history.map((m) => (
          <div className="hist" key={m.id}>
            <span className="grow">{formatDateLong(m.measuredOn)}</span>
            <strong>{cm(m.value)}</strong>
            <IconButton icon="trash" label={`Удалить замер от ${formatDay(m.measuredOn)}`} tone="ghost" onClick={() => void act((d) => deleteMetric(d, m.id))} />
          </div>
        ))}
      </Card>
      <AddMeasurementSheet open={open} onClose={() => setOpen(false)} type={type} />
    </main>
  );
}

const LEVEL_TEXT: Record<VolumeLevel, string> = { low: 'мало', some: 'немного', good: 'в норме', high: 'много' };

function VolumeCard() {
  const { snapshot: s } = useData();
  const rows = s.muscleVolume;
  if (rows.length === 0) return null;
  const max = Math.max(24, ...rows.map((r) => r.sets));
  return (
    <Card>
      <div className="stack">
        <div className="t-h3">Объём по мышцам за 7 дней</div>
        <p className="t-small">Рабочие подходы: основная мышца считается за 1, вспомогательная за 0,5. Для роста обычно хватает 10–20 подходов на мышцу в неделю.</p>
        {rows.map((r) => (
          <div key={r.muscle} className="vol-row">
            <span className="vol-name">{MUSCLE_LABELS[r.muscle] ?? r.muscle}</span>
            <span className="vol-bar" aria-hidden="true"><span className={`vol-fill ${r.level}`} style={{ width: `${Math.min(100, (r.sets / max) * 100)}%` }} /><span className="vol-band" style={{ left: `${(10 / max) * 100}%`, width: `${(10 / max) * 100}%` }} /></span>
            <span className="vol-num">{fmt(r.sets, r.sets % 1 ? 1 : 0)}</span>
            <span className={`vol-lvl ${r.level}`}>{LEVEL_TEXT[r.level]}</span>
          </div>
        ))}
        <p className="t-small">Серая полоса: рабочий диапазон 10–20. Неделей раньше: {rows.filter((r) => r.prevSets > 0).slice(0, 4).map((r) => `${(MUSCLE_LABELS[r.muscle] ?? r.muscle).toLowerCase()} ${fmt(r.prevSets, r.prevSets % 1 ? 1 : 0)}`).join(', ') || 'нет данных'}.</p>
      </div>
    </Card>
  );
}

const tonnes = (kgValue: number): string => (getWeightUnit() === 'lb' ? `${fmt(Math.round(toLift(kgValue)), 0)} lb` : kgValue >= 10_000 ? `${fmt(kgValue / 1000, 1)} т` : `${fmt(kgValue, 0)} кг`);

/** Compares two numbers in words, in the person's own direction. */
function trend(cur: number, prev: number): { text: string; tone: 'good' | 'bad' | 'flat' } {
  if (prev === 0 && cur === 0) return { text: 'пока нет данных', tone: 'flat' };
  if (prev === 0) return { text: 'в прошлом месяце за это время ничего не было', tone: 'good' };
  const d = ((cur - prev) / prev) * 100;
  if (Math.abs(d) < 3) return { text: 'примерно как в прошлом месяце', tone: 'flat' };
  return d > 0 ? { text: `на ${fmt(d, 0)}% больше, чем за те же дни прошлого месяца`, tone: 'good' } : { text: `на ${fmt(-d, 0)}% меньше, чем за те же дни прошлого месяца`, tone: 'bad' };
}

function AnalyticsTab() {
  const { snapshot: s } = useData();
  const done = s.workouts.filter((w) => w.completed && w.sets > 0);
  const perWeek = s.profile ? trainingDays(s.profile.trainingSchedule).length : 3;
  if (done.length === 0) {
    return (
      <Card flat>
        <EmptyState icon="training" title="Аналитика появится после первых тренировок" text="Здесь будут тренировки за месяц, объём в сравнении с прошлым месяцем, регулярность и рост силы." action={<Button variant="secondary" icon="training" onClick={() => go('training')}>К тренировкам</Button>} />
      </Card>
    );
  }
  const m = compareMonths(done, s.today);
  const level = trainingLevel({ count: done.filter((w) => w.date > addDays(s.today, -28)).length, perWeek });
  const streak = planStreakWeeks(done, s.today, perWeek);
  const plannedSoFar = Math.round((perWeek * m.day) / 7);
  const cnt = trend(m.current.workouts, m.previousSamePeriod.workouts);
  const vol = trend(m.current.tonnageKg, m.previousSamePeriod.tonnageKg);
  const sets = trend(m.current.sets, m.previousSamePeriod.sets);
  const growth = [...s.strength].filter((e) => e.e1rmDeltaPct !== null && e.sessions.length >= 2).sort((a, b) => (b.e1rmDeltaPct ?? 0) - (a.e1rmDeltaPct ?? 0));
  const weak = s.muscleVolume.filter((r) => r.level === 'low' || r.level === 'some');
  const avgSets = m.current.workouts > 0 ? Math.round(m.current.sets / m.current.workouts) : 0;
  return (
    <div className="stack">
      <Card>
        <div className="stack">
          <div className="t-h3">Тренировки в этом месяце</div>
          <div className="t-num">{m.current.workouts}<span className="t-h3 muted"> из ~{plannedSoFar} по плану на сегодня</span></div>
          <div className={`t-caption tone-${cnt.tone}`}>{m.current.workouts} против {m.previousSamePeriod.workouts} за те же {m.day} {plural(m.day, ['день', 'дня', 'дней'])} прошлого месяца: {cnt.text}</div>
          <p className="t-small">Весь прошлый месяц: {m.previousFull.workouts} {plural(m.previousFull.workouts, ['тренировка', 'тренировки', 'тренировок'])}. Сравниваем одинаковые отрезки, а не неполный месяц с полным.</p>
        </div>
      </Card>
      <Card>
        <div className="stack">
          <div className="t-h3">Объём тренировок</div>
          <div className="t-num">{tonnes(m.current.tonnageKg)}</div>
          <div className={`t-caption tone-${vol.tone}`}>{m.current.tonnageKg > m.previousSamePeriod.tonnageKg && m.previousSamePeriod.tonnageKg > 0 ? 'Объём в этом месяце выше, чем в прошлом' : m.current.tonnageKg < m.previousSamePeriod.tonnageKg ? 'Объём в прошлом месяце выше, чем в этом' : 'Объём на уровне прошлого месяца'}: {vol.text}</div>
          <p className="t-small">Объём (тоннаж) — сумма «вес × повторения» по рабочим подходам. За те же дни прошлого месяца: {tonnes(m.previousSamePeriod.tonnageKg)}, за весь прошлый месяц: {tonnes(m.previousFull.tonnageKg)}. Для роста важна не одна цифра, а тенденция: объём растёт или держится при хорошем самочувствии.</p>
          <div className="hist"><span className="grow">Подходов в этом месяце</span><strong>{m.current.sets}</strong><span className={`tone-${sets.tone}`}>{m.previousSamePeriod.sets} раньше</span></div>
          {avgSets > 0 && <div className="hist"><span className="grow">Подходов за тренировку в среднем</span><strong>{avgSets}</strong></div>}
        </div>
      </Card>
      <Card>
        <div className="stack">
          <div className="t-h3">Регулярность</div>
          <div className="hist"><span className="grow">Уровень за 4 недели</span><strong>{level.count} из {level.planned}</strong></div>
          <p className="t-small">{level.label[0]!.toUpperCase() + level.label.slice(1)}</p>
          <div className="hist"><span className="grow">Недель подряд с выполненным планом</span><strong>{streak}</strong></div>
          <p className="t-small">Неделя засчитывается, если тренировок не меньше, чем дней в расписании ({perWeek}).</p>
        </div>
      </Card>
      {growth.length > 0 && (
        <Card>
          <div className="stack">
            <div className="t-h3">Где растёт сила</div>
            {growth.slice(0, 3).map((e) => (
              <div key={e.exerciseId} className="hist"><span className="grow">{s.exerciseNames[e.exerciseId] ?? e.exerciseId}</span><strong className={(e.e1rmDeltaPct ?? 0) > 0 ? 'tone-good' : 'tone-flat'}>{signed(e.e1rmDeltaPct ?? 0)}{NBSP}%</strong></div>
            ))}
            {growth.length > 3 && growth[growth.length - 1]!.e1rmDeltaPct! <= 0 && <p className="t-small">Стоит на месте или снизилось: {growth.filter((e) => (e.e1rmDeltaPct ?? 0) <= 0).slice(0, 3).map((e) => (s.exerciseNames[e.exerciseId] ?? e.exerciseId).toLowerCase()).join(', ')}. Это повод проверить сон, питание и технику, а не паниковать.</p>}
            <p className="t-small">Изменение расчётного максимума (e1RM) с первой записи упражнения.</p>
          </div>
        </Card>
      )}
      {weak.length > 0 && (
        <Card>
          <div className="stack">
            <div className="t-h3">Мало нагрузки за неделю</div>
            <p className="t-body">{weak.map((r) => (MUSCLE_LABELS[r.muscle] ?? r.muscle).toLowerCase()).join(', ')}.</p>
            <p className="t-small">Меньше 10 рабочих подходов на мышцу за 7 дней. Подробнее на вкладке «Сила».</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function StrengthTab() {
  const { snapshot: s } = useData();
  if (s.strength.length === 0) {
    return (
      <Card flat>
        <EmptyState icon="training" title="Силовых показателей пока нет" text="Они появятся после первых записанных тренировок: вес, повторения и расчётная сила по каждому упражнению. Старые данные можно перенести через «Экспорт и импорт» (резервная копия этого приложения или Excel), но это не обязательно." action={<Button variant="secondary" icon="training" onClick={() => go('training')}>К тренировкам</Button>} />
      </Card>
    );
  }
  const fresh = s.strength.filter((e) => e.records.newOnLast);
  return (
    <div className="stack">
      {fresh.length > 0 && (
        <Card>
          <div className="stack">
            <div className="t-h3">🏆 Новые рекорды</div>
            {fresh.map((e) => (
              <div key={e.exerciseId} className="hist">
                <span className="grow">{s.exerciseNames[e.exerciseId] ?? e.exerciseId}</span>
                <strong>e1RM {liftNum(e.records.e1rm.kg)}{NBSP}{liftUnit()}</strong>
              </div>
            ))}
            <p className="t-small">e1RM — расчётный максимум на одно повторение. Это оценка по подходам, а не проверенный максимум.</p>
          </div>
        </Card>
      )}
      <VolumeCard />
      <div className="list">
        {s.strength.map((e) => (
          <ListItem
            key={e.exerciseId}
            icon="training"
            title={s.exerciseNames[e.exerciseId] ?? e.exerciseId}
            subtitle={`e1RM ${liftNum(e.lastE1rmKg)} ${liftUnit()} · ${e.sessions.length} ${plural(e.sessions.length, ['тренировка', 'тренировки', 'тренировок'])} · лучший вес ${liftKg(e.records.weight.kg)}`}
            trailing={e.e1rmDeltaPct !== null ? <span className={e.e1rmDeltaPct > 0 ? 'tone-good' : e.e1rmDeltaPct < 0 ? 'tone-bad' : 'tone-flat'}>{signed(e.e1rmDeltaPct)}{NBSP}%</span> : undefined}
            onClick={() => go(`progress/strength/${encodeURIComponent(e.exerciseId)}`)}
          />
        ))}
      </div>
    </div>
  );
}

function StrengthDetail({ exerciseId }: { exerciseId: string }) {
  const { snapshot: s } = useData();
  const e = s.strength.find((x) => x.exerciseId === exerciseId);
  const name = s.exerciseNames[exerciseId] ?? exerciseId;
  if (!e) {
    return (
      <main className="screen">
        <ScreenHeader title={name} back="progress/strength" />
        <EmptyState icon="training" title="Нет данных по этому упражнению" />
      </main>
    );
  }
  return (
    <main className="screen">
      <ScreenHeader title={name} back="progress/strength" />
      <Card>
        <div className="t-caption">Расчётный максимум (e1RM)</div>
        <div className="t-num">{liftNum(e.lastE1rmKg)}<span className="t-h3 muted"> {liftUnit()}</span></div>
        {e.e1rmDeltaPct !== null && <div className={`t-caption ${e.e1rmDeltaPct > 0 ? 'tone-good' : e.e1rmDeltaPct < 0 ? 'tone-bad' : 'tone-flat'}`}>{signed(e.e1rmDeltaPct)}{NBSP}% с {formatDateLong(e.sessions[0]!.date)}</div>}
        {e.sessions.length >= 2 && (
          <div style={{ marginTop: 10 }}>
            <LineChart ariaLabel={`Расчётный максимум: ${name}`} series={[{ id: 'e', label: 'e1RM', color: '#a78bfa', area: true, dots: true, points: e.sessions.map((x) => ({ date: x.date, value: toLift(x.e1rmKg) })) }]} formatY={(v) => fmt(v, 0)} formatX={formatDateShort} formatTip={(p) => `${fmt(p.value)} ${liftUnit()} · ${formatDateShort(p.date)}`} />
          </div>
        )}
        <p className="t-small" style={{ marginTop: 8 }}>Оценка по формуле Эпли: вес × (1 + повторения / 30). Лучше всего работает до 12 повторений: в длинных подходах оценка менее точна, поэтому такие подходы в расчёт не берутся.</p>
      </Card>
      <Card flat>
        <div className="stack">
          <div className="t-h3">🏆 Рекорды</div>
          <div className="hist"><span className="grow">Расчётный максимум</span><strong>{liftNum(e.records.e1rm.kg)}{NBSP}{liftUnit()}</strong><span className="muted">{formatDateShort(e.records.e1rm.date)}</span></div>
          <div className="hist"><span className="grow">Самый тяжёлый подход</span><strong>{fmt(e.records.weight.kg)}{NBSP}×{NBSP}{e.records.weight.reps}</strong><span className="muted">{formatDateShort(e.records.weight.date)}</span></div>
          <div className="hist"><span className="grow">Максимум тоннажа за тренировку</span><strong>{liftNum(e.records.volume.kg, 0)}{NBSP}{liftUnit()}</strong><span className="muted">{formatDateShort(e.records.volume.date)}</span></div>
        </div>
      </Card>
      <Card>
        <div className="t-caption">Лучший вес за тренировку</div>
        <div className="t-num">{liftNum(e.lastTopWeightKg)}<span className="t-h3 muted"> {liftUnit()}</span></div>
        {e.sessions.length >= 2 && (
          <div className={`t-caption ${e.deltaKg > 0 ? 'tone-good' : e.deltaKg < 0 ? 'tone-bad' : 'tone-flat'}`}>
            {liftSigned(e.deltaKg)}{e.deltaPct !== null ? ` (${signed(e.deltaPct)}%)` : ''} с {formatDateLong(e.sessions[0]!.date)}
          </div>
        )}
        {e.sessions.length >= 2 ? (
          <div style={{ marginTop: 10 }}>
            <LineChart ariaLabel={`График: ${name}`} series={[{ id: 'w', label: 'Вес', color: '#16a34a', area: true, dots: true, points: e.sessions.map((x) => ({ date: x.date, value: toLift(x.topWeightKg) })) }]} formatY={(v) => fmt(v, 0)} formatX={formatDateShort} formatTip={(p) => `${fmt(p.value)} ${liftUnit()} · ${formatDateShort(p.date)}`} />
          </div>
        ) : (
          <p className="note" style={{ marginTop: 8 }}>График появится после второй тренировки.</p>
        )}
      </Card>
      <Card flat>
        {[...e.sessions].reverse().map((x) => (
          <div className="hist" key={x.date}>
            <span className="grow">{formatDateLong(x.date)}</span>
            <span className="muted">{x.sets} {plural(x.sets, ['подход', 'подхода', 'подходов'])}</span>
            <strong>{fmt(x.topWeightKg)}{NBSP}×{NBSP}{x.repsAtTop}</strong>
          </div>
        ))}
      </Card>
      <p className="note"><Icon name="info" size={14} /> RIR у импортированных подходов не указан: мы его не придумываем.</p>
    </main>
  );
}
