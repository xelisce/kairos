import { describe, expect, it } from 'vitest';
import { defaultData } from './defaults';
import { expand } from './expand';
import { fromLocal } from './time';
import { clock, hm, sampleData } from '../test/fixtures';

const onlyRoutine = (title: string) => {
  const d = defaultData();
  d.routines = d.routines.filter((r) => r.title === title);
  return d;
};

describe('fitting routines', () => {
  it('lunch slides around a class and its trips', () => {
    const occs = expand(sampleData(), fromLocal('2026-08-31'), fromLocal('2026-09-01'));
    const lunch = occs.find((o) => o.title === 'Lunch')!;
    const cls = occs.find((o) => o.source.type === 'class')!;
    const tripThere = occs.find((o) => o.source.type === 'travel')!;
    expect(lunch.start >= cls.end || lunch.end <= tripThere.start).toBe(true);
  });

  it('a window can cross midnight (shower 18:00 → 01:00)', () => {
    const d = onlyRoutine('Shower');
    Object.assign(d.routines[0], {
      preferredStart: '22:30',
      windowStart: '18:00',
      windowEnd: '01:00',
      durationMin: 20,
    });
    d.events = [{ id: 'e', title: 'Party', category: 'hangout', start: '2026-11-20T17:30', end: '2026-11-21T00:30' }];
    const occs = expand(d, fromLocal('2026-11-20'), fromLocal('2026-11-21T12:00'));
    const shower = occs.find((o) => o.id.endsWith('2026-11-20') && o.title === 'Shower')!;
    expect(shower.warning).toBeUndefined();
    expect([shower.start.getDate(), shower.start.getHours()]).toEqual([21, 0]);
  });

  it('with no room in its window, it goes as close to the window as it can (flagged)', () => {
    const d = onlyRoutine('Dinner'); // 60m, 17:00-21:00
    d.events = [{ id: 'e', title: 'Robotics', category: 'cca', start: '2026-11-18T17:05', end: '2026-11-18T20:30' }];
    const dinner = expand(d, fromLocal('2026-11-18'), fromLocal('2026-11-19')).find((o) => o.title === 'Dinner')!;
    expect(dinner.start >= fromLocal('2026-11-18T20:30') || dinner.end <= fromLocal('2026-11-18T17:05')).toBe(true);
    expect(dinner.warning).toMatch(/close to that window/);
  });

  it('a routine with a location still auto-schedules (dinner at Home after Robotics)', () => {
    const d = onlyRoutine('Dinner');
    Object.assign(d.routines[0], { location: 'Home', windowStart: '18:30', windowEnd: '23:30' });
    d.activities = [
      {
        id: 'a',
        title: 'Wisconsin Robotics',
        recurring: true,
        days: [0, 2, 3],
        start: '18:00',
        end: '20:00',
        location: 'ME',
        color: '#000',
        skipDates: [],
        overrides: {},
      },
    ];
    const occs = expand(d, fromLocal('2026-11-18'), fromLocal('2026-11-19'));
    const dinner = occs.find((o) => o.title === 'Dinner')!;
    const home = occs.find((o) => o.source.type === 'travel' && o.title.includes('Home'))!;
    expect(dinner.start >= home.end).toBe(true);
    expect(clock(dinner.start)).toBe(hm(20, 20));
    expect(occs.filter((o) => o.source.type === 'travel')).toHaveLength(2); // there and back, no extra trip
  });

  it('a routine without a place can go before a trip; the trip waits (lunch at MH, then home)', () => {
    const d = onlyRoutine('Lunch'); // 45m, 11:00-15:00
    d.places.push({ id: 'bpb', name: 'BPB', aliases: [] }, { id: 'mh', name: 'MH', aliases: [] });
    d.routes.push(
      { id: 'r1', a: d.places[0].id, b: 'bpb', minutes: 30, bidirectional: true },
      { id: 'r2', a: d.places[0].id, b: 'mh', minutes: 30, bidirectional: true },
      { id: 'r3', a: 'bpb', b: 'mh', minutes: 5, bidirectional: true },
    );
    d.events = [
      {
        id: 'a',
        title: 'CS 536',
        category: 'other',
        start: '2026-11-17T11:00',
        end: '2026-11-17T12:15',
        location: '107 BPB',
      },
      {
        id: 'b',
        title: 'CS 642',
        category: 'other',
        start: '2026-11-17T13:00',
        end: '2026-11-17T14:15',
        location: '2532 MH',
      },
    ];
    const occs = expand(d, fromLocal('2026-11-17'), fromLocal('2026-11-18'));
    const lunch = occs.find((o) => o.title === 'Lunch')!;
    const home = occs.find((o) => o.id.endsWith(':home'))!;
    expect([clock(lunch.start), lunch.warning]).toEqual([hm(14, 15), undefined]);
    expect([clock(home.start), home.warning]).toEqual([hm(15), undefined]);
  });
});
