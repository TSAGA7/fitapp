export type RestTrend = 'up' | 'flat' | 'down';

export interface RestInput {
  /** Rest from the program, seconds. */
  baseSec: number;
  isCompound: boolean;
  /** Time-based and light bodyweight work needs less rest. */
  light: boolean;
  setNo: number;
  /** The set that was just finished. */
  reps: number;
  rir: number | null;
  repMin: number;
  targetRir: { min: number; max: number };
  /** Days since this exercise was last done, null = never. */
  daysSinceLast: number | null;
  /** Recent dynamics of the exercise: results growing, flat or falling. */
  trend: RestTrend | null;
  painFlag?: boolean;
}

export interface RestSuggestion {
  seconds: number;
  reason: string;
}

const MIN_SEC = 30;
const MAX_SEC = 300;
const round5 = (n: number): number => Math.round(n / 5) * 5;

/**
 * Suggests the rest after a set. It starts from the program's rest and adapts to the person:
 * - a hard set (failure / below the rep range) → longer, an easy one (more reps in reserve than planned) → shorter;
 * - good dynamics → can rest a bit less, falling results → a bit more;
 * - a long break or the first time → longer: work capacity and technique are lower;
 * - heavy compound lifts and later sets need more rest; light, timed and bodyweight work less.
 * Longer rests (2–3 min) help strength and muscle growth in heavy compound lifts; for isolation 60–90 s are enough.
 * A hint, not a rule: the user can always set the time by hand.
 */
export function suggestRestSeconds(i: RestInput): RestSuggestion {
  let sec = i.light ? Math.min(i.baseSec, 60) : i.baseSec;
  const why: string[] = [];
  const hard = i.rir !== null && i.rir <= 0;
  const belowRange = i.reps < i.repMin;
  if (hard || belowRange) {
    sec *= 1.25;
    why.push('подход был на пределе');
  } else if (i.rir !== null && i.rir > i.targetRir.max + 1) {
    sec *= 0.8;
    why.push('подход дался легко');
  }
  if (i.trend === 'up' && !hard) {
    sec *= 0.9;
    why.push('результаты растут');
  } else if (i.trend === 'down') {
    sec *= 1.1;
    why.push('результаты просели');
  }
  if (i.daysSinceLast === null) {
    sec *= 1.15;
    why.push('первое выполнение');
  } else if (i.daysSinceLast >= 42) {
    sec *= 1.3;
    why.push('долгий перерыв');
  } else if (i.daysSinceLast >= 21) {
    sec *= 1.15;
    why.push('перерыв больше 3 недель');
  }
  if (i.isCompound && !i.light && i.setNo >= 3) sec *= 1.1;
  if (i.painFlag) {
    sec *= 1.2;
    why.push('была боль');
  }
  const lo = i.light ? MIN_SEC : i.isCompound ? 60 : MIN_SEC;
  const seconds = Math.min(MAX_SEC, Math.max(lo, round5(sec)));
  return { seconds, reason: why.length ? why.join(', ') : 'по программе' };
}

/** Phrases of the rest timer. The text is chosen by the remaining seconds. */
export const REST_PHRASES = [
  'Газ!',
  'Ехала!',
  'Метро Люблино, работаем!',
  'Нравится, не нравится — терпи, моя красавица!',
  'ИИИХАА!',
  'Ни шагу вперёд — только назад!',
  'Приступай давай!',
  'Особо тоже не засиживайся!',
  'Работаем, братья!',
  'Один подход тебе или два другому?',
  'Достал гантель — жми!',
] as const;

export const REST_FINISH_MESSAGE = 'Ты просто босс! Ты просто начальник!';

/** What to show for the remaining seconds: null = just the countdown. `random` is injected for tests. */
export function restCue(remainingSec: number, random: () => number = Math.random): string | null {
  if (remainingSec <= 1) return REST_PHRASES[Math.floor(random() * REST_PHRASES.length) % REST_PHRASES.length] as string;
  if (remainingSec <= 5) return 'Сделай глубокий вдох и выдох';
  if (remainingSec <= 7) return 'Настраивайся на следующий подход';
  return null;
}
