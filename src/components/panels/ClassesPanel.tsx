import { format } from 'date-fns';
import { useStore } from '../../store';
import type { Activity, AppData, Module, Semester } from '../../types';
import { EVENT_ICONS } from '../../lib/labels';
import { fromLocal, uid } from '../../lib/time';
import {
  SEMESTER_PRESETS,
  formatDays,
  formatWeeks,
  semesterFromPreset,
  weekIndex,
  weekLabelText,
} from '../../lib/weeks';
import { useUI } from '../ui';
import { Parts } from './Parts';

const shortDate = (dk: string) => format(fromLocal(dk), 'd MMM');

/** Semesters with their courses, then CCAs, clubs & activities. */
export function ClassesPanel() {
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const open = useUI((s) => s.open);
  const missingPresets = SEMESTER_PRESETS.filter((p) => !data.semesters.some((s) => s.name === p.name));

  return (
    <div className="panel">
      <div className="panel-actions">
        <button className="btn" onClick={() => open({ kind: 'semester' })}>
          + Semester
        </button>
        <button className="btn primary" onClick={() => open({ kind: 'module' })}>
          + Course
        </button>
      </div>
      {!data.semesters.length && (
        <p className="muted">
          Start by adding a semester: pick its first Monday and which weeks are teaching, recess or exam weeks.
        </p>
      )}
      <div className="chips">
        {missingPresets.map((p) => (
          <button
            key={p.name}
            className="chip"
            title="Adds the real term dates, breaks and holidays"
            onClick={() =>
              commit(`Add ${p.name}`, (d) => {
                d.semesters.push(semesterFromPreset(p, uid()));
              })
            }
          >
            + {p.name}
          </button>
        ))}
      </div>
      {data.semesters.map((sem) => (
        <SemesterSection key={sem.id} sem={sem} data={data} />
      ))}
      <section className="sem">
        <header className="sem-head">
          <span className="strong">CCAs, clubs &amp; activities</span>
          <span className="spacer" />
          <button className="chip" onClick={() => open({ kind: 'activity' })}>
            + CCA
          </button>
        </header>
        {!data.activities.length && (
          <p className="muted small">
            Weekly ones (Robotics MWR 18:00–20:00) or ones you book session by session (Hoofers).
          </p>
        )}
        {data.activities.map((a) => (
          <ActivityCard key={a.id} activity={a} data={data} />
        ))}
      </section>
    </div>
  );
}

function SemesterSection({ sem, data }: { sem: Semester; data: AppData }) {
  const open = useUI((s) => s.open);
  const current = weekIndex(sem, new Date());
  return (
    <section className="sem">
      <header className="sem-head">
        <button className="linkish strong" onClick={() => open({ kind: 'semester', id: sem.id })}>
          {sem.name}
        </button>
        {current !== null && <span className="tag neutral">Now: {weekLabelText(sem.layout[current])}</span>}
        {sem.style === 'nus' && (
          <button className="linkish" onClick={() => open({ kind: 'nusmods', semesterId: sem.id })}>
            Import NUSMods
          </button>
        )}
      </header>
      {data.modules
        .filter((m) => m.semesterId === sem.id)
        .map((m) => (
          <CourseCard key={m.id} course={m} sem={sem} data={data} />
        ))}
    </section>
  );
}

function CourseCard({ course, sem, data }: { course: Module; sem: Semester; data: AppData }) {
  const open = useUI((s) => s.open);
  const now = new Date();
  const upcoming = data.events
    .filter((e) => e.moduleId === course.id && fromLocal(e.end) >= now)
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div className="mod" style={{ borderLeftColor: course.color }}>
      <div className="mod-head">
        <button
          className="linkish strong mod-code"
          title={`${course.code} ${course.name}`}
          onClick={() => open({ kind: 'module', id: course.id })}
        >
          {course.code}
        </button>
        <span className="muted mod-name" title={course.name}>
          {course.name}
        </span>
        <button className="chip" onClick={() => open({ kind: 'class', moduleId: course.id })}>
          + class
        </button>
        <button
          className="chip"
          title="Exam, quiz, presentation, help session or group meeting"
          onClick={() => open({ kind: 'event', category: 'exam', moduleId: course.id })}
        >
          + event
        </button>
      </div>
      <ul className="lessons">
        {data.classes
          .filter((c) => c.moduleId === course.id)
          .map((c) => (
            <li key={c.id}>
              <button className="linkish" onClick={() => open({ kind: 'class', id: c.id })}>
                <Parts
                  items={[
                    c.kind,
                    `${formatDays(c.days, sem.style)} ${c.start}–${c.end}`,
                    `wk ${formatWeeks(c.weeks, sem.style !== 'us')}`,
                    c.location,
                  ]}
                />
              </button>
            </li>
          ))}
      </ul>
      <ul className="mod-tasks">
        {upcoming.map((e) => (
          <li key={e.id}>
            <button className="linkish" onClick={() => open({ kind: 'event', id: e.id })}>
              <Parts
                items={[
                  `${EVENT_ICONS[e.category] ?? '📅'} ${e.title}`,
                  format(fromLocal(e.start), 'EEE d MMM HH:mm'),
                  e.location,
                ]}
              />
            </button>
          </li>
        ))}
      </ul>
      <LinkedTasks moduleId={course.id} />
    </div>
  );
}

function ActivityCard({ activity: a, data }: { activity: Activity; data: AppData }) {
  const open = useUI((s) => s.open);
  const now = new Date();
  const sessions = data.events
    .filter((e) => e.activityId === a.id && fromLocal(e.end) >= now)
    .sort((x, y) => x.start.localeCompare(y.start));
  const dateRange =
    a.recurring !== false && (a.from || a.until)
      ? `${a.from ? shortDate(a.from) : '…'}–${a.until ? shortDate(a.until) : '…'}`
      : undefined;
  return (
    <div className="mod" style={{ borderLeftColor: a.color }}>
      <div className="mod-head">
        <button
          className="linkish strong mod-code"
          title={a.title}
          onClick={() => open({ kind: 'activity', id: a.id })}
        >
          {a.title}
        </button>
        <span className="mod-name" />
        <button
          className="chip"
          title="Add a session you booked"
          onClick={() => open({ kind: 'event', category: 'cca', activityId: a.id })}
        >
          + session
        </button>
        <button
          className="chip"
          title="Something to do for this, any time (e.g. glaze pottery)"
          onClick={() => open({ kind: 'task', activityId: a.id })}
        >
          + task
        </button>
      </div>
      <ul className="lessons">
        <li>
          <button className="linkish" onClick={() => open({ kind: 'activity', id: a.id })}>
            <Parts
              items={[
                a.recurring === false ? 'booked sessions' : `${formatDays(a.days, 'us')} ${a.start}–${a.end}`,
                a.location,
                dateRange,
              ]}
            />
          </button>
        </li>
      </ul>
      <LinkedTasks activityId={a.id} />
      {sessions.length > 0 && (
        <ul className="mod-tasks">
          {sessions.map((e) => (
            <li key={e.id}>
              <button className="linkish" onClick={() => open({ kind: 'event', id: e.id })}>
                <Parts
                  items={[
                    `🧗 ${format(fromLocal(e.start), 'EEE d MMM HH:mm')}–${format(fromLocal(e.end), 'HH:mm')}`,
                    e.location !== a.location ? e.location : undefined,
                    e.notes?.split('\n')[0],
                  ]}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Open tasks under a course or an activity. */
function LinkedTasks({ moduleId, activityId }: { moduleId?: string; activityId?: string }) {
  const allTasks = useStore((s) => s.data.tasks);
  const open = useUI((s) => s.open);
  const tasks = allTasks.filter(
    (t) => !t.done && ((moduleId && t.moduleId === moduleId) || (activityId && t.activityId === activityId)),
  );
  if (!tasks.length) return null;
  return (
    <ul className="mod-tasks">
      {tasks.map((t) => (
        <li key={t.id}>
          <button className="linkish" onClick={() => open({ kind: 'task', id: t.id })}>
            📝 {t.title}
            {t.deadline ? ` · due ${format(fromLocal(t.deadline), 'd MMM')}` : ''}
          </button>
        </li>
      ))}
    </ul>
  );
}
