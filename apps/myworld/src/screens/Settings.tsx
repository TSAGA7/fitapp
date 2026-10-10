import { useEffect, useState } from 'react';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '../app/theme';
import { useToast } from '../app/toast';
import { db, setSetting, useWorld } from '../app/world';
import { type Backup, exportBackup, parseBackup, restoreBackup, summarize } from '../data/backup';
import { countLabel } from '../domain/dates';
import { METHODOLOGIES, type Methodology } from '../domain/model';
import { METHODOLOGY_INFO, worldProgress } from '../domain/world';
import { COUNTRIES } from '../geo/reference';
import { Icon } from '../ui/Icon';
import { Confirm, Segmented, Sheet } from '../ui/kit';

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} МБ`;

export function Settings({ onClose }: { onClose: () => void }) {
  const { settings, world } = useWorld();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);
  const [usage, setUsage] = useState<string | null>(null);
  const [withFiles, setWithFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(`${mb(e.usage)}${e.quota ? ` из ${mb(e.quota)}` : ''}`))
      .catch(() => undefined);
  }, []);

  const doExport = async () => {
    setBusy(true);
    try {
      const now = new Date();
      const backup = await exportBackup(db, withFiles, now.toISOString());
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myworld-${now.toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast(`Копия сохранена: ${mb(blob.size)}`);
    } catch (e) {
      toast(`Не удалось сохранить копию: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const pickImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPending(parseBackup(JSON.parse(await file.text())));
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Файл повреждён: это не JSON' : e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sheet title="Настройки" onClose={onClose}>
      <section className="stack">
        <h3 className="h3">Оформление</h3>
        <Segmented
          label="Тема"
          value={theme}
          onChange={(v) => {
            setTheme(v);
            setThemeChoice(v);
          }}
          options={[
            { value: 'system', label: 'Как в системе' },
            { value: 'light', label: 'Светлая' },
            { value: 'dark', label: 'Тёмная' },
          ]}
        />
      </section>

      <section className="stack">
        <h3 className="h3">Как считать страны</h3>
        <div className="list">
          {METHODOLOGIES.map((m: Methodology) => {
            const p = worldProgress(COUNTRIES, world.visitedCountryIds, m);
            return (
              <button key={m} type="button" className="list-row" onClick={() => void setSetting('methodology', m)} aria-pressed={settings.methodology === m}>
                <span className={`radio ${settings.methodology === m ? 'on' : ''}`} aria-hidden="true" />
                <span className="grow">
                  <span className="t">{METHODOLOGY_INFO[m].title}</span>
                  <span className="s block">{METHODOLOGY_INFO[m].hint}</span>
                </span>
                <span className="faint small num">
                  {p.visited}/{p.total}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="stack">
        <h3 className="h3">Карта</h3>
        <div className="list">
          <label className="list-row tap">
            <span className="grow">
              <span className="t">Упрощённый режим</span>
              <span className="s block">Лёгкая карта без WebGL, глобус не вращается сам. Для старых телефонов.</span>
            </span>
            <input type="checkbox" className="switch" checked={settings.lite} onChange={(e) => void setSetting('lite', e.target.checked)} />
          </label>
          <label className="list-row tap">
            <span className="grow">
              <span className="t">Подробная подложка</span>
              <span className="s block">Названия городов, дороги и озёра из OpenStreetMap. Нужен интернет; без него карта работает на встроенных границах.</span>
            </span>
            <input type="checkbox" className="switch" checked={settings.detail} onChange={(e) => void setSetting('detail', e.target.checked)} />
          </label>
        </div>
      </section>

      <section className="stack">
        <h3 className="h3">Данные</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Всё хранится только на этом устройстве{usage ? ` (занято ${usage})` : ''}. Сохраняйте резервную копию, чтобы перенести данные на другой телефон или
          не потерять их при очистке Safari.
        </p>
        <label className="row small">
          <input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} />
          Включить файлы билетов и броней в копию
        </label>
        <div className="grid-2">
          <button type="button" className="btn dark" onClick={() => void doExport()} disabled={busy}>
            <Icon name="download" size={18} /> Сохранить копию
          </button>
          <label className="btn glass-btn">
            <Icon name="upload" size={18} /> Восстановить
            <input type="file" accept="application/json,.json" className="sr" onChange={(e) => void pickImport(e.target.files?.[0])} />
          </label>
        </div>
      </section>

      <section className="stack tight">
        <h3 className="h3">Источники</h3>
        <p className="faint small" style={{ margin: 0 }}>
          Границы стран и справочник городов — Natural Earth (общественное достояние). Подробная подложка — OpenFreeMap, OpenMapTiles, © участники
          OpenStreetMap. Флаги — flag-icons (MIT). Шрифт Onest (SIL OFL). Число стран зависит от выбранного способа подсчёта.
        </p>
      </section>

      {pending && (
        <Confirm
          title="Восстановить из копии?"
          text={(() => {
            const s = summarize(pending);
            return `В копии ${countLabel(s.trips, 'поездка', 'поездки', 'поездок')}, ${countLabel(s.visits, 'посещение', 'посещения', 'посещений')}, ${countLabel(s.files, 'файл', 'файла', 'файлов')}${
              s.missingFiles ? ` (${s.missingFiles} без содержимого — они не восстановятся)` : ''
            }. Текущие данные на этом устройстве будут заменены.`;
          })()}
          confirmLabel="Заменить данные"
          danger
          onConfirm={async () => {
            await restoreBackup(db, pending);
            toast('Данные восстановлены');
          }}
          onClose={() => setPending(null)}
        />
      )}
    </Sheet>
  );
}
