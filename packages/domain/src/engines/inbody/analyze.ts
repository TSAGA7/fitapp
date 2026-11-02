import type { InBodySegmentKey, InBodyValues } from '../../model/inbody';

export type InBodyTone = 'good' | 'warn' | 'bad' | 'info';
export interface InBodyFinding {
  id: string;
  tone: InBodyTone;
  title: string;
  text: string;
}
export interface InBodyChange {
  /** Days between the two tests. */
  days: number;
  weightKg: number;
  muscleKg: number | null;
  fatKg: number | null;
  fatPct: number | null;
}
export interface InBodyAnalysis {
  latest: InBodyValues;
  /** Against the previous test, when there is one. */
  sincePrev: InBodyChange | null;
  /** Against the first test, when there are three or more (otherwise it is the same as sincePrev). */
  sinceFirst: InBodyChange | null;
  findings: InBodyFinding[];
}

type Sex = 'male' | 'female' | 'unspecified';

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ',');
const fix = (n: number, d: number) => n.toFixed(d).replace('.', ',');
const sgn = (n: number, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), d)}`;
const sub = (a: number | null, b: number | null) => (a !== null && b !== null ? r1(a - b) : null);

function change(from: InBodyValues, to: InBodyValues): InBodyChange {
  return {
    days: daysBetween(from.measuredOn, to.measuredOn),
    weightKg: r1(to.weightKg - from.weightKg),
    muscleKg: sub(to.skeletalMuscleKg, from.skeletalMuscleKg),
    fatKg: sub(to.bodyFatKg, from.bodyFatKg),
    fatPct: sub(to.bodyFatPct, from.bodyFatPct),
  };
}

/** Healthy body fat for an adult, %: the ranges InBody prints (men 10–20, women 18–28). */
export function bodyFatRange(sex: Sex): { lo: number; hi: number } {
  return sex === 'female' ? { lo: 18, hi: 28 } : { lo: 10, hi: 20 };
}

/**
 * What the InBody tests say, in plain words: where the body is against the norms of the sheet,
 * how muscle and fat changed between tests, and the weak spots (visceral fat, water balance, a lagging side or the legs).
 * `tests` in any order; `targetKcal` is the day's norm of the nutrition plan, to compare with the basal metabolism.
 */
export function analyzeInBody(tests: readonly InBodyValues[], sex: Sex, targetKcal: number | null = null): InBodyAnalysis | null {
  if (tests.length === 0) return null;
  const sorted = [...tests].sort((a, b) => (a.measuredOn + (a.measuredAt ?? '') < b.measuredOn + (b.measuredAt ?? '') ? -1 : 1));
  const latest = sorted[sorted.length - 1] as InBodyValues;
  const prev = sorted.length >= 2 ? (sorted[sorted.length - 2] as InBodyValues) : null;
  const first = sorted.length >= 3 ? (sorted[0] as InBodyValues) : null;
  const sincePrev = prev ? change(prev, latest) : null;
  const sinceFirst = first ? change(first, latest) : null;
  const f: InBodyFinding[] = [];

  // 1. The trend: what happened to muscle and fat.
  const trend = sinceFirst ?? sincePrev;
  if (trend && trend.muscleKg !== null && trend.fatKg !== null && trend.days > 0) {
    const m = trend.muscleKg;
    const fat = trend.fatKg;
    const span = `за ${trend.days} ${trend.days % 10 === 1 && trend.days % 100 !== 11 ? 'день' : [2, 3, 4].includes(trend.days % 10) && ![12, 13, 14].includes(trend.days % 100) ? 'дня' : 'дней'}`;
    const facts = `мышцы ${sgn(m)} кг, жир ${sgn(fat)} кг ${span}`;
    if (m >= 0.2 && fat <= -0.3) f.push({ id: 'trend', tone: 'good', title: 'Рекомпозиция идёт', text: `Мышцы растут, жир уходит: ${facts}. Это лучший сценарий — продолжай в том же режиме.` });
    else if (m >= -0.2 && fat <= -0.3) f.push({ id: 'trend', tone: 'good', title: 'Жир уходит, мышцы на месте', text: `${facts[0]?.toUpperCase()}${facts.slice(1)}. Мышцы сохранены — дефицит подобран правильно.` });
    else if (m < -0.2 && fat <= -0.3) f.push({ id: 'trend', tone: 'warn', title: 'Вместе с жиром уходят мышцы', text: `${facts[0]?.toUpperCase()}${facts.slice(1)}. Добери белок до нормы, не пропускай силовые и не урезай калории сильнее.` });
    else if (m >= 0.2 && fat < 0.3) f.push({ id: 'trend', tone: 'good', title: 'Набор мышц без жира', text: `${facts[0]?.toUpperCase()}${facts.slice(1)}. Чистый набор.` });
    else if (m >= 0.2) f.push({ id: 'trend', tone: 'info', title: 'Растут и мышцы, и жир', text: `${facts[0]?.toUpperCase()}${facts.slice(1)}. Если цель — рельеф, чуть уменьши калории.` });
    else if (fat >= 0.3) f.push({ id: 'trend', tone: 'bad', title: 'Жир растёт', text: `${facts[0]?.toUpperCase()}${facts.slice(1)}. Проверь, сходятся ли калории с нормой, и что едешь по плану тренировок.` });
    else if (m < -0.2) f.push({ id: 'trend', tone: 'warn', title: 'Мышцы снижаются', text: `${facts[0]?.toUpperCase()}${facts.slice(1)}. Больше белка и регулярные силовые.` });
    else f.push({ id: 'trend', tone: 'info', title: 'Состав тела стабилен', text: `${facts[0]?.toUpperCase()}${facts.slice(1)}. Заметных изменений нет.` });
  } else if (!prev) {
    f.push({ id: 'trend', tone: 'info', title: 'Это первый тест', text: 'Динамика появится со вторым тестом. Проходи InBody раз в 3–4 недели, в одно время, натощак и до тренировки — так цифры сравнимы.' });
  }

  // 2. Body fat against the norm.
  if (latest.bodyFatPct !== null) {
    const { lo, hi } = bodyFatRange(sex);
    const p = latest.bodyFatPct;
    const toNorm = latest.bodyFatKg !== null && p > hi ? r1(latest.bodyFatKg - (hi / 100) * latest.weightKg) : null;
    if (p > hi + 5) f.push({ id: 'fat', tone: 'bad', title: `Жира ${fmt(p)}% — выше нормы`, text: `Норма ${lo}–${hi}%.${toNorm !== null ? ` До верхней границы примерно −${fmt(toNorm)} кг жира при тех же мышцах.` : ''}` });
    else if (p > hi) f.push({ id: 'fat', tone: 'warn', title: `Жира ${fmt(p)}% — немного выше нормы`, text: `Норма ${lo}–${hi}%.${toNorm !== null ? ` До нормы около −${fmt(toNorm)} кг жира.` : ''}` });
    else if (p < lo) f.push({ id: 'fat', tone: 'warn', title: `Жира ${fmt(p)}% — ниже нормы`, text: `Норма ${lo}–${hi}%. Слишком мало жира мешает восстановлению и гормонам — не сушись дальше.` });
    else f.push({ id: 'fat', tone: 'good', title: `Жира ${fmt(p)}% — в норме`, text: `Норма ${lo}–${hi}%.` });
  }

  // 3. Visceral fat: the fat around the organs.
  if (latest.visceralFatLevel !== null) {
    const v = latest.visceralFatLevel;
    if (v >= 10) f.push({ id: 'visceral', tone: 'bad', title: `Висцеральный жир: уровень ${fmt(v, 0)}`, text: 'Норма до 9. Это жир вокруг органов — он уходит первым при дефиците и кардио, хороший повод держать шаги и сон.' });
    else if (v >= 8) f.push({ id: 'visceral', tone: 'warn', title: `Висцеральный жир: уровень ${fmt(v, 0)}`, text: 'Пока в норме (до 9), но близко к границе. Держи его под контролем.' });
    else f.push({ id: 'visceral', tone: 'good', title: `Висцеральный жир: уровень ${fmt(v, 0)}`, text: 'В норме (до 9).' });
  }
  if (latest.waistHipRatio !== null) {
    const lim = sex === 'female' ? 0.85 : 0.9;
    if (latest.waistHipRatio > lim) f.push({ id: 'whr', tone: 'warn', title: `Талия/бёдра ${fix(latest.waistHipRatio, 2)}`, text: `Выше ${fix(lim, 2)} — жир копится на животе. Сходится с жиром на туловище: он уходит медленнее всего, нужна терпеливая работа над дефицитом.` });
  }

  // 4. Fat by segments: the trunk.
  const fs = latest.fatSegments;
  if (fs?.trunk.pct != null && fs.trunk.pct > 160) {
    const limbs = [fs.rightArm.pct, fs.leftArm.pct, fs.rightLeg.pct, fs.leftLeg.pct].filter((x): x is number => x !== null);
    const avgLimbs = limbs.length ? limbs.reduce((a, b) => a + b, 0) / limbs.length : null;
    f.push({ id: 'trunkfat', tone: 'warn', title: 'Больше всего жира — на туловище', text: `Туловище ${fmt(fs.trunk.pct, 0)}% от нормы${avgLimbs !== null ? `, руки и ноги в среднем ${fmt(avgLimbs, 0)}%` : ''}. Локально жир не сжечь — уйдёт с общим дефицитом, живот обычно последним.` });
  }

  // 5. Muscle by segments: balance left/right and upper/lower.
  const ls = latest.leanSegments;
  if (ls) {
    const pair = (a: InBodySegmentKey, b: InBodySegmentKey, name: string) => {
      const x = ls[a].kg;
      const y = ls[b].kg;
      if (x === null || y === null || Math.min(x, y) <= 0) return;
      const diff = (Math.abs(x - y) / Math.min(x, y)) * 100;
      if (diff >= 5) {
        const weak = x < y ? (a === 'rightArm' || a === 'rightLeg' ? 'правая' : 'левая') : b === 'rightArm' || b === 'rightLeg' ? 'правая' : 'левая';
        f.push({ id: `bal-${name}`, tone: 'warn', title: `${name[0]?.toUpperCase()}${name.slice(1)}: ${weak} слабее на ${fmt(diff, 0)}%`, text: `Добавь упражнения на одну ${name === 'руки' ? 'руку' : 'ногу'} и начинай со слабой стороны.` });
      }
    };
    pair('rightArm', 'leftArm', 'руки');
    pair('rightLeg', 'leftLeg', 'ноги');
    const arms = [ls.rightArm.pct, ls.leftArm.pct].filter((x): x is number => x !== null);
    const legs = [ls.rightLeg.pct, ls.leftLeg.pct].filter((x): x is number => x !== null);
    if (arms.length && legs.length) {
      const a = arms.reduce((s, x) => s + x, 0) / arms.length;
      const l = legs.reduce((s, x) => s + x, 0) / legs.length;
      if (l < 100 && a - l >= 8) f.push({ id: 'legs', tone: 'warn', title: 'Ноги отстают от верха', text: `Мышцы рук ${fmt(a, 0)}% от нормы, ног — ${fmt(l, 0)}%. Ноги — самые большие мышцы: приседания, жим ногами и выпады дадут больше всего прироста.` });
      else if (a < 100 && l - a >= 8) f.push({ id: 'arms', tone: 'warn', title: 'Верх отстаёт от ног', text: `Мышцы рук ${fmt(a, 0)}% от нормы, ног — ${fmt(l, 0)}%. Добавь жимы, тяги и подтягивания.` });
      else if (a >= 100 && l >= 100) f.push({ id: 'balance', tone: 'good', title: 'Мышцы развиты равномерно', text: `Руки ${fmt(a, 0)}%, ноги ${fmt(l, 0)}% от нормы — все сегменты в норме и выше.` });
    }
  }

  // 6. Water: swelling or inflammation shows as a high share of extracellular water.
  if (latest.ecwRatio !== null) {
    if (latest.ecwRatio > 0.39) f.push({ id: 'water', tone: 'bad', title: `Внеклеточная вода ${fix(latest.ecwRatio, 3)}`, text: 'Выше 0,390 — отёки или воспаление. Так бывает после тяжёлой тренировки, солёной еды или при недосыпе. Перепроверь через неделю в спокойный день.' });
    else if (latest.ecwRatio > 0.38) f.push({ id: 'water', tone: 'warn', title: `Внеклеточная вода ${fix(latest.ecwRatio, 3)}`, text: 'Верхняя граница нормы (0,360–0,390). Следи за солью, сном и восстановлением.' });
    else f.push({ id: 'water', tone: 'good', title: 'Водный баланс в норме', text: `ВКЖ/ОКЖ ${fix(latest.ecwRatio, 3)} — норма 0,360–0,390, отёков нет.` });
  }

  // 7. Calories: never below the basal metabolism.
  if (latest.bmrKcal !== null && targetKcal !== null) {
    if (targetKcal < latest.bmrKcal - 50) f.push({ id: 'bmr', tone: 'warn', title: 'Норма калорий ниже базового обмена', text: `Твоя норма ${Math.round(targetKcal)} ккал, а организм в покое тратит ${latest.bmrKcal}. Слишком жёсткий дефицит съедает мышцы — подними норму хотя бы до ${latest.bmrKcal}.` });
    else f.push({ id: 'bmr', tone: 'info', title: `Базовый обмен ${latest.bmrKcal} ккал`, text: `Столько организм тратит в покое. Твоя норма ${Math.round(targetKcal)} ккал — с учётом активности это ${targetKcal > latest.bmrKcal * 1.3 ? 'поддержка или небольшой профицит' : 'умеренный дефицит'}.` });
  }

  // 8. What the sheet recommends.
  if (latest.fatControlKg !== null && latest.muscleControlKg !== null && (latest.fatControlKg !== 0 || latest.muscleControlKg !== 0)) {
    const parts = [latest.fatControlKg !== 0 ? `жир ${sgn(latest.fatControlKg)} кг` : null, latest.muscleControlKg !== 0 ? `мышцы ${sgn(latest.muscleControlKg)} кг` : null].filter(Boolean);
    f.push({ id: 'control', tone: 'info', title: 'Цель по распечатке InBody', text: `${parts.join(', ')}${latest.idealWeightKg !== null ? ` — идеальный вес ${fmt(latest.idealWeightKg)} кг` : ''}.${trend && trend.fatKg !== null && trend.fatKg < 0 && trend.days > 0 && latest.fatControlKg < 0 ? ` В текущем темпе это примерно ${Math.max(1, Math.round((Math.abs(latest.fatControlKg) / Math.abs(trend.fatKg)) * trend.days / 7))} нед.` : ''}` });
  }

  const order: Record<InBodyTone, number> = { bad: 0, warn: 1, good: 2, info: 3 };
  const head = f.filter((x) => x.id === 'trend');
  const rest = f.filter((x) => x.id !== 'trend').sort((a, b) => order[a.tone] - order[b.tone]);
  return { latest, sincePrev, sinceFirst, findings: [...head, ...rest] };
}
