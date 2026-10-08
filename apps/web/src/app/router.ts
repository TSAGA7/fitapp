import { useSyncExternalStore } from 'react';

export const parseHash = (hash: string): string[] => hash.replace(/^#\/?/, '').split('/').filter(Boolean);

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/** Current route segments, e.g. "#/progress/weight" -> ["progress", "weight"]. */
export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  const seg = parseHash(hash);
  return seg.length === 0 ? ['today'] : seg;
}

export const go = (path: string): void => {
  window.location.hash = `#/${path}`;
};
export const goBack = (fallback: string): void => {
  if (window.history.length > 1) window.history.back();
  else go(fallback);
};
