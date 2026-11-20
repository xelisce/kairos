// Turns stored data into concrete calendar blocks ("occurrences") for a date range:
// classes (by academic week), CCAs, events, scheduled tasks, routines that slide
// around clashes, and travel between places.
import { addDays, addMinutes, format, startOfDay } from 'date-fns';
import { ASSESSMENT_KINDS } from '../types';
import type { AppData, Occ, Routine } from '../types';
import { ASSESSMENT_EVENTS, CATEGORY_COLORS, EVENT_ICONS, EVENT_LABELS, KIND_ICONS, withIcon } from './labels';
import { awayIntervals, minutesNotAway, touchesAway } from './away';
import { fitRoutine, routineOcc, routineWindow } from './routines';
import { at, dateKey, eachDay, fromLocal, overlaps, weekdayMon0 } from './time';
import { sortedSessions } from './tasks';
import { computeTravel } from './travel';
import { weekIndex } from './weeks';

export interface ExpandOpts {
  /** Leave out these task sessions (the scheduler uses this while re-placing them). */
  excludeSessionIds?: Set<string>;
}

/** A block plus whether it's skipped on that day. */
type Candidate = [occ: Occ, skipped: boolean];

export function expand(data: AppData, from: Date, to: Date, opts: ExpandOpts = {}): Occ[] {
  // Pad the range so moved occurrences, travel and overnight blocks are caught.
  const pFrom = addDays(startOfDay(from), -2);
  const pTo = addDays(startOfDay(to), 2);

  // While you're away, classes, CCAs and routines don't happen (events and tasks stay).
  const away = awayIntervals(data);
  const notAway = (o: Occ) => !touchesAway(away, o.start, o.end);
  const fixed: Occ[] = [];
  // Skipped sessions: drawn faded, never count as busy (no travel, things can go on top).
  const skipped: Occ[] = [];
  const add = ([occ, isSkipped]: Candidate) => {
    if (isSkipped) skipped.push({ ...occ, skipped: true, movable: false, warning: undefined });
    else fixed.push(occ);
  };

  classOccs(data, pFrom, pTo)
    .filter(([o]) => notAway(o))
    .forEach(add);
  activityOccs(data, pFrom, pTo)
    .filter(([o]) => notAway(o))
    .forEach(add);
  eventOccs(data, pFrom, pTo).forEach(add);
  fixed.push(...taskOccs(data, pFrom, pTo, opts.excludeSessionIds));

  // Routines: fixed ones (not auto-scheduled, or moved by hand) go in now;
  // flexible ones are fitted around everything once the first trips are known.
  const { pinned, flexible, skippedRoutines } = routineOccs(data, pFrom, pTo);
  // A fixed routine that runs into the time away keeps the part before (or after) it: you still
  // sleep the night before you leave.
  const outsideAway = (o: Occ): Occ | null => {
    let { start, end } = o;
    for (const a of away) {
      if (!(start < a.end && a.start < end)) continue;
      if (start < a.start) end = a.start;
      else if (end > a.end) start = a.end;
      else return null;
    }
    return start < end ? { ...o, start, end } : null;
  };
  for (const o of pinned) {
    const kept = outsideAway(o);
    if (kept) fixed.push(kept);
  }
  skippedRoutines.filter(notAway).forEach((o) => add([o, true]));

  // Tasks without a place happen wherever you are, so a trip waits until they're done.
  const taskStays = fixed.filter((o) => o.source.type === 'task' && !o.location && !o.title.startsWith('✓'));
  const firstTravel = computeTravel(data, fixed, taskStays);
  // Away time is busy for fitting routines, so one that's partly in it moves to the free part.
  const awayBlocks: Occ[] = away.map((a, i) => ({
    id: `away:${i}`,
    source: { type: 'event', eventId: `away:${i}` },
    title: 'Away',
    start: a.start,
    end: a.end,
    color: '',
    movable: false,
  }));
  const busy = [...fixed, ...firstTravel, ...awayBlocks];
  const placed: Occ[] = [];
  for (const { r, day, dk } of flexible) {
    // Not enough of its window left outside the away time: it doesn't happen that day.
    const { start: ws, end: we } = routineWindow(r, day);
    if (minutesNotAway(away, ws, we) < r.durationMin) continue;
    const occ = { ...fitRoutine(r, day, dk, busy), auto: true };
    if (!notAway(occ)) continue;
    placed.push(occ);
    busy.push(occ);
  }

  // Final travel now that routines have their times. Routines without a place happen wherever
  // you are, so a trip that would overlap one waits until it's over (lunch at MH, then go home).
  const stays = [...taskStays, ...placed.filter((o) => !o.location)];
  const travel = computeTravel(data, [...fixed, ...placed], stays);
  return [...fixed, ...travel, ...placed, ...skipped].filter((o) => overlaps(o.start, o.end, from, to));
}

function classOccs(data: AppData, from: Date, to: Date): Candidate[] {
  const modules = new Map(data.modules.map((m) => [m.id, m]));
  const sems = new Map(data.semesters.map((s) => [s.id, s]));
  const out: Candidate[] = [];
  for (const day of eachDay(from, to)) {
    const dk = dateKey(day);
    const wd = weekdayMon0(day);
    for (const c of data.classes) {
      if (!c.days.includes(wd)) continue;
      const mod = modules.get(c.moduleId);
      const sem = mod && sems.get(mod.semesterId);
      if (!mod || !sem) continue;
      const wi = weekIndex(sem, day);
      if (wi === null) continue;
      const week = sem.layout[wi];
      if (week.type !== 'teaching' || !c.weeks.includes(week.n)) continue;
      if (c.deletedDates?.includes(dk) || sem.holidays.some((h) => h.date === dk)) continue;
      const moved = c.overrides[dk];
      const kind = c.kindOverrides?.[dk] ?? c.kind;
      out.push([
        {
          id: `class:${c.id}:${dk}`,
          source: { type: 'class', seriesId: c.id, date: dk },
          title: `${withIcon(KIND_ICONS[kind])}${mod.code} ${kind}`,
          subtitle: kind !== c.kind ? `instead of ${c.kind}` : mod.name,
          start: moved ? fromLocal(moved.start) : at(day, c.start),
          end: moved ? fromLocal(moved.end) : at(day, c.end),
          // An override of '' means no place that day.
          location: (c.locationOverrides?.[dk] ?? c.location) || undefined,
          color: mod.color,
          movable: true,
          assessment: ASSESSMENT_KINDS.includes(kind),
          detail: c.details?.[dk],
        },
        c.skipDates.includes(dk),
      ]);
    }
  }
  return out;
}

function activityOccs(data: AppData, from: Date, to: Date): Candidate[] {
  const out: Candidate[] = [];
  for (const day of eachDay(from, to)) {
    const dk = dateKey(day);
    const wd = weekdayMon0(day);
    for (const a of data.activities) {
      if (a.recurring === false || !a.days.includes(wd) || a.deletedDates?.includes(dk)) continue;
      if ((a.from && dk < a.from) || (a.until && dk > a.until)) continue;
      const moved = a.overrides[dk];
      out.push([
        {
          id: `activity:${a.id}:${dk}`,
          source: { type: 'activity', activityId: a.id, date: dk },
          title: a.title,
          start: moved ? fromLocal(moved.start) : at(day, a.start),
          end: moved ? fromLocal(moved.end) : at(day, a.end),
          location: (a.locationOverrides?.[dk] ?? a.location) || undefined,
          color: a.color,
          movable: true,
          detail: a.details?.[dk],
        },
        a.skipDates.includes(dk),
      ]);
    }
  }
  return out;
}

function eventOccs(data: AppData, from: Date, to: Date): Candidate[] {
  const out: Candidate[] = [];
  for (const e of data.events) {
    const start = fromLocal(e.start);
    const end = fromLocal(e.end);
    if (!overlaps(start, end, from, to)) continue;
    const mod = e.moduleId ? data.modules.find((m) => m.id === e.moduleId) : undefined;
    const act = e.activityId ? data.activities.find((a) => a.id === e.activityId) : undefined;
    // "CS 642 Midterm" unless the title already names the course.
    const coursePrefix = mod && !e.title.toUpperCase().includes(mod.code.toUpperCase()) ? `${mod.code} ` : '';
    out.push([
      {
        id: `event:${e.id}`,
        source: { type: 'event', eventId: e.id },
        title: `${withIcon(EVENT_ICONS[e.category])}${coursePrefix}${e.title}`,
        subtitle: mod
          ? `${EVENT_LABELS[e.category]} · ${mod.name}`
          : act && act.title !== e.title
            ? act.title
            : undefined,
        start,
        end,
        location: e.location,
        color: mod?.color ?? act?.color ?? CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.other,
        movable: true,
        assessment: ASSESSMENT_EVENTS.includes(e.category),
        detail: e.notes?.split('\n')[0],
      },
      !!e.skipped,
    ]);
  }
  return out;
}

function taskOccs(data: AppData, from: Date, to: Date, exclude?: Set<string>): Occ[] {
  const out: Occ[] = [];
  // Cheap check on the text first ("2026-11-20T..."): most sessions are on other days.
  const firstDay = dateKey(from);
  const lastDay = dateKey(to);
  for (const t of data.tasks) {
    if (!t.onCalendar) continue;
    const mod = t.moduleId ? data.modules.find((m) => m.id === t.moduleId) : undefined;
    const act = !mod && t.activityId ? data.activities.find((a) => a.id === t.activityId) : undefined;
    const sessions = sortedSessions(t);
    sessions.forEach((session, i) => {
      if (exclude?.has(session.id)) return;
      if (session.end.slice(0, 10) < firstDay || session.start.slice(0, 10) > lastDay) return;
      const start = fromLocal(session.start);
      const end = fromLocal(session.end);
      if (!overlaps(start, end, from, to)) return;
      const done = t.done || session.done;
      const late = !done && t.deadline && end > fromLocal(t.deadline);
      const part = sessions.length > 1 ? ` · ${i + 1}/${sessions.length}` : '';
      out.push({
        id: `task:${t.id}:${session.id}`,
        source: { type: 'task', taskId: t.id, sessionId: session.id },
        title: `${done ? '✓ ' : ''}${t.title}${part}`,
        subtitle: mod?.code ?? act?.title,
        start,
        end,
        location: t.location,
        color: mod?.color ?? act?.color ?? CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.other,
        movable: true,
        warning: late
          ? `Scheduled after the deadline (${format(fromLocal(t.deadline!), 'EEE d MMM HH:mm')})`
          : undefined,
      });
    });
  }
  return out;
}

/** Split routines into pinned (fixed time), flexible (to be fitted) and skipped, per day. */
function routineOccs(data: AppData, from: Date, to: Date) {
  const pinned: Occ[] = [];
  const skippedRoutines: Occ[] = [];
  const flexible: { r: Routine; day: Date; dk: string }[] = [];
  for (const day of eachDay(from, to)) {
    const dk = dateKey(day);
    for (const base of data.routines) {
      if (!base.enabled || !base.days.includes(weekdayMon0(day)) || base.deletedDates?.includes(dk)) continue;
      // This day's own length, if you changed it.
      const len = base.durationOverrides?.[dk];
      const r: Routine = {
        ...base,
        durationMin: len ?? base.durationMin,
        location: (base.locationOverrides?.[dk] ?? base.location) || undefined,
      };
      const moved = r.overrides[dk];
      const start = moved ? fromLocal(moved.start) : at(day, r.preferredStart);
      const end = moved ? fromLocal(moved.end) : addMinutes(start, r.durationMin);
      if (base.skipDates.includes(dk)) skippedRoutines.push(routineOcc(r, dk, start, end));
      else if (moved || !r.flexible)
        pinned.push(
          routineOcc(r, dk, start, end, undefined, moved ? 'Moved by hand: stays here until you Reset it' : undefined),
        );
      else flexible.push({ r, day, dk });
    }
  }
  return { pinned, flexible, skippedRoutines };
}
