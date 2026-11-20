// The travel schedule of a trip (flights, bus rides, stays, visits) kept with its time away.
import { addMinutes } from 'date-fns';
import type { AwayRange, TravelPlan, TravelPlanKind } from '../types';
import { fromLocal, toLocal } from './time';

export const PLAN_KINDS: Record<TravelPlanKind, { icon: string; label: string; placeholder: string }> = {
  flight: { icon: '✈️', label: 'Flight', placeholder: 'e.g. UA 1234 MSN → SFO' },
  train: { icon: '🚆', label: 'Train', placeholder: 'e.g. Amtrak to Chicago' },
  bus: { icon: '🚌', label: 'Bus', placeholder: 'e.g. Van Galder to O’Hare' },
  drive: { icon: '🚗', label: 'Drive', placeholder: 'e.g. Drive to the cabin' },
  stay: { icon: '🏠', label: 'Stay', placeholder: 'e.g. Hotel, Airbnb, family' },
  visit: { icon: '👋', label: 'Visit', placeholder: 'e.g. Dinner with grandma' },
  other: { icon: '📌', label: 'Other', placeholder: 'What is it?' },
};

/** A plan without an end time is drawn this long. */
const POINT_MIN = 30;
/** Plans longer than this show as a start and an end mark on the calendar. */
const LONG_MIN = 12 * 60;

export const planEnd = (p: TravelPlan): Date =>
  p.end && p.end > p.start ? fromLocal(p.end) : addMinutes(fromLocal(p.start), POINT_MIN);

export const planTitle = (p: TravelPlan) => p.title.trim() || PLAN_KINDS[p.kind].label;

/**
 * What to draw on the calendar for a plan. A long one (a 4-night stay) would cover whole days,
 * so it shows as two short marks instead: when it starts and when it ends.
 */
export function planBlocks(p: TravelPlan): { key: string; label: string; start: Date; end: Date }[] {
  const start = fromLocal(p.start);
  const end = planEnd(p);
  if (end.getTime() - start.getTime() <= LONG_MIN * 60_000) return [{ key: 'all', label: planTitle(p), start, end }];
  const [from, to] = p.kind === 'stay' ? ['Check in', 'Check out'] : ['Starts', 'Ends'];
  return [
    { key: 'start', label: `${from}: ${planTitle(p)}`, start, end: addMinutes(start, POINT_MIN) },
    { key: 'end', label: `${to}: ${planTitle(p)}`, start: addMinutes(end, -POINT_MIN), end },
  ];
}

export const sortedPlans = (a: AwayRange) => [...(a.plans ?? [])].sort((x, y) => x.start.localeCompare(y.start));

/** The time away stretched to cover all its plans (a flight that leaves the evening before). */
export function coverPlans(a: AwayRange): AwayRange {
  let { start, end } = a;
  for (const p of a.plans ?? []) {
    if (p.start < start) start = p.start;
    const e = p.end && p.end > p.start ? p.end : toLocal(planEnd(p));
    if (e > end) end = e;
  }
  return { ...a, start, end };
}

/** A trip with these plans, ready to save: tidied, in time order, and stretched to cover them. */
export function withPlans(a: AwayRange, plans: TravelPlan[]): AwayRange {
  const tidy = [...plans]
    .sort((x, y) => x.start.localeCompare(y.start))
    .map((p) => ({
      ...p,
      title: p.title.trim(),
      where: p.where?.trim() || undefined,
      notes: p.notes?.trim() || undefined,
      end: p.end && p.end > p.start ? p.end : undefined,
    }));
  return coverPlans({ ...a, title: a.title.trim(), plans: tidy.length ? tidy : undefined });
}
