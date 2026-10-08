/** Presentation-only preferences kept in the browser (not part of the user's records or backups). */
const KEY = 'fitapp.displayName';

export function getDisplayName(): string {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
export function setDisplayName(name: string): void {
  try {
    if (name.trim()) window.localStorage.setItem(KEY, name.trim());
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the name is optional */
  }
}
