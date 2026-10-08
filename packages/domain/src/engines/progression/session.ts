import type { SkipReason } from '../../model';
import type { LocalDate } from '../../util/localDate';
import { median, round6, sum, unique } from '../common/stats';
import type { ProgressionParams } from './params';
import type { SessionKind, SessionResult, SetResult } from './types';

export interface SessionSummary {
  date: LocalDate;
  kind: SessionKind;
  plannedSets: number;
  /** Heaviest weight on which at least half of the planned sets were done. */
  workingWeightKg: number | null;
  doneSets: SetResult[];
  doneCount: number;
  reps: number[];
  rirs: number[];
  rirKnown: boolean;
  firstReps: number | null;
  lastReps: number | null;
  totalReps: number;
  medianRir: number | null;
  minRir: number | null;
  allRir4: boolean;
  complete: boolean;
  hasFailed: boolean;
  skipReasons: SkipReason[];
  painFlagged: boolean;
  replaced: SessionResult['replaced'];
  topReached: boolean;
  allInRange: boolean;
  belowRangeFirst: boolean;
  drop: { abs: number; fraction: number; sharp: boolean };
  rirOk: boolean;
  /** A counted session: every planned set done, no pain, normal kind, no replacement. */
  qualifying: boolean;
  /** Counted and ready for a weight increase (top reached on target RIR, or range done at RIR 4+). */
  ready: boolean;
  repRangeMin: number;
  repMaxTarget: number;
}

const w = (s: SetResult): number => s.weightKg ?? 0;

export function summarizeSession(session: SessionResult, strictRir: boolean, params: ProgressionParams): SessionSummary {
  const doneAll = session.sets.filter((s) => s.status === 'done' && s.reps !== null && s.reps >= 1);
  const groups = new Map<number, SetResult[]>();
  for (const s of doneAll) {
    const key = round6(w(s));
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  const need = Math.max(1, Math.ceil(session.plannedSets / 2));
  let workingWeight: number | null = null;
  const enough = [...groups.entries()].filter(([, g]) => g.length >= need).map(([k]) => k);
  if (enough.length > 0) {
    workingWeight = Math.max(...enough);
  } else if (groups.size > 0) {
    workingWeight = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0]?.[0] ?? null;
  }
  const doneSets = (workingWeight === null ? [] : (groups.get(workingWeight) ?? [])).slice().sort((a, b) => a.setNo - b.setNo);
  const reps = doneSets.map((s) => s.reps as number);
  const rirKnown = doneSets.length > 0 && doneSets.every((s) => s.rir !== null);
  const rirs = rirKnown ? doneSets.map((s) => s.rir as number) : [];
  const hasFailed = session.sets.some((s) => s.status === 'failed');
  const skipReasons = unique(
    session.sets.filter((s) => s.status !== 'done').map((s) => s.skipReason ?? (s.status === 'failed' ? 'could_not' : 'other')),
  ) as SkipReason[];
  const complete = doneSets.length >= session.plannedSets && !hasFailed;
  const first = reps.length > 0 ? (reps[0] as number) : null;
  const last = reps.length > 0 ? (reps[reps.length - 1] as number) : null;
  const abs = first !== null && last !== null && reps.length >= 2 ? first - last : 0;
  const fraction = first !== null && first > 0 ? abs / first : 0;
  const sharp = reps.length >= 2 && fraction >= params.sharpDropFraction - 1e-9 && abs >= params.sharpDropMinReps;
  const medianRir = rirKnown ? median(rirs) : null;
  const minRir = rirKnown ? Math.min(...rirs) : null;
  const target = session.rirTarget;
  const rirOk =
    rirKnown &&
    (medianRir as number) >= target.min &&
    (minRir as number) >= (strictRir ? target.min : Math.max(0, target.min - 1));
  const topReached = complete && reps.length > 0 && reps.every((r) => r >= session.repMaxTarget);
  const allInRange = reps.length > 0 && reps.every((r) => r >= session.repRange.min);
  const allRir4 = rirKnown && rirs.every((r) => r >= 4);
  const qualifying = complete && !session.sets.some((s) => s.painFlag) && session.kind === 'normal' && session.replaced === null;
  const ready = qualifying && !sharp && ((topReached && rirOk) || (allInRange && allRir4));
  return {
    date: session.date,
    kind: session.kind,
    plannedSets: session.plannedSets,
    workingWeightKg: workingWeight,
    doneSets,
    doneCount: doneSets.length,
    reps,
    rirs,
    rirKnown,
    firstReps: first,
    lastReps: last,
    totalReps: sum(reps),
    medianRir,
    minRir,
    allRir4,
    complete,
    hasFailed,
    skipReasons,
    painFlagged: session.sets.some((s) => s.painFlag),
    replaced: session.replaced,
    topReached,
    allInRange,
    belowRangeFirst: first !== null && first < session.repRange.min,
    drop: { abs, fraction, sharp },
    rirOk,
    qualifying,
    ready,
    repRangeMin: session.repRange.min,
    repMaxTarget: session.repMaxTarget,
  };
}
