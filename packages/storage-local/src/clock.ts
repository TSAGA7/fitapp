import { toLocalDate, type Clock, type LocalDate } from '@fitapp/domain';

export function createSystemClock(): Clock {
  return {
    now: () => new Date().toISOString(),
    today: (timeZone: string): LocalDate => toLocalDate(new Date().toISOString(), timeZone),
  };
}

/** For tests: a clock that returns a fixed or manually advanced instant. */
export function createFixedClock(initial: string): Clock & { set(iso: string): void } {
  let current = initial;
  return {
    now: () => current,
    today: (timeZone) => toLocalDate(current, timeZone),
    set(iso) {
      current = iso;
    },
  };
}
