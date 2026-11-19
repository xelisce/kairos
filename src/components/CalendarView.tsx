import { useMemo, useRef, useState } from 'react';
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
import { fmtTime } from '../lib/time';
import { dayMarker } from '../lib/weeks';
import { useUI } from './ui';
import type { Occ } from '../types';

export function CalendarView({ range, onRange }: { range: { start: Date; end: Date } | null; onRange: (r: { start: Date; end: Date }) => void }) {
  const data = useStore((s) => s.data);
  const open = useUI((s) => s.open);
  const calRef = useRef<FullCalendar>(null);
  // Computed once: a value that changes every render makes FullCalendar scroll back each time.
  const [initialScroll] = useState(() => new Date(Date.now() - 3600_000).toTimeString().slice(0, 8));
  const narrow = typeof window !== 'undefined' && window.innerWidth < 720;

  const occs = useMemo(() => (range ? expand(data, range.start, range.end) : []), [data, range]);
  const byId = useMemo(() => new Map(occs.map((o) => [o.id, o])), [occs]);

  const events = useMemo(() => occs.map((o) => ({
    id: o.id,
    title: o.title,
    start: o.start,
    end: o.end,
    // Skipped sessions turn grey, whatever their usual color.
    backgroundColor: o.skipped ? 'var(--skipped)' : o.source.type === 'travel' ? 'transparent' : o.color,
    borderColor: o.warning ? 'var(--bad)' : o.color,
    textColor: o.source.type === 'travel' ? 'var(--text-2)' : '#fff',
    editable: o.movable,
    // Skipped: drawn behind everything, so other blocks can sit on top of it.
    display: o.skipped ? 'background' : 'auto',
    classNames: [`k-${o.source.type}`, o.warning ? 'k-warn' : '', isDone(o) ? 'k-done' : '', o.assessment ? 'k-assess' : '', o.skipped ? 'k-skipped' : ''].filter(Boolean),
    extendedProps: { occ: o },
  })), [occs]);

  const onChange = (how: 'move' | 'resize') => (info: EventDropArg | EventResizeDoneArg) => {
    const o = byId.get(info.event.id);
    if (!o || !o.movable || !info.event.start) return info.revert();
    moveOcc(o, info.event.start, info.event.end ?? info.event.start, how);
  };

  return (
    <div className="calendar-wrap">
      <FullCalendar
        ref={calRef}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView={narrow ? 'timeGridDay' : 'timeGridWeek'}
        views={{ timeGrid3: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 days' } }}
        headerToolbar={narrow
          ? { left: 'prev,next today', center: '', right: 'timeGridDay,timeGrid3' }
          : { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGrid3,timeGridWeek,dayGridMonth' }}
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
        dayCellClassNames={(arg) => { const mk = dayMarker(data.semesters, arg.date); return mk ? ['k-day-marked', `k-day-${mk.kind}`] : []; }}
        dayHeaderClassNames={(arg) => { const mk = dayMarker(data.semesters, arg.date); return mk ? ['k-day-marked', `k-day-${mk.kind}`] : []; }}
        dayHeaderContent={(arg) => {
          const mk = dayMarker(data.semesters, arg.date);
          return (
            <div className="day-head">
              <span>{arg.text}</span>
              {mk && <span className={`day-mark ${mk.kind}`} title={mk.label}>{mk.label}</span>}
            </div>
          );
        }}
      />
    </div>
  );
}

const isDone = (o: Occ) => o.source.type === 'task' && o.title.startsWith('✓');

function renderEvent(arg: EventContentArg) {
  const o = arg.event.extendedProps.occ as Occ | undefined;
  // The placeholder block FullCalendar draws while you drag-select empty time has no occurrence.
  if (!o) return <div className="ev"><div className="ev-meta">{arg.timeText}</div></div>;
  const mins = (o.end.getTime() - o.start.getTime()) / 60000;
  const tip = [o.detail ? `${o.title} · ${o.detail}` : o.title, `${fmtTime(o.start)}–${fmtTime(o.end)}${o.location ? `, ${o.location}` : ''}`, o.subtitle, o.warning && `⚠️ ${o.warning}`].filter(Boolean).join('\n');
  // Travel: always one horizontal line, cut off with "…" if it doesn't fit.
  if (o.skipped) {
    return <div className="ev ev-line ev-skipped" title={`Skipped: ${tip}`}>{o.title} · skipped</div>;
  }
  if (o.source.type === 'travel') {
    return (
      <div className="ev ev-line" title={tip}>
        {o.warning && '⚠️ '}{o.title} · {fmtTime(o.start)}
      </div>
    );
  }
  const where = o.location ? `, ${o.location}` : '';
  // Short blocks: one line "Title · detail, place", cut off with "…".
  if (mins < 30) {
    return (
      <div className="ev ev-line" title={tip}>
        {o.warning && '⚠️ '}{o.title}{o.detail && <span className="ev-detail"> · {o.detail}</span>}<span className="ev-where">{where}</span>
      </div>
    );
  }
  // Longer: title (+ detail), then "time, place" on one line (cut off if it doesn't fit),
  // then the extra line (course name etc.) only on long blocks.
  return (
    <div className="ev" title={tip}>
      <div className="ev-title">
        {o.warning && <span className="ev-warn" aria-label="Warning">⚠️ </span>}
        {o.title}{o.detail && <span className="ev-detail"> · {o.detail}</span>}
      </div>
      <div className="ev-meta">{fmtTime(o.start)}–{fmtTime(o.end)}{where}</div>
      {mins >= 90 && o.subtitle && <div className="ev-meta ev-sub">{o.subtitle}</div>}
    </div>
  );
}
