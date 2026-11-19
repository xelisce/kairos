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
    // In the final layout (with the task in it), nothing else sits on top of the task.
    const final = expand({ ...d, tasks }, fromLocal('2026-08-31'), fromLocal('2026-09-03'));
    expect(final.some((o) => o.id !== 'task:t' && !o.skipped && o.start < fromLocal(s.end) && fromLocal(s.start) < o.end)).toBe(false);
    expect(final.filter((o) => o.warning)).toHaveLength(0);
  });
  it('rolls missed tasks forward', () => {
    const d = sample();
    d.tasks.push({ id: 't', title: 'HW', category: 'homework', durationMin: 60, onCalendar: true, pinned: false, done: false, createdAt: '2026-08-30T00:00', scheduled: { start: '2026-08-31T08:00', end: '2026-08-31T09:00' } });
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
    const tm = replanRange('tomorrow', now);
    expect([tm.from!.getDate(), tm.to!.getDate()]).toEqual([20, 21]);
    const n3 = replanRange('next3', now);
    expect([n3.from!.getDate(), n3.to!.getDate()]).toEqual([19, 23]);
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
    expect(dinner.warning).toMatch(/close to that window/);
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

describe('alias matching (whole words, any length) and short travel names', () => {
  it('matches 107 BPB, 2532 MH, 108 PS; not PS inside Psychology', async () => {
    const { resolvePlace } = await import('./expand');
    const d = defaultData();
    d.places.push(
      { id: 'b', name: 'Brogden Psychology Building', aliases: ['BPB'] },
      { id: 'm', name: 'Morgridge Hall', aliases: ['MH'] },
      { id: 'p', name: 'Plant Sciences', aliases: ['PS'] },
      { id: 'c', name: 'COM1', aliases: [] },
    );
    expect(resolvePlace(d, '107 BPB')!.id).toBe('b');
    expect(resolvePlace(d, '2532 MH')!.id).toBe('m');
    expect(resolvePlace(d, '108 PS')!.id).toBe('p');
    expect(resolvePlace(d, 'COM1-0204')!.id).toBe('c');
    expect(resolvePlace(d, '107 Brogden Psychology Building')!.id).toBe('b');
    expect(resolvePlace(d, 'Psychology dept')!.known).toBe(false);
    expect(resolvePlace(d, '107 BPB')!.short).toBe('BPB');
  });
  it('travel blocks use the short name and the saved route time', () => {
    const d = defaultData();
    d.routines = [];
    d.places.push({ id: 'b', name: 'Brogden Psychology Building', aliases: ['BPB'] });
    d.routes.push({ id: 'r', a: d.places[0].id, b: 'b', minutes: 30, bidirectional: true });
    d.events = [{ id: 'e', title: 'Class', category: 'other', start: '2026-11-20T13:00', end: '2026-11-20T14:00', location: '107 BPB' }];
    const t = expand(d, fromLocal('2026-11-20'), fromLocal('2026-11-21')).find((o) => o.source.type === 'travel' && o.id.endsWith(':in'))!;
    expect(t.title).toBe('🚶 BPB');
    expect((t.end.getTime() - t.start.getTime()) / 60000).toBe(30 + d.settings.travelBufferMin);
  });
});

describe('dd/mm/yyyy', () => {
  it('reads and shows day-first dates', async () => {
    const { parseDMY, toDMY } = await import('../components/ui');
    expect(parseDMY('20/11/2026')).toBe('2026-11-20');
    expect(parseDMY('2-9-26')).toBe('2026-09-02');
    expect(parseDMY('31/02/2026')).toBeNull();
    expect(parseDMY('11/20/2026')).toBeNull(); // month 20 isn't a date
    expect(toDMY('2026-09-07')).toBe('07/09/2026');
  });
});

describe('routine with a location still auto-schedules', () => {
  it('dinner at Home goes after Robotics and the trip home', () => {
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Dinner');
    Object.assign(d.routines[0], { location: 'Home', windowStart: '18:30', windowEnd: '23:30' });
    d.activities = [{ id: 'a', title: 'Wisconsin Robotics', recurring: true, days: [0, 2, 3], start: '18:00', end: '20:00', location: 'ME', color: '#000', skipDates: [], overrides: {} }];
    const occs = expand(d, fromLocal('2026-11-18'), fromLocal('2026-11-19'));
    const dinner = occs.find((o) => o.title === 'Dinner')!;
    const home = occs.find((o) => o.source.type === 'travel' && o.title.includes('Home'))!;
    expect(dinner.start >= home.end).toBe(true);
    expect(dinner.start.getHours() * 60 + dinner.start.getMinutes()).toBe(20 * 60 + 20);
    expect(home.warning).toBeUndefined();
    // Only one trip home, no extra trip "to dinner".
    expect(occs.filter((o) => o.source.type === 'travel')).toHaveLength(2);
  });
});

describe('skip vs delete', () => {
  it('skipped: still shown but not busy (no travel, routines can use the time); deleted: gone', () => {
    const d = sample(); // CS1 Lecture Mon 11:30-13:30 at COM1, Lunch 11:00-15:00
    d.classes[0].skipDates = ['2026-08-31'];
    let occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-01'));
    const cls = occs.find((o) => o.source.type === 'class')!;
    expect(cls.skipped).toBe(true);
    expect(occs.some((o) => o.source.type === 'travel')).toBe(false);
    const lunch = occs.find((o) => o.title === 'Lunch')!;
    expect(lunch.start.getHours() * 60 + lunch.start.getMinutes()).toBe(12 * 60 + 30); // usual time, over the skipped class
    d.classes[0].skipDates = [];
    d.classes[0].deletedDates = ['2026-08-31'];
    occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-01'));
    expect(occs.some((o) => o.source.type === 'class')).toBe(false);
  });
  it('delete/restore through actions, and whole items go to the Deleted list', async () => {
    const { useStore } = await import('../store');
    const { deleteOcc, restoreDate, trashItem, restoreTrash, skipOcc } = await import('./actions');
    const d = sample();
    d.events = [{ id: 'e', title: 'Hangout', category: 'hangout', start: '2026-08-31T19:00', end: '2026-08-31T21:00' }];
    useStore.setState({ data: d, past: [], future: [] });
    const get = () => useStore.getState().data;
    const cls = () => expand(get(), fromLocal('2026-08-31'), fromLocal('2026-09-01')).find((o) => o.source.type === 'class');
    skipOcc(cls()!);
    expect(cls()!.skipped).toBe(true);
    skipOcc(cls()!); // un-skip
    expect(cls()!.skipped).toBeFalsy();
    deleteOcc(cls()!);
    expect(cls()).toBeUndefined();
    restoreDate('class', 'c', '2026-08-31', 'x');
    expect(cls()).toBeDefined();
    trashItem('event', 'e');
    expect(get().events).toHaveLength(0);
    expect(get().trash[0].kind).toBe('event');
    restoreTrash(0);
    expect(get().events).toHaveLength(1);
    expect(get().trash).toHaveLength(0);
  });
});

describe('migration of older data', () => {
  it('old skips (which removed sessions) become deletes', async () => {
    const { applyRemote, useStore } = await import('../store');
    const d = sample() as unknown as Record<string, unknown> & ReturnType<typeof sample>;
    d.version = 1;
    delete (d as Partial<typeof d>).trash;
    d.classes[0].skipDates = ['2026-09-02'];
    applyRemote(d);
    const c = useStore.getState().data.classes[0];
    expect(c.skipDates).toEqual([]);
    expect(c.deletedDates).toEqual(['2026-09-02']);
    expect(useStore.getState().data.version).toBe(2);
    expect(useStore.getState().data.trash).toEqual([]);
  });
});

describe('routine that does not fit: best overlap with its window, trip waits', () => {
  it('lunch right after the last class, then the trip home', () => {
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Lunch'); // 45m, 11:00-15:00
    d.places.push({ id: 'bpb', name: 'BPB', aliases: [] }, { id: 'mh', name: 'MH', aliases: [] });
    d.routes.push(
      { id: 'r1', a: d.places[0].id, b: 'bpb', minutes: 30, bidirectional: true },
      { id: 'r2', a: d.places[0].id, b: 'mh', minutes: 30, bidirectional: true },
      { id: 'r3', a: 'bpb', b: 'mh', minutes: 5, bidirectional: true },
    );
    d.events = [
      { id: 'a', title: 'CS 536', category: 'other', start: '2026-11-17T11:00', end: '2026-11-17T12:15', location: '107 BPB' },
      { id: 'b', title: 'CS 642', category: 'other', start: '2026-11-17T13:00', end: '2026-11-17T14:15', location: '2532 MH' },
    ];
    const occs = expand(d, fromLocal('2026-11-17'), fromLocal('2026-11-18'));
    const lunch = occs.find((o) => o.title === 'Lunch')!;
    expect([lunch.start.getHours(), lunch.start.getMinutes()]).toEqual([14, 15]);
    expect(lunch.warning).toBeUndefined();
    const home = occs.find((o) => o.id.endsWith(':home'))!;
    expect([home.start.getHours(), home.start.getMinutes()]).toEqual([15, 0]);
    expect(home.warning).toBeUndefined();
  });
});

describe('Reset re-attaches dragged trips', () => {
  it('clears travel moves in range only', async () => {
    const { useStore } = await import('../store');
    const { resetRoutines } = await import('./actions');
    const d = defaultData();
    const today = new Date();
    const key = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    d.travelMoves = { [`${key(today)}:class:x:${key(today)}:home`]: `${key(today)}T21:00`, [`${key(tomorrow)}:class:x:${key(tomorrow)}:home`]: `${key(tomorrow)}T21:00` };
    d.travelOverrides = { [`${key(today)}:class:x:${key(today)}:home`]: 40 };
    useStore.setState({ data: d, past: [], future: [] });
    resetRoutines('today', today);
    const s = useStore.getState().data;
    expect(Object.keys(s.travelMoves)).toEqual([`${key(tomorrow)}:class:x:${key(tomorrow)}:home`]);
    expect(Object.values(s.travelOverrides)).toEqual([40]); // typed trip lengths are kept
  });
});

describe('tasks you place by hand stay put', () => {
  it('a pinned task in the past is not rolled forward', () => {
    const d = sample();
    d.tasks.push({ id: 'k', title: 'Code Kairos', category: 'personal', durationMin: 120, onCalendar: true, pinned: true, done: false, createdAt: '2026-11-19T17:20', scheduled: { start: '2026-11-19T15:00', end: '2026-11-19T17:00' } });
    const [t] = planTasks(d, fromLocal('2026-11-19T17:23')).filter((x) => x.id === 'k');
    expect(t.scheduled).toEqual({ start: '2026-11-19T15:00', end: '2026-11-19T17:00' });
    expect(t.rolledForward).toBeFalsy();
  });
});

describe('tasks can use a flexible routine time; trips must fit', () => {
  it('glaze at the studio goes right after Code Kairos, dinner after you get home', () => {
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Dinner');
    Object.assign(d.routines[0], { location: 'Home', preferredStart: '18:30', windowStart: '18:30', windowEnd: '23:30' });
    d.places.push({ id: 'w', name: 'Memorial Union', aliases: ['Wheelhouse Studios'] });
    d.tasks = [
      { id: 'k', title: 'Code Kairos', category: 'personal', durationMin: 190, onCalendar: true, pinned: true, done: false, createdAt: '2026-11-19T15:00', scheduled: { start: '2026-11-19T15:30', end: '2026-11-19T18:40' } },
      { id: 'g', title: 'Glaze', category: 'personal', durationMin: 30, onCalendar: true, pinned: false, done: false, createdAt: '2026-11-19T15:00', location: 'Wheelhouse Studios' },
    ];
    const tasks = planTasks(d, fromLocal('2026-11-19T17:27'));
    const g = tasks.find((t) => t.id === 'g')!.scheduled!;
    const occs = expand({ ...d, tasks }, fromLocal('2026-11-19'), fromLocal('2026-11-20'));
    const dinner = occs.find((o) => o.title === 'Dinner')!;
    expect(fromLocal(g.start) < fromLocal('2026-11-19T20:00')).toBe(true); // earlier than before
    expect(occs.filter((o) => o.warning)).toHaveLength(0);
    expect(dinner.start >= fromLocal(g.end)).toBe(true);
  });
});
