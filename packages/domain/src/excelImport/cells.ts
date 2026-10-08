import { addDays, isLocalDate, type LocalDate } from '../util/localDate';
import type { RawCell } from './types';

/** Lower case, "ё" -> "е", punctuation removed, spaces collapsed. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Same, but the text in brackets (a note such as "(тренажер)") is dropped first. */
export function normalizeWithoutBrackets(s: string): string {
  return normalizeText(s.replace(/\([^)]*\)/g, ' '));
}

export function cellText(c: RawCell): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return dateFromJs(c) ?? '';
  return String(c).trim();
}

export const isEmptyCell = (c: RawCell): boolean => cellText(c) === '';

function dateFromJs(d: Date): LocalDate | null {
  if (Number.isNaN(d.getTime())) return null;
  // Excel dates have no time zone: the library returns them at UTC midnight.
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Accepts a date cell, an Excel serial number, "2026-07-23", "23.07.2026", "23/07/26". */
export function parseExcelDate(c: RawCell): Parsed<LocalDate> {
  if (c === null || c === undefined || c === '') return { ok: false, error: 'Не указана дата' };
  let result: LocalDate | null = null;
  if (c instanceof Date) {
    result = dateFromJs(c);
  } else if (typeof c === 'number') {
    if (c > 20000 && c < 80000) result = addDays('1970-01-01', Math.floor(c) - 25569);
  } else if (typeof c === 'string') {
    const s = c.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
    if (m) result = `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})$/.exec(s);
    if (m) {
      const year = (m[3] as string).length === 2 ? `20${m[3]}` : (m[3] as string);
      result = `${year}-${(m[2] as string).padStart(2, '0')}-${(m[1] as string).padStart(2, '0')}`;
    }
  }
  if (result !== null && isLocalDate(result) && result >= '2000-01-01' && result <= '2100-12-31') return { ok: true, value: result };
  return { ok: false, error: `Не удалось прочитать дату «${cellText(c)}»` };
}

/** Number with a decimal comma or unit suffix ("82,5 кг") -> number; empty -> null. */
export function parseNumber(c: RawCell): Parsed<number | null> {
  if (c === null || c === undefined) return { ok: true, value: null };
  if (typeof c === 'number') return Number.isFinite(c) ? { ok: true, value: c } : { ok: false, error: 'не число' };
  if (c instanceof Date || typeof c === 'boolean') return { ok: false, error: 'не число' };
  const s = c
    .trim()
    .toLowerCase()
    .replace(/\s*(кг|kg|ккал|kcal|мл|ml|л|l|г|g)\.?$/u, '')
    .replace(',', '.');
  if (s === '') return { ok: true, value: null };
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'не число' };
  return { ok: true, value: Number(s) };
}

export function parseInteger(c: RawCell): Parsed<number | null> {
  const n = parseNumber(c);
  if (!n.ok || n.value === null) return n;
  return Number.isInteger(n.value) ? n : { ok: false, error: 'не целое число' };
}

/** RIR: empty -> null (never invented); 0-4 or "4+" -> number. */
export function parseRir(c: RawCell): Parsed<number | null> {
  if (c === null || c === undefined) return { ok: true, value: null };
  if (typeof c === 'string') {
    const s = c.trim();
    if (s === '') return { ok: true, value: null };
    if (s === '4+') return { ok: true, value: 4 };
  }
  const n = parseInteger(c);
  if (!n.ok) return { ok: false, error: `RIR «${cellText(c)}» не распознан` };
  if (n.value === null) return n;
  return n.value >= 0 && n.value <= 4 ? n : { ok: false, error: `RIR «${n.value}» вне диапазона 0–4` };
}

/** FNV-1a, 8 hex characters: a stable short id for generated keys. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
