import { addDays, startOfDay } from 'date-fns';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';
import type { AppData } from '../types';
import {
  deleteOcc,
  moveOcc,
  replan,
  replanRange,
  resetDays,
  restoreDate,
  restoreTrash,
  skipOcc,
  toggleSessionDone,
  trashItem,
} from './actions';
import { defaultData } from './defaults';
import { DEFAULT_SPLIT } from './tasks';
import { expand } from './expand';
import { dateKey, fromLocal } from './time';
import { lengthMin, sampleData, session, task } from '../test/fixtures';

const load = (d: AppData) => useStore.setState({ data: d, past: [], future: [] });
const data = () => useStore.getState().data;

describe('re-plan / reset ranges', () => {
  const now = fromLocal('2026-11-19T15:00'); // a Thursday
  const days = (scope: Parameters<typeof replanRange>[0]) => {
    const r = replanRange(scope, now);
    return [r.from?.getDate() ?? null, r.to?.getDate() ?? null];
  };

  it('cover the right days', () => {
    expect(days('today')).toEqual([19, 20]);
    expect(days('tomorrow')).toEqual([20, 21]);
    expect(days('next3')).toEqual([19, 23]); // today + the next 3 days
    expect(days('week')).toEqual([16, 23]);
    expect(days('future')).toEqual([19, null]);
    expect(days('all')).toEqual([null, null]);
  });
});

describe('routine length vs move; Re-plan vs Reset', () => {
  const today = startOfDay(new Date());
  const find = (title: string) => expand(data(), today, addDays(today, 1)).find((o) => o.title === title)!;
  const routine = (title: string) => data().routines.find((r) => r.title === title)!;

  beforeEach(() => {
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Lunch' || r.title === 'Dinner');
    load(d);
  });

  it('resizing keeps it auto-scheduled; moving pins it; Re-plan keeps both; Reset clears both', () => {
    const lunch = find('Lunch');
    moveOcc(lunch, lunch.start, new Date(lunch.start.getTime() + 90 * 60000), 'resize');
    expect(Object.keys(routine('Lunch').overrides)).toHaveLength(0);
    expect(lengthMin(find('Lunch'))).toBe(90);

    const eight = new Date(today);
    eight.setHours(20);
    moveOcc(find('Dinner'), eight, new Date(eight.getTime() + 3600_000), 'move');
    expect(find('Dinner').start.getHours()).toBe(20);

    replan('today');
    expect(Object.values(routine('Lunch').durationOverrides!)).toEqual([90]);
    expect(find('Dinner').start.getHours()).toBe(20);

    resetDays('today');
    expect(Object.keys(routine('Lunch').durationOverrides!)).toHaveLength(0);
    expect(find('Dinner').start.getHours()).toBe(18);
  });

  it('Reset re-attaches dragged trips in its range only, keeping typed trip lengths', () => {
    const [t0, t1] = [dateKey(today), dateKey(addDays(today, 1))];
    const keyFor = (dk: string) => `${dk}:class:x:${dk}:home`;
    load({
      ...defaultData(),
      travelMoves: { [keyFor(t0)]: `${t0}T21:00`, [keyFor(t1)]: `${t1}T21:00` },
      travelOverrides: { [keyFor(t0)]: 40 },
    });
    resetDays('today');
    expect(Object.keys(data().travelMoves)).toEqual([keyFor(t1)]);
    expect(Object.values(data().travelOverrides)).toEqual([40]);
  });
});

describe('skip, delete and the Deleted tab', () => {
  beforeEach(() => {
    const d = sampleData();
    d.events = [{ id: 'e', title: 'Hangout', category: 'hangout', start: '2026-08-31T19:00', end: '2026-08-31T21:00' }];
    load(d);
  });
  const lecture = () =>
    expand(data(), fromLocal('2026-08-31'), fromLocal('2026-09-01')).find((o) => o.source.type === 'class');

  it('skip toggles; delete hides; restore brings it back', () => {
    skipOcc(lecture()!);
    expect(lecture()!.skipped).toBe(true);
    skipOcc(lecture()!);
    expect(lecture()!.skipped).toBeFalsy();
    deleteOcc(lecture()!);
    expect(lecture()).toBeUndefined();
    restoreDate('class', 'c', '2026-08-31', 'lecture');
    expect(lecture()).toBeDefined();
  });

  it('whole items go to the Deleted tab and come back', () => {
    trashItem('event', 'e');
    expect(data().events).toHaveLength(0);
    expect(data().trash[0].kind).toBe('event');
    restoreTrash(0);
    expect(data().events).toHaveLength(1);
    expect(data().trash).toHaveLength(0);
  });
});

describe('task sessions', () => {
  it('Re-plan moves a missed session right away (no 5-hour wait)', () => {
    const d = sampleData();
    const today = dateKey(new Date());
    if (new Date().getHours() < 1) return; // needs an earlier slot today
    d.tasks.push(task({ id: 't', durationMin: 30, sessions: [session('s', `${today}T00:00`, `${today}T00:30`)] }));
    load(d);
    replan('today');
    expect(fromLocal(data().tasks[0].sessions[0].start) > new Date(Date.now() - 60_000)).toBe(true);
  });

  it('ticking every session done finishes the task', () => {
    const d = sampleData();
    d.tasks.push(
      task({
        id: 't',
        durationMin: 120,
        split: DEFAULT_SPLIT,
        sessions: [
          session('a', '2027-01-04T09:00', '2027-01-04T10:00'),
          session('b', '2027-01-05T09:00', '2027-01-05T10:00'),
        ],
      }),
    );
    load(d);
    toggleSessionDone('t', 'a');
    expect(data().tasks[0].done).toBe(false);
    toggleSessionDone('t', 'b');
    expect(data().tasks[0].done).toBe(true);
  });

  it('dragging a session pins just that session', () => {
    const d = sampleData();
    d.tasks.push(
      task({
        id: 't',
        durationMin: 120,
        split: DEFAULT_SPLIT,
        sessions: [
          session('a', '2027-01-04T09:00', '2027-01-04T10:00'),
          session('b', '2027-01-05T09:00', '2027-01-05T10:00'),
        ],
      }),
    );
    load(d);
    const block = expand(data(), fromLocal('2027-01-04'), fromLocal('2027-01-05')).find((o) => o.id === 'task:t:a')!;
    moveOcc(block, fromLocal('2027-01-04T15:00'), fromLocal('2027-01-04T16:00'));
    const t = data().tasks[0];
    expect(t.sessions.find((s) => s.id === 'a')).toMatchObject({ start: '2027-01-04T15:00', pinned: true });
    expect(t.sessions.find((s) => s.id === 'b')!.pinned).toBe(false);
    expect(t.durationMin).toBe(120); // split tasks keep their total
  });
});
