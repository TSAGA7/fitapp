/**
 * «Что нового»: shown once after an update, on the first start with the new version.
 * Add a new entry on top with every release; ids only grow (a date plus a letter).
 * The last seen id lives in the browser (not in backups): it is only about what this phone has already shown.
 */
export interface ChangelogEntry {
  id: string;
  date: string;
  items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: '2026-10-18g',
    date: '2026-10-18',
    items: ['Время отдыха выбирается барабаном, как в таймере iPhone', 'Записанный подход можно исправить — карандаш рядом с крестиком'],
  },
  {
    id: '2026-10-18f',
    date: '2026-10-18',
    items: [
      '«Фокус» переделан: упражнение выбирается из списка сверху, на экране только оно',
      'Сверху план: подходы × повторы, вес, запас, отдых; подходы листаются свайпом',
      'После последнего подхода сразу открывается следующее упражнение',
      'У пройденного упражнения подходы показываются списком',
    ],
  },
  {
    id: '2026-10-18e',
    date: '2026-10-18',
    items: [
      'Настройки → «Подходы на тренировке»: новый вид «Фокус» — один подход на экране, свайп к следующему',
      'План подхода наверху упражнения: подходы, повторы, запас, отдых',
      'Лишний подход больше не добавляется сам; добавленный можно убрать',
      'Обновлены нижняя панель и кнопка паузы в таймере',
      'Убраны лишние подписи у упражнений',
    ],
  },
  {
    id: '2026-10-18d',
    date: '2026-10-18',
    items: [
      'Своя → «Неделя»: запланированные тренировки — нажми и сразу начинай, свайп влево убирает',
      'Своя → «Программа»: здесь составляется и меняется план по дням',
      'Своя → «Месяц»: календарь показывает свой план',
    ],
  },
  {
    id: '2026-10-18c',
    date: '2026-10-18',
    items: [
      'Кнопка «Перерыв» закреплена внизу экрана тренировки — доступна из любого места',
      'Новый таймер отдыха: прозрачный, крупные цифры, кнопки ±15 с, пауза, завершить',
      'Профиль → «Конструктор тренировок»: свои тренировки собираются здесь',
      'Тренировки → «Своя»: свои тренировки расписываются по дням на месяц и дальше',
      'Окно «Что нового» после обновлений',
    ],
  },
  {
    id: '2026-10-18b',
    date: '2026-10-18',
    items: [
      'Добавлены темы: Classic Light, Glass, Тёмная, Ocean, Forest, Sunset, Minimal, Aurora',
      'Тему можно сменить прямо на тренировке — ничего не сбрасывается',
      'Новый дизайн экрана тренировки: подход редактируется прямо в своей строке',
    ],
  },
  {
    id: '2026-10-18a',
    date: '2026-10-18',
    items: ['Добавлены 17 упражнений в тренажёре Смита', 'Питание: продукт удаляется свайпом влево'],
  },
];

const KEY = 'fitapp.changelogSeen';
export const latestChangelogId = (): string => CHANGELOG[0]?.id ?? '';

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function markChangelogSeen(): void {
  try {
    window.localStorage.setItem(KEY, latestChangelogId());
  } catch {
    /* storage unavailable: shown again next time, nothing breaks */
  }
}

/** Entries this phone has not shown yet. Without a mark (the first version with this window) — the latest release only. */
export function unseenChangelog(): ChangelogEntry[] {
  const seen = read();
  if (seen === null) return CHANGELOG.filter((e) => e.date === CHANGELOG[0]?.date);
  return CHANGELOG.filter((e) => e.id > seen);
}

/** A brand-new install has nothing to compare with: mark everything as seen. */
export function markChangelogSeenIfNew(): void {
  if (read() === null) markChangelogSeen();
}
