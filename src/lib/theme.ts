// Light or dark colors: follow the device, or always light / always dark. Kept per device (your
// phone can be dark while the laptop is light), and applied before the app first draws.
import { readJson, writeStored } from './storage';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'kairos:theme';

export const savedTheme = (): Theme => readJson<{ theme?: Theme }>(KEY)?.theme ?? 'system';

/** Use `theme` now (styles.css reads data-theme on <html>) and remember it in this browser. */
export function setTheme(theme: Theme) {
  applyTheme(theme);
  writeStored(KEY, { theme });
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
