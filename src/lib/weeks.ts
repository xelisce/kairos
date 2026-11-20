import { differenceInCalendarDays } from 'date-fns';
import type { Semester, SemesterStyle, WeekLabel } from '../types';
import { fromLocal } from './time';

/**
 * Parse a week pattern like "3-13", "odd", "even 2-12", "1,3,5-7", "all".
 * `maxWeek` bounds "all"/"odd"/"even" when no range is given.
 */
export function parseWeeks(input: string, maxWeek = 13, allowParity = true): number[] {
  const s = input.toLowerCase().trim();
  if (!s) return [];
  let parity: 'odd' | 'even' | null = null;
  const nums = new Set<number>();
  let hadNumbers = false;
  for (const raw of s.split(/[,\s]+/)) {
    const tok = raw.trim();
    if (!tok) continue;
    if (tok === 'odd' || tok === 'even') {
      if (!allowParity)
        throw new Error(
          'Odd/even weeks are only for NUS-style semesters. Use ranges like "1-15" or lists like "1,3,5".',
        );
      parity = tok;
      continue;
    }
    if (tok === 'all') {
      for (let i = 1; i <= maxWeek; i++) nums.add(i);
      hadNumbers = true;
      continue;
    }
    const m = tok.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Can't read "${tok}". Try "3-13", "odd", "1,3,5-7".`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) nums.add(i);
    hadNumbers = true;
  }
  if (!hadNumbers) for (let i = 1; i <= maxWeek; i++) nums.add(i);
  let out = [...nums].sort((x, y) => x - y);
  if (parity) out = out.filter((n) => (parity === 'odd' ? n % 2 === 1 : n % 2 === 0));
  return out;
}

/** Compact display: [1,2,3,5] -> "1-3, 5"; [1,3,5,...,13] -> "odd 1-13". */
export function formatWeeks(weeks: number[], allowParity = true): string {
  if (!weeks.length) return 'no weeks';
  const w = [...weeks].sort((a, b) => a - b);
  if (allowParity && w.length >= 3 && w.every((n, i) => i === 0 || n - w[i - 1] === 2)) {
    return `${w[0] % 2 ? 'odd' : 'even'} ${w[0]}-${w[w.length - 1]}`;
  }
  const parts: string[] = [];
  let start = w[0];
  let prev = w[0];
  for (let i = 1; i <= w.length; i++) {
    const n = w[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = n;
  }
  return parts.join(', ');
}

/** "1-6, Recess, 7-13, Reading, Exam, Exam" -> WeekLabel[] */
export function parseLayout(input: string): WeekLabel[] {
  const out: WeekLabel[] = [];
  for (const raw of input.split(',')) {
    const tok = raw.trim();
    if (!tok) continue;
    const m = tok.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (m) {
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      for (let i = a; i <= b; i++) out.push({ type: 'teaching', n: i });
    } else {
      out.push({ type: 'break', name: tok });
    }
  }
  return out;
}

export function formatLayout(layout: WeekLabel[]): string {
  const parts: string[] = [];
  let runStart: number | null = null;
  let runEnd: number | null = null;
  const flush = () => {
    if (runStart !== null) parts.push(runStart === runEnd ? `${runStart}` : `${runStart}-${runEnd}`);
    runStart = runEnd = null;
  };
  for (const w of layout) {
    if (w.type === 'teaching') {
      if (runEnd !== null && w.n === runEnd + 1) runEnd = w.n;
      else {
        flush();
        runStart = runEnd = w.n;
      }
    } else {
      flush();
      parts.push(w.name);
    }
  }
  flush();
  return parts.join(', ');
}

/** Day-combination shortcuts for US-style schedules. */
export const DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: 'MWF', days: [0, 2, 4] },
  { label: 'MW', days: [0, 2] },
  { label: 'MF', days: [0, 4] },
  { label: 'TR', days: [1, 3] },
  { label: 'MTWR', days: [0, 1, 2, 3] },
];

/** UW-style short day names: M T W R F S U */
export const US_DAY_LETTERS = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];
export const formatDays = (days: number[], style: SemesterStyle) =>
  style === 'us'
    ? [...days]
        .sort()
        .map((d) => US_DAY_LETTERS[d])
        .join('')
    : [...days]
        .sort()
        .map((d) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d])
        .join('/');

export const LAYOUT_PRESETS: { name: string; layout: string }[] = [
  { name: 'NUS (13 weeks + recess)', layout: '1-6, Recess, 7-13, Reading, Exam, Exam' },
  { name: 'UW–Madison (15 weeks + finals)', layout: '1-15, Finals' },
];

/** Ready-made semesters with real dates. Double-check holidays against the official calendar. */
export const SEMESTER_PRESETS: {
  name: string;
  style: SemesterStyle;
  startDate: string;
  layout: string;
  holidays: { date: string; name: string }[];
  source: string;
}[] = [
  {
    // registrar.wisc.edu: instruction Sep 2, Thanksgiving Nov 26-29, last class Dec 9, study day Dec 10, finals Dec 11-17
    name: 'UW–Madison Fall 2026',
    style: 'us',
    startDate: '2026-08-31',
    layout: '1-15, Finals',
    holidays: [
      { date: '2026-08-31', name: 'Before classes start' },
      { date: '2026-09-01', name: 'Before classes start' },
      { date: '2026-09-07', name: 'Labor Day' },
      { date: '2026-11-26', name: 'Thanksgiving' },
      { date: '2026-11-27', name: 'Thanksgiving' },
      { date: '2026-12-10', name: 'Study day' },
      { date: '2026-12-11', name: 'Finals start' },
    ],
    source: 'https://registrar.wisc.edu/dates/',
  },
  {
    // nus.edu.sg/registrar: Sem 2 starts Jan 11 2027, recess Feb 22-28, reading Apr 19-23, exams Apr 24 - May 8
    name: 'NUS AY26/27 Sem 2',
    style: 'nus',
    startDate: '2027-01-11',
    layout: '1-6, Recess, 7-13, Reading, Exam, Exam',
    holidays: [{ date: '2027-03-26', name: 'Good Friday' }],
    source: 'https://nus.edu.sg/registrar/docs/default-source/calendar/ay2026-2027.pdf',
  },
];

/** Index of the semester week containing `day`, or null if outside. */
export function weekIndex(sem: Semester, day: Date): number | null {
  const diff = differenceInCalendarDays(day, fromLocal(sem.startDate));
  if (diff < 0) return null;
  const idx = Math.floor(diff / 7);
  return idx < sem.layout.length ? idx : null;
}

export function weekLabelText(w: WeekLabel): string {
  return w.type === 'teaching' ? `Week ${w.n}` : `${w.name} Week`;
}

/** What academic week is `day` in, across all semesters? */
export function academicWeekFor(sems: Semester[], day: Date): { sem: Semester; label: WeekLabel } | null {
  for (const sem of sems) {
    const i = weekIndex(sem, day);
    if (i !== null) return { sem, label: sem.layout[i] };
  }
  return null;
}

export const maxTeachingWeek = (sem?: Semester) =>
  sem ? Math.max(1, ...sem.layout.map((w) => (w.type === 'teaching' ? w.n : 0))) : 13;

export function semesterFromPreset(p: (typeof SEMESTER_PRESETS)[number], id: string): Semester {
  return {
    id,
    name: p.name,
    style: p.style,
    startDate: p.startDate,
    layout: parseLayout(p.layout),
    holidays: [...p.holidays],
  };
}

export interface DayMarker {
  label: string;
  kind: 'break' | 'exam';
}

/**
 * Is this day special? Single-day holidays (Thanksgiving, Labor Day, Study day)
 * win over week labels (Recess Week, Finals Week). Exam/finals days are 'exam'.
 */
export function dayMarker(sems: Semester[], day: Date): DayMarker | null {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  const dk = `${y}-${m}-${d}`;
  const kindOf = (s: string): DayMarker['kind'] => (/exam|final/i.test(s) ? 'exam' : 'break');
  for (const sem of sems) {
    const h = sem.holidays.find((x) => x.date === dk);
    if (h) return { label: h.name, kind: kindOf(h.name) };
  }
  for (const sem of sems) {
    const i = weekIndex(sem, day);
    if (i === null) continue;
    const w = sem.layout[i];
    if (w.type === 'break') return { label: weekLabelText(w), kind: kindOf(w.name) };
  }
  return null;
}
