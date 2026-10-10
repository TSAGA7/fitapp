import type { FocusArea, GoalType, MetricType, Weekday } from '@fitapp/domain';
import { getWeightUnit } from './prefs';

const NBSP = '\u00a0';
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const parts = (date: string): [number, number, number] => [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
export const formatDateShort = (date: string): string => {
  const [, m, d] = parts(date);
  return `${d}${NBSP}${MONTHS_SHORT[m - 1]}`;
};
export const formatDay = (date: string): string => {
  const [, m, d] = parts(date);
  return `${d}${NBSP}${MONTHS_GEN[m - 1]}`;
};
export const formatDateLong = (date: string): string => `${formatDay(date)}${NBSP}${date.slice(0, 4)}`;

/** Russian number format: decimal comma, no trailing zeros, non-breaking space between thousands. */
export function fmt(n: number, digits = 1): string {
  let s = n.toFixed(digits);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  const [int, frac] = s.split('.') as [string, string | undefined];
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return frac ? `${grouped},${frac}` : grouped;
}
export const signed = (n: number, digits = 1): string => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), digits);
const LB_PER_KG = 2.2046226218;
/** Weights are stored in kg. These convert to and from what the person chose to see. */
export const wUnit = (): string => (getWeightUnit() === 'lb' ? 'lb' : 'кг');
export const toUnit = (kgValue: number): number => (getWeightUnit() === 'lb' ? kgValue * LB_PER_KG : kgValue);
export const fromUnit = (value: number): number => (getWeightUnit() === 'lb' ? value / LB_PER_KG : value);
/** A number in the chosen unit, no label. */
export const wnum = (n: number, digits = 1): string => fmt(toUnit(n), getWeightUnit() === 'lb' ? Math.min(digits, 1) : digits);
export const kg = (n: number, digits = 1): string => `${wnum(n, digits)}${NBSP}${wUnit()}`;
/** A signed change in the chosen unit with the label. */
export const signedKg = (n: number, digits = 1): string => `${signed(toUnit(n), getWeightUnit() === 'lb' ? Math.min(digits, 1) : digits)}${NBSP}${wUnit()}`;
export const cm = (n: number): string => `${fmt(n, 1)}${NBSP}см`;
export const plural = (n: number, forms: readonly [string, string, string]): string => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  return a > 10 && a < 20 ? forms[2] : b > 1 && b < 5 ? forms[1] : b === 1 ? forms[0] : forms[2];
};

export const GOAL_LABELS: Record<GoalType, { title: string; text: string }> = {
  fat_loss: { title: 'Снижение жира', text: 'Уменьшить жировую массу, сохранив мышцы' },
  recomposition: { title: 'Рекомпозиция', text: 'Меньше жира и больше мышц одновременно' },
  muscle_gain: { title: 'Набор мышц', text: 'Нарастить мышечную массу' },
  muscle_retention: { title: 'Сохранение мышц', text: 'Держать форму и мышечную массу' },
  strength: { title: 'Сила', text: 'Стать сильнее в базовых движениях' },
  functional_fitness: { title: 'Функциональная форма', text: 'Выносливость, подвижность и сила' },
};
export const FOCUS_LABELS: Record<FocusArea, string> = {
  abdomen: 'Живот',
  lower_abdomen: 'Низ живота',
  shoulders: 'Плечи',
  back: 'Спина',
  chest: 'Грудь',
  legs: 'Ноги',
  arms: 'Руки',
  glutes: 'Ягодицы',
};
export const METRIC_LABELS: Record<MetricType, string> = {
  weight: 'Вес',
  body_fat: 'Жир',
  chest: 'Грудь',
  waist: 'Талия',
  hips: 'Бёдра',
  neck: 'Шея',
  shoulders: 'Плечи',
  biceps_left: 'Бицепс (лев.)',
  biceps_right: 'Бицепс (прав.)',
  thigh_left: 'Бедро (лев.)',
  thigh_right: 'Бедро (прав.)',
  calf_left: 'Икра (лев.)',
  calf_right: 'Икра (прав.)',
};
/** Measurements shown in the app, in display order (weight has its own screen). */
export const BODY_MEASUREMENTS: readonly MetricType[] = ['waist', 'chest', 'biceps_right', 'biceps_left', 'thigh_right', 'thigh_left', 'calf_right', 'calf_left', 'hips', 'neck', 'shoulders'];

export const WEEKDAY_SHORT: Record<Weekday, string> = { monday: 'Пн', tuesday: 'Вт', wednesday: 'Ср', thursday: 'Чт', friday: 'Пт', saturday: 'Сб', sunday: 'Вс' };
export const EXPERIENCE_LABELS = { beginner: 'Начинающий', intermediate: 'Средний', advanced: 'Опытный' } as const;
export const JOB_LABELS = { sedentary: 'Сидячая работа', light: 'Лёгкая активность', moderate: 'Умеренная активность', heavy: 'Физическая работа' } as const;
export const SEX_LABELS = { male: 'Мужчина', female: 'Женщина', unspecified: 'Не указывать' } as const;

export type Tone = 'good' | 'bad' | 'flat';
/** Only the colour of a change on screen: waist down is good; other measurements up is good for muscle goals. */
export function deltaTone(type: MetricType, delta: number | null, goal?: GoalType): Tone {
  if (delta === null || delta === 0) return 'flat';
  if (type === 'waist') return delta < 0 ? 'good' : 'bad';
  if (goal === 'muscle_gain' || goal === 'recomposition' || goal === 'strength') return delta > 0 ? 'good' : 'bad';
  return 'flat';
}

export const initials = (name: string | null | undefined): string => (name?.trim() ? (name.trim()[0] as string).toUpperCase() : 'F');

export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь',
  lats: 'Широчайшие',
  upper_back: 'Верх спины',
  lower_back: 'Поясница',
  front_delts: 'Передние дельты',
  side_delts: 'Средние дельты',
  rear_delts: 'Задние дельты',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  forearms: 'Предплечья',
  quads: 'Квадрицепс',
  hamstrings: 'Задняя поверхность бедра',
  glutes: 'Ягодицы',
  adductors: 'Приводящие',
  calves: 'Икры',
  abs: 'Пресс',
  obliques: 'Косые мышцы',
};
