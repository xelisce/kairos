import { addDays, addMinutes, format, parseISO, startOfDay } from 'date-fns';
import type { HHMM, LocalDate, LocalDateTime } from '../types';

export const toLocal = (d: Date): LocalDateTime => format(d, "yyyy-MM-dd'T'HH:mm");
export const fromLocal = (s: LocalDateTime | LocalDate): Date => parseISO(s);
export const dateKey = (d: Date): LocalDate => format(d, 'yyyy-MM-dd');

export const hmToMin = (hm: HHMM): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const minToHm = (min: number): HHMM => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Date at a given time of day. Minutes may exceed 1440 (next day). */
export const atMin = (day: Date | LocalDate, min: number): Date =>
  addMinutes(startOfDay(typeof day === 'string' ? fromLocal(day) : day), min);
export const at = (day: Date | LocalDate, hm: HHMM): Date => atMin(day, hmToMin(hm));

/** 0 = Monday ... 6 = Sunday */
export const weekdayMon0 = (d: Date): number => (d.getDay() + 6) % 7;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const overlaps = (aS: Date, aE: Date, bS: Date, bE: Date) => aS < bE && bS < aE;

export function* eachDay(from: Date, to: Date) {
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) yield d;
}

export const fmtTime = (d: Date) => format(d, 'HH:mm');
export const fmtDur = (min: number) =>
  min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`;

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
