import { describe, expect, it } from 'vitest';
import { addDays } from '../../util/localDate';
import { progressionKey } from '../../util/progressionKey';
import { nextPrescription } from './nextPrescription';
import { D0, D1, D2, FOR, input, plan, session, skipped } from './testkit';

describe('main scenarios 1-10 (plan 8-10, RIR 2-3, 40 kg, step 2.5, 3 sets)', () => {
  it('1. 10/10/10 at RIR 2 -> increase by one step', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [2, 2, 2])]));
    expect(r.decision).toBe('increase');
    expect(r.reasonCode).toBe('top_reached_increase');
    expect(r.weightKg).toBe(42.5);
    expect(r.deltaKg).toBe(2.5);
    expect(r.repTarget).toEqual({ min: 8, max: 10 });
    expect(r.rirTarget).toEqual({ min: 2, max: 3 });
    expect(r.reasonText).toContain('10/10/10');
    expect(r.reasonText).toContain('42,5');
  });

  it('2. 10/10/10 at RIR 4+ in every set -> confident increase (2 steps)', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [4, 4, 4])]));
    expect(r.decision).toBe('increase');
    expect(r.reasonCode).toBe('top_reached_increase_strong');
    expect(r.weightKg).toBe(45);
    expect(r.reasonText).toContain('RIR 4+');
  });

  it('2b. RIR 4+ in a single set is only information, not a strong signal', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [4, 3, 2])]));
    expect(r.reasonCode).toBe('top_reached_increase');
    expect(r.weightKg).toBe(42.5);
  });

  it('3a. 6/6/5 at RIR 0, no earlier session at this weight -> decrease', () => {
    const r = nextPrescription(input([session(D0, [6, 6, 5], [0, 0, 0])]));
    expect(r.decision).toBe('decrease');
    expect(r.reasonCode).toBe('too_heavy_decrease');
    expect(r.weightKg).toBe(37.5);
  });

  it('3b. same result, but the previous session at 40 was normal -> hold and rest +30 s', () => {
    const r = nextPrescription(input([session(D0, [6, 6, 5], [0, 0, 0]), session(D1, [9, 8, 8], [2, 2, 2])]));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('too_heavy_bad_day');
    expect(r.weightKg).toBe(40);
    expect(r.restSec).toBe(150);
  });

  it('3c. the previous session at 40 was also too heavy -> decrease', () => {
    const r = nextPrescription(input([session(D0, [6, 6, 5], [0, 0, 0]), session(D1, [6, 5, 5], [0, 0, 0])]));
    expect(r.decision).toBe('decrease');
    expect(r.weightKg).toBe(37.5);
  });

  it('4. 8/8/8 at RIR 2 -> hold and build reps', () => {
    const r = nextPrescription(input([session(D0, [8, 8, 8], [2, 2, 2])]));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('hold_build_reps');
    expect(r.weightKg).toBe(40);
  });

  it('5. 10/9/8 at RIR 2/1/1 -> hold (a 20% drop is normal, top of range is not reached)', () => {
    const r = nextPrescription(input([session(D0, [10, 9, 8], [2, 1, 1])]));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('hold_build_reps');
    expect(r.weightKg).toBe(40);
  });

  it('6. 10/8/6 at equal RIR -> a sharp drop: hold, rest +45 s; repeated -> decrease', () => {
    const first = nextPrescription(input([session(D0, [10, 8, 6], [2, 2, 2])]));
    expect(first.decision).toBe('hold');
    expect(first.reasonCode).toBe('sharp_drop_hold');
    expect(first.restSec).toBe(165);
    expect(first.signals.map((s) => s.code)).toContain('sharp_drop');
    const again = nextPrescription(input([session(D0, [10, 8, 6], [2, 2, 2]), session(D1, [10, 8, 6], [2, 2, 2])]));
    expect(again.decision).toBe('decrease');
    expect(again.reasonCode).toBe('sharp_drop_repeated');
    expect(again.weightKg).toBe(37.5);
  });

  it('6b. a drop of exactly 30% and 3 reps counts as sharp; 6->4 (2 reps) does not', () => {
    expect(nextPrescription(input([session(D0, [10, 8, 7], [2, 2, 2])])).reasonCode).toBe('sharp_drop_hold');
    const small = nextPrescription(input([session(D0, [8, 8, 8], [2, 2, 2], { repMin: 4, repMax: 8 })], { plan: plan({ repMin: 4, repMax: 8 }) }));
    expect(small.reasonCode).not.toBe('sharp_drop_hold');
  });

  it('7a. a set skipped for lack of time -> no change, not a failure', () => {
    const s = session(D0, [10, 10], [2, 2], { extra: [skipped(3, 'no_time')] });
    const r = nextPrescription(input([s]));
    expect(r.decision).toBe('no_change');
    expect(r.reasonCode).toBe('partial_no_time');
    expect(r.weightKg).toBe(40);
  });

  it('7b. a set skipped because of fatigue -> hold with a fatigue signal', () => {
    const s = session(D0, [10, 10], [2, 2], { extra: [skipped(3, 'fatigue')] });
    const r = nextPrescription(input([s]));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('partial_fatigue');
    expect(r.signals.map((x) => x.code)).toContain('fatigue');
  });

  it('7c. a set not completed ("could not") -> hold; repeated -> decrease', () => {
    const mk = (d: string) => session(d, [10, 10], [2, 2], { extra: [skipped(3, 'could_not')] });
    const once = nextPrescription(input([mk(D0)]));
    expect(once.decision).toBe('hold');
    expect(once.reasonCode).toBe('partial_could_not');
    const twice = nextPrescription(input([mk(D0), mk(D1)]));
    expect(twice.decision).toBe('decrease');
    expect(twice.reasonCode).toBe('partial_repeated_failure');
    expect(twice.weightKg).toBe(37.5);
    const failed = session(D0, [10, 10], [2, 2], { extra: [{ ...skipped(3, null), status: 'failed' }] });
    expect(nextPrescription(input([failed])).reasonCode).toBe('partial_could_not');
  });

  it('7d. a partial session never counts as a basis for a weight increase, even with top reps', () => {
    const s = session(D0, [10, 10], [4, 4], { extra: [skipped(3, 'no_time')] });
    const r = nextPrescription(input([s]));
    expect(r.decision).not.toBe('increase');
    expect(r.weightKg).toBe(40);
  });

  it('8. one set marked as pain -> no automatic increase, a pain signal is created', () => {
    const s = session(D0, [10, 10, 6], [2, 2, 0], { pain: [3] });
    const r = nextPrescription(input([s]));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('pain_hold');
    expect(r.weightKg).toBe(40);
    expect(r.signals.map((x) => x.code)).toContain('pain');
    expect(r.suggestions.map((x) => x.kind)).toContain('replace_exercise');
    expect(r.trace.painLevel).toBe(1);
  });

  it('8b. the second pain in 28 days -> -1 step and a replacement suggestion', () => {
    const s = session(D0, [10, 10, 6], [2, 2, 0], { pain: [3] });
    const r = nextPrescription(input([s], { painEvents: [{ date: '2026-09-20', intensity: 4 }] }));
    expect(r.decision).toBe('decrease');
    expect(r.reasonCode).toBe('pain_repeated');
    expect(r.weightKg).toBe(37.5);
    expect(r.suggestions.map((x) => x.kind)).toEqual(expect.arrayContaining(['replace_exercise', 'seek_medical_evaluation']));
  });

  it('8c. the third pain in 28 days -> stop and advise medical evaluation (no diagnosis)', () => {
    const s = session(D0, [10, 10, 6], [2, 2, 0], { pain: [3] });
    const r = nextPrescription(input([s], { painEvents: [{ date: '2026-09-20', intensity: 4 }, { date: '2026-09-25', intensity: 3 }] }));
    expect(r.decision).toBe('stop');
    expect(r.reasonCode).toBe('pain_repeated_stop');
    expect(r.suggestions.map((x) => x.kind)).toContain('seek_medical_evaluation');
    expect(r.reasonText).toContain('врачу');
  });

  it('8d. pain of 7/10 or more stops at once, even for the very first pain event', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [2, 2, 2])], { painEvents: [{ date: D0, intensity: 7 }] }));
    expect(r.decision).toBe('stop');
    expect(r.reasonCode).toBe('pain_severe');
    expect(r.weightKg).toBe(40);
    expect(r.signals.map((x) => x.code)).toContain('pain_severe');
    expect(r.reasonText).toContain('7/10');
    const six = nextPrescription(input([session(D0, [10, 10, 10], [2, 2, 2])], { painEvents: [{ date: D0, intensity: 6 }] }));
    expect(six.decision).toBe('hold');
  });

  it('8e. pain in the first session after a weight increase -> return to the previous weight', () => {
    const r = nextPrescription(input([session(D0, [9, 8, 7], [2, 1, 0], { weight: 42.5, pain: [2] }), session(D1, [10, 10, 10], [2, 2, 2])]));
    expect(r.decision).toBe('decrease');
    expect(r.reasonCode).toBe('pain_revert');
    expect(r.weightKg).toBe(40);
  });

  it('8f. a severe pain followed by a pain-free session does not stop forever, but needs two good sessions', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [2, 2, 2])], { painEvents: [{ date: '2026-10-01', intensity: 8 }] }));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('top_reached_confirm_pending');
    expect(r.trace.confirmReasons).toContain('severe_pain_cleared');
  });

  it('9. an exercise replaced during the session -> history is not mixed (separate progressionKey)', () => {
    const replaced = session(D0, [], [], { replaced: { reason: 'machine_busy' } });
    const r = nextPrescription(input([replaced]));
    expect(r.decision).toBe('no_change');
    expect(r.reasonCode).toBe('replaced_in_last_session');
    expect(r.weightKg).toBe(40);
    const a = progressionKey({ exerciseId: 'db_incline_press_30', repMin: 8, repMax: 10 });
    const b = progressionKey({ exerciseId: 'chest_press_machine_seated', repMin: 8, repMax: 10 });
    expect(a).not.toBe(b);
    const fresh = nextPrescription(input([], { plan: plan({ startWeightKg: 30 }) }));
    expect(fresh.reasonCode).toBe('first_execution');
    expect(fresh.weightKg).toBe(30);
  });

  it('9b. a replacement because of discomfort is a pain signal level 1: no increase next time', () => {
    const replaced = session(D0, [], [], { replaced: { reason: 'discomfort' } });
    const r = nextPrescription(input([replaced, session(D1, [10, 10, 10], [2, 2, 2])]));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('pain_hold');
    expect(r.weightKg).toBe(40);
  });

  it('10. 8/8/8 at RIR 0 (in range, but to failure) -> hold; repeated -> decrease', () => {
    const once = nextPrescription(input([session(D0, [8, 8, 8], [0, 0, 0])]));
    expect(once.decision).toBe('hold');
    expect(once.reasonCode).toBe('near_failure_hold');
    const twice = nextPrescription(input([session(D0, [8, 8, 8], [0, 0, 0]), session(D1, [8, 8, 8], [0, 0, 0])]));
    expect(twice.decision).toBe('decrease');
    expect(twice.reasonCode).toBe('near_failure_decrease');
    expect(twice.weightKg).toBe(37.5);
  });

  it('top of range reached but RIR below target -> do not increase', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [0, 0, 0])]));
    expect(r.decision).not.toBe('increase');
  });

  it('range done at RIR 4+ in every set, top not reached -> +1 step', () => {
    const r = nextPrescription(input([session(D0, [9, 9, 9], [4, 4, 4])]));
    expect(r.decision).toBe('increase');
    expect(r.reasonCode).toBe('easy_increase');
    expect(r.weightKg).toBe(42.5);
  });

  it('works from the whole series, not only the last set (10/10/10 where only the last is hard)', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [3, 2, 1])]));
    expect(r.reasonCode).toBe('top_reached_increase');
  });
});

describe('first run, no history, calibration', () => {
  it('first execution with a start weight: calibration, estimated weight, RIR 3-4', () => {
    const r = nextPrescription(input([]));
    expect(r.decision).toBe('calibrate');
    expect(r.reasonCode).toBe('first_execution');
    expect(r.weightKg).toBe(40);
    expect(r.weightIsEstimate).toBe(true);
    expect(r.rirTarget).toEqual({ min: 3, max: 4 });
    expect(r.signals.map((s) => s.code)).toContain('calibration');
  });

  it('no start weight: the user chooses the weight', () => {
    const r = nextPrescription(input([], { plan: plan({ startWeightKg: null }) }));
    expect(r.decision).toBe('calibrate');
    expect(r.reasonCode).toBe('first_execution_choose_weight');
    expect(r.weightKg).toBeNull();
    expect(r.suggestions.map((s) => s.kind)).toContain('choose_weight');
  });

  const calib = (reps: number[], rirs: number[], weight = 30) =>
    nextPrescription(
      input([session(D0, reps, rirs, { kind: 'calibration', weight, rirTarget: { min: 3, max: 4 } })], { plan: plan({ startWeightKg: null }) }),
    );

  it('after a calibration session the working weight is taken from that session', () => {
    expect(calib([10, 10, 10], [3, 3, 3]).weightKg).toBe(32.5);
    // 2 steps = 5 kg is 16.7% of 30 kg, above the 15% cap, so only one step is taken
    expect(calib([10, 10, 10], [4, 4, 4]).weightKg).toBe(32.5);
    expect(calib([10, 10, 10], [4, 4, 4], 40).weightKg).toBe(45);
    expect(calib([9, 9, 9], [3, 3, 3]).weightKg).toBe(30);
    expect(calib([9, 9, 9], [4, 4, 4]).weightKg).toBe(32.5);
  });

  it('calibration: small shortfall holds, 3+ reps short decreases, RIR 0 decreases', () => {
    expect(calib([6, 6, 6], [3, 3, 3]).decision).toBe('hold');
    expect(calib([5, 5, 5], [3, 3, 3]).weightKg).toBe(27.5);
    expect(calib([3, 3, 3], [3, 3, 3]).weightKg).toBe(25);
    expect(calib([8, 8, 8], [0, 0, 0]).weightKg).toBe(27.5);
  });
});

describe('break (layoff) bands, relative to the date of the upcoming session', () => {
  const good = session(D0, [10, 10, 10], [2, 2, 2]);
  const after = (days: number) => nextPrescription(input([good], { forDate: addDays(D0, days) }));

  it('14 days: no reduction, normal flow', () => {
    expect(after(14).reasonCode).toBe('top_reached_increase');
  });
  it('15 days: -1 step and RIR +1', () => {
    const r = after(15);
    expect(r.decision).toBe('decrease');
    expect(r.reasonCode).toBe('layoff_one_step');
    expect(r.weightKg).toBe(37.5);
    expect(r.rirTarget).toEqual({ min: 3, max: 4 });
    expect(r.signals.map((s) => s.code)).toContain('layoff');
  });
  it('21 days still -1 step; 22 days -5%', () => {
    expect(after(21).reasonCode).toBe('layoff_one_step');
    const r = after(22);
    expect(r.reasonCode).toBe('layoff_percent');
    expect(r.weightKg).toBe(37.5);
  });
  it('36 days: -10% rounded to the grid (35 kg)', () => {
    expect(after(35).weightKg).toBe(37.5);
    const r = after(36);
    expect(r.reasonCode).toBe('layoff_percent');
    expect(r.weightKg).toBe(35);
  });
  it('61+ days: -15% and a calibration session', () => {
    expect(after(60).weightKg).toBe(35);
    const r = after(61);
    expect(r.decision).toBe('calibrate');
    expect(r.reasonCode).toBe('layoff_calibrate');
    expect(r.weightKg).toBe(32.5);
    expect(r.rirTarget).toEqual({ min: 3, max: 4 });
  });
  it('the first session after a break needs two good sessions to increase; the quick return then goes 1-2 steps', () => {
    const afterBreak = session(D1, [10, 10, 10], [2, 2, 2], { weight: 35 });
    const before = session('2026-08-20', [10, 10, 10], [2, 2, 2], { weight: 40 });
    const first = nextPrescription(input([afterBreak, before], { forDate: D0 }));
    expect(first.reasonCode).toBe('top_reached_confirm_pending');
    expect(first.trace.confirmReasons).toContain('after_layoff');
    expect(first.weightKg).toBe(35);
    const second = nextPrescription(input([session(D0, [10, 10, 10], [2, 2, 2], { weight: 35 }), afterBreak, before], { forDate: FOR }));
    expect(second.decision).toBe('increase');
    expect(second.weightKg).toBe(40);
  });
  it('the quick return never exceeds the weight from before the break', () => {
    const afterBreak = session(D1, [10, 10, 10], [2, 2, 2], { weight: 37.5 });
    const before = session('2026-08-20', [10, 10, 10], [2, 2, 2], { weight: 40 });
    const r = nextPrescription(input([session(D0, [10, 10, 10], [2, 2, 2], { weight: 37.5 }), afterBreak, before]));
    expect(r.weightKg).toBe(40);
  });
});

describe('low adherence (last 14 days)', () => {
  const good = session(D0, [10, 10, 10], [2, 2, 2]);
  it('less than half of the planned workouts: no increase this time', () => {
    const r = nextPrescription(input([good], { adherence14d: { planned: 4, done: 1 } }));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('low_adherence_hold');
    expect(r.weightKg).toBe(40);
    expect(r.signals.map((s) => s.code)).toContain('low_adherence');
  });
  it('exactly half, too few planned workouts, or unknown adherence: ignored', () => {
    expect(nextPrescription(input([good], { adherence14d: { planned: 4, done: 2 } })).decision).toBe('increase');
    expect(nextPrescription(input([good], { adherence14d: { planned: 1, done: 0 } })).decision).toBe('increase');
    expect(nextPrescription(input([good], { adherence14d: null })).decision).toBe('increase');
  });
});

describe('axialLoad and confirmation', () => {
  const axial = (n: 0 | 1 | 2 | 3) => ({ exercise: { axialLoad: n } });
  const good = (d: string, rir = 2) => session(d, [10, 10, 10], [rir, rir, rir]);

  it('axialLoad 1: one good session is enough', () => {
    expect(nextPrescription(input([good(D0)], axial(1))).decision).toBe('increase');
  });
  it('axialLoad 2: the first good session holds, the second consecutive one confirms', () => {
    const first = nextPrescription(input([good(D0)], axial(2)));
    expect(first.decision).toBe('hold');
    expect(first.reasonCode).toBe('top_reached_confirm_pending');
    expect(first.trace.goodStreak).toBe(1);
    expect(first.trace.requiredStreak).toBe(2);
    expect(first.signals.map((s) => s.code)).toContain('confirm_pending');
    const second = nextPrescription(input([good(D0), good(D1)], axial(2)));
    expect(second.decision).toBe('increase');
    expect(second.weightKg).toBe(42.5);
  });
  it('confirmation resets after pain, a long gap, a different weight or a sharp drop in between', () => {
    const pain = session(D1, [10, 10, 10], [2, 2, 2], { pain: [3] });
    expect(nextPrescription(input([good(D0), pain], axial(2))).reasonCode).toBe('top_reached_confirm_pending');
    expect(nextPrescription(input([good(D0), good('2026-09-10')], axial(2))).reasonCode).toBe('top_reached_confirm_pending');
    const lighter = session(D1, [10, 10, 10], [2, 2, 2], { weight: 37.5 });
    expect(nextPrescription(input([good(D0), lighter], axial(2))).reasonCode).toBe('top_reached_confirm_pending');
    const sharp = session(D1, [15, 10, 10], [2, 2, 2]);
    expect(nextPrescription(input([good(D0), sharp], axial(2))).reasonCode).toBe('top_reached_confirm_pending');
  });
  it('axialLoad 3: confirmation plus careful progression (never 2 steps, strict RIR)', () => {
    const strong = nextPrescription(input([good(D0, 4), good(D1, 4)], axial(3)));
    expect(strong.decision).toBe('increase');
    expect(strong.weightKg).toBe(42.5);
    expect(strong.reasonCode).toBe('top_reached_increase');
    const edge = session(D0, [10, 10, 10], [2, 2, 1]);
    expect(nextPrescription(input([edge], axial(0))).decision).toBe('increase');
    expect(nextPrescription(input([edge, edge], axial(3))).reasonCode).toBe('top_reached_rir_low');
  });
  it('axialLoad does not forbid the exercise: it only slows the progression', () => {
    const r = nextPrescription(input([session(D0, [8, 8, 8], [2, 2, 2])], axial(3)));
    expect(r.decision).toBe('hold');
    expect(r.decision).not.toBe('stop');
  });
});

describe('deload', () => {
  it('the first session after a deload returns to the weight from before it', () => {
    const d = session(D0, [10, 10, 10], [3, 3, 3], { kind: 'deload', weight: 36 });
    const r = nextPrescription(input([d], { lastDeload: { endedOn: D0, preDeloadWeightKg: 42.5, reason: 'scheduled' } }));
    expect(r.decision).toBe('resume');
    expect(r.reasonCode).toBe('deload_resume');
    expect(r.weightKg).toBe(42.5);
  });
  it('a deload caused by a stall returns one step lower', () => {
    const d = session(D0, [10, 10, 10], [3, 3, 3], { kind: 'deload', weight: 36 });
    const r = nextPrescription(input([d], { lastDeload: { endedOn: D0, preDeloadWeightKg: 42.5, reason: 'stall' } }));
    expect(r.weightKg).toBe(40);
  });
  it('the first two sessions after a deload need two good sessions in a row to increase', () => {
    const lastDeload = { endedOn: '2026-09-28', preDeloadWeightKg: 40, reason: 'scheduled' as const };
    const g = (d: string) => session(d, [10, 10, 10], [2, 2, 2]);
    const one = nextPrescription(input([g(D0)], { lastDeload }));
    expect(one.reasonCode).toBe('top_reached_confirm_pending');
    expect(one.trace.confirmReasons).toContain('after_deload');
    expect(nextPrescription(input([g(D0), g(D1)], { lastDeload })).decision).toBe('increase');
    const late = { ...lastDeload, endedOn: '2026-09-10' };
    expect(nextPrescription(input([g(D0), g(D1), g(D2)], { lastDeload: late })).decision).toBe('increase');
  });
});

describe('stall', () => {
  it('three counted sessions at one weight without growth -> a stall signal and options (nothing changes silently)', () => {
    const mk = (d: string) => session(d, [9, 8, 8], [2, 2, 2]);
    const r = nextPrescription(input([mk(D0), mk(D1), mk(D2)]));
    expect(r.decision).toBe('hold');
    expect(r.weightKg).toBe(40);
    expect(r.signals.map((s) => s.code)).toContain('stall');
    expect(r.suggestions.map((s) => s.kind)).toEqual(expect.arrayContaining(['add_rest', 'reduce_weight', 'change_rep_range', 'replace_exercise']));
  });
  it('growing total reps is not a stall', () => {
    const r = nextPrescription(input([session(D0, [9, 9, 8], [2, 2, 2]), session(D1, [9, 8, 8], [2, 2, 2]), session(D2, [9, 8, 8], [2, 2, 2])]));
    expect(r.signals.map((s) => s.code)).not.toContain('stall');
  });
});

describe('missing RIR (history imported without RIR)', () => {
  it('imported sets without RIR never raise the weight, even with top reps; the data origin is not a signal', () => {
    const imported = session(D0, [10, 10, 10], [null, null, null]);
    const r = nextPrescription(input([imported, session(D1, [10, 10, 10], [null, null, null])]));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('rir_missing');
    expect(r.weightKg).toBe(40);
    expect(r.signals.map((s) => s.code)).toContain('rir_missing');
  });
  it('the first live session with RIR continues normally from the imported weight', () => {
    const live = session(D0, [10, 10, 10], [2, 2, 2]);
    const importedBefore = session(D1, [10, 10, 10], [null, null, null]);
    expect(nextPrescription(input([live, importedBefore])).decision).toBe('increase');
  });
});

describe('missing RIR', () => {
  it('without RIR the weight is never changed', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [null, null, null])]));
    expect(r.decision).toBe('hold');
    expect(r.reasonCode).toBe('rir_missing');
    expect(r.weightKg).toBe(40);
    expect(r.signals.map((s) => s.code)).toContain('rir_missing');
  });
  it('RIR missing in one set is enough to hold', () => {
    expect(nextPrescription(input([session(D0, [10, 10, 10], [2, null, 2])])).reasonCode).toBe('rir_missing');
  });
});

describe('step, big steps and loadless exercises', () => {
  it('a step above 10% of the weight: add reps first, then increase', () => {
    const p = plan({ stepKg: 5 });
    const first = nextPrescription(input([session(D0, [10, 10, 10], [2, 2, 2])], { plan: p }));
    expect(first.decision).toBe('extend_reps');
    expect(first.reasonCode).toBe('top_reached_extend');
    expect(first.weightKg).toBe(40);
    expect(first.repTarget).toEqual({ min: 8, max: 12 });
    const mid = nextPrescription(input([session(D0, [11, 11, 10], [2, 2, 2], { repMaxTarget: 12 })], { plan: p }));
    expect(mid.decision).toBe('hold');
    expect(mid.repTarget).toEqual({ min: 8, max: 12 });
    const done = nextPrescription(input([session(D0, [12, 12, 12], [2, 2, 2], { repMaxTarget: 12 })], { plan: p }));
    expect(done.decision).toBe('increase');
    expect(done.weightKg).toBe(45);
    expect(done.repTarget).toEqual({ min: 8, max: 10 });
  });
  it('dumbbells 12.5 kg with a 2.5 kg step (20%): reps 12-15 become 12-17, then +2.5 kg', () => {
    const p = plan({ repMin: 12, repMax: 15, stepKg: 2.5, startWeightKg: 12.5 });
    const s = (reps: number[], max: number) => session(D0, reps, [2, 2, 2], { weight: 12.5, repMin: 12, repMax: 15, repMaxTarget: max });
    const a = nextPrescription(input([s([15, 15, 15], 15)], { plan: p }));
    expect(a.repTarget).toEqual({ min: 12, max: 17 });
    const b = nextPrescription(input([s([17, 17, 17], 17)], { plan: p }));
    expect(b.weightKg).toBe(15);
    expect(b.repTarget).toEqual({ min: 12, max: 15 });
  });
  it('an exercise without external load progresses by reps, then asks for a harder variation', () => {
    const p = plan({ stepKg: 0, startWeightKg: 0 });
    const s = (reps: number[], max: number) => session(D0, reps, [2, 2, 2], { weight: 0, repMaxTarget: max });
    const a = nextPrescription(input([s([10, 10, 10], 10)], { plan: p }));
    expect(a.decision).toBe('extend_reps');
    expect(a.weightKg).toBe(0);
    expect(a.repTarget.max).toBe(12);
    const b = nextPrescription(input([s([12, 12, 12], 12)], { plan: p }));
    expect(b.reasonCode).toBe('top_reached_no_load_progress');
    expect(b.suggestions.map((x) => x.kind)).toContain('add_load');
  });
  it('the weight never leaves the equipment limits', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [4, 4, 4])], { plan: plan({ maxKg: 42.5 }) }));
    expect(r.weightKg).toBe(42.5);
    const low = nextPrescription(input([session(D0, [6, 6, 5], [0, 0, 0])], { plan: plan({ minKg: 40 }) }));
    expect(low.weightKg).toBe(40);
  });
  it('a 5% decrease is rounded up to a whole step (heavier weights drop more)', () => {
    const r = nextPrescription(input([session(D0, [6, 6, 5], [0, 0, 0], { weight: 100 })], { plan: plan({ startWeightKg: 100 }) }));
    expect(r.weightKg).toBe(95);
  });
});

describe('priority order: pain > break/adherence > insufficient data > partial > too heavy > sharp drop > top reached > in range', () => {
  const good = (d = D0, o = {}) => session(d, [10, 10, 10], [2, 2, 2], o);
  const longAfter = (days: number) => addDays(D0, days);

  it('pain beats a break', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [2, 2, 2], { pain: [3] })], { forDate: longAfter(40) }));
    expect(r.reasonCode).toBe('pain_hold');
  });
  it('pain beats low adherence and a top-of-range result', () => {
    const r = nextPrescription(input([session(D0, [10, 10, 10], [2, 2, 2], { pain: [3] })], { adherence14d: { planned: 4, done: 0 } }));
    expect(r.reasonCode).toBe('pain_hold');
  });
  it('severe pain beats everything, including the third pain event', () => {
    const r = nextPrescription(
      input([good()], { painEvents: [{ date: D0, intensity: 9 }, { date: '2026-09-20', intensity: 2 }, { date: '2026-09-25', intensity: 2 }] }),
    );
    expect(r.reasonCode).toBe('pain_severe');
  });
  it('a break beats low adherence and a good result', () => {
    const r = nextPrescription(input([good()], { forDate: longAfter(20), adherence14d: { planned: 4, done: 0 } }));
    expect(r.reasonCode).toBe('layoff_one_step');
  });
  it('a break (tier 2) beats resuming after a deload (tier 3)', () => {
    const d = session(D0, [10, 10, 10], [3, 3, 3], { kind: 'deload', weight: 36 });
    const r = nextPrescription(input([d], { forDate: longAfter(20), lastDeload: { endedOn: D0, preDeloadWeightKg: 42.5, reason: 'scheduled' } }));
    expect(r.reasonCode).toBe('layoff_one_step');
  });
  it('resuming after a deload beats low adherence', () => {
    const d = session(D0, [10, 10, 10], [3, 3, 3], { kind: 'deload', weight: 36 });
    const r = nextPrescription(input([d], { adherence14d: { planned: 4, done: 0 }, lastDeload: { endedOn: D0, preDeloadWeightKg: 42.5, reason: 'scheduled' } }));
    expect(r.reasonCode).toBe('deload_resume');
  });
  it('low adherence beats insufficient data and a replaced exercise', () => {
    const one = session(D0, [10], [2], { extra: [skipped(2, 'no_time'), skipped(3, 'no_time')] });
    expect(nextPrescription(input([one], { adherence14d: { planned: 4, done: 1 } })).reasonCode).toBe('low_adherence_hold');
    const replaced = session(D0, [], [], { replaced: { reason: 'machine_busy' } });
    expect(nextPrescription(input([replaced], { adherence14d: { planned: 4, done: 1 } })).reasonCode).toBe('low_adherence_hold');
  });
  it('insufficient data beats a partial session', () => {
    const one = session(D0, [10], [2], { extra: [skipped(2, 'could_not'), skipped(3, 'could_not')] });
    expect(nextPrescription(input([one])).reasonCode).toBe('insufficient_data');
  });
  it('a partial session beats "too heavy"', () => {
    const s = session(D0, [6, 6], [0, 0], { extra: [skipped(3, 'no_time')] });
    expect(nextPrescription(input([s])).reasonCode).toBe('partial_no_time');
  });
  it('"too heavy" beats a sharp drop', () => {
    expect(nextPrescription(input([session(D0, [7, 3, 3], [2, 2, 2])])).reasonCode).toBe('too_heavy_decrease');
  });
  it('a sharp drop beats a reached top of range', () => {
    expect(nextPrescription(input([session(D0, [15, 10, 10], [2, 2, 2])])).reasonCode).toBe('sharp_drop_hold');
  });
  it('near failure beats a sharp drop', () => {
    expect(nextPrescription(input([session(D0, [10, 6, 6], [0, 0, 0])])).reasonCode).toBe('near_failure_hold');
  });
  it('top of range beats "range done at RIR 4+"', () => {
    expect(nextPrescription(input([session(D0, [10, 10, 10], [4, 4, 4])])).reasonCode).toBe('top_reached_increase_strong');
    expect(nextPrescription(input([session(D0, [9, 9, 9], [4, 4, 4])])).reasonCode).toBe('easy_increase');
  });
  it('without history, a non-severe pain event does not stop the first run, a severe one does', () => {
    const soft = nextPrescription(input([], { painEvents: [{ date: '2026-10-01', intensity: 3 }] }));
    expect(soft.reasonCode).toBe('first_execution');
    expect(soft.signals.map((s) => s.code)).toContain('pain');
    const severe = nextPrescription(input([], { painEvents: [{ date: '2026-10-01', intensity: 8 }] }));
    expect(severe.reasonCode).toBe('pain_severe');
  });
  it('low adherence is not applied to the first run', () => {
    expect(nextPrescription(input([], { adherence14d: { planned: 4, done: 0 } })).reasonCode).toBe('first_execution');
  });
});

describe('purity', () => {
  it('is deterministic and does not modify the input', () => {
    const inp = input([session(D0, [10, 9, 8], [2, 1, 1]), session(D1, [9, 8, 8], [2, 2, 2])], { painEvents: [{ date: '2026-09-20', intensity: 4 }] });
    const snapshot = JSON.stringify(inp);
    const a = nextPrescription(inp);
    const b = nextPrescription(inp);
    expect(a).toEqual(b);
    expect(JSON.stringify(inp)).toBe(snapshot);
  });
  it('only sessions of the same weight are compared', () => {
    const r = nextPrescription(input([makeSessionAt(D0, 42.5), makeSessionAt(D1, 40)]));
    expect(r.trace.workingWeightKg).toBe(42.5);
  });
});

function makeSessionAt(date: string, weight: number) {
  return session(date, [10, 10, 10], [2, 2, 2], { weight });
}

describe('fixtures sanity', () => {
  it('uses the agreed dates', () => {
    expect(FOR).toBe('2026-10-08');
    expect(D2 < D1 && D1 < D0).toBe(true);
  });
});
