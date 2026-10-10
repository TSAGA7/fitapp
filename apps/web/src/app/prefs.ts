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

// ---- home equipment: what the person has at home (used by the "Дом" workout)
const HOME_KEY = 'fitapp.homeEquipment';
const homeListeners = new Set<() => void>();
let homeCache: string[] | null = null;
function readHome(): string[] {
  try {
    const raw = window.localStorage.getItem(HOME_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return homeCache ?? [];
  }
}
export function setHomeEquipment(keys: string[]): void {
  homeCache = keys;
  try {
    window.localStorage.setItem(HOME_KEY, JSON.stringify(keys));
  } catch {
    /* storage unavailable: the choice lives until the page is closed */
  }
  homeListeners.forEach((l) => l());
}
export function getHomeEquipment(): string[] {
  return homeCache ?? readHome();
}
export function useHomeEquipment(): string[] {
  const raw = useSyncExternalStore(
    (cb) => {
      homeListeners.add(cb);
      return () => homeListeners.delete(cb);
    },
    () => (homeCache ? JSON.stringify(homeCache) : (() => { try { return window.localStorage.getItem(HOME_KEY) ?? '[]'; } catch { return '[]'; } })()),
  );
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

// ---- weight unit: everything is stored in kg; only the display and the typed numbers use pounds
export type WeightUnit = 'kg' | 'lb';
const UNIT_KEY = 'fitapp.weightUnit';
const unitListeners = new Set<() => void>();
let unitCache: WeightUnit | null = null;
function readUnit(): WeightUnit {
  try {
    return window.localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg';
  } catch {
    return unitCache ?? 'kg';
  }
}
export function getWeightUnit(): WeightUnit {
  return unitCache ?? readUnit();
}
export function setWeightUnit(u: WeightUnit): void {
  unitCache = u;
  try {
    window.localStorage.setItem(UNIT_KEY, u);
  } catch {
    /* storage unavailable: lives until the page is closed */
  }
  unitListeners.forEach((l) => l());
}
export function useWeightUnit(): WeightUnit {
  return useSyncExternalStore(
    (cb) => {
      unitListeners.add(cb);
      return () => unitListeners.delete(cb);
    },
    getWeightUnit,
  );
}

// ---- rest timer: the countdown between sets can be switched off
const TIMER_KEY = 'fitapp.restTimer';
const timerListeners = new Set<() => void>();
let timerCache: boolean | null = null;
function readTimer(): boolean {
  try {
    return window.localStorage.getItem(TIMER_KEY) !== 'off';
  } catch {
    return timerCache ?? true;
  }
}
export function getRestTimer(): boolean {
  return timerCache ?? readTimer();
}
export function setRestTimer(on: boolean): void {
  timerCache = on;
  try {
    window.localStorage.setItem(TIMER_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable: lives until the page is closed */
  }
  timerListeners.forEach((l) => l());
}
export function useRestTimer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      timerListeners.add(cb);
      return () => timerListeners.delete(cb);
    },
    getRestTimer,
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

/** Beer drunk per day in holiday mode (millilitres). Phone-only, like the mode itself. */
const BEER_KEY = 'fitapp.beer';
const beerListeners = new Set<() => void>();
let beerCache: Record<string, number> | null = null;

function readBeer(): Record<string, number> {
  if (beerCache) return beerCache;
  try {
    const raw = window.localStorage.getItem(BEER_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    beerCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    beerCache = {};
  }
  return beerCache;
}
export type Drink = 'beer' | 'wine' | 'sparkling';
const drinkKey = (date: string, drink: Drink) => (drink === 'beer' ? date : `${date}|${drink}`);
export function getBeerMl(date: string, drink: Drink = 'beer'): number {
  const v = readBeer()[drinkKey(date, drink)];
  return typeof v === 'number' && v > 0 ? v : 0;
}
export function setBeerMl(date: string, ml: number, drink: Drink = 'beer'): void {
  const next = { ...readBeer() };
  const k = drinkKey(date, drink);
  if (ml > 0) next[k] = Math.round(ml);
  else delete next[k];
  beerCache = next;
  try {
    window.localStorage.setItem(BEER_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the number lives until the page is closed */
  }
  beerListeners.forEach((l) => l());
}
export function useBeerMl(date: string, drink: Drink = 'beer'): number {
  return useSyncExternalStore(
    (cb) => {
      beerListeners.add(cb);
      return () => beerListeners.delete(cb);
    },
    () => getBeerMl(date, drink),
  );
}

const DRINK_KEY = 'fitapp.drink';
const drinkListeners = new Set<() => void>();
let drinkCache: Drink | null = null;
export function getDrink(): Drink {
  if (drinkCache) return drinkCache;
  try {
    const v = window.localStorage.getItem(DRINK_KEY);
    drinkCache = v === 'wine' || v === 'sparkling' ? v : 'beer';
  } catch {
    drinkCache = 'beer';
  }
  return drinkCache;
}
export function setDrink(d: Drink): void {
  drinkCache = d;
  try {
    window.localStorage.setItem(DRINK_KEY, d);
  } catch {
    /* storage unavailable */
  }
  drinkListeners.forEach((l) => l());
}
export function useDrink(): Drink {
  return useSyncExternalStore(
    (cb) => {
      drinkListeners.add(cb);
      return () => drinkListeners.delete(cb);
    },
    () => getDrink(),
  );
}

/** True while the daily norm (kcal / macros) was typed by the user (for example dictated by a coach): auto-adjustments leave it alone. */
const MANUAL_KEY = 'fitapp.manualTargets';
const manualListeners = new Set<() => void>();
let manualCache: boolean | null = null;
export function isManualTargets(): boolean {
  if (typeof window === 'undefined') return false;
  if (manualCache !== null) return manualCache;
  try {
    manualCache = window.localStorage.getItem(MANUAL_KEY) === '1';
  } catch {
    manualCache = false;
  }
  return manualCache;
}
export function setManualTargets(on: boolean): void {
  manualCache = on;
  try {
    if (on) window.localStorage.setItem(MANUAL_KEY, '1');
    else window.localStorage.removeItem(MANUAL_KEY);
  } catch {
    /* storage unavailable: lives until the page is closed */
  }
  manualListeners.forEach((l) => l());
}
export function useManualTargets(): boolean {
  return useSyncExternalStore(
    (cb) => {
      manualListeners.add(cb);
      return () => manualListeners.delete(cb);
    },
    () => isManualTargets(),
  );
}

/** The live activity bar of a workout (time, tonnage, kcal range). The summary after the workout is shown either way. */
const BAR_KEY = 'fitapp.activityBar';
const barListeners = new Set<() => void>();
let barCache: boolean | null = null;
export function isActivityBarOn(): boolean {
  if (typeof window === 'undefined') return true;
  if (barCache !== null) return barCache;
  try {
    barCache = window.localStorage.getItem(BAR_KEY) !== '0';
  } catch {
    barCache = true;
  }
  return barCache;
}
export function setActivityBar(on: boolean): void {
  barCache = on;
  try {
    if (on) window.localStorage.removeItem(BAR_KEY);
    else window.localStorage.setItem(BAR_KEY, '0');
  } catch {
    /* storage unavailable: lives until the page is closed */
  }
  barListeners.forEach((l) => l());
}
export function useActivityBar(): boolean {
  return useSyncExternalStore(
    (cb) => {
      barListeners.add(cb);
      return () => barListeners.delete(cb);
    },
    () => isActivityBarOn(),
  );
}
