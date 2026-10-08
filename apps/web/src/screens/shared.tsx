import { useState, type ReactNode } from 'react';
import type { MetricType } from '@fitapp/domain';
import { addMetric } from '../actions';
import { useData } from '../app/DataContext';
import { BODY_MEASUREMENTS, METRIC_LABELS } from '../app/format';
import { goBack } from '../app/router';
import { Button, IconButton, SelectField, Sheet, TextField } from '../ui';

export function ScreenHeader({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <header className="screen-head">
      <div className="back">
        {back && <IconButton icon="chevronLeft" label="Назад" tone="ghost" onClick={() => goBack(back)} />}
        <h1 className="t-h2">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export const parseDecimal = (s: string): number => Number(s.trim().replace(',', '.'));

export function AddWeightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snapshot, act } = useData();
  const [value, setValue] = useState('');
  const [date, setDate] = useState(snapshot.today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const v = parseDecimal(value);
    if (!Number.isFinite(v) || v < 30 || v > 300) return setError('Введи вес в килограммах, от 30 до 300');
    setBusy(true);
    try {
      await act((deps) => addMetric(deps, { type: 'weight', value: Math.round(v * 10) / 10, date }));
      setValue('');
      setError(null);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} title="Записать вес" onClose={onClose}>
      <div className="stack">
        <TextField label="Вес утром" unit="кг" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={snapshot.weight.currentKg ? String(snapshot.weight.currentKg).replace('.', ',') : '82,5'} error={error} autoFocus />
        <TextField label="Дата" type="date" value={date} max={snapshot.today} onChange={(e) => setDate(e.target.value)} />
        <Button block onClick={submit} disabled={busy}>Сохранить</Button>
      </div>
    </Sheet>
  );
}

export function AddMeasurementSheet({ open, onClose, type: fixedType }: { open: boolean; onClose: () => void; type?: MetricType }) {
  const { snapshot, act } = useData();
  const [type, setType] = useState<MetricType>(fixedType ?? 'waist');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(snapshot.today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = fixedType ?? type;
  const submit = async () => {
    const v = parseDecimal(value);
    if (!Number.isFinite(v) || v < 5 || v > 300) return setError('Введи обхват в сантиметрах, от 5 до 300');
    setBusy(true);
    try {
      await act((deps) => addMetric(deps, { type: chosen, value: Math.round(v * 10) / 10, date }));
      setValue('');
      setError(null);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} title="Новый замер" onClose={onClose}>
      <div className="stack">
        {!fixedType && (
          <SelectField label="Что измеряем" value={type} onChange={(e) => setType(e.target.value as MetricType)}>
            {BODY_MEASUREMENTS.map((t) => (
              <option key={t} value={t}>{METRIC_LABELS[t]}</option>
            ))}
          </SelectField>
        )}
        <TextField label={fixedType ? METRIC_LABELS[fixedType] : 'Значение'} unit="см" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} error={error} autoFocus />
        <TextField label="Дата" type="date" value={date} max={snapshot.today} onChange={(e) => setDate(e.target.value)} />
        <Button block onClick={submit} disabled={busy}>Сохранить</Button>
      </div>
    </Sheet>
  );
}
