import { describe, expect, it } from 'vitest';
import { defaultData } from './defaults';
import { expand } from './expand';
import { planTasks } from './scheduler';
import { fromLocal, overlaps } from './time';
import { sampleData, session, task } from '../test/fixtures';

describe('time away', () => {
  // Away for Thanksgiving: Wed 25 Nov 06:00 to Sun 29 Nov 23:00.
  const thanksgiving = () => {
    const d = defaultData();
    d.away = [{ id: 'tg', title: 'Thanksgiving', start: '2026-11-25T06:00', end: '2026-11-29T23:00' }];
    return d;
  };
  const [awayStart, awayEnd] = [fromLocal('2026-11-25T06:00'), fromLocal('2026-11-29T23:00')];
  const inAway = (o: { start: Date; end: Date }) => overlaps(o.start, o.end, awayStart, awayEnd);

  it('no tasks get planned in it; already planned ones move out', () => {
    const d = thanksgiving();
    d.tasks = [
      task({
        id: 'big',
        durationMin: 600,
        deadline: '2026-12-01T23:59',
        split: { maxSessionMin: 120, maxPerDayMin: 240, minSessionMin: 30 },
      }),
      task({ id: 'old', sessions: [session('o', '2026-11-26T10:00', '2026-11-26T11:00')] }),
    ];
    const tasks = planTasks(d, fromLocal('2026-11-24T20:00'));
    const sessions = tasks
      .flatMap((t) => t.sessions)
      .map((s) => ({ start: fromLocal(s.start), end: fromLocal(s.end) }));
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.filter(inAway)).toHaveLength(0);
  });

  it('routines are hidden while away, and fit around it at the edges', () => {
    const occs = expand(thanksgiving(), fromLocal('2026-11-24'), fromLocal('2026-11-30'));
    const routines = occs.filter((o) => o.source.type === 'routine');
    expect(routines.filter(inAway)).toHaveLength(0);
    expect(routines.filter((o) => o.title === 'Dinner' && o.start < awayStart)).toHaveLength(1);
    // Shower (18:00-01:00) still fits after you're back at 23:00 on Sunday.
    const sunShower = routines.find((o) => o.title === 'Shower' && o.id.endsWith('2026-11-29'));
    expect(sunShower && sunShower.start >= awayEnd).toBe(true);
  });

  it('classes in it are hidden (with their trips); events you added stay', () => {
    const d = sampleData();
    d.away = [{ id: 'a', title: '', start: '2026-08-31T00:00', end: '2026-08-31T23:59' }];
    d.events = [{ id: 'e', title: 'Flight', category: 'other', start: '2026-08-31T08:00', end: '2026-08-31T10:00' }];
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-01'));
    expect(occs.filter((o) => o.source.type === 'class' || o.source.type === 'travel')).toHaveLength(0);
    expect(occs.map((o) => o.title)).toContain('Flight');
  });
});
