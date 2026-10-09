/** Presentation-only preferences kept in the browser (not part of the user's records or backups). */
const KEY = 'fitapp.displayName';

export function getDisplayName(): string {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
export function setDisplayName(name: string): void {
  try {
    if (name.trim()) window.localStorage.setItem(KEY, name.trim());
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the name is optional */
  }
}

// ---- "Со своим весом" mode: a temporary status, the program itself is never changed.
import { useSyncExternalStore } from 'react';

const BW_KEY = 'fitapp.bodyweightMode';
const listeners = new Set<() => void>();
let bwCache: boolean | null = null;

function readBw(): boolean {
  try {
    return window.localStorage.getItem(BW_KEY) === '1';
  } catch {
    return bwCache ?? false;
  }
}
export function setBodyweightMode(on: boolean): void {
  bwCache = on;
  try {
    if (on) window.localStorage.setItem(BW_KEY, '1');
    else window.localStorage.removeItem(BW_KEY);
  } catch {
    /* storage unavailable: the mode lives until the page is closed */
  }
  listeners.forEach((l) => l());
}
export function useBodyweightMode(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => bwCache ?? readBw(),
  );
}
