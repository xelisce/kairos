import { describe, expect, it } from 'vitest';
import { coverPlans, planBlocks, planEnd, sortedPlans, withPlans } from './travelPlans';
import type { AwayRange } from '../types';

const trip = (): AwayRange => ({
  id: 'a',
  title: 'Thanksgiving',
  start: '2026-11-25T06:00',
  end: '2026-11-29T23:00',
  plans: [
    { id: 'back', kind: 'flight', title: 'SFO → MSN', start: '2026-11-29T21:30', end: '2026-11-30T03:10' },
    { id: 'out', kind: 'flight', title: 'MSN → SFO', start: '2026-11-24T19:00', end: '2026-11-24T23:40' },
    { id: 'stay', kind: 'stay', title: 'Aunt May', start: '2026-11-25T00:00' },
  ],
});

describe('travel plans', () => {
  it('are listed in time order', () => {
    expect(sortedPlans(trip()).map((p) => p.id)).toEqual(['out', 'stay', 'back']);
  });

  it('without an end are a short block', () => {
    expect(planEnd(trip().plans![2]).getTime() - new Date(2026, 10, 25).getTime()).toBe(30 * 60_000);
  });

  it('stretch the time away to cover them', () => {
    const a = coverPlans(trip());
    expect([a.start, a.end]).toEqual(['2026-11-24T19:00', '2026-11-30T03:10']);
    const inside = coverPlans({ ...trip(), plans: [trip().plans![2]] });
    expect([inside.start, inside.end]).toEqual(['2026-11-25T00:00', '2026-11-29T23:00']);
  });
});

describe('travel plans on the calendar', () => {
  it('a flight is one block; a 4-night stay is a check-in and a check-out mark', () => {
    const [out] = trip().plans!.filter((p) => p.id === 'out');
    expect(planBlocks(out).map((b) => b.label)).toEqual(['MSN → SFO']);
    const stay = { ...trip().plans![2], end: '2026-11-29T11:00' };
    expect(planBlocks(stay).map((b) => b.label)).toEqual(['Check in: Aunt May', 'Check out: Aunt May']);
  });
});

describe('saving a trip', () => {
  it('puts its plans in time order (a flight added on the 29th goes before the bus on the 30th)', () => {
    const a: AwayRange = {
      id: 'a',
      title: ' Trip ',
      start: '2026-11-21T06:00',
      end: '2026-11-30T23:00',
      plans: [
        { id: 'f1', kind: 'flight', title: 'Out', start: '2026-11-21T09:00' },
        { id: 'bus', kind: 'bus', title: 'Bus', start: '2026-11-30T10:00', where: '  ' },
        { id: 'f2', kind: 'flight', title: 'Back', start: '2026-11-29T18:00' },
      ],
    };
    const saved = withPlans(a, a.plans!);
    expect(saved.plans!.map((p) => p.id)).toEqual(['f1', 'f2', 'bus']);
    expect(saved.title).toBe('Trip');
    expect(saved.plans![2].where).toBeUndefined();
  });
});
