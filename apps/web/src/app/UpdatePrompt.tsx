import { useEffect, useState } from 'react';
import { Button, Sheet } from '../ui';

/** Fired by main.tsx when a new version of the app has been downloaded and is ready. */
export const UPDATE_EVENT = 'fitapp:update-ready';

/** «Доступно обновление»: «Обновить» reloads the app into the new version. Data in the phone's storage is not touched. */
export function UpdatePrompt() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(UPDATE_EVENT, on);
    return () => window.removeEventListener(UPDATE_EVENT, on);
  }, []);
  return (
    <Sheet open={open} title="Доступно обновление" onClose={() => setOpen(false)}>
      <div className="stack">
        <p className="t-body">Новая версия приложения уже загружена. Нажми «Обновить» — приложение перезапустится. Твои данные останутся на месте.</p>
        <Button block icon="check" onClick={() => location.reload()}>Обновить</Button>
        <Button block variant="text" onClick={() => setOpen(false)}>Позже</Button>
      </div>
    </Sheet>
  );
}
