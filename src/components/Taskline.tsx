// The Taskline view: one semester's tasks left to right, a bar per task (start → deadline) with
// a dot per session. Drag ◆ to move a deadline, drag a dot to move that session to another day.
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { useStore } from '../store';
import { moveOcc } from '../lib/actions';
import { expand } from '../lib/expand';
import { fmtDur, fromLocal, toLocal } from '../lib/time';
import {
  currentSemester,
  EXTRA_LABELS,
  semesterRange,
  tasklineGroups,
  type Bar,
  type Dot,
  type Extra,
  type GroupBy,
} from '../lib/taskline';
import { weekLabelText } from '../lib/weeks';
import { useNow } from '../hooks/useNow';
import { usePref } from '../hooks/usePref';
import { useUI } from './ui';

const DAY = 86_400_000;
const PX_PER_DAY = { day: 30, week: 9 } as const;
type Zoom = keyof typeof PX_PER_DAY;

interface Prefs {
  semId?: string;
  groupBy: GroupBy;
  zoom: Zoom;
  showDone: boolean;
  extras: Extra[];
}

/** What's being dragged, and how far (px). */
type Drag = { kind: 'deadline' | 'dot'; taskId: string; sessionId?: string; startX: number; dx: number };

export function Taskline() {
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const open = useUI((s) => s.open);
  const now = useNow(60_000);
  const [prefs, setPrefs] = usePref<Prefs>('kairos:taskline', {
    groupBy: 'course',
    zoom: 'day',
    showDone: false,
    extras: [],
  });
  const set = (p: Partial<Prefs>) => setPrefs({ ...prefs, ...p });
  const sem = data.semesters.find((s) => s.id === prefs.semId) ?? currentSemester(data, now);
  const groups = useMemo(
    () => (sem ? tasklineGroups(data, sem, prefs, now) : []),
    // `now` changes every minute; that's fine.
    [data, sem, prefs, now],
  );
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const px = PX_PER_DAY[prefs.zoom];
  const range = sem ? semesterRange(sem) : { start: now, end: addDays(now, 1) };
  const x = (d: Date) => ((d.getTime() - range.start.getTime()) / DAY) * px;
  const width = differenceInCalendarDays(range.end, range.start) * px;
  const todayX = x(now);

  const scrollToToday = () => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, todayX - 80);
  };
  // Start at today when the semester or zoom changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(scrollToToday, [sem?.id, prefs.zoom]);

  /** Snapped number of days the current drag has moved. */
  const dragDays = drag ? Math.round(drag.dx / px) : 0;
  const startDrag = (e: React.PointerEvent, d: Omit<Drag, 'startX' | 'dx'>, onClick: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let dx = 0;
    setDrag({ ...d, startX, dx });
    const move = (ev: PointerEvent) => {
      dx = ev.clientX - startX;
      setDrag({ ...d, startX, dx });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      const days = Math.round(dx / px);
      if (Math.abs(dx) < 4) onClick();
      else if (days) finishDrag(d, days);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const finishDrag = (d: Omit<Drag, 'startX' | 'dx'>, days: number) => {
    const t = data.tasks.find((x) => x.id === d.taskId);
    if (!t) return;
    if (d.kind === 'deadline' && t.deadline) {
      const next = toLocal(addDays(fromLocal(t.deadline), days));
      commit(`Move deadline of ${t.title} to ${format(fromLocal(next), 'EEE d MMM')}`, (draft) => {
        const task = draft.tasks.find((x) => x.id === t.id);
        if (task) task.deadline = next;
      });
    } else if (d.kind === 'dot' && d.sessionId) {
      const s = t.sessions.find((x) => x.id === d.sessionId);
      const occ = s && occFor(t.id, s.id, fromLocal(s.start));
      if (occ) moveOcc(occ, addDays(occ.start, days), addDays(occ.end, days));
    }
  };

  /** The calendar block for one session (to open it, or move it like a drag on the calendar). */
  const occFor = (taskId: string, sessionId: string, start: Date) =>
    expand(data, addDays(start, -1), addDays(start, 1)).find((o) => o.id === `task:${taskId}:${sessionId}`);

  if (!sem)
    return (
      <div className="tl-empty muted">
        Add a semester in the <b>Classes</b> tab to see its tasks here.
      </div>
    );

  const toggleExtra = (e: Extra) =>
    set({ extras: prefs.extras.includes(e) ? prefs.extras.filter((v) => v !== e) : [...prefs.extras, e] });

  return (
    <div className="taskline">
      <div className="tl-toolbar">
        <select value={sem.id} onChange={(e) => set({ semId: e.target.value })} aria-label="Semester">
          {data.semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label="Group by">
          {(['course', 'time'] as const).map((g) => (
            <button key={g} className={prefs.groupBy === g ? 'on' : ''} onClick={() => set({ groupBy: g })}>
              {g === 'course' ? 'By course' : 'By time'}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Zoom">
          {(['day', 'week'] as const).map((z) => (
            <button key={z} className={prefs.zoom === z ? 'on' : ''} onClick={() => set({ zoom: z })}>
              {z === 'day' ? 'Days' : 'Weeks'}
            </button>
          ))}
        </div>
        <button className="btn" onClick={scrollToToday}>
          Today
        </button>
        <label className="tl-check">
          <input type="checkbox" checked={prefs.showDone} onChange={(e) => set({ showDone: e.target.checked })} />
          Done
        </label>
        <span className="tl-also muted small">Also:</span>
        {(Object.keys(EXTRA_LABELS) as Extra[]).map((e) => (
          <label key={e} className="tl-check">
            <input type="checkbox" checked={prefs.extras.includes(e)} onChange={() => toggleExtra(e)} />
            {EXTRA_LABELS[e]}
          </label>
        ))}
        <span className="tl-legend muted small" title="Drag ◆ to move a deadline, drag a dot to move a session">
          ● planned ✓ done ○ missed ◆ deadline
        </span>
      </div>

      <div className="tl-scroll" ref={scroller}>
        <div className="tl-body" style={{ width: `calc(var(--tl-label) + ${width}px)` }}>
          {/* Week header */}
          <div className="tl-row tl-head">
            <div className="tl-label">{sem.name}</div>
            <div className="tl-track" style={{ width }}>
              {sem.layout.map((w, i) => (
                <div
                  key={i}
                  className={`tl-week ${w.type === 'break' ? 'break' : ''}`}
                  style={{ left: i * 7 * px, width: 7 * px }}
                  title={`${weekLabelText(w)} · from ${format(addDays(range.start, i * 7), 'd MMM')}`}
                >
                  {w.type === 'teaching' ? `W${w.n}` : w.name}
                  {prefs.zoom === 'day' && <small> {format(addDays(range.start, i * 7), 'd/M')}</small>}
                </div>
              ))}
            </div>
          </div>

          {/* Break weeks shaded, and today's line, behind the rows */}
          <div className="tl-overlay" style={{ width }}>
            {sem.layout.map((w, i) =>
              w.type === 'break' ? (
                <div key={i} className="tl-shade" style={{ left: i * 7 * px, width: 7 * px }} />
              ) : null,
            )}
            {todayX >= 0 && todayX <= width && <div className="tl-today" style={{ left: todayX }} />}
          </div>

          {groups.length === 0 && (
            <div className="tl-row">
              <div className="tl-label muted small">No tasks in this semester yet.</div>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.id} className="tl-group">
              <div className="tl-row tl-group-head">
                <div className="tl-label">
                  {g.color && <span className="tl-chip" style={{ background: g.color }} />}
                  {g.title} <span className="count">{g.bars.length}</span>
                </div>
                <div className="tl-track" style={{ width }}>
                  {g.markers.map((m) => (
                    <span
                      key={m.id}
                      className="tl-marker"
                      style={{ left: x(m.date), color: g.color }}
                      title={`${m.title} · ${format(m.date, 'EEE d MMM HH:mm')}`}
                      onClick={() => open({ kind: 'event', id: m.id })}
                    >
                      ◆<small>{m.title}</small>
                    </span>
                  ))}
                </div>
              </div>
              {g.bars.map((b) => (
                <BarRow
                  key={b.task.id}
                  bar={b}
                  showTag={prefs.groupBy === 'time'}
                  x={x}
                  width={width}
                  drag={drag}
                  dragDays={dragDays}
                  px={px}
                  now={now}
                  onOpenTask={() => open({ kind: 'task', id: b.task.id })}
                  onDragDeadline={(e) =>
                    startDrag(e, { kind: 'deadline', taskId: b.task.id }, () => open({ kind: 'task', id: b.task.id }))
                  }
                  onDragDot={(e, dot) =>
                    startDrag(e, { kind: 'dot', taskId: b.task.id, sessionId: dot.sessionId }, () => {
                      const occ = occFor(b.task.id, dot.sessionId, dot.start);
                      if (occ) open({ kind: 'occ', occ });
                    })
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BarRow({
  bar: b,
  showTag,
  x,
  width,
  drag,
  dragDays,
  px,
  now,
  onOpenTask,
  onDragDeadline,
  onDragDot,
}: {
  bar: Bar;
  showTag: boolean;
  x: (d: Date) => number;
  width: number;
  drag: Drag | null;
  dragDays: number;
  px: number;
  now: Date;
  onOpenTask: () => void;
  onDragDeadline: (e: React.PointerEvent) => void;
  onDragDot: (e: React.PointerEvent, dot: Dot) => void;
}) {
  const t = b.task;
  const clamp = (v: number) => Math.min(width, Math.max(0, v));
  const left = clamp(x(b.from));
  const right = clamp(x(b.to));
  const draggingDeadline = drag?.kind === 'deadline' && drag.taskId === t.id;
  const overdue = !t.done && b.deadline && b.deadline < now;
  const meta = [
    t.split || t.sessions.length > 1 ? `${fmtDur(b.doneMin)} of ${fmtDur(t.durationMin)}` : fmtDur(t.durationMin),
    b.deadline && `due ${format(b.deadline, 'EEE d MMM')}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={`tl-row tl-bar-row ${t.done ? 'done' : ''}`}>
      <button className="tl-label tl-task" onClick={onOpenTask} title={t.title}>
        <span className="tl-title">
          {t.done && '✓ '}
          {showTag && b.tag && (
            <span className="tag" style={{ background: b.color }}>
              {b.tag}
            </span>
          )}
          {t.title}
        </span>
        <span className="tl-meta">{meta}</span>
      </button>
      <div className="tl-track" style={{ width }}>
        <div
          className="tl-bar"
          style={{ left, width: Math.max(4, right - left), borderColor: b.color, ['--c' as string]: b.color }}
          onClick={onOpenTask}
          title={t.title}
        />
        {b.dots.map((d) => {
          const moving = drag?.kind === 'dot' && drag.sessionId === d.sessionId;
          const shift = moving ? dragDays * px : 0;
          return (
            <span
              key={d.sessionId}
              className={`tl-dot ${d.state} ${d.late ? 'late' : ''} ${moving ? 'dragging' : ''}`}
              style={{ left: x(d.start) + shift, ['--c' as string]: b.color }}
              title={`${format(addDays(d.start, moving ? dragDays : 0), 'EEE d MMM HH:mm')} · ${fmtDur((d.end.getTime() - d.start.getTime()) / 60000)}${d.late ? ' · after the deadline' : ''}${d.state === 'done' ? ' · done' : d.state === 'missed' ? ' · missed' : ''}`}
              onPointerDown={(e) => onDragDot(e, d)}
            >
              {d.state === 'done' ? '✓' : ''}
            </span>
          );
        })}
        {b.deadline && (
          <span
            className={`tl-deadline ${overdue ? 'overdue' : ''} ${draggingDeadline ? 'dragging' : ''}`}
            style={{ left: x(b.deadline) + (draggingDeadline ? dragDays * px : 0) }}
            title={`Due ${format(addDays(b.deadline, draggingDeadline ? dragDays : 0), 'EEE d MMM HH:mm')} · drag to move`}
            onPointerDown={onDragDeadline}
          >
            ◆{draggingDeadline && <small>{format(addDays(b.deadline, dragDays), 'EEE d MMM')}</small>}
          </span>
        )}
      </div>
    </div>
  );
}
