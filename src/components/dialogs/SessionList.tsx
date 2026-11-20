import { format } from 'date-fns';
import type { Task, TaskSession } from '../../types';
import { sessionMinutes, sortedSessions } from '../../lib/tasks';
import { fmtDur, fromLocal } from '../../lib/time';

/** The task's sessions: tick them done, or let auto-schedule move ones you placed. */
export function SessionList({ task, onChange }: { task: Task; onChange: (sessions: TaskSession[]) => void }) {
  const edit = (id: string, patch: Partial<TaskSession>) =>
    onChange(task.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  return (
    <div>
      <span className="field-label">Sessions</span>
      <ul className="sessions">
        {sortedSessions(task).map((s) => (
          <li key={s.id} className={s.done ? 'done' : ''}>
            <label className="check small">
              <input type="checkbox" checked={s.done} onChange={(e) => edit(s.id, { done: e.target.checked })} />
              {format(fromLocal(s.start), 'EEE d MMM HH:mm')} · {fmtDur(sessionMinutes(s))}
            </label>
            {s.pinned && !s.done && (
              <button type="button" className="linkish" onClick={() => edit(s.id, { pinned: false })}>
                📌 let auto-schedule move it
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
