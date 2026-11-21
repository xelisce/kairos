import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFY, notifyOf, planNotes } from './notifications';
import type { NotifySettings } from '../types';
import { sampleData, task } from '../test/fixtures';
import { fmtTime } from './time';

// Mon 31 Aug 2026 (week 1): CS1 Lecture 11:30-13:30 at COM1, 30 min from home.
const DAY = new Date(2026, 7, 31);
const NEXT = new Date(2026, 8, 1);
const settings = (over: Partial<NotifySettings> = {}): NotifySettings => ({
  ...DEFAULT_NOTIFY,
  routines: { ...DEFAULT_NOTIFY.routines, meal: false },
  ...over,
});
const times = (notes: { at: Date }[]) => notes.map((n) => fmtTime(n.at));

describe('notifications', () => {
  it('say when to leave, and skip the class reminder when you were told to leave for it', () => {
    const notes = planNotes(sampleData(), DAY, NEXT, settings());
    const leave = notes.filter((n) => n.kind === 'leave');
    // Going there (heads-up + now), then home after.
    expect(leave.length).toBeGreaterThanOrEqual(3);
    expect(leave[0].title).toBe('🚶 Leave in 10 min for COM1');
    expect(leave[1].title).toBe('🚶 Leave now for COM1');
    expect(leave[1].at.getTime() - leave[0].at.getTime()).toBe(10 * 60_000);
    expect(notes.some((n) => n.kind === 'class')).toBe(false);

    const withClass = planNotes(sampleData(), DAY, NEXT, settings({ classSkipIfLeave: false }));
    const cls = withClass.find((n) => n.kind === 'class');
    expect(cls && fmtTime(cls.at)).toBe('11:20');
    expect(cls?.body).toContain('11:30–13:30');
  });

  it('give the class reminder when there is no trip to it', () => {
    const d = sampleData();
    d.classes[0].location = undefined;
    const notes = planNotes(d, DAY, NEXT, settings());
    expect(times(notes.filter((n) => n.kind === 'class'))).toEqual(['11:20']);
    expect(notes.some((n) => n.kind === 'leave')).toBe(false);
  });

  it('say nothing about a skipped session', () => {
    const d = sampleData();
    d.classes[0].location = undefined;
    d.classes[0].skipDates = ['2026-08-31'];
    expect(planNotes(d, DAY, NEXT, settings()).filter((n) => n.kind === 'class')).toEqual([]);
  });

  it('remind about an exam before it and the evening before', () => {
    const d = sampleData();
    d.classes[0].location = undefined;
    d.classes[0].kindOverrides = { '2026-08-31': 'Exam' };
    const notes = planNotes(d, new Date(2026, 7, 30), NEXT, settings());
    const exam = notes.filter((n) => n.kind === 'exam');
    expect(exam.map((n) => [n.at.getDate(), fmtTime(n.at)])).toEqual([
      [30, '20:00'],
      [31, '11:15'],
    ]);
    expect(exam[0].title).toMatch(/^Tomorrow: .*CS1 Exam/);
  });

  it('ask whether a session is done when it ends, only when that is on', () => {
    const d = sampleData();
    d.classes = [];
    d.tasks = [
      task({
        id: 'essay',
        sessions: [{ id: 's1', start: '2026-08-31T15:00', end: '2026-08-31T16:00', done: false, pinned: true }],
      }),
      task({
        id: 'old',
        done: true,
        sessions: [{ id: 's2', start: '2026-08-31T17:00', end: '2026-08-31T18:00', done: true, pinned: true }],
      }),
    ];
    expect(times(planNotes(d, DAY, NEXT, settings()).filter((n) => n.kind === 'session'))).toEqual(['15:00']);
    const end = planNotes(d, DAY, NEXT, settings({ sessionEnd: true })).find((n) => n.title.startsWith('✅'));
    expect(end && fmtTime(end.at)).toBe('16:00');
    expect(end?.session).toEqual({ taskId: 'essay', sessionId: 's1' });
  });

  it('remind about deadlines of tasks not done yet', () => {
    const d = sampleData();
    d.classes = [];
    d.tasks = [
      task({ id: 'hw', onCalendar: false, deadline: '2026-09-01T23:59' }),
      task({ id: 'fin', done: true, deadline: '2026-09-01T23:59' }),
    ];
    const notes = planNotes(d, DAY, new Date(2026, 8, 2), settings()).filter((n) => n.kind === 'deadline');
    expect(notes.map((n) => [n.title, n.at.getDate(), fmtTime(n.at)])).toEqual([
      ['⏰ hw is due in 24 h', 31, '23:59'],
      ['⏰ hw is due in 2 h', 1, '21:59'],
    ]);
    expect(notes[0].body).toBe('Due tomorrow at 23:59');
  });

  it('tell you about a flight a day before, a bus 2 hours before, and not a stay', () => {
    const d = sampleData();
    d.classes = [];
    d.away = [
      {
        id: 'a',
        title: 'Trip',
        start: '2026-09-02T06:00',
        end: '2026-09-05T23:00',
        plans: [
          { id: 'f', kind: 'flight', title: 'UA 1 MSN → SFO', start: '2026-09-02T09:40', where: 'Terminal 1' },
          { id: 'b', kind: 'bus', title: '', start: '2026-09-02T06:30' },
          { id: 's', kind: 'stay', title: 'Hotel', start: '2026-09-02T15:00' },
        ],
      },
    ];
    const notes = planNotes(d, DAY, new Date(2026, 8, 3), settings()).filter((n) => n.kind === 'plan');
    expect(notes.map((n) => [n.title, n.at.getDate(), fmtTime(n.at), n.body])).toEqual([
      ['✈️ UA 1 MSN → SFO', 1, '09:40', 'Tomorrow at 09:40 · Terminal 1'],
      ['🚌 Bus', 2, '04:30', 'Today at 06:30'],
    ]);
  });

  it('send nothing in quiet hours', () => {
    const d = sampleData();
    d.classes = [];
    d.tasks = [task({ id: 'hw', onCalendar: false, deadline: '2026-09-01T23:59' })];
    const notes = planNotes(
      d,
      DAY,
      new Date(2026, 8, 2),
      settings({ quiet: true, quietStart: '23:00', quietEnd: '07:00' }),
    );
    expect(times(notes.filter((n) => n.kind === 'deadline'))).toEqual(['21:59']);
  });

  it('put things a few minutes apart in one notification', () => {
    const d = sampleData();
    d.classes = [];
    d.tasks = [
      task({
        id: 'a',
        sessions: [{ id: 's1', start: '2026-08-31T15:00', end: '2026-08-31T16:00', done: false, pinned: true }],
      }),
      task({ id: 'b', onCalendar: false, deadline: '2026-09-01T15:03' }),
    ];
    const notes = planNotes(d, DAY, NEXT, settings({ deadlineHours: [24, 0] }));
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('🔔 2 things coming up');
    expect(notes[0].body).toBe('📝 a\n⏰ b is due in 24 h');
  });

  it('keep the app and website settings apart, with defaults for the rest', () => {
    const s = { notifications: { app: { leaveMin: 5, routines: { chores: true } } as never } };
    expect(notifyOf(s, 'app').leaveMin).toBe(5);
    expect(notifyOf(s, 'app').routines).toEqual({ ...DEFAULT_NOTIFY.routines, chores: true });
    expect(notifyOf(s, 'web')).toEqual(DEFAULT_NOTIFY);
  });
});
