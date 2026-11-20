// Bring saved data from any older version of Kairos up to the current shape.
import type { AppData, ClassSeries, Task, TimeOverride } from '../types';
import { defaultData } from './defaults';
import { uid } from './time';

export const DATA_VERSION = 3;

const LISTS = [
  'semesters',
  'modules',
  'classes',
  'activities',
  'routines',
  'events',
  'tasks',
  'places',
  'routes',
  'trash',
  'away',
] as const;

const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Does this look like Kairos data (a backup, a saved copy)? Any other JSON file would otherwise
 * replace everything with an empty calendar.
 */
export function isKairosData(raw: unknown): raw is Partial<AppData> {
  if (!isRecord(raw)) return false;
  const present = LISTS.filter((k) => k in raw);
  return (
    present.length > 0 &&
    present.every((k) => Array.isArray(raw[k]) && (raw[k] as unknown[]).every(isRecord)) &&
    (raw.settings === undefined || isRecord(raw.settings))
  );
}

/** Fill in anything missing (with defaults) and upgrade older fields. Use on every loaded or imported copy. */
export function normalize(raw: Partial<AppData>): AppData {
  const d = { ...defaultData(), ...raw } as AppData;

  for (const c of d.classes as (ClassSeries & { weekday?: number })[]) {
    // Classes used to have one `weekday`; now `days` (MWF etc.).
    if (!Array.isArray(c.days)) {
      c.days = [c.weekday ?? 0];
      delete c.weekday;
    }
    c.kindOverrides ??= {};
  }
  for (const a of d.activities) a.recurring ??= true;
  for (const r of d.routes) r.bidirectional ??= true;
  for (const s of d.semesters) {
    s.style ??= s.layout.some((w) => w.type === 'break' && /recess/i.test(w.name)) ? 'nus' : 'us';
  }
  d.travelMoves ??= {};
  if (!Array.isArray(d.trash)) d.trash = [];
  if (!Array.isArray(d.away)) d.away = [];

  if (!(d.version >= 2)) {
    // Before version 2, "skip" removed the session, which is now "delete": keep how the calendar looked.
    for (const x of [...d.classes, ...d.routines, ...d.activities]) {
      x.deletedDates = [...new Set([...(x.deletedDates ?? []), ...x.skipDates])];
      x.skipDates = [];
    }
  }
  for (const t of d.tasks as (Task & { scheduled?: TimeOverride; pinned?: boolean })[]) {
    // Before version 3 a task had one `scheduled` slot; now it has sessions.
    if (!Array.isArray(t.sessions)) {
      t.sessions = t.scheduled ? [{ id: uid(), ...t.scheduled, done: false, pinned: !!t.pinned }] : [];
    }
    delete t.scheduled;
    delete t.pinned;
  }
  d.version = DATA_VERSION;
  return d;
}
