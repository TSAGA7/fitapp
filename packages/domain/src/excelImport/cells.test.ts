import { describe, expect, it } from 'vitest';
import { normalizeText, normalizeWithoutBrackets, parseExcelDate, parseInteger, parseNumber, parseRir, shortHash } from './cells';

describe('normalizeText', () => {
  it('ignores case, ё, punctuation and extra spaces', () => {
    expect(normalizeText('  Жим  ЛЁЖА,  в тренажёре! ')).toBe('жим лежа в тренажере');
    expect(normalizeText('Жим гантелей на скамье 30°')).toBe('жим гантелей на скамье 30');
    expect(normalizeWithoutBrackets('Баттерфляй (тренажер)')).toBe('баттерфляй');
  });
});

describe('parseExcelDate', () => {
  const ok = (v: unknown) => {
    const r = parseExcelDate(v as never);
    return r.ok ? r.value : `ERR:${r.error}`;
  };
  it('reads Excel dates (UTC midnight), ISO strings, dd.mm.yyyy, dd/mm/yy and serial numbers', () => {
    expect(ok(new Date(Date.UTC(2026, 6, 23)))).toBe('2026-07-23');
    expect(ok('2026-07-23')).toBe('2026-07-23');
    expect(ok('2026-07-23T10:00:00')).toBe('2026-07-23');
    expect(ok('23.07.2026')).toBe('2026-07-23');
    expect(ok('3.7.2026')).toBe('2026-07-03');
    expect(ok('23/07/26')).toBe('2026-07-23');
    expect(ok(46226)).toBe('2026-07-23');
  });
  it('rejects empty, impossible and out-of-range dates', () => {
    expect(ok(null)).toContain('Не указана дата');
    expect(ok('31.02.2026')).toContain('Не удалось прочитать дату');
    expect(ok('вчера')).toContain('Не удалось прочитать дату');
    expect(ok('01.01.1999')).toContain('Не удалось прочитать дату');
    expect(ok(12)).toContain('Не удалось прочитать дату');
    expect(ok(new Date(Number.NaN))).toContain('Не удалось прочитать дату');
  });
});

describe('numbers', () => {
  it('parses decimal commas, units and empties', () => {
    expect(parseNumber('82,5 кг')).toEqual({ ok: true, value: 82.5 });
    expect(parseNumber('2.8 л')).toEqual({ ok: true, value: 2.8 });
    expect(parseNumber(40)).toEqual({ ok: true, value: 40 });
    expect(parseNumber('')).toEqual({ ok: true, value: null });
    expect(parseNumber(null)).toEqual({ ok: true, value: null });
    expect(parseNumber('abc').ok).toBe(false);
    expect(parseNumber(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(parseNumber(true as never).ok).toBe(false);
  });
  it('integers', () => {
    expect(parseInteger('12')).toEqual({ ok: true, value: 12 });
    expect(parseInteger(3.5).ok).toBe(false);
  });
  it('RIR: empty stays empty (never invented), 4+ is 4, out of range is an error', () => {
    expect(parseRir(null)).toEqual({ ok: true, value: null });
    expect(parseRir('')).toEqual({ ok: true, value: null });
    expect(parseRir(2)).toEqual({ ok: true, value: 2 });
    expect(parseRir('4+')).toEqual({ ok: true, value: 4 });
    expect(parseRir(5).ok).toBe(false);
    expect(parseRir(-1).ok).toBe(false);
    expect(parseRir('1-2').ok).toBe(false);
    expect(parseRir(1.5).ok).toBe(false);
  });
  it('shortHash is stable', () => {
    expect(shortHash('жим')).toBe(shortHash('жим'));
    expect(shortHash('жим')).not.toBe(shortHash('тяга'));
    expect(shortHash('x')).toHaveLength(8);
  });
});
