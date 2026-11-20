import { useEffect, useState } from 'react';

/** A view setting remembered in this browser (not synced: it's about this screen, not your data). */
export function usePref<T extends object>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : { ...fallback, ...(JSON.parse(v) as T) };
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
