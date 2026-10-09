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

// ---- theme: follows the system by default, or is forced light / dark
export type ThemeChoice = 'system' | 'light' | 'dark';
const THEME_KEY = 'fitapp.theme';
const themeListeners = new Set<() => void>();
let themeCache: ThemeChoice | null = null;

function readTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return themeCache ?? 'system';
  }
}
export function getTheme(): ThemeChoice {
  return themeCache ?? readTheme();
}
/** The theme that is really shown: the system one unless the user forced light or dark. */
export function resolveTheme(choice: ThemeChoice = getTheme()): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
export function applyTheme(): void {
  const t = resolveTheme();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0b1110' : '#065F46');
}
export function setTheme(choice: ThemeChoice): void {
  themeCache = choice;
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage unavailable: the choice lives until the page is closed */
  }
  applyTheme();
  themeListeners.forEach((l) => l());
}
export function useTheme(): ThemeChoice {
  return useSyncExternalStore(
    (cb) => {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
    () => getTheme(),
  );
}

// ---- "Отпуск": the meal plan is built from holiday food (pizza, rolls, burgers, beer, wine...) while it is on
const VAC_KEY = 'fitapp.vacation';
const vacListeners = new Set<() => void>();
let vacCache: boolean | null = null;

function readVacation(): boolean {
  try {
    return window.localStorage.getItem(VAC_KEY) === '1';
  } catch {
    return vacCache ?? false;
  }
}
export function isVacationMode(): boolean {
  if (typeof window === 'undefined') return false;
  return vacCache ?? readVacation();
}
export function setVacationMode(on: boolean): void {
  vacCache = on;
  try {
    if (on) window.localStorage.setItem(VAC_KEY, '1');
    else window.localStorage.removeItem(VAC_KEY);
  } catch {
    /* storage unavailable: the mode lives until the page is closed */
  }
  vacListeners.forEach((l) => l());
}
export function useVacationMode(): boolean {
  return useSyncExternalStore(
    (cb) => {
      vacListeners.add(cb);
      return () => vacListeners.delete(cb);
    },
    () => isVacationMode(),
  );
}
