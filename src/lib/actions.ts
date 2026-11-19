// High-level edits used by the calendar and panels.
import { addDays, addMinutes, startOfWeek } from 'date-fns';
import { useStore } from '../store';
import type { AppData, ClassKind, Occ, TrashItem } from '../types';
import { fromLocal, toLocal } from './time';

const commit = (...a: Parameters<ReturnType<typeof useStore.getState>['commit']>) => useStore.getState().commit(...a);

/** Move or resize any occurrence to a new start/end. */
export function moveOcc(o: Occ, start: Date, end: Date, how: 'move' | 'resize' = 'move') {
  const s = toLocal(start);
  const e = toLocal(end);
  const src = o.source;
  switch (src.type) {
    case 'class':
      commit(`Move ${o.title}`, (d) => {
        const c = d.classes.find((x) => x.id === src.seriesId);
        if (c) c.overrides[src.date] = { start: s, end: e };
      });
      break;
    case 'routine': {
      const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
      commit(how === 'resize' ? `${o.title} ${minutes}m` : `Move ${o.title}`, (d) => {
        const r = d.routines.find((x) => x.id === src.routineId);
        if (!r) return;
        // Length for this day: kept by Re-plan, cleared by Reset.
        r.durationOverrides ??= {};
        if (minutes === r.durationMin) delete r.durationOverrides[src.date]; else r.durationOverrides[src.date] = minutes;
        // Moving pins it there. Resizing only pins it if it was already pinned.
        if (how === 'move' || r.overrides[src.date]) r.overrides[src.date] = { start: s, end: e };
      });
      break;
    }
    case 'event':
      commit(`Move ${o.title}`, (d) => {
        const ev = d.events.find((x) => x.id === src.eventId);
        if (ev) { ev.start = s; ev.end = e; }
      });
      break;
    case 'task':
      commit(`Move ${o.title}`, (d) => {
        const t = d.tasks.find((x) => x.id === src.taskId);
        if (t) {
          t.scheduled = { start: s, end: e };
          t.durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
          t.pinned = true;
          t.rolledForward = false;
        }
      });
      break;
    case 'activity':
      commit(`Move ${o.title}`, (d) => {
        const a = d.activities.find((x) => x.id === src.activityId);
        if (a) a.overrides[src.date] = { start: s, end: e };
      });
      break;
    case 'travel': {
      const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
      commit(`Move trip to ${src.to}`, (d) => {
        d.travelMoves[src.key] = s;
        if (minutes !== src.minutes) d.travelOverrides[src.key] = minutes;
      });
      break;
    }
  }
}

type Series = { skipDates: string[]; deletedDates?: string[] };
function seriesOf(d: AppData, o: Occ): Series | undefined {
  const src = o.source;
  if (src.type === 'class') return d.classes.find((x) => x.id === src.seriesId);
  if (src.type === 'routine') return d.routines.find((x) => x.id === src.routineId);
  if (src.type === 'activity') return d.activities.find((x) => x.id === src.activityId);
  return undefined;
}
const dateOf = (o: Occ) => ('date' in o.source ? o.source.date : '');

/** Skip one session: it stays on the calendar (faded) but other things can use the time. Toggle to un-skip. */
export function skipOcc(o: Occ) {
  const dk = dateOf(o);
  commit(o.skipped ? `Un-skip ${o.title}` : `Skip ${o.title} on ${dk}`, (d) => {
    const x = seriesOf(d, o);
    if (!x) return;
    x.skipDates = o.skipped ? x.skipDates.filter((v) => v !== dk) : [...new Set([...x.skipDates, dk])];
  });
}

/** Delete one session (restore it from the Deleted tab). Events and tasks go to the Deleted tab whole. */
export function deleteOcc(o: Occ) {
  const src = o.source;
  if (src.type === 'event') return trashItem('event', src.eventId);
  if (src.type === 'task') return trashItem('task', src.taskId);
  const dk = dateOf(o);
  commit(`Delete ${o.title} on ${dk}`, (d) => {
    const x = seriesOf(d, o);
    if (!x) return;
    x.skipDates = x.skipDates.filter((v) => v !== dk);
    x.deletedDates = [...new Set([...(x.deletedDates ?? []), dk])];
  });
}

/** Bring back one deleted session. */
export function restoreDate(kind: 'class' | 'routine' | 'activity', id: string, dk: string, label: string) {
  commit(`Restore ${label}`, (d) => {
    const list = kind === 'class' ? d.classes : kind === 'routine' ? d.routines : d.activities;
    const x = (list as Series[] & { id: string }[]).find((y) => (y as unknown as { id: string }).id === id);
    if (x) x.deletedDates = (x.deletedDates ?? []).filter((v) => v !== dk);
  });
}

/** Move a whole event/task/class/routine/CCA to the Deleted tab. */
export function trashItem(kind: TrashItem['kind'], id: string) {
  const d0 = useStore.getState().data;
  const lists = { event: d0.events, task: d0.tasks, class: d0.classes, routine: d0.routines, activity: d0.activities } as const;
  const item = (lists[kind] as { id: string }[]).find((x) => x.id === id) as { title?: string } | undefined;
  commit(`Delete ${item?.title ?? kind}`, (d) => {
    const key = { event: 'events', task: 'tasks', class: 'classes', routine: 'routines', activity: 'activities' }[kind] as 'events';
    const arr = d[key] as unknown as { id: string }[];
    const i = arr.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [removed] = arr.splice(i, 1);
    d.trash.unshift({ kind, item: removed, deletedAt: toLocal(new Date()) } as TrashItem);
  });
}

/** Put a whole deleted item back. */
export function restoreTrash(index: number) {
  const t = useStore.getState().data.trash[index];
  if (!t) return;
  commit(`Restore ${(t.item as { title?: string }).title ?? t.kind}`, (d) => {
    const [x] = d.trash.splice(index, 1);
    if (!x) return;
    if (x.kind === 'event') d.events.push(x.item);
    if (x.kind === 'task') d.tasks.push(x.item);
    if (x.kind === 'class') d.classes.push(x.item);
    if (x.kind === 'routine') d.routines.push(x.item);
    if (x.kind === 'activity') d.activities.push(x.item);
  });
}

/** Permanently remove one item from the Deleted tab. */
export function purgeTrash(index: number) {
  commit('Delete forever', (d) => { d.trash.splice(index, 1); });
}

/** Put a moved class/routine back to its normal time. */
export function resetOcc(o: Occ) {
  const src = o.source;
  commit(`Reset ${o.title}`, (d) => {
    if (src.type === 'class') delete d.classes.find((x) => x.id === src.seriesId)?.overrides[src.date];
    if (src.type === 'routine') {
      const r = d.routines.find((x) => x.id === src.routineId);
      if (r) { delete r.overrides[src.date]; delete r.durationOverrides?.[src.date]; }
    }
    if (src.type === 'activity') delete d.activities.find((x) => x.id === src.activityId)?.overrides[src.date];
    if (src.type === 'travel') delete d.travelMoves[src.key];
    if (src.type === 'task') { const t = d.tasks.find((x) => x.id === src.taskId); if (t) t.pinned = false; }
  });
}

export function setTravel(key: string, minutes: number | null) {
  commit(minutes === null ? 'Reset travel time' : `Travel time ${minutes}m`, (d) => {
    if (minutes === null) delete d.travelOverrides[key];
    else d.travelOverrides[key] = minutes;
  });
}

/**
 * "I'm running late": push today's remaining movable things (routines, tasks)
 * back by `min` minutes. Classes and events stay where they are.
 */
export function runningLate(occs: Occ[], min: number, now = new Date()) {
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const affected = occs.filter((o) => !o.skipped && o.end > now && o.start < todayEnd && (o.source.type === 'routine' || o.source.type === 'task'));
  if (!affected.length) return;
  commit(`Running late +${min}m`, (d) => {
    for (const o of affected) {
      const ns = toLocal(addMinutes(o.start < now ? now : o.start, min));
      const ne = toLocal(addMinutes(o.start < now ? now : o.start, min + (o.end.getTime() - o.start.getTime()) / 60000));
      const src = o.source;
      if (src.type === 'routine') {
        const r = d.routines.find((x) => x.id === src.routineId);
        if (r) r.overrides[src.date] = { start: ns, end: ne };
      } else if (src.type === 'task') {
        const t = d.tasks.find((x) => x.id === src.taskId);
        // Not pinned: Re-plan can still move it, and it keeps this slot otherwise.
        if (t && !t.done) t.scheduled = { start: ns, end: ne };
      }
    }
  });
}

export const isoToDate = fromLocal;

/** This one class session is something else (quiz, exam, help session...), or back to normal with null. */
export function setSessionKind(o: Occ, kind: ClassKind | null) {
  const src = o.source;
  if (src.type !== 'class') return;
  commit(kind ? `${o.title} → ${kind}` : `Reset ${o.title}`, (d) => {
    const c = d.classes.find((x) => x.id === src.seriesId);
    if (!c) return;
    if (!kind || kind === c.kind) delete c.kindOverrides[src.date];
    else c.kindOverrides[src.date] = kind;
  });
}

export type ReplanScope = 'today' | 'tomorrow' | 'next3' | 'week' | 'future' | 'all';

export const REPLAN_LABELS: Record<ReplanScope, string> = {
  today: 'Re-plan today',
  tomorrow: 'Re-plan tomorrow',
  next3: 'Re-plan today + next 3 days',
  week: 'Re-plan this week',
  future: 'Re-plan all future',
  all: 'Re-plan all time (incl. past)',
};

/** Date range a re-plan covers. `null` end = open-ended. */
export function replanRange(scope: ReplanScope, now = new Date()): { from: Date | null; to: Date | null } {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  if (scope === 'today') return { from: day, to: addDays(day, 1) };
  if (scope === 'tomorrow') return { from: addDays(day, 1), to: addDays(day, 2) };
  if (scope === 'next3') return { from: day, to: addDays(day, 4) };
  if (scope === 'week') { const mon = startOfWeek(now, { weekStartsOn: 1 }); return { from: mon, to: addDays(mon, 7) }; }
  if (scope === 'future') return { from: day, to: null };
  return { from: null, to: null };
}

/**
 * Re-plan: auto-scheduled tasks in the range lose their slot and get re-placed
 * (earliest deadline first). Routines always auto-fit around everything, keep a
 * length you changed, and stay where you moved them (Reset frees those).
 * Untouched: classes, events, CCAs, travel moves, and tasks you dragged (pinned).
 */
export function replan(scope: ReplanScope, now = new Date()) {
  const { from, to } = replanRange(scope, now);
  const inRange = (d: Date) => (!from || d >= from) && (!to || d < to);
  commit(REPLAN_LABELS[scope], (d) => {
    for (const t of d.tasks) {
      if (!t.done && t.onCalendar && !t.pinned && t.scheduled && inRange(fromLocal(t.scheduled.start))) t.scheduled = undefined;
    }
  });
}

/** Details for one session of a class or CCA ("Guest talk", "Full team meeting"), or an event's notes. Empty clears it. */
export function setDetail(o: Occ, text: string) {
  const v = text.trim();
  const src = o.source;
  commit(v ? `Details: ${v}` : `Clear details of ${o.title}`, (d) => {
    const put = (rec: { details?: Record<string, string> } | undefined, dk: string) => {
      if (!rec) return;
      rec.details ??= {};
      if (v) rec.details[dk] = v; else delete rec.details[dk];
    };
    if (src.type === 'class') put(d.classes.find((x) => x.id === src.seriesId), src.date);
    if (src.type === 'activity') put(d.activities.find((x) => x.id === src.activityId), src.date);
    if (src.type === 'event') { const e = d.events.find((x) => x.id === src.eventId); if (e) e.notes = v || undefined; }
    if (src.type === 'task') { const t = d.tasks.find((x) => x.id === src.taskId); if (t) t.notes = v || undefined; }
  });
}

export const RESET_LABELS: Record<ReplanScope, string> = {
  today: 'Reset today',
  tomorrow: 'Reset tomorrow',
  next3: 'Reset today + next 3 days',
  week: 'Reset this week',
  future: 'Reset all future',
  all: 'Reset all time (incl. past)',
};

/**
 * Reset, for the range: routines go back to their usual length and auto-schedule again,
 * and trips you dragged re-attach to the class/event they belong to.
 */
export function resetRoutines(scope: ReplanScope, now = new Date()) {
  const { from, to } = replanRange(scope, now);
  const dateIn = (dk: string) => { const d = fromLocal(dk); return (!from || d >= from) && (!to || d < to); };
  commit(RESET_LABELS[scope], (d) => {
    for (const r of d.routines) {
      for (const dk of Object.keys(r.overrides)) if (dateIn(dk)) delete r.overrides[dk];
      for (const dk of Object.keys(r.durationOverrides ?? {})) if (dateIn(dk)) delete r.durationOverrides![dk];
    }
    // Travel keys start with their date: "2026-11-18:class:...:in".
    for (const key of Object.keys(d.travelMoves)) if (dateIn(key.slice(0, 10))) delete d.travelMoves[key];
  });
}
