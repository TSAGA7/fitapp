import type { BodyArea } from '../../model';

/** After this many days without a finished workout the body is out of rhythm: the first sessions are better lighter. */
export const BREAK_DAYS = 14;
/** A pain report this recent that the program has not been rebuilt for yet still asks for a decision. */
export const PAIN_OFFER_DAYS = 14;

export type ReentryAdvice =
  | { kind: 'pain'; painId: string; area: BodyArea; exerciseId: string | null; daysAgo: number }
  | { kind: 'break'; lastDate: string; days: number };

const dayNo = (date: string): number => Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/**
 * Two moments when the program should be offered a change, never changed silently:
 * 1) a pain was reported after the current program version was made: rebuild it so the exercise is replaced;
 * 2) no finished workout for two weeks: start lighter.
 * Pain wins: it is the more important of the two.
 */
export function reentryAdvice(input: {
  today: string;
  lastCompletedDate: string | null;
  programCreatedAt: string | null;
  painEvents: readonly { id: string; occurredAt: string; area: BodyArea; exerciseId: string | null; deletedAt: string | null }[];
}): ReentryAdvice | null {
  if (input.programCreatedAt === null) return null;
  const pains = input.painEvents
    .filter((e) => e.deletedAt === null && e.occurredAt > (input.programCreatedAt as string) && dayNo(input.today) - dayNo(e.occurredAt) <= PAIN_OFFER_DAYS)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const p = pains[0];
  if (p) return { kind: 'pain', painId: p.id, area: p.area, exerciseId: p.exerciseId, daysAgo: Math.max(0, dayNo(input.today) - dayNo(p.occurredAt)) };
  if (input.lastCompletedDate !== null) {
    const days = dayNo(input.today) - dayNo(input.lastCompletedDate);
    if (days >= BREAK_DAYS) return { kind: 'break', lastDate: input.lastCompletedDate, days };
  }
  return null;
}
