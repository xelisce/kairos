import { useEffect, useState } from 'react';
import { readJson, writeStored } from '../lib/storage';

/** A view setting remembered in this browser (not synced: it's about this screen, not your data). */
export function usePref<T extends object>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => ({ ...fallback, ...readJson<Partial<T>>(key) }));
  useEffect(() => void writeStored(key, value), [key, value]);
  return [value, setValue] as const;
}
