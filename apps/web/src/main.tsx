import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { applyTheme } from './app/prefs';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/glass.css';

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
    </ErrorBoundary>
  </StrictMode>,
);

// Offline: the service worker keeps the app shell in the cache (production build only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
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
