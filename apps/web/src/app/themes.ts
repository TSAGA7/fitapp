/**
 * App themes: one list, used by the theme switch, the pre-paint script and the backdrop.
 * Colors of each theme live as design tokens in styles/themes.css (`:root[data-theme='…']`);
 * here only the name, light/dark tone, the status-bar color and the backdrop scene (a drawn landscape, no photos to download).
 */

export type ThemeId = 'light' | 'classic' | 'glass' | 'dark' | 'ocean' | 'forest' | 'sunset' | 'minimal' | 'aurora';

interface Scene {
  /** Sky gradient, top to bottom. */
  sky: readonly [string, string, string];
  /** Soft sun / moon glow. */
  glow: { x: number; y: number; r: number; color: string; opacity: number };
  far: string;
  snow: string | null;
  mid: string;
  near: string;
  /** The color the lower part of the screen fades into, so cards over it stay readable. */
  fade: string;
  trees?: string;
  aurora?: boolean;
  /** No mountains: only a soft wave (Minimal). */
  flat?: boolean;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  tone: 'light' | 'dark';
  /** Status bar color on iPhone. */
  meta: string;
  /** null: the original soft color blobs of Fitapp instead of a landscape. */
  scene: Scene | null;
}

export const THEMES: readonly ThemeDef[] = [
  { id: 'light', label: 'Fitapp', tone: 'light', meta: '#065F46', scene: null },
  {
    id: 'classic', label: 'Classic Light', tone: 'light', meta: '#e6ecee',
    scene: { sky: ['#dfe7eb', '#edf1f3', '#f3f5f6'], glow: { x: 300, y: 120, r: 160, color: '#ffffff', opacity: 0.7 }, far: '#b9c7cf', snow: '#f7fafb', mid: '#a7b8bf', near: '#c8d3d6', fade: '#eef2f3' },
  },
  {
    id: 'glass', label: 'Glass', tone: 'light', meta: '#c9d7df',
    scene: { sky: ['#b7c9d4', '#d7e2e8', '#e9eff1'], glow: { x: 290, y: 110, r: 170, color: '#ffffff', opacity: 0.75 }, far: '#8ea3b0', snow: '#f4f8fa', mid: '#7f949b', near: '#9fb0ad', fade: '#e4ebed' },
  },
  {
    id: 'dark', label: 'Тёмная', tone: 'dark', meta: '#0b1215',
    scene: { sky: ['#0a1114', '#132026', '#16242a'], glow: { x: 300, y: 110, r: 120, color: '#9fb7c4', opacity: 0.18 }, far: '#2a3b44', snow: '#8fa3ad', mid: '#1c2a31', near: '#141f24', fade: '#0b1110' },
  },
  {
    id: 'ocean', label: 'Ocean', tone: 'light', meta: '#bfe0ea',
    scene: { sky: ['#b9dce8', '#d8edf3', '#e7f3f6'], glow: { x: 90, y: 120, r: 160, color: '#ffffff', opacity: 0.65 }, far: '#7fb0c2', snow: '#f1f8fa', mid: '#4f8fa5', near: '#3f7f94', fade: '#e8f2f5' },
  },
  {
    id: 'forest', label: 'Forest', tone: 'dark', meta: '#13221a',
    scene: { sky: ['#1f3328', '#1a2b22', '#132019'], glow: { x: 280, y: 130, r: 150, color: '#d6e8c8', opacity: 0.16 }, far: '#2f4a3b', snow: '#9fb8a6', mid: '#22382c', near: '#172a20', trees: '#10201a', fade: '#0d1712' },
  },
  {
    id: 'sunset', label: 'Sunset', tone: 'light', meta: '#f3c9b8',
    scene: { sky: ['#f1b9a8', '#f8d6c4', '#fbe9df'], glow: { x: 210, y: 300, r: 180, color: '#ffd9a0', opacity: 0.8 }, far: '#c99aa6', snow: '#fbe7e3', mid: '#a9788e', near: '#b98d97', fade: '#f8eee9' },
  },
  {
    id: 'minimal', label: 'Minimal', tone: 'light', meta: '#f5f6f6',
    scene: { sky: ['#f1f2f3', '#f5f6f6', '#f7f8f8'], glow: { x: 320, y: 80, r: 200, color: '#ffffff', opacity: 0.9 }, far: '#e6e8ea', snow: null, mid: '#eceef0', near: '#f0f1f2', fade: '#f5f6f6', flat: true },
  },
  {
    id: 'aurora', label: 'Aurora', tone: 'dark', meta: '#100d22',
    scene: { sky: ['#0f0c22', '#1a1636', '#1d1a3a'], glow: { x: 300, y: 100, r: 110, color: '#c9c2ff', opacity: 0.14 }, far: '#2b2650', snow: '#8d86c2', mid: '#1f1b3d', near: '#16132c', fade: '#0e0c1d', aurora: true },
  },
];

export const themeById = (id: string): ThemeDef | undefined => THEMES.find((t) => t.id === id);

/** The landscape as an SVG data URL for `background-image`. */
export function sceneUrl(s: Scene): string {
  const W = 390;
  const H = 844;
  let trees = '';
  if (s.trees) {
    for (let x = -6, i = 0; x < W + 10; x += 13, i++) {
      const base = 512 + Math.sin(i * 0.9) * 10 + Math.sin(i * 0.37) * 14;
      const h = 26 + ((i * 7) % 5) * 6;
      trees += `M${x} ${base}L${x + 7} ${base - h}L${x + 14} ${base}Z`;
    }
  }
  const aurora = s.aurora
    ? `<g filter="url(#b)" opacity=".75"><path d="M-20 170C60 120 120 210 200 150S330 90 410 140" stroke="#5eead4" stroke-width="34" fill="none" opacity=".55"/><path d="M-20 230C80 190 150 260 230 200S350 170 410 200" stroke="#a78bfa" stroke-width="40" fill="none" opacity=".5"/><path d="M40 110C120 80 200 140 280 95" stroke="#86efac" stroke-width="20" fill="none" opacity=".35"/></g>`
    : '';
  const mountains = s.flat
    ? `<path d="M0 470C90 430 170 500 260 455S370 430 390 440V${H}H0Z" fill="${s.mid}"/><path d="M0 560C110 520 200 580 300 540S380 530 390 535V${H}H0Z" fill="${s.near}"/>`
    : `<path d="M0 360L40 332L85 346L128 304L170 258L206 214L234 242L262 230L300 272L338 254L390 292V${H}H0Z" fill="${s.far}"/>` +
      (s.snow ? `<path d="M170 258L206 214L234 242L224 249L212 236L202 255L190 246L180 262Z" fill="${s.snow}" opacity=".9"/>` : '') +
      `<path d="M0 430C58 402 104 424 150 392S246 352 298 386S366 382 390 372V${H}H0Z" fill="${s.mid}"/>` +
      `<path d="M0 520C70 488 132 512 192 486S300 468 390 500V${H}H0Z" fill="${s.near}"/>` +
      (trees ? `<path d="${trees}" fill="${s.trees}"/>` : '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin slice">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.sky[0]}"/><stop offset=".45" stop-color="${s.sky[1]}"/><stop offset="1" stop-color="${s.sky[2]}"/></linearGradient>` +
    `<radialGradient id="g"><stop offset="0" stop-color="${s.glow.color}" stop-opacity="${s.glow.opacity}"/><stop offset="1" stop-color="${s.glow.color}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.fade}" stop-opacity="0"/><stop offset=".55" stop-color="${s.fade}" stop-opacity=".82"/><stop offset="1" stop-color="${s.fade}"/></linearGradient>` +
    `<filter id="b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
    `<circle cx="${s.glow.x}" cy="${s.glow.y}" r="${s.glow.r}" fill="url(#g)"/>` +
    aurora +
    mountains +
    `<rect y="420" width="${W}" height="${H - 420}" fill="url(#f)"/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
