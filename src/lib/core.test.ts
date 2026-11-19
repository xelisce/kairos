import { describe, expect, it } from 'vitest';
import { formatLayout, formatWeeks, parseLayout, parseWeeks } from './weeks';
import { expand } from './expand';
import { planTasks } from './scheduler';
import { defaultData } from './defaults';
import type { AppData } from '../types';
import { fromLocal } from './time';

describe('week patterns', () => {
  it('parses ranges, odd/even and lists', () => {
    expect(parseWeeks('3-13')).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(parseWeeks('odd')).toEqual([1, 3, 5, 7, 9, 11, 13]);
    expect(parseWeeks('even 2-12')).toEqual([2, 4, 6, 8, 10, 12]);
    expect(parseWeeks('1,3,5-7')).toEqual([1, 3, 5, 6, 7]);
    expect(() => parseWeeks('banana')).toThrow();
  });
  it('formats compactly', () => {
    expect(formatWeeks([1, 2, 3, 5])).toBe('1-3, 5');
    expect(formatWeeks([3, 5, 7, 9])).toBe('odd 3-9');
  });
  it('round-trips semester layouts', () => {
    const l = parseLayout('1-6, Recess, 7-13, Reading, Exam, Exam');
    expect(l).toHaveLength(17);
    expect(l[6]).toEqual({ type: 'break', name: 'Recess' });
    expect(formatLayout(l)).toBe('1-6, Recess, 7-13, Reading, Exam, Exam');
  });
});

function sample(): AppData {
  const d = defaultData();
  d.routines = d.routines.filter((r) => r.title === 'Lunch');
  d.semesters = [{ id: 's', name: 'S', style: 'nus', startDate: '2026-08-31', layout: parseLayout('1-6, Recess, 7-13'), holidays: [] }];
  d.modules = [{ id: 'm', semesterId: 's', code: 'CS1', name: 'x', color: '#000' }];
  // Monday 11:30-13:30 in odd weeks, at COM1
  d.classes = [{ id: 'c', moduleId: 'm', kind: 'Lecture', days: [0], start: '11:30', end: '13:30', weeks: parseWeeks('odd'), location: 'COM1-0204', skipDates: [], overrides: {} }];
  d.places.push({ id: 'p', name: 'COM1', aliases: [] });
  d.routes.push({ id: 'r', a: d.places[0].id, b: 'p', minutes: 30 });
  return d;
}

describe('expand', () => {
  it('runs classes only in their weeks, skips recess', () => {
    const d = sample();
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-12-07')).filter((o) => o.source.type === 'class');
    // odd weeks 1,3,5,7,9,11,13 -> 7 occurrences; week 7 is the 8th calendar week (after recess)
    expect(occs).toHaveLength(7);
    expect(occs.map((o) => o.start.getDate())).toContain(19); // Oct 19 = week 7
  });
  it('adds travel there and back, and lunch slides around the class', () => {
    const d = sample();
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-01'));
    const travel = occs.filter((o) => o.source.type === 'travel');
    expect(travel).toHaveLength(2);
    expect(travel[0].start.getHours() * 60 + travel[0].start.getMinutes()).toBe(11 * 60 + 30 - 35); // 30 + 5 buffer
    const lunch = occs.find((o) => o.title === 'Lunch')!;
    const cls = occs.find((o) => o.source.type === 'class')!;
    expect(lunch.start >= cls.end || lunch.end <= travel[0].start).toBe(true);
  });
});

describe('scheduler', () => {
  it('places tasks before deadline and avoids clashes', () => {
    const d = sample();
    d.tasks.push({ id: 't', title: 'HW', category: 'homework', durationMin: 120, deadline: '2026-09-02T23:59', onCalendar: true, pinned: false, done: false, createdAt: '2026-08-30T00:00' });
    const tasks = planTasks(d, fromLocal('2026-08-31T09:00'));
    const s = tasks[0].scheduled!;
    expect(s).toBeTruthy();
    expect(fromLocal(s.end) <= fromLocal('2026-09-02T23:59')).toBe(true);
    const busy = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-03'));
    expect(busy.some((o) => o.start < fromLocal(s.end) && fromLocal(s.start) < o.end)).toBe(false);
  });
  it('rolls missed tasks forward', () => {
    const d = sample();
    d.tasks.push({ id: 't', title: 'HW', category: 'homework', durationMin: 60, onCalendar: true, pinned: true, done: false, createdAt: '2026-08-30T00:00', scheduled: { start: '2026-08-31T08:00', end: '2026-08-31T09:00' } });
    const [t] = planTasks(d, fromLocal('2026-08-31T10:00'));
    expect(t.rolledForward).toBe(true);
    expect(fromLocal(t.scheduled!.start) >= fromLocal('2026-08-31T10:00')).toBe(true);
  });
});

describe('UW–Madison Fall 2026 preset', () => {
  it('runs MWF classes Sep 2 to Dec 9 minus Labor Day and Thanksgiving', async () => {
    const { SEMESTER_PRESETS, semesterFromPreset } = await import('./weeks');
    const d = defaultData();
    d.routines = [];
    d.semesters = [semesterFromPreset(SEMESTER_PRESETS[0], 's')];
    d.modules = [{ id: 'm', semesterId: 's', code: 'CS 642', name: 'x', color: '#000' }];
    d.classes = [{ id: 'c', moduleId: 'm', kind: 'Lecture', days: [0, 2, 4], start: '09:30', end: '10:45', weeks: parseWeeks('1-15'), skipDates: [], overrides: {} }];
    const occs = expand(d, fromLocal('2026-08-24'), fromLocal('2026-12-31'));
    const days = occs.map((o) => o.start.toISOString().slice(0, 10));
    expect(occs[0].start.getDate()).toBe(2); // Wed Sep 2
    expect(occs[occs.length - 1].start.getMonth()).toBe(11);
    expect(occs[occs.length - 1].start.getDate()).toBe(9); // Wed Dec 9
    expect(days).not.toContain('2026-09-07');
    expect(occs.some((o) => o.start.getMonth() === 10 && o.start.getDate() === 27)).toBe(false);
    expect(occs).toHaveLength(15 * 3 - 1 /* Mon Aug 31 */ - 1 /* Labor Day */ - 1 /* Fri Nov 27 */ - 1 /* Fri Dec 11 */);
  });
});

describe('routine window across midnight', () => {
  it('shower 18:00 -> 01:00 can land after midnight when the evening is busy', () => {
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Shower');
    Object.assign(d.routines[0], { preferredStart: '22:30', windowStart: '18:00', windowEnd: '01:00', durationMin: 20 });
    d.events = [{ id: 'e', title: 'Party', category: 'hangout', start: '2026-11-20T17:30', end: '2026-11-21T00:30' }];
    const occs = expand(d, fromLocal('2026-11-20'), fromLocal('2026-11-21T12:00'));
    const shower = occs.find((o) => o.id.endsWith('2026-11-20') && o.title === 'Shower')!;
    expect(shower.warning).toBeUndefined();
    expect(shower.start.getDate()).toBe(21);
    expect(shower.start.getHours()).toBe(0);
    expect(shower.end <= fromLocal('2026-11-21T01:00')).toBe(true);
  });
});

describe('UW multi-day classes', () => {
  it('rejects odd/even when parity is off', () => {
    expect(() => parseWeeks('odd', 15, false)).toThrow();
    expect(formatWeeks([1, 3, 5, 7], false)).toBe('1, 3, 5, 7');
  });
});
