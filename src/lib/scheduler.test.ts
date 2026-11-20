import { describe, expect, it } from 'vitest';
import { defaultData } from './defaults';
import { expand } from './expand';
import { planTasks, taskWarning } from './scheduler';
import { DEFAULT_SPLIT, sessionMinutes } from './tasks';
import { dateKey, fromLocal } from './time';
import { sampleData, session, task } from '../test/fixtures';

describe('auto-scheduling a task', () => {
  it('places it before its deadline with nothing on top of it', () => {
    const d = sampleData();
    d.tasks.push(task({ id: 't', durationMin: 120, deadline: '2026-09-02T23:59' }));
    const tasks = planTasks(d, fromLocal('2026-08-31T09:00'));
    const [s] = tasks[0].sessions;
    expect(tasks[0].sessions).toHaveLength(1);
    expect(sessionMinutes(s)).toBe(120);
    expect(fromLocal(s.end) <= fromLocal('2026-09-02T23:59')).toBe(true);
    const final = expand({ ...d, tasks }, fromLocal('2026-08-31'), fromLocal('2026-09-03'));
    const onTop = final.filter(
      (o) => !o.id.startsWith('task:t') && !o.skipped && o.start < fromLocal(s.end) && fromLocal(s.start) < o.end,
    );
    expect(onTop).toHaveLength(0);
    expect(final.filter((o) => o.warning)).toHaveLength(0);
  });

  it('may use a flexible routine’s time, and plans the trip for a task with a location', () => {
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Dinner');
    Object.assign(d.routines[0], { location: 'Home', windowStart: '18:30', windowEnd: '23:30' });
    d.places.push({ id: 'w', name: 'Memorial Union', aliases: ['Wheelhouse Studios'] });
    d.tasks = [
      task({
        id: 'k',
        durationMin: 190,
        sessions: [session('k1', '2026-11-19T15:30', '2026-11-19T18:40', { pinned: true })],
      }),
      task({ id: 'g', durationMin: 30, location: 'Wheelhouse Studios' }),
    ];
    const tasks = planTasks(d, fromLocal('2026-11-19T17:27'));
    const [glaze] = tasks.find((t) => t.id === 'g')!.sessions;
    const occs = expand({ ...d, tasks }, fromLocal('2026-11-19'), fromLocal('2026-11-20'));
    expect(fromLocal(glaze.start) < fromLocal('2026-11-19T20:00')).toBe(true);
    expect(occs.filter((o) => o.warning)).toHaveLength(0);
    expect(occs.find((o) => o.title === 'Dinner')!.start >= fromLocal(glaze.end)).toBe(true);
  });
});

describe('missed sessions', () => {
  const missed = (pinned = false) => {
    const d = sampleData();
    d.tasks.push(task({ id: 't', sessions: [session('s', '2026-08-31T08:00', '2026-08-31T09:00', { pinned })] }));
    return d;
  };

  it('wait 5 hours so you can tick them done', () => {
    const [t] = planTasks(missed(), fromLocal('2026-08-31T13:59'));
    expect(t.sessions.map((s) => s.start)).toEqual(['2026-08-31T08:00']);
    expect(t.rolledForward).toBeFalsy();
    expect(taskWarning(t, fromLocal('2026-08-31T13:59'), 48)?.text).toMatch(/moves forward at 14:00/);
  });

  it('then roll forward', () => {
    const [t] = planTasks(missed(), fromLocal('2026-08-31T14:00'));
    expect(t.rolledForward).toBe(true);
    expect(fromLocal(t.sessions[0].start) >= fromLocal('2026-08-31T14:00')).toBe(true);
  });

  it('stay put if you placed them yourself', () => {
    const [t] = planTasks(missed(true), fromLocal('2026-11-19T17:23'));
    expect(t.sessions.map((s) => s.start)).toEqual(['2026-08-31T08:00']);
    expect(t.rolledForward).toBeFalsy();
  });
});

describe('splitting a task into sessions', () => {
  const big = (over = {}) => {
    const d = sampleData();
    d.routines = [];
    d.tasks.push(task({ id: 'p', durationMin: 360, split: DEFAULT_SPLIT, deadline: '2026-09-10T23:59', ...over }));
    return d;
  };

  it('spreads 6h as 2h a day, as early as possible, before the deadline', () => {
    const [t] = planTasks(big(), fromLocal('2026-08-31T09:00'));
    expect(t.sessions.map(sessionMinutes)).toEqual([120, 120, 120]);
    const days = t.sessions.map((s) => dateKey(fromLocal(s.start)));
    expect(new Set(days).size).toBe(3);
    expect(days[0]).toBe('2026-08-31');
    expect(t.sessions.every((s) => fromLocal(s.end) <= fromLocal('2026-09-10T23:59'))).toBe(true);
  });

  it('keeps done and pinned sessions and only plans what is left', () => {
    const d = big();
    d.tasks[0].sessions = [
      session('a', '2026-08-31T09:00', '2026-08-31T11:00', { done: true }),
      session('b', '2026-09-01T09:00', '2026-09-01T10:00', { pinned: true }),
    ];
    const [t] = planTasks(d, fromLocal('2026-08-31T12:00'));
    expect(t.sessions.find((s) => s.id === 'a')!.done).toBe(true);
    expect(t.sessions.find((s) => s.id === 'b')!.start).toBe('2026-09-01T09:00');
    expect(t.sessions.reduce((n, s) => n + sessionMinutes(s), 0)).toBe(360);
    // 1h already on 1 Sep, so at most 1h more that day.
    const sep1 = t.sessions.filter((s) => s.start.startsWith('2026-09-01'));
    expect(sep1.reduce((n, s) => n + sessionMinutes(s), 0)).toBeLessThanOrEqual(120);
  });

  it('does not make sessions shorter than the minimum (except a last small bit)', () => {
    const [t] = planTasks(big({ durationMin: 250 }), fromLocal('2026-08-31T09:00'));
    const lengths = t.sessions.map(sessionMinutes);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(250);
    expect(lengths.slice(0, -1).every((m) => m >= DEFAULT_SPLIT.minSessionMin)).toBe(true);
  });

  it('drops planned time when the task gets shorter', () => {
    const d = big();
    const [first] = planTasks(d, fromLocal('2026-08-31T09:00'));
    d.tasks[0] = { ...first, durationMin: 120 };
    const [t] = planTasks(d, fromLocal('2026-08-31T09:00'));
    expect(t.sessions.reduce((n, s) => n + sessionMinutes(s), 0)).toBe(120);
  });
});

describe('regressions', () => {
  it('a too-short leftover is folded into the last session (240 + 230 + 30, not 240 + 240 + 20)', () => {
    const d = sampleData();
    d.routines = [];
    d.tasks.push(
      task({
        id: 'k',
        durationMin: 500,
        split: { maxSessionMin: 240, maxPerDayMin: 360, minSessionMin: 30 },
        sessions: [
          session('a', '2026-09-01T09:00', '2026-09-01T13:00'),
          session('b', '2026-09-02T09:00', '2026-09-02T13:00'),
        ],
      }),
    );
    const [t] = planTasks(d, fromLocal('2026-08-31T20:00'));
    const lengths = t.sessions.map(sessionMinutes);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(500);
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(30);
  });

  it('a task without a place never ends up under a trip, and the day gets no new warnings', () => {
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Dinner');
    Object.assign(d.routines[0], {
      location: 'Home',
      preferredStart: '20:00',
      windowStart: '18:30',
      windowEnd: '23:30',
      durationMin: 90,
    });
    d.places.push({ id: 'b', name: 'Bakke', aliases: [] });
    d.routes.push({ id: 'r', a: d.places[0].id, b: 'b', minutes: 15, bidirectional: true });
    d.events = [
      {
        id: 'skate',
        title: 'Public Skate',
        category: 'cca',
        start: '2026-11-20T17:15',
        end: '2026-11-20T18:15',
        location: 'Bakke',
      },
    ];
    d.tasks = [
      task({ id: 'a5', durationMin: 60, deadline: '2026-11-20T23:59' }),
      task({ id: 'video', durationMin: 60, deadline: '2026-11-29T23:59' }),
    ];
    const now = fromLocal('2026-11-20T17:30');
    const tasks = planTasks(d, now);
    const occs = expand({ ...d, tasks }, fromLocal('2026-11-20'), fromLocal('2026-11-30')).filter((o) => !o.skipped);
    const overlapping = occs.filter(
      (o) =>
        o.source.type === 'task' &&
        occs.some(
          (x) => x !== o && x.start < o.end && o.start < x.end && !(x.source.type === 'travel' && x.id.includes(o.id)),
        ),
    );
    expect(overlapping).toHaveLength(0);
    expect(occs.filter((o) => o.warning)).toHaveLength(0);
  });
});
