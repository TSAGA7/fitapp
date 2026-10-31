import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { UPDATE_EVENT, UpdatePrompt } from './app/UpdatePrompt';
import { applyTheme } from './app/prefs';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/glass.css';
import './styles/themes.css';
import './styles/workout.css';

applyTheme();
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
} catch {
  /* old browser: the theme is applied once */
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <UpdatePrompt />
    </ErrorBoundary>
  </StrictMode>,
);

// Offline: the service worker keeps the app shell in the cache (production build only).
// Updates: the worker downloads a new version in the background and takes over; then «Доступно обновление» is shown,
// and «Обновить» reloads into it. A new version is looked for on every start and every return to the app.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // No controller yet means the very first install: nothing to update.
  const hadController = navigator.serviceWorker.controller !== null;
  let shown = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || shown) return;
    shown = true;
    window.dispatchEvent(new Event(UPDATE_EVENT));
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const check = () => void reg.update().catch(() => undefined);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      })
      .catch(() => undefined);
  });
}

// iOS keyboard: a tap outside a field closes it, so the page can scroll to the bottom again.
document.addEventListener('pointerdown', (e) => {
  const active = document.activeElement as HTMLElement | null;
  const target = e.target as HTMLElement | null;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && target && !target.closest('input, textarea, select, label')) active.blur();
});
document.addEventListener('focusin', (e) => {
  const el = e.target as HTMLElement;
  if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
});
