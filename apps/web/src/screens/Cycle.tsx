import { useEffect, useState } from 'react';
import { cycleStatus, DEFAULT_CYCLE, isLocalDate, learnedCycleLength, type CycleMode, type CycleSettings, type Feeling, type Symptom } from '@fitapp/domain';
import { markPeriodStart, saveCycle, setFeeling } from '../actions';
import { useData } from '../app/DataContext';
import { CYCLE_SOURCES, FEELING_LABEL, PHASES, RED_FLAGS, SYMPTOM_LABEL, trainingAdvice } from '../app/cycleContent';
import { fmt, formatDateLong, formatDay, plural } from '../app/format';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Button, Card, Chip, Icon, Segmented, Switch, TextField } from '../ui';
import { DateField, parseDecimal, ScreenHeader } from './shared';

/** Women who turned the cycle on see it everywhere it matters. */
export function useCycle() {
  const { snapshot: s } = useData();
  const settings = s.profile?.cycle;
  const female = s.profile?.sex === 'female';
  const status = cycleStatus(settings, s.today);
  return { female, settings, status, enabled: female && !!settings?.enabled, today: s.today };
}

const statusLine = (status: ReturnType<typeof cycleStatus>, manual: boolean): string => {
  if (!status.known) return 'Укажи дату начала месячных';
  if (status.phase === null) return manual ? 'Месячных сейчас нет' : 'Укажи дату начала месячных';
  const info = PHASES[status.phase];
  return manual ? `${info.title}, день ${status.day}` : `${info.title} · день ${status.day}`;
};

/** A tile in the profile, under "Отпуск": shown to women only. */
export function CycleTile() {
  const { female, settings, status } = useCycle();
  if (!female) return null;
  const on = !!settings?.enabled;
  return (
    <button type="button" className="cycle-tile" onClick={() => go('profile/cycle')}>
      <span className="vb-ic" aria-hidden="true">{on && status.phase ? PHASES[status.phase].emoji : '🌸'}</span>
      <span className="grow">
        <span className="li-title" style={{ display: 'block' }}>Цикл</span>
        <span className="t-small">{on ? statusLine(status, settings?.mode === 'manual') : 'Выключено. Включи, чтобы тренировки и советы учитывали цикл'}</span>
      </span>
      <Icon name="chevronRight" size={18} />
    </button>
  );
}

/** On the home screen: how the body feels today and what to do with training. */
export function FeelingCard() {
  const { snapshot: s } = useData();
  const { enabled, settings, status, today } = useCycle();
  const { run, banner, busy } = useCommand();
  if (!enabled) return null;
  const feeling = s.feeling;
  const symptoms = s.symptoms;
  const set = (f: Feeling | null, sy: Symptom[]) => void run((d) => setFeeling(d, today, f, sy));
  const advice = trainingAdvice(status.phase, status.pms, feeling);
  const manual = settings?.mode === 'manual';
  return (
    <Card>
      <div className="stack">
        <button type="button" className="cycle-head" onClick={() => go('profile/cycle')} aria-label="Цикл: подробности">
          <span className="ds-emoji" aria-hidden="true">{status.phase ? PHASES[status.phase].emoji : '🌸'}</span>
          <span className="grow">
            <span className="t-caption" style={{ display: 'block' }}>Цикл</span>
            <span className="t-h3">{statusLine(status, manual)}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </button>
        {banner}
        {status.needsUpdate && (
          <div className="note">
            Месячные должны были начаться {status.nextStart ? formatDay(status.nextStart) : 'недавно'}. Если они начались, отметь это, и советы станут точнее.
            <div style={{ marginTop: 8 }}><Button size="sm" disabled={busy} onClick={() => void run((d) => markPeriodStart(d, today))}>Начались сегодня</Button></div>
          </div>
        )}
        <div className="field">
          <span className="lbl">Как самочувствие сегодня?</span>
          <div className="chips" role="group" aria-label="Самочувствие">
            {(Object.keys(FEELING_LABEL) as Feeling[]).map((f) => (
              <Chip key={f} pressed={feeling === f} onClick={() => !busy && set(feeling === f ? null : f, symptoms)}>{FEELING_LABEL[f]}</Chip>
            ))}
          </div>
        </div>
        {(feeling !== null || status.phase === 'menstrual' || status.pms) && (
          <div className="field">
            <span className="lbl">Что беспокоит</span>
            <div className="chips" role="group" aria-label="Симптомы">
              {(Object.keys(SYMPTOM_LABEL) as Symptom[]).map((x) => (
                <Chip key={x} pressed={symptoms.includes(x)} onClick={() => !busy && set(feeling, symptoms.includes(x) ? symptoms.filter((y) => y !== x) : [...symptoms, x])}>{SYMPTOM_LABEL[x]}</Chip>
              ))}
            </div>
          </div>
        )}
        <p className="t-body">{advice.text}</p>
        {status.phase && <p className="t-small">{PHASES[status.phase].nutrition}</p>}
      </div>
    </Card>
  );
}

/** On the training tab: what the cycle means for training today; offers the lighter workout when the body asks for it. */
export function CycleTrainingHint({ onLight, busy }: { onLight?: () => void; busy: boolean }) {
  const { snapshot: s } = useData();
  const { enabled, status } = useCycle();
  if (!enabled || !status.phase) return null;
  const advice = trainingAdvice(status.phase, status.pms, s.feeling);
  const info = PHASES[status.phase];
  return (
    <Card>
      <div className="stack">
        <div className="row"><span className="ds-emoji" aria-hidden="true">{info.emoji}</span><div className="t-h3">{info.title}{status.day ? `, день ${status.day}` : ''}</div></div>
        <p className="t-body">{advice.text}</p>
        <p className="t-small">{info.training}</p>
        {advice.light && onLight && <Button size="sm" icon="play" disabled={busy} onClick={onLight}>Начать облегчённую тренировку</Button>}
        <Button size="sm" variant="text" onClick={() => go('profile/cycle')}>Всё о цикле</Button>
      </div>
    </Card>
  );
}

export function CycleScreen() {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const cur = s.profile?.cycle ?? DEFAULT_CYCLE;
  const [enabled, setEnabled] = useState(cur.enabled);
  const [mode, setMode] = useState<CycleMode>(cur.mode);
  const [start, setStart] = useState(cur.lastPeriodStart ?? '');
  const [len, setLen] = useState(String(cur.cycleLengthDays));
  const [period, setPeriod] = useState(String(cur.periodLengthDays));
  const [manualOn, setManualOn] = useState(!!cur.manualSince);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setSaved(false); }, [enabled, mode, start, len, period, manualOn]);
  if (s.profile?.sex !== 'female') {
    return (
      <main className="screen no-nav">
        <ScreenHeader title="Цикл" back="profile" />
        <p className="note">Блок появляется, когда в личных данных выбран женский пол.</p>
      </main>
    );
  }
  const L = parseDecimal(len);
  const P = parseDecimal(period);
  const draft: CycleSettings = {
    ...cur,
    enabled,
    mode,
    lastPeriodStart: isLocalDate(start) ? start : null,
    cycleLengthDays: Number.isFinite(L) ? Math.round(L) : cur.cycleLengthDays,
    periodLengthDays: Number.isFinite(P) ? Math.round(P) : cur.periodLengthDays,
    manualSince: manualOn ? (cur.manualSince ?? s.today) : null,
  };
  const status = cycleStatus(draft, s.today);
  const learned = learnedCycleLength([...cur.history, ...(cur.lastPeriodStart ? [cur.lastPeriodStart] : [])]);
  const save = async () => {
    if (enabled && mode === 'dates' && !draft.lastPeriodStart) return setErr('Укажи первый день последних месячных');
    if (!Number.isFinite(L) || L < 21 || L > 45) return setErr('Длина цикла: от 21 до 45 дней');
    if (!Number.isFinite(P) || P < 2 || P > 10) return setErr('Длительность месячных: от 2 до 10 дней');
    setErr(null);
    if (await ok((d) => saveCycle(d, draft))) setSaved(true);
  };
  const info = status.phase ? PHASES[status.phase] : null;
  const hist = [...cur.history, ...(cur.lastPeriodStart ? [cur.lastPeriodStart] : [])].sort().slice(-6).reverse();
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Цикл" back="profile" />
      <p className="note">Приложение подскажет, как нагрузка и питание связаны с фазой цикла, и предложит облегчённую тренировку, когда самочувствие плохое. Это ориентир, а не медицинская оценка: цикл у каждой свой и меняется от месяца к месяцу. Данные хранятся в профиле на этом телефоне и входят в резервную копию.</p>
      <Switch checked={enabled} onChange={setEnabled} label="Учитывать цикл" hint="Блок самочувствия на «Сегодня» и советы в «Тренировках»" />
      {enabled && (
        <>
          <div className="field">
            <span className="lbl">Как отслеживать</span>
            <Segmented<CycleMode> label="Режим" options={[{ value: 'dates', label: 'По дате' }, { value: 'manual', label: 'Вручную' }]} value={mode} onChange={setMode} />
          </div>
          {mode === 'dates' ? (
            <div className="stack">
              <DateField label="Первый день последних месячных" value={start} onChange={setStart} max={s.today} />
              <div className="grid-2">
                <TextField label="Длина цикла" unit="дн" inputMode="numeric" value={len} onChange={(e) => setLen(e.target.value)} hint={learned ? `По твоим отметкам в среднем ${learned}` : 'Обычно 28'} />
                <TextField label="Месячные длятся" unit="дн" inputMode="numeric" value={period} onChange={(e) => setPeriod(e.target.value)} hint="Обычно 4–6" />
              </div>
              <Button variant="secondary" icon="plus" disabled={busy} onClick={() => void ok((d) => markPeriodStart(d, s.today)).then((r) => r && setStart(s.today))}>Месячные начались сегодня</Button>
              <p className="t-small">После новой отметки приложение запоминает прошлые и со временем само уточняет длину цикла.</p>
            </div>
          ) : (
            <div className="stack">
              <Switch checked={manualOn} onChange={setManualOn} label="Сейчас месячные" hint="Включи, когда начались, и выключи, когда закончились" />
              <p className="t-small">В этом режиме приложение знает только, идут ли месячные. Остальные фазы не определяются.</p>
            </div>
          )}
          {banner}
          {err && <div className="errbox" role="alert">{err}</div>}
          {saved && <div className="ok" role="status">Сохранено</div>}
          <Button block disabled={busy} onClick={() => void save()}>Сохранить</Button>
        </>
      )}
      {!enabled && (
        <>
          {err && <div className="errbox" role="alert">{err}</div>}
          {saved && <div className="ok" role="status">Сохранено</div>}
          <Button block disabled={busy} onClick={() => void save()}>Сохранить</Button>
        </>
      )}

      {enabled && info && (
        <Card>
          <div className="stack">
            <div className="row"><span className="ds-emoji" aria-hidden="true">{info.emoji}</span><div><div className="t-h3">Сейчас: {info.title}</div><div className="t-small">{status.day ? `День ${status.day}` : ''}{status.daysToNext !== null && status.nextStart ? ` · следующие месячные около ${formatDay(status.nextStart)} (через ${status.daysToNext} ${plural(status.daysToNext, ['день', 'дня', 'дней'])})` : ''}</div></div></div>
            <p className="t-body">{info.what}</p>
            <div><div className="t-caption">Тренировки</div><p className="t-body">{info.training}</p></div>
            <div><div className="t-caption">Питание</div><p className="t-body">{info.nutrition}</p></div>
            {info.tips.map((t) => <p key={t} className="t-small"><Icon name="info" size={14} /> {t}</p>)}
          </div>
        </Card>
      )}

      {enabled && (
        <Card flat>
          <div className="stack">
            <div className="t-h3">Фазы цикла</div>
            {(Object.keys(PHASES) as Array<keyof typeof PHASES>).map((k) => (
              <div key={k}>
                <div className="t-caption">{PHASES[k].emoji} {PHASES[k].title}</div>
                <p className="t-small">{PHASES[k].training}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {hist.length > 0 && (
        <Card flat>
          <div className="stack">
            <div className="t-h3">Отметки о начале месячных</div>
            {hist.map((h) => <div key={h} className="t-small">{formatDateLong(h)}</div>)}
            {learned && <p className="t-small">Средняя длина цикла по отметкам: {fmt(learned, 0)} {plural(learned, ['день', 'дня', 'дней'])}.</p>}
          </div>
        </Card>
      )}

      <Card flat>
        <div className="stack">
          <div className="t-h3">Когда к врачу</div>
          <ul className="t-small">{RED_FLAGS.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="t-small">Приложение не ставит диагнозов и не заменяет врача.</p>
          <div className="t-caption">Источники</div>
          <ul className="t-small">{CYCLE_SOURCES.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      </Card>
    </main>
  );
}
