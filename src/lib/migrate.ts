// Bring saved data from any older version of Kairos up to the current shape.
import type { AppData, ClassSeries } from '../types';
import { defaultData } from './defaults';

export const DATA_VERSION = 2;

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

  if (!(d.version >= 2)) {
    // Before version 2, "skip" removed the session, which is now "delete": keep how the calendar looked.
    for (const x of [...d.classes, ...d.routines, ...d.activities]) {
      x.deletedDates = [...new Set([...(x.deletedDates ?? []), ...x.skipDates])];
      x.skipDates = [];
    }
  }
  d.version = DATA_VERSION;
  return d;
}
