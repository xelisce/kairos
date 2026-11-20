import { describe, expect, it } from 'vitest';
import { merge3 } from './merge';
import { sampleData, session, task } from '../test/fixtures';

describe('merging two windows’ changes', () => {
  const base = () => {
    const d = sampleData();
    d.events = [{ id: 'e', title: 'Public Skate', category: 'cca', start: '2026-11-20T17:15', end: '2026-11-20T18:15' }];
    d.tasks = [task({ id: 't', sessions: [session('s', '2026-11-21T09:00', '2026-11-21T10:00')] })];
    return d;
  };

  it('a skip here survives the other window re-planning a task', () => {
    const b = base();
    const here = structuredClone(b);
    here.events[0].skipped = true;
    const there = structuredClone(b);
    there.tasks[0].sessions[0] = session('s', '2026-11-21T11:00', '2026-11-21T12:00');
    const m = merge3(b, here, there);
    expect(m.events[0].skipped).toBe(true);
    expect(m.tasks[0].sessions[0].start).toBe('2026-11-21T11:00');
  });

  it('keeps things added on both sides, and deletes stay deleted', () => {
    const b = base();
    const here = structuredClone(b);
    here.events.push({ id: 'x', title: 'Quiz', category: 'quiz', start: '2026-11-23T10:00', end: '2026-11-23T11:00' });
    const there = structuredClone(b);
    there.events = [{ id: 'y', title: 'Hangout', category: 'hangout', start: '2026-11-24T19:00', end: '2026-11-24T21:00' }];
    expect(merge3(b, here, there).events.map((e) => e.id)).toEqual(['x', 'y']);
  });

  it('skipped dates from both windows add up', () => {
    const b = base();
    const here = structuredClone(b);
    here.classes[0].skipDates = ['2026-09-02'];
    const there = structuredClone(b);
    there.classes[0].skipDates = ['2026-09-04'];
    expect(merge3(b, here, there).classes[0].skipDates).toEqual(['2026-09-02', '2026-09-04']);
  });

  it('if both changed the same thing, this window wins', () => {
    const b = base();
    const here = structuredClone(b);
    here.events[0].title = 'Skate (here)';
    const there = structuredClone(b);
    there.events[0].title = 'Skate (there)';
    expect(merge3(b, here, there).events[0].title).toBe('Skate (here)');
  });
});
