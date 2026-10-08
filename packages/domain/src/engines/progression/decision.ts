import type { ProgressionParams } from './params';
import type { SignalSet } from './signals';
import type { Decision, NextPrescriptionInput, ReasonCode, Signal, Suggestion } from './types';

export type WeightMove =
  | { kind: 'none' }
  | { kind: 'up'; steps: number; capKg: number | null }
  | { kind: 'down'; steps: number; minFraction: number }
  | { kind: 'set'; weightKg: number; estimate: boolean }
  | { kind: 'choose' };

export interface DecisionOutcome {
  decision: Decision;
  reasonCode: ReasonCode;
  move: WeightMove;
  extendReps: boolean;
  restDeltaSec: number;
  /** Shift of the RIR target (+1 after a break). */
  rirShift: number;
  /** Calibration: RIR target one higher than usual, never below the floor. */
  calibrationRir: boolean;
  suggestions: Suggestion[];
  signals: Signal[];
}

/**
 * FIXED PRIORITY ORDER (the first matching tier decides; nothing below it is consulted):
 *  1 pain  >  2 break (layoff)  >  3 resume after deload  >  4 low adherence  >  5 replaced exercise
 *  >  6 no history (first run)  >  7 insufficient data  >  8 partial session  >  9 RIR missing
 *  >  10 calibration review  >  11 too heavy  >  12 near failure  >  13 sharp drop
 *  >  14 top of range reached  >  15 range done at RIR 4+  >  16 hold.
 */
export const PRIORITY_ORDER = [
  'pain',
  'layoff',
  'deload_resume',
  'low_adherence',
  'replaced',
  'no_history',
  'insufficient_data',
  'partial_session',
  'rir_missing',
  'calibration_review',
  'too_heavy',
  'near_failure',
  'sharp_drop',
  'top_reached',
  'easy_in_range',
  'hold',
] as const;

const base = (decision: Decision, reasonCode: ReasonCode, over: Partial<DecisionOutcome> = {}): DecisionOutcome => ({
  decision,
  reasonCode,
  move: { kind: 'none' },
  extendReps: false,
  restDeltaSec: 0,
  rirShift: 0,
  calibrationRir: false,
  suggestions: [],
  signals: [],
  ...over,
});

const replaceSuggestion = (): Suggestion => ({
  kind: 'replace_exercise',
  text: 'Подбери более контролируемую замену этому упражнению.',
});
const medicalSuggestion = (): Suggestion => ({
  kind: 'seek_medical_evaluation',
  text: 'Если боль повторяется, сохраняется или усиливается, обратись к врачу или физиотерапевту.',
});

export function determineDecision(sig: SignalSet, input: NextPrescriptionInput, params: ProgressionParams): DecisionOutcome {
  const { last, pain, extension } = sig;
  const plan = input.plan;

  // 1. PAIN
  if (pain.level === 4) {
    return base('stop', 'pain_severe', { suggestions: [medicalSuggestion(), replaceSuggestion()] });
  }
  if (pain.level === 3) {
    return base('stop', 'pain_repeated_stop', { suggestions: [medicalSuggestion(), replaceSuggestion()] });
  }
  if (last && pain.level === 2) {
    return base('decrease', 'pain_repeated', {
      move: { kind: 'down', steps: 1, minFraction: params.decreaseMinFraction },
      suggestions: [replaceSuggestion(), medicalSuggestion()],
    });
  }
  if (last && pain.level === 1) {
    if (pain.increasedBeforePain && pain.revertWeightKg !== null) {
      return base('decrease', 'pain_revert', { move: { kind: 'set', weightKg: pain.revertWeightKg, estimate: false }, suggestions: [replaceSuggestion()] });
    }
    return base('hold', 'pain_hold', { suggestions: [replaceSuggestion()] });
  }

  // 2. BREAK
  if (last && sig.layoffBand) {
    const band = sig.layoffBand;
    const steps = band.reduction.kind === 'steps' ? band.reduction.steps : 1;
    const fraction = band.reduction.kind === 'fraction' ? band.reduction.fraction : 0;
    const noLoad = plan.stepKg <= 0;
    const move: WeightMove = noLoad ? { kind: 'none' } : { kind: 'down', steps, minFraction: fraction };
    if (band.calibrate) {
      return base('calibrate', 'layoff_calibrate', { move, calibrationRir: true });
    }
    return base(noLoad ? 'hold' : 'decrease', band.reduction.kind === 'steps' ? 'layoff_one_step' : 'layoff_percent', {
      move,
      rirShift: 1,
    });
  }

  // 3. RESUME AFTER DELOAD
  if (last && sig.lastWasDeload) {
    const reference =
      input.lastDeload?.preDeloadWeightKg ?? sig.prev.find((s) => s.kind !== 'deload' && s.workingWeightKg !== null)?.workingWeightKg ?? plan.startWeightKg;
    if (reference === null || reference === undefined) {
      return base('resume', 'deload_resume', { move: { kind: 'choose' } });
    }
    const weight = input.lastDeload?.reason === 'stall' ? reference - plan.stepKg : reference;
    return base('resume', 'deload_resume', { move: { kind: 'set', weightKg: weight, estimate: false } });
  }

  // 4. LOW ADHERENCE
  if (sig.lowAdherence) {
    return base('hold', 'low_adherence_hold');
  }

  // 5. REPLACED EXERCISE (nothing was done on this key last time)
  if (last && last.replaced) {
    return base('no_change', 'replaced_in_last_session');
  }

  // 6. NO HISTORY (first run)
  if (!last) {
    if (plan.startWeightKg !== null) {
      return base('calibrate', 'first_execution', {
        move: { kind: 'set', weightKg: plan.startWeightKg, estimate: true },
        calibrationRir: true,
      });
    }
    return base('calibrate', 'first_execution_choose_weight', {
      move: { kind: 'choose' },
      calibrationRir: true,
      suggestions: [{ kind: 'choose_weight', text: 'Подбери вес так, чтобы в первом подходе запас был около 3 повторений.' }],
    });
  }

  // 7. INSUFFICIENT DATA
  if (last.doneCount < params.minWorkingSets) {
    return base('no_change', 'insufficient_data');
  }

  // 8. PARTIAL SESSION
  if (!last.complete) {
    if (last.hasFailed || last.skipReasons.includes('could_not')) {
      if (sig.repeated.couldNot) {
        return base('decrease', 'partial_repeated_failure', { move: { kind: 'down', steps: 1, minFraction: params.decreaseMinFraction } });
      }
      return base('hold', 'partial_could_not');
    }
    if (last.skipReasons.includes('fatigue')) return base('hold', 'partial_fatigue');
    return base('no_change', 'partial_no_time');
  }

  // 9. RIR MISSING
  if (!last.rirKnown) {
    return base('hold', 'rir_missing');
  }

  // 10. CALIBRATION REVIEW
  if (last.kind === 'calibration') {
    const deficit = Math.max(0, last.repRangeMin - (last.firstReps ?? last.repRangeMin));
    const nearFail = last.medianRir === 0;
    if (nearFail || deficit >= 3) {
      const steps = deficit >= 5 || (nearFail && deficit >= 3) ? 2 : 1;
      return base('decrease', 'calibration_decrease', { move: { kind: 'down', steps, minFraction: 0 } });
    }
    if (deficit >= 1) return base('hold', 'calibration_hold');
    if (last.topReached && last.allRir4) return base('increase', 'calibration_increase', { move: { kind: 'up', steps: Math.min(2, sig.maxStepsUp), capKg: null } });
    if (last.topReached && (last.medianRir ?? 0) >= 3) return base('increase', 'calibration_increase', { move: { kind: 'up', steps: 1, capKg: null } });
    if (last.allRir4) return base('increase', 'calibration_increase', { move: { kind: 'up', steps: 1, capKg: null } });
    return base('hold', 'calibration_hold');
  }

  // 11. TOO HEAVY
  if (last.belowRangeFirst) {
    if (sig.sameWeightPrev && !sig.repeated.tooHeavy) {
      return base('hold', 'too_heavy_bad_day', { restDeltaSec: params.tooHeavyRestDeltaSec });
    }
    return base('decrease', 'too_heavy_decrease', { move: { kind: 'down', steps: 1, minFraction: params.decreaseMinFraction } });
  }

  // 12. NEAR FAILURE
  if (sig.nearFailure) {
    if (sig.repeated.nearFailure) {
      return base('decrease', 'near_failure_decrease', { move: { kind: 'down', steps: 1, minFraction: params.decreaseMinFraction } });
    }
    return base('hold', 'near_failure_hold');
  }

  // 13. SHARP DROP
  if (last.drop.sharp) {
    if (sig.repeated.sharpDrop) {
      return base('decrease', 'sharp_drop_repeated', { move: { kind: 'down', steps: 1, minFraction: params.decreaseMinFraction } });
    }
    return base('hold', 'sharp_drop_hold', { restDeltaSec: params.sharpDropRestDeltaSec });
  }

  // 14. TOP OF RANGE REACHED / 15. RANGE DONE AT RIR 4+
  const increaseGate = (kind: 'top' | 'easy'): DecisionOutcome | null => {
    const pendingCode: ReasonCode = kind === 'top' ? 'top_reached_confirm_pending' : 'easy_confirm_pending';
    if (kind === 'top' && !last.rirOk) return base('hold', 'top_reached_rir_low');
    if (plan.stepKg <= 0 || sig.bigStep) {
      if (extension.available) {
        return base('extend_reps', 'top_reached_extend', { extendReps: true });
      }
      if (plan.stepKg <= 0) {
        return base('hold', 'top_reached_no_load_progress', {
          suggestions: [{ kind: 'add_load', text: 'Замедли темп или добавь небольшое утяжеление.' }],
        });
      }
    }
    if (sig.streak.good < sig.streak.required) return base('hold', pendingCode);
    return null;
  };

  if (last.topReached) {
    const gated = increaseGate('top');
    if (gated) return gated;
    const returning = sig.returnTargetKg !== null && last.workingWeightKg !== null && last.workingWeightKg < sig.returnTargetKg;
    const strong = last.allRir4 && sig.maxStepsUp >= 2;
    const steps = returning ? sig.maxStepsUp : strong ? sig.maxStepsUp : 1;
    return base('increase', strong ? 'top_reached_increase_strong' : 'top_reached_increase', {
      move: { kind: 'up', steps, capKg: returning ? sig.returnTargetKg : null },
    });
  }
  if (last.allInRange && last.allRir4) {
    const gated = increaseGate('easy');
    if (gated) return gated;
    const returning = sig.returnTargetKg !== null && last.workingWeightKg !== null && last.workingWeightKg < sig.returnTargetKg;
    return base('increase', 'easy_increase', {
      move: { kind: 'up', steps: returning ? sig.maxStepsUp : 1, capKg: returning ? sig.returnTargetKg : null },
    });
  }

  // 16. HOLD
  return base('hold', last.allInRange ? 'hold_build_reps' : 'hold_below_range');
}
