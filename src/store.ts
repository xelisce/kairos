// App state with undo/redo (last 30 edits).
// Saved to the local database by lib/sync.ts; localStorage is only an offline fallback copy.
// Every edit goes through `commit`, which snapshots the previous data
// and re-runs the auto-scheduler so tasks stay out of clashes.
import { create } from 'zustand';
import type { AppData } from './types';
import { defaultData } from './lib/defaults';
import { planTasks } from './lib/scheduler';

const KEY = 'kairos:data:v1';
const HISTORY = 30;

interface Snapshot { data: AppData; label: string }

interface State {
  data: AppData;
  past: Snapshot[];
  future: Snapshot[];
  /** Mutate a draft copy of the data. Recorded as one undo step. */
  commit: (label: string, fn: (d: AppData) => void) => void;
  undo: () => void;
  redo: () => void;
  /** Re-run the scheduler without recording an undo step (on load, every few minutes). */
  refresh: () => void;
  replaceAll: (data: AppData, label: string) => void;
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate({ ...defaultData(), ...JSON.parse(raw) });
  } catch { /* fall through to defaults */ }
  return defaultData();
}

/** Bring older saved data up to the current shape. */
function migrate(d: AppData): AppData {
  for (const c of d.classes as (AppData['classes'][number] & { weekday?: number })[]) {
    if (!Array.isArray(c.days)) { c.days = [c.weekday ?? 0]; delete c.weekday; }
    c.kindOverrides ??= {};
  }
  d.activities ??= [];
  for (const a of d.activities) a.recurring ??= true;
  d.travelMoves ??= {};
  for (const r of d.routes) r.bidirectional ??= true;
  for (const s of d.semesters) {
    if (!s.style) s.style = s.layout.some((w) => w.type === 'break' && /recess/i.test(w.name)) ? 'nus' : 'us';
  }
  return d;
}

function save(data: AppData) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
}

const withPlan = (d: AppData): AppData => ({ ...d, tasks: planTasks(d, new Date()) });

export const useStore = create<State>((set, get) => ({
  data: withPlan(load()),
  past: [],
  future: [],
  commit: (label, fn) => {
    const prev = get().data;
    const draft = structuredClone(prev);
    fn(draft);
    const next = withPlan(draft);
    set({ data: next, past: [...get().past, { data: prev, label }].slice(-HISTORY), future: [] });
  },
  undo: () => {
    const { past, data, future } = get();
    const last = past[past.length - 1];
    if (!last) return;
    set({ data: last.data, past: past.slice(0, -1), future: [{ data, label: last.label }, ...future].slice(0, HISTORY) });
  },
  redo: () => {
    const { past, data, future } = get();
    const next = future[0];
    if (!next) return;
    set({ data: next.data, future: future.slice(1), past: [...past, { data, label: next.label }].slice(-HISTORY) });
  },
  refresh: () => set({ data: withPlan(get().data) }),
  replaceAll: (data, label) => {
    const prev = get().data;
    set({ data: withPlan(migrate(data)), past: [...get().past, { data: prev, label }].slice(-HISTORY), future: [] });
  },
}));

useStore.subscribe((s, p) => { if (s.data !== p.data) save(s.data); });

/** Replace everything with the database's copy (not an undo step; clears undo history). */
export function applyRemote(data: AppData) {
  useStore.setState({ data: withPlan(migrate({ ...defaultData(), ...data })), past: [], future: [] });
}
