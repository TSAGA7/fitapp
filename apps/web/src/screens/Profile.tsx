import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCommand } from '../app/useCommand';
import { ageYears, isLocalDate, type Experience, type FocusArea, type GoalType, type JobActivity, type Sex, type TrainingSchedule, type Weekday, WEEKDAYS } from '@fitapp/domain';
import { applyDietMode, saveGoal, updateProfile } from '../actions';
import { useData } from '../app/DataContext';
import { deleteMetric } from '../actions';
import { EXPERIENCE_LABELS, FOCUS_LABELS, formatDateLong, formatDay, fmt, GOAL_LABELS, initials, JOB_LABELS, kg, METRIC_LABELS, plural, SEX_LABELS, WEEKDAY_SHORT, cm } from '../app/format';
import { getDisplayName, setActivityBar, setDisplayName, setTheme, setVacationMode, useActivityBar, useTheme, useVacationMode, type ThemeChoice } from '../app/prefs';
import { go } from '../app/router';
import { Button, Card, Chip, Icon, IconButton, ListItem, Segmented, SelectField, TextField, type IconName } from '../ui';
import { ExerciseCatalogScreen } from './ExerciseCatalog';
import { GoalExplainSheet } from './GoalExplain';
import { ImportPanel } from './ImportPanel';
import { CardioGuideScreen } from './Cardio';
import { TvaGuideScreen } from './TvaGuide';
import { EquipmentScreen, FoodsScreen, InjuriesScreen, VersionsScreen } from './ProfileMore';
import { AddMeasurementSheet, AddWeightSheet, DateField, parseDecimal, RebuildOffer, ScreenHeader } from './shared';

export function Profile({ route }: { route: string[] }) {
  // Every profile screen opens from the very top, not at the scroll position of the previous one.
  useEffect(() => { window.scrollTo(0, 0); }, [route.join('/')]);
  switch (route[1]) {
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
  const target = goal?.targetWeightKg ?? null;
  return (
    <main className="screen">
      <ScreenHeader title="Профиль" />
      <Card>
        <div className="row">
          <span className="avatar-lg" aria-hidden="true">{initials(name)}</span>
          <div className="grow">
            <div className="t-h2">{name || 'Мой профиль'}</div>
            <div className="t-caption">{age} {plural(age, ['год', 'года', 'лет'])} · {fmt(p.heightCm, 0)} см{s.weight.currentKg !== null ? ` · ${fmt(s.weight.currentKg)} кг` : ''}</div>
          </div>
          <IconButton icon="gear" label="Личные данные" onClick={() => go('profile/personal')} />
        </div>
      </Card>
      <Card onClick={() => go('profile/goals')}>
        <div className="goal-card">
          <span className="li-icon lime"><Icon name="target" /></span>
          <div className="grow">
            <div className="t-small">Мои цели</div>
            <div className="li-title">{goal ? GOAL_LABELS[goal.type].title : 'Задай цель'}</div>
            <div className="li-sub">
              {target !== null && s.weight.currentKg !== null ? `Цель ${kg(target)} · осталось ${kg(Math.abs(s.weight.currentKg - target))}` : goal ? GOAL_LABELS[goal.type].text : 'Выбери, к чему идём'}
            </div>
          </div>
          <Icon name="chevronRight" size={18} />
        </div>
      </Card>
      <VacationButton />
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
      setBeer(true);
      window.setTimeout(() => setBeer(false), 2600);
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

/** Full-screen "beer pouring in" animation shown when vacation mode is switched on. */
function BeerFill() {
  return createPortal(
    <div className="beer-fill" aria-hidden="true">
      <div className="beer-liquid">
        <div className="beer-foam" />
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="beer-bubble" style={{ left: `${5 + ((i * 37) % 90)}%`, animationDelay: `${(i % 7) * 0.12}s`, width: 6 + (i % 4) * 3, height: 6 + (i % 4) * 3 }} />
        ))}
      </div>
    </div>,
    document.body,
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

function Personal() {
  const { snapshot: s, act } = useData();
  const p = s.profile!;
  const [name, setName] = useState(getDisplayName());
  const [sex, setSex] = useState<Sex>(p.sex);
  const [birth, setBirth] = useState(p.birthDate);
  const [height, setHeight] = useState(String(p.heightCm));
  const [tz, setTz] = useState(p.timezone);
  const [exp, setExp] = useState<Experience>(p.experience);
  const [job, setJob] = useState<JobActivity>(p.jobActivity);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const zones = [...new Set([p.timezone, ...COMMON_ZONES])];
  const save = async () => {
    const h = parseDecimal(height);
    if (!isLocalDate(birth)) return setMsg({ ok: false, text: 'Проверь дату рождения' });
    if (!Number.isFinite(h) || h < 120 || h > 230) return setMsg({ ok: false, text: 'Рост должен быть от 120 до 230 см' });
    try {
      setDisplayName(name);
      await act((d) => updateProfile(d, { sex, birthDate: birth, heightCm: h, timezone: tz, experience: exp, jobActivity: job }));
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
        <SelectField label="Часовой пояс" value={tz} onChange={(e) => setTz(e.target.value)}>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </SelectField>
        <div className="field"><span className="lbl">Опыт тренировок</span><Segmented label="Опыт" options={(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((v) => ({ value: v, label: EXPERIENCE_LABELS[v] }))} value={exp} onChange={setExp} /></div>
        <SelectField label="Активность в течение дня" value={job} onChange={(e) => setJob(e.target.value as JobActivity)}>
          {(Object.keys(JOB_LABELS) as JobActivity[]).map((v) => <option key={v} value={v}>{JOB_LABELS[v]}</option>)}
        </SelectField>
        <ThemePicker />
        <ActivityBarPicker />
        <ListItem icon="history" title="История изменений программы" subtitle="Служебный журнал версий нормы и тренировок" onClick={() => go('profile/versions')} />
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
  const [tw, setTw] = useState(g?.targetWeightKg ? String(g.targetWeightKg) : '');
  const [twaist, setTwaist] = useState(g?.targetWaistCm ? String(g.targetWaistCm) : '');
  const [focus, setFocus] = useState<FocusArea[]>(g ? [...g.focus].sort((a, b) => b.weight - a.weight).map((f) => f.area) : []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [offer, setOffer] = useState(false);
  const toggle = (a: FocusArea) => setFocus((f) => (f.includes(a) ? f.filter((x) => x !== a) : f.length < 3 ? [...f, a] : f));
  const save = async () => {
    const w = tw.trim() ? parseDecimal(tw) : null;
    const waist = twaist.trim() ? parseDecimal(twaist) : null;
    if (w !== null && (!Number.isFinite(w) || w < 30 || w > 300)) return setMsg({ ok: false, text: 'Целевой вес: от 30 до 300 кг' });
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
        <TextField label="Целевой вес" unit="кг" inputMode="decimal" value={tw} onChange={(e) => setTw(e.target.value)} />
        <TextField label="Целевая талия" unit="см" inputMode="decimal" value={twaist} onChange={(e) => setTwaist(e.target.value)} />
      </div>
      <FocusPicker focus={focus} onToggle={toggle} />
      {g && g.type !== type && <div className="warn">Предыдущая цель сохранится в истории, начнётся новая.</div>}
      {msg && <div className={msg.ok ? 'ok' : 'errbox'} role="status">{msg.text}</div>}
      <Button block onClick={save}>Сохранить</Button>
      {offer && <RebuildOffer title="Цель изменилась. Пересобрать?" withDiet onClose={() => setOffer(false)} />}
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
  const exportJson = async () => {
    const json = await runtime.backup.exportJson();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Резервная копия сохранена в загрузки.');
  };
  const pst = runtime.persistence;
  return (
    <main className="screen no-nav">
      <ScreenHeader title="Экспорт и импорт" back="profile" />
      <Card>
        <h2 className="t-h3">Резервная копия</h2>
        <p className="note" style={{ margin: '4px 0 12px' }}>Все данные хранятся только на этом устройстве. Сохраняй копию раз в неделю.</p>
        <Button block icon="download" onClick={() => void exportJson()}>Сохранить копию</Button>
        {msg && <div className="ok" style={{ marginTop: 12 }} role="status">{msg}</div>}
        <p className="note" style={{ marginTop: 12 }}>
          {pst.persisted ? 'Браузер обещал не удалять данные.' : pst.supported ? 'Браузер не гарантирует сохранность данных, копии особенно важны.' : 'Браузер не поддерживает защиту хранилища, копии особенно важны.'}
        </p>
      </Card>
      <AutoBackupCard />
      <Card>
        <h2 className="t-h3">Импорт</h2>
        <p className="note" style={{ margin: '4px 0 12px' }}>Файл .json (копия Fitapp) или .xlsx (таблица тренировок и питания). Сначала предпросмотр: данные не меняются, пока ты не подтвердишь.</p>
        <ImportPanel />
      </Card>
      <ListItem icon="info" title="Каталог" subtitle={`Упражнений ${runtime.catalog.exercises}, оборудования ${runtime.catalog.equipment}, продуктов ${runtime.catalog.foods}`} />
    </main>
  );
}
