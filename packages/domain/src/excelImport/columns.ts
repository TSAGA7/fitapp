import { cellText, normalizeText } from './cells';
import type { RawSheet, SheetKind } from './types';

const set = (xs: string[]): Set<string> => new Set(xs.map(normalizeText));

export const TRAINING_COLUMNS = {
  date: set(['Дата', 'Date', 'День']),
  workout: set(['Тренировка', 'Workout', 'Название тренировки']),
  exercise: set(['Упражнение', 'Exercise', 'Название упражнения']),
  setNo: set(['Подход', 'Подход №', 'Set', 'Set #', 'Сет']),
  weight: set(['Вес', 'Вес, кг', 'Weight', 'Weight, kg', 'кг']),
  reps: set(['Повторения', 'Повторы', 'Повт.', 'Повт', 'Reps', 'Количество повторений']),
  rir: set(['RIR']),
  type: set(['Тип подхода', 'Тип', 'Type', 'Set type']),
  comment: set(['Комментарий', 'Comment', 'Заметка', 'Примечание']),
} as const;

export const NUTRITION_COLUMNS = {
  date: set(['Дата', 'Date', 'День']),
  weight: set(['Вес утром', 'Вес утром, кг', 'Вес', 'Вес, кг', 'Weight']),
  kcal: set(['Ккал', 'Калории', 'kcal', 'Calories']),
  protein: set(['Белок', 'Белок, г', 'Белки', 'Protein']),
  fat: set(['Жиры', 'Жиры, г', 'Fat']),
  carb: set(['Углеводы', 'Углеводы, г', 'Carbs']),
  fiber: set(['Клетчатка', 'Клетчатка, г', 'Fiber']),
  water: set(['Вода', 'Вода, л', 'Вода, мл', 'Water']),
  comment: set(['Комментарий', 'Comment', 'Заметка', 'Примечание']),
} as const;

/** Calculation and reference sheets of the tracker workbook: they repeat data, so they are never imported. */
export const TRACKER_HELPER_SHEETS = set(['Расчёты', 'Настройки', 'Продукты', 'Прогресс', 'Программа тренировок', 'Программа питания']);

export interface SheetLayout {
  kind: SheetKind;
  /** 0-based index of the header row. */
  headerIndex: number;
  /** Field -> 0-based column index. */
  columns: Record<string, number>;
  /** Field -> header text. */
  headers: Record<string, string>;
}

function mapRow(row: readonly unknown[], spec: Record<string, Set<string>>): { columns: Record<string, number>; headers: Record<string, string> } {
  const columns: Record<string, number> = {};
  const headers: Record<string, string> = {};
  row.forEach((cell, idx) => {
    const text = cellText(cell as never);
    if (text === '') return;
    const norm = normalizeText(text);
    for (const [field, names] of Object.entries(spec)) {
      if (names.has(norm) && !(field in columns)) {
        columns[field] = idx;
        headers[field] = text;
      }
    }
  });
  return { columns, headers };
}

/** Looks for a header row in the first rows of a sheet and decides what kind of sheet it is. */
export function detectSheet(sheet: RawSheet, scanRows = 25): SheetLayout | null {
  const limit = Math.min(scanRows, sheet.rows.length);
  for (let i = 0; i < limit; i++) {
    const row = sheet.rows[i] ?? [];
    const t = mapRow(row, TRAINING_COLUMNS);
    if ('date' in t.columns && 'exercise' in t.columns && 'reps' in t.columns) {
      return { kind: 'training', headerIndex: i, columns: t.columns, headers: t.headers };
    }
    const n = mapRow(row, NUTRITION_COLUMNS);
    if ('date' in n.columns && ('kcal' in n.columns || 'weight' in n.columns)) {
      return { kind: 'nutrition', headerIndex: i, columns: n.columns, headers: n.headers };
    }
  }
  return null;
}
