// The Taskline: one semester's tasks laid out left to right. Each task is a bar from its start
// ("not before", else the day it was added) to its deadline, with a dot per session.
// Everything here is scoped to one semester, so a semester can later be exported on its own (v7).
import { addDays, endOfWeek, startOfDay } from 'date-fns';
import type { AppData, Semester, Task } from '../types';
import { ASSESSMENT_EVENTS, CATEGORY_COLORS } from './labels';
import { fromLocal } from './time';
import { doneMinutes, sortedSessions } from './tasks';

export type GroupBy = 'course' | 'time';
/** Tasks that aren't under one of this semester's courses, shown only if you tick them. */
export type Extra = 'cca' | 'personal' | 'admin' | 'other';
export const EXTRA_LABELS: Record<Extra, string> = {
  cca: 'CCAs',
  personal: 'Personal',
  admin: 'Admin',
  other: 'Other',
};

export interface TasklineOpts {
  groupBy: GroupBy;
  showDone: boolean;
  extras: Extra[];
}

export interface Dot {
  sessionId: string;
  start: Date;
  end: Date;
  state: 'planned' | 'done' | 'missed';
  /** After the deadline (and not done). */
  late: boolean;
}

export interface Bar {
  task: Task;
  from: Date;
  to: Date;
  deadline?: Date;
  dots: Dot[];
  doneMin: number;
  color: string;
  /** Course code or CCA name, shown when grouped by time. */
  tag?: string;
}

export interface Marker {
  id: string;
  title: string;
  date: Date;
}

export interface Group {
  id: string;
  title: string;
  color?: string;
  /** Exams, quizzes and presentations (drawn as ◆ on the group's row). */
  markers: Marker[];
  bars: Bar[];
}

export function semesterRange(sem: Semester) {
  const start = startOfDay(fromLocal(sem.startDate));
  return { start, end: addDays(start, sem.layout.length * 7) };
}

/** The semester you're in, else the next one, else the latest. */
export function currentSemester(data: AppData, now: Date): Semester | undefined {
  const sems = [...data.semesters].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    sems.find((s) => {
      const r = semesterRange(s);
      return r.start <= now && now < r.end;
    }) ??
    sems.find((s) => semesterRange(s).start > now) ??
    sems[sems.length - 1]
  );
}

function barFor(data: AppData, t: Task, now: Date): Bar {
  const mod = t.moduleId ? data.modules.find((m) => m.id === t.moduleId) : undefined;
  const act = !mod && t.activityId ? data.activities.find((a) => a.id === t.activityId) : undefined;
  const deadline = t.deadline ? fromLocal(t.deadline) : undefined;
  const dots: Dot[] = sortedSessions(t).map((s) => {
    const start = fromLocal(s.start);
    const end = fromLocal(s.end);
    const done = s.done || t.done;
    return {
      sessionId: s.id,
      start,
      end,
      state: done ? 'done' : end <= now ? 'missed' : 'planned',
      late: !done && !!deadline && end > deadline,
    };
  });
  const begin = startOfDay(fromLocal(t.earliest ?? t.createdAt));
  const times = [begin, ...(deadline ? [deadline] : []), ...dots.flatMap((d) => [d.start, d.end])];
  const from = new Date(Math.min(...times.map(Number)));
  let to = new Date(Math.max(...times.map(Number)));
  if (to.getTime() - from.getTime() < 86_400_000) to = addDays(from, 1);
  return {
    task: t,
    from,
    to,
    deadline,
    dots,
    doneMin: doneMinutes(t),
    color: mod?.color ?? act?.color ?? CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.other,
    tag: mod?.code ?? act?.title,
  };
}

/** Which extra toggle a task belongs to, or null if it's under a course (of any semester). */
const extraOf = (t: Task): Extra | null =>
  t.moduleId ? null : t.activityId ? 'cca' : t.category === 'homework' ? 'other' : t.category;

const byDeadline = (a: Bar, b: Bar) =>
  (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || a.from.getTime() - b.from.getTime();

export function tasklineGroups(data: AppData, sem: Semester, opts: TasklineOpts, now: Date): Group[] {
  const range = semesterRange(sem);
  const mods = data.modules.filter((m) => m.semesterId === sem.id).sort((a, b) => a.code.localeCompare(b.code));
  const modIds = new Set(mods.map((m) => m.id));
  const shown = data.tasks.filter((t) => {
    if (t.done && !opts.showDone) return false;
    const extra = extraOf(t);
    if (extra === null ? !modIds.has(t.moduleId!) : !opts.extras.includes(extra)) return false;
    return true;
  });
  const bars = shown
    .map((t) => barFor(data, t, now))
    .filter((b) => b.from < range.end && range.start < b.to)
    .sort(byDeadline);

  if (opts.groupBy === 'time') return timeGroups(bars, now);

  const groups: Group[] = mods.map((m) => ({
    id: m.id,
    title: m.code,
    color: m.color,
    markers: data.events
      .filter((e) => e.moduleId === m.id && ASSESSMENT_EVENTS.includes(e.category))
      .map((e) => ({ id: e.id, title: e.title, date: fromLocal(e.start) }))
      .filter((mk) => mk.date >= range.start && mk.date < range.end),
    bars: bars.filter((b) => b.task.moduleId === m.id),
  }));
  for (const act of data.activities) {
    const mine = bars.filter((b) => !b.task.moduleId && b.task.activityId === act.id);
    if (mine.length) groups.push({ id: act.id, title: act.title, color: act.color, markers: [], bars: mine });
  }
  for (const extra of ['personal', 'admin', 'other'] as const) {
    const mine = bars.filter((b) => extraOf(b.task) === extra);
    if (mine.length) groups.push({ id: extra, title: EXTRA_LABELS[extra], markers: [], bars: mine });
  }
  return groups.filter((g) => g.bars.length || g.markers.length);
}

/** Overdue / this week / next week / later / no deadline / done. */
function timeGroups(bars: Bar[], now: Date): Group[] {
  const thisWeek = endOfWeek(now, { weekStartsOn: 1 });
  const nextWeek = addDays(thisWeek, 7);
  const bucket = (b: Bar) => {
    if (b.task.done) return 'done';
    if (!b.deadline) return 'none';
    if (b.deadline < now) return 'overdue';
    if (b.deadline <= thisWeek) return 'week';
    if (b.deadline <= nextWeek) return 'next';
    return 'later';
  };
  const titles = {
    overdue: 'Overdue',
    week: 'Due this week',
    next: 'Due next week',
    later: 'Later',
    none: 'No deadline',
    done: 'Done',
  };
  return (Object.keys(titles) as (keyof typeof titles)[])
    .map((k) => ({ id: k, title: titles[k], markers: [], bars: bars.filter((b) => bucket(b) === k) }))
    .filter((g) => g.bars.length);
}
