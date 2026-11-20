// Saved places: matching a typed location to a place, travel times, renaming.
import type { AppData, Place } from '../types';

/** `name` is the place's full name; `short` is its shortest name or alias, used on travel blocks. */
export interface ResolvedPlace {
  id: string;
  name: string;
  short: string;
  known: boolean;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex matching `word` as a whole word (not inside another word), any capitalisation. */
const wholeWord = (word: string, flags = 'iu') =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, flags);

/** Does `text` contain `word` as a whole word? */
const hasWord = (text: string, word: string) => wholeWord(word).test(text);

const namesOf = (p: Place) => [p.name, ...p.aliases].map((x) => x.trim()).filter(Boolean);

export function placeRef(p: Place): ResolvedPlace {
  const short = namesOf(p).reduce((a, b) => (b.length < a.length ? b : a), p.name);
  return { id: p.id, name: p.name, short, known: true };
}

/**
 * Which saved place is this location? A place matches when its name or any alias
 * appears in the location as a whole word: "107 BPB" -> BPB, "2532 MH" -> MH,
 * "COM1-0204" -> COM1, but "PS" doesn't match "Psychology". Longest match wins.
 * Unknown locations become their own place (travel uses the default estimate).
 */
export function resolvePlace(data: AppData, location?: string): ResolvedPlace | null {
  const loc = location?.trim();
  if (!loc) return null;
  let best: { place: Place; len: number } | null = null;
  for (const place of data.places) {
    for (const name of namesOf(place)) {
      if (hasWord(loc, name) && (!best || name.length > best.len)) best = { place, len: name.length };
    }
  }
  if (best) return placeRef(best.place);
  return { id: `loc:${loc.toLowerCase()}`, name: loc, short: loc, known: false };
}

export const homePlace = (data: AppData): Place | undefined => data.places.find((p) => p.isHome);

/** Saved route time between two places (exact direction first, then a two-way route), or the default estimate. */
export function travelMinutes(data: AppData, a: ResolvedPlace, b: ResolvedPlace): { minutes: number; saved: boolean } {
  const route =
    data.routes.find((r) => r.a === a.id && r.b === b.id) ??
    data.routes.find((r) => r.bidirectional !== false && r.a === b.id && r.b === a.id);
  return route ? { minutes: route.minutes, saved: true } : { minutes: data.settings.defaultTravelMin, saved: false };
}

/**
 * Rename a place, and the old name inside every location that uses it, so travel times keep working:
 * renaming "Brogden Psychology Building" to "Brogden" turns "107 Brogden Psychology Building" into "107 Brogden".
 * Mutates `d` (call inside a store commit).
 */
export function renamePlace(d: AppData, id: string, name: string) {
  const place = d.places.find((x) => x.id === id);
  if (!place) return;
  const old = place.name.trim();
  place.name = name;
  if (!old) return;
  const pattern = wholeWord(old, 'giu');
  for (const item of [...d.classes, ...d.activities, ...d.events, ...d.tasks, ...d.routines]) {
    if (item.location) item.location = item.location.replace(pattern, name);
  }
}
