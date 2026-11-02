import { analyzeInBody, type InBodyFinding } from '@fitapp/domain';
import { useData } from '../app/DataContext';
import { fmt, formatDateLong, formatDateShort, signed } from '../app/format';
import { go } from '../app/router';
import { Button, Card, EmptyState, Icon, LineChart, MetricCard, type ChartSeries } from '../ui';

const TONE_ICON: Record<InBodyFinding['tone'], 'check' | 'alert' | 'info'> = { good: 'check', warn: 'alert', bad: 'alert', info: 'info' };

/** «Прогресс → InBody»: what the added InBody tests say — the trend, the norms and the weak spots. */
export function InBodyTab() {
  const { snapshot: s } = useData();
  const targetKcal = (s.activeVersion?.nutrition ?? s.targets?.targets)?.kcal ?? null;
  const a = analyzeInBody(s.inbodyTests, s.profile?.sex ?? 'unspecified', targetKcal);
  if (!a) {
    return (
      <Card flat>
        <EmptyState icon="body" title="Тестов InBody пока нет" text="Добавь отчёт — отсканируй QR-код с распечатки или введи цифры. Здесь появится разбор: жир и мышцы против нормы, динамика между тестами и слабые места." action={<Button icon="plus" onClick={() => go('profile/inbody')}>Добавить тест</Button>} />
      </Card>
    );
  }
  const l = a.latest;
  const ch = a.sincePrev;
  const tests = [...s.inbodyTests].reverse();
  const series: ChartSeries[] = [
    { id: 'muscle', label: 'Мышцы, кг', color: '#16a34a', width: 3, dots: true, points: tests.filter((t) => t.skeletalMuscleKg !== null).map((t) => ({ date: t.measuredOn, value: t.skeletalMuscleKg as number })) },
    { id: 'fat', label: 'Жир, кг', color: '#f59e0b', width: 3, dots: true, points: tests.filter((t) => t.bodyFatKg !== null).map((t) => ({ date: t.measuredOn, value: t.bodyFatKg as number })) },
  ];
  const delta = (v: number | null | undefined) => (v === null || v === undefined || !ch ? undefined : `${signed(v)} кг за ${ch.days} дн.`);
  return (
    <>
      <Card>
        <div className="row between">
          <span className="t-h3">Последний тест</span>
          <span className="t-small">{formatDateLong(l.measuredOn)}</span>
        </div>
        {l.score !== null && <div className="t-num" style={{ marginTop: 6 }}>{fmt(l.score, 0)}<span className="t-h3 muted"> / 100 баллов</span></div>}
      </Card>
      <div className="grid-2">
        <MetricCard icon="training" label="Мышцы" value={l.skeletalMuscleKg !== null ? `${fmt(l.skeletalMuscleKg)} кг` : '—'} delta={delta(ch?.muscleKg)} tone={ch?.muscleKg ? (ch.muscleKg > 0 ? 'good' : 'bad') : 'flat'} />
        <MetricCard icon="flame" label="Жир" value={l.bodyFatPct !== null ? `${fmt(l.bodyFatPct)}%` : l.bodyFatKg !== null ? `${fmt(l.bodyFatKg)} кг` : '—'} delta={delta(ch?.fatKg)} tone={ch?.fatKg ? (ch.fatKg < 0 ? 'good' : 'bad') : 'flat'} />
        <MetricCard icon="body" label="Вес" value={`${fmt(l.weightKg)} кг`} delta={delta(ch?.weightKg)} />
        <MetricCard icon="target" label="Висцеральный жир" value={l.visceralFatLevel !== null ? `ур. ${fmt(l.visceralFatLevel, 0)}` : '—'} delta="норма до 9" />
      </div>
      {tests.length >= 2 && (
        <Card>
          <div className="t-h3">Мышцы и жир по тестам</div>
          <LineChart series={series} ariaLabel="Мышцы и жир по тестам InBody" formatY={(v) => fmt(v, 0)} formatX={formatDateShort} formatTip={(p) => `${fmt(p.value)} кг · ${formatDateShort(p.date)}`} />
          <div className="note" style={{ marginTop: 4 }}><span style={{ color: '#16a34a' }}>●</span> мышцы · <span style={{ color: '#f59e0b' }}>●</span> жир, кг</div>
        </Card>
      )}
      <div className="section-title"><h2 className="t-h3">Разбор</h2></div>
      <div className="stack">
        {a.findings.map((f) => (
          <Card key={f.id} flat className={`ib-find ${f.tone}`}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className={`ib-ic ${f.tone}`}><Icon name={TONE_ICON[f.tone]} size={18} /></span>
              <div className="grow">
                <div className="li-title">{f.title}</div>
                <p className="t-small" style={{ margin: '4px 0 0' }}>{f.text}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Button block variant="secondary" icon="body" onClick={() => go('profile/inbody')}>Все тесты и добавить новый</Button>
      <p className="note">Разбор — ориентир по нормам InBody, а не диагноз. Сравнивай тесты в одинаковых условиях: утром, натощак, до тренировки.</p>
    </>
  );
}
