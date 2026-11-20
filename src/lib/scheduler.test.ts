import { describe, expect, it } from 'vitest';
import { defaultData } from './defaults';
import { expand } from './expand';
import { planTasks, taskWarning, taskWindow } from './scheduler';
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

describe('planning sessions yourself (auto-planning off)', () => {
  it('nothing is added or moved, even a missed session; the rest shows as not planned yet', () => {
    const d = sampleData();
    d.tasks.push(
      task({
        id: 't',
        durationMin: 120,
        autoPlan: false,
        deadline: '2026-09-10T23:59',
        sessions: [session('s', '2026-08-31T08:00', '2026-08-31T09:00')],
      }),
    );
    const now = fromLocal('2026-09-01T09:00');
    const [t] = planTasks(d, now);
    expect(t.sessions.map((s) => s.start)).toEqual(['2026-08-31T08:00']);
    expect(t.rolledForward).toBeFalsy();
    expect(taskWarning(t, now, 48)?.text).toBe('1h not planned yet');
  });
});

describe('a task window that runs past midnight (09:00 to 02:00)', () => {
  const overnight = () => {
    const d = sampleData();
    d.routines = [];
    Object.assign(d.settings, { dayStart: '09:00', dayEnd: '02:00', bufferMin: 0 });
    return d;
  };

  it('understands the end as the next day', () => {
    expect(taskWindow({ dayStart: '09:00', dayEnd: '02:00' })).toEqual({ start: 540, end: 1560, shift: 120 });
    expect(taskWindow({ dayStart: '08:00', dayEnd: '22:00' })).toEqual({ start: 480, end: 1320, shift: 0 });
  });

  it('plans late in the evening, even across midnight', () => {
    const d = overnight();
    d.tasks.push(task({ id: 't', durationMin: 60 }));
    const [s] = planTasks(d, fromLocal('2026-08-31T23:30'))[0].sessions;
    expect(s.start).toBe('2026-08-31T23:30');
    expect(s.end).toBe('2026-09-01T00:30');
  });

  it('uses the time after midnight, but nothing after 02:00', () => {
    const d = overnight();
    d.tasks.push(task({ id: 't', durationMin: 60 }));
    expect(planTasks(d, fromLocal('2026-09-01T00:40'))[0].sessions[0].start).toBe('2026-09-01T00:40');
    expect(planTasks(d, fromLocal('2026-09-01T01:30'))[0].sessions[0].start).toBe('2026-09-01T09:00');
  });
});

describe('tasks any time of day', () => {
  const anyTime = () => {
    const d = sampleData();
    d.routines = [];
    Object.assign(d.settings, { dayStart: '09:00', dayEnd: '17:00', anyTime: true, bufferMin: 0 });
    return d;
  };

  it('ignores the hours, and may cross midnight', () => {
    const d = anyTime();
    d.tasks.push(task({ id: 't', durationMin: 60 }));
    const [s] = planTasks(d, fromLocal('2026-08-31T23:30'))[0].sessions;
    expect([s.start, s.end]).toEqual(['2026-08-31T23:30', '2026-09-01T00:30']);
  });

  it('still keeps out of sleep', () => {
    const d = anyTime();
    d.routines = defaultData().routines.filter((r) => r.title === 'Sleep');
    Object.assign(d.routines[0], { flexible: false, preferredStart: '23:30', durationMin: 480 });
    d.tasks.push(task({ id: 't', durationMin: 60 }));
    const [s] = planTasks(d, fromLocal('2026-08-31T23:00'))[0].sessions;
    expect(fromLocal(s.start) >= fromLocal('2026-09-01T07:30')).toBe(true);
  });
});

describe('tasks that depend on others', () => {
  const milestones = () => {
    const d = sampleData();
    d.routines = [];
    d.settings.bufferMin = 0;
    // Milestone 3 is due first, but needs Milestone 2 done before it.
    d.tasks.push(
      task({ id: 'm3', title: 'Milestone 3', durationMin: 60, deadline: '2026-09-03T23:59', dependsOn: ['m2'] }),
      task({
        id: 'm2',
        title: 'Milestone 2',
        durationMin: 120,
        deadline: '2026-09-05T23:59',
        earliest: '2026-09-01T14:00',
      }),
    );
    return d;
  };

  it('are only scheduled after what they depend on', () => {
    const tasks = planTasks(milestones(), fromLocal('2026-08-31T09:00'));
    const [m2] = tasks.find((t) => t.id === 'm2')!.sessions;
    const [m3] = tasks.find((t) => t.id === 'm3')!.sessions;
    expect(m2.start).toBe('2026-09-01T14:00');
    expect(fromLocal(m3.start) >= fromLocal(m2.end)).toBe(true);
  });

  it('move when what they depend on moves later', () => {
    const d = milestones();
    d.tasks.find((t) => t.id === 'm3')!.sessions = [session('early', '2026-08-31T15:00', '2026-08-31T16:00')];
    const tasks = planTasks(d, fromLocal('2026-08-31T09:00'));
    const [m3] = tasks.find((t) => t.id === 'm3')!.sessions;
    expect(m3.id).not.toBe('early');
    expect(fromLocal(m3.start) >= fromLocal('2026-09-01T16:00')).toBe(true);
  });

  it('wait for nothing once it is done', () => {
    const d = milestones();
    d.tasks.find((t) => t.id === 'm2')!.done = true;
    const [m3] = planTasks(d, fromLocal('2026-08-31T09:00')).find((t) => t.id === 'm3')!.sessions;
    expect(m3.start).toBe('2026-08-31T09:00');
  });

  it('say so in the list', () => {
    const d = milestones();
    d.tasks.find((t) => t.id === 'm2')!.onCalendar = false;
    const m3 = d.tasks.find((t) => t.id === 'm3')!;
    expect(taskWarning(m3, fromLocal('2026-08-31T09:00'), 48, d.tasks)?.text).toBe(
      'Waiting on Milestone 2 (not planned yet)',
    );
  });
});
