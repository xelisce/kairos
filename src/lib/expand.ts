// Turns stored data into concrete calendar occurrences for a date range:
// classes (by academic week), events, scheduled tasks, routines that slide
// around clashes, and travel blocks between places.
import { addDays, addMinutes, differenceInMinutes, format, startOfDay } from 'date-fns';
import { ASSESSMENT_KINDS } from '../types';
import type { AppData, Occ, Place, Routine } from '../types';
import { at, dateKey, eachDay, fmtTime, fromLocal, hmToMin, overlaps, weekdayMon0, atMin } from './time';
import { weekIndex } from './weeks';

export const CATEGORY_COLORS: Record<string, string> = {
  hangout: '#e0699f',
  cca: '#5fa83f',
  admin: '#d08a2c',
  appointment: '#3fa7a0',
  other: '#7a8194',
  homework: '#6d5dfc',
  personal: '#4b9be0',
  travel: '#9aa3b5',
  exam: '#d65f5f',
  quiz: '#d65f5f',
  presentation: '#b35fd6',
  help: '#3fa7a0',
};

export const EVENT_LABELS: Record<string, string> = {
  hangout: 'Hangout / outing', cca: 'CCA / club session', appointment: 'Appointment', admin: 'Admin',
  exam: 'Exam', quiz: 'Quiz', presentation: 'Presentation', help: 'Help session', other: 'Other',
};
const ASSESSMENT_EVENTS = ['exam', 'quiz', 'presentation'];
const KIND_ICON: Partial<Record<string, string>> = { Quiz: '📝 ', Exam: '📝 ', Presentation: '🎤 ', 'Help session': '🙋 ' };

// ---------- Places & travel ----------

export interface ResolvedPlace { id: string; name: string; known: boolean }

export function resolvePlace(data: AppData, location?: string): ResolvedPlace | null {
  const loc = location?.trim().toLowerCase();
  if (!loc) return null;
  for (const p of data.places) {
    const names = [p.name, ...p.aliases].map((n) => n.trim().toLowerCase()).filter(Boolean);
    if (names.some((n) => n === loc || (n.length >= 3 && loc.includes(n)))) return { id: p.id, name: p.name, known: true };
  }
  return { id: `loc:${loc}`, name: location!.trim(), known: false };
}

export const homePlace = (data: AppData): Place | undefined => data.places.find((p) => p.isHome);

export function travelMinutes(data: AppData, a: ResolvedPlace, b: ResolvedPlace): { minutes: number; saved: boolean } {
  // Exact direction first, then a two-way route saved the other way round.
  const r = data.routes.find((r) => r.a === a.id && r.b === b.id)
    ?? data.routes.find((r) => r.bidirectional !== false && r.a === b.id && r.b === a.id);
  return r ? { minutes: r.minutes, saved: true } : { minutes: data.settings.defaultTravelMin, saved: false };
}

// ---------- Expansion ----------

export interface ExpandOpts {
  /** Leave out these task ids (the scheduler uses this to re-place tasks). */
  excludeTaskIds?: Set<string>;
}

export function expand(data: AppData, from: Date, to: Date, opts: ExpandOpts = {}): Occ[] {
  // Pad the range so moved occurrences, travel and overnight blocks are caught.
  const pFrom = addDays(startOfDay(from), -2);
  const pTo = addDays(startOfDay(to), 2);
  const fixed: Occ[] = [];

  // Classes
  const modules = new Map(data.modules.map((m) => [m.id, m]));
  const sems = new Map(data.semesters.map((s) => [s.id, s]));
  for (const day of eachDay(pFrom, pTo)) {
    const dk = dateKey(day);
    const wd = weekdayMon0(day);
    for (const c of data.classes) {
      if (!c.days.includes(wd)) continue;
      const mod = modules.get(c.moduleId);
      const sem = mod && sems.get(mod.semesterId);
      if (!mod || !sem) continue;
      const wi = weekIndex(sem, day);
      if (wi === null) continue;
      const wl = sem.layout[wi];
      if (wl.type !== 'teaching' || !c.weeks.includes(wl.n)) continue;
      if (c.skipDates.includes(dk) || sem.holidays.some((h) => h.date === dk)) continue;
      const ov = c.overrides[dk];
      const kind = c.kindOverrides?.[dk] ?? c.kind;
      fixed.push({
        id: `class:${c.id}:${dk}`,
        source: { type: 'class', seriesId: c.id, date: dk },
        title: `${KIND_ICON[kind] ?? ''}${mod.code} ${kind}`,
        subtitle: kind !== c.kind ? `instead of ${c.kind}` : mod.name,
        start: ov ? fromLocal(ov.start) : at(day, c.start),
        end: ov ? fromLocal(ov.end) : at(day, c.end),
        location: c.location,
        color: mod.color,
        movable: true,
        assessment: ASSESSMENT_KINDS.includes(kind),
        detail: c.details?.[dk],
      });
    }

    // CCAs / clubs
    for (const a of data.activities) {
      if (a.recurring === false || !a.days.includes(wd) || a.skipDates.includes(dk)) continue;
      if ((a.from && dk < a.from) || (a.until && dk > a.until)) continue;
      const ov = a.overrides[dk];
      fixed.push({
        id: `activity:${a.id}:${dk}`,
        source: { type: 'activity', activityId: a.id, date: dk },
        title: a.title,
        start: ov ? fromLocal(ov.start) : at(day, a.start),
        end: ov ? fromLocal(ov.end) : at(day, a.end),
        location: a.location,
        color: a.color,
        movable: true,
        detail: a.details?.[dk],
      });
    }
  }

  // Events
  for (const e of data.events) {
    const s = fromLocal(e.start);
    const en = fromLocal(e.end);
    if (!overlaps(s, en, pFrom, pTo)) continue;
    const mod = e.moduleId ? modules.get(e.moduleId) : undefined;
    const act = e.activityId ? data.activities.find((a) => a.id === e.activityId) : undefined;
    const icon = e.category === 'exam' || e.category === 'quiz' ? '📝 ' : e.category === 'presentation' ? '🎤 ' : e.category === 'help' ? '🙋 ' : '';
    fixed.push({
      id: `event:${e.id}`,
      source: { type: 'event', eventId: e.id },
      title: `${icon}${mod && !e.title.toUpperCase().includes(mod.code.toUpperCase()) ? `${mod.code} ` : ''}${e.title}`,
      subtitle: mod ? `${EVENT_LABELS[e.category]} · ${mod.name}` : act && act.title !== e.title ? act.title : undefined,
      start: s,
      end: en,
      location: e.location,
      color: mod?.color ?? act?.color ?? CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.other,
      movable: true,
      assessment: ASSESSMENT_EVENTS.includes(e.category),
      detail: e.notes?.split('\n')[0],
    });
  }

  // Scheduled tasks
  for (const t of data.tasks) {
    if (!t.onCalendar || !t.scheduled || opts.excludeTaskIds?.has(t.id)) continue;
    const s = fromLocal(t.scheduled.start);
    const en = fromLocal(t.scheduled.end);
    if (!overlaps(s, en, pFrom, pTo)) continue;
    const mod = t.moduleId ? modules.get(t.moduleId) : undefined;
    let warning: string | undefined;
    if (!t.done && t.deadline && en > fromLocal(t.deadline)) warning = `Scheduled after the deadline (${format(fromLocal(t.deadline), 'EEE d MMM HH:mm')})`;
    fixed.push({
      id: `task:${t.id}`,
      source: { type: 'task', taskId: t.id },
      title: `${t.done ? '✓ ' : ''}${t.title}`,
      subtitle: mod?.code,
      start: s,
      end: en,
      location: t.location,
      color: mod?.color ?? CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.other,
      movable: true,
      warning,
    });
  }

  // Routines: fixed ones (non-flexible, moved by hand, or with a location) go in now;
  // flexible ones are fitted around everything after travel is known.
  const flexQueue: { r: Routine; day: Date; dk: string }[] = [];
  for (const day of eachDay(pFrom, pTo)) {
    const dk = dateKey(day);
    for (const base of data.routines) {
      if (!base.enabled || !base.days.includes(weekdayMon0(day)) || base.skipDates.includes(dk)) continue;
      // This day's own length, if you changed it.
      const len = base.durationOverrides?.[dk];
      const r = len ? { ...base, durationMin: len } : base;
      const ov = r.overrides[dk];
      if (ov || !r.flexible || r.location) {
        const s = ov ? fromLocal(ov.start) : at(day, r.preferredStart);
        fixed.push(routineOcc(r, dk, s, ov ? fromLocal(ov.end) : addMinutes(s, r.durationMin), undefined, ov ? 'Moved by hand: stays here until you Reset it' : undefined));
      } else flexQueue.push({ r, day, dk });
    }
  }

  // Travel between located items, day by day.
  const travel = computeTravel(data, fixed);
  const busy = [...fixed, ...travel];

  // Fit flexible routines.
  const placed: Occ[] = [];
  for (const { r, day, dk } of flexQueue) {
    const occ = fitRoutine(r, day, dk, busy);
    placed.push(occ);
    busy.push(occ);
  }

  return [...fixed, ...travel, ...placed].filter((o) => overlaps(o.start, o.end, from, to));
}

function routineOcc(r: Routine, dk: string, start: Date, end: Date, warning?: string, subtitle?: string): Occ {
  return {
    id: `routine:${r.id}:${dk}`,
    source: { type: 'routine', routineId: r.id, date: dk },
    title: r.title,
    subtitle,
    start,
    end,
    location: r.location,
    color: r.color,
    movable: true,
    warning,
  };
}

/** Put a flexible routine at its preferred time, or the nearest free spot in its window. */
function fitRoutine(r: Routine, day: Date, dk: string, busy: Occ[]): Occ {
  const pref = hmToMin(r.preferredStart);
  const ws = hmToMin(r.windowStart);
  let we = hmToMin(r.windowEnd);
  if (we <= ws) we += 1440; // window crosses midnight, e.g. 18:00 -> 01:00 next day
  // Usual start inside the window (possibly after midnight); if it's outside, snap to the nearest edge.
  let prefN = pref < ws ? pref + 1440 : pref;
  if (prefN + r.durationMin > we) prefN = pref >= ws ? Math.max(ws, we - r.durationMin) : ws;
  const free = (m: number) => {
    const s = atMin(day, m);
    const e = addMinutes(s, r.durationMin);
    return !busy.some((b) => overlaps(s, e, b.start, b.end));
  };
  const candidates: number[] = [prefN];
  for (let d = 5; d <= we - ws; d += 5) candidates.push(prefN + d, prefN - d);
  for (const m of candidates) {
    if (m < ws || m + r.durationMin > we) continue;
    if (free(m)) {
      const s = atMin(day, m);
      return routineOcc(r, dk, s, addMinutes(s, r.durationMin));
    }
  }
  // No room inside the window: use the nearest free time just outside it (up to 3h away),
  // flagged so you notice, instead of overlapping a class or CCA.
  for (let d = 5; d <= 180; d += 5) {
    for (const m of [we - r.durationMin + d, ws - d]) {
      if (free(m)) {
        const s = atMin(day, m);
        return routineOcc(r, dk, s, addMinutes(s, r.durationMin),
          `No free ${r.durationMin}m between ${r.windowStart} and ${r.windowEnd}, so it's moved just outside that window`);
      }
    }
  }
  const s = atMin(day, prefN);
  return routineOcc(r, dk, s, addMinutes(s, r.durationMin), `No free ${r.durationMin}m slot between ${r.windowStart} and ${r.windowEnd}`);
}

/**
 * For each day, walk located items in time order starting from Home.
 * Whenever the place changes, add a travel block that ends when the next item starts.
 * After the last located item, add a trip back home.
 */
function computeTravel(data: AppData, items: Occ[]): Occ[] {
  const home = homePlace(data);
  const homeR: ResolvedPlace | null = home ? { id: home.id, name: home.name, known: true } : null;
  const byDay = new Map<string, { occ: Occ; place: ResolvedPlace }[]>();
  for (const o of items) {
    const p = resolvePlace(data, o.location);
    if (!p) continue;
    const dk = dateKey(o.start);
    if (!byDay.has(dk)) byDay.set(dk, []);
    byDay.get(dk)!.push({ occ: o, place: p });
  }
  const out: Occ[] = [];
  const extra = data.settings.travelBufferMin;
  for (const [dk, list] of byDay) {
    list.sort((a, b) => a.occ.start.getTime() - b.occ.start.getTime());
    let cur = homeR;
    let prevEnd: Date | null = null;
    for (const { occ, place } of list) {
      if (cur && cur.id !== place.id) {
        const key = `${dk}:${occ.id}:in`;
        const tm = travelMinutes(data, cur, place);
        const ovr = data.travelOverrides[key];
        const minutes = ovr ?? tm.minutes + extra;
        const movedTo = data.travelMoves?.[key];
        const start = movedTo ? fromLocal(movedTo) : addMinutes(occ.start, -minutes);
        const end = addMinutes(start, minutes);
        let warning: string | undefined;
        if (end > occ.start) {
          warning = `You'd arrive ${differenceInMinutes(end, occ.start)}m late for ${occ.title}`;
        } else if (prevEnd && start < prevEnd) {
          warning = `Only ${Math.max(0, differenceInMinutes(occ.start, prevEnd))}m to get from ${cur.name} to ${place.name}, but the trip takes ${minutes}m`;
        }
        out.push(travelOcc(key, cur.name, place.name, start, end, minutes, ovr !== undefined, !!movedTo, tm.saved, warning));
      }
      cur = place;
      if (prevEnd === null || occ.end.getTime() > (prevEnd as Date).getTime()) prevEnd = occ.end;
    }
    if (homeR && cur && cur.id !== homeR.id && prevEnd) {
      const last = list[list.length - 1].occ;
      const key = `${dk}:${last.id}:home`;
      const tm = travelMinutes(data, cur, homeR);
      const ovr = data.travelOverrides[key];
      const minutes = ovr ?? tm.minutes;
      const movedTo = data.travelMoves?.[key];
      const start = movedTo ? fromLocal(movedTo) : prevEnd;
      const warning = start < prevEnd ? `Leaving ${cur.name} before ${last.title} ends` : undefined;
      out.push(travelOcc(key, cur.name, homeR.name, start, addMinutes(start, minutes), minutes, ovr !== undefined, !!movedTo, tm.saved, warning));
    }
  }
  return out;
}

function travelOcc(key: string, from: string, to: string, start: Date, end: Date, minutes: number,
  overridden: boolean, moved: boolean, saved: boolean, warning?: string): Occ {
  return {
    id: `travel:${key}`,
    source: { type: 'travel', key, minutes, from, to, overridden, moved },
    title: `🚶 ${to}`,
    subtitle: `Leave ${from} ${key.endsWith(':home') ? 'at' : 'by'} ${fmtTime(start)}${saved || overridden ? '' : ' (estimate)'}`,
    start,
    end,
    color: CATEGORY_COLORS.travel,
    // Drag to leave earlier/later; drag the bottom edge to change this trip's length.
    movable: true,
    warning,
  };
}
