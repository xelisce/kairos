// Auto-scheduler: finds slots for tasks that are "on calendar" and not pinned.
// Stable by default: a task keeps its slot unless that slot is in the past,
// clashes with something, or is after the deadline when an earlier slot exists.
//
// Tasks may use time a flexible routine (lunch, dinner...) was using, as long as that
// routine can still fit somewhere in its window. Tasks with a location need their trips
// to fit too: a candidate is checked by laying out that day with the task in it.
import { addDays, addMinutes, format, startOfDay } from 'date-fns';
import type { AppData, Occ, Task } from '../types';
import { expand } from './expand';
import { atMin, dateKey, eachDay, fromLocal, hmToMin, overlaps, toLocal } from './time';

// Try every 5 minutes so a task can start right after a trip or another block.
const STEP = 5;
/** How many full day-layouts we try per task before settling for the first free gap. */
const MAX_CHECKS = 80;

const ceilTo = (d: Date, step: number) => {
  const ms = step * 60_000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
};

interface Interval {
  start: Date;
  end: Date;
}

/** Free gaps of `durationMin` (with the buffer around them), earliest first. */
function* candidates(data: AppData, busy: Interval[], durationMin: number, from: Date, until: Date) {
  const { dayStart, dayEnd, bufferMin } = data.settings;
  const ds = hmToMin(dayStart);
  const de = hmToMin(dayEnd);
  for (const day of eachDay(from, until)) {
    for (let m = ds; m + durationMin <= de; m += STEP) {
      const s = atMin(day, m);
      if (s < from) continue;
      const e = addMinutes(s, durationMin);
      if (e > until) return;
      const bs = addMinutes(s, -bufferMin);
      const be = addMinutes(e, bufferMin);
      if (!busy.some((b) => overlaps(bs, be, b.start, b.end))) yield { start: s, end: e };
    }
  }
}

const isTravel = (o: Occ) => o.source.type === 'travel';

/** Problems on one day: warnings (routines squeezed out, trips too short...). */
const warningsOn = (occs: Occ[], skipId?: string) =>
  occs.filter((o) => o.warning && !o.skipped && o.id !== skipId).length;

/**
 * A missed auto-scheduled task waits this long after its end before rolling forward,
 * so there's time to tick it done. Re-plan moves it right away.
 */
export const ROLL_OVER_AFTER_MIN = 5 * 60;

const passed = (t: Task, now: Date) => !!t.scheduled && fromLocal(t.scheduled.end) <= now;
const rollOverTime = (t: Task) => addMinutes(fromLocal(t.scheduled!.end), ROLL_OVER_AFTER_MIN);

/** Returns a new tasks array. Pure: does not mutate `data`. */
export function planTasks(data: AppData, now: Date): Task[] {
  const horizon = addDays(startOfDay(now), data.settings.horizonDays);
  const tasks = data.tasks.map((t) => ({ ...t }));

  // Missed auto-scheduled tasks roll forward (gently, no guilt) to a new slot, 5h after they ended.
  // Tasks you placed yourself (pinned) stay where you put them, even in the past.
  for (const t of tasks) {
    if (t.onCalendar && !t.done && !t.pinned && passed(t, now) && rollOverTime(t) <= now) {
      t.scheduled = undefined;
      t.pinned = false;
      t.rolledForward = true;
    }
    if (!t.onCalendar) {
      t.scheduled = undefined;
      t.pinned = false;
    }
  }

  const movable = tasks.filter((t) => t.onCalendar && !t.done && !t.pinned);
  const exclude = new Set(movable.map((t) => t.id));
  const base: Occ[] = expand({ ...data, tasks }, now, horizon, { excludeTaskIds: exclude });
  // Hard blocks: everything except skipped sessions and routines that can slide out of the way.
  const busy: Interval[] = base.filter((o) => !o.skipped && !o.auto).map((o) => ({ start: o.start, end: o.end }));

  // Lay out one day with the current task slots. Cached per day; cleared when a task lands there.
  const dayCache = new Map<string, number>();
  const layout = (day: Date, list: Task[]) =>
    expand({ ...data, tasks: list }, startOfDay(day), addDays(startOfDay(day), 1));
  const baseline = (day: Date) => {
    const k = dateKey(day);
    if (!dayCache.has(k)) dayCache.set(k, warningsOn(layout(day, tasks)));
    return dayCache.get(k)!;
  };

  /** Would putting `t` at `slot` work? Its trips fit, nothing overlaps it, and no new warnings appear that day. */
  const fits = (t: Task, slot: Interval) => {
    const before = baseline(slot.start);
    const trial = tasks.map((x) =>
      x.id === t.id ? { ...x, scheduled: { start: toLocal(slot.start), end: toLocal(slot.end) } } : x,
    );
    const occs = layout(slot.start, trial);
    const id = `task:${t.id}`;
    const others = occs.filter((o) => o.id !== id && !o.skipped && !isTravel(o));
    // Nothing may sit on top of the task itself (a routine that couldn't move away would),
    // and you can't do it while travelling somewhere else.
    if (others.some((o) => overlaps(slot.start, slot.end, o.start, o.end))) return false;
    if (occs.some((o) => isTravel(o) && !o.id.includes(id) && overlaps(slot.start, slot.end, o.start, o.end)))
      return false;
    // Its own trips must not cut into anything else.
    const myTrips = occs.filter((o) => isTravel(o) && o.id.includes(id));
    if (myTrips.some((tr) => tr.warning || others.some((o) => overlaps(tr.start, tr.end, o.start, o.end))))
      return false;
    return warningsOn(occs, id) <= before;
  };

  /** First slot that fits; after MAX_CHECKS full checks, the first free gap. */
  const findSlot = (t: Task, from: Date, until: Date): Interval | null => {
    let firstFree: Interval | null = null;
    let checks = 0;
    for (const c of candidates(data, busy, t.durationMin, from, until)) {
      firstFree ??= c;
      if (checks++ >= MAX_CHECKS) break;
      if (fits(t, c)) return c;
    }
    return firstFree;
  };

  const start = ceilTo(now, STEP);
  const needsSlot: Task[] = [];

  // Pass 1: keep slots that are still fine (including ones that just passed and are waiting to be ticked).
  for (const t of movable) {
    if (passed(t, now)) continue;
    if (t.scheduled) {
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
  // Tasks being re-placed aren't anywhere until they get their new slot.
  for (const t of needsSlot) t.scheduled = undefined;
  dayCache.clear();

  // Pass 2: earliest deadline first, then oldest.
  needsSlot.sort((a, b) => {
    const da = a.deadline ? fromLocal(a.deadline).getTime() : Infinity;
    const db = b.deadline ? fromLocal(b.deadline).getTime() : Infinity;
    return da - db || a.createdAt.localeCompare(b.createdAt);
  });
  for (const t of needsSlot) {
    const from = t.earliest && fromLocal(t.earliest) > start ? fromLocal(t.earliest) : start;
    const deadline = t.deadline ? fromLocal(t.deadline) : null;
    let slot = findSlot(t, from, deadline && deadline < horizon ? deadline : horizon);
    // Nothing before the deadline: place it after anyway, the calendar will flag it red.
    if (!slot && deadline && deadline < horizon) slot = findSlot(t, from, horizon);
    t.scheduled = slot ? { start: toLocal(slot.start), end: toLocal(slot.end) } : undefined;
    if (slot) {
      busy.push(slot);
      dayCache.delete(dateKey(slot.start));
    }
  }
  return tasks;
}

/** Status shown next to a task in lists. */
export function taskWarning(t: Task, now: Date, warnHours: number): { level: 'bad' | 'warn'; text: string } | null {
  if (t.done) return null;
  const dl = t.deadline ? fromLocal(t.deadline) : null;
  if (dl && dl < now) return { level: 'bad', text: 'Deadline passed' };
  if (t.onCalendar && t.scheduled && dl && fromLocal(t.scheduled.end) > dl)
    return { level: 'bad', text: 'Scheduled after deadline' };
  if (t.onCalendar && !t.scheduled) return { level: 'bad', text: 'No free slot found' };
  if (t.onCalendar && t.pinned && passed(t, now))
    return { level: 'warn', text: 'Time passed: mark done, or let auto-schedule move it' };
  if (t.onCalendar && passed(t, now))
    return {
      level: 'warn',
      text: `Time passed: mark done, or it moves forward at ${format(rollOverTime(t), 'HH:mm')}`,
    };
  if (dl && !t.onCalendar && dl.getTime() - now.getTime() < warnHours * 3600_000)
    return { level: 'warn', text: 'Due soon, not scheduled' };
  return null;
}
