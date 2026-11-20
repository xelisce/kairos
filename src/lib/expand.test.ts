import { describe, expect, it } from 'vitest';
import { defaultData } from './defaults';
import { expand } from './expand';
import { fromLocal } from './time';
import { SEMESTER_PRESETS, parseWeeks, semesterFromPreset } from './weeks';
import { sampleData } from '../test/fixtures';

const day = (dk: string) => [fromLocal(dk), fromLocal(`${dk}T23:59`)] as const;

describe('classes', () => {
  it('run only in their weeks and skip recess', () => {
    const occs = expand(sampleData(), fromLocal('2026-08-31'), fromLocal('2026-12-07')).filter(
      (o) => o.source.type === 'class',
    );
    // Odd weeks 1,3,5,7,9,11,13; week 7 comes after recess (19 Oct).
    expect(occs).toHaveLength(7);
    expect(occs.map((o) => o.start.getDate())).toContain(19);
  });

  it('follow the UW–Madison Fall 2026 calendar (MWF, 2 Sep – 9 Dec, no Labor Day or Thanksgiving)', () => {
    const d = defaultData();
    d.routines = [];
    d.semesters = [semesterFromPreset(SEMESTER_PRESETS[0], 's')];
    d.modules = [{ id: 'm', semesterId: 's', code: 'CS 642', name: 'x', color: '#000' }];
    d.classes = [
      {
        id: 'c',
        moduleId: 'm',
        kind: 'Lecture',
        days: [0, 2, 4],
        start: '09:30',
        end: '10:45',
        weeks: parseWeeks('1-15'),
        skipDates: [],
        overrides: {},
        kindOverrides: {},
      },
    ];
    const occs = expand(d, fromLocal('2026-08-24'), fromLocal('2026-12-31'));
    expect(occs[0].start.getDate()).toBe(2);
    expect([occs.at(-1)!.start.getMonth(), occs.at(-1)!.start.getDate()]).toEqual([11, 9]);
    const dates = occs.map((o) => `${o.start.getMonth() + 1}/${o.start.getDate()}`);
    expect(dates).not.toContain('9/7');
    expect(dates).not.toContain('11/27');
    // 45 MWF slots minus Mon 31 Aug, Labor Day, Fri 27 Nov, Fri 11 Dec.
    expect(occs).toHaveLength(41);
  });

  it('one session can become a quiz', () => {
    const d = sampleData();
    d.classes[0].kindOverrides['2026-08-31'] = 'Quiz';
    const [c] = expand(d, ...day('2026-08-31')).filter((o) => o.source.type === 'class');
    expect(c.title).toContain('Quiz');
    expect(c.assessment).toBe(true);
  });
});

describe('skip vs delete', () => {
  it('skipped: still shown, but not busy (no travel, routines use the time); deleted: gone', () => {
    const d = sampleData();
    d.classes[0].skipDates = ['2026-08-31'];
    let occs = expand(d, ...day('2026-08-31'));
    expect(occs.find((o) => o.source.type === 'class')!.skipped).toBe(true);
    expect(occs.some((o) => o.source.type === 'travel')).toBe(false);
    const lunch = occs.find((o) => o.title === 'Lunch')!;
    expect([lunch.start.getHours(), lunch.start.getMinutes()]).toEqual([12, 30]); // usual time, over the skipped class

    d.classes[0].skipDates = [];
    d.classes[0].deletedDates = ['2026-08-31'];
    occs = expand(d, ...day('2026-08-31'));
    expect(occs.some((o) => o.source.type === 'class')).toBe(false);
  });
});

describe('CCAs and events', () => {
  it('a weekly CCA runs on its days within its date range', () => {
    const d = sampleData();
    d.places.push({ id: 'eh', name: 'Engineering Hall', aliases: [] });
    d.activities.push({
      id: 'a',
      title: 'Robotics',
      recurring: true,
      days: [0, 2, 3],
      start: '18:00',
      end: '20:00',
      location: 'Engineering Hall',
      color: '#000',
      until: '2026-09-09',
      skipDates: [],
      overrides: {},
    });
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-14'));
    expect(occs.filter((o) => o.source.type === 'activity').map((o) => o.start.getDate())).toEqual([31, 2, 3, 7, 9]);
    expect(occs.some((o) => o.source.type === 'travel' && o.title.includes('Engineering Hall'))).toBe(true);
  });

  it('a booked-session CCA has no weekly blocks; its sessions take its color', () => {
    const d = sampleData();
    d.activities.push({
      id: 'h',
      title: 'Hoofers',
      recurring: false,
      days: [0, 1, 2, 3, 4],
      start: '14:00',
      end: '16:00',
      color: '#123456',
      skipDates: [],
      overrides: {},
    });
    d.events.push({
      id: 'e',
      title: 'Hoofers',
      category: 'cca',
      activityId: 'h',
      start: '2026-09-02T14:00',
      end: '2026-09-02T16:00',
    });
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-07'));
    expect(occs.filter((o) => o.source.type === 'activity')).toHaveLength(0);
    expect(occs.find((o) => o.id === 'event:e')!.color).toBe('#123456');
  });

  it('details apply to one session only; events show their first notes line', () => {
    const d = sampleData();
    d.activities.push({
      id: 'a',
      title: 'Robotics',
      recurring: true,
      days: [0, 2],
      start: '18:00',
      end: '20:00',
      color: '#000',
      skipDates: [],
      overrides: {},
      details: { '2026-09-02': 'Full team meeting' },
    });
    d.events.push({
      id: 'e',
      title: 'Hoofers',
      category: 'cca',
      start: '2026-09-03T14:00',
      end: '2026-09-03T16:00',
      notes: 'Guest talk\nbring jacket',
    });
    const occs = expand(d, fromLocal('2026-08-31'), fromLocal('2026-09-07'));
    expect(occs.filter((o) => o.source.type === 'activity').map((o) => o.detail)).toEqual([
      undefined,
      'Full team meeting',
    ]);
    expect(occs.find((o) => o.id === 'event:e')!.detail).toBe('Guest talk');
  });
});
