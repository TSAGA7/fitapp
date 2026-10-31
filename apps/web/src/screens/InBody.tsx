import { useEffect, useRef, useState } from 'react';
import { parseInBodyQr, weekdayOf, type InBodySegmentKey, type InBodySegments, type InBodyTest, type InBodyValues } from '@fitapp/domain';
import { deleteInBodyTest, saveInBodyTest } from '../actions';
import { useData } from '../app/DataContext';
import { fmt, formatDateLong, formatDateShort, signed, WEEKDAY_SHORT } from '../app/format';
import { go } from '../app/router';
import { useCommand } from '../app/useCommand';
import { Button, Card, EmptyState, Icon, Sheet, TextField } from '../ui';
import { DateField, parseDecimal, ScreenHeader } from './shared';

type NumKey = { [K in keyof InBodyValues]: InBodyValues[K] extends number | null ? K : never }[keyof InBodyValues];
interface Field {
  key: NumKey;
  label: string;
  unit: string;
  digits: number;
  /** Smaller is better (fat): the change is coloured the other way. */
  lower?: boolean;
}

/** The main values, as on the first screen of the InBody app. */
const MAIN: readonly Field[] = [
  { key: 'weightKg', label: 'Вес', unit: 'кг', digits: 1 },
  { key: 'skeletalMuscleKg', label: 'Скелетная мускулатура', unit: 'кг', digits: 1 },
  { key: 'bodyFatKg', label: 'Жир в теле', unit: 'кг', digits: 1, lower: true },
  { key: 'bodyFatPct', label: 'Процент жира', unit: '%', digits: 1, lower: true },
  { key: 'bmi', label: 'Индекс массы тела', unit: '', digits: 1, lower: true },
  { key: 'visceralFatLevel', label: 'Висцеральный жир, уровень', unit: '', digits: 0, lower: true },
  { key: 'bmrKcal', label: 'Базальный метаболизм', unit: 'ккал', digits: 0 },
  { key: 'score', label: 'Оценка InBody', unit: 'баллов', digits: 0 },
];

/** Everything else of the sheet. */
const MORE: readonly Field[] = [
  { key: 'totalBodyWaterL', label: 'Общая вода', unit: 'л', digits: 1 },
  { key: 'intracellularWaterL', label: 'Внутриклеточная вода', unit: 'л', digits: 1 },
  { key: 'extracellularWaterL', label: 'Внеклеточная вода', unit: 'л', digits: 1 },
  { key: 'ecwRatio', label: 'ВКЖ/ОКЖ (отёки, норма 0,36–0,39)', unit: '', digits: 3, lower: true },
  { key: 'proteinKg', label: 'Белок', unit: 'кг', digits: 1 },
  { key: 'mineralsKg', label: 'Минералы', unit: 'кг', digits: 2 },
  { key: 'boneMineralKg', label: 'Минералы в костях', unit: 'кг', digits: 2 },
  { key: 'softLeanMassKg', label: 'Тощая масса', unit: 'кг', digits: 1 },
  { key: 'fatFreeMassKg', label: 'Безжировая масса', unit: 'кг', digits: 1 },
  { key: 'bodyCellMassKg', label: 'Активная масса клеток', unit: 'кг', digits: 1 },
  { key: 'smi', label: 'Индекс скелетной мускулатуры', unit: 'кг/м²', digits: 1 },
  { key: 'waistHipRatio', label: 'Талия/бёдра', unit: '', digits: 2, lower: true },
  { key: 'armCircumferenceCm', label: 'Окружность руки', unit: 'см', digits: 1 },
  { key: 'armMuscleCircumferenceCm', label: 'Окружность руки без жира', unit: 'см', digits: 1 },
  { key: 'idealWeightKg', label: 'Идеальный вес', unit: 'кг', digits: 1 },
  { key: 'weightControlKg', label: 'Контроль веса', unit: 'кг', digits: 1 },
  { key: 'fatControlKg', label: 'Контроль жира', unit: 'кг', digits: 1 },
  { key: 'muscleControlKg', label: 'Контроль мышц', unit: 'кг', digits: 1 },
];

const SEGMENTS: ReadonlyArray<{ key: InBodySegmentKey; label: string }> = [
  { key: 'rightArm', label: 'Правая рука' },
  { key: 'leftArm', label: 'Левая рука' },
  { key: 'trunk', label: 'Туловище' },
  { key: 'rightLeg', label: 'Правая нога' },
  { key: 'leftLeg', label: 'Левая нога' },
];

const show = (v: number | null, f: Field) => (v === null ? '—' : `${fmt(v, f.digits)}${f.unit ? `\u00a0${f.unit}` : ''}`);

/** «Профиль»: the last InBody test in short. */
export function InBodyCard() {
  const { snapshot: s } = useData();
  const last = s.inbodyTests[0];
  return (
    <Card onClick={() => go('profile/inbody')}>
      <div className="goal-card">
        <span className="li-icon lime"><Icon name="scale" /></span>
        <div className="grow">
          <div className="t-small">InBody</div>
          <div className="li-title">{last ? `${formatDateShort(last.measuredOn)} · ${fmt(last.weightKg, 1)} кг` : 'Состав тела'}</div>
          <div className="li-sub">{last ? [last.bodyFatPct !== null ? `жир ${fmt(last.bodyFatPct, 1)}%` : null, last.skeletalMuscleKg !== null ? `мышцы ${fmt(last.skeletalMuscleKg, 1)} кг` : null, last.score !== null ? `оценка ${last.score}` : null].filter(Boolean).join(' · ') : 'Сканируй QR с распечатки или введи вручную'}</div>
        </div>
        <Icon name="chevronRight" size={18} />
      </div>
    </Card>
  );
}

export function InBodyScreen() {
  const { snapshot: s } = useData();
  const [scan, setScan] = useState(false);
  const [form, setForm] = useState<{ id: string | null; values: InBodyValues | null } | null>(null);
  const [open, setOpen] = useState<InBodyTest | null>(null);
  const [all, setAll] = useState(false);
  const tests = s.inbodyTests;
  const last = tests[0];
  const prev = tests[1];
  return (
    <main className="screen no-nav">
      <ScreenHeader title="InBody" back="profile" />
      <div className="row">
        <Button className="grow" icon="scan" onClick={() => setScan(true)}>QR-код</Button>
        <Button className="grow" variant="secondary" icon="edit" onClick={() => setForm({ id: null, values: null })}>Вручную</Button>
      </div>
      {!last ? (
        <Card flat>
          <EmptyState icon="scale" title="Тестов пока нет" text="Отсканируй QR-код с распечатки InBody — все значения заполнятся сами. Или введи их вручную. Вес и процент жира попадут и в «Замеры и вес»." />
        </Card>
      ) : (
        <Card>
          <div className="stack tight">
            <div className="row between">
              <span className="t-h3">{last.measuredOn === s.today ? 'Сегодня' : formatDateLong(last.measuredOn)}{last.measuredAt ? `, ${last.measuredAt}` : ''}</span>
              {prev && <span className="t-small">к {formatDateShort(prev.measuredOn)}</span>}
            </div>
            <Values test={last} prev={prev} fields={MAIN} />
            {all && (
              <>
                <Values test={last} prev={prev} fields={MORE} />
                <SegmentsTable title="Мышцы по сегментам" seg={last.leanSegments} />
                <SegmentsTable title="Жир по сегментам" seg={last.fatSegments} />
              </>
            )}
            <Button variant="text" icon={all ? 'arrowUp' : 'chevronDown'} onClick={() => setAll(!all)}>{all ? 'Свернуть' : 'Показать всё'}</Button>
          </div>
        </Card>
      )}
      {tests.length > 0 && (
        <div className="stack tight">
          <div className="section-title"><h2 className="t-h3">История</h2></div>
          <div className="list">
            {tests.map((t) => (
              <button key={t.id} type="button" className="plan-day" onClick={() => setOpen(t)}>
                <span className="plan-date"><b>{WEEKDAY_SHORT[weekdayOf(t.measuredOn)]}</b><span>{formatDateShort(t.measuredOn)}</span></span>
                <span className="grow">
                  <span className="li-title">{fmt(t.weightKg, 1)} кг{t.score !== null ? ` · ${t.score} баллов` : ''}</span>
                  <span className="li-sub">{[t.bodyFatPct !== null ? `жир ${fmt(t.bodyFatPct, 1)}%` : null, t.skeletalMuscleKg !== null ? `мышцы ${fmt(t.skeletalMuscleKg, 1)} кг` : null].filter(Boolean).join(' · ')}</span>
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            ))}
          </div>
        </div>
      )}
      <ScanSheet open={scan} onClose={() => setScan(false)} onRead={(v) => { setScan(false); setForm({ id: null, values: v }); }} onManual={() => { setScan(false); setForm({ id: null, values: null }); }} />
      {form && <FormSheet key={form.id ?? 'new'} id={form.id} initial={form.values} onClose={() => setForm(null)} />}
      <TestSheet test={open} onClose={() => setOpen(null)} onEdit={(t) => { setOpen(null); const { id, createdAt, updatedAt, deletedAt, deviceId, ...values } = t; void createdAt; void updatedAt; void deletedAt; void deviceId; setForm({ id, values }); }} />
    </main>
  );
}

function Values({ test, prev, fields }: { test: InBodyValues; prev?: InBodyValues; fields: readonly Field[] }) {
  return (
    <div>
      {fields.filter((f) => test[f.key] !== null).map((f) => {
        const v = test[f.key] as number;
        const p = prev ? (prev[f.key] as number | null) : null;
        const d = p !== null ? v - p : null;
        const good = d !== null && d !== 0 ? (f.lower ? d < 0 : d > 0) : null;
        return (
          <div key={f.key} className="kv">
            <span>{f.label}</span>
            <span>
              <b>{show(v, f)}</b>
              {d !== null && Math.abs(d) >= 10 ** -f.digits / 2 && <span className={`t-small ${good ? 'tone-good' : 'tone-bad'}`} style={{ marginLeft: 6 }}>{signed(d, f.digits)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SegmentsTable({ title, seg }: { title: string; seg: InBodySegments | null }) {
  if (!seg) return null;
  return (
    <div>
      <div className="t-caption" style={{ marginTop: 8 }}>{title}</div>
      {SEGMENTS.map((x) => (
        <div key={x.key} className="kv">
          <span>{x.label}</span>
          <span><b>{seg[x.key].kg === null ? '—' : `${fmt(seg[x.key].kg as number, 2)}\u00a0кг`}</b>{seg[x.key].pct !== null && <span className="t-small" style={{ marginLeft: 6 }}>{fmt(seg[x.key].pct as number, 1)}%</span>}</span>
        </div>
      ))}
    </div>
  );
}

function TestSheet({ test, onClose, onEdit }: { test: InBodyTest | null; onClose: () => void; onEdit: (t: InBodyTest) => void }) {
  const { run, banner, busy } = useCommand();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [test?.id]);
  if (!test) return null;
  return (
    <Sheet open title={`InBody · ${formatDateLong(test.measuredOn)}`} onClose={onClose}>
      <div className="stack">
        {banner}
        <p className="t-small">{test.source === 'qr' ? `Из QR-кода${test.device ? `, InBody${test.device}` : ''}` : 'Введено вручную'}{test.measuredAt ? ` · ${test.measuredAt}` : ''}</p>
        <Values test={test} fields={[...MAIN, ...MORE]} />
        <SegmentsTable title="Мышцы по сегментам" seg={test.leanSegments} />
        <SegmentsTable title="Жир по сегментам" seg={test.fatSegments} />
        {test.note && <p className="t-small">{test.note}</p>}
        <Button block variant="secondary" icon="edit" onClick={() => onEdit(test)}>Изменить</Button>
        {confirm ? (
          <Button block variant="danger" icon="trash" disabled={busy} onClick={async () => { if (await run((d) => deleteInBodyTest(d, test.id))) onClose(); }}>Точно удалить</Button>
        ) : (
          <Button block variant="text" icon="trash" onClick={() => setConfirm(true)}>Удалить тест</Button>
        )}
      </div>
    </Sheet>
  );
}

/** Camera on the QR code of the printout, or a photo of the sheet from the gallery. */
function ScanSheet({ open, onClose, onRead, onManual }: { open: boolean; onClose: () => void; onRead: (v: InBodyValues) => void; onManual: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [camera, setCamera] = useState(true);
  const done = useRef(false);
  const accept = (text: string): boolean => {
    try {
      const v = parseInBodyQr(text);
      done.current = true;
      onRead(v);
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  useEffect(() => {
    if (!open) return;
    done.current = false;
    setProblem(null);
    setCamera(true);
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera');
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video.current as HTMLVideoElement, (result) => {
          const text = result?.getText();
          if (text && !done.current && /inbody|IBData/i.test(text)) {
            if (accept(text)) controls.stop();
          }
        });
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch {
        setCamera(false);
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [open]);
  const fromPhoto = async (f: File | undefined) => {
    if (!f) return;
    setProblem(null);
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const { DecodeHintType } = await import('@zxing/library');
      const reader = new BrowserQRCodeReader(new Map([[DecodeHintType.TRY_HARDER, true]]));
      // A photo of the whole sheet: the code is small, so look in the whole picture and then in its parts (bottom right first).
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const regions: Array<[number, number, number, number]> = [[0, 0, 1, 1]];
      for (const size of [0.5, 0.35]) {
        const step = size / 2;
        for (let y = 1 - size; y >= -0.001; y -= step) for (let x = 1 - size; x >= -0.001; x -= step) regions.push([Math.max(0, x), Math.max(0, y), size, size]);
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let text: string | null = null;
      for (const [x, y, w, h] of regions) {
        const sw = W * w;
        const sh = H * h;
        const k = Math.min(1, 1400 / Math.max(sw, sh));
        canvas.width = Math.round(sw * k);
        canvas.height = Math.round(sh * k);
        ctx?.drawImage(img, W * x, H * y, sw, sh, 0, 0, canvas.width, canvas.height);
        try {
          text = reader.decodeFromCanvas(canvas).getText();
          break;
        } catch {
          /* not in this part */
        }
      }
      if (text === null) throw new Error('not found');
      accept(text);
    } catch {
      setProblem('На фото не нашёлся QR-код. Сфотографируй его крупнее и ровнее, при хорошем свете.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  return (
    <Sheet open={open} title="QR-код InBody" onClose={onClose}>
      <div className="stack">
        {camera ? (
          <div className="scan-box">
            <video ref={video} className="scan-video" playsInline muted autoPlay aria-label="Камера для QR-кода" />
          </div>
        ) : (
          <div className="note">Камера недоступна. Разреши доступ к камере в настройках телефона или загрузи фото распечатки.</div>
        )}
        <p className="t-small">Наведи камеру на QR-код в правом нижнем углу распечатки — значения заполнятся сами, останется проверить и сохранить.</p>
        {problem && <div className="errbox" role="alert">{problem}</div>}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        <Button block variant="secondary" icon="upload" onClick={() => file.current?.click()}>Загрузить фото распечатки</Button>
        <Button block variant="text" icon="edit" onClick={onManual}>Ввести вручную</Button>
      </div>
    </Sheet>
  );
}

const emptyValues = (today: string): InBodyValues => ({
  measuredOn: today, measuredAt: null, device: null, source: 'manual', weightKg: 0, skeletalMuscleKg: null, bodyFatKg: null, bodyFatPct: null,
  totalBodyWaterL: null, intracellularWaterL: null, extracellularWaterL: null, proteinKg: null, mineralsKg: null, fatFreeMassKg: null, softLeanMassKg: null,
  bmi: null, score: null, bmrKcal: null, visceralFatLevel: null, waistHipRatio: null, ecwRatio: null, idealWeightKg: null, weightControlKg: null,
  fatControlKg: null, muscleControlKg: null, bodyCellMassKg: null, armCircumferenceCm: null, armMuscleCircumferenceCm: null, boneMineralKg: null, smi: null,
  leanSegments: null, fatSegments: null, note: null,
});

const txt = (v: number | null): string => (v === null ? '' : String(v).replace('.', ','));

/** Check what the QR gave, or type the sheet in: every value is optional except the weight. */
function FormSheet({ id, initial, onClose }: { id: string | null; initial: InBodyValues | null; onClose: () => void }) {
  const { snapshot: s } = useData();
  const { run, banner, busy } = useCommand();
  const start = initial ?? emptyValues(s.today);
  const [date, setDate] = useState(start.measuredOn);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries([...MAIN, ...MORE].map((f) => [f.key, initial ? txt(start[f.key] as number | null) : ''])));
  const segInit = (seg: InBodySegments | null, kind: string) => Object.fromEntries(SEGMENTS.flatMap((x) => [[`${kind}.${x.key}.kg`, txt(seg?.[x.key].kg ?? null)], [`${kind}.${x.key}.pct`, txt(seg?.[x.key].pct ?? null)]]));
  const [segs, setSegs] = useState<Record<string, string>>(() => ({ ...segInit(start.leanSegments, 'lean'), ...segInit(start.fatSegments, 'fat') }));
  const [more, setMore] = useState(initial !== null);
  const [error, setError] = useState<string | null>(null);
  const num = (t: string | undefined): number | null => {
    if (!t || !t.trim()) return null;
    const v = parseDecimal(t);
    return Number.isFinite(v) ? v : NaN;
  };
  const segOf = (kind: string): InBodySegments | null => {
    const out = Object.fromEntries(SEGMENTS.map((x) => [x.key, { kg: num(segs[`${kind}.${x.key}.kg`]), pct: num(segs[`${kind}.${x.key}.pct`]) }])) as InBodySegments;
    return SEGMENTS.some((x) => out[x.key].kg !== null || out[x.key].pct !== null) ? out : null;
  };
  const save = async () => {
    const values: InBodyValues = { ...start, measuredOn: date };
    for (const f of [...MAIN, ...MORE]) {
      const v = num(vals[f.key]);
      if (Number.isNaN(v)) return setError(`Проверь поле «${f.label}»`);
      (values as Record<string, unknown>)[f.key] = v;
    }
    if (values.weightKg === null || !(values.weightKg >= 20)) return setError('Укажи вес — он есть в любом тесте');
    values.leanSegments = segOf('lean');
    values.fatSegments = segOf('fat');
    if (values.bodyFatPct === null && values.bodyFatKg !== null) values.bodyFatPct = Math.round((values.bodyFatKg / values.weightKg) * 1000) / 10;
    setError(null);
    if (await run((d) => saveInBodyTest(d, { id, values }))) onClose();
  };
  const field = (f: Field) => <TextField key={f.key} label={f.label} unit={f.unit || undefined} inputMode="decimal" value={vals[f.key] ?? ''} onChange={(e) => setVals((x) => ({ ...x, [f.key]: e.target.value }))} />;
  return (
    <Sheet open title={id ? 'Изменить тест InBody' : initial ? 'Проверь и сохрани' : 'Тест InBody вручную'} onClose={onClose}>
      <div className="stack">
        {initial && !id && <p className="t-small">QR прочитан. Сверь главные цифры с распечаткой и сохрани. Вес и процент жира попадут и в «Замеры и вес».</p>}
        <DateField label="Дата теста" value={date} max={s.today} onChange={setDate} />
        {MAIN.map(field)}
        <Button variant="text" icon={more ? 'arrowUp' : 'chevronDown'} onClick={() => setMore(!more)}>{more ? 'Скрыть остальное' : 'Остальные показатели и сегменты'}</Button>
        {more && (
          <>
            {MORE.map(field)}
            {(['lean', 'fat'] as const).map((kind) => (
              <div key={kind} className="stack tight">
                <span className="t-caption">{kind === 'lean' ? 'Мышцы по сегментам (кг · % нормы)' : 'Жир по сегментам (кг · % нормы)'}</span>
                {SEGMENTS.map((x) => (
                  <div key={x.key} className="row">
                    <TextField className="grow" label={x.label} unit="кг" inputMode="decimal" value={segs[`${kind}.${x.key}.kg`] ?? ''} onChange={(e) => setSegs((o) => ({ ...o, [`${kind}.${x.key}.kg`]: e.target.value }))} />
                    <TextField className="grow" label="% нормы" unit="%" inputMode="decimal" value={segs[`${kind}.${x.key}.pct`] ?? ''} onChange={(e) => setSegs((o) => ({ ...o, [`${kind}.${x.key}.pct`]: e.target.value }))} />
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
        {error && <div className="errbox" role="alert">{error}</div>}
        {banner}
        <Button block icon="check" disabled={busy} onClick={() => void save()}>Сохранить</Button>
      </div>
    </Sheet>
  );
}
