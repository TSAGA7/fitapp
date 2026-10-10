import type { BackupService } from '@fitapp/domain';

const pad = (n: number): string => String(n).padStart(2, '0');
/** The date on the phone's own clock (local midnight is what the user means by "every day at 00:00"). */
export const deviceLocalDate = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Milliseconds until the next local midnight. */
export const msToNextMidnight = (d: Date = new Date()): number => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime() - d.getTime();

/**
 * Daily automatic copy. A web app cannot run while it is closed, so the copy is made at 00:00 when the app is open,
 * and otherwise the first time it is opened (or brought back to the screen) on a new day. Returns a stop function.
 */
export function startAutoBackup(backup: BackupService, onWritten?: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const run = async () => {
    try {
      if (await backup.autoBackup(deviceLocalDate())) onWritten?.();
    } catch {
      /* a failed copy must never disturb the app; the next attempt is at the next opening */
    }
  };
  const schedule = () => {
    timer = setTimeout(() => {
      if (stopped) return;
      void run().then(schedule);
    }, msToNextMidnight() + 500);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void run();
  };
  const first = setTimeout(() => void run(), 2500);
  schedule();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    clearTimeout(first);
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
