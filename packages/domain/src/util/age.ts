import { isLocalDate, type LocalDate } from './localDate';

/** Full years between a birth date and a day (the birthday itself counts). */
export function ageYears(birthDate: LocalDate, today: LocalDate): number {
  if (!isLocalDate(birthDate) || !isLocalDate(today)) throw new RangeError('Invalid LocalDate');
  const by = Number(birthDate.slice(0, 4));
  const ty = Number(today.slice(0, 4));
  const beforeBirthday = today.slice(5) < birthDate.slice(5);
  return ty - by - (beforeBirthday ? 1 : 0);
}
