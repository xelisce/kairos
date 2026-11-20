// The Taskline view: one semester's tasks left to right, a bar per task (start → deadline) with
// a dot per session. Drag ◆ to move a deadline, drag a dot to move that session to another day.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
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
import { US_DAY_LETTERS, weekLabelText } from '../lib/weeks';
import { useNow } from '../hooks/useNow';
import { useNarrow } from '../hooks/useNarrow';
import { usePref } from '../hooks/usePref';
import type { AwayRange, Semester } from '../types';
import { Field, Modal, useUI } from './ui';

const DAY = 86_400_000;
/** Header height without label strips, and each strip's height. */
const HEAD_H = 56;
const LANE_H = 20;
/** Zoom: how wide one day is. Presets for the buttons; the wheel zooms smoothly between the limits. */
const ZOOM_PRESETS = { Weeks: 9, Days: 30, Hours: 120 } as const;
const MIN_PX = 4;
const MAX_PX = 400;
const clampPx = (v: number) => Math.min(MAX_PX, Math.max(MIN_PX, v));

interface Prefs {
  semId?: string;
  groupBy: GroupBy;
  /** Width of one day, in pixels. */
  px: number;
  showDone: boolean;
  /** Holidays (Thanksgiving…) and your time away, as tinted columns. */
  showMarks: boolean;
  extras: Extra[];
}

/** What's being dragged, and how far (px). */
type Drag = { kind: 'deadline' | 'dot'; taskId: string; sessionId?: string; startX: number; dx: number };

export function Taskline() {
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const open = useUI((s) => s.open);
  const now = useNow(60_000);
  const narrow = useNarrow();
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = usePref<Prefs>('kairos:taskline', {
    groupBy: 'course',
    px: ZOOM_PRESETS.Days,
    showDone: false,
    showMarks: true,
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

  const px = clampPx(prefs.px || ZOOM_PRESETS.Days);
  const range = sem ? semesterRange(sem) : { start: now, end: addDays(now, 1) };
  // Whole calendar days plus the time of day, so a daylight-saving change doesn't nudge things off the day grid.
  const x = (d: Date) =>
    (differenceInCalendarDays(d, range.start) + (d.getTime() - startOfDay(d).getTime()) / DAY) * px;
  const days = differenceInCalendarDays(range.end, range.start);
  const width = days * px;
  const todayX = x(now);
  const clampX = (v: number) => Math.min(width, Math.max(0, v));
  const marks = sem && prefs.showMarks ? markSpans(sem.holidays, data.away, range) : [];
  // One label strip under the dates for holidays, one for time away (they can overlap).
  const lanes = (['holiday', 'away'] as const).filter((k) => marks.some((m) => m.kind === k));

  const scrollToToday = () => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, todayX - 80);
  };
  // Start at today when the semester changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(scrollToToday, [sem?.id]);

  /**
   * Change the zoom, keeping the day under `anchorX` (px from the scroller's left edge; default:
   * the middle of the timeline) in the same place on screen.
   */
  const pendingScroll = useRef<number | null>(null);
  const zoomTo = (next: number, anchorX?: number) => {
    const el = scroller.current;
    const newPx = clampPx(next);
    if (!el || newPx === px) return;
    const label = (el.querySelector('.tl-label') as HTMLElement | null)?.offsetWidth ?? 0;
    const ax = anchorX ?? label + (el.clientWidth - label) / 2;
    const dayAtAnchor = (el.scrollLeft + ax - label) / px;
    pendingScroll.current = dayAtAnchor * newPx - (ax - label);
    setPrefs((p) => ({ ...p, px: newPx }));
  };
  useLayoutEffect(() => {
    if (pendingScroll.current !== null && scroller.current) scroller.current.scrollLeft = pendingScroll.current;
    pendingScroll.current = null;
  }, [px]);

  // Wheel over the dates header, or Ctrl/⌘ + wheel (and trackpad pinch) anywhere: zoom in/out.
  // A plain wheel over the rows still scrolls up and down.
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  const pxRef = useRef(px);
  pxRef.current = px;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const overHeader = (e.target as HTMLElement).closest('.tl-head');
      if (!overHeader && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) || e.deltaX;
      const rect = el.getBoundingClientRect();
      zoomRef.current(pxRef.current * Math.exp(-delta * 0.002), e.clientX - rect.left);
    };
    // Two-finger pinch on a phone: zoom around the point between the fingers.
    let pinch: { dist: number; px: number } | null = null;
    const fingers = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      const rect = el.getBoundingClientRect();
      return {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        midX: (a.clientX + b.clientX) / 2 - rect.left,
      };
    };
    const onTouchStart = (e: TouchEvent) => {
      pinch = e.touches.length === 2 ? { dist: fingers(e).dist, px: pxRef.current } : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const { dist, midX } = fingers(e);
      zoomRef.current((pinch.px * dist) / pinch.dist, midX);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [sem?.id]);

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

  const semesterPick = (
    <select value={sem.id} onChange={(e) => set({ semId: e.target.value })} aria-label="Semester">
      {data.semesters.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
  const groupPick = (
    <div className="segmented" role="group" aria-label="Group by">
      {(['course', 'time'] as const).map((g) => (
        <button key={g} className={prefs.groupBy === g ? 'on' : ''} onClick={() => set({ groupBy: g })}>
          {g === 'course' ? 'By course' : 'By time'}
        </button>
      ))}
    </div>
  );
  const zoomPick = (
    <div
      className="segmented"
      role="group"
      aria-label="Zoom"
      title="Or scroll over the dates (Ctrl + scroll anywhere) to zoom"
    >
      <button onClick={() => zoomTo(px / 1.5)} aria-label="Zoom out">
        −
      </button>
      {(Object.entries(ZOOM_PRESETS) as [string, number][]).map(([name, v]) => (
        <button key={name} className={Math.abs(px - v) < 0.5 ? 'on' : ''} onClick={() => zoomTo(v)}>
          {name}
        </button>
      ))}
      <button onClick={() => zoomTo(px * 1.5)} aria-label="Zoom in">
        +
      </button>
    </div>
  );
  const checks = (
    <>
      <label className="tl-check" title="Show holidays (like Thanksgiving) and your time away">
        <input type="checkbox" checked={prefs.showMarks} onChange={(e) => set({ showMarks: e.target.checked })} />
        Holidays &amp; away
      </label>
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
    </>
  );
  const legend = (
    <span className="tl-legend muted small" title="Drag ◆ to move a deadline, drag a dot to move a session">
      ● planned ✓ done ○ missed ◆ deadline
    </span>
  );

  return (
    <div className="taskline">
      {narrow ? (
        <div className="tl-toolbar">
          <button className="btn" onClick={scrollToToday}>
            Today
          </button>
          <span className="tl-sem-name muted small">{sem.name}</span>
          <button className="btn" onClick={() => setShowSettings(true)} aria-label="Taskline settings">
            ⚙
          </button>
        </div>
      ) : (
        <div className="tl-toolbar">
          {semesterPick}
          {groupPick}
          {zoomPick}
          <button className="btn" onClick={scrollToToday}>
            Today
          </button>
          {checks}
          {legend}
        </div>
      )}
      {narrow && showSettings && (
        <Modal title="Taskline" onClose={() => setShowSettings(false)}>
          <div className="tl-settings">
            <Field label="Semester">{semesterPick}</Field>
            <Field label="Group">{groupPick}</Field>
            <Field label="Zoom" hint="Or pinch the timeline with two fingers">
              {zoomPick}
            </Field>
            <div className="tl-settings-checks">{checks}</div>
            {legend}
          </div>
        </Modal>
      )}

      <div className="tl-scroll" ref={scroller}>
        <div className="tl-body" style={{ width: `calc(var(--tl-label) + ${width}px)` }}>
          {/* Week header */}
          <div className="tl-row tl-head">
            <div className="tl-label">{sem.name}</div>
            <div className="tl-track" style={{ width, minHeight: HEAD_H + lanes.length * LANE_H }}>
              {sem.layout.map((w, i) => (
                <div
                  key={i}
                  className={`tl-week ${w.type === 'break' ? 'break' : ''}`}
                  style={{ left: i * 7 * px, width: 7 * px }}
                  title={`${weekLabelText(w)} · from ${format(addDays(range.start, i * 7), 'd MMM')}`}
                >
                  <span className="tl-sticky">
                    {w.type === 'teaching' ? `W${w.n}` : w.name}
                    {px >= 14 && <small> {format(addDays(range.start, i * 7), 'd/M')}</small>}
                  </span>
                </div>
              ))}
              {px >= 16 && <DayLabels start={range.start} days={days} px={px} usLetters={sem.style === 'us'} />}
              {marks.map((mk, i) => (
                <div
                  key={i}
                  className={`tl-mark-label ${mk.kind}`}
                  style={{
                    left: clampX(x(mk.start)),
                    width: Math.max(2, clampX(x(mk.end)) - clampX(x(mk.start))),
                    top: HEAD_H + lanes.indexOf(mk.kind) * LANE_H,
                  }}
                  title={mk.title}
                  onClick={mk.awayId ? () => open({ kind: 'away', id: mk.awayId }) : undefined}
                >
                  <span className="tl-sticky">{mk.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Break weeks shaded, and today's line, behind the rows */}
          <div
            className="tl-overlay"
            style={{
              width,
              // A faint line between days once they're wide enough to tell apart.
              backgroundImage:
                px >= 16
                  ? `repeating-linear-gradient(90deg, color-mix(in srgb, var(--border) 45%, transparent) 0 1px, transparent 1px ${px}px)`
                  : undefined,
            }}
          >
            {sem.layout.map((w, i) =>
              w.type === 'break' ? (
                <div key={i} className="tl-shade" style={{ left: i * 7 * px, width: 7 * px }} />
              ) : null,
            )}
            {/* Weekends: tinted top to bottom. */}
            {Array.from({ length: days }, (_, i) => i)
              .filter((i) => addDays(range.start, i).getDay() === 6 || (i === 0 && range.start.getDay() === 0))
              .map((i) => (
                <div
                  key={`we${i}`}
                  className="tl-weekend"
                  style={{ left: i * px, width: (range.start.getDay() === 0 && i === 0 ? 1 : 2) * px }}
                />
              ))}
            {marks.map((mk, i) => (
              <div
                key={`mk${i}`}
                className={`tl-mark ${mk.kind}`}
                style={{ left: clampX(x(mk.start)), width: Math.max(2, clampX(x(mk.end)) - clampX(x(mk.start))) }}
              />
            ))}
            {/* Today's column, once days are wide enough to see one. */}
            {px >= 16 && todayX >= 0 && todayX <= width && (
              <div className="tl-today-col" style={{ left: Math.floor(todayX / px) * px, width: px }} />
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
          {/* Fills the rest of the height, so the names column runs all the way down. */}
          <div className="tl-row tl-fill">
            <div className="tl-label" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface MarkSpan {
  kind: 'holiday' | 'away';
  label: string;
  title: string;
  start: Date;
  end: Date;
  awayId?: string;
}

/** Holidays (back-to-back days with the same name become one span) and time away, within the semester. */
function markSpans(holidays: Semester['holidays'], away: AwayRange[], range: { start: Date; end: Date }): MarkSpan[] {
  const out: MarkSpan[] = [];
  for (const h of [...holidays].sort((a, b) => a.date.localeCompare(b.date))) {
    const day = fromLocal(h.date);
    const prev = out[out.length - 1];
    if (prev?.kind === 'holiday' && prev.label === `🎉 ${h.name}` && prev.end.getTime() === day.getTime())
      prev.end = addDays(day, 1);
    else
      out.push({
        kind: 'holiday',
        label: `🎉 ${h.name}`,
        title: `Holiday: ${h.name}`,
        start: day,
        end: addDays(day, 1),
      });
  }
  for (const a of away) {
    const start = fromLocal(a.start);
    const end = fromLocal(a.end);
    const name = a.title || 'Away';
    out.push({
      kind: 'away',
      label: `✈️ ${name}`,
      title: `Away: ${name} (${format(start, 'EEE d MMM HH:mm')} → ${format(end, 'EEE d MMM HH:mm')}) · click to edit`,
      start,
      end,
      awayId: a.id,
    });
  }
  return out.filter((m) => m.start < range.end && range.start < m.end);
}

/** One label per day under the weeks: "R 19", or "Thu 19 Nov" when there's room; hours when zoomed far in. */
function DayLabels({ start, days, px, usLetters }: { start: Date; days: number; px: number; usLetters: boolean }) {
  // Hour marks only when a day has room for at least three readable ones (06:00 12:00 18:00).
  const hourStep = px >= 360 ? 3 : px >= 180 ? 6 : 0;
  return (
    <>
      {Array.from({ length: days }, (_, i) => {
        const d = addDays(start, i);
        const wd = (d.getDay() + 6) % 7;
        const text =
          px >= 70 ? format(d, 'EEE d MMM') : `${usLetters ? US_DAY_LETTERS[wd] : format(d, 'EEEEE')} ${d.getDate()}`;
        return (
          <div key={i} className={`tl-day ${wd >= 5 ? 'weekend' : ''}`} style={{ left: i * px, width: px }}>
            <span className="tl-sticky">{text}</span>
            {hourStep > 0 &&
              Array.from({ length: 24 / hourStep - 1 }, (_, h) => (
                <span key={h} className="tl-hour" style={{ left: ((h + 1) * hourStep * px) / 24 }}>
                  {String((h + 1) * hourStep).padStart(2, '0')}:00
                </span>
              ))}
          </div>
        );
      })}
    </>
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
