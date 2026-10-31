import { useEffect, useState } from 'react';
import { Button, Icon } from '../ui';

/** Fired by main.tsx when a new version of the app has been downloaded and is ready. */
export const UPDATE_EVENT = 'fitapp:update-ready';

/** «Доступно обновление» as a window in the middle of the screen: «Обновить» reloads the app into the new version. Data in the phone's storage is not touched. */
export function UpdatePrompt() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(UPDATE_EVENT, on);
    return () => window.removeEventListener(UPDATE_EVENT, on);
  }, []);
  if (!open) return null;
  return (
    <div className="upd-backdrop" onClick={() => setOpen(false)}>
      <div className="upd-card" role="alertdialog" aria-modal="true" aria-labelledby="upd-title" onClick={(e) => e.stopPropagation()}>
        <span className="upd-icon" aria-hidden="true"><Icon name="history" size={28} /></span>
        <h2 id="upd-title" className="t-h3">Доступно обновление</h2>
        <p className="t-small">Новая версия уже загружена. Нажми «Обновить» — приложение перезапустится. Данные останутся на месте.</p>
        <Button block icon="check" onClick={() => location.reload()}>Обновить</Button>
        <Button block variant="text" onClick={() => setOpen(false)}>Позже</Button>
      </div>
    </div>
  );
}
