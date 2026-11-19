// Auto-scheduler: finds slots for tasks that are "on calendar" and not pinned.
// Stable by default: a task keeps its slot unless that slot is in the past,
// clashes with something, or is after the deadline when an earlier slot exists.
import { addDays, addMinutes, startOfDay } from 'date-fns';
import type { AppData, Occ, Task } from '../types';
import { expand } from './expand';
import { atMin, eachDay, fromLocal, hmToMin, overlaps, toLocal } from './time';

const STEP = 15;

const ceilTo = (d: Date, step: number) => {
  const ms = step * 60_000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
};

interface Interval { start: Date; end: Date }

function findSlot(data: AppData, busy: Interval[], durationMin: number, from: Date, until: Date): Interval | null {
  const { dayStart, dayEnd, bufferMin } = data.settings;
  const ds = hmToMin(dayStart);
  const de = hmToMin(dayEnd);
  for (const day of eachDay(from, until)) {
    for (let m = ds; m + durationMin <= de; m += STEP) {
      const s = atMin(day, m);
      if (s < from) continue;
      const e = addMinutes(s, durationMin);
      if (e > until) return null;
      const bs = addMinutes(s, -bufferMin);
      const be = addMinutes(e, bufferMin);
      if (!busy.some((b) => overlaps(bs, be, b.start, b.end))) return { start: s, end: e };
    }
  }
  return null;
}

export interface PlanOptions {
  /** Reflow every unpinned task instead of keeping existing slots. */
  fromScratch?: boolean;
}

/** Returns a new tasks array. Pure: does not mutate `data`. */
export function planTasks(data: AppData, now: Date, opts: PlanOptions = {}): Task[] {
  const horizon = addDays(startOfDay(now), data.settings.horizonDays);
  const tasks = data.tasks.map((t) => ({ ...t }));

  // Missed tasks roll forward (gently, no guilt): unpin them and give them a new slot.
  for (const t of tasks) {
    if (t.onCalendar && !t.done && t.scheduled && fromLocal(t.scheduled.end) < now) {
      t.scheduled = undefined;
      t.pinned = false;
      t.rolledForward = true;
    }
    if (!t.onCalendar) { t.scheduled = undefined; t.pinned = false; }
  }

  const movable = tasks.filter((t) => t.onCalendar && !t.done && !t.pinned);
  const exclude = new Set(movable.map((t) => t.id));
  const base: Occ[] = expand({ ...data, tasks }, now, horizon, { excludeTaskIds: exclude });
  const busy: Interval[] = base.map((o) => ({ start: o.start, end: o.end }));

  const start = ceilTo(now, STEP);
  const needsSlot: Task[] = [];

  // Pass 1: keep slots that are still fine.
  for (const t of movable) {
    if (!opts.fromScratch && t.scheduled) {
      const s = fromLocal(t.scheduled.start);
      const e = fromLocal(t.scheduled.end);
      const clash = busy.some((b) => overlaps(s, e, b.start, b.end));
      const late = t.deadline ? e > fromLocal(t.deadline) : false;
      const tooEarly = t.earliest ? s < fromLocal(t.earliest) : false;
      const wrongLength = Math.round((e.getTime() - s.getTime()) / 60000) !== t.durationMin;
      if (!clash && !late && !tooEarly && !wrongLength && s >= now) {
        busy.push({ start: s, end: e });
        continue;
      }
    }
    needsSlot.push(t);
  }

  // Pass 2: earliest deadline first, then oldest.
  needsSlot.sort((a, b) => {
    const da = a.deadline ? fromLocal(a.deadline).getTime() : Infinity;
    const db = b.deadline ? fromLocal(b.deadline).getTime() : Infinity;
    return da - db || a.createdAt.localeCompare(b.createdAt);
  });
  for (const t of needsSlot) {
    const from = t.earliest && fromLocal(t.earliest) > start ? fromLocal(t.earliest) : start;
    const deadline = t.deadline ? fromLocal(t.deadline) : null;
    let slot = findSlot(data, busy, t.durationMin, from, deadline && deadline < horizon ? deadline : horizon);
    // Nothing before the deadline: place it after anyway, the calendar will flag it red.
    if (!slot && deadline && deadline < horizon) slot = findSlot(data, busy, t.durationMin, from, horizon);
    t.scheduled = slot ? { start: toLocal(slot.start), end: toLocal(slot.end) } : undefined;
    if (slot) busy.push(slot);
  }
  return tasks;
}

/** Status shown next to a task in lists. */
export function taskWarning(t: Task, now: Date, warnHours: number): { level: 'bad' | 'warn'; text: string } | null {
  if (t.done) return null;
  const dl = t.deadline ? fromLocal(t.deadline) : null;
  if (dl && dl < now) return { level: 'bad', text: 'Deadline passed' };
  if (t.onCalendar && t.scheduled && dl && fromLocal(t.scheduled.end) > dl) return { level: 'bad', text: 'Scheduled after deadline' };
  if (t.onCalendar && !t.scheduled) return { level: 'bad', text: 'No free slot found' };
  if (dl && !t.onCalendar && dl.getTime() - now.getTime() < warnHours * 3600_000) return { level: 'warn', text: 'Due soon, not scheduled' };
  return null;
}
