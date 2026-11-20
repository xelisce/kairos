import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import enGbLocale from '@fullcalendar/core/locales/en-gb';
import type { EventContentArg, EventDropArg, DatesSetArg, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { useStore } from '../store';
import { expand } from '../lib/expand';
import { moveOcc } from '../lib/actions';
import { fmtTime, fromLocal } from '../lib/time';
import { dayMarker } from '../lib/weeks';
import { useUI } from './ui';
import type { AwayRange, Occ, TravelPlan } from '../types';
import { PLAN_KINDS, planBlocks, planTitle } from '../lib/travelPlans';

export function CalendarView({
  range,
  onRange,
}: {
  range: { start: Date; end: Date } | null;
  onRange: (r: { start: Date; end: Date }) => void;
}) {
  const data = useStore((s) => s.data);
  const open = useUI((s) => s.open);
  const calRef = useRef<FullCalendar>(null);
  // Computed once: a value that changes every render makes FullCalendar scroll back each time.
  const [initialScroll] = useState(() => new Date(Date.now() - 3600_000).toTimeString().slice(0, 8));
  const narrow = typeof window !== 'undefined' && window.innerWidth < 720;

  const occs = useMemo(() => (range ? expand(data, range.start, range.end) : []), [data, range]);
  const byId = useMemo(() => new Map(occs.map((o) => [o.id, o])), [occs]);

  const events = useMemo(
    () => [
      // Time away: a striped band behind everything. Click it to edit.
      ...data.away.map((a) => ({
        id: `away:${a.id}`,
        start: fromLocal(a.start),
        end: fromLocal(a.end),
        display: 'background',
        classNames: ['k-away'],
        editable: false,
        extendedProps: { away: a },
      })),
      // Its travel plans (flights, bus rides...) as blocks on top. Click one to edit the trip.
      ...data.away.flatMap((a) =>
        (a.plans ?? []).flatMap((p) =>
          planBlocks(p).map((b) => ({
            id: `away:${a.id}:${p.id}:${b.key}`,
            title: b.label,
            start: b.start,
            end: b.end,
            classNames: ['k-plan'],
            editable: false,
            extendedProps: { away: a, plan: p, label: b.label },
          })),
        ),
      ),
      ...occs.map((o) => ({
        id: o.id,
        title: o.title,
        start: o.start,
        end: o.end,
        ...colorsOf(o),
        editable: o.movable,
        // Skipped: drawn behind everything, so other blocks can sit on top of it.
        display: o.skipped ? 'background' : 'auto',
        classNames: [
          `k-${o.source.type}`,
          o.warning ? 'k-warn' : '',
          isDone(o) ? 'k-done' : '',
          o.assessment ? 'k-assess' : '',
          o.skipped ? 'k-skipped' : '',
          isOutlined(o) ? 'k-outline' : '',
        ].filter(Boolean),
        extendedProps: { occ: o },
      })),
    ],
    [occs, data.away],
  );

  const onChange = (how: 'move' | 'resize') => (info: EventDropArg | EventResizeDoneArg) => {
    const o = byId.get(info.event.id);
    if (!o || !o.movable || !info.event.start) return info.revert();
    moveOcc(o, info.event.start, info.event.end ?? info.event.start, how);
  };

  const [swipe, setSwipe] = useState<'next' | 'prev' | null>(null);
  /** Show the next / previous day (or week, in week view), sliding in from that side. */
  const go = (dir: 'next' | 'prev') => {
    const api = calRef.current?.getApi();
    if (!api) return;
    if (dir === 'next') api.next();
    else api.prev();
    setSwipe(dir);
  };

  // Swipe left / right on a phone: next / previous day. A quick, mostly sideways flick only, so
  // scrolling the day up and down and long-press dragging blocks still work as before.
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeStart.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s || document.querySelector('.fc-event-dragging, .fc-event-resizing')) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Date.now() - s.t > 600 || Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    go(dx < 0 ? 'next' : 'prev');
  };

  // Two-finger swipe on a laptop trackpad (or Shift + mouse wheel): sideways scrolling, which the
  // calendar has no other use for. One swipe moves once: the scrolling that keeps coming after the
  // fingers lift is ignored until it stops.
  const wrapRef = useRef<HTMLDivElement>(null);
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let sum = 0;
    let moved = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // pinch zoom, or scrolling the day
      e.preventDefault(); // and don't let the browser treat it as Back / Forward
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        sum = 0;
        moved = false;
      }, 250);
      if (moved) return;
      sum += e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX; // Firefox can count in lines
      if (Math.abs(sum) < 80) return;
      moved = true;
      goRef.current(sum > 0 ? 'next' : 'prev');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearTimeout(quiet);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`calendar-wrap ${swipe ? `swipe-${swipe}` : ''}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onAnimationEnd={() => setSwipe(null)}
    >
      <FullCalendar
        ref={calRef}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView={narrow ? 'timeGridDay' : 'timeGridWeek'}
        views={{ timeGrid3: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 days' } }}
        headerToolbar={
          narrow
            ? { left: 'prev,next today', center: '', right: 'timeGridDay,timeGrid3' }
            : { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGrid3,timeGridWeek,dayGridMonth' }
        }
        firstDay={1}
        // Day before month everywhere: "Mon 16/11", "16 – 22 Nov 2026".
        locale={enGbLocale}
        dayHeaderFormat={{ weekday: 'short', day: 'numeric', month: 'numeric', omitCommas: true }}
        nowIndicator
        allDaySlot={false}
        slotDuration="00:15:00"
        slotLabelInterval="01:00"
        snapDuration="00:05:00"
        scrollTime={initialScroll}
        // Prev/next week keeps the time you were looking at.
        scrollTimeReset={false}
        height="100%"
        expandRows
        editable
        selectable
        selectMirror
        longPressDelay={350}
        eventLongPressDelay={350}
        slotEventOverlap={false}
        // Draw blocks at their real length. The default 15px minimum made short trips
        // overlap the next class on screen and squeeze it into half the column.
        eventMinHeight={1}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        events={events}
        eventDrop={onChange('move')}
        eventResize={onChange('resize')}
        eventClick={(info: EventClickArg) => {
          const away = info.event.extendedProps.away as AwayRange | undefined;
          if (away) return open({ kind: 'away', id: away.id });
          const o = byId.get(info.event.id);
          if (o) open({ kind: 'occ', occ: o });
        }}
        select={(info: DateSelectArg) => {
          calRef.current?.getApi().unselect();
          // A plain click on a skipped (background) block opens that block, not "new here".
          if ((info.jsEvent?.target as HTMLElement | null)?.closest('.fc-bg-event')) return;
          open({ kind: 'newChoice', start: info.start, end: info.end });
        }}
        datesSet={(arg: DatesSetArg) => {
          if (!range || arg.start.getTime() !== range.start.getTime() || arg.end.getTime() !== range.end.getTime()) {
            onRange({ start: arg.start, end: arg.end });
          }
        }}
        eventContent={renderEvent}
        dayCellClassNames={(arg) => {
          const mk = dayMarker(data.semesters, arg.date);
          return mk ? ['k-day-marked', `k-day-${mk.kind}`] : [];
        }}
        dayHeaderClassNames={(arg) => {
          const mk = dayMarker(data.semesters, arg.date);
          return mk ? ['k-day-marked', `k-day-${mk.kind}`] : [];
        }}
        dayHeaderContent={(arg) => {
          const mk = dayMarker(data.semesters, arg.date);
          return (
            <div className="day-head">
              <span>{arg.text}</span>
              {mk && (
                <span className={`day-mark ${mk.kind}`} title={mk.label}>
                  {mk.label}
                </span>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}

const isDone = (o: Occ) => o.source.type === 'task' && o.title.startsWith('✓');

function renderEvent(arg: EventContentArg) {
  const plan = arg.event.extendedProps.plan as TravelPlan | undefined;
  if (plan)
    return (
      <div className="ev" title={[planTitle(plan), plan.where, plan.notes].filter(Boolean).join(' · ')}>
        <div className="ev-title">
          {PLAN_KINDS[plan.kind].icon} {arg.event.extendedProps.label as string}
        </div>
        <div className="ev-meta">
          {arg.timeText}
          {plan.where && ` · ${plan.where}`}
        </div>
      </div>
    );
  const away = arg.event.extendedProps.away as AwayRange | undefined;
  if (away)
    return (
      <div className="ev ev-line ev-away" title="Away: no tasks planned. Click to edit.">
        ✈️ {away.title || 'Away'}
      </div>
    );
  const o = arg.event.extendedProps.occ as Occ | undefined;
  // The placeholder block FullCalendar draws while you drag-select empty time has no occurrence.
  if (!o)
    return (
      <div className="ev">
        <div className="ev-meta">{arg.timeText}</div>
      </div>
    );
  // Use the block's current position, so the time follows along while you drag or stretch it.
  const start = arg.event.start ?? o.start;
  const end = arg.event.end ?? o.end;
  const time = `${fmtTime(start)}–${fmtTime(end)}`;
  const mins = (end.getTime() - start.getTime()) / 60000;
  const tip = [
    o.detail ? `${o.title} · ${o.detail}` : o.title,
    `${time}${o.location ? `, ${o.location}` : ''}`,
    o.subtitle,
    o.warning && `⚠️ ${o.warning}`,
  ]
    .filter(Boolean)
    .join('\n');
  // Travel: always one horizontal line, cut off with "…" if it doesn't fit.
  if (o.skipped) {
    return (
      <div className="ev ev-line ev-skipped" title={`Skipped: ${tip}`}>
        {o.title} · skipped
      </div>
    );
  }
  if (o.source.type === 'travel') {
    return (
      <div className="ev ev-line" title={tip}>
        {o.warning && '⚠️ '}
        {o.title} · {fmtTime(start)}
      </div>
    );
  }
  const where = o.location ? `, ${o.location}` : '';
  // Short blocks: one line "Title · detail, place", cut off with "…".
  if (mins < 30) {
    return (
      <div className="ev ev-line" title={tip}>
        {o.warning && '⚠️ '}
        {o.title}
        {o.detail && <span className="ev-detail"> · {o.detail}</span>}
        {/* While dragging, show the time even on short blocks. */}
        <span className="ev-where">{arg.isMirror ? ` · ${time}` : where}</span>
      </div>
    );
  }
  // Longer: title (+ detail), then "time, place" on one line (cut off if it doesn't fit),
  // then the extra line (course name etc.) only on long blocks.
  return (
    <div className="ev" title={tip}>
      <div className="ev-title">
        {o.warning && (
          <span className="ev-warn" aria-label="Warning">
            ⚠️{' '}
          </span>
        )}
        {o.title}
        {o.detail && <span className="ev-detail"> · {o.detail}</span>}
      </div>
      <div className="ev-meta">
        {time}
        {where}
      </div>
      {mins >= 90 && o.subtitle && <div className="ev-meta ev-sub">{o.subtitle}</div>}
    </div>
  );
}

/**
 * Tasks are outlined (a light tint of their color, with a solid border), so they look different
 * from the course or club they belong to; classes, CCAs and events stay solid.
 */
const isOutlined = (o: Occ) => !o.skipped && o.source.type === 'task';

function colorsOf(o: Occ) {
  const border = o.warning ? 'var(--bad)' : o.color;
  // Skipped sessions turn grey, whatever their usual color.
  if (o.skipped) return { backgroundColor: 'var(--skipped)', borderColor: border, textColor: '#fff' };
  if (o.source.type === 'travel')
    return { backgroundColor: 'transparent', borderColor: border, textColor: 'var(--text-2)' };
  if (isOutlined(o)) {
    return {
      backgroundColor: `color-mix(in srgb, ${o.color} 22%, var(--surface))`,
      borderColor: border,
      textColor: 'var(--text)',
    };
  }
  return { backgroundColor: o.color, borderColor: border, textColor: '#fff' };
}
