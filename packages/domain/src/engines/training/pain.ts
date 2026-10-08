import type { BodyArea, PainEvent } from '../../model';

export interface PainAdvice {
  /** The movement is stopped in every case: pain in a joint is not "muscle burn". */
  stop: true;
  seekMedical: boolean;
  headline: string;
  lines: string[];
}

const WINDOW_DAYS = 28;
const SEVERE = 7;

/**
 * What to tell the user right after a pain report. No diagnosis, no "push through": stop the movement, look for an
 * alternative, and if the pain is strong, repeats or persists, suggest a doctor or physiotherapist.
 */
export function adviseOnPain(input: {
  area: BodyArea;
  intensity: number | null;
  now: string;
  /** Earlier pain events of the same exercise or area (the new one included or not). */
  history: readonly Pick<PainEvent, 'occurredAt' | 'area' | 'exerciseId' | 'intensity'>[];
  exerciseId: string | null;
}): PainAdvice {
  const recent = input.history.filter((e) => (Date.parse(input.now) - Date.parse(e.occurredAt)) / 86_400_000 <= WINDOW_DAYS && (e.area === input.area || (input.exerciseId !== null && e.exerciseId === input.exerciseId)));
  const severe = (input.intensity ?? 0) >= SEVERE || recent.some((e) => (e.intensity ?? 0) >= SEVERE);
  const repeated = recent.length >= 2;
  const lines = ['Прекрати это движение и не пытайся «разработать» боль.', 'Не компенсируй ухудшением техники — выбери другое упражнение.'];
  if (severe) lines.push('Сильная боль: не продолжай эксперименты с весом и обратись к врачу или физиотерапевту.');
  else if (repeated) lines.push('Боль повторяется: стоит показаться врачу или физиотерапевту. Приложение не ставит диагнозы.');
  else lines.push('Если боль сохранится или вернётся — обратись к врачу или физиотерапевту.');
  return { stop: true, seekMedical: severe || repeated, headline: severe ? 'Сильная боль — остановись' : 'Остановись и замени упражнение', lines };
}
