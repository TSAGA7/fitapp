import { useEffect, useState } from 'react';
import type { BackupImportPreview, ConflictPolicy, ExcelImportPreview, ExerciseDecision } from '@fitapp/domain';
import { useData } from '../app/DataContext';
import { formatDay } from '../app/format';
import { Badge, Button, Segmented } from '../ui';

type Pending =
  | { kind: 'json'; preview: BackupImportPreview; json: string; policy: ConflictPolicy }
  | { kind: 'excel'; preview: ExcelImportPreview; file: ArrayBuffer; decisions: Record<string, ExerciseDecision> };

const POLICIES: ReadonlyArray<{ value: ConflictPolicy; label: string }> = [
  { value: 'keep_existing', label: 'Оставить моё' },
  { value: 'overwrite_if_newer', label: 'Что новее' },
  { value: 'overwrite_all', label: 'Заменить' },
];

/** Choose a file -> preview (nothing is changed) -> confirm. Works for a Fitapp .json copy and an .xlsx table. */
export function ImportPanel({ onDone, preload }: { onDone?: () => void; preload?: string }) {
  const { runtime, refresh } = useData();
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const guard = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // A copy chosen elsewhere (the automatic one): shown as a preview, restoring replaces the records that differ.
  useEffect(() => {
    if (!preload) return;
    void guard(async () => {
      setPending({ kind: 'json', json: preload, policy: 'overwrite_all', preview: await runtime.backup.previewImport(preload, 'overwrite_all') });
    });
  }, [preload]);

  const choose = (file: File | undefined) =>
    guard(async () => {
      if (!file) return;
      setPending(null);
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const buffer = await file.arrayBuffer();
        setPending({ kind: 'excel', file: buffer, decisions: {}, preview: await runtime.excelImport.preview(buffer) });
      } else {
        const json = await file.text();
        setPending({ kind: 'json', json, policy: 'keep_existing', preview: await runtime.backup.previewImport(json) });
      }
    });

  const decide = (normalized: string, decision: ExerciseDecision) =>
    guard(async () => {
      if (pending?.kind !== 'excel') return;
      const decisions = { ...pending.decisions, [normalized]: decision };
      setPending({ ...pending, decisions, preview: await runtime.excelImport.preview(pending.file, decisions) });
    });

  const setPolicy = (policy: ConflictPolicy) =>
    guard(async () => {
      if (pending?.kind !== 'json') return;
      setPending({ ...pending, policy, preview: await runtime.backup.previewImport(pending.json, policy) });
    });

  const confirm = () =>
    guard(async () => {
      if (!pending) return;
      if (pending.kind === 'json') {
        const r = await runtime.backup.applyImport(pending.preview, { confirmed: true });
        setMessage({ ok: true, text: `Готово: добавлено ${r.inserted}, обновлено ${r.updated}, без изменений ${r.skippedIdentical}.` });
      } else {
        const r = await runtime.excelImport.apply(pending.preview, { confirmed: true });
        setMessage({ ok: true, text: `Готово: подходов ${r.created.setLogs}, замеров веса ${r.created.bodyMetrics}, дней питания ${r.created.foodLogs}.` });
      }
      setPending(null);
      await refresh();
      onDone?.();
    });

  return (
    <div className="stack">
      <label className="btn secondary block" style={{ cursor: 'pointer' }}>
        Выбрать файл (.json или .xlsx)
        <input type="file" accept=".json,.xlsx" className="sr-only" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {busy && <p className="note" role="status">Читаю файл…</p>}
      {message && <div className={message.ok ? 'ok' : 'errbox'} role="status">{message.text}</div>}
      {pending?.kind === 'json' && <JsonPreview p={pending.preview} policy={pending.policy} onPolicy={setPolicy} />}
      {pending?.kind === 'excel' && <ExcelPreview p={pending.preview} decisions={pending.decisions} onDecide={decide} />}
      {pending && (
        <div className="row">
          <Button onClick={confirm} disabled={busy || (pending.kind === 'json' && !pending.preview.validation.ok)}>Подтвердить импорт</Button>
          <Button variant="text" onClick={() => setPending(null)}>Отмена</Button>
        </div>
      )}
    </div>
  );
}

function JsonPreview({ p, policy, onPolicy }: { p: BackupImportPreview; policy: ConflictPolicy; onPolicy: (v: ConflictPolicy) => void }) {
  if (!p.validation.ok) return <div className="errbox">{p.validation.errors.join(' ')}</div>;
  const insert = Object.values(p.plan.toInsert).reduce((a, r) => a + r.length, 0);
  const update = Object.values(p.plan.toUpdate).reduce((a, r) => a + r.length, 0);
  return (
    <div className="card flat stack">
      <strong>Предпросмотр: резервная копия</strong>
      <div className="kv"><span>Будет добавлено</span><span>{insert}</span></div>
      <div className="kv"><span>Совпадает с имеющимся</span><span>{Object.values(p.plan.identical).reduce((a, b) => a + b, 0)}</span></div>
      <div className="kv"><span>Конфликтов</span><span>{p.conflicts.length}</span></div>
      {update > 0 && <div className="kv"><span>Будет заменено</span><span>{update}</span></div>}
      <div className="kv"><span>Некорректных записей (не импортируются)</span><span>{p.validation.invalid.length}</span></div>
      {p.dangling.length > 0 && <div className="warn">Ссылок на отсутствующие данные: {p.dangling.length}.</div>}
      {p.conflicts.length > 0 && (
        <>
          <span className="note">Если запись есть и в приложении, и в файле:</span>
          <Segmented small options={POLICIES} value={policy} onChange={onPolicy} label="Что делать с конфликтами" />
        </>
      )}
    </div>
  );
}

function ExcelPreview({ p, decisions, onDecide }: { p: ExcelImportPreview; decisions: Record<string, ExerciseDecision>; onDecide: (norm: string, d: ExerciseDecision) => void }) {
  const n = p.normalization;
  const unknown = n.exerciseResolutions.filter((r) => r.resolved === null);
  const skipped = p.skippedExisting.setLogs + p.skippedExisting.weights + p.skippedExisting.foodDays + p.skippedExisting.dailyLogs;
  return (
    <div className="stack">
      <div className="card flat stack">
        <strong>Предпросмотр: таблица Excel</strong>
        <div className="kv"><span>Тренировок</span><span>{p.counts.workoutSessions}</span></div>
        <div className="kv"><span>Подходов (RIR не указан у {p.counts.setLogsWithoutRir})</span><span>{p.counts.setLogs}</span></div>
        <div className="kv"><span>Новых упражнений</span><span>{p.counts.customExercises}</span></div>
        <div className="kv"><span>Замеров веса</span><span>{p.counts.bodyMetrics}</span></div>
        <div className="kv"><span>Дней питания</span><span>{p.counts.foodLogs}</span></div>
        <div className="kv"><span>Уже есть в приложении (пропущено)</span><span>{skipped}</span></div>
        <div className="kv"><span>Не распознано строк</span><span>{n.rejected.length}</span></div>
        {n.dateRange && <p className="note">Период: {formatDay(n.dateRange.from)} {n.dateRange.from.slice(0, 4)} — {formatDay(n.dateRange.to)} {n.dateRange.to.slice(0, 4)}</p>}
        <p className="note">Ничего не перезаписывается: то, что уже есть, остаётся как есть. RIR не придумывается.</p>
      </div>
      {n.sheets.length > 0 && (
        <div className="card flat stack">
          <strong>Листы</strong>
          {n.sheets.map((s) => (
            <div className="kv" key={s.name}>
              <span>{s.name}</span>
              <span>{s.kind === 'training' ? 'тренировки' : s.kind === 'nutrition' ? 'питание' : 'пропущен'}</span>
            </div>
          ))}
        </div>
      )}
      {unknown.length > 0 && (
        <div className="card flat stack">
          <strong>Упражнения не из каталога</strong>
          {unknown.map((r) => {
            const choice = decisions[r.normalized] ?? r.decision;
            return (
              <div key={r.normalized} className="stack">
                <div className="row between">
                  <span>{r.sourceName}</span>
                  <Badge tone="neutral">{r.rowCount} стр.</Badge>
                </div>
                {r.inferred ? (
                  <Segmented small label={`Что сделать с «${r.sourceName}»`} options={[{ value: 'create', label: 'Создать' }, { value: 'skip', label: 'Пропустить' }]} value={choice.kind === 'create' ? 'create' : 'skip'} onChange={(v) => onDecide(r.normalized, v === 'create' ? { kind: 'create' } : { kind: 'skip' })} />
                ) : (
                  <span className="note">Не удалось понять тип упражнения — строки пропущены.</span>
                )}
              </div>
            );
          })}
          <p className="note">Созданные упражнения получают теги по названию: проверь их позже.</p>
        </div>
      )}
      {n.rejected.length > 0 && (
        <details className="card flat">
          <summary>Что не распознано ({n.rejected.length})</summary>
          <ul style={{ paddingLeft: 18 }}>
            {n.rejected.slice(0, 30).map((r, i) => (
              <li key={i} className="note">{r.sheet}, строка {r.rowNumber}: {r.reasons.join('; ')}</li>
            ))}
          </ul>
        </details>
      )}
      {n.warnings.map((w) => (
        <div className="warn" key={w}>{w}</div>
      ))}
    </div>
  );
}

