import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type FullCalendar from '@fullcalendar/react';
import { usePref } from './usePref';

/** How tall one hour is on the calendar, in pixels. 84 is FullCalendar's usual size. */
export const DEFAULT_HOUR_PX = 84;
const MIN_HOUR_PX = 24;
const MAX_HOUR_PX = 480;
const clampHour = (v: number) => Math.round(Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, v)));

/** The part of the calendar that scrolls up and down (the hours, not the day headers). */
const scrollerIn = (wrap: HTMLElement | null) =>
  wrap?.querySelector('.fc-timegrid-body')?.closest<HTMLElement>('.fc-scroller') ?? null;

/**
 * Zoom the calendar's hours in and out (taller or shorter days), remembered on this device.
 * Ctrl/⌘ + wheel or a trackpad pinch zooms around the pointer; on a phone, a two-finger pinch
 * zooms around the point between the fingers. Zoomed all the way out, the day fills the screen.
 */
export function useCalendarZoom(wrapRef: RefObject<HTMLDivElement>, calRef: RefObject<FullCalendar>) {
  const [prefs, setPrefs] = usePref('kairos.calendar', { hourPx: DEFAULT_HOUR_PX });
  const hourPx = clampHour(prefs.hourPx);
  const hourRef = useRef(hourPx);
  hourRef.current = hourPx;

  /** Where to scroll once the new size is drawn, so the time under `anchorY` stays put. */
  const pending = useRef<{ at: number; anchorY: number } | null>(null);
  const zoomTo = (next: number, anchorY?: number) => {
    const px = clampHour(next);
    if (px === hourRef.current) return;
    const el = scrollerIn(wrapRef.current);
    if (el) {
      const y = anchorY ?? el.clientHeight / 2;
      pending.current = { at: (el.scrollTop + y) / el.scrollHeight, anchorY: y };
    }
    hourRef.current = px;
    setPrefs((p) => ({ ...p, hourPx: px }));
  };
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;

  // The rows' height comes from CSS (--hour-px on the wrapper); tell the calendar to measure them
  // again so blocks line up with the new hours.
  useLayoutEffect(() => {
    calRef.current?.getApi().updateSize();
    const el = scrollerIn(wrapRef.current);
    const p = pending.current;
    pending.current = null;
    if (el && p) el.scrollTop = p.at * el.scrollHeight - p.anchorY;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourPx]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const yIn = (clientY: number) => clientY - (scrollerIn(el)?.getBoundingClientRect().top ?? 0);

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // a plain wheel scrolls the day
      e.preventDefault(); // instead of zooming the whole page
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomRef.current(hourRef.current * Math.exp(-delta * 0.004), yIn(e.clientY));
    };

    // Pinch: compares how far apart the fingers are up and down, since that's the way the day stretches.
    let pinch: { dist: number; px: number } | null = null;
    const fingers = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return { dist: Math.max(40, Math.abs(a.clientY - b.clientY)), midY: yIn((a.clientY + b.clientY) / 2) };
    };
    const onTouchStart = (e: TouchEvent) => {
      pinch = e.touches.length === 2 ? { dist: fingers(e).dist, px: hourRef.current } : null;
    };
    let frame = 0;
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const { dist, midY } = fingers(e);
      const start = pinch;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => zoomRef.current((start.px * dist) / start.dist, midY));
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
      cancelAnimationFrame(frame);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [wrapRef]);

  return {
    hourPx,
    zoomIn: () => zoomRef.current(hourRef.current * 1.4),
    zoomOut: () => zoomRef.current(hourRef.current / 1.4),
  };
}
