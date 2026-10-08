import { round6 } from '../common/stats';
import type { DecisionOutcome } from './decision';
import type { ProgressionParams } from './params';
import type { SignalSet } from './signals';
import type { WeightResult } from './weight';
import type { NextPrescriptionInput } from './types';

const n = (x: number): string => String(round6(x)).replace('.', ',');
const kg = (x: number | null): string => (x === null ? '—' : `${n(x)} кг`);
const stepsWord = (k: number): string => (k === 1 ? '1 шаг' : k >= 2 && k <= 4 ? `${k} шага` : `${k} шагов`);

/** Step 4 of the pipeline: the explanation shown to the user, with the numbers behind the decision. */
export function buildReason(
  outcome: DecisionOutcome,
  sig: SignalSet,
  weight: WeightResult,
  input: NextPrescriptionInput,
  params: ProgressionParams,
): string {
  const last = sig.last;
  const plan = input.plan;
  const reps = last ? last.reps.join('/') : '';
  const rirs = last && last.rirKnown ? last.rirs.join('/') : '—';
  const zone = `${plan.rirTarget.min}–${plan.rirTarget.max}`;
  const w = weight.weightKg;
  const moved = weight.deltaKg === null ? 0 : Math.abs(weight.deltaKg);
  const days = sig.daysSinceLast ?? 0;
  const current = sig.baseWeightKg;
  const sets = last ? `${last.doneCount} из ${last.plannedSets}` : '';
  const painCount = sig.pain.count;

  switch (outcome.reasonCode) {
    case 'pain_severe':
      return `Боль ${sig.pain.maxIntensity ?? '≥7'}/10 — приоритетный сигнал: упражнение лучше остановить, не экспериментировать с весом (остаётся ${kg(current)}) и обратиться за медицинской оценкой к врачу или физиотерапевту. Это не диагноз.`;
    case 'pain_repeated_stop':
      return `Боль в этом упражнении уже ${painCount} раза за ${params.painWindowDays} дней: упражнение лучше остановить, подобрать безопасную замену и обратиться к врачу или физиотерапевту. Вес остаётся ${kg(current)}.`;
    case 'pain_repeated':
      return `Вторая боль в этом упражнении за ${params.painWindowDays} дней: вес −${kg(moved)} (${kg(w)}) и стоит заменить упражнение на более контролируемый вариант.`;
    case 'pain_revert':
      return `Боль появилась в первой сессии после повышения веса: возвращаемся на ${kg(w)}.`;
    case 'pain_hold':
      return `В прошлый раз была боль или дискомфорт: вес не повышаем (${kg(current)}). Следи за техникой, при необходимости выбери безопасную замену.`;
    case 'layoff_one_step':
      return `Перерыв ${days} дн.: возвращаемся осторожно, вес −${stepsWord(1)} (${kg(w)}), RIR на 1 выше. Повышать вес — после двух хороших сессий подряд.`;
    case 'layoff_percent': {
      const fraction = sig.layoffBand?.reduction.kind === 'fraction' ? sig.layoffBand.reduction.fraction : 0;
      return `Перерыв ${days} дн.: снижаем вес на ${Math.round(fraction * 100)}% → ${kg(w)}, RIR на 1 выше. Повышать вес — после двух хороших сессий подряд, к прежнему весу возвращаемся по 1–2 шага.`;
    }
    case 'layoff_calibrate':
      return `Перерыв ${days} дн. (больше 60): вес −15% (${kg(w)}) и калибровочная сессия — RIR на 1 выше обычного, затем подстроим вес.`;
    case 'deload_resume':
      return w === null
        ? 'После deload вес прежней нагрузки неизвестен: подбери его в первом подходе.'
        : `После deload возвращаемся на ${kg(w)}${input.lastDeload?.reason === 'stall' ? ' (на 1 шаг ниже веса, на котором был застой)' : ''}. Повышение — после двух хороших сессий подряд.`;
    case 'low_adherence_hold':
      return `За последние 14 дней выполнено ${input.adherence14d?.done ?? 0} из ${input.adherence14d?.planned ?? 0} запланированных тренировок: в эту сессию вес не меняем (${kg(current)}).`;
    case 'replaced_in_last_session':
      return `В прошлый раз упражнение было заменено, подходов по нему нет: история этого варианта не меняется, вес остаётся ${kg(current)}.`;
    case 'first_execution':
      return `Первое выполнение: калибровка. Стартовый вес ${kg(w)} — это оценка; RIR на 1 выше обычного. После сессии вес подстроим по факту.`;
    case 'first_execution_choose_weight':
      return 'Первое выполнение без истории и без стартового веса: подбери вес так, чтобы в первом подходе запас был около 3 повторений. Его рабочий вес мы возьмём из этой сессии.';
    case 'insufficient_data':
      return `Выполнено меньше ${params.minWorkingSets} рабочих подходов (${last?.doneCount ?? 0}): данных недостаточно, ничего не меняем (${kg(current)}).`;
    case 'partial_no_time':
      return `Выполнено ${sets} подходов (не хватило времени): сессия не подтверждает повышение, но и не считается неудачей. Вес без изменений: ${kg(current)}.`;
    case 'partial_fatigue':
      return `Выполнено ${sets} подходов, причина — усталость: вес не повышаем (${kg(current)}), сигнал усталости записан.`;
    case 'partial_could_not':
      return `Выполнено ${sets} подходов, часть не удалась: вес остаётся ${kg(current)}. Если повторится, снизим на 1 шаг.`;
    case 'partial_repeated_failure':
      return `Подходы не удались и в прошлой сессии на этом весе: вес −${kg(moved)} (${kg(w)}).`;
    case 'calibration_decrease':
      return `Калибровка: ${reps} при RIR ${rirs} — вес слишком велик, снижаем на ${stepsWord(Math.max(1, Math.round(moved / Math.max(plan.stepKg, 1e-9))))} → ${kg(w)}.`;
    case 'calibration_hold':
      return `Калибровка: ${reps} при RIR ${rirs} — вес подходит (недобор небольшой или запас умеренный). Берём ${kg(current)} как рабочий.`;
    case 'calibration_increase':
      return `Калибровка: ${reps} при RIR ${rirs} — запас больше нужного, вес ${kg(current)} → ${kg(w)}.`;
    case 'rir_missing':
      return `В прошлой сессии не указан RIR: без него нельзя оценить запас, вес без изменений (${kg(current)}).`;
    case 'too_heavy_bad_day':
      return `Первый подход ниже диапазона (${last?.firstReps} < ${plan.repMin}), но прошлая сессия на этом весе была нормальной: вероятно, плохой день. Вес остаётся ${kg(current)}, отдых +${params.tooHeavyRestDeltaSec} с.`;
    case 'too_heavy_decrease':
      return `Первый подход ниже диапазона (${last?.firstReps} < ${plan.repMin}), серия ${reps} при RIR ${rirs}: вес слишком велик, снижаем на ${stepsWord(1)} (−${kg(moved)}) → ${kg(w)}.`;
    case 'near_failure_hold':
      return `Серия ${reps} при RIR ${rirs}: подходы до отказа, цель RIR ${zone}. Вес не меняем (${kg(current)}), останавливайся раньше. Если повторится, снизим на 1 шаг.`;
    case 'near_failure_decrease':
      return `Две сессии подряд на этом весе до отказа (RIR ${rirs}, цель ${zone}): снижаем вес на ${kg(moved)} → ${kg(w)}.`;
    case 'sharp_drop_hold':
      return `Повторы упали с ${last?.firstReps} до ${last?.lastReps} (−${Math.round((last?.drop.fraction ?? 0) * 100)}%) при RIR ${rirs}: вероятно, запас оценён завышенно или мало отдыха. Вес остаётся ${kg(current)}, отдых +${params.sharpDropRestDeltaSec} с.`;
    case 'sharp_drop_repeated':
      return `Резкое падение повторов (${reps}) и в прошлой сессии на этом весе: снижаем вес на ${kg(moved)} → ${kg(w)}.`;
    case 'top_reached_increase':
      return `Верх диапазона (${last?.repMaxTarget}) достигнут во всех ${last?.doneCount} подходах (${reps}) при RIR ${rirs} (цель ${zone}), заметного падения нет → +${kg(moved)}: ${kg(current)} → ${kg(w)}. Следующая сессия начинается с нижней границы диапазона.`;
    case 'top_reached_increase_strong':
      return `Верх диапазона достигнут (${reps}) при RIR 4+ во всех подходах: вес явно занижен → +${kg(moved)} (${stepsWord(Math.max(1, Math.round(moved / Math.max(plan.stepKg, 1e-9))))}): ${kg(current)} → ${kg(w)}.`;
    case 'top_reached_rir_low':
      return `Верх диапазона достигнут (${reps}), но RIR ${rirs} ниже цели ${zone}: вес не повышаем (${kg(current)}).`;
    case 'top_reached_confirm_pending': {
      const why = sig.streak.reasons.length > 0 ? ' (' + sig.streak.reasons.map(confirmText).join(', ') + ')' : '';
      return `Хорошая сессия (${reps} при RIR ${rirs}), но здесь повышение подтверждается двумя хорошими сессиями подряд${why}. Вес остаётся ${kg(current)}.`;
    }
    case 'top_reached_extend': {
      const pct = current && current > 0 ? Math.round((plan.stepKg / current) * 100) : null;
      return plan.stepKg <= 0
        ? `Верх диапазона достигнут (${reps}); вес для этого упражнения не меняется, поэтому добавляем повторения: цель ${plan.repMin}–${plan.repMax + params.extendRepsMax}.`
        : `Верх диапазона достигнут (${reps}), но шаг ${kg(plan.stepKg)} — это ${pct}% веса (больше ${Math.round(params.bigStepFraction * 100)}%): сначала добавляем повторения, цель ${plan.repMin}–${plan.repMax + params.extendRepsMax} при весе ${kg(current)}.`;
    }
    case 'top_reached_no_load_progress':
      return `Верх расширенного диапазона достигнут (${reps}); вес для этого упражнения не меняется. Усложни: медленнее темп или лёгкое утяжеление.`;
    case 'easy_increase':
      return `Диапазон выполнен (${reps}) при RIR 4+ во всех подходах: вес занижен → +${kg(moved)}: ${kg(current)} → ${kg(w)}.`;
    case 'easy_confirm_pending':
      return `Диапазон выполнен при RIR 4+ (${reps}), но повышение подтверждается двумя хорошими сессиями подряд. Вес остаётся ${kg(current)}.`;
    case 'hold_build_reps':
      return `Верх диапазона (${last?.repMaxTarget}) пока не достигнут во всех подходах (${reps}, RIR ${rirs}): держим вес ${kg(current)} и добираем повторения.`;
    case 'hold_below_range':
      return `Часть подходов ниже диапазона (${reps}, нижняя граница ${plan.repMin}): держим вес ${kg(current)} и добираем повторения.`;
  }
}

function confirmText(r: SignalSet['streak']['reasons'][number]): string {
  switch (r) {
    case 'axial_load':
      return 'осевая нагрузка';
    case 'after_layoff':
      return 'после перерыва';
    case 'after_deload':
      return 'после deload';
    case 'recent_pain':
      return 'недавняя боль';
    case 'severe_pain_cleared':
      return 'после сильной боли';
  }
}
