import type { InBodySegments, InBodyValues } from '../../model/inbody';

/**
 * Reads the QR code printed on an InBody result sheet: https://qrcode.inbody.com?IBData=<model>-<ver><ID><values>.
 * The values are fixed-width digits (no separators), in the order of the sheet. The layout was taken from
 * an InBody570 sheet and is checked by plausibility (fat-free mass + fat = weight, water within the body): a code
 * that does not fit throws, so nothing wrong is saved — then the values are typed in by hand.
 */
export function parseInBodyQr(text: string): InBodyValues {
  const raw = (() => {
    const m = /IBData=([^&\s]+)/i.exec(text);
    if (m) return decodeURIComponent(m[1] as string);
    return text.trim();
  })();
  const dash = raw.indexOf('-');
  if (dash < 1) throw new InBodyQrError();
  const device = raw.slice(0, dash);
  // After «<model>-<version>» comes the ID padded with «!», then the data.
  let p = raw.indexOf('!', dash);
  if (p < 0) throw new InBodyQrError();
  while (raw[p] === '!') p++;
  const s = raw.slice(p);
  let i = 0;
  const take = (n: number): string => {
    const v = s.slice(i, i + n);
    i += n;
    if (v.length < n) throw new InBodyQrError();
    return v;
  };
  const int = (n: number): number => {
    const v = take(n);
    if (!/^-?\d+$/.test(v)) throw new InBodyQrError();
    return Number(v);
  };
  const dec = (n: number, scale: number) => int(n) / scale;

  const heightCm = dec(4, 10);
  const age = int(3);
  take(1);
  const sex = take(1);
  if (sex !== 'M' && sex !== 'F') throw new InBodyQrError();
  const stamp = take(12);
  if (!/^\d{12}$/.test(stamp)) throw new InBodyQrError();
  const measuredOn = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
  const measuredAt = `${stamp.slice(8, 10)}:${stamp.slice(10, 12)}`;
  take(2);
  const triple = () => {
    const v = dec(4, 10);
    take(8); // the norm range of the sheet
    return v;
  };
  const icw = triple();
  const ecw = triple();
  const protein = triple();
  const minerals = dec(4, 100);
  take(8);
  const fat = triple();
  const tbw = triple();
  const softLean = triple();
  const ffm = triple();
  const weight = triple();
  take(4); // weight, % of the norm
  const smm = dec(4, 10);
  take(4); // muscle, % of the norm
  take(4); // fat, % of the norm
  const bmi = dec(4, 10);
  const pbf = dec(4, 10);
  const segment = (): { kg: number; pct: number } => {
    const kg = dec(4, 100);
    const pct = dec(4, 10);
    take(4); // the same percent, against the current weight
    return { kg, pct };
  };
  const leanSegments: InBodySegments = { rightArm: segment(), leftArm: segment(), trunk: segment(), rightLeg: segment(), leftLeg: segment() };
  // The trunk is printed with one decimal (29.5 kg): its 4 digits are ×10, the limbs ×100.
  leanSegments.trunk.kg = (leanSegments.trunk.kg ?? 0) * 10;
  const ecwRatio = dec(4, 1000);
  const score = int(3);
  const idealWeight = dec(4, 10);
  const weightControl = dec(5, 10);
  const fatControl = dec(5, 10);
  take(1);
  const muscleControl = dec(4, 10);
  take(5);
  const fatSeg = (): { kg: number; pct: number } => ({ kg: dec(4, 10), pct: dec(4, 10) });
  const fatSegments: InBodySegments = { rightArm: fatSeg(), leftArm: fatSeg(), trunk: fatSeg(), rightLeg: fatSeg(), leftLeg: fatSeg() };
  const bmr = int(4);
  const whr = dec(4, 100);
  take(8);
  const visceral = int(2);
  take(5);
  const bcm = dec(4, 10);
  take(8);
  const arm = dec(4, 10);
  const armMuscle = dec(4, 10);
  const bone = dec(4, 100);

  // Plausibility: the parts must add up, otherwise the layout of this device is different.
  const ok =
    weight >= 20 && weight <= 400 &&
    Math.abs(ffm + fat - weight) <= 0.6 &&
    Math.abs(icw + ecw - tbw) <= 0.6 &&
    pbf > 1 && pbf < 80 && Math.abs((fat / weight) * 100 - pbf) <= 1 &&
    smm > 5 && smm < weight &&
    heightCm > 100 && heightCm < 250;
  if (!ok) throw new InBodyQrError();
  const smi = heightCm > 0 ? Math.round((((leanSegments.rightArm.kg ?? 0) + (leanSegments.leftArm.kg ?? 0) + (leanSegments.rightLeg.kg ?? 0) + (leanSegments.leftLeg.kg ?? 0)) / (heightCm / 100) ** 2) * 10) / 10 : null;
  const sane = (v: number, lo: number, hi: number) => (Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  void age;
  return {
    measuredOn,
    measuredAt,
    device: device.slice(0, 20),
    source: 'qr',
    weightKg: weight,
    skeletalMuscleKg: smm,
    bodyFatKg: fat,
    bodyFatPct: pbf,
    totalBodyWaterL: tbw,
    intracellularWaterL: icw,
    extracellularWaterL: ecw,
    proteinKg: protein,
    mineralsKg: minerals,
    fatFreeMassKg: ffm,
    softLeanMassKg: softLean,
    bmi: sane(bmi, 8, 90),
    score: sane(score, 0, 150),
    bmrKcal: sane(bmr, 500, 5000),
    visceralFatLevel: sane(visceral, 1, 30),
    waistHipRatio: sane(whr, 0.4, 2),
    ecwRatio: sane(ecwRatio, 0.2, 0.6),
    idealWeightKg: sane(idealWeight, 20, 300),
    weightControlKg: sane(weightControl, -200, 200),
    fatControlKg: sane(fatControl, -200, 200),
    muscleControlKg: sane(muscleControl, -200, 200),
    bodyCellMassKg: sane(bcm, 5, 150),
    armCircumferenceCm: sane(arm, 10, 80),
    armMuscleCircumferenceCm: sane(armMuscle, 10, 80),
    boneMineralKg: sane(bone, 0.5, 15),
    smi: smi !== null ? sane(smi, 2, 20) : null,
    leanSegments,
    fatSegments,
    note: null,
  };
}

export class InBodyQrError extends Error {
  constructor() {
    super('Не получилось прочитать этот QR-код InBody. Введи значения вручную — они есть на распечатке.');
    this.name = 'InBodyQrError';
  }
}
