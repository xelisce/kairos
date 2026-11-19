// High-level edits used by the calendar and panels.
import { addMinutes } from 'date-fns';
import { useStore } from '../store';
import type { ClassKind, Occ } from '../types';
import { fromLocal, toLocal } from './time';

const commit = (...a: Parameters<ReturnType<typeof useStore.getState>['commit']>) => useStore.getState().commit(...a);

/** Move or resize any occurrence to a new start/end. */
export function moveOcc(o: Occ, start: Date, end: Date) {
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
    case 'routine':
      commit(`Move ${o.title}`, (d) => {
        const r = d.routines.find((x) => x.id === src.routineId);
        if (r) r.overrides[src.date] = { start: s, end: e };
      });
      break;
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

/** Skip one occurrence of a class or routine. */
export function skipOcc(o: Occ) {
  const src = o.source;
  if (src.type === 'class') {
    commit(`Skip ${o.title} on ${src.date}`, (d) => {
      const c = d.classes.find((x) => x.id === src.seriesId);
      if (c && !c.skipDates.includes(src.date)) c.skipDates.push(src.date);
    });
  } else if (src.type === 'routine') {
    commit(`Skip ${o.title} on ${src.date}`, (d) => {
      const r = d.routines.find((x) => x.id === src.routineId);
      if (r && !r.skipDates.includes(src.date)) r.skipDates.push(src.date);
    });
  } else if (src.type === 'activity') {
    commit(`Skip ${o.title} on ${src.date}`, (d) => {
      const a = d.activities.find((x) => x.id === src.activityId);
      if (a && !a.skipDates.includes(src.date)) a.skipDates.push(src.date);
    });
  }
}

/** Put a moved class/routine back to its normal time. */
export function resetOcc(o: Occ) {
  const src = o.source;
  commit(`Reset ${o.title}`, (d) => {
    if (src.type === 'class') delete d.classes.find((x) => x.id === src.seriesId)?.overrides[src.date];
    if (src.type === 'routine') delete d.routines.find((x) => x.id === src.routineId)?.overrides[src.date];
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
  const affected = occs.filter((o) => o.end > now && o.start < todayEnd && (o.source.type === 'routine' || o.source.type === 'task'));
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
        if (t && !t.done) { t.scheduled = { start: ns, end: ne }; t.pinned = true; }
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
