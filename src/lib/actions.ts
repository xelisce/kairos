// Edits the calendar, dialogs and panels make. Each is one undo step (see store.commit).
import { addDays, addMinutes, startOfDay, startOfWeek } from 'date-fns';
import { useStore } from '../store';
import type { Activity, AppData, CalEvent, ClassKind, ClassSeries, Occ, Routine, Task, TrashItem } from '../types';
import { fromLocal, toLocal, uid } from './time';

const commit = (label: string, fn: (d: AppData) => void) => useStore.getState().commit(label, fn);

const minutesBetween = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / 60000);

// ---------- Moving things on the calendar ----------

/**
 * Drag (`move`) or stretch (`resize`) a block.
 * - Classes, CCAs, events: that one occurrence moves.
 * - Routines: moving pins it there; resizing changes that day's length and keeps it auto-scheduled.
 * - Tasks: pinned where you put it.
 * - Trips: leave earlier/later; resizing changes that trip's length.
 */
export function moveOcc(o: Occ, start: Date, end: Date, how: 'move' | 'resize' = 'move') {
  const slot = { start: toLocal(start), end: toLocal(end) };
  const minutes = minutesBetween(start, end);
  const src = o.source;
  switch (src.type) {
    case 'class':
      return commit(`Move ${o.title}`, (d) => {
        const c = d.classes.find((x) => x.id === src.seriesId);
        if (c) c.overrides[src.date] = slot;
      });
    case 'activity':
      return commit(`Move ${o.title}`, (d) => {
        const a = d.activities.find((x) => x.id === src.activityId);
        if (a) a.overrides[src.date] = slot;
      });
    case 'event':
      return commit(`Move ${o.title}`, (d) => {
        const ev = d.events.find((x) => x.id === src.eventId);
        if (ev) Object.assign(ev, slot);
      });
    case 'routine':
      return commit(how === 'resize' ? `${o.title} ${minutes}m` : `Move ${o.title}`, (d) => {
        const r = d.routines.find((x) => x.id === src.routineId);
        if (!r) return;
        r.durationOverrides ??= {};
        if (minutes === r.durationMin) delete r.durationOverrides[src.date];
        else r.durationOverrides[src.date] = minutes;
        if (how === 'move' || r.overrides[src.date]) r.overrides[src.date] = slot;
      });
    case 'task':
      return commit(`Move ${o.title}`, (d) => {
        const t = d.tasks.find((x) => x.id === src.taskId);
        if (t) Object.assign(t, { scheduled: slot, durationMin: minutes, pinned: true, rolledForward: false });
      });
    case 'travel':
      return commit(`Move trip to ${src.to}`, (d) => {
        d.travelMoves[src.key] = slot.start;
        if (minutes !== src.minutes) d.travelOverrides[src.key] = minutes;
      });
  }
}

/** Put a moved block back where it belongs (and let a pinned task auto-schedule again). */
export function resetOcc(o: Occ) {
  const src = o.source;
  commit(`Reset ${o.title}`, (d) => {
    switch (src.type) {
      case 'class':
        delete d.classes.find((x) => x.id === src.seriesId)?.overrides[src.date];
        break;
      case 'activity':
        delete d.activities.find((x) => x.id === src.activityId)?.overrides[src.date];
        break;
      case 'routine': {
        const r = d.routines.find((x) => x.id === src.routineId);
        if (r) {
          delete r.overrides[src.date];
          delete r.durationOverrides?.[src.date];
        }
        break;
      }
      case 'travel':
        delete d.travelMoves[src.key];
        break;
      case 'task': {
        const t = d.tasks.find((x) => x.id === src.taskId);
        if (t) t.pinned = false;
        break;
      }
    }
  });
}

/** This one trip's length in minutes, or `null` to use the saved route time again. */
export function setTravel(key: string, minutes: number | null) {
  commit(minutes === null ? 'Reset travel time' : `Travel time ${minutes}m`, (d) => {
    if (minutes === null) delete d.travelOverrides[key];
    else d.travelOverrides[key] = minutes;
  });
}

/**
 * "I'm running late": push today's remaining routines and tasks back by `min` minutes.
 * Classes and events stay where they are.
 */
export function runningLate(occs: Occ[], min: number, now = new Date()) {
  const tomorrow = addDays(startOfDay(now), 1);
  const affected = occs.filter(
    (o) => !o.skipped && o.end > now && o.start < tomorrow && (o.source.type === 'routine' || o.source.type === 'task'),
  );
  if (!affected.length) return;
  commit(`Running late +${min}m`, (d) => {
    for (const o of affected) {
      const from = o.start < now ? now : o.start;
      const slot = {
        start: toLocal(addMinutes(from, min)),
        end: toLocal(addMinutes(from, min + minutesBetween(o.start, o.end))),
      };
      const src = o.source;
      if (src.type === 'routine') {
        const r = d.routines.find((x) => x.id === src.routineId);
        if (r) r.overrides[src.date] = slot;
      } else if (src.type === 'task') {
        const t = d.tasks.find((x) => x.id === src.taskId);
        // Not pinned: Re-plan can still move it; otherwise it keeps this slot.
        if (t && !t.done) t.scheduled = slot;
      }
    }
  });
}

// ---------- One session of a class / routine / CCA ----------

type SessionSeries = ClassSeries | Routine | Activity;

function seriesOf(d: AppData, o: Occ): SessionSeries | undefined {
  const src = o.source;
  if (src.type === 'class') return d.classes.find((x) => x.id === src.seriesId);
  if (src.type === 'routine') return d.routines.find((x) => x.id === src.routineId);
  if (src.type === 'activity') return d.activities.find((x) => x.id === src.activityId);
  return undefined;
}

const dateOf = (o: Occ) => ('date' in o.source ? o.source.date : '');

/** Skip one session: it stays on the calendar (faded) but other things can use the time. Toggles. */
export function skipOcc(o: Occ) {
  const dk = dateOf(o);
  commit(o.skipped ? `Un-skip ${o.title}` : `Skip ${o.title} on ${dk}`, (d) => {
    const s = seriesOf(d, o);
    if (!s) return;
    s.skipDates = o.skipped ? s.skipDates.filter((v) => v !== dk) : [...new Set([...s.skipDates, dk])];
  });
}

/** Delete one session (restorable from the Deleted tab). Events and tasks go to the Deleted tab whole. */
export function deleteOcc(o: Occ) {
  const src = o.source;
  if (src.type === 'event') return trashItem('event', src.eventId);
  if (src.type === 'task') return trashItem('task', src.taskId);
  const dk = dateOf(o);
  commit(`Delete ${o.title} on ${dk}`, (d) => {
    const s = seriesOf(d, o);
    if (!s) return;
    s.skipDates = s.skipDates.filter((v) => v !== dk);
    s.deletedDates = [...new Set([...(s.deletedDates ?? []), dk])];
  });
}

/** This one class session is something else (quiz, help session...), or back to normal with `null`. */
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

/** What's special about one class/CCA session ("Guest talk"), or an event's / task's notes. Empty clears it. */
export function setDetail(o: Occ, text: string) {
  const value = text.trim();
  const src = o.source;
  commit(value ? `Details: ${value}` : `Clear details of ${o.title}`, (d) => {
    if (src.type === 'class' || src.type === 'activity') {
      const s = seriesOf(d, o) as ClassSeries | Activity | undefined;
      if (!s) return;
      s.details ??= {};
      if (value) s.details[src.date] = value;
      else delete s.details[src.date];
    } else if (src.type === 'event' || src.type === 'task') {
      const item =
        src.type === 'event' ? d.events.find((x) => x.id === src.eventId) : d.tasks.find((x) => x.id === src.taskId);
      if (item) item.notes = value || undefined;
    }
  });
}

// ---------- Deleted tab ----------

type TrashKind = TrashItem['kind'];
interface TrashableByKind {
  event: CalEvent;
  task: Task;
  class: ClassSeries;
  routine: Routine;
  activity: Activity;
}
const LIST_OF: { [K in TrashKind]: (d: AppData) => TrashableByKind[K][] } = {
  event: (d) => d.events,
  task: (d) => d.tasks,
  class: (d) => d.classes,
  routine: (d) => d.routines,
  activity: (d) => d.activities,
};
const titleOf = (item: TrashableByKind[TrashKind]) => ('title' in item ? item.title : item.kind);

/** Move a whole event / task / class / routine / CCA to the Deleted tab. */
export function trashItem<K extends TrashKind>(kind: K, id: string) {
  const item = LIST_OF[kind](useStore.getState().data).find((x) => x.id === id);
  if (!item) return;
  commit(`Delete ${titleOf(item)}`, (d) => {
    const list = LIST_OF[kind](d);
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [removed] = list.splice(i, 1);
    d.trash.unshift({ kind, item: removed, deletedAt: toLocal(new Date()) } as TrashItem);
  });
}

/** Put a whole deleted item back. */
export function restoreTrash(index: number) {
  const t = useStore.getState().data.trash[index];
  if (!t) return;
  commit(`Restore ${titleOf(t.item)}`, (d) => {
    const [x] = d.trash.splice(index, 1);
    if (x) (LIST_OF[x.kind](d) as TrashableByKind[TrashKind][]).push(x.item);
  });
}

/** Permanently remove one item from the Deleted tab. */
export function purgeTrash(index: number) {
  commit('Delete forever', (d) => {
    d.trash.splice(index, 1);
  });
}

/** Bring back one deleted session. */
export function restoreDate(kind: 'class' | 'routine' | 'activity', id: string, dk: string, label: string) {
  commit(`Restore ${label}`, (d) => {
    const s = (LIST_OF[kind](d) as SessionSeries[]).find((x) => x.id === id);
    if (s) s.deletedDates = (s.deletedDates ?? []).filter((v) => v !== dk);
  });
}

// ---------- Re-plan / Reset ----------

export type ReplanScope = 'today' | 'tomorrow' | 'next3' | 'week' | 'future' | 'all';

export const REPLAN_LABELS: Record<ReplanScope, string> = {
  today: 'Re-plan today',
  tomorrow: 'Re-plan tomorrow',
  next3: 'Re-plan today + next 3 days',
  week: 'Re-plan this week',
  future: 'Re-plan all future',
  all: 'Re-plan all time (incl. past)',
};

export const RESET_LABELS: Record<ReplanScope, string> = {
  today: 'Reset today',
  tomorrow: 'Reset tomorrow',
  next3: 'Reset today + next 3 days',
  week: 'Reset this week',
  future: 'Reset all future',
  all: 'Reset all time (incl. past)',
};

/** Date range a scope covers; `null` = open-ended. */
export function replanRange(scope: ReplanScope, now = new Date()): { from: Date | null; to: Date | null } {
  const today = startOfDay(now);
  switch (scope) {
    case 'today':
      return { from: today, to: addDays(today, 1) };
    case 'tomorrow':
      return { from: addDays(today, 1), to: addDays(today, 2) };
    case 'next3':
      return { from: today, to: addDays(today, 4) };
    case 'week': {
      const monday = startOfWeek(now, { weekStartsOn: 1 });
      return { from: monday, to: addDays(monday, 7) };
    }
    case 'future':
      return { from: today, to: null };
    case 'all':
      return { from: null, to: null };
  }
}

const inRange =
  ({ from, to }: ReturnType<typeof replanRange>) =>
  (d: Date) =>
    (!from || d >= from) && (!to || d < to);

/**
 * Re-plan: auto-scheduled tasks in the range lose their slot and get re-placed (earliest deadline first).
 * Routines always auto-fit, keep a length you changed, and stay where you moved them (Reset frees those).
 * Untouched: classes, events, CCAs, trips you moved, and tasks you dragged (pinned).
 */
export function replan(scope: ReplanScope, now = new Date()) {
  const within = inRange(replanRange(scope, now));
  commit(REPLAN_LABELS[scope], (d) => {
    for (const t of d.tasks) {
      if (!t.done && t.onCalendar && !t.pinned && t.scheduled && within(fromLocal(t.scheduled.start))) {
        t.scheduled = undefined;
      }
    }
  });
}

/**
 * Reset, for the range: routines go back to their usual length and auto-schedule again,
 * and trips you dragged re-attach to the class/event they belong to (typed trip lengths stay).
 */
export function resetDays(scope: ReplanScope, now = new Date()) {
  const within = inRange(replanRange(scope, now));
  const dayIn = (dk: string) => within(fromLocal(dk));
  commit(RESET_LABELS[scope], (d) => {
    for (const r of d.routines) {
      for (const dk of Object.keys(r.overrides)) if (dayIn(dk)) delete r.overrides[dk];
      for (const dk of Object.keys(r.durationOverrides ?? {})) if (dayIn(dk)) delete r.durationOverrides![dk];
    }
    // Travel keys start with their date: "2026-11-18:class:...:in".
    for (const key of Object.keys(d.travelMoves)) if (dayIn(key.slice(0, 10))) delete d.travelMoves[key];
  });
}

// ---------- Tasks ----------

export function toggleTaskDone(taskId: string) {
  const t = useStore.getState().data.tasks.find((x) => x.id === taskId);
  if (!t) return;
  commit(t.done ? `Undone ${t.title}` : `Done ${t.title}`, (d) => {
    const x = d.tasks.find((y) => y.id === taskId);
    if (x) x.done = !x.done;
  });
}

/** Put a task on the calendar (auto-scheduled) or take it off. */
export function setTaskOnCalendar(taskId: string, onCalendar: boolean) {
  const t = useStore.getState().data.tasks.find((x) => x.id === taskId);
  if (!t) return;
  commit(onCalendar ? `Schedule ${t.title}` : `Unschedule ${t.title}`, (d) => {
    const x = d.tasks.find((y) => y.id === taskId);
    if (x) Object.assign(x, { onCalendar, pinned: false });
  });
}

/** Brain-dump a task into the inbox (not on the calendar yet). */
export function quickAddTask(title: string) {
  commit(`Add ${title}`, (d) => {
    d.tasks.push({
      id: uid(),
      title,
      category: 'other',
      durationMin: 30,
      onCalendar: false,
      pinned: false,
      done: false,
      createdAt: toLocal(new Date()),
    });
  });
}
