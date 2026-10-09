import { useEffect, useState } from 'react';
import { CARDIO_MACHINES, type CardioMachine } from '@fitapp/domain';
import { addCardioSession, deleteCardioSession, setCardioEveryWorkout } from '../actions';
import { useData } from '../app/DataContext';
import { fmt, formatDay } from '../app/format';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Button, Card, Chip, Icon, ListItem, Sheet, TextField } from '../ui';
import { parseDecimal, ScreenHeader } from './shared';

type FieldKey = 'speed' | 'incline' | 'level' | 'distance';

interface MachineInfo {
  label: string;
  /** Equipment id in the catalog: the user's limits for the machine live there. */
  equipment: string;
  fields: FieldKey[];
  levelLabel?: string;
  hint: string;
}

export const MACHINES: Record<CardioMachine, MachineInfo> = {
  treadmill: { label: 'Беговая дорожка', equipment: 'treadmill', fields: ['speed', 'incline', 'distance'], hint: 'Ходьба и бег. Наклон 3–6 % даёт нагрузку без бега; не держись за поручни, корпус прямой.' },
  bike: { label: 'Велотренажёр', equipment: 'exercise_bike', fields: ['level', 'distance'], levelLabel: 'Уровень нагрузки', hint: 'Нет ударной нагрузки на суставы, есть опора для спины: удобно начинать.' },
  elliptical: { label: 'Эллипс', equipment: 'elliptical', fields: ['level', 'incline', 'distance'], levelLabel: 'Уровень сопротивления', hint: 'Мягко для суставов, работают ноги и руки. Держись ровно, не наваливайся на поручни.' },
  rower: { label: 'Гребной тренажёр', equipment: 'rowing_ergometer', fields: ['level', 'distance'], levelLabel: 'Демпфер (1–10)', hint: 'Нагружает всё тело. Если беспокоит поясница, начни с небольшого времени и следи за техникой.' },
  stair_climber: { label: 'Степпер / лестница', equipment: 'stair_climber', fields: ['level'], levelLabel: 'Уровень (скорость ступеней)', hint: 'Высокая нагрузка на ноги и пульс; для колен не всегда комфортно.' },
  air_bike: { label: 'Эйр-байк', equipment: 'air_bike', fields: ['distance'], hint: 'Сопротивление растёт вместе с твоим усилием; интервалами легко перестараться.' },
  ski_erg: { label: 'Лыжный эргометр', equipment: 'ski_erg', fields: ['level', 'distance'], levelLabel: 'Демпфер (1–10)', hint: 'Тянущее движение для верха тела и корпуса; с плечом осторожнее.' },
};

const EFFORT_LABEL: Record<number, string> = { 1: 'очень легко', 2: 'легко', 3: 'легко', 4: 'умеренно', 5: 'умеренно', 6: 'умеренно', 7: 'тяжело', 8: 'тяжело', 9: 'очень тяжело', 10: 'предел' };

const num = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = parseDecimal(v);
  return Number.isFinite(n) ? n : NaN;
};

/** Logging a cardio session: choose a machine, fill in the fields that this machine has. */
export function CardioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const [machine, setMachine] = useState<CardioMachine | null>(null);
  const [minutes, setMinutes] = useState('');
  const [speed, setSpeed] = useState('');
  const [incline, setIncline] = useState('');
  const [level, setLevel] = useState('');
  const [distance, setDistance] = useState('');
  const [hr, setHr] = useState('');
  const [effort, setEffort] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const info = machine ? MACHINES[machine] : null;
  const user = info ? s.userEquipment.find((u) => u.equipmentId === info.equipment) : undefined;
  const maxOfMachine = user?.maxKg ?? null;
  const reset = () => {
    setMachine(null);
    setMinutes(''); setSpeed(''); setIncline(''); setLevel(''); setDistance(''); setHr('');
    setEffort(null);
    setError(null);
  };
  const close = () => { reset(); onClose(); };

  const save = async () => {
    if (!machine || !info) return;
    const d = num(minutes);
    const sp = num(speed), inc = num(incline), lv = num(level), di = num(distance), h = num(hr);
    if (d === null || Number.isNaN(d) || d < 1) return setError('Укажи время в минутах');
    if ([sp, inc, lv, di, h].some((v) => v !== null && Number.isNaN(v))) return setError('Проверь числа: нужны цифры');
    if (info.fields.includes('speed') && sp !== null && maxOfMachine !== null && machine === 'treadmill' && sp > maxOfMachine) return setError(`Максимальная скорость дорожки в твоём зале — ${fmt(maxOfMachine, 1)} км/ч (меняется в «Оборудовании»)`);
    if (info.fields.includes('level') && lv !== null && maxOfMachine !== null && machine !== 'treadmill' && lv > maxOfMachine) return setError(`Максимальный уровень этого тренажёра — ${fmt(maxOfMachine, 0)} (меняется в «Оборудовании»)`);
    const done = await ok((deps) =>
      addCardioSession(deps, {
        date: s.today,
        machine,
        durationMin: d,
        speedKmh: info.fields.includes('speed') ? sp : null,
        inclinePct: info.fields.includes('incline') ? inc : null,
        level: info.fields.includes('level') ? lv : null,
        distanceKm: info.fields.includes('distance') ? di : null,
        avgHeartRate: h !== null ? Math.round(h) : null,
        effort,
        note: null,
      }),
    );
    if (done) close();
  };

  const recent = s.cardioSessions.slice(0, 5);
  return (
    <Sheet open={open} title="Кардио" onClose={close}>
      <div className="stack">
        {banner}
        {!machine ? (
          <>
            <div className="t-caption">Выбери тренажёр</div>
            <div className="list">
              {CARDIO_MACHINES.map((m) => <ListItem key={m} icon="heart" title={MACHINES[m].label} onClick={() => setMachine(m)} />)}
            </div>
            {recent.length > 0 && (
              <>
                <div className="t-caption">Последние</div>
                <div className="list">
                  {recent.map((c) => (
                    <ListItem key={c.id} icon="check" title={`${MACHINES[c.machine].label} · ${fmt(c.durationMin, 0)} мин`} subtitle={`${formatDay(c.date)}${c.distanceKm ? ` · ${fmt(c.distanceKm, 2)} км` : ''}${c.speedKmh ? ` · ${fmt(c.speedKmh, 1)} км/ч` : ''}${c.inclinePct ? ` · наклон ${fmt(c.inclinePct, 1)} %` : ''}${c.level ? ` · уровень ${fmt(c.level, 0)}` : ''}`} trailing={<IconDelete id={c.id} />} />
                  ))}
                </div>
              </>
            )}
            <Button block variant="secondary" icon="info" onClick={() => { close(); go('profile/cardio'); }}>Зачем нужно кардио и кому оно подходит</Button>
          </>
        ) : info ? (
          <>
            <div className="t-h3">{info.label}</div>
            <p className="t-small">{info.hint}</p>
            <TextField label="Время" unit="мин" inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} autoFocus />
            {info.fields.includes('speed') && <TextField label="Скорость" unit="км/ч" inputMode="decimal" value={speed} onChange={(e) => setSpeed(e.target.value)} hint={maxOfMachine !== null && machine === 'treadmill' ? `На твоей дорожке до ${fmt(maxOfMachine, 1)} км/ч` : undefined} />}
            {info.fields.includes('incline') && <TextField label="Наклон" unit="%" inputMode="decimal" value={incline} onChange={(e) => setIncline(e.target.value)} />}
            {info.fields.includes('level') && <TextField label={info.levelLabel ?? 'Уровень'} inputMode="decimal" value={level} onChange={(e) => setLevel(e.target.value)} hint={maxOfMachine !== null && machine !== 'treadmill' ? `Уровней на этом тренажёре: до ${fmt(maxOfMachine, 0)}` : undefined} />}
            {info.fields.includes('distance') && <TextField label="Дистанция" unit="км" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} />}
            <TextField label="Средний пульс (необязательно)" unit="уд/мин" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
            <div className="t-caption">Как ощущалось{effort ? `: ${effort} из 10, ${EFFORT_LABEL[effort]}` : ''}</div>
            <div className="chips" role="group" aria-label="Усилие от 1 до 10">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <Chip key={n} pressed={effort === n} onClick={() => setEffort(effort === n ? null : n)}>{n}</Chip>)}
            </div>
            <p className="t-small">Для здоровья обычно подходит «умеренно» (4–6): дыхание учащённое, но фразами говорить можешь.</p>
            {error && <div className="note" role="alert">{error}</div>}
            <div className="row">
              <Button variant="text" onClick={() => { reset(); }}>Назад</Button>
              <Button disabled={busy} onClick={() => void save()}>Сохранить</Button>
            </div>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function IconDelete({ id }: { id: string }) {
  const { ok } = useCommand();
  return (
    <button type="button" className="icon-btn" aria-label="Удалить запись" onClick={(e) => { e.stopPropagation(); void ok((d) => deleteCardioSession(d, id)); }}>
      <Icon name="trash" size={18} />
    </button>
  );
}

/** Why cardio, for whom, and for whom with care. Facts from the WHO 2020 guidelines and cardiology/ACSM-type recommendations. */
export function CardioGuideBody() {
  return (
    <div className="stack">
      <section className="stack">
        <h3 className="t-h3">Что это</h3>
        <p className="t-body">Кардио — нагрузка, при которой несколько минут подряд работают крупные мышцы, а пульс и дыхание учащаются: ходьба, беговая дорожка, велотренажёр, эллипс, гребля. Это не замена силовым тренировкам, а их пара.</p>
      </section>
      <section className="stack">
        <h3 className="t-h3">Зачем это каждому взрослому</h3>
        <ul className="t-body">
          <li>ВОЗ (рекомендации 2020 года): 150–300 минут умеренной или 75–150 минут интенсивной аэробной нагрузки в неделю. Засчитывается любая длительность отрезков, даже короткие.</li>
          <li>Меньше риск смерти от всех причин и от болезней сердца и сосудов, реже гипертония и диабет 2 типа, лучше настроение, сон и работа мозга.</li>
          <li>Давление при регулярной нагрузке в среднем снижается примерно на 5–7 пунктов; для этого достаточно даже ходьбы.</li>
          <li>Тем, кто много сидит, больше движения частично компенсирует вред сидячей работы.</li>
          <li>Для жира: кардио добавляет расход калорий, но основной рычаг при похудении — питание. Кардио помогает держать дефицит без чрезмерного урезания еды.</li>
        </ul>
      </section>
      <section className="stack">
        <h3 className="t-h3">Как понять интенсивность</h3>
        <p className="t-body">Умеренная — дыхание учащённое, но ты говоришь фразами (усилие 4–6 из 10). Интенсивная — получается сказать только короткую фразу (7–8 из 10). Для начала хватит умеренной.</p>
      </section>
      <section className="stack">
        <h3 className="t-h3">Как начать</h3>
        <p className="t-body">2–3 раза в неделю по 15–30 минут в удобном темпе. Прибавляй время или скорость понемногу: сначала время, потом интенсивность. Лучше регулярно и в меру, чем редко и до предела.</p>
      </section>
      <section className="stack">
        <h3 className="t-h3">Кому нужна осторожность</h3>
        <ul className="t-body">
          <li><b>Очень большой вес.</b> Бег и прыжки сильно нагружают колени, голеностопы и поясницу. Лучше начинать с ходьбы, велотренажёра и эллипса: там нет ударной нагрузки. Бег добавляй позже, когда организм привык и вес снизился.</li>
          <li><b>Давление, сердце, сосуды, диабет.</b> Лёгкая и умеренная нагрузка обычно полезна, но тип и объём лучше согласовать с врачом. Если давление выше 180/110, сначала нужно лечение и врач.</li>
          <li><b>Суставы и спина.</b> Выбирай тренажёры с опорой (велотренажёр), не держись за поручни дорожки, держи корпус ровно.</li>
          <li><b>Беременность, недавние операции, хронические болезни.</b> Подбор нагрузки с врачом.</li>
        </ul>
        <div className="note">Остановись и обратись к врачу, если появились боль или давление в груди, головокружение, резкая одышка, неровное сердцебиение или боль в суставе, которая не проходит. Это справка, а не медицинская рекомендация.</div>
      </section>
      <p className="t-small">Источники: ВОЗ, «Рекомендации по физической активности и малоподвижному поведению» (2020), British Journal of Sports Medicine; Harvard T.H. Chan School of Public Health, материал о физической нагрузке и давлении.</p>
    </div>
  );
}

function CardioEveryWorkout() {
  const { snapshot: s } = useData();
  const { ok, banner, busy } = useCommand();
  const on = s.activeVersion?.training.cardioEveryWorkout === true;
  if (!s.activeVersion) return null;
  return (
    <Card>
      <div className="stack">
        <div className="t-h3">Кардио в каждую тренировку</div>
        <p className="t-small">{on ? 'Сейчас в конце каждой тренировки стоит 10–30 минут лёгкого кардио: ходьба в горку или велотренажёр, что есть в твоих тренажёрах.' : 'Нажми, и в конец каждой тренировки добавится 10–30 минут лёгкого кардио (ходьба в горку или велотренажёр, что есть в твоих тренажёрах). Отключить можно здесь же.'}</p>
        {banner}
        <Button block variant={on ? 'secondary' : 'primary'} disabled={busy} onClick={() => void ok((d) => setCardioEveryWorkout(d, !on))}>{on ? 'Убрать кардио из тренировок' : 'Добавить в тренировочный процесс'}</Button>
      </div>
    </Card>
  );
}

export function CardioGuideScreen() {
  const [open, setOpen] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <main className="screen">
      <ScreenHeader title="Кардио" back="profile" />
      <CardioEveryWorkout />
      <Card>
        <CardioGuideBody />
      </Card>
      <Button block icon="heart" onClick={() => setOpen(true)}>Записать кардио</Button>
      <CardioSheet open={open} onClose={() => setOpen(false)} />
    </main>
  );
}
