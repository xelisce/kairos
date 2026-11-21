// Auto-scheduler: finds time for tasks that are "on calendar".
// A task is one or more sessions (see Task.split). Sessions you placed, finished ones, and
// ones that just passed (waiting to be ticked) stay put. Other planned sessions keep their
// slot while it still works; the rest of the task's time gets new sessions, earliest first.
//
// Tasks may use time a flexible routine (lunch, dinner...) was using, as long as that
// routine can still fit somewhere in its window. Tasks with a location need their trips
// to fit too: a candidate is checked by laying out that day with the session in it.
import { addDays, addMinutes, format, startOfDay } from 'date-fns';
import type { AppData, Occ, Settings, Task, TaskSession } from '../types';
import { awayIntervals } from './away';
import { expand } from './expand';
import { blockersOf, planOrder, readyAfter } from './dependencies';
import { doneMinutes, limitsOf, plannedMinutes, sessionMinutes, unplannedMinutes } from './tasks';
import { atMin, dateKey, eachDay, fmtDur, fromLocal, hmToMin, overlaps, toLocal, uid } from './time';

// Try every 5 minutes so a session can start right after a trip or another block.
const STEP = 5;
/** Full day-layout checks allowed per task per planning run (keeps planning fast). */
const MAX_CHECKS_PER_TASK = 400;
/** After a candidate fails, the next one checked is at least this much later (unless a new gap starts). */
const CHECK_SPACING_MIN = 15;
/** How many times the finished plan is checked and fixed. */
const MAX_REPAIR_ROUNDS = 3;

/**
 * A missed auto-scheduled session waits this long after its end before rolling forward,
 * so there's time to tick it done. Re-plan moves it right away.
 */
const ROLL_OVER_AFTER_MIN = 5 * 60;

const ceilTo = (d: Date, step: number) => {
  const ms = step * 60_000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
};

interface Interval {
  start: Date;
  end: Date;
}

/**
 * When tasks may go, in minutes after midnight. An end at or before the start is on the next
 * day (09:00 to 02:00 is 540 to 1560). `shift`: where one planning day ends and the next starts
 * (02:00 there; midnight when the window doesn't cross it), so a late night counts as the day before.
 * "Any time": the whole day, so only what's on the calendar (sleep, classes...) limits tasks.
 */
export function taskWindow({ dayStart, dayEnd, anyTime }: Pick<Settings, 'dayStart' | 'dayEnd' | 'anyTime'>) {
  if (anyTime) return { start: 0, end: 24 * 60, shift: 0 };
  const start = hmToMin(dayStart);
  let end = hmToMin(dayEnd);
  if (end <= start) end += 24 * 60;
  return { start, end, shift: Math.max(0, end - 24 * 60) };
}

/**
 * Free gaps of `durationMin` (with the buffer around them), earliest first: starting in
 * [from, startBefore) and ending by `until`.
 */
function* candidates(data: AppData, busy: Interval[], durationMin: number, from: Date, startBefore: Date, until: Date) {
  const { bufferMin } = data.settings;
  const { start: ds, end: de } = taskWindow(data.settings);
  // The window covers the whole day: a session may start late and end after it.
  const wholeDay = de - ds >= 24 * 60;
  // Only blocks that could touch this search, so each step checks a handful, not all of them.
  const lo = addMinutes(from, -bufferMin - 24 * 60);
  const hi = addMinutes(until, bufferMin);
  const near = busy.filter((b) => b.end > lo && b.start < hi);
  // Start a day early: last night's window may still be open after midnight.
  for (const day of eachDay(addDays(from, -1), startBefore)) {
    for (let m = ds; wholeDay ? m < de : m + durationMin <= de; m += STEP) {
      const s = atMin(day, m);
      if (s < from) continue;
      if (s >= startBefore) return;
      const e = addMinutes(s, durationMin);
      if (e > until) return;
      const bs = addMinutes(s, -bufferMin);
      const be = addMinutes(e, bufferMin);
      const blocker = near.find((b) => overlaps(bs, be, b.start, b.end));
      if (!blocker) {
        yield { start: s, end: e };
        continue;
      }
      // Skip the steps this block still covers (they'd all be blocked by it).
      const clearAt = (blocker.end.getTime() + bufferMin * 60_000 - atMin(day, 0).getTime()) / 60_000;
      const next = ds + Math.ceil((clearAt - ds) / STEP) * STEP;
      if (next > m + STEP) m = next - STEP;
    }
  }
}

const isTravel = (o: Occ) => o.source.type === 'travel';
const minutesIntoDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Latest time of day (minutes) that a routine window from the evening before still runs to; 0 if none crosses midnight. */
function overnightRoutineEnd(data: AppData) {
  let latest = 0;
  for (const r of data.routines) {
    if (!r.enabled) continue;
    const ws = hmToMin(r.windowStart);
    const we = hmToMin(r.windowEnd);
    if (we <= ws) latest = Math.max(latest, we);
  }
  return latest;
}

/** Problems on one day: warnings (routines squeezed out, trips too short...). */
const warningsOn = (occs: Occ[], skipId?: string) =>
  occs.filter((o) => o.warning && !o.skipped && o.id !== skipId).length;

const hasPassed = (s: TaskSession, now: Date) => fromLocal(s.end) <= now;
const rollOverTime = (s: TaskSession) => addMinutes(fromLocal(s.end), ROLL_OVER_AFTER_MIN);
/** A session the scheduler may move: planned automatically, not done, still ahead. */
const mayMove = (s: TaskSession, now: Date) => !s.done && !s.pinned && !hasPassed(s, now);
/** Auto-scheduled: on the calendar, not done, and you haven't turned auto-planning off for it. */
const autoPlanned = (t: Task) => t.onCalendar && !t.done && t.autoPlan !== false;

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
    // Done, or you plan its sessions yourself: leave them exactly as they are.
    if (t.done || t.autoPlan === false) continue;
    // Missed auto-scheduled sessions roll forward (gently, no guilt), 5h after they ended.
    // Sessions you placed yourself stay where you put them, even in the past.
    const rolled = t.sessions.filter((s) => !s.done && !s.pinned && rollOverTime(s) <= now);
    if (rolled.length) {
      t.sessions = t.sessions.filter((s) => !rolled.includes(s));
      t.rolledForward = true;
    }
  }

  const active = tasks.filter(autoPlanned);
  const movableIds = new Set(movableSessionIds(tasks, now));
  const busy: Interval[] = hardBlocks({ ...data, tasks }, now, horizon, movableIds);
  /** A session that was blocking its time is gone: free that time. */
  const unblock = (s: TaskSession) => {
    const i = busy.findIndex((b) => b.start.getTime() === fromLocal(s.start).getTime());
    if (i >= 0) busy.splice(i, 1);
  };

  // Lay out the day(s) a slot touches with the current sessions: the day(s) it's on (two when it
  // crosses midnight), plus the day before when it's early enough to be in last night's routines
  // (a shower until 01:00, sleep until 11:30). Warning counts are cached per range.
  const overnightEnd = overnightRoutineEnd(data);
  const daysOf = (slot: Interval) => {
    const first = startOfDay(slot.start);
    const from = minutesIntoDay(slot.start) < overnightEnd ? addDays(first, -1) : first;
    return { from, to: addDays(startOfDay(addMinutes(slot.end, -1)), 1) };
  };
  const dayCache = new Map<string, { from: Date; to: Date; n: number }>();
  const layout = (slot: Interval, list: Task[]) => {
    const { from, to } = daysOf(slot);
    return expand({ ...data, tasks: list }, from, to);
  };
  const baseline = (slot: Interval) => {
    const { from, to } = daysOf(slot);
    const k = `${dateKey(from)}|${dateKey(to)}`;
    if (!dayCache.has(k)) dayCache.set(k, { from, to, n: warningsOn(layout(slot, tasks)) });
    return dayCache.get(k)!.n;
  };
  /** A session landed on `slot`: forget the counts for every range it touches. */
  const forgetDays = (slot: Interval) => {
    const { from, to } = daysOf(slot);
    for (const [k, r] of dayCache) if (r.from < to && from < r.to) dayCache.delete(k);
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
    const occs = layout(slot, trial);
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
    return warningsOn(occs, id) <= baseline(slot);
  };

  const checksUsed = new Map<string, number>();
  /**
   * First slot of `length` starting in [from, startBefore) and ending by `until` that really
   * works (see `fits`), or null.
   * Checks the start of every free gap, then every 15 minutes within it.
   */
  const findSlot = (t: Task, length: number, from: Date, startBefore: Date, until: Date): Interval | null => {
    let lastChecked: Date | null = null;
    let previous: Date | null = null;
    for (const c of candidates(data, busy, length, from, startBefore, until)) {
      const newGap = !previous || c.start.getTime() - previous.getTime() > STEP * 60_000;
      previous = c.start;
      if (!newGap && lastChecked && c.start.getTime() - lastChecked.getTime() < CHECK_SPACING_MIN * 60_000) continue;
      const used = checksUsed.get(t.id) ?? 0;
      if (used >= MAX_CHECKS_PER_TASK) return null;
      checksUsed.set(t.id, used + 1);
      lastChecked = c.start;
      if (fits(t, c)) return c;
    }
    return null;
  };

  // Planning days run from `shift` to `shift` (02:00 to 02:00 for a 09:00-02:00 window), so a
  // session at 00:30 counts towards the day before for the per-day limit.
  const { shift } = taskWindow(data.settings);
  const planDay = (d: Date) => dateKey(addMinutes(d, -shift));
  const minutesOnDay = (t: Task, day: Date) =>
    t.sessions.filter((s) => planDay(fromLocal(s.start)) === dateKey(day)).reduce((n, s) => n + sessionMinutes(s), 0);

  /** Add sessions to `t` in [from, until) until its time is covered, within its limits. */
  const placeSessions = (t: Task, from: Date, until: Date) => {
    const limits = limitsOf(t);
    for (const day of eachDay(addMinutes(from, -shift), until)) {
      const begin = atMin(day, shift);
      const end = atMin(day, 24 * 60 + shift);
      const dayFrom = begin < from ? from : begin;
      const dayUntil = end < until ? end : until;
      if (dayFrom >= dayUntil) continue;
      for (;;) {
        const remaining = unplannedMinutes(t);
        if (remaining <= 0) return;
        let length = Math.min(limits.maxSessionMin, remaining, limits.maxPerDayMin - minutesOnDay(t, day));
        // Too little room today for a useful session (a final small bit is fine).
        if (length <= 0 || (length < limits.minSessionMin && length < remaining)) break;
        // Don't leave a leftover shorter than the minimum: make this one shorter so the last one is long enough.
        const leftover = remaining - length;
        if (leftover > 0 && leftover < limits.minSessionMin) {
          const shorter = length - (limits.minSessionMin - leftover);
          if (shorter >= limits.minSessionMin) length = shorter;
        }
        // It may run past the end of the day (into the night), just not past `until`.
        const slot = findSlot(t, length, dayFrom, dayUntil, until);
        if (!slot) break;
        t.sessions.push({ id: uid(), start: toLocal(slot.start), end: toLocal(slot.end), done: false, pinned: false });
        busy.push(slot);
        forgetDays(slot);
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
        sessionMinutes(s) <= limits.maxSessionMin &&
        // Too short, unless it's all that's left of the task.
        (sessionMinutes(s) >= limits.minSessionMin || t.durationMin - doneMinutes(t) <= limits.minSessionMin);
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
    // Only a too-short bit left to plan: re-plan the latest session together with it,
    // so it can be split into two proper sessions instead.
    const left = unplannedMinutes(t);
    const latest = latestFirst[0];
    if (left > 0 && left < limits.minSessionMin && latest && t.sessions.includes(latest)) {
      t.sessions = t.sessions.filter((s) => s !== latest);
      unblock(latest);
    }
  }
  dayCache.clear();

  // Pass 2: earliest deadline first, then oldest; a task always after the ones it depends on.
  const start = ceilTo(now, STEP);
  const byDeadline = (a: Task, b: Task) => {
    const da = a.deadline ? fromLocal(a.deadline).getTime() : Infinity;
    const db = b.deadline ? fromLocal(b.deadline).getTime() : Infinity;
    return da - db || a.createdAt.localeCompare(b.createdAt);
  };
  const placeTask = (t: Task) => {
    // Waits for the tasks it depends on (they're planned first): sessions before they end move.
    const after = readyAfter(t, tasks);
    if (after) {
      const early = t.sessions.filter((s) => mayMove(s, now) && fromLocal(s.start) < after);
      t.sessions = t.sessions.filter((s) => !early.includes(s));
      for (const s of early) {
        unblock(s);
        forgetDays({ start: fromLocal(s.start), end: fromLocal(s.end) });
      }
    }
    if (unplannedMinutes(t) <= 0) return;
    let from = t.earliest && fromLocal(t.earliest) > start ? fromLocal(t.earliest) : start;
    if (after && after > from) from = ceilTo(after, STEP);
    const deadline = t.deadline ? fromLocal(t.deadline) : null;
    placeSessions(t, from, deadline && deadline < horizon ? deadline : horizon);
    // Not enough room before the deadline: keep going after it; the calendar flags those red.
    if (unplannedMinutes(t) > 0 && deadline && deadline < horizon) placeSessions(t, deadline, horizon);
  };
  for (const t of planOrder(active, byDeadline)) placeTask(t);

  // Pass 3: sessions were checked one at a time, so together they can still clash (one makes dinner
  // move earlier, and the trip home then lands on another). Check the finished layout; re-place any
  // auto session that overlaps something, a few rounds at most.
  for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
    const final = expand({ ...data, tasks }, now, horizon);
    const clashing = clashingSessions(final, tasks, now);
    // A day with more warnings than it has without its auto sessions (dinner pushed late, a trip
    // that makes you late...): move one auto session from that day (or that night, until last
    // night's routines are over) somewhere else: the one that can wait longest.
    const autoIds = new Set(movableSessionIds(tasks, now));
    const without = expand({ ...data, tasks }, now, horizon, { excludeSessionIds: autoIds });
    const overnightEnd = overnightRoutineEnd(data);
    const deadlineOf = new Map(active.map((t) => [t.id, t.deadline ? fromLocal(t.deadline).getTime() : Infinity]));
    for (const dk of daysWithMoreWarnings(final, without)) {
      const dayStart = fromLocal(dk);
      const nightEnd = addMinutes(addDays(dayStart, 1), overnightEnd);
      const onThatDay = final.filter(
        (o) => o.source.type === 'task' && autoIds.has(o.source.sessionId) && o.start >= dayStart && o.start < nightEnd,
      );
      const pick = onThatDay.sort((x, y) => {
        const dx = x.source.type === 'task' ? (deadlineOf.get(x.source.taskId) ?? Infinity) : Infinity;
        const dy = y.source.type === 'task' ? (deadlineOf.get(y.source.taskId) ?? Infinity) : Infinity;
        return dy - dx || y.start.getTime() - x.start.getTime();
      })[0];
      if (pick?.source.type === 'task') clashing.add(pick.source.sessionId);
    }
    if (!clashing.size) break;
    for (const t of active) t.sessions = t.sessions.filter((x) => !clashing.has(x.id));
    // Everything that stays (including kept auto sessions) blocks the sessions being re-placed.
    busy.splice(0, busy.length, ...hardBlocks({ ...data, tasks }, now, horizon));
    dayCache.clear();
    checksUsed.clear();
    for (const t of planOrder(active, byDeadline)) placeTask(t);
  }
  return tasks;
}

/**
 * Time tasks can't use: time away, and everything on the calendar except skipped sessions,
 * routines that can slide out of the way, and the sessions in `exclude` (being re-planned).
 */
function hardBlocks(data: AppData, from: Date, to: Date, exclude?: Set<string>): Interval[] {
  return [
    ...awayIntervals(data),
    ...expand(data, from, to, { excludeSessionIds: exclude })
      .filter((o) => !o.skipped && !o.auto)
      .map((o) => ({ start: o.start, end: o.end })),
  ];
}

function movableSessionIds(tasks: Task[], now: Date) {
  return tasks.flatMap((t) => (autoPlanned(t) ? t.sessions : []).filter((s) => mayMove(s, now)).map((s) => s.id));
}

/** Days where `layout` has more warnings than `baseline`. */
function daysWithMoreWarnings(layout: Occ[], baseline: Occ[]): string[] {
  const count = (occs: Occ[]) => {
    const byDay = new Map<string, number>();
    for (const o of occs)
      if (o.warning && !o.skipped) byDay.set(dateKey(o.start), (byDay.get(dateKey(o.start)) ?? 0) + 1);
    return byDay;
  };
  const after = count(layout);
  const before = count(baseline);
  return [...after].filter(([dk, n]) => n > (before.get(dk) ?? 0)).map(([dk]) => dk);
}

/** Auto sessions that overlap something else in this layout, or whose own trips do. */
function clashingSessions(occs: Occ[], tasks: Task[], now: Date): Set<string> {
  const movable = new Set(movableSessionIds(tasks, now));
  const live = occs.filter((o) => !o.skipped);
  const out = new Set<string>();
  for (const o of live) {
    if (o.source.type !== 'task' || !movable.has(o.source.sessionId)) continue;
    const mine = (x: Occ) => x === o || (isTravel(x) && x.id.includes(o.id));
    const others = live.filter((x) => !mine(x));
    const myTrips = live.filter((x) => isTravel(x) && x.id.includes(o.id));
    const clash =
      others.some((x) => overlaps(o.start, o.end, x.start, x.end)) ||
      myTrips.some(
        (tr) => tr.warning || others.some((x) => !isTravel(x) && overlaps(tr.start, tr.end, x.start, x.end)),
      );
    if (clash) out.add(o.source.sessionId);
  }
  return out;
}

/** Status shown next to a task in lists. `all`: every task, to check what it depends on. */
export function taskWarning(
  t: Task,
  now: Date,
  warnHours: number,
  all: Task[] = [],
): { level: 'bad' | 'warn'; text: string } | null {
  if (t.done) return null;
  const blockers = blockersOf(t, all);
  const after = readyAfter(t, all);
  if (t.onCalendar && after && t.sessions.some((s) => !s.done && fromLocal(s.start) < after)) {
    return { level: 'bad', text: `Planned before ${blockers.map((b) => b.title).join(', ')} is done` };
  }
  const unplannedBlocker = blockers.find((b) => !b.onCalendar || unplannedMinutes(b) > 0);
  if (unplannedBlocker) return { level: 'warn', text: `Waiting on ${unplannedBlocker.title} (not planned yet)` };
  const dl = t.deadline ? fromLocal(t.deadline) : null;
  if (dl && dl < now) return { level: 'bad', text: 'Deadline passed' };
  const open = t.sessions.filter((s) => !s.done);
  if (t.onCalendar && dl && open.some((s) => fromLocal(s.end) > dl)) {
    return { level: 'bad', text: 'Scheduled after deadline' };
  }
  const unplanned = unplannedMinutes(t);
  if (t.onCalendar && unplanned > 0) {
    if (t.autoPlan === false) return { level: 'warn', text: `${fmtDur(unplanned)} not planned yet` };
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
