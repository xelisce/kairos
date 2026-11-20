import { useState } from 'react';
import type { AppData, ClassKind } from '../../types';

/** Form state for one object, with a partial updater: `const [task, update] = useDraft(...)`. */
export function useDraft<T extends object>(initial: () => T) {
  const [draft, setDraft] = useState<T>(initial);
  const update = (patch: Partial<T>) => setDraft((d) => ({ ...d, ...patch }));
  return [draft, update, setDraft] as const;
}

/** Replace the item with the same id, or add it. */
export function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

/** Location suggestions: saved places first, then other locations you've used. */
export function locationSuggestions(d: AppData): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (v?: string) => {
    const t = v?.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  };
  d.places.forEach((p) => add(p.name));
  [...d.classes, ...d.activities, ...d.events, ...d.tasks, ...d.routines].forEach((x) => add(x.location));
  return out;
}

const CLASS_KINDS: ClassKind[] = [
  'Lecture',
  'Discussion',
  'Tutorial',
  'Lab',
  'Seminar',
  'Quiz',
  'Exam',
  'Presentation',
  'Help session',
  'Other',
];

/** The choices, plus an older type (e.g. Recitation) if this class already uses it. */
export const kindOptions = (current: ClassKind): ClassKind[] =>
  CLASS_KINDS.includes(current) ? CLASS_KINDS : [current, ...CLASS_KINDS];
