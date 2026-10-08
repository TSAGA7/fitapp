import { addDays, diffDays, type LocalDate } from '../../util/localDate';
import { sameWeight } from '../common/grid';
import { unique } from '../common/stats';
import type { LayoffBand, ProgressionParams } from './params';
import { summarizeSession, type SessionSummary } from './session';
import type { NextPrescriptionInput } from './types';

export type ConfirmReason = 'axial_load' | 'after_layoff' | 'after_deload' | 'recent_pain' | 'severe_pain_cleared';

export interface PainState {
  /** Distinct dates with pain in the window (events + flagged sets + "discomfort" replacements). */
  dates: LocalDate[];
  count: number;
  latest: LocalDate | null;
  /** The latest pain happened in or after the last session. */
  unresolved: boolean;
  severeUnresolved: boolean;
  severeCleared: boolean;
  maxIntensity: number | null;
  /** 0 none, 1 first, 2 second, 3 third (stop), 4 severe (stop). */
  level: 0 | 1 | 2 | 3 | 4;
  /** The pain showed up in the first session after the weight was raised. */
  increasedBeforePain: boolean;
  revertWeightKg: number | null;
}

export interface SignalSet {
  forDate: LocalDate;
  last: SessionSummary | null;
  prev: SessionSummary[];
  daysSinceLast: number | null;
  gapBeforeLast: number | null;
  pain: PainState;
  layoffBand: LayoffBand | null;
  lowAdherence: boolean;
  lastWasDeload: boolean;
  sessionsSinceDeload: number | null;
  /** The previous session at the same weight (no longer than the gap limit ago). */
  sameWeightPrev: SessionSummary | null;
  repeated: { tooHeavy: boolean; sharpDrop: boolean; nearFailure: boolean; couldNot: boolean };
  streak: { good: number; required: number; reasons: ConfirmReason[] };
  returnTargetKg: number | null;
  stall: boolean;
  fatigue: boolean;
  nearFailure: boolean;
  bigStep: boolean;
  extension: { current: number; available: boolean };
  strictRir: boolean;
  maxStepsUp: number;
  baseWeightKg: number | null;
}

function evaluatePain(
  input: NextPrescriptionInput,
  last: SessionSummary | null,
  prev: SessionSummary[],
  params: ProgressionParams,
): PainState {
  const from = addDays(input.forDate, -params.painWindowDays);
  const events = input.painEvents.filter((e) => e.date >= from && e.date <= input.forDate).map((e) => ({ ...e }));
  if (last && (last.painFlagged || last.replaced?.reason === 'discomfort')) {
    events.push({ date: last.date, intensity: null });
  }
  const dates = unique(events.map((e) => e.date)).sort();
  const severeDates = unique(
    events.filter((e) => e.intensity !== null && e.intensity >= params.severePainIntensity).map((e) => e.date),
  ).sort();
  const intensities = events.map((e) => e.intensity).filter((x): x is number => x !== null);
  const latest = dates.length > 0 ? (dates[dates.length - 1] as string) : null;
  const unresolved = latest !== null && (last ? latest >= last.date : true);
  const severeUnresolved = severeDates.some((d) => (last ? d >= last.date : true));
  const severeCleared = severeDates.length > 0 && !severeUnresolved;
  let level: PainState['level'] = 0;
  if (severeUnresolved) level = 4;
  else if (unresolved) level = dates.length >= params.painStopCount ? 3 : dates.length === 2 ? 2 : 1;
  const prevWeight = prev[0]?.workingWeightKg ?? null;
  const lastWeight = last?.workingWeightKg ?? null;
  const increasedBeforePain =
    unresolved && prevWeight !== null && lastWeight !== null && lastWeight > prevWeight && last?.painFlagged === true;
  return {
    dates,
    count: dates.length,
    latest,
    unresolved,
    severeUnresolved,
    severeCleared,
    maxIntensity: intensities.length > 0 ? Math.max(...intensities) : null,
    level,
    increasedBeforePain,
    revertWeightKg: increasedBeforePain ? prevWeight : null,
  };
}

/** Step 1 of the pipeline: collects facts and signals. It decides nothing. */
export function evaluateSignals(input: NextPrescriptionInput, params: ProgressionParams): SignalSet {
  const strictRir = input.exercise.axialLoad >= 3;
  const summaries = input.history.slice(0, 4).map((s) => summarizeSession(s, strictRir, params));
  const last = summaries[0] ?? null;
  const prev = summaries.slice(1);
  const pain = evaluatePain(input, last, prev, params);

  const daysSinceLast = last ? diffDays(last.date, input.forDate) : null;
  const gapBeforeLast = last && prev[0] ? diffDays(prev[0].date, last.date) : null;
  const layoffBand =
    daysSinceLast === null
      ? null
      : (params.layoffBands.find((b) => daysSinceLast >= b.fromDays && daysSinceLast <= b.toDays) ?? null);
  const a = input.adherence14d;
  const lowAdherence =
    last !== null && a !== null && a.planned >= params.adherenceMinPlanned && a.done / a.planned < params.adherenceMinShare;

  const lastWasDeload = last?.kind === 'deload';
  const sessionsSinceDeload = input.lastDeload
    ? summaries.filter((s) => s.kind !== 'deload' && s.date > (input.lastDeload as { endedOn: LocalDate }).endedOn).length
    : null;

  const sameWeightPrev =
    last && prev[0] && sameWeight(prev[0].workingWeightKg, last.workingWeightKg) && (gapBeforeLast ?? 0) <= params.gapResetDays
      ? prev[0]
      : null;
  const repeated = {
    tooHeavy: sameWeightPrev?.belowRangeFirst === true,
    sharpDrop: sameWeightPrev?.drop.sharp === true,
    nearFailure: sameWeightPrev !== null && sameWeightPrev.medianRir === 0,
    couldNot: sameWeightPrev !== null && (sameWeightPrev.hasFailed || sameWeightPrev.skipReasons.includes('could_not')),
  };

  // Confirmation: how many consecutive ready sessions at this weight, and how many are required.
  const reasons: ConfirmReason[] = [];
  if (input.exercise.axialLoad >= params.confirmFromAxialLoad) reasons.push('axial_load');
  if (gapBeforeLast !== null && gapBeforeLast > params.gapResetDays) reasons.push('after_layoff');
  if (input.lastDeload && sessionsSinceDeload !== null && sessionsSinceDeload <= 2) reasons.push('after_deload');
  const refDate = prev[0]?.date ?? last?.date ?? null;
  if (refDate !== null && pain.dates.some((d) => d >= refDate) && last && !pain.unresolved) reasons.push('recent_pain');
  if (pain.severeCleared) reasons.push('severe_pain_cleared');
  let good = 0;
  if (last) {
    for (let i = 0; i < summaries.length; i++) {
      const s = summaries[i] as SessionSummary;
      if (!s.ready || !sameWeight(s.workingWeightKg, last.workingWeightKg)) break;
      if (i > 0 && diffDays(s.date, (summaries[i - 1] as SessionSummary).date) > params.gapResetDays) break;
      good++;
    }
  }
  const streak = { good, required: reasons.length > 0 ? params.confirmSessions : 1, reasons };

  // The most recent break inside the window: weight before it is the target of the "quick return".
  const lastWeight = last?.workingWeightKg ?? null;
  let returnTargetKg: number | null = null;
  for (let i = 0; i < summaries.length - 1; i++) {
    const after = summaries[i] as SessionSummary;
    const before = summaries[i + 1] as SessionSummary;
    if (diffDays(before.date, after.date) > params.gapResetDays) {
      const pre = before.workingWeightKg;
      if (pre !== null && lastWeight !== null && pre > lastWeight) returnTargetKg = pre;
      break;
    }
  }

  const three = summaries.slice(0, params.stallSessions);
  const stall =
    three.length === params.stallSessions &&
    three.every((s, i) => s.qualifying && sameWeight(s.workingWeightKg, three[0]?.workingWeightKg ?? null) && !s.topReached &&
      (i === 0 || diffDays(s.date, (three[i - 1] as SessionSummary).date) <= params.gapResetDays)) &&
    (three[0] as SessionSummary).totalReps <= (three[three.length - 1] as SessionSummary).totalReps;

  const fatigue = last !== null && (last.skipReasons.includes('fatigue') || (last.drop.sharp && repeated.sharpDrop));

  const step = input.plan.stepKg;
  const baseWeightKg = summaries.find((s) => s.workingWeightKg !== null)?.workingWeightKg ?? input.plan.startWeightKg;
  const bigStep = step <= 0 || (baseWeightKg !== null && baseWeightKg > 0 && step > params.bigStepFraction * baseWeightKg + 1e-9);
  const extCurrent = last ? Math.max(0, last.repMaxTarget - input.plan.repMax) : 0;

  return {
    forDate: input.forDate,
    last,
    prev,
    daysSinceLast,
    gapBeforeLast,
    pain,
    layoffBand,
    lowAdherence,
    lastWasDeload,
    sessionsSinceDeload,
    sameWeightPrev,
    repeated,
    streak,
    returnTargetKg,
    stall,
    fatigue,
    nearFailure: last !== null && last.medianRir === 0,
    bigStep,
    extension: { current: extCurrent, available: extCurrent < params.extendRepsMax },
    strictRir,
    maxStepsUp: input.exercise.axialLoad >= 3 ? 1 : params.confidentSteps,
    baseWeightKg,
  };
}
