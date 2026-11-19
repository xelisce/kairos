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
  d.classes = [{ id: 'c', moduleId: 'm', kind: 'Lecture', days: [0], start: '11:30', end: '13:30', weeks: parseWeeks('odd'), location: 'COM1-0204', skipDates: [], overrides: {}, kindOverrides: {} }];
  d.places.push({ id: 'p', name: 'COM1', aliases: [] });
  d.routes.push({ id: 'r', a: d.places[0].id, b: 'p', minutes: 30, bidirectional: true });
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
    d.classes = [{ id: 'c', moduleId: 'm', kind: 'Lecture', days: [0, 2, 4], start: '09:30', end: '10:45', weeks: parseWeeks('1-15'), skipDates: [], overrides: {}, kindOverrides: {} }];
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

describe('CCAs, session kinds, routes, travel moves', () => {
  it('CCA runs on its days within its range, with travel', () => {
    const d = sample();
    d.places.push({ id: 'eh', name: 'Engineering Hall', aliases: [] });
    d.activities.push({ id: 'a', title: 'Robotics', recurring: true, days: [0, 2, 3], start: '18:00', end: '20:00', location: 'Engineering Hall', color: '#000', until: '2026-09-09', skipDates: [], overrides: {} });
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-14'));
    const robo = occs.filter((o) => o.source.type === 'activity');
    expect(robo.map((o) => o.start.getDate())).toEqual([31, 2, 3, 7, 9]);
    expect(occs.some((o) => o.source.type === 'travel' && o.title.includes('Engineering Hall'))).toBe(true);
  });
  it('one class session can become a quiz', () => {
    const d = sample();
    d.classes[0].kindOverrides['2026-08-31'] = 'Quiz';
    const [c] = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-01')).filter((o) => o.source.type === 'class');
    expect(c.title).toContain('Quiz');
    expect(c.assessment).toBe(true);
  });
  it('one-way routes only apply in their direction', () => {
    const d = sample();
    d.routes[0].bidirectional = false; // Home -> COM1 30m only
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-01'));
    const back = occs.find((o) => o.source.type === 'travel' && o.id.endsWith(':home'))!;
    expect((back.end.getTime() - back.start.getTime()) / 60000).toBe(d.settings.defaultTravelMin);
  });
  it('moving travel later warns about arriving late', () => {
    const d = sample();
    const t = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-01')).find((o) => o.source.type === 'travel' && o.id.endsWith(':in'))!;
    if (t.source.type !== 'travel') throw new Error();
    d.travelMoves[t.source.key] = '2026-08-31T11:10';
    const moved = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-01')).find((o) => o.id === t.id)!;
    expect(moved.start.getHours() * 60 + moved.start.getMinutes()).toBe(11 * 60 + 10);
    expect(moved.warning).toMatch(/late/);
  });
});

describe('re-plan scopes', () => {
  it('ranges', async () => {
    const { replanRange } = await import('./actions');
    const now = fromLocal('2026-11-19T15:00'); // Thursday
    const t = replanRange('today', now);
    expect([t.from!.getDate(), t.to!.getDate()]).toEqual([19, 20]);
    const w = replanRange('week', now);
    expect([w.from!.getDate(), w.to!.getDate()]).toEqual([16, 23]);
    expect(replanRange('future', now).to).toBeNull();
    expect(replanRange('all', now).from).toBeNull();
  });
});

describe('booked CCA sessions', () => {
  it('non-recurring CCA has no weekly blocks; its sessions take its color', () => {
    const d = sample();
    d.activities.push({ id: 'h', title: 'Hoofers', recurring: false, days: [0, 1, 2, 3, 4], start: '14:00', end: '16:00', color: '#123456', skipDates: [], overrides: {} });
    d.events.push({ id: 'e', title: 'Hoofers', category: 'cca', activityId: 'h', start: '2026-09-02T14:00', end: '2026-09-02T16:00' });
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-07'));
    expect(occs.filter((o) => o.source.type === 'activity')).toHaveLength(0);
    const s = occs.find((o) => o.id === 'event:e')!;
    expect(s.color).toBe('#123456');
  });
});

describe('day markers', () => {
  it('holidays beat week labels; finals are exam-kind', async () => {
    const { dayMarker, SEMESTER_PRESETS, semesterFromPreset } = await import('./weeks');
    const sems = [semesterFromPreset(SEMESTER_PRESETS[0], 's')];
    expect(dayMarker(sems, fromLocal('2026-11-26'))).toEqual({ label: 'Thanksgiving', kind: 'break' });
    expect(dayMarker(sems, fromLocal('2026-09-07'))!.label).toBe('Labor Day');
    expect(dayMarker(sems, fromLocal('2026-12-15'))).toEqual({ label: 'Finals Week', kind: 'exam' });
    expect(dayMarker(sems, fromLocal('2026-11-18'))).toBeNull();
  });
});

describe('per-session details', () => {
  it('CCA detail on one date only; event notes first line', () => {
    const d = sample();
    d.activities.push({ id: 'a', title: 'Robotics', recurring: true, days: [0, 2], start: '18:00', end: '20:00', color: '#000', skipDates: [], overrides: {}, details: { '2026-09-02': 'Full team meeting' } });
    d.events.push({ id: 'e', title: 'Hoofers', category: 'cca', start: '2026-09-03T14:00', end: '2026-09-03T16:00', notes: 'Guest talk\nbring jacket' });
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-07'));
    const robo = occs.filter((o) => o.source.type === 'activity');
    expect(robo.map((o) => o.detail)).toEqual([undefined, 'Full team meeting']);
    expect(occs.find((o) => o.id === 'event:e')!.detail).toBe('Guest talk');
  });
});

describe('routine with no room in its window', () => {
  it('goes just outside the window instead of overlapping', () => {
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Dinner'); // 60m, 17:00-21:00
    d.events = [{ id: 'e', title: 'Robotics', category: 'cca', start: '2026-11-18T17:05', end: '2026-11-18T20:30' }];
    const dinner = expand(d, fromLocal('2026-11-18'), fromLocal('2026-11-19')).find((o) => o.title === 'Dinner')!;
    expect(dinner.start >= fromLocal('2026-11-18T20:30') || dinner.end <= fromLocal('2026-11-18T17:05')).toBe(true);
    expect(dinner.warning).toMatch(/outside/);
  });
});

describe('routine length vs move, Re-plan vs Reset', () => {
  it('resize keeps auto-scheduling at the new length; move pins; Re-plan keeps both; Reset clears', async () => {
    const { useStore } = await import('../store');
    const { moveOcc, replan, resetRoutines } = await import('./actions');
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Lunch' || r.title === 'Dinner');
    useStore.setState({ data: d, past: [], future: [] });
    const now = new Date();
    const day = new Date(now); day.setHours(0, 0, 0, 0);
    const next = new Date(day); next.setDate(day.getDate() + 1);
    const find = (t: string) => expand(useStore.getState().data, day, next).find((o) => o.title === t)!;

    // Resize lunch to 90m: still auto (no pin), new length.
    const lunch = find('Lunch');
    moveOcc(lunch, lunch.start, new Date(lunch.start.getTime() + 90 * 60000), 'resize');
    let r = useStore.getState().data.routines.find((x) => x.title === 'Lunch')!;
    expect(Object.keys(r.overrides)).toHaveLength(0);
    expect(Object.values(r.durationOverrides!)).toEqual([90]);
    expect((find('Lunch').end.getTime() - find('Lunch').start.getTime()) / 60000).toBe(90);

    // Move dinner to 20:00: pinned.
    const dinner = find('Dinner');
    const s = new Date(day); s.setHours(20, 0, 0, 0);
    moveOcc(dinner, s, new Date(s.getTime() + 60 * 60000), 'move');
    expect(find('Dinner').start.getHours()).toBe(20);

    // Re-plan keeps lunch length and dinner pin.
    replan('today', now);
    r = useStore.getState().data.routines.find((x) => x.title === 'Lunch')!;
    expect(Object.values(r.durationOverrides!)).toEqual([90]);
    expect(find('Dinner').start.getHours()).toBe(20);

    // Reset clears both.
    resetRoutines('today', now);
    const after = useStore.getState().data.routines;
    expect(Object.keys(after.find((x) => x.title === 'Lunch')!.durationOverrides!)).toHaveLength(0);
    expect(Object.keys(after.find((x) => x.title === 'Dinner')!.overrides)).toHaveLength(0);
    expect(find('Dinner').start.getHours()).toBe(18);
  });
});

describe('rename place', () => {
  it('renames the old name inside locations, whole words only', async () => {
    const { renamePlace } = await import('../components/Panels');
    const d = defaultData();
    d.places.push({ id: 'b', name: 'Brogden Psychology Building', aliases: [] }, { id: 'e', name: 'EH', aliases: [] });
    d.events = [
      { id: '1', title: 'x', category: 'other', start: '2026-11-20T10:00', end: '2026-11-20T11:00', location: '107 Brogden Psychology Building' },
      { id: '2', title: 'y', category: 'other', start: '2026-11-20T10:00', end: '2026-11-20T11:00', location: 'brogden psychology building' },
      { id: '3', title: 'z', category: 'other', start: '2026-11-20T10:00', end: '2026-11-20T11:00', location: 'Chemistry' },
    ];
    renamePlace(d, 'b', 'Brogden');
    renamePlace(d, 'e', 'Engineering Hall');
    expect(d.events.map((e) => e.location)).toEqual(['107 Brogden', 'Brogden', 'Chemistry']);
    expect(d.places.find((p) => p.id === 'b')!.name).toBe('Brogden');
  });
});
