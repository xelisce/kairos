import { describe, expect, it, vi } from 'vitest';
import { savedTheme, setTheme } from './theme';

// Tests run without a browser: just enough of <html> and localStorage for the theme.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
vi.stubGlobal('document', { documentElement: { dataset: {} as Record<string, string> } });

describe('theme', () => {
  it('follows the device until you pick one, and remembers your pick', () => {
    expect(savedTheme()).toBe('system');
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(savedTheme()).toBe('dark');
    setTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(savedTheme()).toBe('system');
  });
});
