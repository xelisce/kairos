import { useState } from 'react';
import { format } from 'date-fns';
import { useStore } from '../../store';
import type { AppData, Task } from '../../types';
import { quickAddTask, setTaskOnCalendar, toggleTaskDone } from '../../lib/actions';
import { taskWarning } from '../../lib/scheduler';
import { doneMinutes, nextSession } from '../../lib/tasks';
import { fmtDur, fromLocal } from '../../lib/time';
import { useNow } from '../../hooks/useNow';
import { useUI } from '../ui';

const LAST = '9999';
const byDeadline = (a: Task, b: Task) => (a.deadline ?? LAST).localeCompare(b.deadline ?? LAST);
const nextStart = (t: Task) => nextSession(t)?.start ?? LAST;
const bySlot = (a: Task, b: Task) => nextStart(a).localeCompare(nextStart(b));

export function TasksPanel() {
  const data = useStore((s) => s.data);
  const open = useUI((s) => s.open);
  const [quick, setQuick] = useState('');
  const [showDone, setShowDone] = useState(false);

  const add = () => {
    const title = quick.trim();
    if (!title) return;
    quickAddTask(title);
    setQuick('');
  };

  const pending = data.tasks.filter((t) => !t.done);
  const inbox = pending.filter((t) => !t.onCalendar).sort(byDeadline);
  const planned = pending.filter((t) => t.onCalendar).sort(bySlot);
  const done = data.tasks.filter((t) => t.done);
  const list = (tasks: Task[]) => (
    <ul className="tasks">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} data={data} />
      ))}
    </ul>
  );

  return (
    <div className="panel">
      <div className="quick">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Brain dump a task… (Enter)"
          aria-label="Quick add task"
        />
        <button className="btn primary" onClick={() => open({ kind: 'task' })}>
          + Task
        </button>
      </div>
      <h3>
        Inbox <span className="count">{inbox.length}</span>
      </h3>
      <p className="muted small">Tick 🗓 to auto-schedule. Untick to take it off the calendar.</p>
      {list(inbox)}
      <h3>
        On calendar <span className="count">{planned.length}</span>
      </h3>
      {list(planned)}
      <AwayList />
      <button className="linkish" onClick={() => setShowDone(!showDone)}>
        {showDone ? 'Hide' : 'Show'} done ({done.length})
      </button>
      {showDone && list(done)}
    </div>
  );
}

/** Trips and holidays coming up (no tasks planned then), plus a button to add one. */
function AwayList() {
  const away = useStore((s) => s.data.away);
  const open = useUI((s) => s.open);
  const now = useNow(60_000);
  const upcoming = away.filter((a) => fromLocal(a.end) > now).sort((x, y) => x.start.localeCompare(y.start));
  const when = (v: string) => format(fromLocal(v), 'EEE d MMM HH:mm');
  return (
    <>
      <h3 className="away-head">
        Away <span className="count">{upcoming.length}</span>
        <button className="linkish" onClick={() => open({ kind: 'away' })}>
          + Time away
        </button>
      </h3>
      {upcoming.length === 0 ? (
        <p className="muted small">Going on a trip? Add it here and no tasks get planned then.</p>
      ) : (
        <ul className="tasks">
          {upcoming.map((a) => (
            <li key={a.id} className="task">
              <button className="task-main" onClick={() => open({ kind: 'away', id: a.id })}>
                <span className="task-title">✈️ {a.title || 'Away'}</span>
                <span className="task-meta">
                  {when(a.start)} → {when(a.end)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TaskRow({ task: t, data }: { task: Task; data: AppData }) {
  const open = useUI((s) => s.open);
  const now = useNow(60_000);
  const warning = taskWarning(t, now, data.settings.warnHours);
  const next = nextSession(t);
  const openSessions = t.sessions.filter((s) => !s.done);
  const course = data.modules.find((m) => m.id === t.moduleId);
  const activity = !course && t.activityId ? data.activities.find((a) => a.id === t.activityId) : undefined;
  return (
    <li className={`task ${warning?.level ?? ''}`}>
      <input type="checkbox" aria-label="Done" checked={t.done} onChange={() => toggleTaskDone(t.id)} />
      <button className="task-main" onClick={() => open({ kind: 'task', id: t.id })}>
        <span className="task-title">
          {warning && <span title={warning.text}>{warning.level === 'bad' ? '❗' : '⚠️'} </span>}
          {course && (
            <span className="tag" style={{ background: course.color }}>
              {course.code}
            </span>
          )}
          {activity && (
            <span className="tag" style={{ background: activity.color }}>
              {activity.title}
            </span>
          )}
          {t.title}
        </span>
        <span className="task-meta">
          {fmtDur(t.durationMin)}
          {t.deadline && <> · due {format(fromLocal(t.deadline), 'EEE d MMM HH:mm')}</>}
          {next && t.onCalendar && (
            <>
              {' '}
              · 🗓 {format(fromLocal(next.start), 'EEE HH:mm')}
              {next.pinned ? ' 📌' : ''}
              {openSessions.length > 1 ? ` (+${openSessions.length - 1} more)` : ''}
            </>
          )}
          {t.split && (
            <>
              {' '}
              · {fmtDur(doneMinutes(t))} of {fmtDur(t.durationMin)} done
            </>
          )}
          {t.rolledForward && <> · moved forward</>}
          {warning && (
            <>
              {' '}
              · <span className={warning.level}>{warning.text}</span>
            </>
          )}
        </span>
      </button>
      <label className="cal-toggle" title="Put on calendar (auto-scheduled)">
        <input type="checkbox" checked={t.onCalendar} onChange={(e) => setTaskOnCalendar(t.id, e.target.checked)} />
        <span>🗓</span>
      </label>
    </li>
  );
}
