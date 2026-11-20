// The task's sessions, editable: tick done, change the time or length, delete, or add one.
// A session you add or change is pinned (auto-schedule leaves it where you put it).
import { addDays, addMinutes, setHours, startOfDay } from 'date-fns';
import type { Task, TaskSession } from '../../types';
import { plannedMinutes, sessionMinutes, sortedSessions } from '../../lib/tasks';
import { fmtDur, fromLocal, toLocal, uid } from '../../lib/time';
import { DateTimeInput, NumberInput } from '../ui';
import { MAX_BLOCK_MIN } from '../../lib/limits';

export function SessionList({ task, onChange }: { task: Task; onChange: (sessions: TaskSession[]) => void }) {
  const auto = task.autoPlan !== false;
  const edit = (id: string, patch: Partial<TaskSession>) =>
    onChange(task.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => onChange(task.sessions.filter((s) => s.id !== id));

  const add = () => {
    const sorted = sortedSessions(task);
    const last = sorted[sorted.length - 1];
    // The day after the last session, same time; else tomorrow 09:00.
    const start = last ? addDays(fromLocal(last.start), 1) : setHours(addDays(startOfDay(new Date()), 1), 9);
    const left = task.durationMin - plannedMinutes(task);
    const length = Math.min(left > 0 ? left : 60, task.split?.maxSessionMin ?? 120);
    onChange([
      ...task.sessions,
      { id: uid(), start: toLocal(start), end: toLocal(addMinutes(start, length)), done: false, pinned: true },
    ]);
  };

  const planned = plannedMinutes(task);
  const left = task.durationMin - planned;
  return (
    <div>
      <span className="field-label">Sessions</span>
      <ul className="sessions editable">
        {sortedSessions(task).map((s) => {
          const len = sessionMinutes(s);
          return (
            <li key={s.id} className={s.done ? 'done' : ''}>
              <input
                type="checkbox"
                aria-label="Session done"
                title="Done"
                checked={s.done}
                onChange={(e) => edit(s.id, { done: e.target.checked })}
              />
              <DateTimeInput
                value={s.start}
                onChange={(v) =>
                  v && edit(s.id, { start: v, end: toLocal(addMinutes(fromLocal(v), len)), pinned: true })
                }
              />
              <span className="session-len">
                <NumberInput
                  min={5}
                  max={MAX_BLOCK_MIN}
                  value={len}
                  onCommit={(m) => edit(s.id, { end: toLocal(addMinutes(fromLocal(s.start), m)), pinned: true })}
                />
                min
              </span>
              {auto && !s.done && (
                <button
                  type="button"
                  className={`linkish pin ${s.pinned ? 'on' : ''}`}
                  title={
                    s.pinned
                      ? 'You placed it: it stays here. Click to let auto-schedule move it.'
                      : 'Auto-scheduled: it may move. Click to keep it here.'
                  }
                  onClick={() => edit(s.id, { pinned: !s.pinned })}
                >
                  {s.pinned ? '📌' : 'auto'}
                </button>
              )}
              <button
                type="button"
                className="icon-btn small"
                aria-label="Delete session"
                title={auto ? 'Delete this session (auto-schedule finds another time for it)' : 'Delete this session'}
                onClick={() => remove(s.id)}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sessions-foot">
        <button type="button" className="btn small" onClick={add}>
          + Add session
        </button>
        <span className="muted small">
          {fmtDur(planned)} of {fmtDur(task.durationMin)} planned
          {left > 0 && (auto ? ' · auto-schedule finds time for the rest' : ` · ${fmtDur(left)} not planned yet`)}
          {left < 0 && auto && ' · auto-scheduled sessions shrink to fit when you save'}
        </span>
      </div>
    </div>
  );
}
