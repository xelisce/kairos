// Time you're away (a trip, a holiday): no tasks get planned then, and classes, CCAs and
// routines in that time are hidden. Events and sessions you placed yourself stay.
import type { AppData } from '../types';
import { fromLocal, overlaps } from './time';

export interface Interval {
  start: Date;
  end: Date;
}

export const awayIntervals = (data: AppData): Interval[] =>
  (data.away ?? []).map((a) => ({ start: fromLocal(a.start), end: fromLocal(a.end) })).filter((i) => i.end > i.start);

export const touchesAway = (away: Interval[], start: Date, end: Date) =>
  away.some((a) => overlaps(start, end, a.start, a.end));

/** Minutes of [start, end) that aren't in any away range. */
export function minutesNotAway(away: Interval[], start: Date, end: Date): number {
  let free = (end.getTime() - start.getTime()) / 60_000;
  for (const a of away) {
    const s = Math.max(start.getTime(), a.start.getTime());
    const e = Math.min(end.getTime(), a.end.getTime());
    if (e > s) free -= (e - s) / 60_000;
  }
  return free;
}
