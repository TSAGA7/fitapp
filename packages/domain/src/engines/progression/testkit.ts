import type { NextPrescriptionInput, PrescriptionPlan, SessionResult, SetResult } from './types';

/** Helpers for tests. Not part of the public API. */
export const D0 = '2026-10-05';
export const D1 = '2026-09-30';
export const D2 = '2026-09-26';
export const D3 = '2026-09-22';
export const FOR = '2026-10-08';

export const plan = (over: Partial<PrescriptionPlan> = {}): PrescriptionPlan => ({
  repMin: 8,
  repMax: 10,
  rirTarget: { min: 2, max: 3 },
  sets: 3,
  restSec: 120,
  stepKg: 2.5,
  minKg: null,
  maxKg: null,
  startWeightKg: 40,
  ...over,
});

export function makeSets(reps: number[], rirs: Array<number | null>, weight: number | null = 40): SetResult[] {
  return reps.map((r, i) => ({
    setNo: i + 1,
    weightKg: weight,
    reps: r,
    rir: rirs[i] ?? null,
    status: 'done' as const,
    skipReason: null,
    painFlag: false,
  }));
}

export const skipped = (setNo: number, reason: SetResult['skipReason'], weight: number | null = 40): SetResult => ({
  setNo,
  weightKg: weight,
  reps: null,
  rir: null,
  status: 'skipped',
  skipReason: reason,
  painFlag: false,
});

export interface SessionOpts {
  weight?: number | null;
  kind?: SessionResult['kind'];
  planned?: number;
  repMin?: number;
  repMax?: number;
  repMaxTarget?: number;
  rirTarget?: { min: number; max: number };
  replaced?: SessionResult['replaced'];
  extra?: SetResult[];
  pain?: number[];
}

export function session(date: string, reps: number[], rirs: Array<number | null>, o: SessionOpts = {}): SessionResult {
  const sets = makeSets(reps, rirs, o.weight === undefined ? 40 : o.weight);
  for (const i of o.pain ?? []) {
    const s = sets[i - 1];
    if (s) s.painFlag = true;
  }
  return {
    date,
    kind: o.kind ?? 'normal',
    plannedSets: o.planned ?? 3,
    repRange: { min: o.repMin ?? 8, max: o.repMax ?? 10 },
    repMaxTarget: o.repMaxTarget ?? o.repMax ?? 10,
    rirTarget: o.rirTarget ?? { min: 2, max: 3 },
    sets: [...sets, ...(o.extra ?? [])],
    replaced: o.replaced ?? null,
  };
}

export function input(history: SessionResult[], over: Partial<NextPrescriptionInput> = {}): NextPrescriptionInput {
  return {
    forDate: FOR,
    plan: plan(),
    exercise: { axialLoad: 0 },
    history,
    painEvents: [],
    adherence14d: null,
    lastDeload: null,
    ...over,
  };
}
