// Travel blocks: walk each day's located items in time order, starting from Home.
// Whenever the place changes, add a trip that ends when the next item starts;
// after the last located item, add a trip back home.
import { addMinutes, differenceInMinutes } from 'date-fns';
import type { AppData, Occ } from '../types';
import { CATEGORY_COLORS } from './labels';
import { homePlace, placeRef, resolvePlace, travelMinutes, type ResolvedPlace } from './places';
import { dateKey, fmtTime, fromLocal, overlaps } from './time';

/**
 * @param items  everything with a time (only those with a location matter)
 * @param stays  routines done wherever you are (lunch, shower): a trip waits until they're over
 */
export function computeTravel(data: AppData, items: Occ[], stays: Occ[] = []): Occ[] {
  const afterStays = (start: Date, minutes: number) => {
    let s = start;
    for (let guard = 0; guard < 10; guard++) {
      const hit = stays.find((st) => overlaps(s, addMinutes(s, minutes), st.start, st.end));
      if (!hit) break;
      s = hit.end;
    }
    return s;
  };

  const home = homePlace(data);
  const homeRef = home ? placeRef(home) : null;
  const findRoomMin = data.settings.travelBufferMin;

  const byDay = new Map<string, { occ: Occ; place: ResolvedPlace }[]>();
  for (const occ of items) {
    const place = resolvePlace(data, occ.location);
    if (!place) continue;
    const dk = dateKey(occ.start);
    if (!byDay.has(dk)) byDay.set(dk, []);
    byDay.get(dk)!.push({ occ, place });
  }

  const trips: Occ[] = [];
  for (const [dk, list] of byDay) {
    list.sort((a, b) => a.occ.start.getTime() - b.occ.start.getTime());
    let cur = homeRef;
    let prevEnd: Date | null = null;

    for (const { occ, place } of list) {
      if (cur && cur.id !== place.id) {
        const key = `${dk}:${occ.id}:in`;
        const route = travelMinutes(data, cur, place);
        const typed = data.travelOverrides[key];
        // The extra minutes are for finding the room; none when you're going home.
        const minutes = typed ?? route.minutes + (home && place.id === home.id ? 0 : findRoomMin);
        const movedTo = data.travelMoves[key];
        const start = movedTo ? fromLocal(movedTo) : afterStays(addMinutes(occ.start, -minutes), minutes);
        const end = addMinutes(start, minutes);
        let warning: string | undefined;
        if (end > occ.start) {
          warning = `You'd arrive ${differenceInMinutes(end, occ.start)}m late for ${occ.title}`;
        } else if (prevEnd && start < prevEnd) {
          const gap = Math.max(0, differenceInMinutes(occ.start, prevEnd));
          warning = `Only ${gap}m to get from ${cur.name} to ${place.name}, but the trip takes ${minutes}m`;
        }
        trips.push(
          trip({
            key,
            from: cur,
            to: place,
            start,
            end,
            minutes,
            typed: typed !== undefined,
            moved: !!movedTo,
            saved: route.saved,
            warning,
          }),
        );
      }
      cur = place;
      if (!prevEnd || occ.end > prevEnd) prevEnd = occ.end;
    }

    if (homeRef && cur && cur.id !== homeRef.id && prevEnd) {
      const last = list[list.length - 1].occ;
      const key = `${dk}:${last.id}:home`;
      const route = travelMinutes(data, cur, homeRef);
      const typed = data.travelOverrides[key];
      const minutes = typed ?? route.minutes;
      const movedTo = data.travelMoves[key];
      const start = movedTo ? fromLocal(movedTo) : afterStays(prevEnd, minutes);
      const warning = start < prevEnd ? `Leaving ${cur.name} before ${last.title} ends` : undefined;
      trips.push(
        trip({
          key,
          from: cur,
          to: homeRef,
          start,
          end: addMinutes(start, minutes),
          minutes,
          typed: typed !== undefined,
          moved: !!movedTo,
          saved: route.saved,
          warning,
        }),
      );
    }
  }
  return trips;
}

interface TripInfo {
  key: string;
  from: ResolvedPlace;
  to: ResolvedPlace;
  start: Date;
  end: Date;
  minutes: number;
  /** Length typed for this one trip. */
  typed: boolean;
  /** Dragged to another time. */
  moved: boolean;
  /** Uses a saved route (not the default estimate). */
  saved: boolean;
  warning?: string;
}

function trip({ key, from, to, start, end, minutes, typed, moved, saved, warning }: TripInfo): Occ {
  const full = (r: ResolvedPlace) => (r.short !== r.name ? `${r.name} (${r.short})` : r.name);
  return {
    id: `travel:${key}`,
    // Full names in the dialog; the short name on the calendar block.
    source: { type: 'travel', key, minutes, from: full(from), to: full(to), overridden: typed, moved },
    title: `🚶 ${to.short}`,
    subtitle: `Leave ${from.short} ${key.endsWith(':home') ? 'at' : 'by'} ${fmtTime(start)}${saved || typed ? '' : ' (estimate)'}`,
    start,
    end,
    color: CATEGORY_COLORS.travel,
    // Drag to leave earlier/later; drag the bottom edge to change this trip's length.
    movable: true,
    warning,
  };
}
