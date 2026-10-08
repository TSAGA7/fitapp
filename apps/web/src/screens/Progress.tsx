import { useState } from 'react';
import { addDays, movingAverage, summarizeSeries, type MetricType, type WeightPoint } from '@fitapp/domain';
import { deleteMetric } from '../actions';
import { useData } from '../app/DataContext';
import { BODY_MEASUREMENTS, cm, deltaTone, fmt, formatDateLong, formatDateShort, formatDay, kg, METRIC_LABELS, plural, signed } from '../app/format';
import { go } from '../app/router';
import { Button, Card, EmptyState, Icon, IconButton, LineChart, ListItem, MetricCard, Segmented, type ChartSeries } from '../ui';
import { AddMeasurementSheet, AddWeightSheet, ScreenHeader } from './shared';

const NBSP = '\u00a0';
type Tab = 'weight' | 'measurements' | 'strength';
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'weight', label: 'Вес' },
  { value: 'measurements', label: 'Замеры' },
  { value: 'strength', label: 'Сила' },
];

export function Progress({ route }: { route: string[] }) {
  const tab: Tab = route[1] === 'measurements' || route[1] === 'strength' ? route[1] : 'weight';
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
    w.monthChangeKg !== null ? `${signed(w.monthChangeKg)}${NBSP}кг · за 30 дней` : w.sinceStartKg !== null ? `${signed(w.sinceStartKg)}${NBSP}кг · за ${w.sinceStartDays}${NBSP}дн.` : 'Динамика появится после недели записей';
  const goingDown = s.primaryGoal?.targetWeightKg != null && w.currentKg > s.primaryGoal.targetWeightKg;
  const change = w.monthChangeKg ?? w.sinceStartKg;
  const tone = change === null || change === 0 ? 'flat' : (change < 0) === goingDown ? 'good' : 'flat';
  const history = [...s.metrics].filter((m) => m.type === 'weight').sort((a, b) => (a.measuredOn < b.measuredOn ? 1 : a.measuredOn > b.measuredOn ? -1 : a.createdAt < b.createdAt ? 1 : -1)).slice(0, 10);

  return (
    <>
      <Card>
        <div className="t-num">{fmt(w.currentKg)}<span className="t-h3 muted"> кг</span></div>
        <div className={`t-caption tone-${tone}`} style={{ marginTop: 2 }}>{delta}</div>
        <div className="range" style={{ margin: '12px 0 4px' }} role="group" aria-label="Период графика">
          {([[30, '30 дн'], [90, '90 дн'], [0, 'Всё']] as Array<[Range, string]>).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={range === v} onClick={() => setRange(v)}>{label}</button>
          ))}
        </div>
        <LineChart series={series} ariaLabel="График веса" formatY={(v) => fmt(v, 0)} formatX={formatDateShort} formatTip={(p) => `${fmt(p.value)} кг · ${formatDateShort(p.date)}`} />
        <div className="note" style={{ marginTop: 4 }}>Линия: среднее за 7 дней. Точки: отдельные взвешивания.</div>
      </Card>
      <div className="grid-2">
        <MetricCard icon="scale" label="Среднее 7 дн" value={w.avg7 !== null ? kg(w.avg7) : '—'} delta={w.weekChangeKg !== null ? `${signed(w.weekChangeKg)}${NBSP}кг к прошлой неделе` : undefined} />
        <MetricCard icon="scale" label="Среднее 30 дн" value={w.avg30 !== null ? kg(w.avg30) : '—'} />
        <MetricCard icon="trendDown" label="Темп в неделю" value={w.rateKgPerWeek !== null && w.rateReliable ? `${signed(w.rateKgPerWeek)}${NBSP}кг` : '—'} delta={!w.rateReliable ? 'Нужно 4+ записи за неделю' : undefined} />
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

function StrengthTab() {
  const { snapshot: s } = useData();
  if (s.strength.length === 0) {
    return (
      <Card flat>
        <EmptyState icon="training" title="Силовых показателей пока нет" text="Они появятся после первых записанных тренировок: вес, повторения и расчётная сила по каждому упражнению. Старые данные можно перенести через «Экспорт и импорт» (резервная копия этого приложения или Excel), но это не обязательно." action={<Button variant="secondary" icon="training" onClick={() => go('training')}>К тренировкам</Button>} />
      </Card>
    );
  }
  return (
    <div className="list">
      {s.strength.map((e) => (
        <ListItem
          key={e.exerciseId}
          icon="training"
          title={s.exerciseNames[e.exerciseId] ?? e.exerciseId}
          subtitle={`${e.sessions.length} ${plural(e.sessions.length, ['тренировка', 'тренировки', 'тренировок'])} · последний вес ${kg(e.lastTopWeightKg)}`}
          trailing={e.sessions.length >= 2 ? <span className={e.deltaKg > 0 ? 'tone-good' : e.deltaKg < 0 ? 'tone-bad' : 'tone-flat'}>{signed(e.deltaKg)}{NBSP}кг</span> : undefined}
          onClick={() => go(`progress/strength/${encodeURIComponent(e.exerciseId)}`)}
        />
      ))}
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
        <div className="t-caption">Лучший вес за тренировку</div>
        <div className="t-num">{fmt(e.lastTopWeightKg)}<span className="t-h3 muted"> кг</span></div>
        {e.sessions.length >= 2 && (
          <div className={`t-caption ${e.deltaKg > 0 ? 'tone-good' : e.deltaKg < 0 ? 'tone-bad' : 'tone-flat'}`}>
            {signed(e.deltaKg)}{NBSP}кг{e.deltaPct !== null ? ` (${signed(e.deltaPct)}%)` : ''} с {formatDateLong(e.sessions[0]!.date)}
          </div>
        )}
        {e.sessions.length >= 2 ? (
          <div style={{ marginTop: 10 }}>
            <LineChart ariaLabel={`График: ${name}`} series={[{ id: 'w', label: 'Вес', color: '#16a34a', area: true, dots: true, points: e.sessions.map((x) => ({ date: x.date, value: x.topWeightKg })) }]} formatY={(v) => fmt(v, 0)} formatX={formatDateShort} formatTip={(p) => `${fmt(p.value)} кг · ${formatDateShort(p.date)}`} />
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
