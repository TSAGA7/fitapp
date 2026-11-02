import { describe, expect, it } from 'vitest';
import { InBodyTest } from '../../model/inbody';
import { InBodyQrError, parseInBodyQr } from './parseQr';
import { analyzeInBody } from './analyze';

// The QR code of a real InBody570 sheet (31.10.2026 23:35): every value below is printed on it.
const QR =
  'https://qrcode.inbody.com?IBData=570-11!!!!!!!!!!!!!!!!!!!!!!!18100290M2026103123351002930251030701700154018801270109013304160375045901790087017304630405049505980520063606320551067408110613082911250363105516560248022103821114107803791104106802951077104209490996096309440990095803670750743-0068-0068!000012000001014820010149401012215002312280023122017350100008000900810113042003600440033602990340310831500318338334282742278602672865290923372372020524552500000000000PASS0!!!!!!!!!!!!!!096101893027901710121004170108045006130344072105780000015000850007000000000001120751130570DM-0385!!!!!!022000343003430274000953009530309037700810185025003000100020002';

describe('InBody QR', () => {
  it('reads the values of the sheet', () => {
    const v = parseInBodyQr(QR);
    expect(v).toMatchObject({
      measuredOn: '2026-10-31',
      measuredAt: '23:35',
      device: '570',
      weightKg: 81.1,
      skeletalMuscleKg: 36.3,
      bodyFatKg: 17.9,
      bodyFatPct: 22.1,
      totalBodyWaterL: 46.3,
      intracellularWaterL: 29.3,
      extracellularWaterL: 17,
      proteinKg: 12.7,
      mineralsKg: 4.16,
      fatFreeMassKg: 63.2,
      softLeanMassKg: 59.8,
      bmi: 24.8,
      score: 75,
      bmrKcal: 1735,
      visceralFatLevel: 8,
      waistHipRatio: 1,
      ecwRatio: 0.367,
      idealWeightKg: 74.3,
      weightControlKg: -6.8,
      fatControlKg: -6.8,
      muscleControlKg: 0,
      bodyCellMassKg: 42,
      armCircumferenceCm: 33.6,
      armMuscleCircumferenceCm: 29.9,
      boneMineralKg: 3.4,
      smi: 8.1,
    });
    expect(v.leanSegments).toEqual({ rightArm: { kg: 3.82, pct: 111.4 }, leftArm: { kg: 3.79, pct: 110.4 }, trunk: { kg: 29.5, pct: 107.7 }, rightLeg: { kg: 9.49, pct: 99.6 }, leftLeg: { kg: 9.44, pct: 99 } });
    expect(v.fatSegments).toEqual({ rightArm: { kg: 1, pct: 148.2 }, leftArm: { kg: 1, pct: 149.4 }, trunk: { kg: 10.1, pct: 221.5 }, rightLeg: { kg: 2.3, pct: 122.8 }, leftLeg: { kg: 2.3, pct: 122 } });
    const rec = { ...v, id: 'x', createdAt: '2026-10-31T20:35:00.000Z', updatedAt: '2026-10-31T20:35:00.000Z', deletedAt: null, deviceId: 'd' };
    expect(InBodyTest.safeParse(rec).success).toBe(true);
  });

  it('refuses a code it cannot read instead of saving wrong numbers', () => {
    expect(() => parseInBodyQr('https://example.com')).toThrow(InBodyQrError);
    expect(() => parseInBodyQr(QR.replace('0811', '0911'))).toThrow(InBodyQrError);
  });
});

describe('InBody analysis', () => {
  const base = parseInBodyQr(QR);
  it('a single test: the state against the norms of the sheet', () => {
    const a = analyzeInBody([base], 'male', 1865)!;
    const ids = a.findings.map((f) => `${f.id}:${f.tone}`);
    expect(ids[0]).toBe('trend:info'); // first test
    expect(ids).toContain('fat:warn'); // 22.1% for a man: a bit over 20
    expect(ids).toContain('visceral:warn'); // level 8
    expect(ids).toContain('whr:warn'); // 1.00
    expect(ids).toContain('trunkfat:warn'); // 221%
    expect(ids).toContain('legs:warn'); // arms 111%, legs 99%
    expect(ids).toContain('water:good'); // 0.367
    expect(a.findings.find((f) => f.id === 'fat')!.text).toContain('1,7'); // 17.9 − 20% × 81.1
  });
  it('a later test: the trend between tests comes first', () => {
    const later = { ...base, measuredOn: '2026-11-28', weightKg: 79.8, bodyFatKg: 16.2, bodyFatPct: 20.3, skeletalMuscleKg: 36.7 };
    const a = analyzeInBody([later, base], 'male', 1600)!;
    expect(a.sincePrev).toMatchObject({ days: 28, muscleKg: 0.4, fatKg: -1.7 });
    expect(a.findings[0]).toMatchObject({ id: 'trend', tone: 'good', title: 'Рекомпозиция идёт' });
    expect(a.findings.find((f) => f.id === 'bmr')!.tone).toBe('warn'); // 1600 < 1735
  });
});
