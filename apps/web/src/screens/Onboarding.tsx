import { useState } from 'react';
import { ageYears, isLocalDate, type Experience, type FocusArea, type GoalType, type JobActivity, type BodyArea, type MetricType, type Sex, type TrainingSchedule, type Weekday } from '@fitapp/domain';
import { completeOnboarding } from '../actions';
import { useData } from '../app/DataContext';
import { EXPERIENCE_LABELS, JOB_LABELS, SEX_LABELS } from '../app/format';
import { setDisplayName } from '../app/prefs';
import { Button, Chip, Icon, ProgressBar, Segmented, SelectField, TextField } from '../ui';
import { FocusPicker, GoalPicker, WeekdayPicker } from './Profile';
import { DateField, parseDecimal } from './shared';

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
          <span className="mark"><Icon name="leaf" size={44} /></span>
          <h1>Fitapp</h1>
          <p className="tag">Здоровье. Сила. Прогресс.</p>
        </div>
        <div className="quote">
          <p>Лучшие результаты — это не случайность, а система.</p>
        </div>
        <svg className="peaks" viewBox="0 0 390 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <defs>
            <linearGradient id="onbHaze" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f3e3b8" stopOpacity="0" />
              <stop offset="0.55" stopColor="#f3e3b8" stopOpacity="0.55" />
              <stop offset="1" stopColor="#f3e3b8" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="onbFar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5f8a78" />
              <stop offset="1" stopColor="#2d5a4a" />
            </linearGradient>
            <linearGradient id="onbMid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3f6b56" />
              <stop offset="1" stopColor="#1f4a3a" />
            </linearGradient>
            <linearGradient id="onbNear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4a5a2e" />
              <stop offset="1" stopColor="#1c2a14" />
            </linearGradient>
          </defs>
          <rect x="0" y="118" width="390" height="46" fill="url(#onbHaze)" />
          <path d="M0 170 L40 150 L85 165 L130 140 L180 160 L230 135 L285 158 L335 142 L390 160 V300 H0 Z" fill="url(#onbFar)" />
          <path d="M0 200 L55 178 L110 196 L170 170 L235 192 L300 172 L350 186 L390 176 V300 H0 Z" fill="url(#onbMid)" />
          <path d="M0 300 V250 L60 236 L120 214 L175 176 L205 150 L222 142 L240 150 L275 186 L330 214 L390 232 V300 Z" fill="url(#onbNear)" />
          <g fill="#0b1209">
            <circle cx="222" cy="106" r="5" />
            <path d="M216 114 Q222 111 228 114 L230 132 L227 142 L225 125 L222 142 L219 125 L217 142 L214 132 Z" />
          </g>
        </svg>
        <div className="stack start">
          <Button variant="accent" block onClick={() => setStep(0)}>Начать</Button>
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
          <DateField label="Дата рождения" value={birth} max={snapshot.today} onChange={setBirth} />
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
