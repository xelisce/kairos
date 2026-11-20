// Three-way merge for when two windows edit at the same time. `base` is the copy both started
// from; whatever only one side changed is kept, so neither window's edits get thrown away.
// Lists of things with an `id` are merged item by item, lists of plain values (skipped dates,
// weekdays) as sets. When both sides changed the very same thing, this window (`local`) wins.

type Json = unknown;

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);
const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasIds = (v: Json): v is { id: string }[] =>
  Array.isArray(v) && v.every((x) => isObject(x) && typeof x.id === 'string');
const isPlain = (v: Json): v is (string | number | boolean)[] =>
  Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object');

export function merge3<T>(base: T, local: T, remote: T): T {
  return mergeValue(base, local, remote) as T;
}

function mergeValue(b: Json, l: Json, r: Json): Json {
  if (same(l, b)) return r;
  if (same(r, b) || same(l, r)) return l;
  if (hasIds(l) && hasIds(r) && (b === undefined || hasIds(b))) return mergeById(b ?? [], l, r);
  if (isPlain(l) && isPlain(r) && (b === undefined || isPlain(b))) return mergeSet(b ?? [], l, r);
  if (isObject(l) && isObject(r) && (b === undefined || isObject(b))) return mergeObject(b ?? {}, l, r);
  return l;
}

function mergeObject(b: Record<string, Json>, l: Record<string, Json>, r: Record<string, Json>) {
  const out: Record<string, Json> = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b)])) {
    const v = mergeValue(b[k], l[k], r[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeById(b: { id: string }[], l: { id: string }[], r: { id: string }[]) {
  const byId = (list: { id: string }[]) => new Map(list.map((x) => [x.id, x]));
  const [B, L, R] = [byId(b), byId(l), byId(r)];
  const out: Json[] = [];
  // This window's order first, then anything new from the other window.
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    const [bi, li, ri] = [B.get(id), L.get(id), R.get(id)];
    if (li && ri) out.push(mergeValue(bi, li, ri));
    // Deleted on one side: gone, unless the other side changed it since.
    else if (li) {
      if (!bi || !same(li, bi)) out.push(li);
    } else if (ri) {
      if (!bi || !same(ri, bi)) out.push(ri);
    }
  }
  return out;
}

function mergeSet(b: Json[], l: Json[], r: Json[]) {
  const [B, L, R] = [new Set(b), new Set(l), new Set(r)];
  // Kept by both, plus whatever either side added.
  return [...new Set([...l, ...r])].filter((x) => (L.has(x) && R.has(x)) || !B.has(x));
}
