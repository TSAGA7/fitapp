import { setTheme, useTheme, type ThemeChoice } from '../app/prefs';
import { THEMES, sceneUrl, type ThemeDef } from '../app/themes';
import { Icon, Sheet } from '../ui';

const FITAPP_LIGHT = 'radial-gradient(70% 60% at 10% 0%, rgba(163,230,53,.55), transparent 70%), radial-gradient(70% 60% at 100% 100%, rgba(6,95,70,.35), transparent 70%), linear-gradient(#f7f8fa, #f7f8fa)';
const FITAPP_DARK = sceneUrl((THEMES.find((t) => t.id === 'dark') as ThemeDef).scene!);

function preview(t: ThemeDef): string {
  return t.scene ? sceneUrl(t.scene) : FITAPP_LIGHT;
}

/** Theme tiles with a picture of each theme. Applied at once; nothing on screen is reloaded, so it is safe in the middle of a workout. */
export function ThemeGrid() {
  const current = useTheme();
  const tiles: Array<{ id: ThemeChoice; label: string; bg: string; dark: boolean }> = [
    { id: 'system', label: 'Как на телефоне', bg: FITAPP_LIGHT, dark: false },
    ...THEMES.map((t) => ({ id: t.id as ThemeChoice, label: t.id === 'light' ? 'Fitapp (исходная)' : t.label, bg: preview(t), dark: t.tone === 'dark' })),
  ];
  return (
    <div className="theme-grid" role="radiogroup" aria-label="Оформление">
      {tiles.map((t) => (
        <button key={t.id} type="button" role="radio" aria-checked={current === t.id} className="theme-tile" onClick={() => setTheme(t.id)}>
          <span className={`theme-pic ${t.dark ? 'dark' : ''}`} style={{ backgroundImage: t.bg }}>
            {t.id === 'system' && <span className="theme-split" style={{ backgroundImage: FITAPP_DARK }} aria-hidden="true" />}
            {current === t.id && <span className="theme-check"><Icon name="check" size={14} strokeWidth={3} /></span>}
          </span>
          <span className="theme-name">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ThemeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title="Оформление" onClose={onClose}>
      <div className="stack">
        <ThemeGrid />
        <p className="t-small">Тема меняется сразу. Тренировка, таймер и введённые значения не сбрасываются.</p>
      </div>
    </Sheet>
  );
}
