import { normalizeText, normalizeWithoutBrackets } from './cells';
import type { ExerciseRef, InferredExercise } from './types';

/** Alternative spellings (Russian) of catalog exercises, by catalog key. */
export const EXERCISE_ALIASES: Record<string, readonly string[]> = {
  leg_press: ['жим платформы ногами', 'жим ногами', 'жим ногами платформа', 'жим платформы', 'leg press'],
  smith_squat: ['присед в смитте', 'присед в смите', 'присед смит', 'присед в смите ноги чуть вперед', 'присед в смитте ноги чуть вперед', 'smith squat'],
  goblet_squat_db: ['гоблет присед', 'гоблет присед с гантелью', 'goblet squat'],
  leg_extension: ['разгибание ног сидя', 'разгибание ног сидя в тренажере', 'разгибание ног', 'разгибание ног в тренажере', 'leg extension'],
  lying_leg_curl: ['сгибание ног лежа', 'сгибание ног лежа в тренажере', 'сгибание ног', 'leg curl', 'lying leg curl'],
  rdl_db: ['румынская тяга', 'румынская тяга с гантелями', 'румынская становая тяга с гантелями'],
  chest_press_machine_seated: ['жим сидя в тренажере', 'жим в тренажере сидя', 'жим в тренажере', 'жим от груди в тренажере', 'жим в тренажере сидя грудь', 'chest press'],
  db_incline_press_30: ['жим гантелей на скамье 30', 'жим гантелей на наклонной 30', 'жим гантелей на наклонной скамье', 'жим гантелей на наклонной', 'жим гантелей лежа на наклонной скамье', 'incline dumbbell press'],
  cable_row_neutral: ['горизонтальная тяга в блоке', 'тяга нижнего блока', 'тяга горизонтального блока', 'горизонтальная тяга', 'seated cable row'],
  lat_pulldown_neutral: ['тяга с верхнего блока узким хватом', 'тяга верхнего блока узким хватом', 'тяга верхнего блока', 'тяга с верхнего блока', 'тяга вертикального блока', 'lat pulldown'],
};

export interface MatchResult {
  exerciseId: string;
  name: string;
  via: 'name' | 'alias' | 'existing';
}

export interface Matcher {
  match(name: string): MatchResult | null;
  suggest(name: string, limit: number): Array<{ exerciseId: string; name: string }>;
}

const tokens = (s: string): Set<string> => new Set(normalizeWithoutBrackets(s).split(' ').filter((t) => t.length > 2));

export function buildMatcher(exercises: readonly ExerciseRef[]): Matcher {
  const byName = new Map<string, ExerciseRef>();
  const byKey = new Map<string, ExerciseRef>();
  for (const ex of exercises) {
    if (!byName.has(normalizeText(ex.name))) byName.set(normalizeText(ex.name), ex);
    byName.set(normalizeWithoutBrackets(ex.name), byName.get(normalizeWithoutBrackets(ex.name)) ?? ex);
    byKey.set(ex.key, ex);
  }
  const aliasMap = new Map<string, ExerciseRef>();
  for (const [key, aliases] of Object.entries(EXERCISE_ALIASES)) {
    const ex = byKey.get(key);
    if (!ex) continue;
    for (const a of aliases) aliasMap.set(normalizeText(a), ex);
  }
  return {
    match(name) {
      const n = normalizeText(name);
      const nb = normalizeWithoutBrackets(name);
      const byN = byName.get(n) ?? byName.get(nb);
      if (byN) return { exerciseId: byN.id, name: byN.name, via: byN.origin === 'custom' ? 'existing' : 'name' };
      const al = aliasMap.get(n) ?? aliasMap.get(nb);
      if (al) return { exerciseId: al.id, name: al.name, via: 'alias' };
      return null;
    },
    suggest(name, limit) {
      const t = tokens(name);
      if (t.size === 0) return [];
      return exercises
        .map((ex) => {
          const u = tokens(ex.name);
          const inter = [...t].filter((x) => u.has(x)).length;
          const union = new Set([...t, ...u]).size;
          return { ex, score: union === 0 ? 0 : inter / union };
        })
        .filter((x) => x.score >= 0.3)
        .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name))
        .slice(0, limit)
        .map((x) => ({ exerciseId: x.ex.id, name: x.ex.name }));
    },
  };
}

const has = (n: string, ...words: string[]): boolean => words.some((w) => n.includes(w));

/**
 * Best-effort tags from the name of an unknown exercise. Returns null when nothing matches:
 * such an exercise is never created automatically. The tags are unverified guesses.
 */
export function inferTraits(name: string): InferredExercise | null {
  const n = normalizeWithoutBrackets(name);
  const unit: InferredExercise['loadUnit'] = has(n, 'гантел') ? 'kg_per_hand' : has(n, 'тренажер', 'блок') ? 'kg_stack' : 'kg_total';
  const t = (movementPattern: InferredExercise['movementPattern'], primary: InferredExercise['primaryMuscles'], secondary: InferredExercise['secondaryMuscles'], isCompound: boolean): InferredExercise => ({
    movementPattern,
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    isCompound,
    loadUnit: unit,
  });

  if (has(n, 'жим') && has(n, 'ног')) return t('squat', ['quads', 'glutes'], ['adductors'], true);
  if (has(n, 'присед')) return t('squat', ['quads', 'glutes'], ['adductors'], true);
  if (has(n, 'выпад')) return t('lunge', ['quads', 'glutes'], ['hamstrings'], true);
  if (has(n, 'румынск', 'становая')) return t('hinge', ['hamstrings', 'glutes'], ['lower_back'], true);
  if (has(n, 'сгибание') && has(n, 'ног')) return t('knee_flexion', ['hamstrings'], ['calves'], false);
  if (has(n, 'разгибание') && has(n, 'ног')) return t('knee_extension', ['quads'], [], false);
  if (has(n, 'ягодичн', 'hip thrust')) return t('hip_extension', ['glutes'], ['hamstrings'], true);
  if (has(n, 'икр', 'носки')) return t('calf_raise', ['calves'], [], false);
  if (has(n, 'задн') && has(n, 'пучок', 'дельт', 'разведен', 'пек')) return t('rear_delt_fly', ['rear_delts'], ['upper_back'], false);
  if (has(n, 'подъем') && has(n, 'сторон')) return t('lateral_raise', ['side_delts'], [], false);
  if (has(n, 'подъем') && has(n, 'вверх', 'перед собой')) {
    return has(n, 'тренажер') ? t('vertical_push', ['front_delts', 'side_delts'], ['triceps'], true) : t('lateral_raise', ['front_delts'], ['side_delts'], false);
  }
  if (has(n, 'жим') && has(n, 'плеч', 'над головой', 'армейск', '60')) return t('vertical_push', ['front_delts', 'side_delts'], ['triceps'], true);
  if (has(n, 'сведен', 'разведен', 'баттерфляй', 'пек дек', 'пек-дек', 'кроссовер')) return t('chest_fly', ['chest'], ['front_delts'], false);
  if (has(n, 'сгибание рук', 'молот', 'бицепс')) return t('elbow_flexion', ['biceps'], ['forearms'], false);
  if (has(n, 'разгибание рук', 'французск', 'трицепс') || (has(n, 'разгибание') && has(n, 'блок'))) return t('elbow_extension', ['triceps'], [], false);
  if (has(n, 'предплечь')) return t('elbow_flexion', ['forearms'], [], false);
  if (has(n, 'жим')) return t('horizontal_push', ['chest'], ['triceps', 'front_delts'], true);
  if (has(n, 'тяга') && has(n, 'верхн', 'вертикал')) return t('vertical_pull', ['lats'], ['biceps'], true);
  if (has(n, 'подтягив')) return t('vertical_pull', ['lats'], ['biceps'], true);
  if (has(n, 'тяга')) return t('horizontal_pull', ['upper_back', 'lats'], ['biceps', 'rear_delts'], true);
  if (has(n, 'планка')) return t('core_antiextension', ['abs'], ['obliques'], false);
  if (has(n, 'скручив', 'пресс')) return t('core_flexion', ['abs'], [], false);
  return null;
}
