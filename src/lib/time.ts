import { addDays, addMinutes, format, parseISO, startOfDay } from 'date-fns';
import type { HHMM, LocalDate, LocalDateTime } from '../types';

export const toLocal = (d: Date): LocalDateTime => format(d, "yyyy-MM-dd'T'HH:mm");
export const fromLocal = (s: LocalDateTime | LocalDate): Date => parseISO(s);
export const dateKey = (d: Date): LocalDate => format(d, 'yyyy-MM-dd');

export const hmToMin = (hm: HHMM): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
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

// ---------- dd/mm/yyyy ----------

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2026-11-20" -> "20/11/2026" */
export const toDMY = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** "20/11/2026", "20-11-26", "20.11.2026" -> "2026-11-20"; null if not a real date. */
export function parseDMY(text: string): LocalDate | null {
  const m = text.trim().match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}
