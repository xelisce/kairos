import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { DATA_VERSION, normalize } from './migrate';
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
});
