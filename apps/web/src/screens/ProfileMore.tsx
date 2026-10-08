import { useMemo, useState } from 'react';
import type { Availability, BodyArea, InjuryStatus, Preference, Side, TriggerKind } from '@fitapp/domain';
import { addInjury, deleteInjury, resolveInjury, setEquipmentAvailable, setEquipmentStep, setFoodPreference } from '../actions';
import { useData } from '../app/DataContext';
import { userFoodOf } from '../app/derive';
import { fmt, formatDay } from '../app/format';
import { useCommand } from '../app/useCommand';
import { Badge, Button, Card, Chip, EmptyState, Icon, ListItem, Segmented, Sheet, TextField } from '../ui';
import { parseDecimal, ScreenHeader } from './shared';

const AREA_LABELS: Record<BodyArea, string> = { shoulder: 'Плечо', elbow: 'Локоть', wrist: 'Запястье', neck: 'Шея', upper_back: 'Верх спины', lower_back: 'Поясница', hip: 'Таз', knee: 'Колено', ankle: 'Голеностоп', other: 'Другое' };
const SIDE_LABELS: Record<Side, string> = { left: 'Слева', right: 'Справа', both: 'Обе стороны' };
const STATUS_LABELS: Record<InjuryStatus, string> = { active: 'Беспокоит сейчас', recurring: 'Периодически', past: 'Было раньше' };
const TRIGGER_LABELS: Record<TriggerKind, string> = { exercise: 'Определённое упражнение', movement: 'Движение', position: 'Положение', other: 'Другое' };
const PREF_LABELS: Record<Preference, string> = { love: 'Обожаю', like: 'Люблю', ok: 'Нормально', avoid: 'Не люблю' };
const AVAIL_LABELS: Record<Availability, string> = { always: 'Всегда', often: 'Часто', sometimes: 'Иногда', rare: 'Редко' };

// ------------------------------------------------------------------ foods

export function FoodsScreen() {
  const { snapshot: s } = useData();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const foods = useMemo(() => s.foods.filter((f) => f.deletedAt === null && f.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [s.foods, query]);
  return (
    <main className="screen">
      <ScreenHeader title="Продукты" back="profile" />
      <p className="t-small">Отметь, что любишь, что не ешь и что бывает дома: рацион собирается из этого списка.</p>
      <TextField label="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="list">
        {foods.map((f) => {
          const u = userFoodOf(s.userFoods, f.id);
          return <ListItem key={f.id} icon={u?.excluded ? 'close' : 'box'} title={f.name} subtitle={u?.excluded ? 'Исключён' : `${PREF_LABELS[u?.preference ?? 'ok']} · ${AVAIL_LABELS[u?.availability ?? 'always']}`} onClick={() => setOpenId(f.id)} />;
        })}
      </div>
      <FoodSheet foodId={openId} onClose={() => setOpenId(null)} />
    </main>
  );
}

function FoodSheet({ foodId, onClose }: { foodId: string | null; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const [max, setMax] = useState('');
  if (!foodId) return null;
  const food = s.foods.find((f) => f.id === foodId);
  if (!food) return null;
  const u = userFoodOf(s.userFoods, foodId);
  const set = (patch: Parameters<typeof setFoodPreference>[2]) => void ok((d) => setFoodPreference(d, foodId, patch));
  const m = parseDecimal(max);
  return (
    <Sheet open title={food.name} onClose={onClose}>
      <div className="stack">
        {banner}
        <div className="t-caption">Отношение</div>
        <div className="chips">{(Object.keys(PREF_LABELS) as Preference[]).map((k) => <Chip key={k} pressed={(u?.preference ?? 'ok') === k} disabled={busy} onClick={() => set({ preference: k })}>{PREF_LABELS[k]}</Chip>)}</div>
        <div className="t-caption">Как часто есть дома</div>
        <div className="chips">{(Object.keys(AVAIL_LABELS) as Availability[]).map((k) => <Chip key={k} pressed={(u?.availability ?? 'always') === k} disabled={busy} onClick={() => set({ availability: k })}>{AVAIL_LABELS[k]}</Chip>)}</div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="grow"><TextField label="Максимум в день" unit="г" inputMode="decimal" placeholder={u?.maxPerDayG ? String(u.maxPerDayG) : 'без ограничения'} value={max} onChange={(e) => setMax(e.target.value)} /></div>
          <Button variant="secondary" disabled={busy || !(m > 0)} onClick={() => { set({ maxPerDayG: m }); setMax(''); }}>Задать</Button>
        </div>
        {u?.maxPerDayG && <Button size="sm" variant="text" onClick={() => set({ maxPerDayG: null })}>Убрать ограничение ({fmt(u.maxPerDayG, 0)} г)</Button>}
        <Button block variant={u?.excluded ? 'secondary' : 'danger'} disabled={busy} onClick={() => set({ excluded: !u?.excluded })}>{u?.excluded ? 'Вернуть в рацион' : 'Исключить из рациона'}</Button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ equipment

export function EquipmentScreen() {
  const { snapshot: s } = useData();
  const { ok, banner } = useCommand();
  const [stepFor, setStepFor] = useState<string | null>(null);
  const [step, setStep] = useState('');
  const list = s.equipment.filter((e) => e.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const userOf = (id: string) => s.userEquipment.find((u) => u.equipmentId === id);
  const current = stepFor ? list.find((e) => e.id === stepFor) : undefined;
  const v = parseDecimal(step);
  return (
    <main className="screen">
      <ScreenHeader title="Оборудование" back="profile" />
      {banner}
      <p className="t-small">Поставь галочку у того, что есть в твоём зале. Нажми на название, чтобы задать шаг веса. После изменений можно пересобрать программу на вкладке «Тренировки».</p>
      <div className="stack" style={{ gap: 8 }}>
        {list.map((e) => {
          const u = userOf(e.id);
          const available = u?.available ?? true;
          return (
            <div key={e.id} className="eq-row">
              <button type="button" className="check" role="checkbox" aria-checked={available} aria-label={`${e.name}: ${available ? 'есть' : 'нет'}`} onClick={() => void ok((d) => setEquipmentAvailable(d, e.id, !available))}>
                {available && <Icon name="check" size={20} />}
              </button>
              <button type="button" className="eq-main" onClick={() => { setStepFor(e.id); setStep(u?.stepKg ? String(u.stepKg) : ''); }}>
                <span className="li-title" style={{ display: 'block' }}>{e.name}</span>
                <span className={`li-sub ${available ? 'eq-yes' : 'eq-no'}`} style={{ display: 'block' }}>{available ? 'Есть' : 'Нет'}{u?.stepKg ? ` · шаг веса ${fmt(u.stepKg, 2)} кг` : ''}</span>
              </button>
              <Icon name="chevronRight" size={18} />
            </div>
          );
        })}
      </div>
      <Sheet open={current !== undefined} title={current?.name ?? ''} onClose={() => setStepFor(null)}>
        <div className="stack">
          <p className="t-small">Минимальный шаг веса в твоём зале (например, 2,5 или 5 кг на блоке). От него зависит следующая рекомендация.</p>
          <TextField label="Шаг веса" unit="кг" inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} />
          <Button block disabled={!(v > 0) && step.trim() !== ''} onClick={async () => { if (current && (await ok((d) => setEquipmentStep(d, current.id, step.trim() === '' ? null : v)))) setStepFor(null); }}>Сохранить</Button>
        </div>
      </Sheet>
    </main>
  );
}

// ------------------------------------------------------------------ injuries

export function InjuriesScreen() {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const [adding, setAdding] = useState(false);
  const injuries = s.injuries.filter((i) => i.deletedAt === null);
  const events = s.painEvents.filter((e) => e.deletedAt === null).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)).slice(0, 10);
  return (
    <main className="screen">
      <ScreenHeader title="Болевые точки" back="profile" />
      {banner}
      <Card flat>
        <p className="t-small">Это только подсказки для подбора упражнений, не диагноз. Боль в суставе — повод остановить движение; если она повторяется или не проходит, покажись врачу или физиотерапевту.</p>
      </Card>
      {injuries.length === 0 ? (
        <Card flat><EmptyState icon="shield" title="Ограничений нет" text="Добавь места, которые беспокоят: программа учтёт их при выборе упражнений." /></Card>
      ) : (
        <div className="list">
          {injuries.map((i) => (
            <Card key={i.id} flat>
              <div className="stack">
                <div className="row between"><div className="t-h3">{AREA_LABELS[i.area]}, {SIDE_LABELS[i.side].toLowerCase()}</div><Badge tone={i.resolvedOn ? 'neutral' : 'warning'}>{i.resolvedOn ? 'Закрыто' : STATUS_LABELS[i.status]}</Badge></div>
                {i.triggerText && <div className="t-small">{i.triggerText}</div>}
                {i.notes && <div className="t-small">{i.notes}</div>}
                <div className="row">
                  {!i.resolvedOn && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void ok((d) => resolveInjury(d, i.id, s.today))}>Больше не беспокоит</Button>}
                  <Button size="sm" variant="text" disabled={busy} onClick={() => void ok((d) => deleteInjury(d, i.id))}>Удалить</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Button block icon="plus" onClick={() => setAdding(true)}>Добавить</Button>
      {events.length > 0 && (
        <>
          <div className="section-title"><h2 className="t-h3">Последние записи о боли</h2></div>
          <div className="list">{events.map((e) => <ListItem key={e.id} icon="alert" title={`${AREA_LABELS[e.area]}${e.intensity ? ` · ${e.intensity}/10` : ''}`} subtitle={`${formatDay(e.occurredAt.slice(0, 10))}${e.exerciseId ? ` · ${s.exerciseNames[e.exerciseId] ?? ''}` : ''}`} />)}</div>
        </>
      )}
      <AddInjurySheet open={adding} onClose={() => setAdding(false)} />
    </main>
  );
}

function AddInjurySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ok, banner, busy } = useCommand();
  const [area, setArea] = useState<BodyArea | null>(null);
  const [side, setSide] = useState<Side>('both');
  const [status, setStatus] = useState<InjuryStatus>('recurring');
  const [triggers, setTriggers] = useState<TriggerKind[]>([]);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const toggle = (k: TriggerKind) => setTriggers((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  return (
    <Sheet open={open} title="Новая болевая точка" onClose={onClose}>
      <div className="stack">
        {banner}
        <div className="chips" role="group" aria-label="Где">{(Object.keys(AREA_LABELS) as BodyArea[]).map((a) => <Chip key={a} pressed={area === a} onClick={() => setArea(a)}>{AREA_LABELS[a]}</Chip>)}</div>
        <Segmented<Side> label="Сторона" value={side} onChange={setSide} options={(Object.keys(SIDE_LABELS) as Side[]).map((k) => ({ value: k, label: SIDE_LABELS[k] }))} small />
        <Segmented<InjuryStatus> label="Как давно" value={status} onChange={setStatus} options={(Object.keys(STATUS_LABELS) as InjuryStatus[]).map((k) => ({ value: k, label: STATUS_LABELS[k] }))} small />
        <div className="t-caption">Когда появляется</div>
        <div className="chips">{(Object.keys(TRIGGER_LABELS) as TriggerKind[]).map((k) => <Chip key={k} pressed={triggers.includes(k)} onClick={() => toggle(k)}>{TRIGGER_LABELS[k]}</Chip>)}</div>
        <TextField label="Например: «при жиме лёжа»" value={text} onChange={(e) => setText(e.target.value)} />
        <TextField label="Заметка (необязательно)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button block disabled={busy || area === null} onClick={async () => { if (area && (await ok((d) => addInjury(d, { area, side, status, triggerKinds: triggers, triggerText: text.trim() || null, notes: notes.trim() || null })))) { setArea(null); setText(''); setNotes(''); setTriggers([]); onClose(); } }}>Сохранить</Button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ versions

export function VersionsScreen() {
  const { snapshot: s } = useData();
  const versions = [...s.versions].sort((a, b) => b.versionNo - a.versionNo);
  const changeOf = (versionId: string) => s.changes.find((c) => c.toVersionId === versionId);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <main className="screen">
      <ScreenHeader title="История изменений программы" back="profile" />
      <p className="t-small">Каждый раз, когда меняется программа (питание или тренировки), приложение сохраняет новую версию и причину. Старые версии не стираются. Это нужно, чтобы видеть, что и почему поменялось, и понимать, откуда взялись нынешние калории и упражнения. Смотреть здесь ничего не обязательно: раздел для справки.</p>
      {versions.length === 0 && <Card flat><EmptyState icon="history" title="Версий пока нет" text="Первая версия появится при создании программы." /></Card>}
      {versions.map((v) => {
        const c = changeOf(v.id);
        const active = v.id === s.activeVersion?.id;
        return (
          <Card key={v.id} flat={!active}>
            <div className="stack">
              <div className="row between"><div className="t-h3">Версия {v.versionNo}</div>{active ? <Badge>Активна</Badge> : <Badge tone="neutral">Архив</Badge>}</div>
              <div className="t-small">С {formatDay(v.effectiveFrom)} · {v.source === 'initial' ? 'первая версия' : v.source === 'user' ? 'твоё изменение' : v.source === 'ai' ? 'ИИ' : 'расчёт'}</div>
              <div className="t-body">{v.reasonSummary}</div>
              <div className="t-small">Питание: {fmt(v.nutrition.kcal, 0)} ккал · Б {fmt(v.nutrition.proteinG, 0)} Ж {fmt(v.nutrition.fatG, 0)} У {fmt(v.nutrition.carbG, 0)}</div>
              {c && c.diff.length > 0 && (
                <>
                  <Button size="sm" variant="text" onClick={() => setOpen(open === v.id ? null : v.id)}>{open === v.id ? 'Скрыть изменения' : `Что изменилось (${c.diff.length})`}</Button>
                  {open === v.id && (
                    <ul className="t-small">
                      {c.diff.map((d) => <li key={d.path}><b>{diffLabel(d.path)}</b>: {show(d.before)} → {show(d.after)}</li>)}
                    </ul>
                  )}
                </>
              )}
            </div>
          </Card>
        );
      })}
    </main>
  );
}

const NUTRITION_LABELS: Record<string, string> = { kcal: 'Калории', proteinG: 'Белок, г', fatG: 'Жиры, г', carbG: 'Углеводы, г', fiberG: 'Клетчатка, г', waterMl: 'Вода, мл' };
const FIELD_LABELS: Record<string, string> = { sets: 'подходы', repMin: 'повторений от', repMax: 'повторений до', restSec: 'отдых, с', startWeightKg: 'стартовый вес', exerciseId: 'упражнение', variantKey: 'вариант' };

/** Human wording for a diff path such as `training.a.a_1_leg_press.sets`. */
function diffLabel(path: string): string {
  const parts = path.split('.');
  if (parts[0] === 'nutrition') return NUTRITION_LABELS[parts[1] ?? ''] ?? parts.slice(1).join(' ');
  if (path === 'training.workouts') return 'Набор тренировок';
  if (path === 'training.adaptationWeeks') return 'Недель адаптации';
  if (path === 'training.rotation') return 'Порядок тренировок';
  if (parts[0] === 'training') {
    const [, workout, exercise, field] = parts;
    const name = exercise ? exercise.replace(/^[a-z]_\d+_/, '').replace(/_/g, ' ') : '';
    if (field) return `Тренировка ${workout?.toUpperCase()} · ${name}: ${FIELD_LABELS[field] ?? field}`;
    if (exercise) return `Тренировка ${workout?.toUpperCase()} · ${name}`;
    return `Тренировка ${workout?.toUpperCase()}`;
  }
  return path;
}

function show(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return fmt(v, 1);
  if (typeof v === 'string') return v;
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}
