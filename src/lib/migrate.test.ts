import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { DATA_VERSION, isKairosData, normalize } from './migrate';
import { sampleData } from '../test/fixtures';

describe('loading older data', () => {
  it('turns old skips (which used to hide sessions) into deletes', () => {
    const old: Partial<AppData> = { ...sampleData(), version: 1 };
    delete old.trash;
    old.classes![0].skipDates = ['2026-09-02'];
    const d = normalize(old);
    expect(d.classes[0].skipDates).toEqual([]);
    expect(d.classes[0].deletedDates).toEqual(['2026-09-02']);
    expect(d.trash).toEqual([]);
    expect(d.version).toBe(DATA_VERSION);
  });

  it('upgrades a single weekday to a list of days', () => {
    const old = sampleData();
    const c = old.classes[0] as unknown as Record<string, unknown>;
    delete c.days;
    c.weekday = 2;
    expect(normalize(old).classes[0].days).toEqual([2]);
  });

  it('leaves current data as it is', () => {
    const d = sampleData();
    d.classes[0].skipDates = ['2026-09-02'];
    expect(normalize(d).classes[0].skipDates).toEqual(['2026-09-02']);
  });

  it('turns an old single task slot into a session', () => {
    const old = sampleData() as unknown as Record<string, unknown> & { tasks: Record<string, unknown>[] };
    old.version = 2;
    old.tasks = [
      {
        id: 't',
        title: 'HW',
        category: 'homework',
        durationMin: 60,
        onCalendar: true,
        done: false,
        createdAt: '2026-08-30T00:00',
        pinned: true,
        scheduled: { start: '2026-09-01T09:00', end: '2026-09-01T10:00' },
      },
    ];
    const [t] = normalize(old as unknown as AppData).tasks;
    expect(t.sessions).toHaveLength(1);
    expect(t.sessions[0]).toMatchObject({
      start: '2026-09-01T09:00',
      end: '2026-09-01T10:00',
      pinned: true,
      done: false,
    });
    expect('scheduled' in t).toBe(false);
  });
});

describe('importing a file', () => {
  it('accepts a Kairos backup', () => {
    expect(isKairosData(sampleData())).toBe(true);
    expect(isKairosData(JSON.parse(JSON.stringify(sampleData())))).toBe(true);
  });

  it('refuses other JSON, which would otherwise replace everything with nothing', () => {
    expect(isKairosData({ name: 'my-package', version: '1.0.0' })).toBe(false);
    expect(isKairosData(null)).toBe(false);
    expect(isKairosData([])).toBe(false);
    expect(isKairosData({ tasks: 5 })).toBe(false);
    expect(isKairosData({ tasks: [1, 2] })).toBe(false);
    expect(isKairosData({ tasks: [], settings: 'x' })).toBe(false);
  });
});
