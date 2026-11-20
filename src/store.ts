// App state with undo/redo (last 30 edits).
// Every edit goes through `commit`, which snapshots the previous data and re-runs the
// auto-scheduler so tasks stay out of clashes. lib/sync.ts saves the data (cloud or local
// database); localStorage keeps a copy so the app opens with your data even offline.
import { create } from 'zustand';
import type { AppData } from './types';
import { defaultData } from './lib/defaults';
import { normalize } from './lib/migrate';
import { planTasks } from './lib/scheduler';
import { readJson, writeStored } from './lib/storage';

const LOCAL_COPY_KEY = 'kairos:data:v1';
const HISTORY = 30;

interface Snapshot {
  data: AppData;
  label: string;
}

interface State {
  data: AppData;
  past: Snapshot[];
  future: Snapshot[];
  /** Mutate a draft copy of the data. Recorded as one undo step named `label`. */
  commit: (label: string, fn: (draft: AppData) => void) => void;
  undo: () => void;
  redo: () => void;
  /** Re-run the scheduler without recording an undo step (e.g. every few minutes). */
  refresh: () => void;
  /** Replace everything (import, restore). Recorded as one undo step. */
  replaceAll: (data: AppData, label: string) => void;
}

function loadLocalCopy(): AppData {
  const saved = readJson<AppData>(LOCAL_COPY_KEY);
  try {
    return saved ? normalize(saved) : defaultData();
  } catch {
    return defaultData(); // not readable as Kairos data
  }
}

// Storage full or blocked: the cloud or database still has it.
const saveLocalCopy = (data: AppData) => writeStored(LOCAL_COPY_KEY, data);

const withPlan = (d: AppData): AppData => ({ ...d, tasks: planTasks(d, new Date()) });
const push = (list: Snapshot[], s: Snapshot) => [...list, s].slice(-HISTORY);

export const useStore = create<State>((set, get) => ({
  data: withPlan(loadLocalCopy()),
  past: [],
  future: [],
  commit: (label, fn) => {
    const prev = get().data;
    const draft = structuredClone(prev);
    fn(draft);
    set({ data: withPlan(draft), past: push(get().past, { data: prev, label }), future: [] });
  },
  undo: () => {
    const { past, data, future } = get();
    const last = past[past.length - 1];
    if (!last) return;
    set({
      data: last.data,
      past: past.slice(0, -1),
      future: [{ data, label: last.label }, ...future].slice(0, HISTORY),
    });
  },
  redo: () => {
    const { past, data, future } = get();
    const next = future[0];
    if (!next) return;
    set({ data: next.data, future: future.slice(1), past: push(past, { data, label: next.label }) });
  },
  refresh: () => set({ data: withPlan(get().data) }),
  replaceAll: (data, label) => {
    const prev = get().data;
    set({ data: withPlan(normalize(data)), past: push(get().past, { data: prev, label }), future: [] });
  },
}));

useStore.subscribe((s, p) => {
  if (s.data !== p.data) saveLocalCopy(s.data);
});

/** Replace everything with the database's copy (not an undo step; clears undo history). */
export function applyRemote(data: AppData) {
  useStore.setState({ data: withPlan(normalize(data)), past: [], future: [] });
}
