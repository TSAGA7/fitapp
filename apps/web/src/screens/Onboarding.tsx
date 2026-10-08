import { useState } from 'react';
import { ageYears, isLocalDate, type Experience, type FocusArea, type GoalType, type JobActivity, type BodyArea, type MetricType, type Sex, type TrainingSchedule, type Weekday } from '@fitapp/domain';
import { completeOnboarding } from '../actions';
import { useData } from '../app/DataContext';
import { EXPERIENCE_LABELS, JOB_LABELS, SEX_LABELS } from '../app/format';
import { setDisplayName } from '../app/prefs';
import { Button, Chip, Icon, ProgressBar, Segmented, SelectField, TextField } from '../ui';
import { FocusPicker, GoalPicker, WeekdayPicker } from './Profile';
import { parseDecimal } from './shared';

const MEASURES: ReadonlyArray<{ type: MetricType; label: string; hint?: string }> = [
  { type: 'chest', label: 'Грудь' },
  { type: 'waist', label: 'Талия' },
  { type: 'biceps_right', label: 'Бицепс (правая рука)' },
  { type: 'thigh_right', label: 'Бедро (правое)' },
  { type: 'calf_right', label: 'Икра (правая)', hint: 'Необязательно: икры измеряют редко' },
];

const browserZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const SCHEDULE: TrainingSchedule = { monday: true, tuesday: false, wednesday: true, thursday: false, friday: true, saturday: false, sunday: false };
const PAIN_CHOICES: ReadonlyArray<{ area: BodyArea; label: string }> = [
  { area: 'lower_back', label: 'Поясница' },
  { area: 'upper_back', label: 'Верх спины' },
  { area: 'shoulder', label: 'Плечо' },
  { area: 'neck', label: 'Шея' },
  { area: 'elbow', label: 'Локоть' },
  { area: 'knee', label: 'Колено' },
];

const STEPS = ['about', 'body', 'goal', 'training'] as const;

export function Onboarding() {
  const { snapshot, act } = useData();
  const [step, setStep] = useState<number>(-1); // -1 is the welcome screen
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [birth, setBirth] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [meas, setMeas] = useState<Partial<Record<MetricType, string>>>({});
  const [goal, setGoal] = useState<GoalType>('fat_loss');
  const [tw, setTw] = useState('');
  const [twaist, setTwaist] = useState('');
  const [focus, setFocus] = useState<FocusArea[]>([]);
  const [pain, setPain] = useState<BodyArea[]>([]);
  const [schedule, setSchedule] = useState<TrainingSchedule>(SCHEDULE);
  const [exp, setExp] = useState<Experience>('beginner');
  const [job, setJob] = useState<JobActivity>('sedentary');

  if (step === -1) {
    return (
      <div className="onb-welcome">
        <div className="logo">
          <span className="mark"><Icon name="leaf" size={38} /></span>
          <h1>Fitapp</h1>
          <p style={{ opacity: 0.85 }}>Здоровье. Сила. Прогресс.</p>
        </div>
        <div className="stack">
          <p style={{ opacity: 0.85, textAlign: 'center' }}>Питание, тренировки и прогресс в одном месте. Данные хранятся только на твоём устройстве и работают без интернета.</p>
          <Button variant="accent" block onClick={() => setStep(0)}>Ехала</Button>
        </div>
      </div>
    );
  }

  const optional = (s: string | undefined): number | null => (s && s.trim() ? parseDecimal(s) : null);
  const validate = (): string | null => {
    if (STEPS[step] === 'about') {
      if (!isLocalDate(birth)) return 'Укажи дату рождения';
      const age = ageYears(birth, snapshot.today);
      if (age < 18) return 'Приложение рассчитано на людей от 18 лет';
      if (age > 100) return 'Проверь дату рождения';
      const h = parseDecimal(height);
      if (!Number.isFinite(h) || h < 120 || h > 230) return 'Рост должен быть от 120 до 230 см';
    }
    if (STEPS[step] === 'body') {
      const w = parseDecimal(weight);
      if (!Number.isFinite(w) || w < 30 || w > 300) return 'Вес должен быть от 30 до 300 кг';
      for (const m of MEASURES) {
        const v = optional(meas[m.type]);
        if (v !== null && (!Number.isFinite(v) || v < 5 || v > 300)) return `«${m.label}»: обхват от 5 до 300 см`;
      }
    }
    if (STEPS[step] === 'goal') {
      const a = optional(tw);
      const b = optional(twaist);
      if (a !== null && (!Number.isFinite(a) || a < 30 || a > 300)) return 'Целевой вес: от 30 до 300 кг';
      if (b !== null && (!Number.isFinite(b) || b < 40 || b > 200)) return 'Целевая талия: от 40 до 200 см';
    }
    if (STEPS[step] === 'training') {
      const n = Object.values(schedule).filter(Boolean).length;
      if (n < 1 || n > 6) return 'Выбери от одного до шести дней';
    }
    return null;
  };

  const next = async () => {
    const problem = validate();
    setError(problem);
    if (problem) return;
    if (step < STEPS.length - 1) return setStep(step + 1);
    setBusy(true);
    try {
      setDisplayName(name);
      const measurements: Partial<Record<MetricType, number>> = {};
      for (const m of MEASURES) {
        const v = optional(meas[m.type]);
        if (v !== null) measurements[m.type] = v;
      }
      await act((deps) =>
        completeOnboarding(deps, {
          sex,
          birthDate: birth,
          heightCm: parseDecimal(height),
          weightKg: parseDecimal(weight),
          measurements,
          goalType: goal,
          focus,
          targetWeightKg: optional(tw),
          targetWaistCm: optional(twaist),
          schedule,
          experience: exp,
          jobActivity: job,
          timezone: browserZone(),
          painAreas: pain,
        }),
      );
      window.location.hash = '#/today';
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const titles = ['Расскажи о себе', 'Вес и замеры', 'Какая у тебя цель?', 'Тренировки'];
  return (
    <main className="onb">
      <div className="stack">
        <div className="row between">
          <button type="button" className="pill-link" onClick={() => (step === 0 ? setStep(-1) : setStep(step - 1))}><Icon name="chevronLeft" size={16} /> Назад</button>
          <span className="t-caption">Шаг {step + 1} из {STEPS.length}</span>
        </div>
        <ProgressBar value={(step + 1) / STEPS.length} label="Прогресс настройки" />
      </div>
      <h1 className="t-h1">{titles[step]}</h1>

      {STEPS[step] === 'about' && (
        <div className="stack-lg">
          <TextField label="Как к тебе обращаться" placeholder="Необязательно" value={name} onChange={(e) => setName(e.target.value)} hint="Имя хранится только на этом устройстве" />
          <div className="field"><span className="lbl">Пол</span><Segmented label="Пол" options={(Object.keys(SEX_LABELS) as Sex[]).map((v) => ({ value: v, label: SEX_LABELS[v] }))} value={sex} onChange={setSex} /><span className="hint">Нужен для расчёта энергии; можно не указывать.</span></div>
          <TextField label="Дата рождения" type="date" value={birth} max={snapshot.today} onChange={(e) => setBirth(e.target.value)} />
          <TextField label="Рост" unit="см" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
      )}
      {STEPS[step] === 'body' && (
        <div className="stack-lg">
          <TextField label="Вес сегодня" unit="кг" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} hint="Лучше всего утром, натощак" />
          <div className="stack">
            <h2 className="t-h3">Замеры (необязательно)</h2>
            <p className="note">Обхваты показывают изменения, которых не видно на весах. Измеряй в одно и то же время, не напрягая мышцы.</p>
            {MEASURES.map((m) => (
              <TextField key={m.type} label={m.label} unit="см" inputMode="decimal" value={meas[m.type] ?? ''} onChange={(e) => setMeas((x) => ({ ...x, [m.type]: e.target.value }))} hint={m.hint} />
            ))}
          </div>
        </div>
      )}
      {STEPS[step] === 'goal' && (
        <div className="stack-lg">
          <GoalPicker type={goal} onType={setGoal} />
          <div className="grid-2">
            <TextField label="Целевой вес" unit="кг" inputMode="decimal" value={tw} onChange={(e) => setTw(e.target.value)} placeholder="Необяз." />
            <TextField label="Целевая талия" unit="см" inputMode="decimal" value={twaist} onChange={(e) => setTwaist(e.target.value)} placeholder="Необяз." />
          </div>
          <FocusPicker focus={focus} onToggle={(a) => setFocus((f) => (f.includes(a) ? f.filter((x) => x !== a) : f.length < 3 ? [...f, a] : f))} />
        </div>
      )}
      {STEPS[step] === 'training' && (
        <div className="stack-lg">
          <div className="field"><span className="lbl">В какие дни тренируешься</span><WeekdayPicker schedule={schedule} onToggle={(d: Weekday) => setSchedule((x) => ({ ...x, [d]: !x[d] }))} /><span className="hint">От одного до шести дней в неделю.</span></div>
          <div className="field"><span className="lbl">Опыт тренировок</span><Segmented label="Опыт" options={(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((v) => ({ value: v, label: EXPERIENCE_LABELS[v] }))} value={exp} onChange={setExp} /></div>
          <div className="field">
            <span className="lbl">Что периодически беспокоит</span>
            <div className="chips" role="group" aria-label="Что беспокоит">
              {PAIN_CHOICES.map((c) => <Chip key={c.area} pressed={pain.includes(c.area)} onClick={() => setPain((p) => (p.includes(c.area) ? p.filter((x) => x !== c.area) : [...p, c.area]))}>{c.label}</Chip>)}
            </div>
            <span className="hint">Необязательно. Программа обойдёт тяжёлую нагрузку на эти места. Это не диагноз; детали можно уточнить в профиле.</span>
          </div>
          <SelectField label="Активность в течение дня" value={job} onChange={(e) => setJob(e.target.value as JobActivity)}>
            {(Object.keys(JOB_LABELS) as JobActivity[]).map((v) => <option key={v} value={v}>{JOB_LABELS[v]}</option>)}
          </SelectField>
        </div>
      )}
      {error && <div className="errbox" role="alert">{error}</div>}
      <Button block onClick={next} disabled={busy}>{step === STEPS.length - 1 ? 'Готово' : 'Дальше'}</Button>
    </main>
  );
}
