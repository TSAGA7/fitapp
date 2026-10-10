import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCommand } from '../app/useCommand';
import { ageYears, diffDays, isLocalDate, recommendTargetWeight, toLocalDate, type Experience, type FocusArea, type GoalType, type JobActivity, type Sex, type TrainingSchedule, type Weekday, WEEKDAYS } from '@fitapp/domain';
import { applyDietMode, saveGoal, updateProfile } from '../actions';
import { useData } from '../app/DataContext';
import { deleteMetric } from '../actions';
import { EXPERIENCE_LABELS, FOCUS_LABELS, formatDateLong, formatDay, fmt, fromUnit, GOAL_LABELS, initials, JOB_LABELS, kg, METRIC_LABELS, plural, SEX_LABELS, toUnit, wUnit, wnum, WEEKDAY_SHORT, cm } from '../app/format';
import { getDisplayName, setActivityBar, setDisplayName, setRestTimer, setTheme, setVacationMode, setWeightUnit, useActivityBar, useRestTimer, useTheme, useVacationMode, useWeightUnit, type ThemeChoice } from '../app/prefs';
import { go } from '../app/router';
import { Button, Card, Chip, Icon, IconButton, ListItem, Segmented, SelectField, TextField, type IconName } from '../ui';
import { CycleScreen, CycleTile } from './Cycle';
import { ExerciseCatalogScreen } from './ExerciseCatalog';
import { GoalExplainSheet } from './GoalExplain';
import { saveBackupFile } from '../app/backupFile';
import { ImportPanel } from './ImportPanel';
import { CardioGuideScreen } from './Cardio';
import { TvaGuideScreen } from './TvaGuide';
import { EquipmentScreen, FoodsScreen, InjuriesScreen, VersionsScreen } from './ProfileMore';
import { AddMeasurementSheet, AddWeightSheet, DateField, parseDecimal, RebuildOffer, ScreenHeader } from './shared';

export function Profile({ route }: { route: string[] }) {
  // Every profile screen opens from the very top, not at the scroll position of the previous one.
  useEffect(() => { window.scrollTo(0, 0); }, [route.join('/')]);
  switch (route[1]) {
    case 'settings':
      return <SettingsScreen />;
    case 'personal':
      return <Personal />;
    case 'goals':
      return <Goals />;
    case 'body':
      return <Body />;
    case 'schedule':
      return <Schedule />;
    case 'data':
      return <DataScreen />;
    case 'cycle':
      return <CycleScreen />;
    case 'autocopy':
      // Not linked from anywhere: the daily in-app copy works quietly in the background, this is only the way to reach it in an emergency.
      return <AutoCopyScreen />;
    case 'foods':
      return <FoodsScreen />;
    case 'equipment':
      return <EquipmentScreen />;
    case 'injuries':
      return <InjuriesScreen />;
    case 'versions':
      return <VersionsScreen />;
    case 'exercises':
      return <ExerciseCatalogScreen />;
    case 'tva':
      return <TvaGuideScreen />;
    case 'cardio':
      return <CardioGuideScreen />;
    default:
      return <ProfileHome />;
  }
}

const TILES: ReadonlyArray<{ icon: IconName; name: string; to?: string }> = [
  { icon: 'profile', name: 'Личные данные', to: 'profile/personal' },
  { icon: 'ruler', name: 'Замеры и вес', to: 'profile/body' },
  { icon: 'calendar', name: 'Расписание', to: 'profile/schedule' },
  { icon: 'basket', name: 'Продукты', to: 'profile/foods' },
  { icon: 'gear', name: 'Тренажёры', to: 'profile/equipment' },
  { icon: 'training', name: 'Каталог упражнений', to: 'profile/exercises' },
  { icon: 'leaf', name: 'Поперечная мышца', to: 'profile/tva' },
  { icon: 'heart', name: 'Кардио', to: 'profile/cardio' },
  { icon: 'shield', name: 'Болевые точки', to: 'profile/injuries' },
  { icon: 'download', name: 'Экспорт и импорт', to: 'profile/data' },
];

function ProfileHome() {
  const { snapshot: s } = useData();
  const p = s.profile!;
  const name = getDisplayName();
  const age = ageYears(p.birthDate, s.today);
  const goal = s.primaryGoal;
  const own = goal?.targetWeightKg ?? null;
  const recommended = goal && own === null && s.weight.currentKg !== null ? recommendTargetWeight({ sex: p.sex, heightCm: p.heightCm, weightKg: s.weight.currentKg, goal: goal.type, waistCm: [...s.metrics].filter((m) => m.type === 'waist' && m.deletedAt === null).sort((a, b) => (a.measuredOn < b.measuredOn ? 1 : -1))[0]?.value ?? null }).kg : null;
  const target = own ?? recommended;
  return (
    <main className="screen">
      <ScreenHeader title="Профиль" />
      <Card>
        <div className="row">
          <span className="avatar-lg" aria-hidden="true">{initials(name)}</span>
          <div className="grow">
            <div className="t-h2">{name || 'Мой профиль'}</div>
            <div className="t-caption">{age} {plural(age, ['год', 'года', 'лет'])} · {fmt(p.heightCm, 0)} см{s.weight.currentKg !== null ? ` · ${kg(s.weight.currentKg)}` : ''}</div>
          </div>
          <IconButton icon="gear" label="Настройки" onClick={() => go('profile/settings')} />
        </div>
      </Card>
      <Card onClick={() => go('profile/goals')}>
        <div className="goal-card">
          <span className="li-icon lime"><Icon name="target" /></span>
          <div className="grow">
            <div className="t-small">Мои цели</div>
            <div className="li-title">{goal ? GOAL_LABELS[goal.type].title : 'Задай цель'}</div>
            <div className="li-sub">
              {target !== null && s.weight.currentKg !== null ? `${own === null ? 'Ориентир' : 'Цель'} ${kg(target)} · ${Math.abs(s.weight.currentKg - target) < 0.05 ? 'держим вес' : `осталось ${kg(Math.abs(s.weight.currentKg - target))}`}` : goal ? GOAL_LABELS[goal.type].text : 'Выбери, к чему идём'}
            </div>
          </div>
          <Icon name="chevronRight" size={18} />
        </div>
      </Card>
      <VacationButton />
      <CycleTile />
      <BackupReminder />
      <div className="grid-3">
        {TILES.map((t) => (
          <button key={t.name} type="button" className="tile" aria-disabled={t.to ? undefined : true} onClick={() => t.to && go(t.to)}>
            <span className="t-ic"><Icon name={t.icon} size={20} /></span>
            <span>
              <span className="t-name" style={{ display: 'block' }}>{t.name}</span>
              {!t.to && <span className="t-small">Скоро</span>}
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}

function VacationButton() {
  const on = useVacationMode();
  const { banner, run } = useCommand();
  const [beer, setBeer] = useState(false);
  const toggle = async () => {
    if (!on) {
      // The animation starts first, at once; the heavy work (switching the mode, rebuilding the menu) follows a moment later so it never delays the first frame.
      setBeer(true);
      window.setTimeout(() => setBeer(false), 5000);
      await new Promise((r) => window.setTimeout(r, 160));
    }
    setVacationMode(!on);
    await run((d) => applyDietMode(d, Math.floor(Date.now() / 1000) % 1_000_000));
  };
  return (
    <>
      <button type="button" className={`vacation-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => void toggle()}>
        <span className="vb-ic" aria-hidden="true">🏖️</span>
        <span className="grow">
          <span className="li-title" style={{ display: 'block' }}>Отпуск</span>
        </span>
        {on && <Icon name="check" size={22} />}
      </button>
      {banner}
      {beer && <BeerFill />}
    </>
  );
}

/**
 * Full-screen "beer being poured" animation shown when vacation mode is switched on: it fills from the very bottom, foam builds up near the end,
 * then the beer turns into bubbles that pop one by one, like the gas bubbles inside the beer, and the screen is clear again.
 */
function BeerFill() {
  const [pop, setPop] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setPop(true), 3300);
    return () => window.clearTimeout(t);
  }, []);
  const bubbles = Array.from({ length: 120 }, (_, i) => {
    const size = 3 + ((i * 7) % 10);
    return { left: (i * 53 + (i % 5) * 9) % 100, size, dur: 1.4 + ((i * 13) % 17) / 10, delay: ((i * 29) % 20) / 10, sway: ((i % 2 ? 1 : -1) * (6 + (i % 7) * 3)) };
  });
  const foam = Array.from({ length: 26 }, (_, i) => {
    const size = 34 + ((i * 17) % 30);
    return { left: (i * 100) / 25 - 4 + ((i * 7) % 5), size, bottom: 30 + ((i * 11) % 34), delay: 2.2 + ((i * 3) % 10) / 10 };
  });
  // Bubbles that cover the screen and burst at random moments (a fixed grid with a little jitter keeps it deterministic).
  const w = typeof window === 'undefined' ? 390 : window.innerWidth;
  const h = typeof window === 'undefined' ? 844 : window.innerHeight + 140;
  const cell = 84;
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const pops = pop
    ? Array.from({ length: cols * rows }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const size = 110 + ((i * 37) % 50);
        return { x: c * cell - cell / 2 + ((i * 17) % 30) - size / 2 + cell / 2, y: r * cell - cell / 2 + ((i * 23) % 30) - size / 2 + cell / 2, size, delay: ((i * 61) % 100) / 100 * 0.85 };
      })
    : [];
  return createPortal(
    <div className={`beer-fill${pop ? ' pop' : ''}`} aria-hidden="true">
      <div className="beer-liquid">
        <div className="beer-body">
          {bubbles.map((b, i) => (
            <span key={i} className="beer-bubble" style={{ left: `${b.left}%`, width: b.size, height: b.size, ['--dur' as string]: `${b.dur}s`, ['--delay' as string]: `${b.delay}s`, ['--sway' as string]: `${b.sway}px` }} />
          ))}
        </div>
        <span className="beer-wave" />
        <div className="beer-foam">
          {foam.map((f, i) => (
            <i key={i} style={{ left: `${f.left}%`, bottom: f.bottom, width: f.size, height: f.size }} />
          ))}
        </div>
      </div>
      {pops.map((b, i) => (
        <span key={i} className="beer-pop" style={{ left: b.x, top: b.y, width: b.size, height: b.size, animationDelay: `${b.delay}s` }} />
      ))}
    </div>,
    document.body,
  );
}

const BACKUP_REMIND_DAYS = 7;

/** Under "Отпуск": shown when no backup file has been saved for more than a week. Tapping it does what "Сохранить копию" does. */
function BackupReminder() {
  const { runtime, snapshot: s } = useData();
  const [last, setLast] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void runtime.backup.lastBackupAt().then(setLast);
  }, [runtime]);
  if (last === undefined) return null;
  const since = last ?? s.profile?.createdAt ?? null;
  if (since === null) return null;
  const days = diffDays(toLocalDate(since, s.timezone), s.today);
  if (days <= BACKUP_REMIND_DAYS) return null;
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      if ((await saveBackupFile(runtime.backup)) === 'saved') setLast(await runtime.backup.lastBackupAt());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="backup-reminder" disabled={busy} onClick={() => void save()}>
        <span className="vb-ic" aria-hidden="true"><Icon name="download" size={22} /></span>
        <span className="grow">
          <span className="li-title" style={{ display: 'block' }}>Сохрани копию данных</span>
          <span className="t-small">{last === null ? 'Файла копии ещё нет.' : `Последняя копия ${days} ${plural(days, ['день', 'дня', 'дней'])} назад.`} Нажми, выбери «Сохранить в Файлы».</span>
        </span>
      </button>
      {err && <div className="errbox" role="alert">{err}</div>}
    </>
  );
}

const THEME_LABELS: Record<ThemeChoice, string> = { system: 'Системная', light: 'Светлая', dark: 'Тёмная' };

/** Appearance: follow the phone (day / night) or force light or dark. Applied at once, no need to press "Сохранить". */
function ThemePicker() {
  const theme = useTheme();
  return (
    <div className="field">
      <span className="lbl">Оформление</span>
      <Segmented<ThemeChoice> label="Оформление" options={(Object.keys(THEME_LABELS) as ThemeChoice[]).map((v) => ({ value: v, label: THEME_LABELS[v] }))} value={theme} onChange={setTheme} />
    </div>
  );
}

function ActivityBarPicker() {
  const on = useActivityBar();
  return (
    <div className="field">
      <span className="lbl">Панель активности на тренировке</span>
      <Segmented<'on' | 'off'> label="Панель активности" options={[{ value: 'on', label: 'Показывать' }, { value: 'off', label: 'Скрыть' }]} value={on ? 'on' : 'off'} onChange={(v) => setActivityBar(v === 'on')} />
      <span className="hint">Время, подходы, тоннаж и примерные калории по ходу тренировки. Итоги после тренировки показываются всегда.</span>
    </div>
  );
}

const COMMON_ZONES = ['Europe/Amsterdam', 'Europe/Moscow', 'Europe/Berlin', 'Europe/London', 'Europe/Kyiv', 'Europe/Minsk', 'Asia/Almaty', 'Asia/Tbilisi', 'Asia/Yerevan', 'Asia/Dubai', 'America/New_York', 'UTC'];

function RestTimerPicker() {
  const on = useRestTimer();
  return (
    <div className="field">
      <span className="lbl">Таймер отдыха</span>
      <Segmented<'on' | 'off'> label="Таймер отдыха" options={[{ value: 'on', label: 'Включён' }, { value: 'off', label: 'Выключен' }]} value={on ? 'on' : 'off'} onChange={(v) => setRestTimer(v === 'on')} />
      <span className="hint">Отсчёт отдыха между подходами после «Записать». Если выключен, подходы просто записываются без паузы.</span>
    </div>
  );
}

function UnitPicker() {
  const unit = useWeightUnit();
  return (
    <div className="field">
      <span className="lbl">Единицы веса</span>
      <Segmented<'kg' | 'lb'> label="Единицы веса" options={[{ value: 'kg', label: 'Килограммы (кг)' }, { value: 'lb', label: 'Фунты (lb)' }]} value={unit} onChange={setWeightUnit} />
      <span className="hint">Данные хранятся в килограммах, меняется только то, как веса показываются и вводятся.</span>
    </div>
  );
}

function ZonePicker() {
  const { snapshot: s, act } = useData();
  const p = s.profile!;
  const zones = [...new Set([p.timezone, ...COMMON_ZONES])];
  return (
    <SelectField label="Часовой пояс" value={p.timezone} onChange={(e) => void act((d) => updateProfile(d, { sex: p.sex, birthDate: p.birthDate, heightCm: p.heightCm, timezone: e.target.value, experience: p.experience, jobActivity: p.jobActivity }))}>
      {zones.map((z) => <option key={z} value={z}>{z}</option>)}
    </SelectField>
  );
}

/** The gear: only the app's settings, in this order. Everything applies at once. */
function SettingsScreen() {
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Настройки" back="profile" />
      <div className="stack-lg">
        <ThemePicker />
        <ActivityBarPicker />
        <RestTimerPicker />
        <UnitPicker />
        <ZonePicker />
        <ListItem icon="history" title="История изменений программы" subtitle="Служебный журнал версий нормы и тренировок" onClick={() => go('profile/versions')} />
      </div>
    </main>
  );
}

function Personal() {
  const { snapshot: s, act } = useData();
  const p = s.profile!;
  const [name, setName] = useState(getDisplayName());
  const [sex, setSex] = useState<Sex>(p.sex);
  const [birth, setBirth] = useState(p.birthDate);
  const [height, setHeight] = useState(String(p.heightCm));
  const [exp, setExp] = useState<Experience>(p.experience);
  const [job, setJob] = useState<JobActivity>(p.jobActivity);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    const h = parseDecimal(height);
    if (!isLocalDate(birth)) return setMsg({ ok: false, text: 'Проверь дату рождения' });
    if (!Number.isFinite(h) || h < 120 || h > 230) return setMsg({ ok: false, text: 'Рост должен быть от 120 до 230 см' });
    try {
      setDisplayName(name);
      await act((d) => updateProfile(d, { sex, birthDate: birth, heightCm: h, timezone: p.timezone, experience: exp, jobActivity: job }));
      setMsg({ ok: true, text: 'Сохранено' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Личные данные" back="profile" />
      <div className="stack-lg">
        <TextField label="Как к тебе обращаться" value={name} onChange={(e) => setName(e.target.value)} hint="Показывается только на этом устройстве" />
        <div className="field"><span className="lbl">Пол</span><Segmented label="Пол" options={(Object.keys(SEX_LABELS) as Sex[]).map((v) => ({ value: v, label: SEX_LABELS[v] }))} value={sex} onChange={setSex} /></div>
        <DateField label="Дата рождения" value={birth} onChange={setBirth} max={s.today} />
        <TextField label="Рост" unit="см" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
        <div className="field"><span className="lbl">Опыт тренировок</span><Segmented label="Опыт" options={(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((v) => ({ value: v, label: EXPERIENCE_LABELS[v] }))} value={exp} onChange={setExp} /></div>
        <SelectField label="Активность в течение дня" value={job} onChange={(e) => setJob(e.target.value as JobActivity)}>
          {(Object.keys(JOB_LABELS) as JobActivity[]).map((v) => <option key={v} value={v}>{JOB_LABELS[v]}</option>)}
        </SelectField>
        {msg && <div className={msg.ok ? 'ok' : 'errbox'} role="status">{msg.text}</div>}
      </div>
      <div className="save-bar"><Button block onClick={save}>Сохранить</Button></div>
    </main>
  );
}

function Goals() {
  const { snapshot: s, act } = useData();
  const g = s.primaryGoal;
  const [type, setType] = useState<GoalType>(g?.type ?? 'fat_loss');
  const [tw, setTw] = useState(g?.targetWeightKg ? fmt(toUnit(g.targetWeightKg), 1) : '');
  const [twaist, setTwaist] = useState(g?.targetWaistCm ? String(g.targetWaistCm) : '');
  const [focus, setFocus] = useState<FocusArea[]>(g ? [...g.focus].sort((a, b) => b.weight - a.weight).map((f) => f.area) : []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [offer, setOffer] = useState(false);
  const waistNow = [...s.metrics].filter((m) => m.type === 'waist' && m.deletedAt === null).sort((a, b) => (a.measuredOn < b.measuredOn ? 1 : -1))[0]?.value ?? null;
  const rec = s.profile && s.weight.currentKg !== null ? recommendTargetWeight({ sex: s.profile.sex, heightCm: s.profile.heightCm, weightKg: s.weight.currentKg, goal: type, waistCm: waistNow }) : null;
  const toggle = (a: FocusArea) => setFocus((f) => (f.includes(a) ? f.filter((x) => x !== a) : f.length < 3 ? [...f, a] : f));
  const save = async () => {
    const w = tw.trim() ? Math.round(fromUnit(parseDecimal(tw)) * 100) / 100 : null;
    const waist = twaist.trim() ? parseDecimal(twaist) : null;
    if (w !== null && (!Number.isFinite(w) || w < 30 || w > 300)) return setMsg({ ok: false, text: `Целевой вес: от ${wnum(30, 0)} до ${wnum(300, 0)} ${wUnit()}` });
    if (waist !== null && (!Number.isFinite(waist) || waist < 40 || waist > 200)) return setMsg({ ok: false, text: 'Целевая талия: от 40 до 200 см' });
    try {
      const changed = !g || g.type !== type || [...g.focus].sort((a, b) => b.weight - a.weight).map((f) => f.area).join() !== focus.join();
      await act((d) => saveGoal(d, { type, targetWeightKg: w, targetWaistCm: waist, focus }, s.timezone));
      setMsg({ ok: true, text: 'Цель сохранена' });
      setOffer(changed);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Мои цели" back="profile" />
      <Button variant="secondary" icon="info" onClick={() => setExplainOpen(true)}>Почему такие калории и тренировки</Button>
      <GoalExplainSheet open={explainOpen} goal={type} onClose={() => setExplainOpen(false)} />
      <GoalPicker type={type} onType={setType} />
      <div className="grid-2">
        <TextField label="Целевой вес" unit={wUnit()} inputMode="decimal" value={tw} onChange={(e) => setTw(e.target.value)} placeholder={rec ? fmt(toUnit(rec.kg), 1) : undefined} />
        <TextField label="Целевая талия" unit="см" inputMode="decimal" value={twaist} onChange={(e) => setTwaist(e.target.value)} />
      </div>
      {rec && (
        <Card flat>
          <div className="stack tight">
            <div className="t-small">Ориентир приложения: <b>{kg(rec.kg)}</b> (диапазон {wnum(rec.minKg, 1)}–{wnum(rec.maxKg, 1)} {wUnit()})</div>
            <p className="t-small">{rec.basis}. Это не норма и не обещание: расчёт по росту, весу, цели и талии. Если у тебя другая цифра (например, от тренера), впиши свою.</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={() => setTw(fmt(toUnit(rec.kg), 1))}>Взять ориентир</Button>
              {tw.trim() !== '' && <Button size="sm" variant="text" onClick={() => setTw('')}>Без цели по весу</Button>}
            </div>
          </div>
        </Card>
      )}
      <FocusPicker focus={focus} onToggle={toggle} />
      {g && g.type !== type && <div className="warn">Предыдущая цель сохранится в истории, начнётся новая.</div>}
      {msg && <div className={msg.ok ? 'ok' : 'errbox'} role="status">{msg.text}</div>}
      <Button block onClick={save}>Сохранить</Button>
      {offer && <RebuildOffer title="Цель изменена. Пересобрать рацион и тренировки?" withDiet onClose={() => setOffer(false)} />}
    </main>
  );
}

export function GoalPicker({ type, onType }: { type: GoalType; onType: (t: GoalType) => void }) {
  return (
    <div className="stack">
      {(Object.keys(GOAL_LABELS) as GoalType[]).map((t) => (
        <button key={t} type="button" className="option" aria-pressed={type === t} onClick={() => onType(t)}>
          <span className="li-icon lime"><Icon name={t === 'strength' ? 'training' : t === 'fat_loss' ? 'flame' : 'target'} /></span>
          <span><span className="o-title" style={{ display: 'block' }}>{GOAL_LABELS[t].title}</span><span className="o-sub">{GOAL_LABELS[t].text}</span></span>
        </button>
      ))}
    </div>
  );
}

export function FocusPicker({ focus, onToggle }: { focus: FocusArea[]; onToggle: (a: FocusArea) => void }) {
  return (
    <div className="field">
      <span className="lbl">На чём сделать акцент (до трёх)</span>
      <div className="chips">
        {(Object.keys(FOCUS_LABELS) as FocusArea[]).map((a) => (
          <Chip key={a} pressed={focus.includes(a)} onClick={() => onToggle(a)} disabled={!focus.includes(a) && focus.length >= 3}>{FOCUS_LABELS[a]}</Chip>
        ))}
      </div>
    </div>
  );
}

function Body() {
  const { snapshot: s, act } = useData();
  const [weightOpen, setWeightOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const rows = [...s.metrics].sort((a, b) => (a.measuredOn < b.measuredOn ? 1 : a.measuredOn > b.measuredOn ? -1 : a.createdAt < b.createdAt ? 1 : -1)).slice(0, 80);
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Замеры и вес" back="profile" />
      <div className="grid-2">
        <Button icon="plus" onClick={() => setWeightOpen(true)}>Вес</Button>
        <Button variant="secondary" icon="plus" onClick={() => setMeasureOpen(true)}>Замер</Button>
      </div>
      <Card flat>
        {rows.length === 0 && <p className="note">Записей пока нет.</p>}
        {rows.map((m) => (
          <div className="hist" key={m.id}>
            <span className="grow">
              <span style={{ display: 'block', fontWeight: 600 }}>{METRIC_LABELS[m.type]}</span>
              <span className="t-small">{formatDateLong(m.measuredOn)}</span>
            </span>
            <strong>{m.unit === 'kg' ? kg(m.value) : m.unit === 'cm' ? cm(m.value) : `${fmt(m.value)} %`}</strong>
            <IconButton icon="trash" label={`Удалить запись «${METRIC_LABELS[m.type]}» от ${formatDay(m.measuredOn)}`} tone="ghost" onClick={() => void act((d) => deleteMetric(d, m.id))} />
          </div>
        ))}
      </Card>
      <AddWeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
      <AddMeasurementSheet open={measureOpen} onClose={() => setMeasureOpen(false)} />
    </main>
  );
}

export function WeekdayPicker({ schedule, onToggle }: { schedule: TrainingSchedule; onToggle: (d: Weekday) => void }) {
  return (
    <div className="chips" role="group" aria-label="Тренировочные дни">
      {WEEKDAYS.map((d) => (
        <Chip key={d} pressed={schedule[d]} onClick={() => onToggle(d)}>{WEEKDAY_SHORT[d]}</Chip>
      ))}
    </div>
  );
}

function Schedule() {
  const { snapshot: s, act } = useData();
  const [schedule, setSchedule] = useState<TrainingSchedule>(s.profile!.trainingSchedule);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const count = WEEKDAYS.filter((d) => schedule[d]).length;
  const save = async () => {
    try {
      await act((d) => updateProfile(d, { trainingSchedule: schedule }));
      setMsg({ ok: true, text: 'Расписание сохранено' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Расписание" back="profile" />
      <p className="note">Выбери дни, в которые ты готов тренироваться: от одного до шести.</p>
      <WeekdayPicker schedule={schedule} onToggle={(d) => setSchedule((x) => ({ ...x, [d]: !x[d] }))} />
      <p className="t-caption">{count} {plural(count, ['тренировка', 'тренировки', 'тренировок'])} в неделю</p>
      {msg && <div className={msg.ok ? 'ok' : 'errbox'} role="status">{msg.text}</div>}
      <div className="save-bar"><Button block onClick={save} disabled={count < 1 || count > 6}>Сохранить</Button></div>
    </main>
  );
}

function AutoBackupCard() {
  const { runtime } = useData();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof runtime.backup.autoBackupInfo>> | null>(null);
  const [restore, setRestore] = useState<string | null>(null);
  useEffect(() => {
    void runtime.backup.autoBackupInfo().then(setInfo);
  }, [runtime]);
  const when = (iso: string) => `${formatDay(iso.slice(0, 10))}, ${new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  const open = async (slot: 'current' | 'previous') => setRestore(await runtime.backup.readAutoBackup(slot));
  return (
    <Card>
      <h2 className="t-h3">Автокопия</h2>
      <p className="note" style={{ margin: '4px 0 12px' }}>Раз в сутки приложение само перезаписывает копию данных внутри себя: в 00:00, если оно открыто, иначе при первом открытии нового дня. Хранятся две последние копии. Если удалить иконку с экрана «Домой» или очистить данные сайта, автокопии исчезнут вместе с данными, поэтому файл копии всё равно сохраняй.</p>
      {info?.current ? (
        <div className="stack">
          <ListItem icon="history" title="Последняя копия" subtitle={when(info.current.createdAt)} onClick={() => void open('current')} />
          {info.previous && <ListItem icon="history" title="Предыдущая копия" subtitle={when(info.previous.createdAt)} onClick={() => void open('previous')} />}
          {restore && <ImportPanel preload={restore} onDone={() => setRestore(null)} />}
        </div>
      ) : (
        <p className="note">Первая копия появится, когда приложение откроют после ввода данных.</p>
      )}
    </Card>
  );
}

function DataScreen() {
  const { runtime } = useData();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const exportJson = async () => {
    setErr(null);
    setMsg(null);
    try {
      if ((await saveBackupFile(runtime.backup)) === 'saved') setMsg('Копия сохранена. Если выбрал «Сохранить в Файлы», она лежит в выбранной папке.');
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const pst = runtime.persistence;
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Экспорт и импорт" back="profile" />
      <Card>
        <h2 className="t-h3">Резервная копия</h2>
        <p className="note" style={{ margin: '4px 0 12px' }}>Все данные хранятся только на этом устройстве. Сохраняй копию раз в неделю: нажми кнопку и выбери «Сохранить в Файлы». Если сносить приложение или менять телефон, только такой файл вернёт данные.</p>
        <Button block icon="download" onClick={() => void exportJson()}>Сохранить копию</Button>
        {msg && <div className="ok" style={{ marginTop: 12 }} role="status">{msg}</div>}
        {err && <div className="errbox" style={{ marginTop: 12 }} role="alert">{err}</div>}
        <p className="note" style={{ marginTop: 12 }}>
          {pst.persisted ? 'Браузер обещал не удалять данные.' : pst.supported ? 'Браузер не гарантирует сохранность данных, копии особенно важны.' : 'Браузер не поддерживает защиту хранилища, копии особенно важны.'}
        </p>
      </Card>
      <Card>
        <h2 className="t-h3">Импорт</h2>
        <p className="note" style={{ margin: '4px 0 12px' }}>Файл .json (копия Fitapp) или .xlsx (таблица тренировок и питания). Сначала предпросмотр: данные не меняются, пока ты не подтвердишь.</p>
        <ImportPanel />
      </Card>
      <ListItem icon="info" title="Каталог" subtitle={`Упражнений ${runtime.catalog.exercises}, оборудования ${runtime.catalog.equipment}, продуктов ${runtime.catalog.foods}`} />
    </main>
  );
}

function AutoCopyScreen() {
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Служебная копия" back="profile/data" />
      <AutoBackupCard />
    </main>
  );
}
