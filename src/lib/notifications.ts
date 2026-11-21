// Which notifications to send and when, worked out from the calendar (Settings > Notifications).
// Pure: the website (lib/notify.ts) and the Android app both deliver what this returns, and it is
// worked out again whenever the calendar changes.
import { addDays, addHours, addMinutes, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import type { AppData, NotifySettings, Occ, RoutineCategory, Settings } from '../types';
import { expand } from './expand';
import { planTitle, PLAN_KINDS } from './travelPlans';
import { at, fmtDur, fmtTime, fromLocal, hmToMin } from './time';
import { sessionMinutes } from './tasks';

export type NoteKind =
  'leave' | 'class' | 'cca' | 'event' | 'exam' | 'routine' | 'sleep' | 'session' | 'deadline' | 'plan';

export interface Note {
  /** Stable while the thing it's about doesn't change, so a re-plan doesn't send it twice. */
  id: string;
  at: Date;
  kind: NoteKind;
  title: string;
  body: string;
  /** A session-ending note: Done and +15 min act on this session. */
  session?: { taskId: string; sessionId: string };
}

/** The accent color of each kind (the notification's icon tint on Android). */
export const NOTE_COLORS: Record<NoteKind, string> = {
  leave: '#4b9be0',
  class: '#6d5dfc',
  cca: '#5fa83f',
  event: '#e0699f',
  exam: '#d65f5f',
  routine: '#d08a2c',
  sleep: '#7a6fd6',
  session: '#6d5dfc',
  deadline: '#d65f5f',
  plan: '#3fa7a0',
};

export const ROUTINE_ICONS: Record<RoutineCategory, string> = {
  meal: '🍽',
  hygiene: '🚿',
  sleep: '😴',
  chores: '🧹',
  exercise: '🏃',
  other: '🕐',
};

/** How much +15 min adds to a session. */
export const EXTEND_MIN = 15;
/** Notifications this close together come as one. */
const COMBINE_MIN = 5;

export const DEFAULT_NOTIFY: NotifySettings = {
  leave: true,
  leaveMin: 10,
  classes: true,
  classMin: 10,
  classSkipIfLeave: true,
  ccas: true,
  ccaMin: 10,
  ccaSkipIfLeave: true,
  events: true,
  eventMin: 15,
  exams: true,
  examMin: 15,
  examEvening: true,
  examEveningAt: '20:00',
  routines: { meal: true, hygiene: true, sleep: true, chores: false, exercise: true, other: true },
  windDown: true,
  windDownMin: 30,
  sessionStart: true,
  sessionEnd: false,
  deadlines: true,
  deadlineHours: [24, 2],
  flights: true,
  flightHours: 24,
  plans: true,
  planMin: 120,
  quiet: false,
  quietStart: '23:00',
  quietEnd: '07:00',
  quietSleep: true,
  snoozeMin: 10,
};

export type NotifyWhere = 'app' | 'web';

/** Your notification settings for the Android app or the website, with defaults for anything unchanged. */
export function notifyOf(s: Pick<Settings, 'notifications'>, where: NotifyWhere): NotifySettings {
  const mine = s.notifications?.[where] ?? {};
  return { ...DEFAULT_NOTIFY, ...mine, routines: { ...DEFAULT_NOTIFY.routines, ...mine.routines } };
}

/** "Today", "Tomorrow" or "Mon 24 Nov", for when something is, seen from when you're told. */
export function dayWord(when: Date, from: Date): string {
  const days = differenceInCalendarDays(when, from);
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : format(when, 'EEE d MMM');
}

const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ');
const span = (o: Occ) => `${fmtTime(o.start)}–${fmtTime(o.end)}`;

/** Is this time of day inside quiet hours (which may run past midnight)? */
function inQuietHours(t: Date, n: NotifySettings): boolean {
  const m = t.getHours() * 60 + t.getMinutes();
  const s = hmToMin(n.quietStart);
  const e = hmToMin(n.quietEnd);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

/**
 * The notifications due from `from` to `to`, in time order. Nothing for skipped sessions or for
 * what time away hides (expand leaves those out); ones within 5 minutes of each other come as one.
 */
export function planNotes(data: AppData, from: Date, to: Date, n: NotifySettings): Note[] {
  const notes: Note[] = [];
  const add = (note: Note) => {
    if (note.at >= from && note.at < to) notes.push(note);
  };
  // Blocks a day past the end too: the evening-before reminder of an exam is a day early.
  const occs = expand(data, from, addDays(to, 2)).filter((o) => !o.skipped);
  const routines = new Map(data.routines.map((r) => [r.id, r]));

  // Things you get a "Time to leave" for: the trip's key is "<day>:<block id>:in".
  const leaveFor = new Set<string>();
  if (n.leave)
    for (const o of occs)
      if (o.source.type === 'travel' && o.source.key.endsWith(':in')) leaveFor.add(o.source.key.slice(11, -3));

  const before = (o: Occ, min: number, kind: NoteKind, title: string, body: string) =>
    add({ id: `${kind}:${o.id}:${min}`, at: addMinutes(o.start, -min), kind, title, body });

  for (const o of occs) {
    const src = o.source;
    const where = o.location;
    if (src.type === 'travel') {
      if (!n.leave) continue;
      const to = o.title.replace(/^🚶\s*/, '');
      const trip = `${src.minutes} min to ${to}, there by ${fmtTime(o.end)}`;
      if (n.leaveMin > 0)
        add({
          id: `leave:${src.key}:soon`,
          at: addMinutes(o.start, -n.leaveMin),
          kind: 'leave',
          title: `🚶 Leave in ${n.leaveMin} min for ${to}`,
          body: join(`Go at ${fmtTime(o.start)}`, trip),
        });
      add({ id: `leave:${src.key}:now`, at: o.start, kind: 'leave', title: `🚶 Leave now for ${to}`, body: trip });
      continue;
    }

    if (o.assessment && (src.type === 'class' || src.type === 'event')) {
      if (!n.exams) continue;
      before(o, n.examMin, 'exam', `${o.title}`, join(`In ${fmtDur(n.examMin)}`, span(o), where));
      if (n.examEvening) {
        const eve = at(addDays(startOfDay(o.start), -1), n.examEveningAt);
        add({
          id: `exam:${o.id}:eve`,
          at: eve,
          kind: 'exam',
          title: `Tomorrow: ${o.title}`,
          body: join(span(o), where, 'Get a good night’s sleep'),
        });
      }
      continue;
    }

    const isCca =
      src.type === 'activity' ||
      (src.type === 'event' &&
        !!data.events.find((e) => e.id === src.eventId && (e.activityId || e.category === 'cca')));
    if (src.type === 'class' || isCca) {
      const [on, min, skip, kind] = isCca
        ? ([n.ccas, n.ccaMin, n.ccaSkipIfLeave, 'cca'] as const)
        : ([n.classes, n.classMin, n.classSkipIfLeave, 'class'] as const);
      if (!on || (skip && leaveFor.has(o.id))) continue;
      before(o, min, kind, o.title, join(`In ${fmtDur(min)}`, span(o), where, o.detail));
      continue;
    }

    if (src.type === 'event') {
      if (n.events) before(o, n.eventMin, 'event', o.title, join(`In ${fmtDur(n.eventMin)}`, span(o), where, o.detail));
      continue;
    }

    if (src.type === 'routine') {
      const r = routines.get(src.routineId);
      if (!r) continue;
      const icon = ROUTINE_ICONS[r.category];
      if (n.routines[r.category])
        add({
          id: `routine:${o.id}`,
          at: o.start,
          kind: r.category === 'sleep' ? 'sleep' : 'routine',
          title: `${icon} ${r.title} now`,
          body: join(`Until ${fmtTime(o.end)}`, where, o.detail),
        });
      if (r.category === 'sleep' && n.windDown && n.windDownMin > 0)
        before(o, n.windDownMin, 'sleep', '🌙 Time to wind down', `${r.title} at ${fmtTime(o.start)}`);
      continue;
    }

    if (src.type === 'task') {
      if (o.title.startsWith('✓')) continue; // done already
      const len = fmtDur(Math.round((o.end.getTime() - o.start.getTime()) / 60000));
      if (n.sessionStart)
        add({
          id: `session:${src.sessionId}:start`,
          at: o.start,
          kind: 'session',
          title: `📝 ${o.title}`,
          body: join(`Start now, ${len} until ${fmtTime(o.end)}`, o.subtitle, where),
        });
      if (n.sessionEnd)
        add({
          // The end time is part of it, so +15 min brings a new one.
          id: `session:${src.sessionId}:end:${o.end.getTime()}`,
          at: o.end,
          kind: 'session',
          title: `✅ Done with ${o.title}?`,
          body: `Mark it done, or take ${EXTEND_MIN} more minutes.`,
          session: { taskId: src.taskId, sessionId: src.sessionId },
        });
    }
  }

  if (n.deadlines)
    for (const t of data.tasks) {
      if (t.done || !t.deadline) continue;
      const due = fromLocal(t.deadline);
      for (const h of new Set(n.deadlineHours.filter((x) => x > 0))) {
        const when = addHours(due, -h);
        add({
          id: `deadline:${t.id}:${h}`,
          at: when,
          kind: 'deadline',
          title: `⏰ ${t.title} is due in ${h} h`,
          body: join(
            `Due ${dayWord(due, when).replace(/^(Today|Tomorrow)$/, (w) => w.toLowerCase())} at ${fmtTime(due)}`,
            plannedLeft(t),
          ),
        });
      }
    }

  for (const a of data.away)
    for (const p of a.plans ?? []) {
      const start = fromLocal(p.start);
      const flight = p.kind === 'flight';
      if (flight ? !n.flights : !n.plans || p.kind === 'stay' || p.kind === 'visit') continue;
      const when = flight ? addHours(start, -n.flightHours) : addMinutes(start, -n.planMin);
      add({
        id: `plan:${p.id}:${p.start}`,
        at: when,
        kind: 'plan',
        title: `${PLAN_KINDS[p.kind].icon} ${planTitle(p)}`,
        body: join(`${dayWord(start, when)} at ${fmtTime(start)}`, p.where, p.notes?.split('\n')[0]),
      });
    }

  const sleeps = n.quietSleep
    ? occs.filter((o) => o.source.type === 'routine' && routines.get(o.source.routineId)?.category === 'sleep')
    : [];
  const quiet = (t: Date) => (n.quiet && inQuietHours(t, n)) || sleeps.some((s) => t > s.start && t < s.end);
  return combine(notes.filter((x) => !quiet(x.at)).sort((a, b) => a.at.getTime() - b.at.getTime()));
}

/** What's left of a task: "2h left to plan" or nothing. */
function plannedLeft(t: AppData['tasks'][number]): string | undefined {
  const done = t.sessions.filter((s) => s.done).reduce((m, s) => m + sessionMinutes(s), 0);
  const left = t.durationMin - done;
  return left > 0 && done > 0 ? `${fmtDur(left)} of work left` : undefined;
}

/** Notifications within a few minutes of each other become one ("3 things coming up"). */
function combine(sorted: Note[]): Note[] {
  const out: Note[] = [];
  let group: Note[] = [];
  const flush = () => {
    if (group.length === 1) out.push(group[0]);
    else if (group.length > 1)
      out.push({
        id: group.map((g) => g.id).join('+'),
        at: group[0].at,
        kind: group[0].kind,
        title: `🔔 ${group.length} things coming up`,
        body: group.map((g) => g.title).join('\n'),
      });
    group = [];
  };
  for (const note of sorted) {
    if (group.length && note.at.getTime() - group[0].at.getTime() > COMBINE_MIN * 60_000) flush();
    group.push(note);
  }
  flush();
  return out;
}
