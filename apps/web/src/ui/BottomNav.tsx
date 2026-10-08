import { Icon, type IconName } from './Icon';

export const NAV_ITEMS: ReadonlyArray<{ path: string; label: string; icon: IconName }> = [
  { path: 'today', label: 'Сегодня', icon: 'today' },
  { path: 'nutrition', label: 'Питание', icon: 'nutrition' },
  { path: 'training', label: 'Тренировки', icon: 'training' },
  { path: 'progress', label: 'Прогресс', icon: 'progress' },
  { path: 'profile', label: 'Профиль', icon: 'profile' },
];

export function BottomNav({ current }: { current: string }) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {NAV_ITEMS.map((i) => (
        <a key={i.path} href={`#/${i.path}`} aria-current={current === i.path ? 'page' : undefined}>
          <span className="nav-ic">
            <Icon name={i.icon} size={22} />
          </span>
          {i.label}
        </a>
      ))}
    </nav>
  );
}
