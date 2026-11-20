// Auto-scheduler: finds time for tasks that are "on calendar".
// A task is one or more sessions (see Task.split). Sessions you placed, finished ones, and
// ones that just passed (waiting to be ticked) stay put. Other planned sessions keep their
// slot while it still works; the rest of the task's time gets new sessions, earliest first.
//
// Tasks may use time a flexible routine (lunch, dinner...) was using, as long as that
// routine can still fit somewhere in its window. Tasks with a location need their trips
// to fit too: a candidate is checked by laying out that day with the session in it.
import { addDays, addMinutes, format, startOfDay } from 'date-fns';
import type { AppData, Occ, Task, TaskSession } from '../types';
import { expand } from './expand';
import { limitsOf, plannedMinutes, sessionMinutes, unplannedMinutes } from './tasks';
import { atMin, dateKey, eachDay, fmtDur, fromLocal, hmToMin, overlaps, toLocal, uid } from './time';

// Try every 5 minutes so a session can start right after a trip or another block.
const STEP = 5;
/** How many full day-layouts we try per session before settling for the first free gap. */
const MAX_CHECKS = 80;

/**
 * A missed auto-scheduled session waits this long after its end before rolling forward,
 * so there's time to tick it done. Re-plan moves it right away.
 */
export const ROLL_OVER_AFTER_MIN = 5 * 60;

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

const hasPassed = (s: TaskSession, now: Date) => fromLocal(s.end) <= now;
const rollOverTime = (s: TaskSession) => addMinutes(fromLocal(s.end), ROLL_OVER_AFTER_MIN);
/** A session the scheduler may move: planned automatically, not done, still ahead. */
const mayMove = (s: TaskSession, now: Date) => !s.done && !s.pinned && !hasPassed(s, now);

/** Returns a new tasks array. Pure: does not mutate `data`. */
export function planTasks(data: AppData, now: Date): Task[] {
  const horizon = addDays(startOfDay(now), data.settings.horizonDays);
  const tasks = data.tasks.map((t) => ({ ...t, sessions: t.sessions.map((s) => ({ ...s })) }));

  for (const t of tasks) {
    if (!t.onCalendar) {
      // Off the calendar: forget planned sessions, keep the record of finished ones.
      t.sessions = t.sessions.filter((s) => s.done);
      continue;
    }
    if (t.done) continue;
    // Missed auto-scheduled sessions roll forward (gently, no guilt), 5h after they ended.
    // Sessions you placed yourself stay where you put them, even in the past.
    const rolled = t.sessions.filter((s) => !s.done && !s.pinned && rollOverTime(s) <= now);
    if (rolled.length) {
      t.sessions = t.sessions.filter((s) => !rolled.includes(s));
      t.rolledForward = true;
    }
  }

  const active = tasks.filter((t) => t.onCalendar && !t.done);
  const movableIds = new Set(active.flatMap((t) => t.sessions.filter((s) => mayMove(s, now)).map((s) => s.id)));
  const base: Occ[] = expand({ ...data, tasks }, now, horizon, { excludeSessionIds: movableIds });
  // Hard blocks: everything except skipped sessions and routines that can slide out of the way.
  const busy: Interval[] = base.filter((o) => !o.skipped && !o.auto).map((o) => ({ start: o.start, end: o.end }));

  // Lay out one day with the current sessions. Cached per day; cleared when a session lands there.
  const dayCache = new Map<string, number>();
  const layout = (day: Date, list: Task[]) =>
    expand({ ...data, tasks: list }, startOfDay(day), addDays(startOfDay(day), 1));
  const baseline = (day: Date) => {
    const k = dateKey(day);
    if (!dayCache.has(k)) dayCache.set(k, warningsOn(layout(day, tasks)));
    return dayCache.get(k)!;
  };

  /** Would a new session of `t` at `slot` work? Its trips fit, nothing overlaps it, no new warnings that day. */
  const fits = (t: Task, slot: Interval) => {
    const trialSession: TaskSession = {
      id: 'trial',
      start: toLocal(slot.start),
      end: toLocal(slot.end),
      done: false,
      pinned: false,
    };
    const trial = tasks.map((x) => (x.id === t.id ? { ...x, sessions: [...x.sessions, trialSession] } : x));
    const occs = layout(slot.start, trial);
    const id = `task:${t.id}:trial`;
    const others = occs.filter((o) => o.id !== id && !o.skipped && !isTravel(o));
    // Nothing may sit on top of it (a routine that couldn't move away would),
    // and you can't do it while travelling somewhere else.
    if (others.some((o) => overlaps(slot.start, slot.end, o.start, o.end))) return false;
    if (occs.some((o) => isTravel(o) && !o.id.includes(id) && overlaps(slot.start, slot.end, o.start, o.end)))
      return false;
    // Its own trips must not cut into anything else.
    const myTrips = occs.filter((o) => isTravel(o) && o.id.includes(id));
    if (myTrips.some((tr) => tr.warning || others.some((o) => overlaps(tr.start, tr.end, o.start, o.end))))
      return false;
    return warningsOn(occs, id) <= baseline(slot.start);
  };

  /** First slot of `length` in [from, until) that fits; after MAX_CHECKS checks, the first free gap. */
  const findSlot = (t: Task, length: number, from: Date, until: Date): Interval | null => {
    let firstFree: Interval | null = null;
    let checks = 0;
    for (const c of candidates(data, busy, length, from, until)) {
      firstFree ??= c;
      if (checks++ >= MAX_CHECKS) break;
      if (fits(t, c)) return c;
    }
    return firstFree;
  };

  const minutesOnDay = (t: Task, day: Date) =>
    t.sessions.filter((s) => dateKey(fromLocal(s.start)) === dateKey(day)).reduce((n, s) => n + sessionMinutes(s), 0);

  /** Add sessions to `t` in [from, until) until its time is covered, within its limits. */
  const placeSessions = (t: Task, from: Date, until: Date) => {
    const limits = limitsOf(t);
    for (const day of eachDay(from, until)) {
      const dayFrom = day < from ? from : day;
      const dayUntil = addDays(day, 1) < until ? addDays(day, 1) : until;
      for (;;) {
        const remaining = unplannedMinutes(t);
        if (remaining <= 0) return;
        const length = Math.min(limits.maxSessionMin, remaining, limits.maxPerDayMin - minutesOnDay(t, day));
        // Too little room today for a useful session (a final small bit is fine).
        if (length <= 0 || (length < limits.minSessionMin && length < remaining)) break;
        const slot = findSlot(t, length, dayFrom, dayUntil);
        if (!slot) break;
        t.sessions.push({ id: uid(), start: toLocal(slot.start), end: toLocal(slot.end), done: false, pinned: false });
        busy.push(slot);
        dayCache.delete(dateKey(slot.start));
      }
    }
  };

  // Pass 1: keep planned sessions that still work; drop the rest (their time gets re-planned).
  for (const t of active) {
    const limits = limitsOf(t);
    const stillWorks = (s: TaskSession) => {
      if (!mayMove(s, now)) return true;
      const start = fromLocal(s.start);
      const end = fromLocal(s.end);
      const ok =
        !busy.some((b) => overlaps(start, end, b.start, b.end)) &&
        !(t.deadline && end > fromLocal(t.deadline)) &&
        !(t.earliest && start < fromLocal(t.earliest)) &&
        sessionMinutes(s) <= limits.maxSessionMin;
      if (ok) busy.push({ start, end });
      return ok;
    };
    t.sessions = t.sessions.filter(stillWorks);
    // Task got shorter: drop the latest movable sessions until it fits.
    const latestFirst = t.sessions.filter((s) => mayMove(s, now)).sort((a, b) => b.start.localeCompare(a.start));
    while (plannedMinutes(t) > t.durationMin && latestFirst.length) {
      const last = latestFirst.shift()!;
      t.sessions = t.sessions.filter((s) => s !== last);
    }
  }
  dayCache.clear();

  // Pass 2: earliest deadline first, then oldest.
  const start = ceilTo(now, STEP);
  const byDeadline = (a: Task, b: Task) => {
    const da = a.deadline ? fromLocal(a.deadline).getTime() : Infinity;
    const db = b.deadline ? fromLocal(b.deadline).getTime() : Infinity;
    return da - db || a.createdAt.localeCompare(b.createdAt);
  };
  for (const t of [...active].sort(byDeadline)) {
    if (unplannedMinutes(t) <= 0) continue;
    const from = t.earliest && fromLocal(t.earliest) > start ? fromLocal(t.earliest) : start;
    const deadline = t.deadline ? fromLocal(t.deadline) : null;
    placeSessions(t, from, deadline && deadline < horizon ? deadline : horizon);
    // Not enough room before the deadline: keep going after it; the calendar flags those red.
    if (unplannedMinutes(t) > 0 && deadline && deadline < horizon) placeSessions(t, deadline, horizon);
  }
  return tasks;
}

/** Status shown next to a task in lists. */
export function taskWarning(t: Task, now: Date, warnHours: number): { level: 'bad' | 'warn'; text: string } | null {
  if (t.done) return null;
  const dl = t.deadline ? fromLocal(t.deadline) : null;
  if (dl && dl < now) return { level: 'bad', text: 'Deadline passed' };
  const open = t.sessions.filter((s) => !s.done);
  if (t.onCalendar && dl && open.some((s) => fromLocal(s.end) > dl)) {
    return { level: 'bad', text: 'Scheduled after deadline' };
  }
  const unplanned = unplannedMinutes(t);
  if (t.onCalendar && unplanned > 0) {
    return { level: 'bad', text: t.sessions.length ? `${fmtDur(unplanned)} still needs a slot` : 'No free slot found' };
  }
  const passed = open.filter((s) => hasPassed(s, now));
  if (t.onCalendar && passed.length) {
    const auto = passed.filter((s) => !s.pinned);
    return auto.length
      ? {
          level: 'warn',
          text: `Time passed: mark done, or it moves forward at ${format(rollOverTime(auto[0]), 'HH:mm')}`,
        }
      : { level: 'warn', text: 'Time passed: mark done, or let auto-schedule move it' };
  }
  if (dl && !t.onCalendar && dl.getTime() - now.getTime() < warnHours * 3600_000) {
    return { level: 'warn', text: 'Due soon, not scheduled' };
  }
  return null;
}
