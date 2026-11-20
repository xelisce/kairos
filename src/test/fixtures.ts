// Shared test data and helpers.
import type { AppData } from '../types';
import { defaultData } from '../lib/defaults';
import { parseLayout, parseWeeks } from '../lib/weeks';

/**
 * A small NUS-style semester starting Mon 31 Aug 2026 (weeks 1-6, Recess, 7-13) with
 * one course: CS1 Lecture, Mondays 11:30-13:30 in odd weeks at "COM1-0204".
 * Home ↔ COM1 is 30 minutes. Only the Lunch routine (45m, 11:00-15:00).
 */
export function sampleData(): AppData {
  const d = defaultData();
  d.routines = d.routines.filter((r) => r.title === 'Lunch');
  d.semesters = [
    {
      id: 's',
      name: 'S',
      style: 'nus',
      startDate: '2026-08-31',
      layout: parseLayout('1-6, Recess, 7-13'),
      holidays: [],
    },
  ];
  d.modules = [{ id: 'm', semesterId: 's', code: 'CS1', name: 'x', color: '#000' }];
  d.classes = [
    {
      id: 'c',
      moduleId: 'm',
      kind: 'Lecture',
      days: [0],
      start: '11:30',
      end: '13:30',
      weeks: parseWeeks('odd'),
      location: 'COM1-0204',
      skipDates: [],
      overrides: {},
      kindOverrides: {},
    },
  ];
  d.places.push({ id: 'p', name: 'COM1', aliases: [] });
  d.routes.push({ id: 'r', a: d.places[0].id, b: 'p', minutes: 30, bidirectional: true });
  return d;
}

/** Minutes since midnight, for readable time assertions. */
export const clock = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const hm = (h: number, m = 0) => h * 60 + m;
export const lengthMin = (o: { start: Date; end: Date }) => (o.end.getTime() - o.start.getTime()) / 60000;
