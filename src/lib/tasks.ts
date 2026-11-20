// Task helpers: sessions, progress and split limits.
import type { Task, TaskSession, TaskSplit } from '../types';
import { fromLocal } from './time';

export const DEFAULT_SPLIT: TaskSplit = { maxSessionMin: 120, maxPerDayMin: 120, minSessionMin: 30 };

export const sessionMinutes = (s: Pick<TaskSession, 'start' | 'end'>) =>
  Math.round((fromLocal(s.end).getTime() - fromLocal(s.start).getTime()) / 60000);

export const sortedSessions = (t: Task) => [...t.sessions].sort((a, b) => a.start.localeCompare(b.start));

/** Minutes already done (finished sessions; all of it if the whole task is done). */
export const doneMinutes = (t: Task) =>
  t.done ? t.durationMin : t.sessions.filter((s) => s.done).reduce((n, s) => n + sessionMinutes(s), 0);

/** Minutes covered by sessions (done or planned). */
export const plannedMinutes = (t: Task) => t.sessions.reduce((n, s) => n + sessionMinutes(s), 0);

/** Minutes that still need a session. */
export const unplannedMinutes = (t: Task) => Math.max(0, t.durationMin - plannedMinutes(t));

/** The limits the scheduler uses: a task that isn't split is one session of its whole length. */
export const limitsOf = (t: Task): TaskSplit =>
  t.split ?? { maxSessionMin: t.durationMin, maxPerDayMin: t.durationMin, minSessionMin: t.durationMin };

/** The next session that isn't done yet. */
export const nextSession = (t: Task) => sortedSessions(t).find((s) => !s.done);
