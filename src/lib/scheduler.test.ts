import { describe, expect, it } from 'vitest';
import { defaultData } from './defaults';
import { expand } from './expand';
import { planTasks } from './scheduler';
import { fromLocal } from './time';
import { sampleData } from '../test/fixtures';

describe('auto-scheduling tasks', () => {
  it('places a task before its deadline with nothing on top of it', () => {
    const d = sampleData();
    d.tasks.push({
      id: 't',
      title: 'HW',
      category: 'homework',
      durationMin: 120,
      deadline: '2026-09-02T23:59',
      onCalendar: true,
      pinned: false,
      done: false,
      createdAt: '2026-08-30T00:00',
    });
    const tasks = planTasks(d, fromLocal('2026-08-31T09:00'));
    const slot = tasks[0].scheduled!;
    expect(fromLocal(slot.end) <= fromLocal('2026-09-02T23:59')).toBe(true);
    const final = expand({ ...d, tasks }, fromLocal('2026-08-31'), fromLocal('2026-09-03'));
    const onTop = final.filter(
      (o) => o.id !== 'task:t' && !o.skipped && o.start < fromLocal(slot.end) && fromLocal(slot.start) < o.end,
    );
    expect(onTop).toHaveLength(0);
    expect(final.filter((o) => o.warning)).toHaveLength(0);
  });

  it('rolls missed auto-scheduled tasks forward', () => {
    const d = sampleData();
    d.tasks.push({
      id: 't',
      title: 'HW',
      category: 'homework',
      durationMin: 60,
      onCalendar: true,
      pinned: false,
      done: false,
      createdAt: '2026-08-30T00:00',
      scheduled: { start: '2026-08-31T08:00', end: '2026-08-31T09:00' },
    });
    const [t] = planTasks(d, fromLocal('2026-08-31T10:00'));
    expect(t.rolledForward).toBe(true);
    expect(fromLocal(t.scheduled!.start) >= fromLocal('2026-08-31T10:00')).toBe(true);
  });

  it('leaves a task you placed by hand where it is, even in the past', () => {
    const d = sampleData();
    const slot = { start: '2026-11-19T15:00', end: '2026-11-19T17:00' };
    d.tasks.push({
      id: 'k',
      title: 'Code Kairos',
      category: 'personal',
      durationMin: 120,
      onCalendar: true,
      pinned: true,
      done: false,
      createdAt: '2026-11-19T17:20',
      scheduled: slot,
    });
    const t = planTasks(d, fromLocal('2026-11-19T17:23')).find((x) => x.id === 'k')!;
    expect(t.scheduled).toEqual(slot);
    expect(t.rolledForward).toBeFalsy();
  });

  it('may use a flexible routine’s time, and plans the trip for a task with a location', () => {
    const d = defaultData();
    d.routines = d.routines.filter((r) => r.title === 'Dinner');
    Object.assign(d.routines[0], {
      location: 'Home',
      preferredStart: '18:30',
      windowStart: '18:30',
      windowEnd: '23:30',
    });
    d.places.push({ id: 'w', name: 'Memorial Union', aliases: ['Wheelhouse Studios'] });
    d.tasks = [
      {
        id: 'k',
        title: 'Code Kairos',
        category: 'personal',
        durationMin: 190,
        onCalendar: true,
        pinned: true,
        done: false,
        createdAt: '2026-11-19T15:00',
        scheduled: { start: '2026-11-19T15:30', end: '2026-11-19T18:40' },
      },
      {
        id: 'g',
        title: 'Glaze',
        category: 'personal',
        durationMin: 30,
        onCalendar: true,
        pinned: false,
        done: false,
        createdAt: '2026-11-19T15:00',
        location: 'Wheelhouse Studios',
      },
    ];
    const tasks = planTasks(d, fromLocal('2026-11-19T17:27'));
    const glaze = tasks.find((t) => t.id === 'g')!.scheduled!;
    const occs = expand({ ...d, tasks }, fromLocal('2026-11-19'), fromLocal('2026-11-20'));
    expect(fromLocal(glaze.start) < fromLocal('2026-11-19T20:00')).toBe(true);
    expect(occs.filter((o) => o.warning)).toHaveLength(0);
    expect(occs.find((o) => o.title === 'Dinner')!.start >= fromLocal(glaze.end)).toBe(true);
  });
});
