import { determineDecision, type DecisionOutcome } from './decision';
import { DEFAULT_PROGRESSION_PARAMS, type ProgressionParams } from './params';
import { buildReason } from './reason';
import { evaluateSignals, type SignalSet } from './signals';
import type { NextPrescription, NextPrescriptionInput, RirTarget, Signal, Suggestion } from './types';
import { calculateNextWeight } from './weight';

function rirTargetFor(base: RirTarget, outcome: DecisionOutcome, params: ProgressionParams): RirTarget {
  if (outcome.calibrationRir) {
    const min = Math.min(4, Math.max(params.calibrationRirFloor, base.min + params.calibrationRirBump));
    const max = Math.min(4, Math.max(min, base.max + params.calibrationRirBump));
    return { min, max };
  }
  if (outcome.rirShift !== 0) {
    return { min: Math.min(4, base.min + outcome.rirShift), max: Math.min(4, base.max + outcome.rirShift) };
  }
  return { ...base };
}

function collectSignals(sig: SignalSet, outcome: DecisionOutcome): Signal[] {
  const out: Signal[] = [];
  const add = (s: Signal) => {
    if (!out.some((x) => x.code === s.code)) out.push(s);
  };
  const p = sig.pain;
  if (p.level === 4) add({ code: 'pain_severe', severity: 'critical', text: 'Сильная боль (7/10 и выше).' });
  else if (p.level >= 1) {
    add({ code: 'pain', severity: p.level >= 3 ? 'critical' : 'warning', text: `Боль в этом упражнении: событий за 28 дней — ${p.count}.` });
  } else if (p.severeCleared) {
    add({ code: 'pain', severity: 'warning', text: 'Недавно была сильная боль; повышение только после двух хороших сессий.' });
  }
  if (sig.layoffBand && sig.last) add({ code: 'layoff', severity: 'info', text: `Перерыв ${sig.daysSinceLast} дн.` });
  if (sig.lowAdherence) add({ code: 'low_adherence', severity: 'info', text: 'Выполнено меньше половины запланированных тренировок за 14 дней.' });
  if (sig.fatigue) add({ code: 'fatigue', severity: 'warning', text: 'Признаки усталости.' });
  if (sig.stall) add({ code: 'stall', severity: 'warning', text: 'Застой: несколько сессий на одном весе без роста.' });
  if (sig.nearFailure) add({ code: 'near_failure', severity: 'info', text: 'Подходы до отказа (RIR 0).' });
  if (sig.last?.drop.sharp) add({ code: 'sharp_drop', severity: 'info', text: 'Резкое падение повторов между подходами.' });
  if (sig.last && !sig.last.rirKnown && sig.last.doneCount > 0) add({ code: 'rir_missing', severity: 'warning', text: 'Не указан RIR.' });
  if (sig.last?.replaced) add({ code: 'replaced', severity: 'info', text: 'Упражнение было заменено в прошлой сессии.' });
  if (sig.streak.reasons.includes('after_deload')) add({ code: 'after_deload', severity: 'info', text: 'Первые сессии после deload.' });
  if (outcome.reasonCode.endsWith('confirm_pending')) {
    add({ code: 'confirm_pending', severity: 'info', text: `Хороших сессий подряд: ${sig.streak.good} из ${sig.streak.required}.` });
  }
  if (outcome.decision === 'calibrate' || sig.last?.kind === 'calibration') {
    add({ code: 'calibration', severity: 'info', text: 'Калибровочная сессия.' });
  }
  return out;
}

function collectSuggestions(sig: SignalSet, outcome: DecisionOutcome): Suggestion[] {
  const out: Suggestion[] = [...outcome.suggestions];
  const add = (s: Suggestion) => {
    if (!out.some((x) => x.kind === s.kind)) out.push(s);
  };
  if (sig.stall) {
    add({ kind: 'add_rest', text: 'Добавь 30–60 с отдыха между подходами.' });
    add({ kind: 'reduce_weight', text: 'Снизь вес на 1 шаг и построй повторения заново.' });
    add({ kind: 'change_rep_range', text: 'Смени диапазон повторений (например, 8–10 на 10–12).' });
    add({ kind: 'replace_exercise', text: 'Или замени упражнение на близкий вариант.' });
  }
  if (sig.fatigue) add({ kind: 'consider_deload', text: 'При усталости в нескольких упражнениях стоит рассмотреть deload.' });
  return out;
}

/**
 * The deterministic pipeline:
 *   evaluateSignals -> determineDecision (fixed priority) -> calculateNextWeight -> buildReason
 * Pure: same input, same output; the input is not modified.
 */
export function nextPrescription(
  input: NextPrescriptionInput,
  params: ProgressionParams = DEFAULT_PROGRESSION_PARAMS,
): NextPrescription {
  const sig = evaluateSignals(input, params);
  const outcome = determineDecision(sig, input, params);
  const weight = calculateNextWeight(outcome, sig, input, params);
  const reasonText = buildReason(outcome, sig, weight, input, params);

  const keepExtension = (outcome.decision === 'hold' || outcome.decision === 'no_change') && sig.extension.current > 0;
  const repMax = outcome.extendReps
    ? input.plan.repMax + params.extendRepsMax
    : keepExtension
      ? input.plan.repMax + sig.extension.current
      : input.plan.repMax;

  const last = sig.last;
  return {
    decision: outcome.decision,
    reasonCode: outcome.reasonCode,
    reasonText,
    weightKg: weight.weightKg,
    weightIsEstimate: weight.weightIsEstimate,
    deltaKg: weight.deltaKg,
    repTarget: { min: input.plan.repMin, max: repMax },
    rirTarget: rirTargetFor(input.plan.rirTarget, outcome, params),
    sets: input.plan.sets,
    restSec: Math.min(600, input.plan.restSec + outcome.restDeltaSec),
    signals: collectSignals(sig, outcome),
    suggestions: collectSuggestions(sig, outcome),
    trace: {
      workingWeightKg: last?.workingWeightKg ?? null,
      repsText: last ? last.reps.join('/') : null,
      rirText: last && last.rirKnown ? last.rirs.join('/') : null,
      daysSinceLast: sig.daysSinceLast,
      painLevel: sig.pain.level,
      goodStreak: sig.streak.good,
      requiredStreak: sig.streak.required,
      confirmReasons: [...sig.streak.reasons],
      stepKg: input.plan.stepKg,
    },
  };
}
