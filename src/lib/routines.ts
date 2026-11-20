// Fitting flexible routines (meals, shower...) into their windows around everything else.
import { addMinutes } from 'date-fns';
import type { Occ, Routine } from '../types';
import { atMin, hmToMin, overlaps } from './time';

const STEP = 5;
/** How far outside its window a routine may go when the window is full. */
const MAX_OUTSIDE_MIN = 180;

export function routineOcc(r: Routine, dk: string, start: Date, end: Date, warning?: string, subtitle?: string): Occ {
  return {
    id: `routine:${r.id}:${dk}`,
    source: { type: 'routine', routineId: r.id, date: dk },
    title: r.title,
    subtitle,
    start,
    end,
    location: r.location,
    color: r.color,
    movable: true,
    warning,
    detail: r.details?.[dk],
  };
}

/** The routine's window on `day` (the end can be after midnight). */
export function routineWindow(r: Routine, day: Date) {
  const ws = hmToMin(r.windowStart);
  let we = hmToMin(r.windowEnd);
  if (we <= ws) we += 1440;
  return { start: atMin(day, ws), end: atMin(day, we) };
}

/**
 * Place a flexible routine on `day`:
 * 1. its usual time, or the nearest fully free time inside its window;
 * 2. otherwise (only routines without a place) on top of a trip, which then waits for it,
 *    as long as you'd still reach the next class on time;
 * 3. otherwise just outside the window, keeping as much overlap with it as possible (flagged).
 */
export function fitRoutine(r: Routine, day: Date, dk: string, busy: Occ[]): Occ {
  const pref = hmToMin(r.preferredStart);
  const ws = hmToMin(r.windowStart);
  let we = hmToMin(r.windowEnd);
  if (we <= ws) we += 1440; // window crosses midnight, e.g. 18:00 -> 01:00 next day
  // Usual start inside the window (possibly after midnight); if it's outside, snap to the nearest edge.
  let prefN = pref < ws ? pref + 1440 : pref;
  if (prefN + r.durationMin > we) prefN = pref >= ws ? Math.max(ws, we - r.durationMin) : ws;

  const at = (m: number) => {
    const s = atMin(day, m);
    return { s, e: addMinutes(s, r.durationMin) };
  };
  const make = (m: number, warning?: string, subtitle?: string) => {
    const { s, e } = at(m);
    return routineOcc(r, dk, s, e, warning, subtitle);
  };
  const inWindow = (m: number) => m >= ws && m + r.durationMin <= we;

  // Nearest to the usual time first.
  const nearest: number[] = [prefN];
  for (let d = STEP; d <= we - ws; d += STEP) nearest.push(prefN + d, prefN - d);

  // 1. Fully free.
  const free = (m: number) => {
    const { s, e } = at(m);
    return !busy.some((b) => overlaps(s, e, b.start, b.end));
  };
  const freeSlot = nearest.find((m) => inWindow(m) && free(m));
  if (freeSlot !== undefined) return make(freeSlot);

  // 2./3. Only classes, CCAs, events, tasks and other routines block it (and trips, if it has a place).
  const blockers = r.location ? busy : busy.filter((b) => b.source.type !== 'travel');
  const clear = (m: number) => {
    const { s, e } = at(m);
    if (blockers.some((b) => overlaps(s, e, b.start, b.end))) return false;
    // A trip to the next class can wait only if you'd still arrive on time; trips home can always wait.
    return !busy.some(
      (b) =>
        b.source.type === 'travel' &&
        b.id.endsWith(':in') &&
        overlaps(s, e, b.start, b.end) &&
        addMinutes(e, b.source.minutes) > b.end,
    );
  };
  if (!r.location) {
    const overTrip = nearest.find((m) => inWindow(m) && clear(m));
    if (overTrip !== undefined) return make(overTrip, undefined, 'Your trip waits until this is done');
  }
  for (let d = STEP; d <= MAX_OUTSIDE_MIN; d += STEP) {
    const outside = [we - r.durationMin + d, ws - d].find(clear);
    if (outside !== undefined) {
      return make(
        outside,
        `No free ${r.durationMin}m between ${r.windowStart} and ${r.windowEnd}, so it's as close to that window as it can be`,
      );
    }
  }
  return make(prefN, `No free ${r.durationMin}m slot between ${r.windowStart} and ${r.windowEnd}`);
}
